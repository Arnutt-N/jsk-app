"""D1: GET /permissions/me must serve any authenticated user.

The frontend calls /me to decide which workflow buttons (assign / accept /
start / ...) to render. It was gated on get_current_admin, so non-admin
staff (AGENT/DIRECTOR/HEAD) got 403 and their request pages mis-rendered.

Fixed contract: /me requires only an authenticated user. The matrix
endpoints (GET/PATCH /permissions) stay admin-gated — they read/write the
policy itself, so the lockout defense there is unchanged.
"""
from types import SimpleNamespace

from fastapi.testclient import TestClient

from app.api import deps
from app.core.config import settings
from app.main import app
from app.models.user import UserRole

ME = "/api/v1/admin/settings/permissions/me"
MATRIX = "/api/v1/admin/settings/permissions"


def _agent_user():
    return SimpleNamespace(id=11, username="agent-1", role=UserRole.AGENT)


def _use_user(user):
    async def _override():
        return user

    app.dependency_overrides[deps.get_current_user] = _override

    def teardown():
        app.dependency_overrides.clear()

    return teardown


def test_agent_can_read_own_permissions():
    teardown = _use_user(_agent_user())
    client = TestClient(app)
    try:
        res = client.get(ME)
    finally:
        client.close()
        teardown()

    assert res.status_code == 200
    body = res.json()
    assert body["role"] == UserRole.AGENT.value
    assert body["can_assign"] is False


def test_unauthenticated_me_returns_401(monkeypatch):
    monkeypatch.setattr(settings, "DEV_AUTH_BYPASS", False)
    client = TestClient(app)
    try:
        res = client.get(ME)
    finally:
        client.close()

    assert res.status_code == 401


def test_matrix_endpoints_stay_admin_gated():
    teardown = _use_user(_agent_user())
    client = TestClient(app)
    try:
        res_get = client.get(MATRIX)
        res_patch = client.patch(MATRIX, json={"updates": []})
    finally:
        client.close()
        teardown()

    assert res_get.status_code == 403
    assert res_patch.status_code == 403
