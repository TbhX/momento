"""Local LiveKit integration check; see scripts/staging/README.md."""
import asyncio
import os
import secrets
import subprocess
import sys
import tempfile
from pathlib import Path

from livekit import api, rtc
from livekit.rtc.participant import PublishTrackError

URL = "http://127.0.0.1:17880"
ROOM = "local-pair"
MIC = api.TrackSource.MICROPHONE
CAM = api.TrackSource.CAMERA


async def until(predicate):
    async with asyncio.timeout(12):
        while not predicate():
            await asyncio.sleep(0.05)


async def check(key, secret, server_log):
    def token(identity, publish):
        return (api.AccessToken(key, secret).with_identity(identity)
                .with_grants(api.VideoGrants(room_join=True, room=ROOM, can_subscribe=True,
                                             can_publish=publish, can_publish_data=False,
                                             can_publish_sources=["microphone"] if publish else []))
                .to_jwt())

    sender, peer = rtc.Room(), rtc.Room()
    async with api.LiveKitAPI(URL, key, secret) as admin:
        async def sources(values):
            await admin.room.update_participant(api.UpdateParticipantRequest(
                room=ROOM, identity="sender", permission=api.ParticipantPermission(
                    can_subscribe=True, can_publish=True, can_publish_sources=values)))

            expected = {rtc.TrackSource.SOURCE_MICROPHONE}
            if CAM in values:
                expected.add(rtc.TrackSource.SOURCE_CAMERA)
            await until(lambda: set(sender.local_participant.permissions.can_publish_sources) == expected)

        async def connect(room, identity, publish):
            await room.connect(URL.replace("http:", "ws:"), token(identity, publish))

        async def publish(track, source):
            return await sender.local_participant.publish_track(
                track, rtc.TrackPublishOptions(source=source))

        audio = rtc.AudioSource(48000, 1)
        video = rtc.VideoSource(16, 16)
        mic = rtc.LocalAudioTrack.create_audio_track("synthetic-mic", audio)

        def camera():
            return rtc.LocalVideoTrack.create_video_track("synthetic-camera", video)

        def remote_tracks():
            member = peer.remote_participants.get("sender")
            return member.track_publications if member else {}

        async def denied():
            start = server_log.stat().st_size
            try:
                await publish(camera(), rtc.TrackSource.SOURCE_CAMERA)
            except PublishTrackError as exc:
                # Some SDK versions time out even though the SFU explicitly refused.
                with server_log.open("rb") as log:
                    log.seek(start)
                    refused = any(b"no permission to publish track" in line for line in log)
                if not refused:
                    raise
            else:
                raise RuntimeError("Camera publication unexpectedly accepted")
            if any(t.source == rtc.TrackSource.SOURCE_CAMERA for t in remote_tracks().values()):
                raise RuntimeError("Denied camera visible to peer")

        try:
            await connect(peer, "peer", False)
            await connect(sender, "sender", True)
            a = await publish(mic, rtc.TrackSource.SOURCE_MICROPHONE)
            await until(lambda: a.sid in remote_tracks() and remote_tracks()[a.sid].subscribed)
            await denied()
            await sources([MIC, CAM])
            v = await publish(camera(), rtc.TrackSource.SOURCE_CAMERA)
            await until(lambda: v.sid in remote_tracks() and remote_tracks()[v.sid].subscribed)
            await sources([MIC])
            await until(lambda: v.sid not in remote_tracks())
            await denied()
            if a.sid not in remote_tracks() or not remote_tracks()[a.sid].subscribed:
                raise RuntimeError("Microphone subscription lost after downgrade")
            print("OK: microphone subscribed; camera denied, subscribed after grant, removed and denied again")
        finally:
            await asyncio.gather(sender.disconnect(), peer.disconnect())


async def main(binary):
    key, secret = secrets.token_hex(12), secrets.token_hex(32)
    with tempfile.TemporaryDirectory() as directory:
        config = Path(directory, "local.yaml")
        config.write_text(f"""port: 17880
bind_addresses: ["127.0.0.1"]
rtc:
  node_ip: 127.0.0.1
  interfaces:
    includes: ["lo"]
  enable_loopback_candidate: true
  use_external_ip: false
  tcp_port: 17881
  udp_port: 17882
keys:
  {key}: {secret}
""")
        server_log = Path(directory, "server.log")
        with server_log.open("wb") as output, subprocess.Popen([binary, "--config", str(config)], env={"PATH": os.defpath},
                              stdout=output, stderr=subprocess.STDOUT) as process:
            try:
                for _ in range(100):
                    if process.poll() is not None:
                        raise RuntimeError("Local LiveKit did not start")
                    try:
                        _, writer = await asyncio.open_connection("127.0.0.1", 17880)
                    except ConnectionRefusedError:
                        await asyncio.sleep(0.05)
                    else:
                        writer.close()
                        await writer.wait_closed()
                        break
                else:
                    raise RuntimeError("Local LiveKit readiness timed out")
                await asyncio.wait_for(check(key, secret, server_log), 100)
            finally:
                process.terminate()
                try:
                    process.wait(timeout=3)
                except subprocess.TimeoutExpired:
                    process.kill()


if __name__ == "__main__":
    asyncio.run(main(sys.argv[1]))
