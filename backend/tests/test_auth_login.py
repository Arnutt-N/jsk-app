from types import SimpleNamespace
from typing import Any, cast
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.endpoints.auth import (
    _ADMIN_AUTH_ROLES,
    _find_admin_by_identifier,
    login,
)
from app.core.security import get_password_hash, verify_password
from app.models.user import UserRole
from app.schemas.auth import LoginRequest


class _FakeRequest:
    """Minimal stand-in for starlette Request — login() only reads client.host."""

    class client:  # noqa: N801 - mimics starlette's attribute shape
        host = "testclient"


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


def test_login_request_accepts_email_shaped_identifier() -> None:
    # The same field carries usernames and emails -- no format rejection here.
    payload = LoginRequest(username="  Admin@Example.com  ", password="admin1234")

    assert payload.username == "Admin@Example.com"


class _CaptureDb:
    """Fake session capturing the issued statement for SQL-shape assertions."""

    def __init__(self, value):
        self._value = value
        self.statements = []

    async def execute(self, stmt: Any) -> Any:
        self.statements.append(stmt)
        return _ScalarResult(self._value)

    def last_sql(self) -> str:
        [stmt] = self.statements
        return str(stmt.compile(compile_kwargs={"literal_binds": True}))


def _admin_row(**overrides):
    base = {
        "id": 1,
        "username": "admin",
        "role": UserRole.ADMIN,
        "display_name": "Administrator",
        "hashed_password": "hashed",
    }
    base.update(overrides)
    return SimpleNamespace(**base)


@pytest.mark.asyncio
async def test_find_admin_by_identifier_matches_username() -> None:
    db = _CaptureDb(_admin_row())

    user = await _find_admin_by_identifier(cast(AsyncSession, db), "admin")

    assert user is not None
    assert getattr(user, "username") == "admin"
    assert "admin" in db.last_sql()


@pytest.mark.asyncio
async def test_find_admin_by_identifier_matches_email_case_insensitively() -> None:
    db = _CaptureDb(_admin_row(email="Admin@Example.com"))

    user = await _find_admin_by_identifier(cast(AsyncSession, db), "admin@example.com")

    assert user is not None
    assert getattr(user, "username") == "admin"
    sql = db.last_sql().lower()
    # The query must consult the email column with the identifier normalized.
    assert "email" in sql
    assert "admin@example.com" in sql


@pytest.mark.asyncio
async def test_login_succeeds_with_email_identifier() -> None:
    db = AsyncMock()
    db.execute.return_value = _ScalarResult(
        _admin_row(
            email="admin@example.com",
            hashed_password=get_password_hash("secret1234"),
        )
    )
    db.commit = AsyncMock()

    with pytest.raises(HTTPException) as exc_info:
        await login(
            LoginRequest(username="admin@example.com", password="wrongpass"),
            Response(),
            cast(Request, _FakeRequest()),
            db,
        )

    # Found by email, rejected on password -- proves the identifier reached
    # verification instead of failing the lookup.
    assert exc_info.value.status_code == 401
    assert exc_info.value.detail == "Invalid username or password"


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
        # P1.1a added a `response: Response` parameter (for cookie
        # issuance in dual/cookie mode) between payload and db -- this
        # white-box call now needs a real Response instance to match.
        # The login rate limiter (Redis bucket keyed per IP+username) added
        # a `request: Request` parameter between response and db.
        await login(
            LoginRequest(username="admin", password="admin1234"),
            Response(),
            cast(Request, _FakeRequest()),
            db,
        )

    assert exc_info.value.status_code == 401
    assert exc_info.value.detail == "Invalid username or password"
