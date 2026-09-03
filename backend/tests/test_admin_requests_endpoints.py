"""Endpoint tests for admin request comment behavior."""
from datetime import datetime, timezone
from types import SimpleNamespace

from fastapi.testclient import TestClient

from app.api import deps
from app.db.session import get_db as session_get_db
from app.main import app
from app.models.audit_log import AuditLog
from app.models.service_request import RequestStatus
from app.models.user import UserRole


class _FakeScalarResult:
    """Mimics SQLAlchemy result.scalar_one_or_none()."""
    def __init__(self, value=None):
        self._value = value
    def scalar_one_or_none(self):
        return self._value


class _FakeListResult:
    def __init__(self, rows):
        self._rows = rows

    def all(self):
        return self._rows


class _FakeDB:
    def __init__(self) -> None:
        self.added = []
        self.committed = False
        self._fake_request = None
        self._fake_list_rows = None
        self.last_stmt = None

    async def execute(self, stmt):
        self.last_stmt = stmt
        if self._fake_list_rows is not None:
            return _FakeListResult(rows=self._fake_list_rows)
        if self._fake_request is not None:
            return _FakeScalarResult(value=self._fake_request)
        return _FakeScalarResult(value=True)

    def add(self, obj) -> None:
        self.added.append(obj)

    async def commit(self) -> None:
        self.committed = True

    async def refresh(self, obj) -> None:
        # Pre-existing behavior: stamp create-time defaults on freshly
        # added comment rows so the response payload looks realistic.
        # For revert tests, we pre-populate `_fake_request` with all
        # the fields we care about, so refresh becomes a near no-op.
        if obj is self._fake_request:
            # ...except for server-side defaults. The handler assigns
            # `completed_at = func.now()`, a SQL expression the real
            # session resolves to a datetime on refresh. Mirror that,
            # otherwise response validation chokes on the raw expression
            # for any transition INTO COMPLETED.
            completed_at = getattr(obj, "completed_at", None)
            if completed_at is not None and not isinstance(completed_at, datetime):
                obj.completed_at = datetime(2026, 8, 5, 12, 0, tzinfo=timezone.utc)
            return None
        obj.id = 501
        obj.created_at = datetime(2026, 3, 13, 12, 0, tzinfo=timezone.utc)
        obj.updated_at = None

    async def flush(self) -> None:
        # app.core.audit.create_audit_log calls `await db.flush()` to
        # surface the audit row's ID. The real session does the SQL
        # round-trip; in the fake we just no-op because the AuditLog
        # instance is already in self.added (which is what we assert on).
        return None


def test_create_comment_ignores_forged_user_id_query_param():
    fake_db = _FakeDB()

    async def _override_get_db():
        yield fake_db

    async def _override_get_current_admin():
        return SimpleNamespace(
            id=7,
            username="real-admin",
            display_name="Real Admin",
            role=UserRole.ADMIN,
        )

    app.dependency_overrides[session_get_db] = _override_get_db
    app.dependency_overrides[deps.get_current_admin] = _override_get_current_admin
    app.dependency_overrides[deps.get_current_manager] = _override_get_current_admin

    client = TestClient(app)
    try:
        response = client.post(
            "/api/v1/admin/requests/42/comments?user_id=999",
            json={"content": "internal note"},
        )
    finally:
        client.close()
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert fake_db.committed is True
    assert len(fake_db.added) == 1
    assert fake_db.added[0].request_id == 42
    assert fake_db.added[0].user_id == 7

    payload = response.json()
    assert payload["request_id"] == 42
    assert payload["user_id"] == 7
    assert payload["display_name"] == "Real Admin"


# ---------------------------------------------------------------------------
# Revert-from-COMPLETED tests (PRD B). The handler in
# admin_requests.update_request now:
#   1. Detects status=COMPLETED -> {AWAITING_APPROVAL, IN_PROGRESS}
#   2. Resets request.completed_at to None
#   3. Writes an audit_log row with action="revert_approval"
# A forward transition (e.g. IN_PROGRESS -> AWAITING_APPROVAL via the
# normal "ส่งอนุมัติ" button) must NOT produce an audit_log row from
# this path.
# ---------------------------------------------------------------------------


def _build_completed_request(request_id: int = 42) -> SimpleNamespace:
    """Return a SimpleNamespace mirroring a SQLAlchemy ServiceRequest row
    in COMPLETED state. Only the fields read or mutated by
    update_request need to be present."""
    return SimpleNamespace(
        id=request_id,
        status=RequestStatus.COMPLETED,
        completed_at=datetime(2026, 5, 14, 12, 0, tzinfo=timezone.utc),
        priority="LOW",
        due_date=None,
        assigned_agent_id=None,
        assigned_by_id=None,
    )


def _build_in_progress_request(request_id: int = 43) -> SimpleNamespace:
    """Return a SimpleNamespace mirroring an IN_PROGRESS request — used
    by the negative test for the forward path."""
    return SimpleNamespace(
        id=request_id,
        status=RequestStatus.IN_PROGRESS,
        completed_at=None,
        priority="LOW",
        due_date=None,
        assigned_agent_id=None,
        assigned_by_id=None,
    )


