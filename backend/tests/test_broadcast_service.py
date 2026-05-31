"""Tests for BroadcastService state machine and message building."""
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.models.broadcast import BroadcastStatus, BroadcastType
from app.services.broadcast_service import BroadcastService


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
    mock_api = AsyncMock()
    mock_api.multicast.side_effect = Exception("chunk fail")
    svc._api = mock_api

    result = await svc.send_broadcast(db, bc)

    assert result.status == BroadcastStatus.FAILED
    assert result.failure_count == 10


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
