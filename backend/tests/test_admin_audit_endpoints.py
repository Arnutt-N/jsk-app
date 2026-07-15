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
import json
from datetime import datetime, timezone
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import inspect as sa_inspect

from app.api import deps
from app.api.v1.endpoints import (
    admin_broadcast,
    admin_credentials,
    admin_integrations,
    admin_users,
    media,
    settings as settings_endpoints,
)
from app.core.permissions import invalidate_cache
from app.main import app
from app.models.audit_log import AuditLog
from app.models.credential import Credential, Provider
from app.models.media_file import FileCategory
from app.models.permission_setting import PermissionSetting
from app.models.user import UserRole
from app.schemas.credential import CredentialCreate, CredentialUpdate


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


def test_logs_filters_by_new_p03_action_name():
    """P0.3 added several new action names (create_user, delete_media, ...).
    This is FR3 case 5's smoke assertion: the generic `action` filter --
    already proven for `resource_id` above -- also wires up for one of the
    action strings this round of work introduces, so the audit viewer can
    find the new entries once they land."""
    fake_db = _FakeAuditDB()
    teardown = _patch_admin_overrides(fake_db)

    client = TestClient(app)
    try:
        response = client.get("/api/v1/admin/audit/logs?action=create_user")
    finally:
        client.close()
        teardown()

    assert response.status_code == 200
    assert any("audit_logs.action =" in s for s in fake_db.statements)


# ===========================================================================
# P0.3 privileged-audit-coverage tests
#
# Covers backend/.claude/PRPs/prds/p0.3-audit-coverage.prd.md FR3:
#   1. One success-mutation test per file (6 minimum).
#   2. One failure case -> zero new audit rows.
#   3. Redaction: sentinel secrets never land in `details`.
#   4. Transaction sharing: if the endpoint's own commit fails, nothing
#      durably persists (create_audit_log itself never commits).
#   5. Audit list endpoint smoke test -- see
#      test_logs_filters_by_new_p03_action_name above.
#
# All six endpoint files call the SAME `AsyncSession` shape (add / delete /
# commit / refresh / flush / execute / get), so one small in-memory fake
# covers every case -- mirroring the `_FakeDB` idiom already used in
# test_admin_requests_endpoints.py and test_media_endpoints.py.
# ===========================================================================


class _FakeQueryResult:
    """Mimics the subset of a SQLAlchemy Result the six endpoints use."""

    def __init__(self, value=None):
        self._value = value

    def scalar_one_or_none(self):
        return self._value

    def scalars(self):
        return self

    def all(self):
        return [self._value] if self._value is not None else []


class _RecordingDB:
    """Minimal AsyncSession stand-in for the P0.3 audit-coverage tests.

    Supports exactly the operations the six audited endpoint files (and the
    services/helpers they call: credential_service, broadcast_service,
    SettingsService) use against `db`: add / delete / commit / refresh /
    flush, `db.get(Model, id)`, and `db.execute(stmt)` returning one preset
    result. Every test targets a single row/query per call, same as the
    established `_FakeDB` pattern elsewhere in this test suite.
    """

    def __init__(self, execute_result=None, get_registry=None):
        self.added = []
        self.deleted = []
        self.commit_calls = 0
        self.flush_calls = 0
        self.commit_should_fail = False
        self._execute_result = execute_result
        self._get_registry = dict(get_registry or {})
        self._next_id = 999

    def add(self, obj) -> None:
        self.added.append(obj)

    async def delete(self, obj) -> None:
        self.deleted.append(obj)

    async def execute(self, stmt):
        return _FakeQueryResult(self._execute_result)

    async def get(self, model, id_):
        return self._get_registry.get(id_)

    async def commit(self) -> None:
        self.commit_calls += 1
        if self.commit_should_fail:
            raise RuntimeError("simulated commit failure")

    async def refresh(self, obj) -> None:
        if getattr(obj, "id", None) is None:
            obj.id = self._next_id
        self._apply_column_defaults(obj)

    def _apply_column_defaults(self, obj) -> None:
        """Best-effort emulation of SQLAlchemy's INSERT-time Python-side
        column defaults (`Column(..., default=X)`), since this fake bypasses
        the real flush/INSERT unit-of-work that normally applies them (e.g.
        Broadcast.total_recipients/success_count/failure_count default=0).
        Test-only helper -- does not touch production code."""
        try:
            mapper = sa_inspect(type(obj))
        except Exception:
            return
        for attr in mapper.column_attrs:
            column = attr.columns[0]
            if column.default is None or getattr(obj, attr.key, None) is not None:
                continue
            arg = column.default.arg
            if callable(arg):
                try:
                    value = arg()
                except TypeError:
                    value = arg(None)
            else:
                value = arg
            setattr(obj, attr.key, value)

    async def flush(self) -> None:
        self.flush_calls += 1
        for obj in self.added:
            if getattr(obj, "id", None) is None:
                obj.id = self._next_id

    def audit_rows(self):
        return [obj for obj in self.added if isinstance(obj, AuditLog)]


