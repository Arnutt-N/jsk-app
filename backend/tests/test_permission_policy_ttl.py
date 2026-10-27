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
    """A raising re-read must deny, not serve the possibly-revoked policy."""
    permissions._policy_cache = {**DEFAULT_POLICY}
    _age_cache(POLICY_CACHE_TTL_SECONDS + 1)

    # Reproduce a DB outage during the refresh.
    with patch.object(
        permissions, "load_policy", new=AsyncMock(side_effect=RuntimeError("db down"))
    ):
        db = AsyncMock()
        await refresh_policy_if_stale(db)

    assert permissions._policy_cache is None, (
        "a failed refresh must clear the cache so the next check fails closed "
        "instead of serving the stale matrix"
    )


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
