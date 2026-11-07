"""Date-window filters for broadcast list, conversation list, and message search.

Covers the same contract the requests list already pins in
test_admin_requests_endpoints.py: explicit YYYY-MM-DD bounds become shared
Bangkok half-open [start, end) UTC bounds via ``day_bounds_utc``, each bound
is independent (lone end_date is an upper cap, not an invented lower bound),
and a reversed pair is rejected with 400 before any DB work.
"""
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi.testclient import TestClient

from app.api import deps
from app.api.v1.endpoints import admin_broadcast
from app.db.session import get_db as session_get_db
from app.main import app
from app.models.user import UserRole


class _FakeListResult:
    def __init__(self, rows):
        self._rows = rows

    def all(self):
        return self._rows

    def scalars(self):
        return self

    def scalar_one_or_none(self):
        return self._rows[0] if self._rows else None


class _FakeDB:
    """Captures the last statement so tests assert on compiled bounds."""

    def __init__(self) -> None:
        self.added = []
        self.committed = False
        self.last_stmt = None

    async def execute(self, stmt):
        self.last_stmt = stmt
        return _FakeListResult(rows=[])

    async def scalar(self, stmt):
        self.last_stmt = stmt
        return 0

    def add(self, obj) -> None:
        self.added.append(obj)

    async def commit(self) -> None:
        self.committed = True

    async def refresh(self, obj) -> None:
        return None

    async def flush(self) -> None:
        return None


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
    app.dependency_overrides[deps.get_current_admin_or_viewer] = _override_get_current_admin
    app.dependency_overrides[deps.get_current_manager_or_viewer] = _override_get_current_admin
    app.dependency_overrides[deps.get_current_staff_or_viewer] = _override_get_current_admin
    app.dependency_overrides[deps.get_db] = _override_get_db
    app.dependency_overrides[deps.get_current_user] = _override_get_current_admin
    app.dependency_overrides[deps.get_current_staff] = _override_get_current_admin

    def teardown():
        app.dependency_overrides.clear()

    return teardown


def _datetime_bounds(stmt):
    compiled = stmt.compile()
    return sorted(v for v in compiled.params.values() if isinstance(v, datetime))


def test_broadcast_list_date_filter_bounds():
    """Both bounds land on Broadcast.created_at as half-open [start, end)."""
    fake_db = _FakeDB()
    teardown = _patch_admin_overrides(fake_db)

    orig = admin_broadcast.broadcast_service.list_broadcasts
    mock_list = AsyncMock(return_value=([], 0))
    admin_broadcast.broadcast_service.list_broadcasts = mock_list
    client = TestClient(app)
    try:
        response = client.get("/api/v1/admin/broadcasts?start_date=2026-09-01&end_date=2026-09-03")
    finally:
        client.close()
        admin_broadcast.broadcast_service.list_broadcasts = orig
        teardown()

    assert response.status_code == 200
    _, kwargs = mock_list.call_args
    assert kwargs["start_dt"] == datetime(2026, 8, 31, 17, 0, tzinfo=timezone.utc)
    assert kwargs["end_dt"] == datetime(2026, 9, 3, 17, 0, tzinfo=timezone.utc)


def test_broadcast_list_reversed_dates_returns_400():
    fake_db = _FakeDB()
    teardown = _patch_admin_overrides(fake_db)

    client = TestClient(app)
    try:
        response = client.get("/api/v1/admin/broadcasts?start_date=2026-09-05&end_date=2026-09-01")
    finally:
        client.close()
        teardown()

    assert response.status_code == 400
    assert response.json()["detail"] == "start_date must not be after end_date"


def test_conversations_list_date_filter_hits_last_message_at():
    """The conversation list filters on User.last_message_at, same bound semantics."""
    import asyncio as _asyncio

    from app.services.live_chat_service import live_chat_service

    mock_db = AsyncMock()
    mock_result = MagicMock()
    mock_result.all.return_value = []
    mock_db.execute = AsyncMock(return_value=mock_result)
    mock_db.scalar = AsyncMock(return_value=0)

    async def _run():
        return await live_chat_service.get_conversations(
            None,
            mock_db,
            start_dt=datetime(2026, 8, 31, 17, 0, tzinfo=timezone.utc),
            end_dt=datetime(2026, 9, 3, 17, 0, tzinfo=timezone.utc),
        )

    out = _asyncio.new_event_loop().run_until_complete(_run())

    assert out["conversations"] == []
    stmt = mock_db.execute.call_args_list[0].args[0]
    sql = str(stmt)
    assert "last_message_at >=" in sql
    assert "last_message_at <" in sql

    bounds = _datetime_bounds(stmt)
    assert datetime(2026, 8, 31, 17, 0, tzinfo=timezone.utc) in bounds
    assert datetime(2026, 9, 3, 17, 0, tzinfo=timezone.utc) in bounds


def test_conversations_list_reversed_dates_returns_400():
    fake_db = _FakeDB()
    teardown = _patch_admin_overrides(fake_db)

    client = TestClient(app)
    try:
        response = client.get(
            "/api/v1/admin/live-chat/conversations?start_date=2026-09-05&end_date=2026-09-01"
        )
    finally:
        client.close()
        teardown()

    assert response.status_code == 400
    assert response.json()["detail"] == "start_date must not be after end_date"


@pytest.mark.asyncio
async def test_search_messages_date_filter_bounds():
    """Message search filters on Message.created_at, half-open [start, end)."""
    from app.services.live_chat_service import live_chat_service

    mock_message = MagicMock()
    mock_message.id = 101
    mock_message.user_id = 5
    mock_message.content = "hello world"
    mock_message.direction = MagicMock(value="INCOMING")
    mock_message.sender_role = None
    mock_message.created_at = datetime.now(timezone.utc)

    mock_db = AsyncMock()
    search_result = MagicMock()
    search_result.all.return_value = [(mock_message, "Tester")]
    from app.services.credential_service import credential_service

    decrypt_result = MagicMock()
    decrypt_result.all.return_value = [(5, credential_service.encrypt_line_id("Uabc"))]
    mock_db.execute.side_effect = [search_result, decrypt_result]

    items = await live_chat_service.search_messages(
        "hello",
        mock_db,
        start_dt=datetime(2026, 8, 31, 17, 0, tzinfo=timezone.utc),
        end_dt=datetime(2026, 9, 3, 17, 0, tzinfo=timezone.utc),
    )
    assert len(items) == 1
    assert items[0]["id"] == 101

    stmt = mock_db.execute.call_args_list[0].args[0]
    sql = str(stmt)
    assert "created_at >=" in sql
    assert "created_at <" in sql
    bounds = _datetime_bounds(stmt)
    assert datetime(2026, 8, 31, 17, 0, tzinfo=timezone.utc) in bounds
    assert datetime(2026, 9, 3, 17, 0, tzinfo=timezone.utc) in bounds


def test_search_messages_reversed_dates_returns_400():
    fake_db = _FakeDB()
    teardown = _patch_admin_overrides(fake_db)

    client = TestClient(app)
    try:
        response = client.get(
            "/api/v1/admin/live-chat/messages/search?q=hello&start_date=2026-09-05&end_date=2026-09-01"
        )
    finally:
        client.close()
        teardown()

    assert response.status_code == 400
    assert response.json()["detail"] == "start_date must not be after end_date"
