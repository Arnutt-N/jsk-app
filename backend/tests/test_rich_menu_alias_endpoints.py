"""Endpoint (integration) tests for the Phase 3 rich-menu alias routes.

Covers the deferred Phase 8 checks for /admin/rich-menus/aliases:
  * route ordering — "/aliases" is matched as a literal and is NOT cast to int
    by the "/{id}" route (which would 422)
  * 409 — create alias when the target rich menu is not synced to LINE, and
    when the alias_id already exists
  * 404 — create alias for a missing rich menu; update/delete a missing alias
  * auth — 401 without a token, 403 for a role lacking manage_rich_menus

Mirrors the _FakeDB + app.dependency_overrides style of
test_module_permission_endpoints.py. No real DB or LINE call is made: the
create flow is exercised only up to the guard that returns a 4xx (before the
LINE call), so httpx is never hit.
"""
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app.api import deps
from app.core.permissions import invalidate_cache
from app.db.session import get_db as session_get_db
from app.main import app
from app.models.user import UserRole

ALIASES_URL = "/api/v1/admin/rich-menus/aliases"


class _Result:
    """Mimics a SQLAlchemy Result for both scalar and list access."""

    def __init__(self, value):
        self._value = value

    def scalar_one_or_none(self):
        return self._value

    def scalars(self):
        return self

    def all(self):
        return self._value if isinstance(self._value, list) else []


class _SeqDB:
    """Async session stand-in. execute() returns preset results in order so a
    handler that runs several queries gets each expected row in turn."""

    def __init__(self, results):
        self._results = list(results)

    async def execute(self, stmt):
        value = self._results.pop(0) if self._results else None
        return _Result(value)

    def add(self, obj):
        pass

    async def commit(self):
        pass

    async def refresh(self, obj):
        pass

    async def delete(self, obj):
        pass

    async def rollback(self):
        pass


def _make_user(role: UserRole):
    return SimpleNamespace(
        id=7, username="tester", display_name="Tester", role=role, is_active=True
    )


def _override(role=None, results=None):
    """Wire dependency overrides. role=None leaves get_current_user real (so the
    no-token 401 path runs). results seeds the fake DB for the endpoint queries."""
    invalidate_cache()
    db = _SeqDB(results or [])

    async def _get_db():
        yield db

    app.dependency_overrides[session_get_db] = _get_db
    if role is not None:
        async def _get_current_user():
            return _make_user(role)

        app.dependency_overrides[deps.get_current_user] = _get_current_user
    return db


def _clear():
    app.dependency_overrides.clear()
    invalidate_cache()


# ---------------------------------------------------------------------------
# Route ordering — "/aliases" must not be captured by "/{id:int}"
# ---------------------------------------------------------------------------


def test_aliases_route_not_cast_to_int():
    # If "/{id}" were declared first, FastAPI would try int("aliases") -> 422.
    _override(role=UserRole.ADMIN, results=[[]])
    client = TestClient(app)
    try:
        resp = client.get(ALIASES_URL)
    finally:
        client.close()
        _clear()

    assert resp.status_code == 200
    assert resp.json() == []


# ---------------------------------------------------------------------------
# Auth — 401 without a token, 403 for a role lacking manage_rich_menus
# ---------------------------------------------------------------------------


def test_aliases_requires_auth_401(monkeypatch):
    # Force bypass off so a missing token is rejected even if app/.env enables it.
    monkeypatch.setattr(deps.settings, "DEV_AUTH_BYPASS", False, raising=False)
    _override(role=None, results=[[]])
    client = TestClient(app)
    try:
        resp = client.get(ALIASES_URL)
    finally:
        client.close()
        _clear()

    assert resp.status_code == 401


def test_create_alias_forbidden_for_agent():
    _override(role=UserRole.AGENT)
    client = TestClient(app)
    try:
        resp = client.post(ALIASES_URL, json={"alias_id": "alias-a", "rich_menu_id": 1})
    finally:
        client.close()
        _clear()

    assert resp.status_code == 403


# ---------------------------------------------------------------------------
# create alias — 404 (no rich menu) / 409 (not synced, duplicate)
# ---------------------------------------------------------------------------


def test_create_alias_404_when_rich_menu_missing():
    _override(role=UserRole.ADMIN, results=[None])
    client = TestClient(app)
    try:
        resp = client.post(ALIASES_URL, json={"alias_id": "alias-a", "rich_menu_id": 999})
    finally:
        client.close()
        _clear()

    assert resp.status_code == 404


def test_create_alias_409_when_rich_menu_not_synced():
    rich_menu = SimpleNamespace(id=1, line_rich_menu_id=None)
    _override(role=UserRole.ADMIN, results=[rich_menu])
    client = TestClient(app)
    try:
        resp = client.post(ALIASES_URL, json={"alias_id": "alias-a", "rich_menu_id": 1})
    finally:
        client.close()
        _clear()

    assert resp.status_code == 409


def test_create_alias_409_when_alias_already_exists():
    rich_menu = SimpleNamespace(id=1, line_rich_menu_id="richmenu-xyz")
    existing_alias = SimpleNamespace(id=5, alias_id="alias-a")
    # 1st query -> rich menu (synced); 2nd query -> existing alias
    _override(role=UserRole.ADMIN, results=[rich_menu, existing_alias])
    client = TestClient(app)
    try:
        resp = client.post(ALIASES_URL, json={"alias_id": "alias-a", "rich_menu_id": 1})
    finally:
        client.close()
        _clear()

    assert resp.status_code == 409


# ---------------------------------------------------------------------------
# update / delete alias — 404 when the alias does not exist
# ---------------------------------------------------------------------------


def test_update_alias_404_when_missing():
    _override(role=UserRole.ADMIN, results=[None])
    client = TestClient(app)
    try:
        resp = client.put(f"{ALIASES_URL}/ghost", json={"rich_menu_id": 1})
    finally:
        client.close()
        _clear()

    assert resp.status_code == 404


def test_delete_alias_404_when_missing():
    _override(role=UserRole.ADMIN, results=[None])
    client = TestClient(app)
    try:
        resp = client.delete(f"{ALIASES_URL}/ghost")
    finally:
        client.close()
        _clear()

    assert resp.status_code == 404