def _super_admin(admin_id: int = 1):
    return SimpleNamespace(id=admin_id, role=UserRole.SUPER_ADMIN, username="root-admin")


# ── 1a. admin_credentials.py -- success (create_credential) ───────────────


@pytest.mark.asyncio
async def test_create_credential_writes_one_audit_row():
    db = _RecordingDB()
    # _RecordingDB._apply_column_defaults() only emulates Python-side
    # `Column(default=...)` values; created_at/updated_at use
    # `server_default=func.now()` (a real-DB-only default), so the fake
    # never populates them. CredentialResponse now requires real datetime
    # values (unrelated to this PRD's metadata/credentials_masked fix), so
    # stamp them here the way a real INSERT + refresh would.
    _orig_refresh = db.refresh

    async def _refresh_with_timestamps(obj):
        await _orig_refresh(obj)
        now = datetime.now(timezone.utc)
        if getattr(obj, "created_at", None) is None:
            obj.created_at = now
        if getattr(obj, "updated_at", None) is None:
            obj.updated_at = now

    db.refresh = _refresh_with_timestamps
    admin = _super_admin(7)
    sentinel = "SENTINEL_CHANNEL_TOKEN_ABC123"

    payload = CredentialCreate(
        name="LINE Prod",
        provider=Provider.LINE,
        credentials={"channel_access_token": sentinel},
        is_active=True,
        is_default=False,
    )

    # CredentialResponse.model_validate(...) previously always failed
    # against a bare Credential ORM instance (see
    # .claude/PRPs/prds/fix-credential-response.prd.md, FIXED as of this
    # PR) -- `credential.metadata` resolved to SQLAlchemy's Base.metadata
    # registry instead of the JSONB column (mapped under `metadata_json`),
    # and `credentials_masked` had no default. Now that the schema aliases
    # `metadata` -> `metadata_json` for ORM validation and defaults
    # `credentials_masked`, the endpoint returns cleanly end-to-end.
    response = await admin_credentials.create_credential(request=payload, db=db, current_admin=admin)
    assert response.credentials_masked  # populated by the endpoint after validation
    assert response.name == "LINE Prod"

    rows = db.audit_rows()
    assert len(rows) == 1
    log = rows[0]
    assert log.admin_id == 7
    assert log.action == "create_credential"
    assert log.resource_type == "credential"
    assert log.resource_id == "999"  # assigned by the fake's db.refresh()
    # FR2: provider/name only -- never the secret value.
    assert sentinel not in json.dumps(log.details)
    assert log.details == {"provider": "LINE", "name": "LINE Prod"}
    # Persistence: 2 commits under the documented sequential-commit deviation
    # (credential_service commits the mutation, the endpoint commits the
    # audit row). A forgotten `await db.commit()` after the audit call would
    # drop this to 1 and fail here.
    assert db.commit_calls == 2


# ── 1b. admin_credentials.py -- redaction (update_credential) ─────────────


@pytest.mark.asyncio
async def test_update_credential_redacts_secret_value():
    # created_at/updated_at use server_default=func.now() (real-DB-only),
    # which _RecordingDB's fake refresh() doesn't emulate; set them here so
    # CredentialResponse's required datetime fields validate, same as a
    # real row already persisted at id=5 would have.
    _now = datetime.now(timezone.utc)
    existing = Credential(
        id=5, name="LINE Prod", provider=Provider.LINE.value,
        credentials="placeholder-encrypted-blob", is_active=True, is_default=False,
        created_at=_now, updated_at=_now,
    )
    db = _RecordingDB(get_registry={5: existing})
    admin = _super_admin(7)
    sentinel = "SENTINEL_ROTATED_TOKEN_XYZ"

    payload = CredentialUpdate(credentials={"channel_access_token": sentinel})
    # Same CredentialResponse.model_validate(...) bug noted in
    # test_create_credential_writes_one_audit_row above -- now FIXED (see
    # .claude/PRPs/prds/fix-credential-response.prd.md), so this asserts
    # clean success end-to-end instead of tolerating the ValidationError.
    response = await admin_credentials.update_credential(id=5, request=payload, db=db, current_admin=admin)
    assert response.credentials_masked  # populated by the endpoint after validation

    rows = db.audit_rows()
    assert len(rows) == 1
    log = rows[0]
    assert log.action == "update_credential"
    assert log.resource_id == "5"
    # Field NAMES only -- the sentinel value must never appear.
    assert log.details == {"changed_fields": ["credentials"]}
    assert sentinel not in json.dumps(log.details)
    # Persistence: sequential-commit deviation -- mutation commit (service)
    # + audit commit (endpoint).
    assert db.commit_calls == 2


