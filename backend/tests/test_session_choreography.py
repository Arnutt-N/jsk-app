"""Tests for the shared post-commit choreography of session lifecycle events.

HIGH-3 from the 2026-08-02 architecture review: `commit -> broadcast ->
emit KPI` was written twice (HTTP endpoint + WS handler) and the copies
drifted. Each was repaired once, in a different place:

  * WS wrapped `emit_live_kpis_update` in try/except; HTTP did not, so a
    KPI failure surfaced as HTTP 500 *after* `db.commit()` had succeeded.
  * HTTP guarded `session.status` with `hasattr(...)`; WS called
    `.value` directly, so a plain-string status raised AttributeError,
    fell into the generic handler, and told the operator "Failed to claim
    session" — again after the commit.

Both are the same failure mode: **the side effect succeeded but the caller
was told it failed**, which invites a retry of something already done.

The fix is one helper both transports call, so there is only one place
left to drift.
"""
import enum
import logging

import pytest

from app.services.live_chat_service.choreography import (
    announce_session_event,
    publish_session_event,
    session_status_value,
)


class _Status(str, enum.Enum):
    ACTIVE = "ACTIVE"


class _FakeSession:
    def __init__(self, status):
        self.id = 7
        self.status = status


class _FakeDB:
    def __init__(self, fail: bool = False):
        self.committed = False
        self._fail = fail

    async def commit(self):
        if self._fail:
            raise RuntimeError("commit exploded")
        self.committed = True


class _FakeWS:
    def __init__(self, fail: bool = False):
        self.broadcasts = []
        self._fail = fail

    async def broadcast_to_all(self, message):
        if self._fail:
            raise RuntimeError("broadcast exploded")
        self.broadcasts.append(message)


class _FakeAnalytics:
    def __init__(self, fail: bool = False):
        self.calls = 0
        self._fail = fail

    async def emit_live_kpis_update(self, db):
        self.calls += 1
        if self._fail:
            raise RuntimeError("kpi exploded")


def _publish(db, ws, analytics):
    return publish_session_event(
        db,
        ws,
        analytics,
        event_type="session_claimed",
        payload={"line_user_id": "U1", "session_id": 7},
        timestamp="2026-08-05T00:00:00+00:00",
    )


# ---------------------------------------------------------------------------
# session_status_value -- the WS-side half of the defect
# ---------------------------------------------------------------------------

def test_status_value_unwraps_an_enum():
    assert session_status_value(_FakeSession(_Status.ACTIVE)) == "ACTIVE"


def test_status_value_passes_through_a_plain_string():
    """This is the case that raised AttributeError in the WS handler.

    `ChatSession.status` is declared as String in the model (mirroring
    production), so a plain str is not hypothetical.
    """
    assert session_status_value(_FakeSession("ACTIVE")) == "ACTIVE"


def test_status_value_tolerates_none():
    assert session_status_value(_FakeSession(None)) is None


def test_status_value_tolerates_a_session_without_status():
    assert session_status_value(object()) is None


# ---------------------------------------------------------------------------
# Happy path
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_commits_then_broadcasts_then_emits_kpis():
    db, ws, analytics = _FakeDB(), _FakeWS(), _FakeAnalytics()

    await _publish(db, ws, analytics)

    assert db.committed is True
    assert len(ws.broadcasts) == 1
    assert analytics.calls == 1


@pytest.mark.asyncio
async def test_broadcast_message_carries_type_payload_and_timestamp():
    db, ws, analytics = _FakeDB(), _FakeWS(), _FakeAnalytics()

    await _publish(db, ws, analytics)

    assert ws.broadcasts[0] == {
        "type": "session_claimed",
        "payload": {"line_user_id": "U1", "session_id": 7},
        "timestamp": "2026-08-05T00:00:00+00:00",
    }


# ---------------------------------------------------------------------------
# The actual defect: nothing after a successful commit may look like failure
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_kpi_failure_does_not_propagate():
    """The HTTP claim/close endpoints returned 500 here, after the session
    had already been claimed in the database."""
    db, ws, analytics = _FakeDB(), _FakeWS(), _FakeAnalytics(fail=True)

    await _publish(db, ws, analytics)  # must not raise

    assert db.committed is True
    assert len(ws.broadcasts) == 1


@pytest.mark.asyncio
async def test_broadcast_failure_does_not_propagate_either():
    """Same class of bug one step earlier: the commit is durable, so a
    fan-out failure must degrade the notification, not the operation."""
    db, ws, analytics = _FakeDB(), _FakeWS(fail=True), _FakeAnalytics()

    await _publish(db, ws, analytics)  # must not raise

    assert db.committed is True


@pytest.mark.asyncio
async def test_kpis_still_emitted_when_broadcast_fails():
    """The two fan-out steps are independent; one falling over must not
    silently skip the other."""
    db, ws, analytics = _FakeDB(), _FakeWS(fail=True), _FakeAnalytics()

    await _publish(db, ws, analytics)

    assert analytics.calls == 1


@pytest.mark.asyncio
async def test_post_commit_failures_are_logged_not_swallowed(caplog):
    """Non-fatal must not mean invisible — an operator seeing a stale
    sidebar needs a server-side trace explaining why."""
    db, ws, analytics = _FakeDB(), _FakeWS(fail=True), _FakeAnalytics(fail=True)

    with caplog.at_level(logging.WARNING):
        await _publish(db, ws, analytics)

    logged = " ".join(record.getMessage() for record in caplog.records)
    assert "broadcast exploded" in logged
    assert "kpi exploded" in logged


# ---------------------------------------------------------------------------
# Commit failure is different in kind and must still surface
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_commit_failure_propagates():
    """Nothing is durable yet, so the caller must hear about it — this is
    the one case where reporting failure is correct."""
    db, ws, analytics = _FakeDB(fail=True), _FakeWS(), _FakeAnalytics()

    with pytest.raises(RuntimeError, match="commit exploded"):
        await _publish(db, ws, analytics)

    assert ws.broadcasts == []
    assert analytics.calls == 0


# ---------------------------------------------------------------------------
# announce_session_event -- fan-out without the commit
#
# The "operator starts a conversation" endpoint has to `db.refresh(session)`
# between committing and announcing, so it cannot use the combined helper.
# It still needs the same containment: before this existed its broadcast was
# unguarded, so a fan-out failure returned 500 after the session row was
# already committed.
# ---------------------------------------------------------------------------


def _announce(db, ws, analytics):
    return announce_session_event(
        db,
        ws,
        analytics,
        event_type="session_claimed",
        payload={"line_user_id": "U1", "session_id": 7},
        timestamp="2026-08-05T00:00:00+00:00",
    )


@pytest.mark.asyncio
async def test_announce_does_not_commit():
    db, ws, analytics = _FakeDB(), _FakeWS(), _FakeAnalytics()

    await _announce(db, ws, analytics)

    assert db.committed is False
    assert len(ws.broadcasts) == 1
    assert analytics.calls == 1


@pytest.mark.asyncio
async def test_announce_contains_broadcast_and_kpi_failures():
    db, ws, analytics = _FakeDB(), _FakeWS(fail=True), _FakeAnalytics(fail=True)

    await _announce(db, ws, analytics)  # must not raise

    assert analytics.calls == 1  # attempted despite the broadcast failing
