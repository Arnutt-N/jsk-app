"""Tests for BroadcastService state machine and message building."""
import asyncio
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.models.broadcast import BroadcastStatus, BroadcastType
from app.services.broadcast_service import (
    BroadcastClaimConflict,
    BroadcastService,
    BroadcastValidationError,
)


def _broadcast(**overrides):
    defaults = dict(
        id=1,
        title="Test",
        message_type=BroadcastType.TEXT,
        content={"text": "Hello"},
        target_audience="all",
        target_filter={},
        status=BroadcastStatus.DRAFT,
        total_recipients=0,
        success_count=0,
        failure_count=0,
        sent_at=None,
        scheduled_at=None,
        payload_version=1,
        send_lease_owner=None,
    )
    defaults.update(overrides)
    return SimpleNamespace(**defaults)


class _ClaimResult:
    """Result shape for the SENDING claim's RETURNING clause."""

    def __init__(self, version=1, rowcount=1, rows=None):
        self.rowcount = rowcount
        self._version = version
        self._rows = rows or []

    def scalar_one(self):
        return self._version

    def scalar_one_or_none(self):
        return self._rows[0] if self._rows else None

    def scalars(self):
        outer = self

        class _Scalars:
            def all(self):
                return outer._rows

            def first(self):
                return outer._rows[0] if outer._rows else None

        return _Scalars()


class _CasDb:
    """Fake session over one shared row. Conditional UPDATEs (send/cancel/
    edit/schedule claims) mutate the row only when status and version match;
    terminal commits write the object's final status. Models two sessions
    holding stale snapshots of the same broadcast."""

    def __init__(self, row, tracked=None):
        self.row = row
        self.tracked = tracked or []
        self.commits = 0

    async def execute(self, stmt, *a, **k):
        text = str(stmt)
        params = stmt.compile().params
        if not text.upper().lstrip().startswith(("UPDATE BROADCASTS", "DELETE FROM BROADCASTS")):
            return SimpleNamespace(
                rowcount=1,
                scalar_one=lambda: self.row.get("payload_version", 1),
                scalar_one_or_none=lambda: None,
                scalars=lambda: SimpleNamespace(all=lambda: [], first=lambda: None),
            )
        if text.upper().lstrip().startswith("DELETE FROM BROADCASTS"):
            if self.row["status"] not in (BroadcastStatus.DRAFT, BroadcastStatus.CANCELLED):
                return SimpleNamespace(rowcount=0)
            self.row["status"] = None
            return SimpleNamespace(rowcount=1)

        wanted = params.get("status_1", [])
        if wanted and self.row["status"] not in wanted:
            return SimpleNamespace(rowcount=0)
        expected_version = params.get("payload_version_2", params.get("payload_version_1"))
        if expected_version is not None and self.row.get("payload_version", 1) != expected_version:
            return SimpleNamespace(rowcount=0)
        if "send_lease_owner_1" in params and self.row.get("send_lease_owner") != params["send_lease_owner_1"]:
            return SimpleNamespace(rowcount=0)
        self.row["status"] = params.get("status", self.row["status"])
        for key in (
            "scheduled_at", "send_lease_owner", "success_count", "failure_count",
            "total_recipients", "title", "message_type", "content",
            "target_audience", "target_filter",
        ):
            if key in params:
                self.row[key] = params[key]
        if "payload_version_1" in params:
            self.row["payload_version"] = self.row.get("payload_version", 1) + 1
        return SimpleNamespace(
            rowcount=1,
            scalar_one=lambda: self.row.get("payload_version", 1),
        )

    async def commit(self):
        self.commits += 1
        for obj in self.tracked:
            if obj.status in (
                BroadcastStatus.COMPLETED,
                BroadcastStatus.FAILED,
                BroadcastStatus.CANCELLED,
                BroadcastStatus.INVALID,
                BroadcastStatus.UNKNOWN,
            ):
                self.row["status"] = obj.status

    async def refresh(self, obj):
        pass

    def add(self, obj):
        pass


@pytest.mark.asyncio
async def test_send_broadcast_rejects_completed_status():
    svc = BroadcastService()
    bc = _broadcast(status=BroadcastStatus.COMPLETED)
    db = AsyncMock()
    with pytest.raises(ValueError, match="Cannot send"):
        await svc.send_broadcast(db, bc)


@pytest.mark.asyncio
async def test_send_broadcast_rejects_cancelled_status():
    svc = BroadcastService()
    bc = _broadcast(status=BroadcastStatus.CANCELLED)
    db = AsyncMock()
    with pytest.raises(ValueError, match="Cannot send"):
        await svc.send_broadcast(db, bc)


@pytest.mark.asyncio
async def test_send_broadcast_rejects_empty_messages():
    svc = BroadcastService()
    bc = _broadcast(content={"text": ""})  # empty text -> no messages
    db = AsyncMock()
    with pytest.raises(BroadcastValidationError, match="no valid messages"):
        await svc.send_broadcast(db, bc)


