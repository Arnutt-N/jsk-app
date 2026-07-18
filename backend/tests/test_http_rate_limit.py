"""Tests for the HTTP rate-limit dependency (app/core/http_rate_limit.py).

Covers the dependency factory itself (429 + Retry-After, per-client key
isolation, proxy-header trust switch) and verifies the public-facing
endpoints (LIFF submission, media uploads, public files) are wired to it.
"""
from types import SimpleNamespace

import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

from app.core import http_rate_limit as hrl
from app.core.http_rate_limit import http_rate_limit
from app.core.redis_client import redis_client


@pytest.fixture(autouse=True)
def _force_in_process(monkeypatch):
    """Pin the dependency-factory tests to the in-process fallback path.

    `_build_app` uses a bare FastAPI app whose lifespan never connects Redis,
    but a session-scoped TestClient from another test file may already have
    bound `redis_client._redis` to a real connection on a different event loop.
    Nulling it here keeps these tests deterministic (and off that connection).
    The Redis path is covered explicitly by the FakeRedis tests below.
    """
    monkeypatch.setattr(redis_client, "_redis", None)


class _FakeRedis:
    """Minimal fake supporting the fixed-window primitive: SET NX EX + INCR."""

    def __init__(self):
        self.kv: dict[str, int] = {}
        self.expiry: dict[str, int] = {}

    async def set(self, key, value, ex=None, nx=False):
        if nx and key in self.kv:
            return None
        self.kv[key] = int(value)
        if ex is not None:
            self.expiry[key] = ex
        return True

    async def incr(self, key):
        self.kv[key] = self.kv.get(key, 0) + 1
        return self.kv[key]


def _build_app(dependency) -> TestClient:
    app = FastAPI()

    @app.get("/limited", dependencies=[Depends(dependency)])
    async def limited():
        return {"ok": True}

    return TestClient(app)


def test_allows_requests_under_limit():
    dep = http_rate_limit("test-under", max_events=3, window_seconds=60)
    client = _build_app(dep)

    for _ in range(3):
        assert client.get("/limited").status_code == 200


def test_rejects_with_429_and_retry_after_when_over_limit():
    dep = http_rate_limit("test-over", max_events=2, window_seconds=60)
    client = _build_app(dep)

    assert client.get("/limited").status_code == 200
    assert client.get("/limited").status_code == 200

    resp = client.get("/limited")
    assert resp.status_code == 429
    assert resp.headers["Retry-After"] == "60"


def test_clients_have_isolated_buckets():
    dep = http_rate_limit("test-isolated", max_events=1, window_seconds=60)

    request_a = SimpleNamespace(headers={}, client=SimpleNamespace(host="10.0.0.1"))
    request_b = SimpleNamespace(headers={}, client=SimpleNamespace(host="10.0.0.2"))

    assert hrl._client_key(request_a) != hrl._client_key(request_b)

    limiter = dep.limiter
    assert limiter.is_allowed(f"test-isolated:{hrl._client_key(request_a)}")
    assert limiter.is_allowed(f"test-isolated:{hrl._client_key(request_b)}")
    assert not limiter.is_allowed(f"test-isolated:{hrl._client_key(request_a)}")


def test_proxy_headers_ignored_by_default(monkeypatch):
    from app.core.config import settings

    monkeypatch.setattr(settings, "TRUST_PROXY_HEADERS", False)
    request = SimpleNamespace(
        headers={
            "cf-connecting-ip": "1.2.3.4",
            "x-forwarded-for": "1.2.3.4, 5.6.7.8",
        },
        client=SimpleNamespace(host="10.0.0.9"),
    )
    assert hrl._client_key(request) == "10.0.0.9"


def test_cf_connecting_ip_preferred_when_proxy_trusted(monkeypatch):
    from app.core.config import settings

    monkeypatch.setattr(settings, "TRUST_PROXY_HEADERS", True)
    request = SimpleNamespace(
        headers={
            "cf-connecting-ip": "203.0.113.7",
            "x-forwarded-for": "1.2.3.4, 5.6.7.8",
        },
        client=SimpleNamespace(host="10.0.0.9"),
    )
    assert hrl._client_key(request) == "203.0.113.7"


def test_forwarded_for_rightmost_used_when_proxy_trusted(monkeypatch):
    from app.core.config import settings

    monkeypatch.setattr(settings, "TRUST_PROXY_HEADERS", True)
    request = SimpleNamespace(
        headers={"x-forwarded-for": "1.2.3.4, 5.6.7.8"},
        client=SimpleNamespace(host="10.0.0.9"),
    )
    assert hrl._client_key(request) == "5.6.7.8"