def _patch_admin_overrides(fake_db: _FakeDB):
    """Wire dependency overrides for the PATCH endpoint tests. Returns
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

    app.dependency_overrides[session_get_db] = _override_get_db
    app.dependency_overrides[deps.get_current_admin] = _override_get_current_admin
    app.dependency_overrides[deps.get_current_manager] = _override_get_current_admin

    def teardown():
        app.dependency_overrides.clear()

    return teardown


def test_revert_completed_to_awaiting_approval_logs_audit():
    fake_db = _FakeDB()
    fake_db._fake_request = _build_completed_request()
    teardown = _patch_admin_overrides(fake_db)

    client = TestClient(app)
    try:
        response = client.patch(
            "/api/v1/admin/requests/42",
            json={"status": "AWAITING_APPROVAL"},
        )
    finally:
        client.close()
        teardown()

    assert response.status_code == 200
    assert fake_db.committed is True

    # Handler mutated the same object — verify in-memory state.
    assert fake_db._fake_request.status == RequestStatus.AWAITING_APPROVAL
    assert fake_db._fake_request.completed_at is None

    # Exactly one audit row landed in fake_db.added with the right shape.
    audit_rows = [obj for obj in fake_db.added if isinstance(obj, AuditLog)]
    assert len(audit_rows) == 1
    log = audit_rows[0]
    assert log.action == "revert_approval"
    assert log.resource_type == "service_request"
    assert log.resource_id == "42"
    assert log.admin_id == 7
    assert log.details == {
        "from_status": "COMPLETED",
        "to_status": "AWAITING_APPROVAL",
        "notes": None,
    }


def test_revert_completed_to_in_progress_logs_audit():
    fake_db = _FakeDB()
    fake_db._fake_request = _build_completed_request(request_id=44)
    teardown = _patch_admin_overrides(fake_db)

    client = TestClient(app)
    try:
        response = client.patch(
            "/api/v1/admin/requests/44",
            json={"status": "IN_PROGRESS"},
        )
    finally:
        client.close()
        teardown()

    assert response.status_code == 200
    assert fake_db._fake_request.status == RequestStatus.IN_PROGRESS
    assert fake_db._fake_request.completed_at is None

    audit_rows = [obj for obj in fake_db.added if isinstance(obj, AuditLog)]
    assert len(audit_rows) == 1
    assert audit_rows[0].details == {
        "from_status": "COMPLETED",
        "to_status": "IN_PROGRESS",
        "notes": None,
    }


def test_forward_transition_does_not_log_revert_audit():
    """A normal IN_PROGRESS -> AWAITING_APPROVAL via "ส่งอนุมัติ" must
    NOT produce a revert_approval audit row — the revert path only
    triggers when leaving a COMPLETED row.

    It does now produce a `status_change` row (HIGH-2): every transition
    is recorded, but under the action that describes it.
    """
    fake_db = _FakeDB()
    fake_db._fake_request = _build_in_progress_request()
    teardown = _patch_admin_overrides(fake_db)

    client = TestClient(app)
    try:
        response = client.patch(
            "/api/v1/admin/requests/43",
            json={"status": "AWAITING_APPROVAL"},
        )
    finally:
        client.close()
        teardown()

    assert response.status_code == 200
    assert fake_db._fake_request.status == RequestStatus.AWAITING_APPROVAL

    audit_rows = [obj for obj in fake_db.added if isinstance(obj, AuditLog)]
    assert [row.action for row in audit_rows] == ["status_change"]


def test_unassign_request_clears_assigned_agent():
    fake_db = _FakeDB()
    fake_request = SimpleNamespace(
        id=42,
        status=RequestStatus.IN_PROGRESS,
        completed_at=None,
        priority="LOW",
        due_date=None,
        assigned_agent_id=5,
        assigned_by_id=7,
    )
    fake_db._fake_request = fake_request
    teardown = _patch_admin_overrides(fake_db)

    client = TestClient(app)
    try:
        response = client.patch(
            "/api/v1/admin/requests/42",
            json={"unassign": True},
        )
    finally:
        client.close()
        teardown()

    assert response.status_code == 200
    assert fake_db.committed is True
    assert fake_request.assigned_agent_id is None
    assert fake_request.assigned_by_id is None


def test_unassign_request_forbidden_for_agent_role():
    fake_db = _FakeDB()
    fake_request = SimpleNamespace(
        id=42,
        status=RequestStatus.IN_PROGRESS,
        completed_at=None,
        priority="LOW",
        due_date=None,
        assigned_agent_id=5,
        assigned_by_id=7,
    )
    fake_db._fake_request = fake_request

    async def _override_get_db():
        yield fake_db

    async def _override_get_current_admin():
        return SimpleNamespace(
            id=3,
            username="agent-user",
            display_name="Agent User",
            role=UserRole.AGENT,
        )

    app.dependency_overrides[session_get_db] = _override_get_db
    app.dependency_overrides[deps.get_current_admin] = _override_get_current_admin
    app.dependency_overrides[deps.get_current_manager] = _override_get_current_admin

    client = TestClient(app)
    try:
        response = client.patch(
            "/api/v1/admin/requests/42",
            json={"unassign": True},
        )
    finally:
        client.close()
        app.dependency_overrides.clear()

    assert response.status_code == 403
    assert fake_request.assigned_agent_id == 5  # unchanged


# ---------------------------------------------------------------------------
# Details/contact tab edit tests (request-detail edit feature, Phase 1).
# The PATCH handler now accepts 12 new optional fields and applies them
# with "None = no update" semantics, plus recomputes requester_name
# whenever any of prefix/firstname/lastname is present in the payload.
# ---------------------------------------------------------------------------


def _build_editable_request(request_id: int = 50) -> SimpleNamespace:
    """A PENDING request carrying all editable details/contact fields."""
    return SimpleNamespace(
        id=request_id,
        status=RequestStatus.PENDING,
        completed_at=None,
        priority="LOW",
        due_date=None,
        assigned_agent_id=None,
        assigned_by_id=None,
        topic_category="ร้องเรียน/ร้องทุกข์",
        topic_subcategory="เดิม",
        description="รายละเอียดเดิม",
        prefix="นาย",
        firstname="สมชาย",
        lastname="ใจดี",
        requester_name="นาย สมชาย ใจดี",
        phone_number="0812345678",
        email="somchai@example.com",
        sub_district="ในเมือง",
        district="เมือง",
        province="ขอนแก่น",
        agency="อบต.ตัวอย่าง",
    )


def test_update_details_fields_applied():
    fake_db = _FakeDB()
    fake_request = _build_editable_request()
    fake_db._fake_request = fake_request
    teardown = _patch_admin_overrides(fake_db)

    client = TestClient(app)
    try:
        response = client.patch(
            "/api/v1/admin/requests/50",
            json={
                "topic_category": "แจ้งเบาะแสยาเสพติด",
                "topic_subcategory": "ปัญหายาเสพติด",
                "description": "รายละเอียดใหม่",
            },
        )
    finally:
        client.close()
        teardown()

    assert response.status_code == 200
    assert fake_db.committed is True
    assert fake_request.topic_category == "แจ้งเบาะแสยาเสพติด"
    assert fake_request.topic_subcategory == "ปัญหายาเสพติด"
    assert fake_request.description == "รายละเอียดใหม่"
    # Untouched fields keep their values (None = no update semantics).
    assert fake_request.firstname == "สมชาย"
    assert fake_request.requester_name == "นาย สมชาย ใจดี"


def test_update_contact_fields_applied():
    fake_db = _FakeDB()
    fake_request = _build_editable_request(request_id=51)
    fake_db._fake_request = fake_request
    teardown = _patch_admin_overrides(fake_db)

    client = TestClient(app)
    try:
        response = client.patch(
            "/api/v1/admin/requests/51",
            json={
                "phone_number": "0899999999",
                "email": "new@example.com",
                "agency": "เทศบาลใหม่",
                "province": "เชียงใหม่",
                "district": "เมืองเชียงใหม่",
                "sub_district": "ช้างคลาน",
            },
        )
    finally:
        client.close()
        teardown()

    assert response.status_code == 200
    assert fake_request.phone_number == "0899999999"
    assert fake_request.email == "new@example.com"
    assert fake_request.agency == "เทศบาลใหม่"
    assert fake_request.province == "เชียงใหม่"
    assert fake_request.district == "เมืองเชียงใหม่"
    assert fake_request.sub_district == "ช้างคลาน"
    # Contact-only update must not touch the name fields.
    assert fake_request.requester_name == "นาย สมชาย ใจดี"


def test_update_name_field_recomputes_requester_name():
    """Changing only firstname must rebuild requester_name from the
    already-updated prefix/firstname/lastname on the row."""
    fake_db = _FakeDB()
    fake_request = _build_editable_request(request_id=52)
    fake_db._fake_request = fake_request
    teardown = _patch_admin_overrides(fake_db)

    client = TestClient(app)
    try:
        response = client.patch(
            "/api/v1/admin/requests/52",
            json={"firstname": "สมหญิง"},
        )
    finally:
        client.close()
        teardown()

    assert response.status_code == 200
    assert fake_request.firstname == "สมหญิง"
    assert fake_request.requester_name == "นาย สมหญิง ใจดี"


def test_update_all_name_fields_recomputes_requester_name():
    fake_db = _FakeDB()
    fake_request = _build_editable_request(request_id=53)
    fake_db._fake_request = fake_request
    teardown = _patch_admin_overrides(fake_db)

    client = TestClient(app)
    try:
        response = client.patch(
            "/api/v1/admin/requests/53",
            json={"prefix": "นาง", "firstname": "สมหญิง", "lastname": "ใจงาม"},
        )
    finally:
        client.close()
        teardown()

    assert response.status_code == 200
    assert fake_request.requester_name == "นาง สมหญิง ใจงาม"


def test_update_without_name_fields_keeps_requester_name():
    """A details-only PATCH must not trigger the recompute path."""
    fake_db = _FakeDB()
    fake_request = _build_editable_request(request_id=54)
    fake_db._fake_request = fake_request
    teardown = _patch_admin_overrides(fake_db)

    client = TestClient(app)
    try:
        response = client.patch(
            "/api/v1/admin/requests/54",
            json={"description": "อัปเดตรายละเอียดอย่างเดียว"},
        )
    finally:
        client.close()
        teardown()

    assert response.status_code == 200
    assert fake_request.requester_name == "นาย สมชาย ใจดี"


def test_clearing_prefix_with_empty_string_recomputes_name():
    """Accepted PATCH semantic: empty string = intentional clear. The
    recompute drops blank parts, so requester_name omits the prefix."""
    fake_db = _FakeDB()
    fake_request = _build_editable_request(request_id=55)
    fake_db._fake_request = fake_request
    teardown = _patch_admin_overrides(fake_db)

    client = TestClient(app)
    try:
        response = client.patch(
            "/api/v1/admin/requests/55",
            json={"prefix": ""},
        )
    finally:
        client.close()
        teardown()

    assert response.status_code == 200
    assert fake_request.prefix == ""
    assert fake_request.requester_name == "สมชาย ใจดี"


def test_assign_request_still_works_after_refactor():
    """Regression test: normal assign via assigned_agent_id still works."""
    fake_db = _FakeDB()
    fake_request = SimpleNamespace(
        id=42,
        status=RequestStatus.PENDING,
        completed_at=None,
        priority="LOW",
        due_date=None,
        assigned_agent_id=None,
        assigned_by_id=None,
    )
    fake_db._fake_request = fake_request
    teardown = _patch_admin_overrides(fake_db)

    client = TestClient(app)
    try:
        response = client.patch(
            "/api/v1/admin/requests/42",
            json={"assigned_agent_id": 5},
        )
    finally:
        client.close()
        teardown()

    assert response.status_code == 200
    assert fake_db.committed is True
    assert fake_request.assigned_agent_id == 5
    assert fake_request.assigned_by_id == 7  # recorded by current_admin id


# ---------------------------------------------------------------------------
# Manager-tier (DIRECTOR/HEAD) access tests (Phase 1 — dead-policy fix).
# DIRECTOR/HEAD now reach request endpoints via get_current_manager.
# DEFAULT_POLICY grants them assign/self-assign but NOT revert_approval
# or edit_request_details, so the inner can_* guards must still fire.
# ---------------------------------------------------------------------------


def _patch_manager_overrides(fake_db, role=UserRole.DIRECTOR):
    """Override deps with a manager-tier role (DIRECTOR or HEAD)."""

    async def _override_get_db():
        yield fake_db

    async def _override_get_current_manager():
        return SimpleNamespace(
            id=9,
            username="director-user",
            display_name="Director User",
            role=role,
        )

    app.dependency_overrides[session_get_db] = _override_get_db
    app.dependency_overrides[deps.get_current_admin] = _override_get_current_manager
    app.dependency_overrides[deps.get_current_manager] = _override_get_current_manager

    def _teardown():
        app.dependency_overrides.clear()

    return _teardown


def test_director_can_assign_request():
    """DIRECTOR passes the manager gate AND can_assign() -> assignment succeeds.

    Before the fix DIRECTOR was blocked at get_current_admin and never
    reached can_assign — the policy that granted DIRECTOR assign rights
    was dead.
    """
    fake_db = _FakeDB()
    fake_request = SimpleNamespace(
        id=70,
        status=RequestStatus.PENDING,
        completed_at=None,
        priority="LOW",
        due_date=None,
        assigned_agent_id=None,
        assigned_by_id=None,
    )
    fake_db._fake_request = fake_request
    teardown = _patch_manager_overrides(fake_db, role=UserRole.DIRECTOR)

    client = TestClient(app)
    try:
        response = client.patch(
            "/api/v1/admin/requests/70",
            json={"assigned_agent_id": 5},
        )
    finally:
        client.close()
        teardown()

    assert response.status_code == 200
    assert fake_request.assigned_agent_id == 5


def test_head_revert_approval_forbidden():
    """HEAD reaches the endpoint (manager gate) but can_revert_approval()
    is False in the default policy -> revert is blocked with 403."""
    fake_db = _FakeDB()
    fake_db._fake_request = _build_completed_request(request_id=71)
    teardown = _patch_manager_overrides(fake_db, role=UserRole.HEAD)

    client = TestClient(app)
    try:
        response = client.patch(
            "/api/v1/admin/requests/71",
            json={"status": "AWAITING_APPROVAL"},
        )
    finally:
        client.close()
        teardown()

    assert response.status_code == 403
    assert fake_db._fake_request.status == RequestStatus.COMPLETED  # unchanged


# ---------------------------------------------------------------------------
# edit_request_details permission guard (Phase 1).
# Details/contact field edits require can_edit_request_details(); the
# default policy grants it to SUPER_ADMIN/ADMIN only. Workflow-only
# PATCHes (status / assignment / priority) must not hit the guard.
# ---------------------------------------------------------------------------


def _patch_agent_overrides(fake_db):
    """Override deps with an AGENT-role admin (no edit_request_details)."""

    async def _override_get_db():
        yield fake_db

    async def _override_get_current_admin():
        return SimpleNamespace(
            id=3,
            username="agent-user",
            display_name="Agent User",
            role=UserRole.AGENT,
        )

    app.dependency_overrides[session_get_db] = _override_get_db
    app.dependency_overrides[deps.get_current_admin] = _override_get_current_admin
    app.dependency_overrides[deps.get_current_manager] = _override_get_current_admin

    def _teardown():
        app.dependency_overrides.clear()

    return _teardown


def test_edit_details_forbidden_for_agent_role():
    fake_db = _FakeDB()
    fake_request = _build_editable_request(request_id=60)
    fake_db._fake_request = fake_request
    teardown = _patch_agent_overrides(fake_db)

    client = TestClient(app)
    try:
        response = client.patch(
            "/api/v1/admin/requests/60",
            json={"description": "แก้โดยไม่มีสิทธิ์"},
        )
    finally:
        client.close()
        teardown()

    assert response.status_code == 403
    assert fake_request.description == "รายละเอียดเดิม"  # unchanged


def test_edit_contact_forbidden_for_agent_role():
    fake_db = _FakeDB()
    fake_request = _build_editable_request(request_id=61)
    fake_db._fake_request = fake_request
    teardown = _patch_agent_overrides(fake_db)

    client = TestClient(app)
    try:
        response = client.patch(
            "/api/v1/admin/requests/61",
            json={"phone_number": "0999999999"},
        )
    finally:
        client.close()
        teardown()

    assert response.status_code == 403
    assert fake_request.phone_number == "0812345678"  # unchanged


def test_workflow_patch_not_blocked_by_details_guard_for_agent():
    """Status-only PATCH stays open to any admin role — the details guard
    must trigger only when a details/contact field is in the payload.

    Uses PENDING -> ACKNOWLEDGED: the row starts PENDING, and since the
    state machine is now enforced backend-side the transition has to be a
    legal one or this would 422 for a reason that has nothing to do with
    the guard under test.
    """
    fake_db = _FakeDB()
    fake_request = _build_editable_request(request_id=62)
    fake_db._fake_request = fake_request
    teardown = _patch_agent_overrides(fake_db)

    client = TestClient(app)
    try:
        response = client.patch(
            "/api/v1/admin/requests/62",
            json={"status": "ACKNOWLEDGED"},
        )
    finally:
        client.close()
        teardown()

    assert response.status_code == 200
    assert fake_request.status == RequestStatus.ACKNOWLEDGED


# ---------------------------------------------------------------------------
# edit_request_details audit trail (request-edit-audit-log, Phase 1).
# Every PATCH that actually changes a details/contact field must write
# exactly one audit_log row with action="edit_request_details" whose
# details JSON carries a {"fields": {field: {"old", "new"}}} diff for the
# changed fields only. Unchanged values and workflow-only payloads must
# not produce an entry.
# ---------------------------------------------------------------------------


def test_edit_detail_field_logs_audit_with_diff():
    fake_db = _FakeDB()
    fake_request = _build_editable_request(request_id=70)
    fake_db._fake_request = fake_request
    teardown = _patch_admin_overrides(fake_db)

    client = TestClient(app)
    try:
        response = client.patch(
            "/api/v1/admin/requests/70",
            json={"phone_number": "0899999999", "firstname": "สมหญิง"},
        )
    finally:
        client.close()
        teardown()

    assert response.status_code == 200
    assert fake_db.committed is True

    audit_rows = [obj for obj in fake_db.added if isinstance(obj, AuditLog)]
    assert len(audit_rows) == 1
    log = audit_rows[0]
    assert log.action == "edit_request_details"
    assert log.resource_type == "service_request"
    assert log.resource_id == "70"
    assert log.admin_id == 7
    assert log.details == {
        "fields": {
            "phone_number": {"old": "0812345678", "new": "0899999999"},
            "firstname": {"old": "สมชาย", "new": "สมหญิง"},
        }
    }


def test_edit_with_unchanged_value_excluded_from_diff():
    """A field sent with its current value must not appear in the diff —
    only fields whose value actually changed are recorded."""
    fake_db = _FakeDB()
    fake_request = _build_editable_request(request_id=71)
    fake_db._fake_request = fake_request
    teardown = _patch_admin_overrides(fake_db)

    client = TestClient(app)
    try:
        response = client.patch(
            "/api/v1/admin/requests/71",
            json={"phone_number": "0812345678", "district": "เมืองใหม่"},
        )
    finally:
        client.close()
        teardown()

    assert response.status_code == 200

    audit_rows = [obj for obj in fake_db.added if isinstance(obj, AuditLog)]
    assert len(audit_rows) == 1
    assert audit_rows[0].details == {
        "fields": {
            "district": {"old": "เมือง", "new": "เมืองใหม่"},
        }
    }


def test_edit_all_values_unchanged_logs_nothing():
    """Re-submitting the current values is a no-op for the audit trail."""
    fake_db = _FakeDB()
    fake_request = _build_editable_request(request_id=72)
    fake_db._fake_request = fake_request
    teardown = _patch_admin_overrides(fake_db)

    client = TestClient(app)
    try:
        response = client.patch(
            "/api/v1/admin/requests/72",
            json={"phone_number": "0812345678", "email": "somchai@example.com"},
        )
    finally:
        client.close()
        teardown()

    assert response.status_code == 200

    audit_rows = [obj for obj in fake_db.added if isinstance(obj, AuditLog)]
    assert audit_rows == []


def test_workflow_only_patch_logs_no_edit_audit():
    """Priority-only PATCH carries no details/contact field, so the
    edit_request_details audit path must stay silent."""
    fake_db = _FakeDB()
    fake_request = _build_editable_request(request_id=73)
    fake_db._fake_request = fake_request
    teardown = _patch_admin_overrides(fake_db)

    client = TestClient(app)
    try:
        response = client.patch(
            "/api/v1/admin/requests/73",
            json={"priority": "HIGH"},
        )
    finally:
        client.close()
        teardown()

    assert response.status_code == 200
    assert fake_request.priority == "HIGH"

    audit_rows = [obj for obj in fake_db.added if isinstance(obj, AuditLog)]
    assert audit_rows == []


# ---------------------------------------------------------------------------
# State-machine enforcement (HIGH-1 from the 2026-08-02 architecture review).
#
# STATUS_TRANSITIONS lived only in the frontend, so the API happily wrote
# whatever status arrived. `PATCH {"status": "COMPLETED"}` on a PENDING row
# skipped ACKNOWLEDGED, IN_PROGRESS and AWAITING_APPROVAL in one call —
# the approval step was advisory, not enforced.
#
# Enforcement is NOT blanket, because two off-map moves are real features:
# the kebab menu offers supervisors "บังคับเสร็จสิ้น" (force-complete from
# any state) and "ย้อนกลับ รอรับเรื่อง" (back to the start), both gated on
# `can_assign`. The rule is therefore:
#
#   on-map move          -> anyone who reaches the endpoint
#   off-map move + can_assign  -> allowed, logged as status_change_forced
#   off-map move, no can_assign -> 422
# ---------------------------------------------------------------------------


def test_pending_to_completed_rejected_without_assign_permission():
    """The headline defect: an AGENT skipping straight to COMPLETED."""
    fake_db = _FakeDB()
    fake_request = _build_editable_request(request_id=80)
    fake_db._fake_request = fake_request
    teardown = _patch_agent_overrides(fake_db)  # AGENT: no can_assign

    client = TestClient(app)
    try:
        response = client.patch(
            "/api/v1/admin/requests/80",
            json={"status": "COMPLETED"},
        )
    finally:
        client.close()
        teardown()

    assert response.status_code == 422
    # Rejected before any write: row untouched, nothing committed.
    assert fake_request.status == RequestStatus.PENDING
    assert fake_request.completed_at is None
    assert fake_db.committed is False
    assert [obj for obj in fake_db.added if isinstance(obj, AuditLog)] == []


def test_rejection_message_names_both_states_and_the_legal_moves():
    fake_db = _FakeDB()
    fake_db._fake_request = _build_editable_request(request_id=81)
    teardown = _patch_agent_overrides(fake_db)

    client = TestClient(app)
    try:
        response = client.patch(
            "/api/v1/admin/requests/81",
            json={"status": "COMPLETED"},
        )
    finally:
        client.close()
        teardown()

    detail = response.json()["detail"]
    assert "PENDING" in detail
    assert "COMPLETED" in detail
    assert "ACKNOWLEDGED" in detail  # one of the legal moves is offered


def test_supervisor_force_complete_still_works():
    """The "บังคับเสร็จสิ้น" kebab item, from a PENDING row. Enforcing the
    workflow must not take this away — it is an intentional feature."""
    fake_db = _FakeDB()
    fake_request = _build_editable_request(request_id=85)
    fake_db._fake_request = fake_request
    teardown = _patch_admin_overrides(fake_db)  # ADMIN: has can_assign

    client = TestClient(app)
    try:
        response = client.patch(
            "/api/v1/admin/requests/85",
            json={"status": "COMPLETED"},
        )
    finally:
        client.close()
        teardown()

    assert response.status_code == 200
    assert fake_request.status == RequestStatus.COMPLETED


def test_supervisor_force_complete_is_recorded_as_forced():
    """Allowed, but never silent — otherwise "was this approved or was
    approval skipped?" is still unanswerable."""
    fake_db = _FakeDB()
    fake_db._fake_request = _build_editable_request(request_id=86)
    teardown = _patch_admin_overrides(fake_db)

    client = TestClient(app)
    try:
        client.patch(
            "/api/v1/admin/requests/86",
            json={"status": "COMPLETED"},
        )
    finally:
        client.close()
        teardown()

    audit_rows = [obj for obj in fake_db.added if isinstance(obj, AuditLog)]
    assert len(audit_rows) == 1
    log = audit_rows[0]
    assert log.action == "status_change_forced"
    assert log.details["from_status"] == "PENDING"
    assert log.details["to_status"] == "COMPLETED"
    assert log.details["forced"] is True


