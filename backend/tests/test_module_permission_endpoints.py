"""Endpoint tests for the Phase 3 module-permission gates.

These mirror the _FakeDB + app.dependency_overrides style used by
test_admin_requests_endpoints.py. Two surfaces are covered:

  1. require_permission gate on POST /admin/users — the gate resolves the
     user via deps.get_current_user (NOT get_current_admin), so we override
     that. AGENT lacks manage_users -> 403; ADMIN holds it -> NOT 403 (the
     request proceeds past the gate into handler logic).

  2. The permission-settings lockout on PATCH /admin/settings/permissions —
     removing SUPER_ADMIN from any key (here manage_users) returns 400. That
     endpoint authenticates via get_current_admin, so we override it.

IMPORTANT: require_permission calls app.core.permissions.can, which reads the
in-process policy cache. We call invalidate_cache() in setup so checks fall
back to DEFAULT_POLICY (manage_users -> {SUPER_ADMIN, ADMIN}).
"""
from types import SimpleNamespace

from fastapi.testclient import TestClient

from app.api import deps
from app.core.permissions import invalidate_cache
from app.db.session import get_db as session_get_db
from app.main import app
from app.models.user import UserRole


class _FakeScalarResult:
    """Mimics SQLAlchemy result.scalar_one_or_none()."""

    def __init__(self, value=None):
        self._value = value

    def scalar_one_or_none(self):
        return self._value


class _FakeDB:
    """Minimal async session stand-in. execute() returns a truthy sentinel
    so uniqueness checks behave deterministically; commit/refresh are no-ops."""

    def __init__(self) -> None:
        self.added = []
        self.committed = False

    async def execute(self, stmt):
        return _FakeScalarResult(value=True)

    def add(self, obj) -> None:
        self.added.append(obj)

    async def commit(self) -> None:
        self.committed = True

    async def refresh(self, obj) -> None:
        return None


def _make_user(role: UserRole) -> SimpleNamespace:
    return SimpleNamespace(
        id=7,
        username="tester",
        display_name="Tester",
        role=role,
    )


# ---------------------------------------------------------------------------
# require_permission(KEY_MANAGE_USERS) gate on POST /admin/users
# ---------------------------------------------------------------------------


def _override_users_endpoint(role: UserRole, fake_db: _FakeDB):
    """Wire overrides for the users-create endpoint. require_permission
    depends on deps.get_current_user, so that is what we inject."""
    invalidate_cache()

    async def _override_get_db():
        yield fake_db

    async def _override_get_current_user():
        return _make_user(role)

    app.dependency_overrides[session_get_db] = _override_get_db
    app.dependency_overrides[deps.get_current_user] = _override_get_current_user


def test_create_user_forbidden_for_agent():
    fake_db = _FakeDB()
    _override_users_endpoint(UserRole.AGENT, fake_db)

    client = TestClient(app)
    try:
        response = client.post(
            "/api/v1/admin/users",
            json={
                "username": "newagent",
                "password": "password123",
                "display_name": "New Agent",
                "role": "AGENT",
            },
        )
    finally:
        client.close()
        app.dependency_overrides.clear()
        invalidate_cache()

    assert response.status_code == 403


def test_create_user_not_forbidden_for_admin():
    """ADMIN holds manage_users, so the gate passes. The handler then runs
    its own logic (uniqueness check hits the fake truthy row -> 409), which
    is NOT a 403 — confirming the permission gate did not block ADMIN."""
    fake_db = _FakeDB()
    _override_users_endpoint(UserRole.ADMIN, fake_db)

    client = TestClient(app)
    try:
        response = client.post(
            "/api/v1/admin/users",
            json={
                "username": "newagent",
                "password": "password123",
                "display_name": "New Agent",
                "role": "AGENT",
            },
        )
    finally:
        client.close()
        app.dependency_overrides.clear()
        invalidate_cache()

    assert response.status_code != 403


# ---------------------------------------------------------------------------
# Lockout safeguard on PATCH /admin/settings/permissions
# ---------------------------------------------------------------------------