# ── 2. Failure case -> zero audit rows (update non-existent credential) ───


@pytest.mark.asyncio
async def test_update_missing_credential_404_writes_no_audit_row():
    db = _RecordingDB(get_registry={})  # credential_service.update_credential -> None
    admin = _super_admin(7)

    with pytest.raises(HTTPException) as exc:
        await admin_credentials.update_credential(
            id=999, request=CredentialUpdate(name="x"), db=db, current_admin=admin,
        )

    assert exc.value.status_code == 404
    assert db.audit_rows() == []
    assert db.commit_calls == 0  # nothing persisted on the failure path


# ── 1c. admin_integrations.py -- success (create_integration) ─────────────


@pytest.mark.asyncio
async def test_create_integration_writes_one_audit_row():
    db = _RecordingDB()
    admin = _super_admin(3)
    sentinel = "SENTINEL_INTEGRATION_API_KEY_999"

    payload = admin_integrations.IntegrationIn(
        name="Ops Webhook",
        integration_type="webhook",
        url="https://example.com/hook",
        api_key=sentinel,
    )

    await admin_integrations.create_integration(body=payload, db=db, current_admin=admin)

    rows = db.audit_rows()
    assert len(rows) == 1
    log = rows[0]
    assert log.admin_id == 3
    assert log.action == "create_integration"
    assert log.resource_type == "integration"
    assert log.details == {"name": "Ops Webhook", "integration_type": "webhook"}
    assert sentinel not in json.dumps(log.details)
    # Persistence: endpoint owns its commit -- audit + mutation share it.
    assert db.commit_calls == 1


# ── 1d. settings.py -- success (update_permissions) ────────────────────────


@pytest.mark.asyncio
async def test_update_permissions_writes_one_audit_row_with_role_transition():
    invalidate_cache()
    try:
        existing_row = PermissionSetting(
            key="assign_request",
            allowed_roles=["SUPER_ADMIN", "ADMIN"],
            description="มอบหมายคำร้อง",
        )
        db = _RecordingDB(execute_result=existing_row)
        admin = _super_admin(9)

        body = settings_endpoints.PermissionUpdate(
            updates=[
                settings_endpoints.PermissionRule(
                    key="assign_request",
                    allowed_roles=["SUPER_ADMIN", "ADMIN", "DIRECTOR"],
                    description=None,
                )
            ]
        )

        await settings_endpoints.update_permissions(body=body, db=db, current_admin=admin)

        rows = db.audit_rows()
        assert len(rows) == 1
        log = rows[0]
        assert log.admin_id == 9
        assert log.action == "update_permissions"
        assert log.resource_type == "permission_matrix"
        assert log.details == {
            "changes": [
                {
                    "key": "assign_request",
                    "from": ["SUPER_ADMIN", "ADMIN"],
                    "to": ["SUPER_ADMIN", "ADMIN", "DIRECTOR"],
                }
            ]
        }
        # Persistence: single shared commit covering matrix rows + audit row.
        assert db.commit_calls == 1
    finally:
        invalidate_cache()


# ── 1e. admin_users.py -- success (create_user) ────────────────────────────


@pytest.mark.asyncio
async def test_create_user_writes_one_audit_row():
    db = _RecordingDB(execute_result=None)  # username/email uniqueness checks -> no conflict
    admin = _super_admin(1)

    payload = admin_users.UserCreateRequest(
        username="new_agent",
        password="StrongPassword123",
        display_name="New Agent",
        role=UserRole.AGENT,
    )

    response = await admin_users.create_user(body=payload, db=db, current_admin=admin)

    rows = db.audit_rows()
    assert len(rows) == 1
    log = rows[0]
    assert log.admin_id == 1
    assert log.action == "create_user"
    assert log.resource_type == "user"
    assert log.resource_id == str(response.id)
    assert log.details == {"username": "new_agent", "role": "AGENT"}
    # Persistence: single shared commit covering user row + audit row.
    assert db.commit_calls == 1