def test_supervisor_revert_to_pending_still_works():
    """The "ย้อนกลับ รอรับเรื่อง" kebab item. IN_PROGRESS -> PENDING is
    off-map (only REJECTED -> PENDING is on it), so it takes the override
    path too."""
    fake_db = _FakeDB()
    fake_request = _build_in_progress_request(request_id=87)
    fake_db._fake_request = fake_request
    teardown = _patch_admin_overrides(fake_db)

    client = TestClient(app)
    try:
        response = client.patch(
            "/api/v1/admin/requests/87",
            json={"status": "PENDING"},
        )
    finally:
        client.close()
        teardown()

    assert response.status_code == 200
    assert fake_request.status == RequestStatus.PENDING

    audit_rows = [obj for obj in fake_db.added if isinstance(obj, AuditLog)]
    assert [row.action for row in audit_rows] == ["status_change_forced"]


def test_on_map_move_is_not_labelled_forced():
    """The override label must mean something — a normal step forward is
    recorded as a plain status_change."""
    fake_db = _FakeDB()
    fake_db._fake_request = _build_editable_request(request_id=88)
    teardown = _patch_admin_overrides(fake_db)

    client = TestClient(app)
    try:
        client.patch(
            "/api/v1/admin/requests/88",
            json={"status": "ACKNOWLEDGED"},
        )
    finally:
        client.close()
        teardown()

    audit_rows = [obj for obj in fake_db.added if isinstance(obj, AuditLog)]
    assert [row.action for row in audit_rows] == ["status_change"]
    assert "forced" not in audit_rows[0].details


