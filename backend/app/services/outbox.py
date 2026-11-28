"""Deferred-announce outbox for the webhook path (R3-M3).

Mutate → commit → announce: handlers append async send closures while
processing; the webhook drains them after the per-event commit. A crash
between mutate and commit therefore announces nothing (no ghosts).
Leaf module — imports nothing from app (no cycle risk).
"""
import logging
from enum import Enum
from typing import Awaitable, Callable, NamedTuple

from app.services.delivery_outcome import DeliveryOutcome

logger = logging.getLogger(__name__)

class OutboxKind(str, Enum):
    REPLY = "reply"
    OTHER = "other"


class OutboxItem(NamedTuple):
    kind: OutboxKind
    send: Callable[[], Awaitable[None]]

    async def __call__(self) -> None:
        await self.send()


def reply(send: Callable[[], Awaitable[None]]) -> OutboxItem:
    return OutboxItem(OutboxKind.REPLY, send)


def other(send: Callable[[], Awaitable[None]]) -> OutboxItem:
    return OutboxItem(OutboxKind.OTHER, send)


Outbox = list[OutboxItem | Callable[[], Awaitable[None]]]

def new_outbox() -> Outbox:
    return []


def _classify(exc: Exception) -> DeliveryOutcome:
    if "circuit is open" in str(exc).lower():
        return DeliveryOutcome.NOT_SENT
    if getattr(exc, "status", None) == 409:
        headers = getattr(exc, "headers", None) or {}
        if any(str(k).lower() == "x-line-accepted-request-id" and bool(v) for k, v in dict(headers).items()):
            return DeliveryOutcome.SENT
    status = getattr(exc, "status", None)
    if isinstance(status, int) and 400 <= status < 500:
        return DeliveryOutcome.NOT_SENT
    return DeliveryOutcome.UNKNOWN


async def drain_outbox_outcomes(box: Outbox) -> dict[OutboxKind, DeliveryOutcome]:
    """Send every deferred announcement and fold results per kind.

    Only kinds that actually had an item appear in the result. A kind with no
    queued action is absent, never `SENT` — reporting `SENT` for an empty reply
    queue would claim a LINE reply nobody attempted (F15).
    """
    outcomes: dict[OutboxKind, list[DeliveryOutcome]] = {}
    for item in box:
        kind, send = item if isinstance(item, OutboxItem) else (OutboxKind.OTHER, item)
        try:
            await send()
            outcomes.setdefault(kind, []).append(DeliveryOutcome.SENT)
        except Exception as exc:
            logger.error("Outbox announce failed: %s", exc)
            outcomes.setdefault(kind, []).append(_classify(exc))
    return {kind: _fold(results) for kind, results in outcomes.items()}


def _fold(results: list[DeliveryOutcome]) -> DeliveryOutcome:
    values = set(results)
    if DeliveryOutcome.SENT in values:
        return DeliveryOutcome.SENT
    if DeliveryOutcome.UNKNOWN in values:
        return DeliveryOutcome.UNKNOWN
    return DeliveryOutcome.NOT_SENT


async def drain_outbox(box: Outbox) -> int:
    """Backward-compatible failure count for non-webhook callers."""
    failures = 0
    for item in box:
        send = item.send if isinstance(item, OutboxItem) else item
        try:
            await send()
        except Exception as exc:
            failures += 1
            logger.error("Outbox announce failed: %s", exc)
    return failures