# ── 1e (redaction). admin_users.py -- reset_password ───────────────────────


@pytest.mark.asyncio
async def test_reset_password_redacts_new_password_value():
    target_user = SimpleNamespace(id=55, username="agent_y", hashed_password="old-hash")
    db = _RecordingDB(execute_result=target_user)
    admin = _super_admin(1)
    sentinel = "SUPER_SECRET_NEW_PW_000"

    await admin_users.reset_password(
        user_id=55,
        body=admin_users.ResetPasswordRequest(new_password=sentinel),
        db=db,
        current_admin=admin,
    )

    rows = db.audit_rows()
    assert len(rows) == 1
    log = rows[0]
    assert log.action == "reset_password"
    assert log.resource_type == "user"
    assert log.resource_id == "55"
    assert log.details == {"username": "agent_y"}
    assert sentinel not in json.dumps(log.details)
    # Persistence: single shared commit covering password change + audit row.
    assert db.commit_calls == 1


# ── 4. Transaction sharing: failing final commit -> nothing durably lands ─


@pytest.mark.asyncio
async def test_reset_password_commit_failure_means_no_durable_audit_row():
    """FR1 mechanism check: create_audit_log() only stages + flushes the
    AuditLog row on the shared session -- it never calls db.commit() on its
    own (see app/core/audit.py). The endpoint's own single, final
    `await db.commit()` is what durably persists BOTH the password change
    and the audit row together. If that commit fails (simulated here via a
    FakeDB whose commit() raises), a real Postgres session rolls back the
    whole transaction -- dropping the staged AuditLog row along with the
    password change. This test proves there is exactly one commit call
    covering both writes, so a failure there really does leave zero durable
    audit rows (not a second, audit-only commit that could succeed alone)."""
    target_user = SimpleNamespace(id=42, username="agent_x", hashed_password="old-hash")
    db = _RecordingDB(execute_result=target_user)
    db.commit_should_fail = True
    admin = _super_admin(1)

    with pytest.raises(RuntimeError):
        await admin_users.reset_password(
            user_id=42,
            body=admin_users.ResetPasswordRequest(new_password="NewSentinelPass123"),
            db=db,
            current_admin=admin,
        )

    # The row was staged (add + flush inside create_audit_log) before the
    # single failing commit -- proving audit and mutation share one
    # transaction boundary, not that it was ever durably persisted.
    assert len(db.audit_rows()) == 1
    assert db.commit_calls == 1


# ── 1f. media.py -- success (delete_media) ─────────────────────────────────


@pytest.mark.asyncio
async def test_delete_media_writes_one_audit_row():
    media_file = SimpleNamespace(id=uuid4(), filename="report.pdf", category=FileCategory.DOCUMENT)
    db = _RecordingDB(execute_result=media_file)
    admin = _super_admin(2)

    await media.delete_media(media_id=media_file.id, db=db, _admin=admin)

    rows = db.audit_rows()
    assert len(rows) == 1
    log = rows[0]
    assert log.admin_id == 2
    assert log.action == "delete_media"
    assert log.resource_type == "media_file"
    assert log.resource_id == str(media_file.id)
    assert log.details == {"filename": "report.pdf", "category": "DOCUMENT"}
    # Persistence: single shared commit covering delete + audit row.
    assert db.commit_calls == 1


# ── 1g. media.py -- bulk_delete_media ───────────────────────────────────────


@pytest.mark.asyncio
async def test_bulk_delete_media_writes_one_audit_row_with_count():
    media_file = SimpleNamespace(id=uuid4(), filename="a.pdf", category=FileCategory.DOCUMENT)
    db = _RecordingDB(execute_result=media_file)
    admin = _super_admin(2)
    ids = [str(uuid4()), str(uuid4())]

    response = await media.bulk_delete_media(body={"ids": ids}, db=db, _admin=admin)

    assert response["deleted"] == 2
    rows = db.audit_rows()
    assert len(rows) == 1
    log = rows[0]
    assert log.action == "bulk_delete_media"
    assert log.resource_type == "media_file"
    assert log.resource_id == "bulk"
    assert log.details["count"] == 2
    assert len(log.details["ids"]) == 2
    # Persistence: single shared commit covering deletes + audit row.
    assert db.commit_calls == 1


