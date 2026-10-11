"""G3: a concurrent-send loser surfaces HTTP 409 (not 400) on POST /{id}/send.

The atomic claim in send_broadcast raises BroadcastClaimConflict (a ValueError
subclass, so the scheduler's broad `except Exception` and the race test's
`except ValueError` keep working); the admin send endpoint maps it to 409.
"""
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest

from app.api import deps as api_deps
from app.main import app
from app.models.broadcast import BroadcastStatus, BroadcastType
from app.models.user import UserRole
from app.services.broadcast_service import (
    BroadcastClaimConflict,
    BroadcastService,
    broadcast_service,
)


@pytest.mark.asyncio
async def test_claim_loser_raises_conflict_subclassing_value_error():
    svc = BroadcastService()
    bc = SimpleNamespace(
        id=1,
        title="t",
        message_type=BroadcastType.TEXT,
        content={"text": "hi"},
        target_audience="all",
        target_filter={},
        status=BroadcastStatus.DRAFT,
    )
    db = AsyncMock()
    db.execute.return_value.rowcount = 0  # lost the atomic claim
    assert issubclass(BroadcastClaimConflict, ValueError)
    with pytest.raises(BroadcastClaimConflict, match="concurrent send"):
        await svc.send_broadcast(db, bc)


@pytest.mark.asyncio
async def test_post_send_claim_conflict_returns_409(test_client):
    async def _override():
        yield SimpleNamespace(id=1, role=UserRole.SUPER_ADMIN, is_active=True)

    app.dependency_overrides[api_deps.get_current_user] = _override
    try:
        with (
            patch.object(
                broadcast_service,
                "get_broadcast",
                new=AsyncMock(return_value=SimpleNamespace(id=9)),
            ),
            patch.object(
                broadcast_service,
                "send_broadcast",
                new=AsyncMock(
                    side_effect=BroadcastClaimConflict(
                        "Cannot send broadcast 9: claimed by a concurrent send"
                    )
                ),
            ),
        ):
            resp = test_client.post("/api/v1/admin/broadcasts/9/send")
        assert resp.status_code == 409
        assert "concurrent send" in resp.json()["detail"]
    finally:
        app.dependency_overrides.clear()