def test_pending_to_acknowledged_is_allowed():
    fake_db = _FakeDB()
    fake_request = _build_editable_request(request_id=82)
    fake_db._fake_request = fake_request
    teardown = _patch_admin_overrides(fake_db)

    client = TestClient(app)
    try:
        response = client.patch(
            "/api/v1/admin/requests/82",
            json={"status": "ACKNOWLEDGED"},
        )
    finally:
        client.close()
        teardown()

    assert response.status_code == 200
    assert fake_request.status == RequestStatus.ACKNOWLEDGED


def test_resending_the_current_status_is_a_no_op_not_a_rejection():
    """PATCH payloads carry the whole form, so an edit to one field often
    re-sends the unchanged status. That must not 422."""
    fake_db = _FakeDB()
    fake_request = _build_editable_request(request_id=83)
    fake_db._fake_request = fake_request
    teardown = _patch_admin_overrides(fake_db)

    client = TestClient(app)
    try:
        response = client.patch(
            "/api/v1/admin/requests/83",
            json={"status": "PENDING", "priority": "HIGH"},
        )
    finally:
        client.close()
        teardown()

    assert response.status_code == 200
    assert fake_request.status == RequestStatus.PENDING
    assert fake_request.priority == "HIGH"
    # Status did not move, so no status_change row.
    status_rows = [
        obj for obj in fake_db.added
        if isinstance(obj, AuditLog) and obj.action == "status_change"
    ]
    assert status_rows == []


