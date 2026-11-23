"""Focused F05-F07 regression checks for broadcast recovery."""
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest

from app.api import deps as api_deps
from app.main import app
from app.models.broadcast import BroadcastStatus, BroadcastType
from app.models.user import UserRole
from app.services import broadcast_service as service_module
from app.services.broadcast_service import BroadcastClaimConflict, broadcast_service


def _broadcast(**overrides):
    values = dict(
        id=7,
        title="recovery",
        message_type=BroadcastType.TEXT,
        content={"text": "hello"},
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
    values.update(overrides)
    return SimpleNamespace(**values)


class _Result:
    def __init__(self, rowcount=1, first=None, scalars=None):
        self.rowcount = rowcount
        self._first = first
        self._scalars = scalars or []

    def scalar_one_or_none(self):
        return self._first

    def scalars(self):
        first = self._first
        values = self._scalars

        class _Scalars:
            def first(self):
                return first

            def all(self):
                return values

        return _Scalars()


def _send_db():
    db = AsyncMock()
    db.get_broadcast = AsyncMock(side_effect=lambda _db, _id: _broadcast(
        status=BroadcastStatus.SENDING,
        send_lease_owner="7",
    ))

    def _execute(stmt, *args, **kwargs):
        text = str(stmt).upper()
        if text.startswith("SELECT"):
            return _Result(first=None)
        return _Result(rowcount=1)

    db.execute.side_effect = _execute
    return db


@pytest.mark.asyncio
async def test_unknown_provider_failure_retries_with_stable_key():
    svc = service_module.BroadcastService()
    bc = _broadcast()
    db = _send_db()
    api = AsyncMock()
    api.broadcast.side_effect = TimeoutError("lost reply")
    svc._api = api

    with patch.object(service_module.asyncio, "sleep", new=AsyncMock()):
        result = await svc.send_broadcast(db, bc)

    assert result.status == BroadcastStatus.UNKNOWN
    assert api.broadcast.await_count == service_module.SEND_ATTEMPT_LIMIT
    keys = {call.kwargs["x_line_retry_key"] for call in api.broadcast.await_args_list}
    assert len(keys) == 1


@pytest.mark.asyncio
async def test_definite_refusal_does_not_retry():
    class _Refusal(Exception):
        status = 400

    svc = service_module.BroadcastService()
    db = _send_db()
    api = AsyncMock()
    api.broadcast.side_effect = _Refusal("bad request")
    svc._api = api

    result = await svc.send_broadcast(db, _broadcast())

    assert result.status == BroadcastStatus.FAILED
    assert result.failure_count == 1
    api.broadcast.assert_awaited_once()


def test_stale_sending_route_is_not_captured_by_broadcast_id():
    async def _override():
        yield SimpleNamespace(id=1, role=UserRole.SUPER_ADMIN, is_active=True)

    app.dependency_overrides[api_deps.get_current_user] = _override
    try:
        with patch.object(
            broadcast_service,
            "get_stale_sending",
            new=AsyncMock(return_value=[]),
        ) as get_stale:
            from fastapi.testclient import TestClient

            resp = TestClient(app).get("/api/v1/admin/broadcasts/stale-sending")
        assert resp.status_code == 200
        assert resp.json()["items"] == []
        get_stale.assert_awaited_once()
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_stale_sending_is_surfaced_for_reconciliation():
    svc = service_module.BroadcastService()
    stale = _broadcast(status=BroadcastStatus.SENDING)
    db = AsyncMock()
    db.execute.return_value = _Result(scalars=[stale])

    result = await svc.get_stale_sending(db)

    assert result == [stale]
    statement = str(db.execute.await_args.args[0])
    assert "broadcasts.status" in statement
    assert "broadcasts.updated_at" in statement


@pytest.mark.asyncio
async def test_reconcile_conflict_returns_409():
    async def _override():
        yield SimpleNamespace(id=1, role=UserRole.SUPER_ADMIN, is_active=True)

    app.dependency_overrides[api_deps.get_current_user] = _override
    try:
        with (
            patch.object(
                broadcast_service,
                "get_broadcast",
                new=AsyncMock(return_value=_broadcast(status=BroadcastStatus.SENDING)),
            ),
            patch.object(
                broadcast_service,
                "reconcile_stale_sending",
                new=AsyncMock(side_effect=BroadcastClaimConflict("not stale")),
            ),
        ):
            from fastapi.testclient import TestClient

            client = TestClient(app)
            resp = client.post(
                "/api/v1/admin/broadcasts/7/resolve",
                json={"outcome": "completed"},
            )
        assert resp.status_code == 409
    finally:
        app.dependency_overrides.clear()
