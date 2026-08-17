"""Tests for PR C gate observability (app/core/pseudonym_gate.py + health endpoint).

PR C contract phase: `record_fallback_hit` has been deleted (the plaintext
fallback path no longer exists), so the tests focus on `get_gate_status`
read paths: Redis connected + absent key must prove zero hits (source
"redis"), Redis unreachable falls back to the in-memory counter, and
pseudonym mode short-circuits the gate.
"""
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException, status
from fastapi.testclient import TestClient

from app.api import deps
from app.core import pseudonym_gate
from app.main import app
from app.models.user import UserRole


async def _override_get_current_admin():
    return SimpleNamespace(id=1, role=UserRole.ADMIN, username="admin")


async def _override_get_current_user_unauthorized():
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")


@pytest.fixture(autouse=True)
def _reset_gate_counters():
    """Each test starts with a clean in-memory counter."""
    pseudonym_gate.reset_local_counter()
    yield
    pseudonym_gate.reset_local_counter()


# ── 1. get_gate_status reports zero hits when none recorded ──────────


@pytest.mark.asyncio
async def test_get_gate_status_zero_hits_pass():
    with patch.object(
        pseudonym_gate.settings, "LINE_ID_STORAGE_MODE", "dual"
    ), patch.object(
        pseudonym_gate, "_get_redis_count", new=AsyncMock(return_value=0)
    ), patch.object(
        pseudonym_gate, "_get_redis_first_hit_at", new=AsyncMock(return_value=None)
    ):
        status = await pseudonym_gate.get_gate_status()

    assert status["fallback_hit_count"] == 0
    assert status["fallback_hit_source"] == "redis"
    assert status["gate_status"] == "pass"
    assert status["storage_mode"] == "dual"
    assert status["first_hit_at"] is None


# ── 2. get_gate_status reports fail when hits recorded in Redis ──────


@pytest.mark.asyncio
async def test_get_gate_status_fail_when_hits_recorded():
    with patch.object(
        pseudonym_gate.settings, "LINE_ID_STORAGE_MODE", "dual"
    ), patch.object(
        pseudonym_gate, "_get_redis_count", new=AsyncMock(return_value=3)
    ), patch.object(
        pseudonym_gate, "_get_redis_first_hit_at", new=AsyncMock(return_value=1700000000.0)
    ):
        status = await pseudonym_gate.get_gate_status()

    assert status["fallback_hit_count"] == 3
    assert status["fallback_hit_source"] == "redis"
    assert status["gate_status"] == "fail"
    assert status["first_hit_at"] is not None


# ── 3. get_gate_status falls back to memory when Redis is unavailable ──


@pytest.mark.asyncio
async def test_get_gate_status_falls_back_to_memory_when_redis_down(monkeypatch):
    # Simulate a pre-cutover hit recorded in this worker's memory.
    monkeypatch.setattr(pseudonym_gate, "_LOCAL_COUNT", 1)
    monkeypatch.setattr(pseudonym_gate, "_LOCAL_FIRST_HIT_AT", 1700000000.0)

    with patch.object(
        pseudonym_gate.settings, "LINE_ID_STORAGE_MODE", "dual"
    ), patch.object(
        pseudonym_gate, "_get_redis_count", new=AsyncMock(return_value=None)
    ), patch.object(
        pseudonym_gate, "_get_redis_first_hit_at", new=AsyncMock(return_value=None)
    ):
        status = await pseudonym_gate.get_gate_status()

    assert status["fallback_hit_count"] == 1
    assert status["fallback_hit_source"] == "memory_redis_unavailable"
    assert status["gate_status"] == "fail"
    assert status["redis"]["hit_count"] is None
    assert status["local_worker"]["hit_count"] == 1


# ── 4. pseudonym mode short-circuits the gate ────────────────────────


@pytest.mark.asyncio
async def test_get_gate_status_pseudonym_mode_no_fallback():
    with patch.object(
        pseudonym_gate.settings, "LINE_ID_STORAGE_MODE", "pseudonym"
    ), patch.object(
        pseudonym_gate, "_get_redis_count", new=AsyncMock(return_value=0)
    ), patch.object(
        pseudonym_gate, "_get_redis_first_hit_at", new=AsyncMock(return_value=None)
    ):
        status = await pseudonym_gate.get_gate_status()

    assert status["gate_status"] == "pseudonym_mode_no_fallback"


# ── 5. Connected Redis with absent key proves zero hits (source "redis") ──


@pytest.mark.asyncio
async def test_get_redis_count_connected_redis_absent_key_returns_zero(monkeypatch):
    """Key absent while Redis is connected → 0, NOT None (reserved for unreachable)."""
    fake_redis = MagicMock()
    fake_redis.get = AsyncMock(return_value=None)
    monkeypatch.setattr(pseudonym_gate.redis_client, "_redis", fake_redis)

    count = await pseudonym_gate._get_redis_count()

    assert count == 0


@pytest.mark.asyncio
async def test_get_gate_status_connected_redis_absent_key_reports_zero_from_redis(monkeypatch):
    fake_redis = MagicMock()
    fake_redis.get = AsyncMock(return_value=None)
    monkeypatch.setattr(pseudonym_gate.redis_client, "_redis", fake_redis)

    with patch.object(pseudonym_gate.settings, "LINE_ID_STORAGE_MODE", "dual"):
        status = await pseudonym_gate.get_gate_status()

    assert status["fallback_hit_count"] == 0
    assert status["fallback_hit_source"] == "redis"
    assert status["gate_status"] == "pass"
    assert status["redis"]["hit_count"] == 0
    assert status["redis"]["connected"] is True


@pytest.mark.asyncio
async def test_get_redis_count_unreachable_redis_returns_none(monkeypatch):
    monkeypatch.setattr(pseudonym_gate.redis_client, "_redis", None)

    count = await pseudonym_gate._get_redis_count()

    assert count is None


# ── 6. record_fallback_hit is gone (contract phase) ──────────────────


def test_record_fallback_hit_removed():
    """The fallback recorder was deleted with the plaintext fallback path."""
    assert not hasattr(pseudonym_gate, "record_fallback_hit")


# ── 7. GET /api/v1/health/pseudonym-gate endpoint — admin auth ──────


def test_pseudonym_gate_endpoint_requires_auth():
    """Unauthenticated request → 401 (gate must reject anonymous callers)."""
    app.dependency_overrides[deps.get_current_user] = _override_get_current_user_unauthorized
    client = TestClient(app)
    try:
        response = client.get("/api/v1/health/pseudonym-gate")
    finally:
        client.close()
        app.dependency_overrides.clear()
    assert response.status_code == 401


def test_pseudonym_gate_endpoint_returns_status_for_admin():
    app.dependency_overrides[deps.get_current_admin] = _override_get_current_admin
    app.dependency_overrides[deps.get_current_user] = _override_get_current_admin
    try:
        with patch.object(
            pseudonym_gate.settings, "LINE_ID_STORAGE_MODE", "dual"
        ), patch.object(
            pseudonym_gate, "_get_redis_count", new=AsyncMock(return_value=0)
        ), patch.object(
            pseudonym_gate, "_get_redis_first_hit_at", new=AsyncMock(return_value=None)
        ):
            client = TestClient(app)
            try:
                response = client.get("/api/v1/health/pseudonym-gate")
            finally:
                client.close()
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    body = response.json()
    assert body["gate"] == "pr_c_line_id_pseudonymization"
    assert body["storage_mode"] == "dual"
    assert body["fallback_hit_count"] == 0
    assert body["gate_status"] == "pass"
    assert "note" in body
