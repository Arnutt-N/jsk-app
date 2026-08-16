"""PR C gate observability: count `line_id_plaintext_fallback_hit` events.

PR C (LINE ID Pseudonymization contract phase) is gated on **zero plaintext
fallback hits** for 3-5 consecutive days in production (`dual` storage mode).
Koyeb log access is not always available to operators, so this module exposes
the same signal as an in-process + Redis-shared counter that an admin can read
via `GET /api/v1/health/pseudonym-gate`.

Design:
- In-memory counter + first-hit timestamp (per-worker, resets on process restart).
- Redis-backed shared counter + first-hit timestamp (cross-worker, survives
  worker restarts within the Redis TTL). Best-effort: if Redis is down the
  in-memory counter still reports local hits.
- `get_gate_status()` returns a JSON-serializable snapshot for the endpoint.

PR C contract phase: the plaintext fallback path has been removed from
`resolve_by_line_id`, so nothing increments these counters anymore. The
endpoint is retained as historical evidence for the PR review (counts stay
at their pre-cutover values until the Redis TTL lapses).
"""
import logging
import threading
import time
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from app.core.config import settings
from app.core.redis_client import redis_client

logger = logging.getLogger(__name__)

GATE_REDIS_KEY = "pseudonym_gate:fallback_hits"
GATE_REDIS_FIRST_HIT_KEY = "pseudonym_gate:first_hit_at"
GATE_REDIS_TTL_SECONDS = 60 * 60 * 24 * 30  # 30 days — gate window is 3-5 days

_LOCK = threading.Lock()
_LOCAL_COUNT = 0
_LOCAL_FIRST_HIT_AT: Optional[float] = None
_PROCESS_STARTED_AT = time.time()


def reset_local_counter() -> None:
    """Reset the in-memory counter (tests only)."""
    global _LOCAL_COUNT, _LOCAL_FIRST_HIT_AT
    with _LOCK:
        _LOCAL_COUNT = 0
        _LOCAL_FIRST_HIT_AT = None


async def _get_redis_count() -> Optional[int]:
    """Read the shared counter.

    The key is only ever created on the first hit, so an absent key while
    Redis is connected proves zero hits (return 0, source "redis"). None is
    reserved for "Redis unreachable" so the endpoint can tell the two apart.
    """
    if not redis_client.is_connected:
        return None
    try:
        raw = await redis_client.get(GATE_REDIS_KEY)
        if raw is None:
            return 0
        return int(raw)
    except Exception as e:
        logger.error("pseudonym_gate redis read error: %s", e)
        return None


async def _get_redis_first_hit_at() -> Optional[float]:
    try:
        raw = await redis_client.get(GATE_REDIS_FIRST_HIT_KEY)
        if raw is None:
            return None
        return float(raw)
    except Exception as e:
        logger.error("pseudonym_gate redis first-hit read error: %s", e)
        return None


def _iso(ts: Optional[float]) -> Optional[str]:
    if ts is None:
        return None
    return datetime.fromtimestamp(ts, tz=timezone.utc).isoformat()


def _gate_status(storage_mode: str, hit_count: int) -> str:
    if storage_mode == "pseudonym":
        return "pseudonym_mode_no_fallback"
    if hit_count == 0:
        return "pass"
    return "fail"


async def get_gate_status() -> Dict[str, Any]:
    """Snapshot of the PR C gate — JSON-serializable for the health endpoint."""
    with _LOCK:
        local_count = _LOCAL_COUNT
        local_first_hit_at = _LOCAL_FIRST_HIT_AT
    process_started_at = _PROCESS_STARTED_AT

    redis_count = await _get_redis_count()
    redis_first_hit_at = await _get_redis_first_hit_at()

    if redis_count is not None:
        authoritative_count = redis_count
        authoritative_source = "redis"
    else:
        authoritative_count = local_count
        authoritative_source = "memory_redis_unavailable"

    earliest_first_hit = local_first_hit_at
    if redis_first_hit_at is not None:
        if earliest_first_hit is None or redis_first_hit_at < earliest_first_hit:
            earliest_first_hit = redis_first_hit_at

    storage_mode = settings.LINE_ID_STORAGE_MODE

    return {
        "gate": "pr_c_line_id_pseudonymization",
        "storage_mode": storage_mode,
        "fallback_hit_count": authoritative_count,
        "fallback_hit_source": authoritative_source,
        "first_hit_at": _iso(earliest_first_hit),
        "local_worker": {
            "hit_count": local_count,
            "first_hit_at": _iso(local_first_hit_at),
            "process_started_at": _iso(process_started_at),
        },
        "redis": {
            "hit_count": redis_count,
            "first_hit_at": _iso(redis_first_hit_at),
            "connected": redis_client.is_connected,
        },
        "gate_status": _gate_status(storage_mode, authoritative_count),
        "note": (
            "PR C destructive step (drop line_user_id column) is gated on "
            "fallback_hit_count == 0 for 3-5 consecutive days in dual mode."
        ),
    }