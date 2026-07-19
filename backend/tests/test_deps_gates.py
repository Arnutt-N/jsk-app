"""Unit tests for the role-based dependency gates in app.api.deps.

These exercise the pure role check inside get_current_manager and
get_current_staff by passing a SimpleNamespace user directly (bypassing
the Depends(get_current_user) chain), mirroring the lightweight mocking
style in test_auth_login.py.

Context: get_current_manager was added (Phase 1) to let DIRECTOR/HEAD
reach request-workflow endpoints whose inner can_* guards already gate
the sensitive operations. get_current_staff was widened to include
DIRECTOR/HEAD so the two supervisor roles share staff surfaces with
front-line AGENTs.

P1.2a: the three gate functions now delegate to app.core.permissions.can()
reading the DB-backed policy (PermissionSetting table) with DEFAULT_POLICY
fallback. The first block below covers the DEFAULT_POLICY path (ships-
dark); the second block covers the DB-backed path (cache invalidation
after a PATCH-style policy flip via _policy_cache direct injection).
"""
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.api.deps import (
    get_current_admin,
    get_current_manager,
    get_current_staff,
    require_permission,
)
from app.core import permissions as perms_module
from app.core.permissions import (
    KEY_ACCESS_ADMIN_ENDPOINTS,
    KEY_ACCESS_MANAGER_ENDPOINTS,
    KEY_ACCESS_STAFF_ENDPOINTS,
    KEY_MANAGE_USERS,
    invalidate_cache,
)
from app.models.user import UserRole


def _user(role: UserRole) -> SimpleNamespace:
    return SimpleNamespace(role=role)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "role,allowed",
    [
        (UserRole.SUPER_ADMIN, True),
        (UserRole.ADMIN, True),
        (UserRole.DIRECTOR, True),
        (UserRole.HEAD, True),
        (UserRole.AGENT, False),  # front-line AGENT is NOT a manager
        (UserRole.USER, False),
    ],
)
async def test_get_current_manager_role_gate(role: UserRole, allowed: bool) -> None:
    if allowed:
        result = await get_current_manager(current_user=_user(role))
        assert result.role is role
    else:
        with pytest.raises(HTTPException) as exc_info:
            await get_current_manager(current_user=_user(role))
        assert exc_info.value.status_code == 403


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "role,allowed",
    [
        (UserRole.SUPER_ADMIN, True),
        (UserRole.ADMIN, True),
        (UserRole.DIRECTOR, True),  # widened in Phase 1
        (UserRole.HEAD, True),      # widened in Phase 1
        (UserRole.AGENT, True),
        (UserRole.USER, False),     # public role stays out of staff surfaces
    ],
)
async def test_get_current_staff_role_gate(role: UserRole, allowed: bool) -> None:
    if allowed:
        result = await get_current_staff(current_user=_user(role))
        assert result.role is role
    else:
        with pytest.raises(HTTPException) as exc_info:
            await get_current_staff(current_user=_user(role))
        assert exc_info.value.status_code == 403


@pytest.mark.asyncio
async def test_manager_gate_excludes_public_user() -> None:
    """Regression: the public USER role must never pass the manager gate."""
    with pytest.raises(HTTPException) as exc_info:
        await get_current_manager(current_user=_user(UserRole.USER))
    assert exc_info.value.status_code == 403
    assert exc_info.value.detail == "Insufficient permissions"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "role,allowed",
    [
        (UserRole.SUPER_ADMIN, True),
        (UserRole.ADMIN, True),
        (UserRole.DIRECTOR, False),  # admin gate stays strict
        (UserRole.HEAD, False),
        (UserRole.AGENT, False),
        (UserRole.USER, False),
    ],
)
async def test_get_current_admin_stays_strict(role: UserRole, allowed: bool) -> None:
    """get_current_admin must remain ADMIN/SUPER_ADMIN-only.

    This is the gate DELETE /requests, create_request, and every
    sensitive endpoint (credentials, permission settings, user CRUD)
    rely on. If someone widens it to include DIRECTOR/HEAD, this test
    fails and flags the privilege change for review.
    """
    if allowed:
        result = await get_current_admin(current_user=_user(role))
        assert result.role is role
    else:
        with pytest.raises(HTTPException) as exc_info:
            await get_current_admin(current_user=_user(role))
        assert exc_info.value.status_code == 403


