"""Regression guards: pagination bounds on admin list/search endpoints (F2).

Asserts that out-of-range ``skip``/``limit`` are REJECTED with 422 (explicit
validation, not silent clamping) once ``Query(ge/le)`` bounds are in place,
and locks the Kanban contract: ``GET /admin/requests?limit=200`` must stay
200 OK because the Kanban frontend sends ``limit=200``
(frontend/app/admin/requests/kanban/page.tsx:67).

Scope notes (from the review):
- ``skip=-1`` is asserted on the 5 LIST endpoints only. ``GET
  /messages/search`` has no ``skip`` param and FastAPI ignores unknown
  query params, so ``?skip=-1`` there would return 200 — it is deliberately
  absent from the skip matrix.
- ``limit=999999`` is asserted on the 5 newly-capped endpoints only.
  ``admin_friends`` already caps ``limit`` at :27 (``Query(100, ge=1,
  le=100)``), so a limit test there would pass before the fix; its
  ``skip=-1`` case is the regression guard instead.

No real DB is touched: out-of-range values fail FastAPI validation before
any handler code runs, and the auth gates are bypassed with
``dependency_overrides`` because FastAPI solves dependencies before
validating the endpoint's own query params (without the override the
response would be 401 instead of 422).
"""
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app.api.deps import get_current_admin as deps_admin
from app.api.deps import get_current_manager as deps_manager
from app.api.deps import get_current_staff as deps_staff
from app.api.deps import get_db as deps_get_db
from app.db.session import get_db as session_get_db
from app.main import app

LIST_ENDPOINTS = [
    "/api/v1/admin/auto-replies",
    "/api/v1/admin/intents/categories",
    "/api/v1/admin/reply-objects",
    "/api/v1/admin/requests",
    "/api/v1/admin/friends",
]
# Endpoints that gain a NEW limit cap in F2 (friends excluded — see module
# docstring). messages/search needs its required ``q`` present, otherwise it
# would 422 for the wrong reason.
LIMIT_ENDPOINTS = LIST_ENDPOINTS[:4] + [
    "/api/v1/admin/live-chat/messages/search?q=x"
]


class _EmptyResult:
    """Mimics the SQLAlchemy result shapes used by the list handlers."""

    def scalars(self):
        return self

    def mappings(self):
        return self

    def all(self):
        return []

    def scalar(self):
        return 0


class _StubDB:
    async def execute(self, stmt):
        return _EmptyResult()


async def _stub_db():
    yield _StubDB()


def _fake_user():
    return SimpleNamespace(id=1, role="ADMIN", display_name="pytest")


@pytest.fixture()
def client():
    # Override every gate + both get_db references exactly as the endpoints
    # resolve them (object identity is the dependency_overrides key):
    # - auto_replies/intents/reply_objects/friends gate on get_current_admin
    # - requests gates on get_current_manager; messages/search on
    #   get_current_staff
    # - get_db is unified (R3-M26): deps.get_db IS session.get_db, so both
    #   override keys below now point at the same function object
    app.dependency_overrides[deps_admin] = _fake_user
    app.dependency_overrides[deps_manager] = _fake_user
    app.dependency_overrides[deps_staff] = _fake_user
    app.dependency_overrides[deps_get_db] = _stub_db
    app.dependency_overrides[session_get_db] = _stub_db
    # Plain TestClient without the lifespan context manager: none of these
    # tests need app startup (422s fail FastAPI validation before any
    # handler runs; the Kanban case uses the stub DB), and skipping the
    # lifespan avoids a real DB bootstrap requirement entirely.
    yield TestClient(app)
    app.dependency_overrides.pop(deps_admin, None)
    app.dependency_overrides.pop(deps_manager, None)
    app.dependency_overrides.pop(deps_staff, None)
    app.dependency_overrides.pop(deps_get_db, None)
    app.dependency_overrides.pop(session_get_db, None)


@pytest.mark.parametrize("url", LIST_ENDPOINTS)
def test_negative_skip_rejected_422(client, url):
    response = client.get(url, params={"skip": -1})
    assert response.status_code == 422, response.text


@pytest.mark.parametrize("url", LIMIT_ENDPOINTS)
def test_oversize_limit_rejected_422(client, url):
    response = client.get(url, params={"limit": 999999})
    assert response.status_code == 422, response.text


def test_kanban_limit_200_stays_ok(client):
    """Kanban board fetches /admin/requests?limit=200 — must remain valid.

    Contract lock: guards against a future "tighten to le=100" change that
    would silently break the Kanban board (frontend/app/admin/requests/
    kanban/page.tsx:67 sends exactly limit=200).
    """
    response = client.get("/api/v1/admin/requests", params={"limit": 200})
    assert response.status_code == 200, response.text