@pytest.mark.asyncio
async def test_send_broadcast_transitions_to_completed():
    svc = BroadcastService()
    bc = _broadcast()
    db = AsyncMock()
    db.execute.return_value = _ClaimResult(version=1, rowcount=1)
    db.execute.side_effect = None
    async def _reload(_db, _id):
        bc.status = BroadcastStatus.SENDING
        bc.send_lease_owner = str(1)
        return bc

    db.get_broadcast = AsyncMock(side_effect=_reload)
    mock_api = AsyncMock()
    svc._api = mock_api

    result = await svc.send_broadcast(db, bc)

    assert result.status == BroadcastStatus.COMPLETED
    assert result.sent_at is not None
    mock_api.broadcast.assert_awaited_once()


@pytest.mark.asyncio
async def test_send_broadcast_multicast_partial_failure():
    svc = BroadcastService()
    user_ids = [f"U{i}" for i in range(10)]
    bc = _broadcast(
        target_audience="specific",
        target_filter={"user_ids": user_ids},
    )
    db = AsyncMock()
    db.execute.return_value = _ClaimResult(version=1, rowcount=1)
    db.execute.side_effect = None
    async def _reload(_db, _id):
        bc.status = BroadcastStatus.SENDING
        bc.send_lease_owner = str(1)
        return bc

    db.get_broadcast = AsyncMock(side_effect=_reload)
    class _DefiniteFailure(Exception):
        status = 400

    mock_api = AsyncMock()
    mock_api.multicast.side_effect = _DefiniteFailure("chunk refused")
    svc._api = mock_api

    result = await svc.send_broadcast(db, bc)

    assert result.status == BroadcastStatus.FAILED
    assert result.failure_count == 10


@pytest.mark.asyncio
async def test_cancel_marks_failed_then_reraises():
    svc = BroadcastService()
    bc = _broadcast()
    db = AsyncMock()
    db.execute.return_value = _ClaimResult(version=1, rowcount=1)
    db.execute.side_effect = None
    async def _reload(_db, _id):
        bc.status = BroadcastStatus.SENDING
        bc.send_lease_owner = str(1)
        return bc

    db.get_broadcast = AsyncMock(side_effect=_reload)
    mock_api = AsyncMock()
    mock_api.broadcast = AsyncMock(side_effect=asyncio.CancelledError())
    svc._api = mock_api

    with pytest.raises(asyncio.CancelledError):
        await svc.send_broadcast(db, bc)

    # Provider call started before cancellation, so acceptance is unknown.
    assert bc.status == BroadcastStatus.SENDING
    assert db.commit.await_count >= 2  # SENDING commit + durable attempt log


@pytest.mark.asyncio
async def test_schedule_broadcast_rejects_non_draft():
    svc = BroadcastService()
    bc = _broadcast(status=BroadcastStatus.COMPLETED)
    db = AsyncMock()
    future = datetime.now(timezone.utc) + timedelta(hours=1)
    with pytest.raises(ValueError, match="Cannot schedule"):
        await svc.schedule_broadcast(db, bc, future)


@pytest.mark.asyncio
async def test_schedule_broadcast_rejects_past_time():
    svc = BroadcastService()
    bc = _broadcast()
    db = AsyncMock()
    past = datetime.now(timezone.utc) - timedelta(hours=1)
    with pytest.raises(ValueError, match="must be in the future"):
        await svc.schedule_broadcast(db, bc, past)


@pytest.mark.asyncio
async def test_cancel_broadcast_rejects_completed():
    svc = BroadcastService()
    bc = _broadcast(status=BroadcastStatus.COMPLETED)
    db = AsyncMock()
    with pytest.raises(ValueError, match="Cannot cancel"):
        await svc.cancel_broadcast(db, bc)


@pytest.mark.asyncio
async def test_cancel_broadcast_rejects_failed():
    svc = BroadcastService()
    bc = _broadcast(status=BroadcastStatus.FAILED)
    db = AsyncMock()
    with pytest.raises(ValueError, match="Cannot cancel"):
        await svc.cancel_broadcast(db, bc)


@pytest.mark.asyncio
async def test_cancel_wins_then_send_is_rejected_with_no_line_call():
    """A cancel claim flips DRAFT/SCHEDULED to CANCELLED first; the sender's
    later claim sees rowcount 0, raises before delivery, and never calls LINE."""
    svc = BroadcastService()
    api = AsyncMock()
    svc._api = api
    row = {"status": BroadcastStatus.SCHEDULED, "scheduled_at": None}
    cancel_db = _CasDb(row)
    send_db = _CasDb(row)

    cancelled = await svc.cancel_broadcast(cancel_db, _broadcast(status=BroadcastStatus.SCHEDULED))
    assert cancelled.status == BroadcastStatus.CANCELLED
    assert row["status"] == BroadcastStatus.CANCELLED

    with pytest.raises(BroadcastClaimConflict):
        await svc.send_broadcast(send_db, _broadcast(status=BroadcastStatus.SCHEDULED))
    api.broadcast.assert_not_awaited()
    assert row["status"] == BroadcastStatus.CANCELLED


