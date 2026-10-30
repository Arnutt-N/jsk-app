"""F-002: bound how long a stale permission policy can be served.

`_policy_cache` is per-process. Only the worker that handled the PATCH calls
`load_policy`, so every other gunicorn/Koyeb worker keeps evaluating the old
matrix indefinitely — a revocation never reaches them.

The fix is a short-TTL re-read (not pub/sub): the async refresh helper reloads
the matrix when the cache is older than `POLICY_CACHE_TTL_SECONDS`, and fails
closed if the reload raises, so a broken DB denies rather than serving a policy
that may already have been revoked.

These tests drive the refresh helper directly with a stubbed session, so they
need no live DB.
"""

from __future__ import annotations

import time
from unittest.mock import AsyncMock, patch

import pytest

from app.core import permissions
from app.core.permissions import (
    ALL_PERMISSION_KEYS,
    DEFAULT_POLICY,
    KEY_ACCESS_LIVE_CHAT,
    POLICY_CACHE_TTL_SECONDS,
    refresh_policy_if_stale,
)
from app.models.user import UserRole


@pytest.fixture(autouse=True)
def _restore_cache():
    """Each test starts from a clean cache and leaves the module as it found it."""
    permissions.invalidate_cache()
    yield
    permissions.invalidate_cache()


def _age_cache(seconds: float) -> None:
    """Backdate the cache stamp so the entry looks `seconds` old."""
    permissions._policy_loaded_at = time.monotonic() - seconds


@pytest.mark.asyncio
async def test_fresh_cache_does_not_hit_the_database():
    """Inside the TTL the in-process fast path is untouched."""
    permissions._policy_cache = {**DEFAULT_POLICY}
    permissions._policy_loaded_at = time.monotonic()

    db = AsyncMock()
    await refresh_policy_if_stale(db)

    db.execute.assert_not_called()


@pytest.mark.asyncio
async def test_stale_cache_is_reloaded():
    """Past the TTL the matrix is re-read from the DB."""
    permissions._policy_cache = {**DEFAULT_POLICY}
    _age_cache(POLICY_CACHE_TTL_SECONDS + 1)

    db = AsyncMock()
    await refresh_policy_if_stale(db)

    db.execute.assert_awaited_once()


@pytest.mark.asyncio
async def test_absent_cache_is_loaded():
    """No cache at all means load, regardless of the stamp."""
    permissions._policy_cache = None
    permissions._policy_loaded_at = None

    db = AsyncMock()
    await refresh_policy_if_stale(db)

    db.execute.assert_awaited_once()


@pytest.mark.asyncio
async def test_reload_failure_fails_closed():
    """A raising re-read must deny every key, not fall back to DEFAULT_POLICY.

    Clearing the cache (`_policy_cache is None`) is NOT fail-closed here:
    `_allowed_for` then falls back to DEFAULT_POLICY, which is wider than a
    hardened matrix, so a DB flap would restore revoked rights (F-004).
    """
    # A hardened matrix: AGENT revoked from live chat.
    hardened = {**DEFAULT_POLICY}
    hardened[KEY_ACCESS_LIVE_CHAT] = frozenset(
        {UserRole.SUPER_ADMIN, UserRole.ADMIN}
    )
    permissions._policy_cache = hardened
    _age_cache(POLICY_CACHE_TTL_SECONDS + 1)

    # Reproduce a DB outage during the refresh.
    with patch.object(
        permissions, "load_policy", new=AsyncMock(side_effect=RuntimeError("db down"))
    ):
        db = AsyncMock()
        await refresh_policy_if_stale(db)

    assert permissions._policy_cache is not None, (
        "a failed refresh must leave a populated cache; None would fall back "
        "to the permissive DEFAULT_POLICY"
    )
    assert permissions._policy_cache == {key: frozenset() for key in ALL_PERMISSION_KEYS}, (
        "a failed refresh must deny every key"
    )
    assert permissions.can(UserRole.AGENT, KEY_ACCESS_LIVE_CHAT) is False


