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

    # The join credential never includes camera. Promote only the live connection.
    original_join = token("sender", True)
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

        async def connect(room, credential):
            await room.connect(URL.replace("http:", "ws:"), credential)

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

        async def receive_picture(remote_track):
            # A subscription alone can exist even when no frame traverses the SFU.
            stream = rtc.VideoStream(remote_track, format=rtc.VideoBufferType.RGBA)
            frame = rtc.VideoFrame(16, 16, rtc.VideoBufferType.RGBA,
                                   bytes([210, 40, 30, 255]) * (16 * 16))

            async def send():
                while True:
                    video.capture_frame(frame)
                    await asyncio.sleep(0.05)

            pump = asyncio.create_task(send())
            try:
                async with asyncio.timeout(10):
                    async for event in stream:
                        picture = event.frame
                        if picture.width == 16 and picture.height == 16:
                            red, green, blue = bytes(picture.data[:3])
                            if red > max(green, blue) + 60:
                                return
                raise RuntimeError("Remote video ended without the synthetic red frame")
            finally:
                pump.cancel()
                await asyncio.gather(pump, return_exceptions=True)
                await stream.aclose()

        async def denied():
            start = server_log.stat().st_size
            try:
                await publish(camera(), rtc.TrackSource.SOURCE_CAMERA)
            except PublishTrackError:
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
            await connect(peer, token("peer", False))
            await connect(sender, original_join)
            a = await publish(mic, rtc.TrackSource.SOURCE_MICROPHONE)
            await until(lambda: a.sid in remote_tracks() and remote_tracks()[a.sid].subscribed)
            await denied()
            await sources([MIC, CAM])
            v = await publish(camera(), rtc.TrackSource.SOURCE_CAMERA)
            await until(lambda: v.sid in remote_tracks() and remote_tracks()[v.sid].subscribed)
            await receive_picture(remote_tracks()[v.sid].track)
            print("OK: synthetic red frame decoded by the peer")
            clock = asyncio.get_running_loop().time
            started = clock()
            await sources([MIC])
            await until(lambda: v.sid not in remote_tracks())
            print(f"Camera removal observed by peer within {(clock() - started) * 1000:.0f} ms")
            await denied()
            if a.sid not in remote_tracks() or not remote_tracks()[a.sid].subscribed:
                raise RuntimeError("Microphone subscription lost after downgrade")
            await sender.disconnect()
            await until(lambda: "sender" not in peer.remote_participants)
            sender = rtc.Room()
            await connect(sender, original_join)
            if set(sender.local_participant.permissions.can_publish_sources) != {rtc.TrackSource.SOURCE_MICROPHONE}:
                raise RuntimeError("Unexpected sources on fresh connection")
            new_mic = rtc.LocalAudioTrack.create_audio_track("reconnected-mic", audio)
            b = await publish(new_mic, rtc.TrackSource.SOURCE_MICROPHONE)
            await until(lambda: b.sid in remote_tracks() and remote_tracks()[b.sid].subscribed)
            await denied()
            print("OK: original microphone-only join credential reconnects without camera")
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