def test_spoofed_leftmost_forwarded_entries_do_not_change_key(monkeypatch):
    # An appending proxy keeps client-supplied entries on the left; rotating
    # them must not rotate the bucket key.
    from app.core.config import settings

    monkeypatch.setattr(settings, "TRUST_PROXY_HEADERS", True)
    real_ip = "198.51.100.20"
    keys = set()
    for spoofed in ("6.6.6.1", "6.6.6.2", "6.6.6.3"):
        request = SimpleNamespace(
            headers={"x-forwarded-for": f"{spoofed}, {real_ip}"},
            client=SimpleNamespace(host="10.0.0.9"),
        )
        keys.add(hrl._client_key(request))
    assert keys == {real_ip}


def test_missing_client_falls_back_to_unknown():
    request = SimpleNamespace(headers={}, client=None)
    assert hrl._client_key(request) == "unknown"


# ---------------------------------------------------------------------------
# Wiring: public-facing routes must carry a rate-limit dependency
# ---------------------------------------------------------------------------

def _route_has_rate_limit(router, path: str, method: str) -> bool:
    for route in router.routes:
        if route.path == path and method in getattr(route, "methods", set()):
            for dep in route.dependant.dependencies:
                if getattr(dep.call, "__rate_limit_scope__", None):
                    return True
    return False


def test_liff_service_request_route_is_rate_limited():
    from app.api.v1.endpoints.liff import router

    assert _route_has_rate_limit(router, "/service-requests", "POST")


@pytest.mark.parametrize(
    "path,method",
    [
        ("/admin/media", "POST"),
        ("/admin/media/upload", "POST"),
        ("/media", "POST"),
        ("/public/files/{public_token}", "GET"),
        ("/media/{media_id}", "GET"),
    ],
)
def test_media_routes_are_rate_limited(path, method):
    from app.api.v1.endpoints.media import router

    assert _route_has_rate_limit(router, path, method)


# ---------------------------------------------------------------------------
# Redis-backed path: buckets are shared across workers via a fixed window
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_fixed_window_allow_shares_bucket_across_callers(monkeypatch):
    """The whole point of item 3: two workers hitting the same key count into
    one bucket, so the Nth event is rejected regardless of which worker sees it."""
    fake = _FakeRedis()
    monkeypatch.setattr(redis_client, "_redis", fake)

    key = "ratelimit:shared:1.2.3.4"
    results = [
        await redis_client.fixed_window_allow(key, max_events=3, window_seconds=60)
        for _ in range(4)
    ]
    assert results == [True, True, True, False]


@pytest.mark.asyncio
async def test_fixed_window_allow_sets_ttl_only_once(monkeypatch):
    """SET NX must anchor the TTL at the first request, not re-extend it every
    call (which would make the window slide forward forever under load)."""
    fake = _FakeRedis()
    monkeypatch.setattr(redis_client, "_redis", fake)

    key = "ratelimit:ttl:9.9.9.9"
    await redis_client.fixed_window_allow(key, max_events=5, window_seconds=42)
    fake.expiry[key] = 7  # simulate time passing (TTL counting down)
    await redis_client.fixed_window_allow(key, max_events=5, window_seconds=42)

    assert fake.expiry[key] == 7  # not reset back to 42


@pytest.mark.asyncio
async def test_fixed_window_allow_returns_none_when_redis_down(monkeypatch):
    monkeypatch.setattr(redis_client, "_redis", None)
    assert (
        await redis_client.fixed_window_allow("k", max_events=1, window_seconds=1)
        is None
    )


def test_dependency_uses_redis_when_available(monkeypatch):
    """End-to-end through the dependency: with Redis up, the limit is enforced
    from the shared counter (not the per-worker in-process limiter)."""
    fake = _FakeRedis()
    monkeypatch.setattr(redis_client, "_redis", fake)

    dep = http_rate_limit("test-redis-path", max_events=2, window_seconds=60)
    client = _build_app(dep)

    assert client.get("/limited").status_code == 200
    assert client.get("/limited").status_code == 200
    assert client.get("/limited").status_code == 429
    # The in-process limiter was never consulted (Redis answered every call).
    assert dep.limiter.buckets == {}


def test_dependency_falls_back_to_in_process_when_redis_down(monkeypatch):
    monkeypatch.setattr(redis_client, "_redis", None)

    dep = http_rate_limit("test-fallback", max_events=1, window_seconds=60)
    client = _build_app(dep)

    assert client.get("/limited").status_code == 200
    assert client.get("/limited").status_code == 429
    # Fallback path actually recorded the events in-process.
    assert dep.limiter.buckets
