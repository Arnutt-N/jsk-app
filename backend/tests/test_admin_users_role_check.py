"""Unit tests for _check_role_permission (review finding H2).

DIRECTOR and HEAD previously fell through the role-check with NO branch, so an
ADMIN with manage_users could create/modify users holding those roles — a
privilege escalation into roles that carry access_manager_endpoints /
access_staff_endpoints. The fix requires SUPER_ADMIN for both.
"""
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.api.v1.endpoints.admin_users import _check_role_permission
from app.models.user import UserRole


def _user(role: UserRole) -> SimpleNamespace:
    return SimpleNamespace(role=role)


@pytest.mark.parametrize("target", [UserRole.SUPER_ADMIN, UserRole.ADMIN])
def test_non_super_admin_cannot_manage_super_admin_or_admin(target):
    with pytest.raises(HTTPException) as exc:
        _check_role_permission(_user(UserRole.ADMIN), target)
    assert exc.value.status_code == 403
    with pytest.raises(HTTPException):
        _check_role_permission(_user(UserRole.AGENT), target)


@pytest.mark.parametrize("target", [UserRole.DIRECTOR, UserRole.HEAD])
def test_admin_cannot_manage_director_or_head(target):
    """The fixed escalation path: ADMIN → DIRECTOR/HEAD must be 403."""
    with pytest.raises(HTTPException) as exc:
        _check_role_permission(_user(UserRole.ADMIN), target)
    assert exc.value.status_code == 403
    assert "SUPER_ADMIN" in exc.value.detail


@pytest.mark.parametrize("target", [UserRole.SUPER_ADMIN, UserRole.ADMIN,
                                    UserRole.DIRECTOR, UserRole.HEAD, UserRole.AGENT])
def test_super_admin_manages_everything(target):
    _check_role_permission(_user(UserRole.SUPER_ADMIN), target)  # must not raise


def test_admin_still_manages_agents_and_below():
    _check_role_permission(_user(UserRole.ADMIN), UserRole.AGENT)  # regression guard
    _check_role_permission(_user(UserRole.ADMIN), UserRole.USER)
