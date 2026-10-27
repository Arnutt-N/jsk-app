"""F-001: live-chat HTTP writes must be gated on KEY_ACCESS_LIVE_CHAT.

Before the fix every state-changing route in `admin_live_chat.py` resolved its
caller through `get_current_staff`, which checks `KEY_ACCESS_STAFF_ENDPOINTS`
— a set that includes DIRECTOR and HEAD. The WebSocket gate checks
`KEY_ACCESS_LIVE_CHAT`, which does not. So a DIRECTOR could issue live-chat
writes over HTTP that the socket would have refused.

These tests pin the fix: every state-changing route resolves the caller through
`require_permission(KEY_ACCESS_LIVE_CHAT)`, so a role outside that policy set
is rejected by the dependency BEFORE any handler body runs. Read/page-load
routes keep the permissive `get_current_staff` gate on purpose (two-gate
design: supervisors may load the page and discover the feature).

The assertions deliberately do not require a live DB row: the permission gate
runs as a FastAPI dependency, ahead of the handler, so a 403 proves the gate
fired. Where a route would otherwise reach the DB first, the expectation is
still 403 — a 404/500 there would mean the gate did not run.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.api import deps
from app.core.permissions import KEY_ACCESS_LIVE_CHAT
from app.main import app
from app.models.user import User, UserRole


def _make_user(role: UserRole) -> User:
    return User(
        id=1,
        username="gate-test",
        hashed_password="x",
        display_name="Gate Test",
        role=role,
        is_active=True,
    )


@pytest.fixture(scope="module")
def _client():
    """One TestClient for the module.

    Creating a TestClient per parametrized case leaves the previous one's event
    loop closed while its backend DB/Redis clients still hold it, which surfaces
    as "Event loop is closed" in unrelated cases. Shares the app lifespan, which
    is what these gate tests want anyway.
    """
    from app.main import app as fastapi_app

    with TestClient(fastapi_app) as client:
        yield client


@pytest.fixture
def as_role():
    """Return a helper that installs a caller of the given role."""
    installed: list[User] = []

    def _install(role: UserRole) -> None:
        user = _make_user(role)
        installed.append(user)
        app.dependency_overrides[deps.get_current_user] = lambda: user
        app.dependency_overrides[deps.get_current_staff] = lambda: user

    yield _install

    app.dependency_overrides.clear()


# (method, path) for every state-changing live-chat route. Path params use a
# placeholder that never exists as a row: the permission dependency still runs
# first, so a role outside the policy gets 403 regardless.
WRITE_ROUTES = [
    ("post", "/api/v1/admin/live-chat/conversations/Udeadbeef/messages"),
    ("post", "/api/v1/admin/live-chat/conversations/Udeadbeef/media"),
    ("post", "/api/v1/admin/live-chat/conversations/Udeadbeef/claim"),
    ("post", "/api/v1/admin/live-chat/conversations/Udeadbeef/close"),
    ("post", "/api/v1/admin/live-chat/conversations/Udeadbeef/transfer"),
    ("post", "/api/v1/admin/live-chat/conversations/Udeadbeef/mode"),
    ("post", "/api/v1/admin/live-chat/conversations/Udeadbeef/refresh-profile"),
    ("patch", "/api/v1/admin/live-chat/conversations/Udeadbeef/archive"),
    ("patch", "/api/v1/admin/live-chat/conversations/Udeadbeef/preferences"),
    ("delete", "/api/v1/admin/live-chat/conversations/Udeadbeef"),
    ("post", "/api/v1/admin/live-chat/conversations"),
]


@pytest.mark.parametrize("method,path", WRITE_ROUTES)
@pytest.mark.parametrize("role", [UserRole.DIRECTOR, UserRole.HEAD])
def test_write_routes_reject_roles_outside_live_chat_policy(
    as_role, _client, method: str, path: str, role: UserRole
):
    """DIRECTOR/HEAD pass the staff gate but not the live-chat one."""
    as_role(role)

    # delete() has no body parameter in httpx; the gate runs before any
    # handler body would read one anyway.
    request = getattr(_client, method)
    response = request(path) if method == "delete" else request(path, json={})

    assert response.status_code == 403, (
        f"{method.upper()} {path} must be gated on {KEY_ACCESS_LIVE_CHAT} "
        f"(role {role.value}); got {response.status_code}"
    )


@pytest.mark.parametrize("method,path", WRITE_ROUTES)
@pytest.mark.parametrize("role", [UserRole.AGENT, UserRole.ADMIN, UserRole.SUPER_ADMIN])
def test_write_routes_admit_roles_inside_live_chat_policy(
    as_role, _client, method: str, path: str, role: UserRole
):
    """Roles holding the key get past the gate (the handler may fail later)."""
    as_role(role)

    # delete() has no body parameter in httpx; the gate runs before any
    # handler body would read one anyway.
    request = getattr(_client, method)
    response = request(path) if method == "delete" else request(path, json={})

    assert response.status_code != 403, (
        f"{role.value} holds {KEY_ACCESS_LIVE_CHAT} and must not be 403'd by "
        f"the gate on {method.upper()} {path}"
    )
