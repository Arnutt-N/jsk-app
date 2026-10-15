"""Deferred-announce outbox for the webhook path (R3-M3).

Mutate → commit → announce: handlers append async send closures while
processing; the webhook drains them after the per-event commit. A crash
between mutate and commit therefore announces nothing (no ghosts).
Leaf module — imports nothing from app (no cycle risk).
"""
import logging
from typing import Awaitable, Callable

logger = logging.getLogger(__name__)

Outbox = list[Callable[[], Awaitable[None]]]


def new_outbox() -> Outbox:
    return []


async def drain_outbox(box: Outbox) -> int:
    """Send every deferred announcement; one failure never blocks the rest."""
    failures = 0
    for send in box:
        try:
            await send()
        except Exception as exc:
            failures += 1
            logger.error("Outbox announce failed: %s", exc)
    return failures
