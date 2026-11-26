from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError

from app.api.v1.endpoints import admin_users
from app.api.v1.endpoints.admin_users import UserCreateRequest, UserUpdateRequest
from app.core.email import normalize_email


def test_normalize_email_trims_lowercases_and_drops_blank():
    assert normalize_email("  Admin@Example.COM ") == "admin@example.com"
    assert normalize_email("   ") is None
    assert normalize_email("") is None
    assert normalize_email(None) is None


def test_create_request_normalizes_email_at_boundary():
    body = UserCreateRequest(
        username="tester",
        password="password123",
        display_name="Tester",
        email="  Admin@Example.COM ",
    )
    assert body.email == "admin@example.com"

    blank = UserCreateRequest(
        username="tester2",
        password="password123",
        display_name="Tester",
        email="   ",
    )
    assert blank.email is None


def test_update_request_normalizes_email_at_boundary():
    assert UserUpdateRequest(email="  Admin@Example.COM ").email == "admin@example.com"
    assert UserUpdateRequest(email="").email is None


class _ConflictDB:
    def __init__(self):
        self.rollback_calls = 0

    async def execute(self, stmt):
        return SimpleNamespace(scalar_one_or_none=lambda: None)

    def add(self, obj):
        return None

    async def flush(self):
        return None

    async def commit(self):
        raise IntegrityError("INSERT", {}, Exception("UNIQUE constraint failed: ix_users_email"))

    async def rollback(self):
        self.rollback_calls += 1


@pytest.mark.asyncio
async def test_create_maps_unique_conflict_to_409(monkeypatch):
    db = _ConflictDB()
    monkeypatch.setattr(admin_users, "get_password_hash_async", AsyncMock(return_value="hash"))
    monkeypatch.setattr(admin_users, "create_audit_log", AsyncMock())
    body = UserCreateRequest(
        username="tester", password="password123", display_name="Tester", email="a@example.com"
    )

    with pytest.raises(HTTPException) as exc:
        await admin_users.create_user(
            body=body,
            db=db,
            current_admin=SimpleNamespace(id=1, role="SUPER_ADMIN"),
        )

    assert exc.value.status_code == 409
    assert exc.value.detail == "Email already exists"
    assert db.rollback_calls == 1
