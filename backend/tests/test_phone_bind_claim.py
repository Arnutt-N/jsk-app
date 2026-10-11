"""Regression tests for C1 phone-claim: no auto-bind, no detail disclosure.

Anyone who messages the OA a 10-digit number must NOT get other people's
unbound requests bound to their LINE account, and must NOT see their
details. The handler replies with a masked count in Thai and binds
nothing; actual linking is a staff action via
PATCH /api/v1/admin/requests/{id} with {"user_id": ...}.
"""
import logging
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch

import pytest
from fastapi.testclient import TestClient

from app.api import deps
from app.db.session import get_db as session_get_db
from app.main import app
from app.models.audit_log import AuditLog
from app.models.service_request import RequestStatus
from app.models.user import UserRole
from app.services.message_intake.commands import handle_bind_phone

VICTIM_PHONE = "0812345678"
VICTIM_NAME = "เหยื่อ รายหนึ่ง"
VICTIM_DETAILS = "เรื่องลับของเหยื่อ"
ATTACKER_LINE_ID = "Uattacker0001"
ATTACKER_USER_ID = 7
REPLY_TOKEN = "tok-attack"


class _FakeRowsAndCount:
    """Result double serving both the old scan shape and the count query.

    Old code calls .all() / .scalars().all(), new code calls .scalar().
    """

    def __init__(self, rows):
        self._rows = rows

    def all(self):
        return self._rows

    def scalars(self):
        return self

    def scalar(self):
        return len(self._rows)


def _make_db(scan_rows, latest_rows):
    db = AsyncMock()
    db.execute = AsyncMock(
        side_effect=[
            _FakeRowsAndCount(scan_rows),
            SimpleNamespace(),
            _FakeRowsAndCount(latest_rows),
        ]
    )
    return db


def _make_line_svc():
    svc = Mock()
    svc.reply_text = AsyncMock()
    svc.reply_flex = AsyncMock()
    return svc


async def _run_claim(db, line_svc):
    with patch(
        "app.services.user_identity_service.resolve_by_line_id",
        new=AsyncMock(return_value=SimpleNamespace(id=ATTACKER_USER_ID)),
    ), patch(
        "app.services.message_intake.commands.get_line_service",
        return_value=line_svc,
    ), patch(
        "app.services.message_intake.commands.build_request_status_list",
        return_value={"flex": "sentinel"},
    ):
        await handle_bind_phone(VICTIM_PHONE, ATTACKER_LINE_ID, REPLY_TOKEN, db)


def _assert_no_binding_write(db):
    for call in db.execute.await_args_list:
        assert "UPDATE" not in str(call.args[0])
    db.flush.assert_not_awaited()


@pytest.mark.asyncio
async def test_claim_unbound_victims_binds_nothing_and_leaks_nothing(caplog):
    caplog.set_level(logging.INFO)
    scan = [(101, None, None), (102, None, None), (103, None, None)]
    latest = [
        SimpleNamespace(
            id=101,
            requester_name=VICTIM_NAME,
            phone_number=VICTIM_PHONE,
            description=VICTIM_DETAILS,
            topic_category="ขอความช่วยเหลือ",
        )
    ]
    db = _make_db(scan, latest)
    line_svc = _make_line_svc()
    await _run_claim(db, line_svc)

    _assert_no_binding_write(db)
    line_svc.reply_flex.assert_not_awaited()
    line_svc.reply_text.assert_awaited_once()
    msg = line_svc.reply_text.await_args.args[1]
    assert "3" in msg
    assert "เจ้าหน้าที่" in msg
    assert VICTIM_PHONE not in msg
    assert VICTIM_NAME not in msg
    assert VICTIM_DETAILS not in msg
    assert any("no auto-bind" in r.message for r in caplog.records)


@pytest.mark.asyncio
async def test_claim_unknown_number_replies_not_found_without_echo():
    db = _make_db([], [])
    line_svc = _make_line_svc()
    await _run_claim(db, line_svc)

    _assert_no_binding_write(db)
    line_svc.reply_flex.assert_not_awaited()
    line_svc.reply_text.assert_awaited_once()
    msg = line_svc.reply_text.await_args.args[1]
    assert "❌" in msg
    assert VICTIM_PHONE not in msg


# ---------------------------------------------------------------------------
# Staff linking: PATCH /api/v1/admin/requests/{id} with {"user_id": ...}
# ---------------------------------------------------------------------------


class _FakeScalarResult:
    def __init__(self, value=None):
        self._value = value

    def scalar_one_or_none(self):
        return self._value


class _FakeDB:
    def __init__(self) -> None:
        self.added = []
        self.committed = False
        self._fake_request = None

    async def execute(self, stmt):
        return _FakeScalarResult(value=self._fake_request)

    def add(self, obj) -> None:
        self.added.append(obj)

    async def commit(self) -> None:
        self.committed = True

    async def refresh(self, obj) -> None:
        return None

    async def flush(self) -> None:
        return None

    async def get(self, model, pk):
        if pk == 999999:
            return None
        return SimpleNamespace(id=pk, username=f"user-{pk}")


def _build_unbound_request(request_id: int = 42) -> SimpleNamespace:
    return SimpleNamespace(
        id=request_id,
        status=RequestStatus.PENDING,
        completed_at=None,
        priority="LOW",
        due_date=None,
        assigned_agent_id=None,
        assigned_by_id=None,
        user_id=None,
    )


def _patch_admin_overrides(fake_db: _FakeDB):
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


def test_staff_link_request_to_user_sets_user_id():
    fake_db = _FakeDB()
    fake_request = _build_unbound_request()
    fake_db._fake_request = fake_request
    teardown = _patch_admin_overrides(fake_db)

    client = TestClient(app)
    try:
        response = client.patch(
            "/api/v1/admin/requests/42",
            json={"user_id": 123},
        )
    finally:
        client.close()
        teardown()

    assert response.status_code == 200
    assert fake_db.committed is True
    assert fake_request.user_id == 123
    audit_rows = [obj for obj in fake_db.added if isinstance(obj, AuditLog)]
    assert len(audit_rows) == 1
    assert audit_rows[0].action == "link_request_user"
    assert audit_rows[0].resource_id == "42"


def test_staff_link_unknown_user_returns_404():
    fake_db = _FakeDB()
    fake_request = _build_unbound_request()
    fake_db._fake_request = fake_request
    teardown = _patch_admin_overrides(fake_db)

    client = TestClient(app)
    try:
        response = client.patch(
            "/api/v1/admin/requests/42",
            json={"user_id": 999999},
        )
    finally:
        client.close()
        teardown()

    assert response.status_code == 404
    assert fake_request.user_id is None
