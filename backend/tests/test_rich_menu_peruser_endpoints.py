"""Endpoint (integration) tests for the Phase 4 per-user rich-menu routes.

Covers /admin/rich-menus per-user link/unlink/bulk:
  * 409 — link/bulk-link when the target rich menu is not synced to LINE
  * 404 — link for a missing rich menu; IDOR (unknown line_user_id); bulk with
    an unknown userId in the list
  * route separation — "/users/bulk-link" is NOT captured by "/{id}" (would 422)
  * unlink — no synced-guard (can revert a user even if menu lost its LINE id)
  * auth — 401 without a token, 403 for a role lacking manage_rich_menus

Mirrors the _SeqDB + app.dependency_overrides style of
test_rich_menu_alias_endpoints.py. No real DB or LINE call is made: each flow
is exercised only up to the guard that returns a 4xx (before the LINE call), so
httpx is never hit.
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
# Valid LINE userId: "U" + 32 lowercase hex chars (33 total).
USER_A = "U" + "0" * 32
USER_B = "U" + "a" * 32


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


def _menu(line_id="richmenu-xyz"):
    return SimpleNamespace(id=1, line_rich_menu_id=line_id)


def _line_user():
    return SimpleNamespace(id=42, line_user_id=USER_A)


# ---------------------------------------------------------------------------
# Auth — 401 without a token, 403 for a role lacking manage_rich_menus
# ---------------------------------------------------------------------------


def test_link_requires_auth_401(monkeypatch):
    monkeypatch.setattr(deps.settings, "DEV_AUTH_BYPASS", False, raising=False)
    _override(role=None)
    client = TestClient(app)
    try:
        resp = client.post(f"{BASE}/1/users/{USER_A}")
    finally:
        client.close()
        _clear()

    assert resp.status_code == 401


def test_link_forbidden_for_agent():
    _override(role=UserRole.AGENT)
    client = TestClient(app)
    try:
        resp = client.post(f"{BASE}/1/users/{USER_A}")
    finally:
        client.close()
        _clear()

    assert resp.status_code == 403


def test_bulk_link_forbidden_for_agent():
    _override(role=UserRole.AGENT)
    client = TestClient(app)
    try:
        resp = client.post(
            f"{BASE}/users/bulk-link",
            json={"rich_menu_id": 1, "user_ids": [USER_A, USER_B]},
        )
    finally:
        client.close()
        _clear()

    assert resp.status_code == 403


def test_bulk_unlink_forbidden_for_agent():
    _override(role=UserRole.AGENT)
    client = TestClient(app)
    try:
        resp = client.post(f"{BASE}/users/bulk-unlink", json={"user_ids": [USER_A]})
    finally:
        client.close()
        _clear()

    assert resp.status_code == 403


# ---------------------------------------------------------------------------
# Single link — 404 (no menu) / 409 (not synced) / 404 (IDOR unknown user)
# ---------------------------------------------------------------------------


def test_link_404_when_rich_menu_missing():
    _override(role=UserRole.ADMIN, results=[None])
    client = TestClient(app)
    try:
        resp = client.post(f"{BASE}/999/users/{USER_A}")
    finally:
        client.close()
        _clear()

    assert resp.status_code == 404


def test_link_409_when_rich_menu_not_synced():
    _override(role=UserRole.ADMIN, results=[_menu(line_id=None)])
    client = TestClient(app)
    try:
        resp = client.post(f"{BASE}/1/users/{USER_A}")
    finally:
        client.close()
        _clear()

    assert resp.status_code == 409


def test_link_404_when_user_unknown_idor():
    # 1st query -> synced rich menu; 2nd query -> user lookup returns None
    _override(role=UserRole.ADMIN, results=[_menu(), None])
    client = TestClient(app)
    try:
        resp = client.post(f"{BASE}/1/users/{USER_A}")
    finally:
        client.close()
        _clear()

    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Bulk link — route separation, 404 (no menu), 409 (not synced), 404 (IDOR)
# ---------------------------------------------------------------------------


def test_bulk_link_route_not_cast_to_int():
    # If "/{id}" captured "/users", FastAPI would try int("users") -> 422.
    # Reaching the 404 (menu missing) proves the literal route resolved.
    _override(role=UserRole.ADMIN, results=[None])
    client = TestClient(app)
    try:
        resp = client.post(
            f"{BASE}/users/bulk-link",
            json={"rich_menu_id": 999, "user_ids": [USER_A]},
        )
    finally:
        client.close()
        _clear()

    assert resp.status_code == 404


def test_bulk_link_409_when_not_synced():
    _override(role=UserRole.ADMIN, results=[_menu(line_id=None)])
    client = TestClient(app)
    try:
        resp = client.post(
            f"{BASE}/users/bulk-link",
            json={"rich_menu_id": 1, "user_ids": [USER_A, USER_B]},
        )
    finally:
        client.close()
        _clear()

    assert resp.status_code == 409


def test_bulk_link_404_when_a_user_unknown_idor():
    # 1st query -> synced menu; 2nd query -> only USER_A exists (USER_B missing)
    _override(role=UserRole.ADMIN, results=[_menu(), [USER_A]])
    client = TestClient(app)
    try:
        resp = client.post(
            f"{BASE}/users/bulk-link",
            json={"rich_menu_id": 1, "user_ids": [USER_A, USER_B]},
        )
    finally:
        client.close()
        _clear()

    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Validation — userId format / bulk size enforced by schema (422)
# ---------------------------------------------------------------------------


def test_link_422_on_bad_user_id_format():
    # single-link user_id path param must be validated like the bulk list
    _override(role=UserRole.ADMIN)
    client = TestClient(app)
    try:
        resp = client.post(f"{BASE}/1/users/not-a-line-id")
    finally:
        client.close()
        _clear()

    assert resp.status_code == 422


def test_bulk_link_422_on_bad_userid_format():
    _override(role=UserRole.ADMIN)
    client = TestClient(app)
    try:
        resp = client.post(
            f"{BASE}/users/bulk-link",
            json={"rich_menu_id": 1, "user_ids": ["not-a-line-id"]},
        )
    finally:
        client.close()
        _clear()

    assert resp.status_code == 422


# ---------------------------------------------------------------------------
# Unlink — 404 IDOR; no synced-guard (works even if menu lost its LINE id)
# ---------------------------------------------------------------------------


def test_unlink_404_when_user_unknown_idor():
    # 1st query -> rich menu (any); 2nd query -> user lookup returns None
    _override(role=UserRole.ADMIN, results=[_menu(), None])
    client = TestClient(app)
    try:
        resp = client.delete(f"{BASE}/1/users/{USER_A}")
    finally:
        client.close()
        _clear()

    assert resp.status_code == 404


def test_unlink_404_when_rich_menu_missing():
    _override(role=UserRole.ADMIN, results=[None])
    client = TestClient(app)
    try:
        resp = client.delete(f"{BASE}/999/users/{USER_A}")
    finally:
        client.close()
        _clear()

    assert resp.status_code == 404
