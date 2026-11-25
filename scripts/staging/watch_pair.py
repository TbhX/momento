"""Monitor one already-provisioned call on the isolated media host."""
import asyncio


async def watch_pair(encounter, read_state, close_room, interval=0.5):
    """Only a fresh matching ready state keeps the existing call alive."""
    while True:
        try:
            notice = await asyncio.wait_for(read_state(), 3)
            ready = (notice.get("encounterId") == encounter
                     and notice.get("state") == "ready"
                     and notice.get("bothReady") is True)
        except (TimeoutError, ValueError, EOFError, OSError, AttributeError):
            ready = False
        if not ready:
            # Bind deletion to the watched encounter, never to a returned target.
            await close_room(encounter)
            return
        await asyncio.sleep(interval)
