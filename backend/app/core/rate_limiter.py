"""Generic sliding-window rate limiting, used by WebSocket messages (existing)
and the P1.1a auth endpoints (migrate-session, ws-ticket -- see auth.py).

`SlidingWindowLimiter` is the generic primitive; `WebSocketRateLimiter`
preserves its pre-existing public surface (`max_messages`, `window`,
`buckets`, `is_allowed`/`get_remaining`/`reset`/`cleanup_stale`) as thin
aliases over the generic attributes, so existing call sites
(`ws_live_chat.py`, `websocket_manager.py`) and existing tests that poke
`limiter.max_messages`/`limiter.window` directly keep working unchanged.
"""
import time
from typing import Dict, List
import logging

from app.core.config import settings

logger = logging.getLogger(__name__)


class SlidingWindowLimiter:
    """Rate limiter using a sliding window of per-client event timestamps.

    Generic: any caller supplies its own (max_events, window_seconds) and
    client-id key -- e.g. `SlidingWindowLimiter(5, 60)` for "5 per minute per
    user id" (P1.1a auth rate limiting), independent of the WS message limits.
    """

    def __init__(self, max_events: int, window_seconds: int):
        self.buckets: Dict[str, List[float]] = {}
        self.max_events = max_events
        self.window_seconds = window_seconds

    def is_allowed(self, client_id: str) -> bool:
        """Check if `client_id` is allowed one more event right now."""
        now = time.time()

        bucket = self.buckets.get(client_id, [])
        cutoff = now - self.window_seconds
        bucket = [t for t in bucket if t > cutoff]

        if len(bucket) >= self.max_events:
            logger.warning(
                "Rate limit exceeded for %s: %d/%d", client_id, len(bucket), self.max_events
            )
            self.buckets[client_id] = bucket
            return False

        bucket.append(now)
        self.buckets[client_id] = bucket
        return True

    def get_remaining(self, client_id: str) -> int:
        """Get remaining events allowed in the current window."""
        now = time.time()
        cutoff = now - self.window_seconds

        if client_id not in self.buckets:
            return self.max_events

        bucket = [t for t in self.buckets[client_id] if t > cutoff]
        return max(0, self.max_events - len(bucket))

    def reset(self, client_id: str) -> None:
        """Reset the rate limit bucket for a client."""
        self.buckets.pop(client_id, None)

    def cleanup_stale(self, max_age: int = 3600) -> None:
        """Remove buckets that haven't been updated in max_age seconds."""
        now = time.time()
        stale_clients = []

        for client_id, bucket in self.buckets.items():
            if not bucket or (now - max(bucket)) > max_age:
                stale_clients.append(client_id)

        for client_id in stale_clients:
            del self.buckets[client_id]

        if stale_clients:
            logger.info("Cleaned up %d stale rate limit buckets", len(stale_clients))


class WebSocketRateLimiter(SlidingWindowLimiter):
    """Rate limiter for WebSocket messages using sliding window algorithm.

    Tracks message timestamps per client and allows/denies based on
    configured limits (WS_RATE_LIMIT_MESSAGES per WS_RATE_LIMIT_WINDOW seconds).
    """

    def __init__(self):
        super().__init__(
            max_events=settings.WS_RATE_LIMIT_MESSAGES,
            window_seconds=settings.WS_RATE_LIMIT_WINDOW,
        )

    # --- backward-compatible attribute aliases -----------------------------
    # Existing call sites/tests read/write `max_messages`/`window`; keep both
    # names live against the same underlying state as the generic base class.
    @property
    def max_messages(self) -> int:
        return self.max_events

    @max_messages.setter
    def max_messages(self, value: int) -> None:
        self.max_events = value

    @property
    def window(self) -> int:
        return self.window_seconds

    @window.setter
    def window(self, value: int) -> None:
        self.window_seconds = value


# Singleton instance
ws_rate_limiter = WebSocketRateLimiter()
