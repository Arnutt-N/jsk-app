"""Login rate-limit tests (review finding M1).

POST /auth/login was the only auth route without a limiter — unlimited online
password guessing against bcrypt-hashed accounts. The fix reuses the existing
_auth_rate_limit_exceeded helper (Redis fixed-window with in-process fallback)
keyed by client IP + username, BEFORE any DB/password work.
"""
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from app.api import deps
from app.api.deps import get_db as deps_get_db
from app.core.permissions import invalidate_cache
from app.main import app

BASE = "/api/v1/auth/login"


def _override_db():
    """No-DB session: the 401 path only writes an audit log + commits."""
    invalidate_cache()

    class _Result:
        def scalar_one_or_none(self):
            return None  # unknown user → invalid-credentials path

    class _DB:
        added = []

        async def execute(self, stmt):
            return _Result()

        def add(self, obj):
            pass

        async def commit(self):
            pass

        async def refresh(self, obj):
            pass

    async def _get_db():
        yield _DB()

    app.dependency_overrides[deps_get_db] = _get_db


def _clear():
    app.dependency_overrides.clear()
    invalidate_cache()


def _client():
    return TestClient(app)


def test_login_429_when_limiter_exhausted():
    """fixed_window_allow → False (exhausted) must 429 BEFORE touching the DB."""
    with patch(
        "app.api.v1.endpoints.auth.redis_client.fixed_window_allow",
        new=AsyncMock(return_value=False),
    ) as allow, patch(
        "app.api.v1.endpoints.auth.create_audit_log", new=AsyncMock()
    ):
        client = _client()
        try:
            resp = client.post(BASE, json={"username": "admin", "password": "x"})
        finally:
            client.close()

    assert resp.status_code == 429
    assert "Too many login attempts" in resp.json()["detail"]
    allow.assert_awaited_once()
    assert allow.await_args.args[0].startswith("ratelimit:auth:login:")


def test_login_proceeds_when_limiter_allows():
    """fixed_window_allow → True must reach the normal invalid-credentials 401
    (proves the limiter sits on the login route without blocking clean traffic)."""
    _override_db()
    try:
        with patch(
            "app.api.v1.endpoints.auth.redis_client.fixed_window_allow",
            new=AsyncMock(return_value=True),
        ), patch(
            "app.api.v1.endpoints.auth.create_audit_log", new=AsyncMock()
        ):
            client = _client()
            try:
                resp = client.post(
                    BASE, json={"username": "nonexistent-user", "password": "wrong"}
                )
            finally:
                client.close()
    finally:
        _clear()

    assert resp.status_code == 401
    assert resp.json()["detail"] == "Invalid username or password"