def test_permission_denial_wins_over_transition_validity():
    """When a payload is both unauthorized AND an illegal transition, the
    403 must win. Authorization is decided before workflow validity, so a
    caller who may not touch the row learns nothing about its state."""
    fake_db = _FakeDB()
    fake_request = _build_editable_request(request_id=84)
    fake_db._fake_request = fake_request
    teardown = _patch_agent_overrides(fake_db)  # AGENT: no edit_request_details

    client = TestClient(app)
    try:
        response = client.patch(
            "/api/v1/admin/requests/84",
            # phone_number -> forbidden for AGENT
            # PENDING -> COMPLETED -> also an illegal transition
            json={"status": "COMPLETED", "phone_number": "0899999999"},
        )
    finally:
        client.close()
        teardown()

    assert response.status_code == 403
    assert fake_request.status == RequestStatus.PENDING
    assert fake_request.phone_number == "0812345678"


# ---------------------------------------------------------------------------
# status_change audit trail (HIGH-2 from the same review).
#
# The audit table covered unassign, revert_approval and edit_request_details
# but not ordinary transitions — so "who approved this request?" had no
# answer, while "who UNDID the approval?" did.
# ---------------------------------------------------------------------------


def test_ordinary_transition_writes_a_status_change_audit_row():
    fake_db = _FakeDB()
    fake_request = _build_in_progress_request(request_id=90)
    fake_db._fake_request = fake_request
    teardown = _patch_admin_overrides(fake_db)

    client = TestClient(app)
    try:
        response = client.patch(
            "/api/v1/admin/requests/90",
            json={"status": "AWAITING_APPROVAL"},
        )
    finally:
        client.close()
        teardown()

    assert response.status_code == 200

    audit_rows = [obj for obj in fake_db.added if isinstance(obj, AuditLog)]
    assert len(audit_rows) == 1
    log = audit_rows[0]
    assert log.action == "status_change"
    assert log.resource_type == "service_request"
    assert log.resource_id == "90"
    assert log.admin_id == 7
    assert log.details == {
        "from_status": "IN_PROGRESS",
        "to_status": "AWAITING_APPROVAL",
        "notes": None,
    }


