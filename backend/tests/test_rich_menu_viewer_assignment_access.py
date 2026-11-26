"""N02: the per-user rich-menu assignment read is not a VIEWER read."""
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api import deps
from app.api.v1.endpoints import rich_menus
from app.core.permissions import invalidate_cache
from app.db.session import get_db as session_get_db
from app.models.user import UserRole

USER_ID = "U" + "0" * 32
PATH = f"/admin/rich-menus/1/users/{USER_ID}"


class _Result:
    def __init__(self, value):
        self._value = value

    def scalar_one_or_none(self):
        return self._value

    def scalars(self):
        return self

    def all(self):
        return self._value if isinstance(self._value, list) else []


class _FakeDB:
    async def execute(self, stmt):
        return _Result(SimpleNamespace(id=1))


@pytest.fixture
def client(monkeypatch):
    invalidate_cache()
    import app.core.permissions as permissions

    async def _load_policy(db=None):
        return {}

    async def _known_user(db, user_id):
        return 42

    monkeypatch.setattr(permissions, "load_policy", _load_policy)
    monkeypatch.setattr(permissions, "refresh_policy_if_stale", _load_policy)

    async def _no_assignment(db, user_id):
        return None

    monkeypatch.setattr(rich_menus, "_ensure_known_line_user", _known_user)
    monkeypatch.setattr(rich_menus.RichMenuService, "get_user_rich_menu", _no_assignment)
    app = FastAPI()
    app.include_router(rich_menus.router, prefix="/admin/rich-menus")

    async def _get_db():
        yield _FakeDB()

    app.dependency_overrides[session_get_db] = _get_db
    with TestClient(app, raise_server_exceptions=True) as test_client:
        yield test_client, app
    app.dependency_overrides.clear()
    invalidate_cache()


def test_viewer_cannot_read_another_users_menu_assignment(client, monkeypatch):
    test_client, app = client

    async def _current_user():
        return SimpleNamespace(id=1, role=UserRole.VIEWER, is_active=True)

    app.dependency_overrides[deps.get_current_user] = _current_user
    response = test_client.get(PATH)

    assert response.status_code == 403
    assert "line_user_id" not in response.text


def test_viewer_can_still_read_rich_menu_catalog(client):
    test_client, app = client

    async def _current_user():
        return SimpleNamespace(id=1, role=UserRole.VIEWER, is_active=True)

    app.dependency_overrides[deps.get_current_user] = _current_user
    response = test_client.get("/admin/rich-menus?limit=1")

    assert response.status_code == 200
    assert response.json() == []


def test_admin_can_still_read_another_users_menu_assignment(client, monkeypatch):
    test_client, app = client

    async def _current_user():
        return SimpleNamespace(id=1, role=UserRole.ADMIN, is_active=True)

    async def _assignment(db, user_id):
        return {"richMenuId": "richmenu-xyz"}

    monkeypatch.setattr(rich_menus.RichMenuService, "get_user_rich_menu", _assignment)
    app.dependency_overrides[deps.get_current_user] = _current_user
    response = test_client.get(PATH)

    assert response.status_code == 200
    assert response.json()["line_user_id"] == USER_ID
