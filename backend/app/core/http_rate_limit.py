"""HTTP rate limiting as a FastAPI dependency, built on SlidingWindowLimiter.

Complements the existing WebSocket/auth limiters (see rate_limiter.py) by
covering plain REST endpoints — primarily the public-facing surfaces: LIFF
form submission, media uploads, and public file serving.

Like the other limiters this is in-process (per worker), not distributed;
acceptable for the current single-worker deployment. If the backend moves
to multiple workers, back the buckets with Redis.
"""
import logging

from fastapi import HTTPException, Request

from app.core.config import settings
from app.core.rate_limiter import SlidingWindowLimiter

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

    X-Forwarded-For is client-controlled, so it is only honoured when the
    deployment explicitly declares it sits behind a trusted reverse proxy
    (TRUST_PROXY_HEADERS) — otherwise a caller could rotate the header to
    dodge the limit. Without a proxy, the direct socket address is correct.
    """
    if settings.TRUST_PROXY_HEADERS:
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def http_rate_limit(scope: str, max_events: int, window_seconds: int):
    """Create a route dependency enforcing `max_events` per `window_seconds`.

    Each call creates its own limiter, so scopes never share buckets. Attach
    with `dependencies=[Depends(http_rate_limit(...))]` on the route.
    Rejects with 429 + Retry-After when the window is exhausted.
    """
    limiter = SlidingWindowLimiter(max_events=max_events, window_seconds=window_seconds)
    _limiters.append(limiter)

    async def dependency(request: Request) -> None:
        key = f"{scope}:{_client_key(request)}"
        if not limiter.is_allowed(key):
            logger.warning("HTTP rate limit exceeded for %s", key)
            raise HTTPException(
                status_code=429,
                detail="Too many requests, please try again later",
                headers={"Retry-After": str(window_seconds)},
            )

    # Introspection hooks: let tests find the limiter and verify route wiring.
    dependency.limiter = limiter
    dependency.__rate_limit_scope__ = scope
    return dependency