def test_the_approval_itself_is_now_traceable():
    """AWAITING_APPROVAL -> COMPLETED is the transition that was invisible
    in the audit trail while its reversal was recorded."""
    fake_db = _FakeDB()
    fake_request = SimpleNamespace(
        id=91,
        status=RequestStatus.AWAITING_APPROVAL,
        completed_at=None,
        priority="LOW",
        due_date=None,
        assigned_agent_id=None,
        assigned_by_id=None,
    )
    fake_db._fake_request = fake_request
    teardown = _patch_admin_overrides(fake_db)

    client = TestClient(app)
    try:
        response = client.patch(
            "/api/v1/admin/requests/91",
            json={"status": "COMPLETED", "notes": "ตรวจสอบแล้ว"},
        )
    finally:
        client.close()
        teardown()

    assert response.status_code == 200

    audit_rows = [obj for obj in fake_db.added if isinstance(obj, AuditLog)]
    assert len(audit_rows) == 1
    assert audit_rows[0].action == "status_change"
    assert audit_rows[0].details == {
        "from_status": "AWAITING_APPROVAL",
        "to_status": "COMPLETED",
        "notes": "ตรวจสอบแล้ว",
    }


def test_revert_writes_revert_approval_only_not_a_duplicate_pair():
    """A revert is still a status change, but it already has a dedicated,
    more specific action. Exactly one row per transition."""
    fake_db = _FakeDB()
    fake_db._fake_request = _build_completed_request(request_id=92)
    teardown = _patch_admin_overrides(fake_db)

    client = TestClient(app)
    try:
        response = client.patch(
            "/api/v1/admin/requests/92",
            json={"status": "IN_PROGRESS"},
        )
    finally:
        client.close()
        teardown()

    assert response.status_code == 200

    audit_rows = [obj for obj in fake_db.added if isinstance(obj, AuditLog)]
    assert [row.action for row in audit_rows] == ["revert_approval"]


