from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.api.v1.endpoints import admin_users
from app.api.v1.endpoints.admin_users import ResetPasswordRequest, UserUpdateRequest
from app.models.user import UserRole


def _db_with_user(user):
    db = AsyncMock()

    async def _execute(stmt):
        return SimpleNamespace(scalar_one_or_none=lambda: user)

    db.execute.side_effect = _execute
    return db


@pytest.mark.asyncio
async def test_admin_reset_invalidates_credentials(monkeypatch):
    invalidate = AsyncMock()
    monkeypatch.setattr(admin_users, "invalidate_credentials", invalidate)
    monkeypatch.setattr(admin_users, "get_password_hash_async", AsyncMock(return_value="hash"))
    monkeypatch.setattr(admin_users, "create_audit_log", AsyncMock())
    user = SimpleNamespace(id=9, username="u", role=UserRole.AGENT, hashed_password="old")

    await admin_users.reset_password(
        user_id=9,
        body=ResetPasswordRequest(new_password="password123"),
        db=_db_with_user(user),
        current_admin=SimpleNamespace(id=1, role=UserRole.SUPER_ADMIN),
    )

    invalidate.assert_awaited_once()
    assert invalidate.await_args.args[1] == 9


@pytest.mark.asyncio
async def test_admin_password_update_invalidates_credentials(monkeypatch):
    invalidate = AsyncMock()
    monkeypatch.setattr(admin_users, "invalidate_credentials", invalidate)
    monkeypatch.setattr(admin_users, "get_password_hash_async", AsyncMock(return_value="hash"))
    monkeypatch.setattr(admin_users, "create_audit_log", AsyncMock())
    user = SimpleNamespace(
        id=9, username="u", role=UserRole.AGENT, hashed_password="old",
        display_name="U", email=None, is_active=True,
        picture_url=None, line_user_id_encrypted=None,
        created_at=None, updated_at=None,
    )

    await admin_users.update_user(
        user_id=9,
        body=UserUpdateRequest(password="password123"),
        db=_db_with_user(user),
        current_admin=SimpleNamespace(id=1, role=UserRole.SUPER_ADMIN),
    )

    invalidate.assert_awaited_once()
    assert invalidate.await_args.args[1] == 9
