import unittest
from unittest.mock import AsyncMock

from watch_pair import watch_pair


class WatchPairTests(unittest.IsolatedAsyncioTestCase):
    async def test_untrusted_target_or_unreadable_state_closes_only_original_room(self):
        for failure in ({"encounterId": "other", "state": "ready", "bothReady": True},
                        TimeoutError(), EOFError(), ValueError()):
            with self.subTest(failure=failure):
                read = AsyncMock(side_effect=[
                    {"encounterId": "pair", "state": "ready", "bothReady": True}, failure])
                close = AsyncMock()
                await watch_pair("pair", read, close, interval=0)
                self.assertEqual(read.await_count, 2)
                close.assert_awaited_once_with("pair")
