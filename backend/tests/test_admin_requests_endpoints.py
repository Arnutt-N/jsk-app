"""Endpoint tests for admin request comment behavior."""
from datetime import datetime, timezone
from types import SimpleNamespace

from fastapi.testclient import TestClient

from app.api import deps
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
    def __init__(self) -> None:
        self.added = []
        self.committed = False

    async def execute(self, stmt):
        # Return a fake result that passes the validation check
        return _FakeScalarResult(value=True)

    def add(self, obj) -> None:
        self.added.append(obj)

    async def commit(self) -> None:
        self.committed = True

    async def refresh(self, obj) -> None:
        obj.id = 501
        obj.created_at = datetime(2026, 3, 13, 12, 0, tzinfo=timezone.utc)
        obj.updated_at = None


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
