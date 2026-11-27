from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import HTTPException

from app.api.v1.endpoints import admin_broadcast
from app.models.broadcast import BroadcastType


def _payload(operation_id="op-1", title="Campaign"):
    return admin_broadcast.BroadcastCreate(
        title=title,
        message_type=BroadcastType.TEXT,
        content={"text": "hello"},
        target_audience="all",
        operation_id=operation_id,
    )


def _created():
    return SimpleNamespace(
        id=7,
        title="Campaign",
        message_type=BroadcastType.TEXT,
        content={"text": "hello"},
        target_audience="all",
        target_filter={},
        status="draft",
        created_by=1,
    )


@pytest.mark.asyncio
async def test_same_operation_id_replays_the_existing_broadcast():
    db = AsyncMock()
    created = _created()
    with (
        patch.object(admin_broadcast.broadcast_service, "create_broadcast", new=AsyncMock(return_value=created)) as create,
        patch.object(admin_broadcast, "_find_by_operation_id", new=AsyncMock(side_effect=[None, created])),
        patch.object(admin_broadcast.BroadcastResponse, "model_validate", lambda row: row),
        patch.object(admin_broadcast, "create_audit_log", new=AsyncMock()),
    ):
        first = await admin_broadcast.create_broadcast(_payload(), db, SimpleNamespace(id=1))
        second = await admin_broadcast.create_broadcast(_payload(), db, SimpleNamespace(id=1))

    assert first.id == second.id == 7
    create.assert_awaited_once()
    assert create.await_args.kwargs["operation_id"] == "op-1"


@pytest.mark.asyncio
async def test_operation_id_with_different_payload_conflicts():
    db = AsyncMock()
    existing = _created()
    with (
        patch.object(admin_broadcast, "_find_by_operation_id", new=AsyncMock(return_value=existing)),
    ):
        with pytest.raises(HTTPException) as exc:
            await admin_broadcast.create_broadcast(
                _payload(title="Different"), db, SimpleNamespace(id=1)
            )
    assert exc.value.status_code == 409
    assert "BROADCAST_OPERATION_CONFLICT" in exc.value.detail