def test_patch_without_status_writes_no_status_audit():
    fake_db = _FakeDB()
    fake_db._fake_request = _build_editable_request(request_id=93)
    teardown = _patch_admin_overrides(fake_db)

    client = TestClient(app)
    try:
        response = client.patch(
            "/api/v1/admin/requests/93",
            json={"priority": "URGENT"},
        )
    finally:
        client.close()
        teardown()

    assert response.status_code == 200
    assert [obj for obj in fake_db.added if isinstance(obj, AuditLog)] == []


def test_status_and_detail_edit_in_one_patch_yield_two_distinct_rows():
    """The two audit paths are independent — a PATCH that both moves the
    workflow and edits a field records both facts."""
    fake_db = _FakeDB()
    fake_request = _build_editable_request(request_id=94)
    fake_db._fake_request = fake_request
    teardown = _patch_admin_overrides(fake_db)

    client = TestClient(app)
    try:
        response = client.patch(
            "/api/v1/admin/requests/94",
            json={"status": "ACKNOWLEDGED", "phone_number": "0899999999"},
        )
    finally:
        client.close()
        teardown()

    assert response.status_code == 200

    audit_rows = [obj for obj in fake_db.added if isinstance(obj, AuditLog)]
    assert sorted(row.action for row in audit_rows) == [
        "edit_request_details", "status_change",
    ]


def test_list_requests_date_filter_bounds():
    fake_db = _FakeDB()
    fake_request = _build_editable_request(request_id=1)
    fake_db._fake_list_rows = [(fake_request, "Admin User")]
    teardown = _patch_admin_overrides(fake_db)

    client = TestClient(app)
    try:
        response = client.get("/api/v1/admin/requests?start_date=2026-09-01&end_date=2026-09-03")
    finally:
        client.close()
        teardown()

    assert response.status_code == 200
    assert str(fake_db.last_stmt).find("created_at >=") != -1
    assert str(fake_db.last_stmt).find("created_at <=") != -1


def test_list_requests_invalid_date_bounds_returns_400():
    fake_db = _FakeDB()
    teardown = _patch_admin_overrides(fake_db)

    client = TestClient(app)
    try:
        response = client.get("/api/v1/admin/requests?start_date=2026-09-05&end_date=2026-09-01")
    finally:
        client.close()
        teardown()

    assert response.status_code == 400
    assert response.json()["detail"] == "start_date must not be after end_date"

