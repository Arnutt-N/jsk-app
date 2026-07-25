"""Tests for PR C gate observability (app/core/pseudonym_gate.py + health endpoint)."""
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException, status
from fastapi.testclient import TestClient

from app.api import deps
from app.core import pseudonym_gate
from app.main import app
from app.models.user import UserRole
from app.services import user_identity_service


async def _override_get_current_admin():
    return SimpleNamespace(id=1, role=UserRole.ADMIN, username="admin")


async def _override_get_current_user_unauthorized():
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")


def _make_begin_nested_mock() -> MagicMock:
    ctx = MagicMock()
    ctx.__aenter__ = AsyncMock(return_value=None)
    ctx.__aexit__ = AsyncMock(return_value=False)
    return MagicMock(return_value=ctx)


@pytest.fixture(autouse=True)
def _reset_gate_counters():
    """Each test starts with a clean in-memory counter."""
    pseudonym_gate.reset_local_counter()
    yield
    pseudonym_gate.reset_local_counter()


# ── 1. record_fallback_hit increments the in-memory counter ──────────


@pytest.mark.asyncio
async def test_record_fallback_hit_increments_local_counter():
    assert pseudonym_gate._LOCAL_COUNT == 0
    await pseudonym_gate.record_fallback_hit("Uabc", 42)
    assert pseudonym_gate._LOCAL_COUNT == 1
    assert pseudonym_gate._LOCAL_FIRST_HIT_AT is not None


# ── 2. record_fallback_hit is best-effort (Redis failure does not raise) ──


@pytest.mark.asyncio
async def test_record_fallback_hit_swallows_redis_error():
    with patch.object(
        pseudonym_gate.redis_client, "incr", new=AsyncMock(side_effect=RuntimeError("redis down"))
    ):
        # Must not raise even though Redis is down.
        await pseudonym_gate.record_fallback_hit("Uabc", 42)
    assert pseudonym_gate._LOCAL_COUNT == 1  # local counter still incremented


# ── 3. get_gate_status reports zero hits when none recorded ──────────


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


# ── 4. get_gate_status reports fail when hits recorded ───────────────


@pytest.mark.asyncio
async def test_get_gate_status_fail_when_hits_recorded():
    await pseudonym_gate.record_fallback_hit("Uabc", 42)
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


# ── 5. get_gate_status falls back to memory when Redis is unavailable ──


@pytest.mark.asyncio
async def test_get_gate_status_falls_back_to_memory_when_redis_down():
    await pseudonym_gate.record_fallback_hit("Uabc", 42)
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


# ── 6. pseudonym mode short-circuits the gate ────────────────────────


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


# ── 7. resolve_by_line_id calls record_fallback_hit on plaintext hit ──


@pytest.mark.asyncio
async def test_resolve_by_line_id_records_fallback_hit_on_plaintext_hit():
    legacy_user = SimpleNamespace(
        id=50,
        line_user_id="Udual",
        line_user_id_hash=None,
        line_user_id_encrypted=None,
        line_key_version=None,
    )

    mock_db = AsyncMock()
    call_count = [0]

    async def fake_execute(stmt):
        call_count[0] += 1
        result = MagicMock()
        if call_count[0] == 1:
            result.scalar_one_or_none.return_value = None  # hash miss
        else:
            result.scalar_one_or_none.return_value = legacy_user  # plaintext hit
        return result

    mock_db.execute = fake_execute
    mock_db.begin_nested = _make_begin_nested_mock()

    with patch.object(
        user_identity_service.settings, "LINE_ID_HMAC_KEY", "test-key"
    ), patch.object(
        user_identity_service.settings, "LINE_ID_STORAGE_MODE", "dual"
    ), patch.object(
        user_identity_service.credential_service, "encrypt_line_id", lambda raw: f"enc:{raw}"
    ), patch.object(
        user_identity_service, "record_fallback_hit", new=AsyncMock()
    ) as mock_record:
        resolved = await user_identity_service.resolve_by_line_id(mock_db, "Udual")

    assert resolved is legacy_user
    mock_record.assert_awaited_once_with("Udual", 50)


# ── 8. resolve_by_line_id does NOT record when no plaintext hit ──────


@pytest.mark.asyncio
async def test_resolve_by_line_id_no_record_when_user_not_found():
    mock_db = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = None  # hash miss + plaintext miss
    mock_db.execute.return_value = mock_result

    with patch.object(
        user_identity_service.settings, "LINE_ID_HMAC_KEY", "test-key"
    ), patch.object(
        user_identity_service.settings, "LINE_ID_STORAGE_MODE", "dual"
    ), patch.object(
        user_identity_service, "record_fallback_hit", new=AsyncMock()
    ) as mock_record:
        resolved = await user_identity_service.resolve_by_line_id(mock_db, "Unobody")

    assert resolved is None
    mock_record.assert_not_awaited()


# ── 9. resolve_by_line_id does NOT record in pseudonym mode ──────────


@pytest.mark.asyncio
async def test_resolve_by_line_id_no_record_in_pseudonym_mode():
    mock_db = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = None  # hash miss
    mock_db.execute.return_value = mock_result

    with patch.object(
        user_identity_service.settings, "LINE_ID_HMAC_KEY", "test-key"
    ), patch.object(
        user_identity_service.settings, "LINE_ID_STORAGE_MODE", "pseudonym"
    ), patch.object(
        user_identity_service, "record_fallback_hit", new=AsyncMock()
    ) as mock_record:
        resolved = await user_identity_service.resolve_by_line_id(mock_db, "Ughost")

    assert resolved is None
    mock_record.assert_not_awaited()


# ── 10. GET /api/v1/health/pseudonym-gate endpoint — admin auth ──────


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