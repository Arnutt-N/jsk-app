"""Shared post-mutation choreography for session lifecycle events.

Both transports do the same three things after a claim / close / transfer:
commit, fan the event out over WebSocket, refresh the live KPI tiles. That
sequence was written twice — once in `api/v1/endpoints/admin_live_chat.py`
and once in `services/ws_session/handlers.py` — and the copies drifted,
each getting a fix the other never received:

* WS wrapped the KPI emit in try/except; HTTP did not, so a KPI failure
  became an HTTP 500 *after* the session had been claimed in the database.
* HTTP guarded `session.status` with `hasattr(..., "value")`; WS called
  `.value` outright, so a plain-string status raised AttributeError, hit
  the generic `except Exception`, and told the operator "Failed to claim
  session" — again, after the commit had landed.

Both are one failure mode: **the side effect succeeded and the caller was
told it failed**, which is worse than a silent failure because it invites
a retry of work already done.

The rule this module encodes: once `commit()` returns, the operation *has
happened*. Nothing after that point may turn it back into an error. Fan-out
is best-effort and degrades to a log line.
"""
import logging
from typing import Any, Optional

logger = logging.getLogger(__name__)


def session_status_value(session: Any) -> Optional[str]:
    """Return a session's status as a wire-safe string.

    `ChatSession.status` is a plain `String` column in the model (mirroring
    what production actually has), but callers have historically received
    both a bare `str` and an enum depending on the code path. Normalize
    here rather than making every call site remember the `hasattr` dance.
    """
    status = getattr(session, "status", None)
    if status is None:
        return None
    return status.value if hasattr(status, "value") else status


async def announce_session_event(
    db: Any,
    ws: Any,
    analytics: Any,
    *,
    event_type: str,
    payload: dict,
    timestamp: str,
) -> None:
    """Fan a session event out to operators. Never raises.

    Call this only once the mutation is durable. Both steps are contained
    and independent: a broadcast failure must not skip the KPI refresh, and
    neither may turn a completed operation into a reported failure.

    Split out from `publish_session_event` for the one caller that has to
    `db.refresh()` between committing and announcing.
    """
    try:
        await ws.broadcast_to_all({
            "type": event_type,
            "payload": payload,
            "timestamp": timestamp,
        })
    except Exception as e:
        # Error, not warning: the mutation is safe, but other operators'
        # views are now stale until they refresh — a real, if recoverable,
        # degradation somebody should see in the logs.
        logger.error(
            "Session event broadcast failed after commit (%s): %s", event_type, e
        )

    try:
        await analytics.emit_live_kpis_update(db)
    except Exception as e:
        logger.warning("KPI broadcast failed (non-fatal): %s", e)


async def publish_session_event(
    db: Any,
    ws: Any,
    analytics: Any,
    *,
    event_type: str,
    payload: dict,
    timestamp: str,
) -> None:
    """Commit the pending session mutation, then announce it.

    `ws` and `analytics` are passed in rather than imported so each caller
    keeps its own resolution strategy — the HTTP layer holds module
    singletons, the WS layer resolves late through the package namespace so
    `patch('app.services.ws_session.ws_manager')` keeps working.

    Raises whatever `db.commit()` raises: at that point nothing is durable,
    so reporting failure is the honest answer. Everything afterwards is
    contained.
    """
    await db.commit()
    await announce_session_event(
        db, ws, analytics,
        event_type=event_type,
        payload=payload,
        timestamp=timestamp,
    )
