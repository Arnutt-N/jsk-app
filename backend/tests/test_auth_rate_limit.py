"""The /migrate-session and /ws-ticket rate limiter is Redis-backed so the
limit holds across workers (prod runs 2), with an in-process fallback when
Redis is down.
"""
import pytest

from app.api.v1.endpoints import auth as auth_module
from app.api.v1.endpoints.auth import (
    AUTH_RATE_LIMIT,
    _auth_rate_limit_exceeded,
    auth_rate_limiter,
)
from app.core.redis_client import redis_client


class _FakeRedis:
    """Minimal fake for the fixed-window primitive: SET NX EX + INCR."""

    def __init__(self):
        self.kv: dict[str, int] = {}

    async def set(self, key, value, ex=None, nx=False):
        if nx and key in self.kv:
            return None
        self.kv[key] = int(value)
        return True

    async def incr(self, key):
        self.kv[key] = self.kv.get(key, 0) + 1
        return self.kv[key]


@pytest.mark.asyncio
async def test_redis_bucket_blocks_after_limit(monkeypatch):
    monkeypatch.setattr(redis_client, "_redis", _FakeRedis())

    key = "migrate:42"
    results = [await _auth_rate_limit_exceeded(key) for _ in range(AUTH_RATE_LIMIT + 1)]

    # First AUTH_RATE_LIMIT allowed (exceeded=False), the next blocked (True).
    assert results[:AUTH_RATE_LIMIT] == [False] * AUTH_RATE_LIMIT
    assert results[-1] is True


@pytest.mark.asyncio
async def test_shared_bucket_across_callers(monkeypatch):
    """Two 'workers' hitting the same user key share one Redis bucket."""
    monkeypatch.setattr(redis_client, "_redis", _FakeRedis())

    key = "ws-ticket:7"
    for _ in range(AUTH_RATE_LIMIT):
        assert await _auth_rate_limit_exceeded(key) is False
    # A different caller (worker) sees the same exhausted bucket.
    assert await _auth_rate_limit_exceeded(key) is True


@pytest.mark.asyncio
async def test_falls_back_to_in_process_when_redis_down(monkeypatch):
    monkeypatch.setattr(redis_client, "_redis", None)
    auth_rate_limiter.reset("migrate:99")

    results = [
        await _auth_rate_limit_exceeded("migrate:99")
        for _ in range(AUTH_RATE_LIMIT + 1)
    ]
    assert results[:AUTH_RATE_LIMIT] == [False] * AUTH_RATE_LIMIT
    assert results[-1] is True
    auth_rate_limiter.reset("migrate:99")


@pytest.mark.asyncio
async def test_distinct_keys_isolated(monkeypatch):
    monkeypatch.setattr(redis_client, "_redis", _FakeRedis())

    for _ in range(AUTH_RATE_LIMIT):
        await _auth_rate_limit_exceeded("migrate:1")
    # A different route/user key still has a fresh bucket.
    assert await _auth_rate_limit_exceeded("ws-ticket:1") is False
    assert await _auth_rate_limit_exceeded("migrate:2") is False
