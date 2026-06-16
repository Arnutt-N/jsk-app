"""Tests for the broadcast scheduler background task (_process_due_broadcasts)."""
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest

from app.models.broadcast import BroadcastStatus
from app.tasks import broadcast_scheduler


def _due_broadcast(**overrides):
    defaults = dict(
        id=1,
        status=BroadcastStatus.COMPLETED,  # status after a successful send
        success_count=10,
        failure_count=0,
    )
    defaults.update(overrides)
    return SimpleNamespace(**defaults)


@pytest.mark.asyncio
async def test_process_due_no_broadcasts_is_noop():
    db = AsyncMock()
    with patch.object(
        broadcast_scheduler.broadcast_service,
        "get_due_scheduled",
        new=AsyncMock(return_value=[]),
    ) as mock_get, patch.object(
        broadcast_scheduler.broadcast_service,
        "send_broadcast",
        new=AsyncMock(),
    ) as mock_send:
        await broadcast_scheduler._process_due_broadcasts(db)

    mock_get.assert_awaited_once()
    mock_send.assert_not_awaited()


@pytest.mark.asyncio
async def test_process_due_sends_and_writes_system_audit_log():
    db = AsyncMock()
    bc = _due_broadcast()
    with patch.object(
        broadcast_scheduler.broadcast_service,
        "get_due_scheduled",
        new=AsyncMock(return_value=[bc]),
    ), patch.object(
        broadcast_scheduler.broadcast_service,
        "send_broadcast",
        new=AsyncMock(),
    ) as mock_send, patch.object(
        broadcast_scheduler,
        "create_audit_log",
        new=AsyncMock(),
    ) as mock_audit:
        await broadcast_scheduler._process_due_broadcasts(db)

    mock_send.assert_awaited_once_with(db, bc)
    mock_audit.assert_awaited_once()
    kwargs = mock_audit.await_args.kwargs
    assert kwargs["admin_id"] is None  # system action
    assert kwargs["action"] == "auto_send_broadcast"
    assert kwargs["resource_type"] == "broadcast"
    assert kwargs["resource_id"] == "1"
    db.commit.assert_awaited()


@pytest.mark.asyncio
async def test_process_due_send_failure_does_not_propagate():
    """A failing broadcast must be logged but never crash the loop."""
    db = AsyncMock()
    bc = _due_broadcast()
    with patch.object(
        broadcast_scheduler.broadcast_service,
        "get_due_scheduled",
        new=AsyncMock(return_value=[bc]),
    ), patch.object(
        broadcast_scheduler.broadcast_service,
        "send_broadcast",
        new=AsyncMock(side_effect=Exception("LINE down")),
    ), patch.object(
        broadcast_scheduler,
        "create_audit_log",
        new=AsyncMock(),
    ) as mock_audit:
        # Must not raise.
        await broadcast_scheduler._process_due_broadcasts(db)

    # Audit log comes after a successful send, so it is skipped on failure.
    mock_audit.assert_not_awaited()
    # Session is reset so the next iteration starts clean.
    db.rollback.assert_awaited()


@pytest.mark.asyncio
async def test_process_due_continues_after_one_failure():
    """First broadcast fails, second still gets processed."""
    db = AsyncMock()
    bad = _due_broadcast(id=1)
    good = _due_broadcast(id=2)

    async def _send(_db, broadcast):
        if broadcast.id == 1:
            raise Exception("boom")

    with patch.object(
        broadcast_scheduler.broadcast_service,
        "get_due_scheduled",
        new=AsyncMock(return_value=[bad, good]),
    ), patch.object(
        broadcast_scheduler.broadcast_service,
        "send_broadcast",
        new=AsyncMock(side_effect=_send),
    ) as mock_send, patch.object(
        broadcast_scheduler,
        "create_audit_log",
        new=AsyncMock(),
    ) as mock_audit:
        await broadcast_scheduler._process_due_broadcasts(db)

    assert mock_send.await_count == 2
    # only the good one reaches the audit log
    mock_audit.assert_awaited_once()
    assert mock_audit.await_args.kwargs["resource_id"] == "2"
