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

class _FakeDB:
    def __init__(self) -> None:
        self.added = []
        self.committed = False
        # Tests that exercise endpoints which read+mutate an existing row
        # (e.g. revert flow in update_request) inject the row here so
        # `execute()` returns it. Default None keeps the original
        # "validation passes via truthy value=True" path working for
        # tests that pre-date this hook.
        self._fake_request = None

    async def execute(self, stmt):
        # When a fake request is registered, return it so the handler
        # can mutate it. Otherwise keep the original "True" sentinel
        # for tests that only need the not-None check to pass.
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
    triggers when leaving a COMPLETED row."""
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
    assert audit_rows == []


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