# ── 1h. admin_broadcast.py -- success (create_broadcast) ───────────────────


@pytest.mark.asyncio
async def test_create_broadcast_writes_one_audit_row():
    db = _RecordingDB()
    admin = _super_admin(4)

    payload = admin_broadcast.BroadcastCreate(title="Weekly Update", content={"text": "hello"})
    response = await admin_broadcast.create_broadcast(payload=payload, db=db, current_admin=admin)

    rows = db.audit_rows()
    assert len(rows) == 1
    log = rows[0]
    assert log.admin_id == 4
    assert log.action == "create_broadcast"
    assert log.resource_type == "broadcast"
    assert log.resource_id == str(response.id)
    assert log.details == {"title": "Weekly Update", "status": "draft"}
    # Persistence: 2 commits under the documented sequential-commit deviation
    # (broadcast_service commits the mutation, the endpoint commits the
    # audit row).
    assert db.commit_calls == 2


# ── 1i. settings.py -- update_system_setting fail-closed value redaction ───
#
# Review finding O1: a substring denylist (TOKEN/SECRET/...) fails OPEN --
# keys like "webhook_url" or "authorization" would get their values logged
# in full. The rule is now an explicit allowlist (_NON_SECRET_SETTING_KEYS):
# every value is redacted to {"key", "value_changed": true} unless the key
# is known non-secret.


async def _post_setting(db, admin, key, value):
    from app.schemas.rich_menu import SystemSettingBase

    return await settings_endpoints.update_setting(
        setting_data=SystemSettingBase(key=key, value=value, description=None),
        db=db,
        current_admin=admin,
    )


@pytest.mark.asyncio
async def test_update_setting_webhook_url_value_is_redacted():
    """Keys that dodge the old substring denylist must still be redacted."""
    db = _RecordingDB(execute_result=None)  # no existing row -> insert path
    admin = _super_admin(6)
    sentinel = "https://user:s3cr3t-SENTINEL@host/hook"

    await _post_setting(db, admin, "webhook_url", sentinel)

    rows = db.audit_rows()
    assert len(rows) == 1
    log = rows[0]
    assert log.action == "update_system_setting"
    assert log.resource_type == "system_setting"
    assert log.details == {"key": "webhook_url", "value_changed": True}
    assert sentinel not in json.dumps(log.details)
    # Persistence: sequential-commit deviation -- SettingsService commits
    # the setting, the endpoint commits the audit row.
    assert db.commit_calls == 2


@pytest.mark.asyncio
async def test_update_setting_authorization_value_is_redacted():
    db = _RecordingDB(execute_result=None)
    admin = _super_admin(6)
    sentinel = "Bearer SENTINEL_BEARER_VALUE_42"

    await _post_setting(db, admin, "authorization", sentinel)

    rows = db.audit_rows()
    assert len(rows) == 1
    assert rows[0].details == {"key": "authorization", "value_changed": True}
    assert sentinel not in json.dumps(rows[0].details)


@pytest.mark.asyncio
async def test_update_setting_allowlisted_key_logs_value():
    """HANDOFF_KEYWORDS is on the explicit non-secret allowlist -- its value
    is display/behavior config already shown verbatim in the admin UI, so
    the audit row keeps it for reviewability."""
    db = _RecordingDB(execute_result=None)
    admin = _super_admin(6)

    await _post_setting(db, admin, "HANDOFF_KEYWORDS", "ติดต่อเจ้าหน้าที่,คุยกับคน")

    rows = db.audit_rows()
    assert len(rows) == 1
    assert rows[0].details == {
        "key": "HANDOFF_KEYWORDS",
        "value": "ติดต่อเจ้าหน้าที่,คุยกับคน",
    }
    assert db.commit_calls == 2


@pytest.mark.asyncio
async def test_update_setting_line_token_value_is_redacted():
    """The one secret key PROVEN to flow through this endpoint (the LINE
    settings page POSTs it) never lands in details."""
    db = _RecordingDB(execute_result=None)
    admin = _super_admin(6)
    sentinel = "SENTINEL_LINE_CHANNEL_TOKEN_XYZ"

    await _post_setting(db, admin, "LINE_CHANNEL_ACCESS_TOKEN", sentinel)

    rows = db.audit_rows()
    assert len(rows) == 1
    assert rows[0].details == {"key": "LINE_CHANNEL_ACCESS_TOKEN", "value_changed": True}
    assert sentinel not in json.dumps(rows[0].details)