def test_patch_permissions_rejects_removing_super_admin():
    """Removing SUPER_ADMIN from manage_users must be rejected with 400.

    This endpoint authenticates via get_current_admin (not require_permission),
    so we override that. The lockout check fires before any DB write."""
    fake_db = _FakeDB()
    invalidate_cache()

    async def _override_get_db():
        yield fake_db

    async def _override_get_current_admin():
        return _make_user(UserRole.SUPER_ADMIN)

    app.dependency_overrides[session_get_db] = _override_get_db
    app.dependency_overrides[deps.get_current_admin] = _override_get_current_admin

    client = TestClient(app)
    try:
        response = client.patch(
            "/api/v1/admin/settings/permissions",
            json={
                "updates": [
                    {
                        "key": "manage_users",
                        "allowed_roles": ["ADMIN"],
                    }
                ]
            },
        )
    finally:
        client.close()
        app.dependency_overrides.clear()
        invalidate_cache()

    assert response.status_code == 400
    assert fake_db.committed is False


# ---------------------------------------------------------------------------
# P1.2a — SUPER_ADMIN lockout safeguard for the 3 access-gate keys.
# access_admin_endpoints IS locked (gate to settings UI); access_manager
# and access_staff are NOT locked (recoverable via the matrix endpoint
# which SUPER_ADMIN still reaches through access_admin_endpoints). The
# existing lockout guard (settings.py:176-180) rejects removing
# SUPER_ADMIN from ANY key, so all 3 will 400 -- but the design intent is
# that only access_admin_endpoints NEEDS the lock to prevent lockout.
# ---------------------------------------------------------------------------


def _patch_permissions_payload(key: str, allowed_roles: list[str]) -> dict:
    return {"updates": [{"key": key, "allowed_roles": allowed_roles}]}


def _patch_permissions_attempt(key: str, allowed_roles: list[str]) -> tuple:
    """Run a PATCH /permissions attempt as SUPER_ADMIN. Returns (status, committed)."""
    fake_db = _FakeDB()
    invalidate_cache()

    async def _override_get_db():
        yield fake_db

    async def _override_get_current_admin():
        return _make_user(UserRole.SUPER_ADMIN)

    app.dependency_overrides[session_get_db] = _override_get_db
    app.dependency_overrides[deps.get_current_admin] = _override_get_current_admin

    client = TestClient(app)
    try:
        response = client.patch(
            "/api/v1/admin/settings/permissions",
            json=_patch_permissions_payload(key, allowed_roles),
        )
    finally:
        client.close()
        app.dependency_overrides.clear()
        invalidate_cache()

    return response.status_code, fake_db.committed


def test_lockout_rejects_removing_super_admin_from_access_admin_endpoints():
    """access_admin_endpoints is the settings-UI gate. Removing SUPER_ADMIN
    would lock SUPER_ADMIN out of /permissions (the only recovery endpoint)
    -- the existing guard rejects the flip with 400."""
    status, committed = _patch_permissions_attempt(
        "access_admin_endpoints", ["ADMIN"]
    )
    assert status == 400
    assert committed is False


def test_lockout_also_rejects_removing_super_admin_from_access_manager():
    """The lockout guard fires for EVERY key (settings.py:176-180), not just
    access_admin_endpoints. Removing SUPER_ADMIN from access_manager also
    400s -- even though access_manager is not the settings-UI gate. This
    is the existing guard's blanket behavior; documenting it here."""
    status, committed = _patch_permissions_attempt(
        "access_manager_endpoints", ["ADMIN", "DIRECTOR", "HEAD"]
    )
    assert status == 400
    assert committed is False


def test_lockout_also_rejects_removing_super_admin_from_access_staff():
    """Same blanket guard for access_staff_endpoints."""
    status, committed = _patch_permissions_attempt(
        "access_staff_endpoints", ["ADMIN", "AGENT", "DIRECTOR", "HEAD"]
    )
    assert status == 400
    assert committed is False
