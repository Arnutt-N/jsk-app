import hashlib
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from typing import cast
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.endpoints import auth as auth_endpoints
from app.models.user import UserRole
from app.schemas.auth import ForgotPasswordRequest, ResetPasswordConfirm


class _Result:
    def __init__(self, value):
        self._value = value

    def scalar_one_or_none(self):
        return self._value


class _FakeDB:
    def __init__(self, selects=None):
        self.added = []
        self.selects = list(selects or [])
        self.committed = False

    async def execute(self, stmt):
        return _Result(self.selects.pop(0) if self.selects else None)

    def add(self, obj):
        self.added.append(obj)

    async def flush(self):
        pass

    async def commit(self):
        self.committed = True

    async def refresh(self, obj):
        pass


class _FakeRequest:
    class client:
        host = "testclient"


def _user_row(**overrides):
    base = {
        "id": 3,
        "username": "somying01",
        "email": "somying@example.com",
        "role": UserRole.AGENT,
        "display_name": "สมหญิง ใจดี",
        "hashed_password": "hashed",
        "is_active": True,
    }
    base.update(overrides)
    return SimpleNamespace(**base)


def _token_row(**overrides):
    base = {
        "id": 1,
        "user_id": 3,
        "token_hash": "abc",
        "expires_at": datetime.now(timezone.utc) + timedelta(minutes=30),
        "used_at": None,
    }
    base.update(overrides)
    return SimpleNamespace(**base)


@pytest.mark.asyncio
async def test_forgot_password_sends_link_for_known_email():
    db = _FakeDB(selects=[_user_row()])
    with (
        patch.object(
            auth_endpoints.redis_client, "fixed_window_allow", return_value=True
        ),
        patch.object(
            auth_endpoints, "send_booking_email", new=AsyncMock(return_value=True)
        ) as mailer,
    ):
        auth_endpoints.settings.PUBLIC_APP_URL = "https://app.example.test"
        try:
            res = await auth_endpoints.forgot_password(
                ForgotPasswordRequest(username_or_email="somying@example.com"),
                cast(Request, _FakeRequest()),
                cast(AsyncSession, db),
            )
        finally:
            auth_endpoints.settings.PUBLIC_APP_URL = ""

    assert "ส่งลิงก์" in res["detail"]
    tokens = [o for o in db.added if type(o).__name__ == "PasswordResetToken"]
    assert len(tokens) == 1
    mailer.assert_awaited_once()
    to, subject, body = mailer.await_args.args
    assert to == "somying@example.com"
    assert "/reset-password?token=" in body


@pytest.mark.asyncio
async def test_forgot_password_same_answer_for_unknown_account():
    db = _FakeDB(selects=[None])
    with (
        patch.object(
            auth_endpoints.redis_client, "fixed_window_allow", return_value=True
        ),
        patch.object(
            auth_endpoints, "send_booking_email", new=AsyncMock(return_value=True)
        ) as mailer,
    ):
        res = await auth_endpoints.forgot_password(
            ForgotPasswordRequest(username_or_email="ghost@example.com"),
            cast(Request, _FakeRequest()),
            cast(AsyncSession, db),
        )

    assert "ส่งลิงก์" in res["detail"]
    assert [o for o in db.added if type(o).__name__ == "PasswordResetToken"] == []
    mailer.assert_not_awaited()


@pytest.mark.asyncio
async def test_reset_password_consumes_token_once():
    raw = "test-token-value-1234567890"
    token_hash = hashlib.sha256(raw.encode()).hexdigest()
    record = _token_row(token_hash=token_hash)
    db = _FakeDB(selects=[record, _user_row()])

    res = await auth_endpoints.reset_password(
        ResetPasswordConfirm(token=raw, new_password="brandnew1"),
        cast(AsyncSession, db),
    )

    assert "ตั้งรหัสผ่านใหม่แล้ว" in res["detail"]
    assert record.used_at is not None
    assert db.committed is True

    db2 = _FakeDB(selects=[record, _user_row()])
    with pytest.raises(HTTPException) as exc_info:
        await auth_endpoints.reset_password(
            ResetPasswordConfirm(token=raw, new_password="another11"),
            cast(AsyncSession, db2),
        )
    assert exc_info.value.status_code == 400


@pytest.mark.asyncio
async def test_reset_password_rejects_expired_token():
    raw = "expired-token-1234567890"
    record = _token_row(
        token_hash=hashlib.sha256(raw.encode()).hexdigest(),
        expires_at=datetime.now(timezone.utc) - timedelta(minutes=1),
    )
    db = _FakeDB(selects=[record])

    with pytest.raises(HTTPException) as exc_info:
        await auth_endpoints.reset_password(
            ResetPasswordConfirm(token=raw, new_password="brandnew1"),
            cast(AsyncSession, db),
        )
    assert exc_info.value.status_code == 400
    assert "หมดอายุ" in exc_info.value.detail