@pytest.mark.asyncio
async def test_send_wins_sending_then_cancel_claim_gets_rowcount_zero():
    """Sender claims SENDING, slow LINE call in flight; the stale cancel
    claim cannot flip the row and its commit must not overwrite with CANCELLED."""
    svc = BroadcastService()
    row = {"status": BroadcastStatus.SCHEDULED, "scheduled_at": None}
    bc = _broadcast(status=BroadcastStatus.SCHEDULED)

    async def slow(*a, **k):
        await asyncio.sleep(0)

    api = AsyncMock()
    api.broadcast.side_effect = slow
    svc._api = api

    send_db = _CasDb(row, tracked=[bc])

    async def _reload(_db, _id):
        bc.status = row["status"]
        bc.send_lease_owner = row.get("send_lease_owner")
        return bc

    send_db.get_broadcast = AsyncMock(side_effect=_reload)
    send_task = asyncio.create_task(svc.send_broadcast(send_db, bc))
    await asyncio.sleep(0)  # let the SENDING claim commit before cancel
    assert row["status"] == BroadcastStatus.SENDING

    cancel_db = _CasDb(row)
    with pytest.raises(BroadcastClaimConflict):
        await svc.cancel_broadcast(cancel_db, _broadcast(status=BroadcastStatus.SCHEDULED))
    assert row["status"] == BroadcastStatus.SENDING

    await send_task
    assert row["status"] == BroadcastStatus.COMPLETED
    api.broadcast.assert_awaited_once()


@pytest.mark.asyncio
async def test_cancel_rejects_sending():
    """Cancel on a stale SENDING snapshot never issues a winning claim."""
    svc = BroadcastService()
    row = {"status": BroadcastStatus.SENDING, "scheduled_at": None}
    cancel_db = _CasDb(row)
    with pytest.raises(BroadcastClaimConflict):
        await svc.cancel_broadcast(cancel_db, _broadcast(status=BroadcastStatus.SENDING))
    assert row["status"] == BroadcastStatus.SENDING
    assert cancel_db.commits == 0


@pytest.mark.asyncio
async def test_build_messages_text():
    svc = BroadcastService()
    bc = _broadcast(content={"text": "Hello world"})
    db = AsyncMock()
    msgs = await svc._build_messages(bc, db)
    assert len(msgs) == 1
    assert msgs[0].text == "Hello world"


@pytest.mark.asyncio
async def test_build_messages_multi_truncates_to_5():
    svc = BroadcastService()
    items = [{"type": "text", "text": f"msg{i}"} for i in range(10)]
    bc = _broadcast(
        message_type=BroadcastType.MULTI,
        content={"messages": items},
    )
    db = AsyncMock()
    msgs = await svc._build_messages(bc, db)
    assert len(msgs) == 5


@pytest.mark.asyncio
async def test_invalid_broadcast_is_marked_invalid_not_scheduled_again():
    svc = BroadcastService()
    row = {
        "status": BroadcastStatus.SCHEDULED,
        "scheduled_at": datetime.now(timezone.utc) - timedelta(minutes=1),
        "payload_version": 1,
    }
    db = _CasDb(row)

    with pytest.raises(BroadcastValidationError, match="no valid messages"):
        await svc.send_broadcast(db, _broadcast(
            status=BroadcastStatus.SCHEDULED,
            content={"text": ""},
            scheduled_at=row["scheduled_at"],
        ))

    assert row["status"] == BroadcastStatus.INVALID


@pytest.mark.asyncio
async def test_stale_edit_cannot_overwrite_winner():
    svc = BroadcastService()
    row = {"status": BroadcastStatus.DRAFT, "payload_version": 1, "title": "old"}
    winner = await svc.update_broadcast(_CasDb(row), _broadcast(title="old"), title="new")
    assert winner.payload_version == 2
    assert row["title"] == "new"

    with pytest.raises(BroadcastClaimConflict):
        await svc.update_broadcast(
            _CasDb(row), _broadcast(title="old", payload_version=1), title="stale"
        )

    assert row["title"] == "new"
    assert row["payload_version"] == 2


@pytest.mark.asyncio
async def test_send_claim_blocks_schedule_edit_and_delete():
    svc = BroadcastService()
    row = {"status": BroadcastStatus.SENDING, "payload_version": 2, "title": "claimed"}
    stale = _broadcast(status=BroadcastStatus.DRAFT, payload_version=1)
    future = datetime.now(timezone.utc) + timedelta(hours=1)

    with pytest.raises(BroadcastClaimConflict):
        await svc.schedule_broadcast(_CasDb(row), stale, future)
    with pytest.raises(BroadcastClaimConflict):
        await svc.update_broadcast(_CasDb(row), stale, title="stale")
    with pytest.raises(BroadcastClaimConflict):
        await svc.delete_broadcast(_CasDb(row), stale)

    assert row["status"] == BroadcastStatus.SENDING
    assert row["title"] == "claimed"
    assert row["payload_version"] == 2
