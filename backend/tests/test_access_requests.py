"""Tests for the public access-request intake and the admin review queue."""

from datetime import datetime, timezone
from types import SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.api import deps
from app.api.v1.endpoints import admin_access_requests as ar_endpoints
from app.api.v1.endpoints import auth as auth_endpoints
from app.core.permissions import invalidate_cache
from app.main import app
from app.models.access_request import AccessRequestStatus
from app.models.user import UserRole
from app.schemas.access_request import AccessRequestApprove, AccessRequestReject


class _Result:
    def __init__(self, value):
        self._value = value

    def scalar_one_or_none(self):
        return self._value


class _FakeDB:
    """Minimal stand-in: captures added rows, replays queued SELECT results."""

    def __init__(self, selects=None):
        self.added = []
        self.selects = list(selects or [])
        self.committed = False

    async def execute(self, stmt):
        return _Result(self.selects.pop(0) if self.selects else None)

    def add(self, obj):
        if getattr(obj, "id", None) is None:
            obj.id = 1000 + len(self.added)
        self.added.append(obj)

    async def flush(self):
        pass

    async def commit(self):
        self.committed = True

    async def refresh(self, obj):
        pass


def _request_row(**overrides):
    from app.models.access_request import AccessRequest

    base = {
        "id": 7,
        "display_name": "สมหญิง ใจดี",
        "username": "somying01",
        "email": "somying@example.com",
        "phone_number": None,
        "requested_role": UserRole.AGENT,
        "reason": "เจ้าหน้าที่รับเรื่อง",
        "status": AccessRequestStatus.PENDING,
        "reviewed_by": None,
        "reviewed_at": None,
        "review_note": None,
        "created_at": datetime.now(timezone.utc),
        "updated_at": None,
    }
    base.update(overrides)
    return AccessRequest(**base)


@pytest.fixture
def client():
    invalidate_cache()
    app.dependency_overrides.clear()
    yield TestClient(app)
    app.dependency_overrides.clear()
    invalidate_cache()


def _override_db(db):
    async def _get_db():
        yield db

    app.dependency_overrides[deps.get_db] = _get_db


def test_request_access_creates_pending(client):
    db = _FakeDB()
    _override_db(db)
    with patch.object(
        auth_endpoints.redis_client, "fixed_window_allow", return_value=True
    ):
        res = client.post(
            "/api/v1/auth/request-access",
            json={
                "display_name": "สมหญิง ใจดี",
                "username": "somying01",
                "email": "Somying@Example.com",
                "requested_role": "AGENT",
                "reason": "เจ้าหน้าที่รับเรื่อง",
            },
        )
    assert res.status_code == 201, res.text
    rows = [o for o in db.added if type(o).__name__ == "AccessRequest"]
    assert len(rows) == 1
    assert rows[0].status == AccessRequestStatus.PENDING
    assert rows[0].email == "somying@example.com"


def test_request_access_rejects_admin_role(client):
    db = _FakeDB()
    _override_db(db)
    with patch.object(
        auth_endpoints.redis_client, "fixed_window_allow", return_value=True
    ):
        res = client.post(
            "/api/v1/auth/request-access",
            json={
                "display_name": "ใครก็ได้",
                "username": "someone01",
                "requested_role": "ADMIN",
            },
        )
    assert res.status_code == 400


def test_request_access_rate_limited(client):
    db = _FakeDB()
    _override_db(db)
    with patch.object(
        auth_endpoints.redis_client, "fixed_window_allow", return_value=False
    ):
        res = client.post(
            "/api/v1/auth/request-access",
            json={
                "display_name": "ใครก็ได้",
                "username": "someone02",
                "requested_role": "AGENT",
            },
        )
    assert res.status_code == 429


class _FakeRequest:
    class client:
        host = "testclient"


@pytest.mark.asyncio
async def test_approve_mints_user_and_marks_approved():
    db = _FakeDB(selects=[_request_row(), None])
    admin = SimpleNamespace(id=99, role=UserRole.SUPER_ADMIN)

    out = await ar_endpoints.approve_request(
        7, AccessRequestApprove(password="secret1234"), db, admin  # type: ignore[arg-type]
    )

    users = [o for o in db.added if type(o).__name__ == "User"]
    assert len(users) == 1
    assert users[0].username == "somying01"
    assert users[0].role == UserRole.AGENT
    assert users[0].is_active is True
    assert out.status == AccessRequestStatus.APPROVED


@pytest.mark.asyncio
async def test_admin_cannot_approve_director_request():
    db = _FakeDB(selects=[_request_row(requested_role=UserRole.DIRECTOR)])
    admin = SimpleNamespace(id=99, role=UserRole.ADMIN)

    with pytest.raises(HTTPException) as exc_info:
        await ar_endpoints.approve_request(
            7, AccessRequestApprove(password="secret1234"), db, admin  # type: ignore[arg-type]
        )
    assert exc_info.value.status_code == 403


@pytest.mark.asyncio
async def test_approve_rejects_taken_username():
    db = _FakeDB(selects=[_request_row(), SimpleNamespace(id=5)])
    admin = SimpleNamespace(id=99, role=UserRole.SUPER_ADMIN)

    with pytest.raises(HTTPException) as exc_info:
        await ar_endpoints.approve_request(
            7, AccessRequestApprove(password="secret1234"), db, admin  # type: ignore[arg-type]
        )
    assert exc_info.value.status_code == 409


@pytest.mark.asyncio
async def test_reject_marks_rejected_without_user():
    db = _FakeDB(selects=[_request_row()])
    admin = SimpleNamespace(id=99, role=UserRole.ADMIN)

    out = await ar_endpoints.reject_request(
        7, AccessRequestReject(note="ตำแหน่งเต็ม"), db, admin  # type: ignore[arg-type]
    )

    assert out.status == AccessRequestStatus.REJECTED
    assert [o for o in db.added if type(o).__name__ == "User"] == []