# ---------------------------------------------------------------------------
# require_permission factory (Phase 3 — module permission gate).
# require_permission(key) returns an async dependency _dependency(current_user)
# that resolves to the DB-backed policy with DEFAULT_POLICY fallback. With the
# cache cleared, manage_users defaults to {SUPER_ADMIN, ADMIN}, so ADMIN/
# SUPER_ADMIN pass and AGENT/USER are rejected with 403.
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "role,allowed",
    [
        (UserRole.SUPER_ADMIN, True),
        (UserRole.ADMIN, True),
        (UserRole.AGENT, False),
        (UserRole.USER, False),
    ],
)
async def test_require_permission_manage_users_gate(role: UserRole, allowed: bool) -> None:
    # Ensure DEFAULT_POLICY applies (no DB row leaked from another test).
    invalidate_cache()
    dependency = require_permission(KEY_MANAGE_USERS)

    if allowed:
        result = await dependency(current_user=_user(role))
        assert result.role is role
    else:
        with pytest.raises(HTTPException) as exc_info:
            await dependency(current_user=_user(role))
        assert exc_info.value.status_code == 403


# ---------------------------------------------------------------------------
# P1.2a — DB-backed policy flip path for the 3 access-gate keys.
# can() reads _policy_cache when populated; the cache is normally fed by
# load_policy(db) after a PATCH /permissions. Here we inject the cache
# directly to simulate a SUPER_ADMIN edit, then invalidate to restore
# DEFAULT_POLICY for the next test. Each test toggles one role on a key
# and confirms the gate flips accordingly.
# ---------------------------------------------------------------------------


def _set_policy_cache(key: str, roles: set) -> None:
    """Inject a DB-style policy entry into the in-process cache.

    Mirrors the shape load_policy(db) produces: dict[str, frozenset[UserRole]].
    """
    invalidate_cache()  # start clean
    perms_module._policy_cache = {**perms_module.DEFAULT_POLICY, key: frozenset(roles)}


@pytest.mark.asyncio
async def test_admin_gate_allows_director_when_db_grants() -> None:
    """DIRECTOR is rejected under DEFAULT_POLICY but accepted once a DB
    row grants DIRECTOR access_admin_endpoints (cache reflects the flip)."""
    try:
        # Baseline: DEFAULT_POLICY rejects DIRECTOR.
        invalidate_cache()
        with pytest.raises(HTTPException) as exc_info:
            await get_current_admin(current_user=_user(UserRole.DIRECTOR))
        assert exc_info.value.status_code == 403

        # Flip: grant DIRECTOR access_admin_endpoints.
        _set_policy_cache(
            KEY_ACCESS_ADMIN_ENDPOINTS,
            {UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.DIRECTOR},
        )
        result = await get_current_admin(current_user=_user(UserRole.DIRECTOR))
        assert result.role is UserRole.DIRECTOR
    finally:
        invalidate_cache()


@pytest.mark.asyncio
async def test_manager_gate_rejects_agent_when_db_removes() -> None:
    """AGENT never had access_manager_endpoints (DEFAULT excludes it).
    Confirm DB flip to explicitly include AGENT grants it; flip back to
    exclude restores the 403."""
    try:
        invalidate_cache()
        with pytest.raises(HTTPException) as exc_info:
            await get_current_manager(current_user=_user(UserRole.AGENT))
        assert exc_info.value.status_code == 403

        _set_policy_cache(
            KEY_ACCESS_MANAGER_ENDPOINTS,
            {UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.DIRECTOR, UserRole.HEAD, UserRole.AGENT},
        )
        result = await get_current_manager(current_user=_user(UserRole.AGENT))
        assert result.role is UserRole.AGENT
    finally:
        invalidate_cache()


@pytest.mark.asyncio
async def test_staff_gate_rejects_user_and_accepts_agent_by_default() -> None:
    """USER (public) is never staff. AGENT is staff by default."""
    try:
        invalidate_cache()
        result = await get_current_staff(current_user=_user(UserRole.AGENT))
        assert result.role is UserRole.AGENT

        with pytest.raises(HTTPException) as exc_info:
            await get_current_staff(current_user=_user(UserRole.USER))
        assert exc_info.value.status_code == 403

        # Even a DB flip cannot grant USER access_staff_endpoints without
        # also widening the allowed set -- verify the flip path works.
        _set_policy_cache(
            KEY_ACCESS_STAFF_ENDPOINTS,
            {UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.AGENT, UserRole.DIRECTOR, UserRole.HEAD, UserRole.USER},
        )
        result = await get_current_staff(current_user=_user(UserRole.USER))
        assert result.role is UserRole.USER
    finally:
        invalidate_cache()


@pytest.mark.asyncio
async def test_gate_composes_on_top_of_auth_not_replace() -> None:
    """The gate functions receive an already-authenticated `current_user`
    from get_current_user; they only check the role. Passing None role is
    rejected (can(None, ...) returns False)."""
    try:
        invalidate_cache()
        none_role_user = SimpleNamespace(role=None)
        with pytest.raises(HTTPException) as exc_info:
            await get_current_admin(current_user=none_role_user)
        assert exc_info.value.status_code == 403
    finally:
        invalidate_cache()
