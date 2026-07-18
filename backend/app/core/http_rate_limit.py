"""HTTP rate limiting as a FastAPI dependency.

Covers plain REST endpoints — primarily the public-facing surfaces: LIFF form
submission, media uploads, and public file serving.

Buckets are backed by Redis (shared across workers) via a fixed-window counter,
so the limit is enforced per client across the whole deployment rather than
per worker. When Redis is unavailable the dependency falls back to an
in-process SlidingWindowLimiter (still limits, but per worker) so it neither
fails open nor rejects everything.
"""
import logging

from fastapi import HTTPException, Request

from app.core.config import settings
from app.core.rate_limiter import SlidingWindowLimiter
from app.core.redis_client import redis_client

logger = logging.getLogger(__name__)

# Every limiter created by http_rate_limit() registers here so buckets can be
# cleared globally — used by the test suite between tests (a TestClient sends
# every request from the same address, so buckets would leak across tests).
_limiters: list[SlidingWindowLimiter] = []


def reset_all_http_limiters() -> None:
    """Clear all HTTP rate-limit buckets (test isolation hook)."""
    for limiter in _limiters:
        limiter.buckets.clear()


def _client_key(request: Request) -> str:
    """Resolve the client identity used as the rate-limit bucket key.

    Proxy headers are client-influenced, so they are only honoured when the
    deployment explicitly declares it sits behind a trusted reverse proxy
    (TRUST_PROXY_HEADERS). Preference order:

    1. CF-Connecting-IP — Cloudflare (which fronts the Koyeb public domain)
       always overwrites this header, so a caller cannot spoof it.
    2. Rightmost X-Forwarded-For entry — appended by the trusted edge.
       Never the leftmost: appending proxies (Cloudflare, Envoy) keep any
       client-supplied entries on the left, so the leftmost value is
       attacker-controlled and could be rotated to dodge the limits.
    3. Direct socket address (also the no-proxy default).
    """
    if settings.TRUST_PROXY_HEADERS:
        cf_ip = request.headers.get("cf-connecting-ip")
        if cf_ip:
            return cf_ip.strip()
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            return forwarded.rsplit(",", 1)[-1].strip()
    return request.client.host if request.client else "unknown"


def http_rate_limit(scope: str, max_events: int, window_seconds: int):
    """Create a route dependency enforcing `max_events` per `window_seconds`.

    Each call creates its own limiter, so scopes never share buckets. Attach
    with `dependencies=[Depends(http_rate_limit(...))]` on the route.
    Rejects with 429 + Retry-After when the window is exhausted.

    The bucket is shared across workers via Redis; if Redis is down the
    per-worker `limiter` below takes over so the endpoint still has a limit.
    """
    limiter = SlidingWindowLimiter(max_events=max_events, window_seconds=window_seconds)
    _limiters.append(limiter)

    def _reject() -> HTTPException:
        return HTTPException(
            status_code=429,
            detail="Too many requests, please try again later",
            headers={"Retry-After": str(window_seconds)},
        )

    async def dependency(request: Request) -> None:
        key = f"ratelimit:{scope}:{_client_key(request)}"

        allowed = await redis_client.fixed_window_allow(
            key, max_events=max_events, window_seconds=window_seconds
        )
        if allowed is None:
            # Redis unavailable — degrade to the in-process limiter.
            allowed = limiter.is_allowed(key)

        if not allowed:
            logger.warning("HTTP rate limit exceeded for %s", key)
            raise _reject()

    # Introspection hooks: let tests find the limiter and verify route wiring.
    dependency.limiter = limiter
    dependency.__rate_limit_scope__ = scope
    return dependency
