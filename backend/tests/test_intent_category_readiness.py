"""Readiness count helper + PUT is_active guard (issue #122 follow-up).

Uses FastAPI dependency-override + a fake async DB (mirrors
test_rich_menu_alias_endpoints.py) so no real DB is required. TestClient is
created WITHOUT the context-manager form, so app lifespan/startup does not run
and no DB/Redis connection is attempted.
"""
from datetime import datetime, timezone
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app.api import deps
from app.core.permissions import invalidate_cache
from app.main import app
from app.models.user import UserRole


# --- fake DB primitives -----------------------------------------------------
class _Result:
    def __init__(self, value):
        self._value = value

    def scalars(self):
        return self

    def first(self):
        return self._value[0] if self._value else None

    def all(self):
        return list(self._value)

    def one(self):
        return self._value  # a tuple, e.g. (total, active)


class _FakeDB:
    def __init__(self, execute_results=None, scalar_results=None):
        self._exec = list(execute_results or [])
        self._scalar = list(scalar_results or [])
        self.committed = False

    async def execute(self, stmt):
        return _Result(self._exec.pop(0))

    async def scalar(self, stmt):
        return self._scalar.pop(0)

    def add(self, obj):
        pass

    async def commit(self):
        self.committed = True

    async def refresh(self, obj):
        pass

    async def rollback(self):
        pass


def _cat(id=1, name="ราคา", is_active=True):
    return SimpleNamespace(
        id=id, name=name, description=None, is_active=is_active,
        created_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
    )


CATEGORIES_URL = "/api/v1/admin/intents/categories"


def _override_db_and_admin(db):
    invalidate_cache()

    async def _get_db():
        yield db

    async def _get_user():
        return SimpleNamespace(
            id=7, username="tester", display_name="Tester",
            role=UserRole.ADMIN, is_active=True,
        )

    app.dependency_overrides[deps.get_db] = _get_db
    app.dependency_overrides[deps.get_current_user] = _get_user


def _clear():
    app.dependency_overrides.clear()
    invalidate_cache()


# --- GET endpoint test ------------------------------------------------------
def test_get_categories_exposes_active_response_count():
    # list_categories issues, in order: execute(categories),
    # execute(keyword counts GROUP BY), execute(response counts GROUP BY
    # with active FILTER), execute(windowed keywords preview <= 5)
    db = _FakeDB(
        execute_results=[
            [_cat()],            # categories
            [(1, 2)],            # keyword counts: category 1 -> 2
            [(1, 3, 2)],         # response counts: total=3, active=2
            [(1, "ราคา")],       # keyword preview rows (cid, keyword)
        ],
        scalar_results=[],
    )
    _override_db_and_admin(db)
    client = TestClient(app)
    try:
        resp = client.get(CATEGORIES_URL)
    finally:
        client.close()
        _clear()

    assert resp.status_code == 200
    body = resp.json()[0]
    assert body["response_count"] == 3
    assert body["active_response_count"] == 2
    assert body["keyword_count"] == 2


# --- PUT is_active guard ----------------------------------------------------
def test_put_activate_without_active_response_returns_400():
    db = _FakeDB(execute_results=[[_cat(is_active=False)]], scalar_results=[0])
    _override_db_and_admin(db)
    client = TestClient(app)
    try:
        resp = client.put(f"{CATEGORIES_URL}/1", json={"is_active": True})
    finally:
        client.close()
        _clear()

    assert resp.status_code == 400
    assert "active response" in resp.json()["detail"]
    assert db.committed is False


def test_put_activate_with_active_response_ok():
    db = _FakeDB(execute_results=[[_cat(is_active=False)]], scalar_results=[1])
    _override_db_and_admin(db)
    client = TestClient(app)
    try:
        resp = client.put(f"{CATEGORIES_URL}/1", json={"is_active": True})
    finally:
        client.close()
        _clear()

    assert resp.status_code == 200
    assert db.committed is True


def test_put_name_only_not_blocked_when_incomplete():
    # active-but-incomplete category; editing name (no is_active) must NOT be blocked.
    db = _FakeDB(execute_results=[[_cat(is_active=True)]], scalar_results=[])
    _override_db_and_admin(db)
    client = TestClient(app)
    try:
        resp = client.put(f"{CATEGORIES_URL}/1", json={"name": "ราคาใหม่"})
    finally:
        client.close()
        _clear()

    assert resp.status_code == 200
    assert db.committed is True


def test_put_deactivate_always_ok():
    db = _FakeDB(execute_results=[[_cat(is_active=True)]], scalar_results=[])
    _override_db_and_admin(db)
    client = TestClient(app)
    try:
        resp = client.put(f"{CATEGORIES_URL}/1", json={"is_active": False})
    finally:
        client.close()
        _clear()

    assert resp.status_code == 200
    assert db.committed is True
