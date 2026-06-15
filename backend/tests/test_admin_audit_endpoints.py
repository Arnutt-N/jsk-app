"""Endpoint tests for admin audit log filters (GET /admin/audit/logs).

The endpoint builds its SELECT incrementally from optional query params.
These tests use a fake session that records every statement it receives,
so we can assert whether the resource_id criterion was (or wasn't)
attached — without a real database.

Assertions match "audit_logs.resource_id =" (with the trailing "=") because
the compiled SELECT always lists every column, so the bare column name
appears in the projection even when no filter was applied; only the WHERE
clause renders the comparison operator.
"""
from types import SimpleNamespace

from fastapi.testclient import TestClient

from app.api import deps
from app.main import app
from app.models.user import UserRole


class _FakeResult:
    def scalars(self):
        return self

    def all(self):
        return []


class _FakeAuditDB:
    """Records every statement so tests can assert on the compiled SQL."""

    def __init__(self) -> None:
        self.statements = []

    async def execute(self, stmt):
        self.statements.append(str(stmt))
        return _FakeResult()

    async def scalar(self, stmt):
        self.statements.append(str(stmt))
        return 0


def _patch_admin_overrides(fake_db: _FakeAuditDB):
    """Wire dependency overrides for the audit endpoint tests. Returns
    a teardown callable the test should invoke in a finally block."""

    async def _override_get_db():
        yield fake_db

    async def _override_get_current_admin():
        return SimpleNamespace(
            id=7,
            username="real-admin",
            display_name="Real Admin",
            role=UserRole.ADMIN,
        )

    # NOTE: admin_audit.py resolves its session via deps.get_db (not
    # app.db.session.get_db like admin_requests.py) — override that one,
    # or the endpoint connects to the real database.
    app.dependency_overrides[deps.get_db] = _override_get_db
    app.dependency_overrides[deps.get_current_admin] = _override_get_current_admin
    # Phase 3: the logs/stats routes are now gated by
    # require_permission(KEY_VIEW_AUDIT_LOG), which resolves the user via
    # deps.get_current_user — override that too so the gate sees an ADMIN.
    app.dependency_overrides[deps.get_current_user] = _override_get_current_admin

    def teardown():
        app.dependency_overrides.clear()

    return teardown


def test_logs_with_resource_id_adds_filter():
    fake_db = _FakeAuditDB()
    teardown = _patch_admin_overrides(fake_db)

    client = TestClient(app)
    try:
        response = client.get("/api/v1/admin/audit/logs?resource_id=42")
    finally:
        client.close()
        teardown()

    assert response.status_code == 200
    assert any("audit_logs.resource_id =" in s for s in fake_db.statements)

    payload = response.json()
    assert payload["total"] == 0
    assert payload["logs"] == []


def test_logs_without_resource_id_has_no_filter():
    fake_db = _FakeAuditDB()
    teardown = _patch_admin_overrides(fake_db)

    client = TestClient(app)
    try:
        response = client.get("/api/v1/admin/audit/logs")
    finally:
        client.close()
        teardown()

    assert response.status_code == 200
    assert not any("audit_logs.resource_id =" in s for s in fake_db.statements)


def test_logs_accepts_long_lookback_days():
    """Timeline หน้า request detail ใช้ days=3650 — bound ขยายจาก 90 แล้ว
    (default 7 ต้องไม่เปลี่ยน) ค่าเกิน bound ยังต้องถูกปัดตกที่ validation."""
    fake_db = _FakeAuditDB()
    teardown = _patch_admin_overrides(fake_db)

    client = TestClient(app)
    try:
        ok = client.get("/api/v1/admin/audit/logs?days=3650")
        too_long = client.get("/api/v1/admin/audit/logs?days=3651")
    finally:
        client.close()
        teardown()

    assert ok.status_code == 200
    assert too_long.status_code == 422