@pytest.mark.asyncio
async def test_revocation_visible_after_ttl():
    """End-to-end shape: a role removed from the matrix loses the key after TTL."""
    permissions._policy_cache = {
        **DEFAULT_POLICY,
        KEY_ACCESS_LIVE_CHAT: frozenset({UserRole.AGENT}),
    }
    permissions._policy_loaded_at = time.monotonic()

    # Inside the TTL the cached entry still grants AGENT.
    assert permissions.can(UserRole.AGENT, KEY_ACCESS_LIVE_CHAT)

    # A different worker rewrites the row: the key now grants only SUPER_ADMIN.
    # (An empty result would fall back to DEFAULT_POLICY, which still includes
    # AGENT — the revocation has to be an explicit DB row.)
    class _Row:
        key = KEY_ACCESS_LIVE_CHAT
        allowed_roles = [UserRole.SUPER_ADMIN.value]

    _age_cache(POLICY_CACHE_TTL_SECONDS + 1)

    async def _execute(_stmt):
        class _Rows:
            def scalars(self):
                return self

            def all(self):
                return [_Row()]

        return _Rows()

    db = AsyncMock()
    db.execute = _execute
    await refresh_policy_if_stale(db)

    assert not permissions.can(UserRole.AGENT, KEY_ACCESS_LIVE_CHAT), (
        "after the TTL the revoked role must lose the key"
    )
    assert permissions.can(UserRole.SUPER_ADMIN, KEY_ACCESS_LIVE_CHAT)


# --- F-004: a failed read must deny, not fall back to the permissive default --


@pytest.mark.asyncio
async def test_failed_read_denies_instead_of_substituting_defaults():
    """A DB outage must not widen access.

    DEFAULT_POLICY is the *bootstrap* policy, and it is more permissive than a
    hardened production matrix — an exception used to swap it in for the life
    of the process, so a transient read error silently restored rights an
    operator had revoked.
    """
    # A hardened matrix: only SUPER_ADMIN may reach live chat.
    permissions._policy_cache = {
        **DEFAULT_POLICY,
        KEY_ACCESS_LIVE_CHAT: frozenset({UserRole.SUPER_ADMIN}),
    }
    permissions._policy_loaded_at = time.monotonic()

    async def _boom(_stmt):
        raise RuntimeError("db down")

    db = AsyncMock()
    db.execute = _boom

    await permissions.load_policy(db)

    assert not permissions.can(UserRole.ADMIN, KEY_ACCESS_LIVE_CHAT), (
        "after a failed read every key must deny — the old behaviour restored "
        "the permissive DEFAULT_POLICY, silently undoing the revocation"
    )
    assert not permissions.can(UserRole.AGENT, KEY_ACCESS_LIVE_CHAT)


@pytest.mark.asyncio
async def test_failed_read_denies_every_key():
    """Not just the one key a test happens to check."""
    await permissions.load_policy(_failing_db())

    for key in ALL_PERMISSION_KEYS:
        for role in UserRole:
            assert not permissions.can(role, key), f"{role} still holds {key}"


@pytest.mark.asyncio
async def test_healthy_read_still_applies_the_db_matrix():
    """The deny path must not swallow the working path."""
    class _Row:
        key = KEY_ACCESS_LIVE_CHAT
        allowed_roles = [UserRole.AGENT.value]

    class _Rows:
        def scalars(self):
            return self

        def all(self):
            return [_Row()]

    async def _execute(_stmt):
        return _Rows()

    db = AsyncMock()
    db.execute = _execute
    await permissions.load_policy(db)

    assert permissions.can(UserRole.AGENT, KEY_ACCESS_LIVE_CHAT)
    assert not permissions.can(UserRole.ADMIN, KEY_ACCESS_LIVE_CHAT)


def _failing_db() -> AsyncMock:
    async def _boom(_stmt):
        raise RuntimeError("db down")

    db = AsyncMock()
    db.execute = _boom
    return db
