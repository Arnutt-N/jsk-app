"""Endpoint tests for the Phase 7 rich-menu delete guard + dependencies route.

Covers /admin/rich-menus delete safety:
  * GET /{id}/dependencies — 404 (missing menu); returns {aliases, user_count};
    requires auth (401 without a token)
  * DELETE /{id} — 409 when an alias or a per-user link still depends on the
    menu; succeeds (200) when there are no dependencies
  * auth — 403 for a role lacking manage_rich_menus

Mirrors the _SeqDB + app.dependency_overrides style of
test_rich_menu_peruser_endpoints.py. The DELETE happy path uses a menu with no
LINE id and no local image so no httpx/filesystem call is made.
"""
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app.api import deps
from app.core.permissions import invalidate_cache
from app.db.session import get_db as session_get_db
from app.main import app
from app.models.user import UserRole

BASE = "/api/v1/admin/rich-menus"


class _Result:
    """Mimics a SQLAlchemy Result for scalar, scalar-list and count access."""

    def __init__(self, value):
        self._value = value

    def scalar_one_or_none(self):
        return self._value

    def scalar(self):
        return self._value

    def scalars(self):
        return self

    def all(self):
        return self._value if isinstance(self._value, list) else []


class _SeqDB:
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

    async def get(self, model, pk):
        return None

    async def flush(self):
        pass

    async def rollback(self):
        pass


def _make_user(role: UserRole):
    return SimpleNamespace(
        id=7, username="tester", display_name="Tester", role=role, is_active=True
    )


def _override(role=None, results=None):
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


def _menu(line_id=None, image_media_id=None, name="Menu A"):
    return SimpleNamespace(
        id=1, name=name, line_rich_menu_id=line_id, image_media_id=image_media_id, status="DRAFT"
    )


def _alias():
    return SimpleNamespace(id=3, alias_id="alias-a", rich_menu_id=1)


# ---------------------------------------------------------------------------
# GET /{id}/dependencies
# ---------------------------------------------------------------------------


def test_dependencies_requires_auth_401(monkeypatch):
    monkeypatch.setattr(deps.settings, "DEV_AUTH_BYPASS", False, raising=False)
    _override(role=None, results=[_menu()])
    client = TestClient(app)
    try:
        resp = client.get(f"{BASE}/1/dependencies")
    finally:
        client.close()
        _clear()

    assert resp.status_code == 401


def test_dependencies_404_when_menu_missing():
    _override(role=UserRole.ADMIN, results=[None])
    client = TestClient(app)
    try:
        resp = client.get(f"{BASE}/999/dependencies")
    finally:
        client.close()
        _clear()

    assert resp.status_code == 404


def test_dependencies_returns_aliases_and_user_count():
    # queries in order: menu, aliases (list), user_count (scalar)
    _override(role=UserRole.ADMIN, results=[_menu(), [_alias()], 2])
    client = TestClient(app)
    try:
        resp = client.get(f"{BASE}/1/dependencies")
    finally:
        client.close()
        _clear()

    assert resp.status_code == 200
    body = resp.json()
    assert body["aliases"] == ["alias-a"]
    assert body["user_count"] == 2


# ---------------------------------------------------------------------------
# DELETE /{id} — guard
# ---------------------------------------------------------------------------


def test_delete_forbidden_for_agent():
    _override(role=UserRole.AGENT)
    client = TestClient(app)
    try:
        resp = client.delete(f"{BASE}/1")
    finally:
        client.close()
        _clear()

    assert resp.status_code == 403


def test_delete_409_when_alias_depends():
    # menu, aliases (one), user_count (0) -> 409 from the alias dependency
    _override(role=UserRole.ADMIN, results=[_menu(), [_alias()], 0])
    client = TestClient(app)
    try:
        resp = client.delete(f"{BASE}/1")
    finally:
        client.close()
        _clear()

    assert resp.status_code == 409


def test_delete_409_when_user_links_depend():
    # menu, aliases (none), user_count (3) -> 409 from per-user links
    _override(role=UserRole.ADMIN, results=[_menu(), [], 3])
    client = TestClient(app)
    try:
        resp = client.delete(f"{BASE}/1")
    finally:
        client.close()
        _clear()

    assert resp.status_code == 409


def test_delete_succeeds_when_no_dependencies():
    # menu (no LINE id, no image), aliases (none), user_count (0) -> deletes
    _override(role=UserRole.ADMIN, results=[_menu(), [], 0])
    client = TestClient(app)
    try:
        resp = client.delete(f"{BASE}/1")
    finally:
        client.close()
        _clear()

    assert resp.status_code == 200
