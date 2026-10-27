"""F-001: live-chat HTTP writes must be gated on KEY_ACCESS_LIVE_CHAT.

Before the fix every state-changing route in `admin_live_chat.py` resolved its
caller through `get_current_staff`, which checks `KEY_ACCESS_STAFF_ENDPOINTS`
— a set that includes DIRECTOR and HEAD. The WebSocket gate checks
`KEY_ACCESS_LIVE_CHAT`, which does not. So a DIRECTOR could issue live-chat
writes over HTTP that the socket would have refused.

Two layers are pinned here, both without a live DB or app lifespan:

1. **Wiring (AST)** — every state-changing route in `admin_live_chat.py`
   depends on the module-level `require_live_chat_access`, and every read
   route still depends on the permissive `deps.get_current_staff`. This is the
   assertion that would have failed before the fix.
2. **Behaviour (unit)** — the dependency itself rejects roles outside the
   live-chat policy and admits roles inside it. `require_permission` only calls
   `can(role, key)`, so it is exercised directly with a stubbed `get_current_user`
   rather than through a TestClient (which needs the app lifespan, a DB, and a
   single shared event loop).

The split also keeps this file independent of test ordering: nothing here opens
a connection, so it cannot perturb the session-scoped app fixture.
"""

from __future__ import annotations

import ast
import pathlib

import pytest
from fastapi import HTTPException

from app.api import deps
from app.core.permissions import DEFAULT_POLICY, KEY_ACCESS_LIVE_CHAT, can
from app.models.user import User, UserRole

ENDPOINT_PATH = (
    pathlib.Path(__file__).resolve().parents[1]
    / "app"
    / "api"
    / "v1"
    / "endpoints"
    / "admin_live_chat.py"
)

# Every state-changing route in the module, by handler name.
WRITE_HANDLERS = {
    "send_message",
    "send_media",
    "claim_conversation",
    "close_conversation",
    "transfer_conversation",
    "toggle_mode",
    "refresh_profile",
    "create_conversation",
    "archive_conversation",
    "update_conversation_preferences",
    "delete_conversation",
}

# Read / page-load routes: these keep a permissive, non-live-chat gate on
# purpose. `get_analytics` / `get_operator_stats` are also admin-only, hence
# the different expected gate.
READ_HANDLERS = {
    "list_conversations": "deps.get_current_staff",
    "get_conversation": "deps.get_current_staff",
    "mark_conversation_read": "deps.get_current_staff",
    "get_conversation_messages": "deps.get_current_staff",
    "search_messages": "deps.get_current_staff",
    "get_analytics": "deps.get_current_admin",
    "get_operator_stats": "deps.get_current_admin",
}


def _handler_dependency(name: str) -> str | None:
    """Return the dependency expression used for the caller in `name`.

    Looks only at the `current_user` / `_current_user` parameter — the first
    `Depends(...)` in a signature is usually `get_db`, which says nothing about
    authorization.
    """
    caller_params = {"current_user", "_current_user"}
    tree = ast.parse(ENDPOINT_PATH.read_text(encoding="utf-8"))

    for node in ast.walk(tree):
        if not isinstance(node, (ast.AsyncFunctionDef, ast.FunctionDef)):
            continue
        if node.name != name:
            continue

        args = node.args.args + node.args.kwonlyargs
        positional = [None] * (len(node.args.args) - len(node.args.defaults))
        positional += list(node.args.defaults)
        kwonly = list(node.args.kw_defaults)
        defaults = positional + kwonly

        for arg, default in zip(args, defaults):
            if arg.arg not in caller_params or default is None:
                continue
            for sub in ast.walk(default):
                if not isinstance(sub, ast.Call):
                    continue
                func = sub.func
                fname = getattr(func, "id", None) or getattr(func, "attr", None)
                if fname != "Depends" or not sub.args:
                    continue
                inner = sub.args[0]
                if isinstance(inner, ast.Name):
                    return inner.id
                if isinstance(inner, ast.Attribute):
                    owner = getattr(inner.value, "id", "")
                    return f"{owner}.{inner.attr}" if owner else inner.attr
        return None

    raise AssertionError(f"handler not found in {ENDPOINT_PATH.name}: {name}")


@pytest.mark.parametrize("handler", sorted(WRITE_HANDLERS))
def test_write_handlers_use_the_live_chat_gate(handler: str):
    """State-changing routes must gate on the live-chat key (F-001)."""
    assert _handler_dependency(handler) == "require_live_chat_access", (
        f"{handler} must depend on require_live_chat_access "
        f"(KEY_ACCESS_LIVE_CHAT); it uses something more permissive, so a "
        f"DIRECTOR/HEAD could write over HTTP that the WebSocket would refuse."
    )


@pytest.mark.parametrize("handler,expected", sorted(READ_HANDLERS.items()))
def test_read_handlers_keep_the_permissive_gate(handler: str, expected: str):
    """Read routes stay on a non-live-chat gate so supervisors can load the page."""
    assert _handler_dependency(handler) == expected


@pytest.mark.parametrize("role", [UserRole.DIRECTOR, UserRole.HEAD, UserRole.VIEWER])
def test_gate_rejects_roles_outside_the_live_chat_policy(role: UserRole):
    """The dependency itself raises 403 for roles outside the policy."""
    assert not can(role, KEY_ACCESS_LIVE_CHAT)

    dependency = deps.require_permission(KEY_ACCESS_LIVE_CHAT)
    user = User(
        id=1,
        username="gate-test",
        hashed_password="x",
        display_name="Gate Test",
        role=role,
        is_active=True,
    )

    with pytest.raises(HTTPException) as exc:
        # The dependency's only free parameter is the resolved caller.
        import asyncio

        asyncio.run(dependency(current_user=user))

    assert exc.value.status_code == 403


@pytest.mark.parametrize("role", sorted(DEFAULT_POLICY[KEY_ACCESS_LIVE_CHAT], key=str))
def test_gate_admits_roles_inside_the_live_chat_policy(role: UserRole):
    """Roles holding the key pass through unchanged."""
    dependency = deps.require_permission(KEY_ACCESS_LIVE_CHAT)
    user = User(
        id=1,
        username="gate-test",
        hashed_password="x",
        display_name="Gate Test",
        role=role,
        is_active=True,
    )

    import asyncio

    assert asyncio.run(dependency(current_user=user)) is user
