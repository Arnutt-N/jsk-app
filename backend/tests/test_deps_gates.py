"""Unit tests for the role-based dependency gates in app.api.deps.

These exercise the pure role check inside get_current_manager and
get_current_staff by passing a SimpleNamespace user directly (bypassing
the Depends(get_current_user) chain), mirroring the lightweight mocking
style in test_auth_login.py.

Context: get_current_manager was added (Phase 1) to let DIRECTOR/HEAD
reach request-workflow endpoints whose inner can_* guards already gate
the sensitive operations. get_current_staff was widened to include
DIRECTOR/HEAD so the two supervisor roles share staff surfaces with
front-line AGENTs.
"""
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.api.deps import get_current_admin, get_current_manager, get_current_staff
from app.models.user import UserRole


def _user(role: UserRole) -> SimpleNamespace:
    return SimpleNamespace(role=role)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "role,allowed",
    [
        (UserRole.SUPER_ADMIN, True),
        (UserRole.ADMIN, True),
        (UserRole.DIRECTOR, True),
        (UserRole.HEAD, True),
        (UserRole.AGENT, False),  # front-line AGENT is NOT a manager
        (UserRole.USER, False),
    ],
)
async def test_get_current_manager_role_gate(role: UserRole, allowed: bool) -> None:
    if allowed:
        result = await get_current_manager(current_user=_user(role))
        assert result.role is role
    else:
        with pytest.raises(HTTPException) as exc_info:
            await get_current_manager(current_user=_user(role))
        assert exc_info.value.status_code == 403


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "role,allowed",
    [
        (UserRole.SUPER_ADMIN, True),
        (UserRole.ADMIN, True),
        (UserRole.DIRECTOR, True),  # widened in Phase 1
        (UserRole.HEAD, True),      # widened in Phase 1
        (UserRole.AGENT, True),
        (UserRole.USER, False),     # public role stays out of staff surfaces
    ],
)
async def test_get_current_staff_role_gate(role: UserRole, allowed: bool) -> None:
    if allowed:
        result = await get_current_staff(current_user=_user(role))
        assert result.role is role
    else:
        with pytest.raises(HTTPException) as exc_info:
            await get_current_staff(current_user=_user(role))
        assert exc_info.value.status_code == 403


@pytest.mark.asyncio
async def test_manager_gate_excludes_public_user() -> None:
    """Regression: the public USER role must never pass the manager gate."""
    with pytest.raises(HTTPException) as exc_info:
        await get_current_manager(current_user=_user(UserRole.USER))
    assert exc_info.value.status_code == 403
    assert exc_info.value.detail == "Insufficient permissions"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "role,allowed",
    [
        (UserRole.SUPER_ADMIN, True),
        (UserRole.ADMIN, True),
        (UserRole.DIRECTOR, False),  # admin gate stays strict
        (UserRole.HEAD, False),
        (UserRole.AGENT, False),
        (UserRole.USER, False),
    ],
)
async def test_get_current_admin_stays_strict(role: UserRole, allowed: bool) -> None:
    """get_current_admin must remain ADMIN/SUPER_ADMIN-only.

    This is the gate DELETE /requests, create_request, and every
    sensitive endpoint (credentials, permission settings, user CRUD)
    rely on. If someone widens it to include DIRECTOR/HEAD, this test
    fails and flags the privilege change for review.
    """
    if allowed:
        result = await get_current_admin(current_user=_user(role))
        assert result.role is role
    else:
        with pytest.raises(HTTPException) as exc_info:
            await get_current_admin(current_user=_user(role))
        assert exc_info.value.status_code == 403
