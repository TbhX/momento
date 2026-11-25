"""Local LiveKit integration check; see scripts/staging/README.md."""
from array import array
import asyncio
import math
import json
import os
import secrets
import subprocess
import sys
import tempfile
from pathlib import Path

from livekit import api, rtc
from livekit.rtc.room import ConnectError
from livekit.rtc.participant import PublishTrackError

URL = "http://127.0.0.1:17880"
# Synthetic encounter identifiers, distinct even for calls in the same salon.
from uuid import UUID

def pair_room(encounter_id):
    return "pair-" + UUID(encounter_id).hex

ENCOUNTER = "00000000-0000-4000-8000-000000000020"
ROOM = pair_room(ENCOUNTER)
MIC = api.TrackSource.MICROPHONE
CAM = api.TrackSource.CAMERA


async def until(predicate):
    async with asyncio.timeout(12):
        while not predicate():
            await asyncio.sleep(0.05)


async def check(key, secret, server_log):
    def token(identity, publish, room_name=ROOM):
        return (api.AccessToken(key, secret).with_identity(identity)
                .with_grants(api.VideoGrants(room_join=True, room=room_name, can_subscribe=True,
                                             can_publish=publish, can_publish_data=False,
                                             can_publish_sources=["microphone"] if publish else []))
                .to_jwt())

    # The join credential never includes camera. Promote only the live connection.
    original_join = token("sender", True)
    peer_join = token("peer", False)
    sender, peer = rtc.Room(), rtc.Room()
    witness, listener = rtc.Room(), rtc.Room()
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

        async def receive_tone(remote_track, hz, source=audio):
            # A track may remain subscribed even when no audio reaches the peer.
            rate, count = 48000, 960  # one 20 ms frame, whole cycles at test tones
            phase = [2 * math.pi * hz * i / rate for i in range(count)]
            sine, cosine = list(map(math.sin, phase)), list(map(math.cos, phase))
            samples = array("h", (round(10000 * x) for x in sine))
            frame = rtc.AudioFrame(samples.tobytes(), rate, 1, count)
            stream = rtc.AudioStream(remote_track, sample_rate=rate, num_channels=1,
                                     frame_size_ms=20)

            async def send():
                while True:
                    await source.capture_frame(frame)
                    await asyncio.sleep(0.02)

            pump = asyncio.create_task(send())
            hits = 0
            try:
                async with asyncio.timeout(10):
                    async for event in stream:
                        pcm = event.frame.data
                        if len(pcm) != count:
                            hits = 0
                            continue
                        power = sum(x*x for x in pcm)
                        re = sum(x*y for x, y in zip(pcm, cosine))
                        im = sum(x*y for x, y in zip(pcm, sine))
                        # Above silence and over half the energy at the expected tone.
                        matches = power > count * 100**2 and 4*(re*re + im*im) > count*power
                        hits = hits + 1 if matches else 0
                        if hits >= 3:
                            return
                raise RuntimeError("Remote audio ended before the expected tone")
            finally:
                pump.cancel()
                await asyncio.gather(pump, return_exceptions=True)
                await stream.aclose()

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
            await admin.room.create_room(api.CreateRoomRequest(name=ROOM, max_participants=2))
            await connect(peer, peer_join)
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
            await receive_tone(remote_tracks()[a.sid].track, 600)
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
            await receive_tone(remote_tracks()[b.sid].track, 900)
            other_room = pair_room("00000000-0000-4000-8000-000000000021")
            await admin.room.create_room(api.CreateRoomRequest(name=other_room, max_participants=2))
            await connect(listener, token("listener", False, other_room))
            await connect(witness, token("witness", True, other_room))
            other_audio = rtc.AudioSource(48000, 1)
            other_mic = rtc.LocalAudioTrack.create_audio_track("other-mic", other_audio)
            publication = await witness.local_participant.publish_track(
                other_mic, rtc.TrackPublishOptions(source=rtc.TrackSource.SOURCE_MICROPHONE))
            def witness_track():
                member = listener.remote_participants.get("witness")
                track = member.track_publications.get(publication.sid) if member else None
                return track.track if track and track.subscribed else None

            await until(witness_track)
            await receive_tone(witness_track(), 700, other_audio)
            # One private provider room per encounter in this isolated scenario.
            # Consume the other member's native SQL state after withdrawal.
            scenario = os.environ.get("MOMENTO_TEST_CLOSURE", "leave")
            expected_state = {"leave": "ended", "expiry": "ended", "block": "unavailable"}[scenario]
            reader = await asyncio.create_subprocess_exec(
                "node", "scripts/staging/pair-departure.mjs", scenario, stdout=asyncio.subprocess.PIPE)
            output, _ = await reader.communicate()
            notice = json.loads(output)
            if reader.returncode or notice != {"encounterId": ENCOUNTER, "state": expected_state, "mediaEnabled": False}:
                raise RuntimeError("Native pair withdrawal not confirmed")
            stopped = [asyncio.Event(), asyncio.Event()]
            for room, event in zip((sender, peer), stopped):
                room.on("disconnected", lambda *args, signal=event: signal.set())
            await admin.room.delete_room(api.DeleteRoomRequest(room=pair_room(notice["encounterId"])))
            await asyncio.wait_for(asyncio.gather(*(event.wait() for event in stopped)), 10)
            await receive_tone(witness_track(), 1100, other_audio)
            print("OK: concurrent pair decoded fresh audio on the same track after closure")
            # A fresh client must not recreate a closed room with either original
            # credential. Keep the service reachable in a distinct next round.
            next_room = ROOM + "-next"
            await admin.room.create_room(api.CreateRoomRequest(name=next_room, max_participants=2))
            async def reject_old(credential):
                client = rtc.Room()
                try:
                    try:
                        await asyncio.wait_for(connect(client, credential), 12)
                    except ConnectError:
                        return
                    raise RuntimeError("Closed encounter admitted an old join credential")
                finally:
                    await client.disconnect()

            await asyncio.gather(reject_old(original_join), reject_old(peer_join))
            rooms = await admin.room.list_rooms(api.ListRoomsRequest())
            if ROOM in {room.name for room in rooms.rooms}:
                raise RuntimeError("Old encounter room was recreated")
            control = rtc.Room()
            try:
                await connect(control, token("sender", True, next_room))
            finally:
                await control.disconnect()
            print("OK: neither original credential reopens the closed room; next round reachable")
            print(f"OK: {scenario} closed the isolated room for both connected peers")
            print("OK: distinct microphone tones decoded after camera removal and reconnect")
            print("OK: original microphone-only join credential reconnects without camera")
            print("OK: microphone subscribed; camera denied, subscribed after grant, removed and denied again")
        finally:
            await asyncio.gather(sender.disconnect(), peer.disconnect(), witness.disconnect(), listener.disconnect())


async def main(binary):
    key, secret = secrets.token_hex(12), secrets.token_hex(32)
    with tempfile.TemporaryDirectory() as directory:
        config = Path(directory, "local.yaml")
        config.write_text(f"""port: 17880
bind_addresses: ["127.0.0.1"]
room:
  auto_create: false
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
