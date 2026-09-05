"""Tests for _check_role_permission helper and the /workload auth gate."""
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.api import deps
from app.api.v1.endpoints.admin_users import _check_role_permission
from app.db.session import get_db as session_get_db
from app.main import app
from app.models.user import UserRole


def _user(role: UserRole):
    return SimpleNamespace(id=1, role=role)


def test_super_admin_can_manage_super_admin():
    _check_role_permission(_user(UserRole.SUPER_ADMIN), UserRole.SUPER_ADMIN)


def test_super_admin_can_manage_admin():
    _check_role_permission(_user(UserRole.SUPER_ADMIN), UserRole.ADMIN)


def test_super_admin_can_manage_agent():
    _check_role_permission(_user(UserRole.SUPER_ADMIN), UserRole.AGENT)


def test_admin_can_manage_agent():
    _check_role_permission(_user(UserRole.ADMIN), UserRole.AGENT)


def test_admin_cannot_manage_admin():
    with pytest.raises(HTTPException) as exc:
        _check_role_permission(_user(UserRole.ADMIN), UserRole.ADMIN)
    assert exc.value.status_code == 403


def test_admin_cannot_manage_super_admin():
    with pytest.raises(HTTPException) as exc:
        _check_role_permission(_user(UserRole.ADMIN), UserRole.SUPER_ADMIN)
    assert exc.value.status_code == 403


def test_agent_cannot_manage_agent():
    with pytest.raises(HTTPException) as exc:
        _check_role_permission(_user(UserRole.AGENT), UserRole.AGENT)
    assert exc.value.status_code == 403


def test_agent_cannot_manage_super_admin():
    with pytest.raises(HTTPException) as exc:
        _check_role_permission(_user(UserRole.AGENT), UserRole.SUPER_ADMIN)
    assert exc.value.status_code == 403


def test_managing_user_role_has_no_restriction():
    # UserRole.USER has no explicit branch in _check_role_permission,
    # so it should pass without error for any caller
    _check_role_permission(_user(UserRole.AGENT), UserRole.USER)
    _check_role_permission(_user(UserRole.ADMIN), UserRole.USER)
    _check_role_permission(_user(UserRole.SUPER_ADMIN), UserRole.USER)


# ── /workload auth gate ──────────────────────────────────────────────
# Phase 6: GET /admin/users/workload is gated by get_current_staff (not
# get_current_admin) so live-chat operators (AGENT) can fetch the operator
# roster for the transfer picker. The endpoint imports get_db from
# app.db.session, so the override key is session_get_db (mirrors
# test_admin_requests_endpoints.py).


def test_workload_allows_non_admin_staff_agent():
    """A non-admin staff member (role AGENT) gets 200 from /workload."""
    fake_agent = SimpleNamespace(id=1, role=UserRole.AGENT, username="operator")

    # No users matched -> endpoint short-circuits to an empty roster; this
    # keeps the test focused on the auth gate without needing a real DB.
    empty_result = MagicMock()
    empty_result.scalars.return_value.all.return_value = []

    mock_db = AsyncMock()
    mock_db.execute.return_value = empty_result

    async def _override_get_db():
        yield mock_db

    async def _override_get_current_staff():
        return fake_agent

    app.dependency_overrides[session_get_db] = _override_get_db
    app.dependency_overrides[deps.get_current_staff] = _override_get_current_staff

    client = TestClient(app)
    try:
        response = client.get("/api/v1/admin/users/workload")
        assert response.status_code == 200
        assert response.json() == []
    finally:
        app.dependency_overrides.clear()


# ── update_user target-role guard (review follow-up M2) ─────────────
# A profile-only PUT (no `role` in the body) used to skip the target-role
# permission check entirely, so an ADMIN could modify DIRECTOR/HEAD accounts
# (display name, email, is_active) by omitting the role field.

class _FakeResult:
    def __init__(self, value):
        self._value = value

    def scalar_one_or_none(self):
        return self._value


def _target_user(role: UserRole, user_id: int = 5):
    return SimpleNamespace(
        id=user_id, username="target", email="target@example.com",
        display_name="Old Name", picture_url=None, role=role, is_active=True,
        line_user_id=None, line_user_id_encrypted=None,
        created_at=None, updated_at=None,
    )


def _put_user(client, user_id: int = 5, **fields):
    return client.put(f"/api/v1/admin/users/{user_id}", json=fields)


def _wire_update_overrides(current_user, target):
    db = AsyncMock()
    db.execute = AsyncMock(return_value=_FakeResult(target))

    async def _override_get_db():
        yield db

    async def _override_get_current_user():
        return current_user

    app.dependency_overrides[session_get_db] = _override_get_db
    app.dependency_overrides[deps.get_current_user] = _override_get_current_user


def test_admin_cannot_profile_edit_director():
    """ADMIN + profile-only PUT on a DIRECTOR account must be 403."""
    admin = SimpleNamespace(id=1, username="admin", display_name="A",
                            role=UserRole.ADMIN, is_active=True)
    target = _target_user(UserRole.DIRECTOR)
    _wire_update_overrides(admin, target)
    client = TestClient(app)
    try:
        response = _put_user(client, display_name="Renamed")
    finally:
        app.dependency_overrides.clear()
    assert response.status_code == 403


def test_admin_cannot_deactivate_director_via_profile_put():
    """The is_active toggle rides the same profile-only PUT path — 403."""
    admin = SimpleNamespace(id=1, username="admin", display_name="A",
                            role=UserRole.ADMIN, is_active=True)
    target = _target_user(UserRole.HEAD)
    _wire_update_overrides(admin, target)
    client = TestClient(app)
    try:
        response = _put_user(client, is_active=False)
    finally:
        app.dependency_overrides.clear()
    assert response.status_code == 403


def test_admin_can_still_edit_own_profile():
    """Editing your own account is always allowed (self-edit exception)."""
    admin = SimpleNamespace(id=1, username="admin", display_name="A",
                            role=UserRole.ADMIN, is_active=True)
    target = _target_user(UserRole.ADMIN, user_id=1)  # self
    _wire_update_overrides(admin, target)
    client = TestClient(app)
    try:
        response = _put_user(client, user_id=1, display_name="Renamed")
    finally:
        app.dependency_overrides.clear()
    assert response.status_code == 200


def test_super_admin_can_profile_edit_director():
    """SUPER_ADMIN manages every role — profile-only PUT on DIRECTOR is 200."""
    super_admin = SimpleNamespace(id=1, username="root", display_name="Root",
                                  role=UserRole.SUPER_ADMIN, is_active=True)
    target = _target_user(UserRole.DIRECTOR)
    _wire_update_overrides(super_admin, target)
    client = TestClient(app)
    try:
        response = _put_user(client, display_name="Renamed")
    finally:
        app.dependency_overrides.clear()
    assert response.status_code == 200
