"""F11: a send must not use a payload version different from the one it claimed."""
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest

from app.models.broadcast import BroadcastStatus, BroadcastType
from app.services.broadcast_service import BroadcastClaimConflict, BroadcastService


def _broadcast(version):
    return SimpleNamespace(
        id=1,
        title="Test",
        message_type=BroadcastType.TEXT,
        content={"text": "original"},
        target_audience="all",
        target_filter={},
        status=BroadcastStatus.DRAFT,
        payload_version=version,
        send_lease_owner=None,
        total_recipients=0,
        success_count=0,
        failure_count=0,
        sent_at=None,
        scheduled_at=None,
    )


@pytest.mark.asyncio
async def test_claim_guard_pins_payload_version():
    svc = BroadcastService()
    db = AsyncMock()
    statements = []

    async def _execute(stmt):
        statements.append(str(stmt.compile(compile_kwargs={"literal_binds": True})))
        return SimpleNamespace(rowcount=1)

    db.execute.side_effect = _execute
    stale = _broadcast(1)
    current = _broadcast(1)
    current.status = BroadcastStatus.SENDING
    current.send_lease_owner = "1"

    with (
        patch.object(svc, "_build_messages", new=AsyncMock(return_value=["msg"])),
        patch.object(svc, "get_broadcast", new=AsyncMock(return_value=current)),
        patch.object(svc, "_send_chunk", new=AsyncMock(return_value="accepted")),
        patch.object(svc, "_finalize", new=AsyncMock()),
    ):
        await svc.send_broadcast(db, stale)

    claim_sql = next(sql for sql in statements if "UPDATE broadcasts SET status" in sql)
    assert "payload_version = 1" in claim_sql


@pytest.mark.asyncio
async def test_refresh_detects_identity_map_staleness():
    svc = BroadcastService()
    db = AsyncMock()
    db.execute.return_value.rowcount = 1
    stale = _broadcast(1)

    def _mutate_to_current(obj):
        obj.payload_version = 2
        obj.status = BroadcastStatus.SENDING
        obj.send_lease_owner = "1"

    db.refresh = AsyncMock(side_effect=_mutate_to_current)

    with (
        patch.object(svc, "_build_messages", new=AsyncMock(return_value=["msg"])),
        patch.object(svc, "get_broadcast", new=AsyncMock(return_value=stale)),
        patch.object(svc, "_send_chunk", new=AsyncMock(return_value="accepted")) as send,
    ):
        with pytest.raises(BroadcastClaimConflict, match="send lease lost"):
            await svc.send_broadcast(db, stale)

    db.refresh.assert_awaited_once()
    send.assert_not_awaited()


@pytest.mark.asyncio
async def test_empty_payload_does_not_mark_a_newer_row_invalid():
    svc = BroadcastService()
    db = AsyncMock()
    db.execute.return_value.rowcount = 0
    stale = _broadcast(1)

    with patch.object(svc, "_build_messages", new=AsyncMock(return_value=[])):
        with pytest.raises(BroadcastClaimConflict, match="payload changed"):
            await svc.send_broadcast(db, stale)

    assert stale.status == BroadcastStatus.DRAFT


@pytest.mark.asyncio
async def test_send_rejects_version_changed_between_read_and_claim():
    svc = BroadcastService()
    db = AsyncMock()
    db.execute.return_value.rowcount = 1
    stale = _broadcast(1)
    current = _broadcast(2)
    current.status = BroadcastStatus.SENDING
    current.send_lease_owner = "1"

    with (
        patch.object(svc, "_build_messages", new=AsyncMock(return_value=["msg"])),
        patch.object(svc, "get_broadcast", new=AsyncMock(return_value=current)),
        patch.object(svc, "_send_chunk", new=AsyncMock(return_value="accepted")) as send,
    ):
        with pytest.raises(BroadcastClaimConflict, match="send lease lost"):
            await svc.send_broadcast(db, stale)

    send.assert_not_awaited()
