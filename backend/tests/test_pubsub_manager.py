"""Unit tests for PubSubManager lifecycle edge cases."""
import asyncio
from unittest.mock import AsyncMock

import pytest

from app.core.pubsub_manager import PubSubManager


class _FakeClosable:
    def __init__(self) -> None:
        self.close = AsyncMock()


@pytest.mark.asyncio
async def test_disconnect_does_not_await_current_listener_task():
    manager = PubSubManager()
    fake_pubsub = _FakeClosable()
    fake_redis = _FakeClosable()

    manager._pubsub = fake_pubsub
    manager._redis = fake_redis
    manager._listener_task = asyncio.current_task()

    await manager.disconnect()

    fake_pubsub.close.assert_awaited_once()
    fake_redis.close.assert_awaited_once()
    assert manager._listener_task is None
    assert manager._pubsub is None
    assert manager._redis is None
