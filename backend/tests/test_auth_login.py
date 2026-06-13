from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException

from app.api.v1.endpoints.auth import _ADMIN_AUTH_ROLES, login
from app.core.security import verify_password
from app.models.user import UserRole
from app.schemas.auth import LoginRequest


class _ScalarResult:
    def __init__(self, value):
        self._value = value

    def scalar_one_or_none(self):
        return self._value


def test_verify_password_returns_false_for_invalid_hash() -> None:
    assert verify_password("admin1234", "hashed") is False


def test_admin_auth_roles_include_director_and_head() -> None:
    # DIRECTOR and HEAD must be able to log in AND refresh their token.
    # They were initially omitted, which silently blocked those roles from
    # the admin console (login + silent-refresh both used this allowlist).
    assert UserRole.DIRECTOR in _ADMIN_AUTH_ROLES
    assert UserRole.HEAD in _ADMIN_AUTH_ROLES
    for role in (UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.AGENT):
        assert role in _ADMIN_AUTH_ROLES
    # Regular USER role stays out of the admin console.
    assert UserRole.USER not in _ADMIN_AUTH_ROLES


def test_login_request_trims_username() -> None:
    payload = LoginRequest(username="  admin  ", password="admin1234")

    assert payload.username == "admin"


@pytest.mark.asyncio
async def test_login_returns_401_for_invalid_stored_hash() -> None:
    db = AsyncMock()
    db.execute.return_value = _ScalarResult(
        SimpleNamespace(
            id=1,
            username="admin",
            role=UserRole.ADMIN,
            display_name="Administrator",
            hashed_password="hashed",
        )
    )

    with pytest.raises(HTTPException) as exc_info:
        await login(LoginRequest(username="admin", password="admin1234"), db)

    assert exc_info.value.status_code == 401
    assert exc_info.value.detail == "Invalid username or password"
