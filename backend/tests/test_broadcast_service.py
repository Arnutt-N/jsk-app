"""Tests for BroadcastService state machine and message building."""
import asyncio
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.models.broadcast import BroadcastStatus, BroadcastType
from app.services.broadcast_service import BroadcastClaimConflict, BroadcastService


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
    )
    defaults.update(overrides)
    return SimpleNamespace(**defaults)


class _CasDb:
    """Fake session over one shared row. Conditional UPDATEs (send/cancel
    claims) mutate the row only when its status is still DRAFT/SCHEDULED;
    terminal commits write the object's final status. Models two sessions
    holding stale snapshots of the same broadcast."""

    def __init__(self, row, tracked=None):
        self.row = row
        self.tracked = tracked or []
        self.commits = 0

    async def execute(self, stmt, *a, **k):
        params = stmt.compile().params
        if not str(stmt).upper().lstrip().startswith("UPDATE BROADCASTS"):
            return SimpleNamespace(rowcount=1, scalars=lambda: SimpleNamespace(all=lambda: []))
        wanted = params.get("status_1", [])
        if self.row["status"] not in wanted:
            return SimpleNamespace(rowcount=0)
        self.row["status"] = params["status"]
        if "scheduled_at" in params:
            self.row["scheduled_at"] = params["scheduled_at"]
        return SimpleNamespace(rowcount=1)

    async def commit(self):
        self.commits += 1
        for obj in self.tracked:
            if obj.status in (
                BroadcastStatus.COMPLETED,
                BroadcastStatus.FAILED,
                BroadcastStatus.CANCELLED,
            ):
                self.row["status"] = obj.status

    async def refresh(self, obj):
        pass

    async def add(self, obj):
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
    with pytest.raises(ValueError, match="no valid messages"):
        await svc.send_broadcast(db, bc)


@pytest.mark.asyncio
async def test_send_broadcast_transitions_to_completed():
    svc = BroadcastService()
    bc = _broadcast()
    db = AsyncMock()
    db.execute.return_value.rowcount = 1  # atomic claim succeeds
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
    db.execute.return_value.rowcount = 1  # atomic claim succeeds
    mock_api = AsyncMock()
    mock_api.multicast.side_effect = Exception("chunk fail")
    svc._api = mock_api

    result = await svc.send_broadcast(db, bc)

    assert result.status == BroadcastStatus.FAILED
    assert result.failure_count == 10


@pytest.mark.asyncio
async def test_cancel_marks_failed_then_reraises():
    svc = BroadcastService()
    bc = _broadcast()
    db = AsyncMock()
    db.execute.return_value.rowcount = 1  # atomic claim succeeds
    mock_api = AsyncMock()
    mock_api.broadcast = AsyncMock(side_effect=asyncio.CancelledError())
    svc._api = mock_api

    with pytest.raises(asyncio.CancelledError):
        await svc.send_broadcast(db, bc)

    assert bc.status == BroadcastStatus.FAILED
    assert db.commit.await_count >= 2  # SENDING commit + FAILED-mark commit


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
