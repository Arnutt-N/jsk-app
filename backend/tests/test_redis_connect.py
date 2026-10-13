"""A1: RedisClient.connect must treat from_url as a sync factory.

redis.asyncio.from_url() is a sync factory; connect() awaited its result.
That happens to work on redis>=5 (the client defines __await__, verified in
5.0.0 and 7.1.0) — live Redis was NOT down — but awaiting a sync factory's
return value is the wrong contract and breaks on any client that is not
awaitable. connect() must use the factory result directly (then ping),
which is correct on every redis-py version.
"""
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.core.redis_client import RedisClient


def _fake_client() -> MagicMock:
    client = MagicMock()
    client.ping = AsyncMock(return_value=True)
    return client


@pytest.mark.asyncio
async def test_connect_uses_sync_factory_and_pings():
    """from_url's plain (non-awaitable) return value must be used directly."""
    client = RedisClient()
    fake = _fake_client()
    with patch(
        "app.core.redis_client.redis.from_url", return_value=fake
    ) as from_url:
        await client.connect()

    from_url.assert_called_once()
    fake.ping.assert_awaited_once()
    assert client.is_connected is True


@pytest.mark.asyncio
async def test_connect_factory_error_stays_disconnected():
    client = RedisClient()
    with patch(
        "app.core.redis_client.redis.from_url",
        side_effect=Exception("connection refused"),
    ):
        await client.connect()

    assert client.is_connected is False


@pytest.mark.asyncio
async def test_connect_ping_failure_stays_disconnected():
    client = RedisClient()
    fake = _fake_client()
    fake.ping = AsyncMock(side_effect=Exception("ping timeout"))
    with patch("app.core.redis_client.redis.from_url", return_value=fake):
        await client.connect()

    assert client.is_connected is False


@pytest.mark.asyncio
async def test_connect_roundtrip_against_real_redis():
    """End-to-end proof: connect, set/get/delete, disconnect on local redis."""
    client = RedisClient()
    await client.connect()
    assert client.is_connected is True

    key = "pytest:a1-connect-probe"
    try:
        assert await client.set(key, "ok", seconds=60) is True
        assert await client.get(key) == "ok"
    finally:
        await client.delete(key)
        await client.disconnect()
    assert client.is_connected is False
