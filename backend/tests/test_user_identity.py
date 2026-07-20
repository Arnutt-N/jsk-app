"""Tests for LINE user ID pseudonymization (user_identity_service + dual-write)."""
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from sqlalchemy.exc import IntegrityError

from app.services.user_identity_service import (
    CURRENT_LINE_KEY_VERSION,
    decrypt_line_id_for_user,
    line_id_hash,
    populate_surrogate,
    resolve_by_line_id,
)


# ── 1. Resolve existing user by hash (idempotent) ─────────────────


@pytest.mark.asyncio
async def test_resolve_existing_user_by_hash():
    user = SimpleNamespace(id=42, line_user_id="Uabc", line_user_id_hash=None)
    user.line_user_id_hash = line_id_hash("Uabc")

    mock_db = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = user
    mock_db.execute.return_value = mock_result

    resolved = await resolve_by_line_id(mock_db, "Uabc")

    assert resolved is user
    assert resolved.id == 42
    mock_db.flush.assert_not_awaited()


# ── 2. populate_surrogate sets all three fields ───────────────────


def test_populate_surrogate_sets_hash_encrypted_version():
    user = SimpleNamespace(
        line_user_id="Uxyz",
        line_user_id_hash=None,
        line_user_id_encrypted=None,
        line_key_version=None,
    )

    with pytest.MonkeyPatch.context() as mp:
        mp.setattr("app.services.user_identity_service.settings.LINE_ID_HMAC_KEY", "test-key")
        mp.setattr(
            "app.services.user_identity_service.credential_service.encrypt_line_id",
            lambda raw: f"enc:{raw}",
        )
        populate_surrogate(user, "Uxyz")
        expected_hash = line_id_hash("Uxyz")

    assert user.line_user_id_hash == expected_hash
    assert user.line_user_id_encrypted == "enc:Uxyz"
    assert user.line_key_version == CURRENT_LINE_KEY_VERSION
    assert user.line_user_id == "Uxyz"  # plaintext preserved (dual)


# ── 3. Hash stability (deterministic) ─────────────────────────────


def test_hash_deterministic():
    with pytest.MonkeyPatch.context() as mp:
        mp.setattr("app.services.user_identity_service.settings.LINE_ID_HMAC_KEY", "stable-key")
        h1 = line_id_hash("U123456")
        h2 = line_id_hash("U123456")

    assert h1 == h2
    assert len(h1) == 64  # SHA-256 hex


def test_hash_differs_for_different_ids():
    with pytest.MonkeyPatch.context() as mp:
        mp.setattr("app.services.user_identity_service.settings.LINE_ID_HMAC_KEY", "stable-key")
        h1 = line_id_hash("Uaaa")
        h2 = line_id_hash("Ubbb")

    assert h1 != h2


# ── 4. Legacy fallback: NULL hash → found by plaintext, lazily populated ──


@pytest.mark.asyncio
async def test_legacy_fallback_populates_surrogate():
    legacy_user = SimpleNamespace(
        id=7,
        line_user_id="Ulegacy",
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
            result.scalar_one_or_none.return_value = None  # hash lookup miss
        else:
            result.scalar_one_or_none.return_value = legacy_user  # plaintext hit
        return result

    mock_db.execute = fake_execute

    with pytest.MonkeyPatch.context() as mp:
        mp.setattr("app.services.user_identity_service.settings.LINE_ID_HMAC_KEY", "test-key")
        mp.setattr(
            "app.services.user_identity_service.credential_service.encrypt_line_id",
            lambda raw: f"enc:{raw}",
        )
        resolved = await resolve_by_line_id(mock_db, "Ulegacy")
        expected_hash = line_id_hash("Ulegacy")

    assert resolved is legacy_user
    assert legacy_user.line_user_id_hash == expected_hash
    assert legacy_user.line_user_id_encrypted == "enc:Ulegacy"
    assert legacy_user.line_key_version == CURRENT_LINE_KEY_VERSION
    mock_db.flush.assert_awaited_once()


# ── 5. Decrypt round-trip ─────────────────────────────────────────


@pytest.mark.asyncio
async def test_decrypt_line_id_for_user_roundtrip():
    user = SimpleNamespace(
        id=10,
        line_user_id="Uraw",
        line_user_id_encrypted="enc:Uraw",
    )

    mock_db = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = user
    mock_db.execute.return_value = mock_result

    with pytest.MonkeyPatch.context() as mp:
        mp.setattr(
            "app.services.user_identity_service.credential_service.decrypt_line_id",
            lambda token: token.removeprefix("enc:"),
        )
        result = await decrypt_line_id_for_user(mock_db, 10)

    assert result == "Uraw"


@pytest.mark.asyncio
async def test_decrypt_falls_back_to_plaintext():
    user = SimpleNamespace(
        id=11,
        line_user_id="Uplain",
        line_user_id_encrypted=None,
    )

    mock_db = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = user
    mock_db.execute.return_value = mock_result

    result = await decrypt_line_id_for_user(mock_db, 11)

    assert result == "Uplain"


# ── 6. Concurrent create race (get_or_create_user) ───────────────


@pytest.mark.asyncio
async def test_concurrent_create_race_integrity_error():
    """Two get_or_create_user calls for a new raw → IntegrityError on unique hash → re-select."""
    from app.services.friend_service import FriendService

    service = FriendService()

    with pytest.MonkeyPatch.context() as mp:
        mp.setattr("app.services.user_identity_service.settings.LINE_ID_HMAC_KEY", "test-key")
        mp.setattr(
            "app.services.user_identity_service.credential_service.encrypt_line_id",
            lambda raw: f"enc:{raw}",
        )

        existing_user = SimpleNamespace(
            id=99,
            line_user_id="Urace",
            line_user_id_hash=line_id_hash("Urace"),
        )

        mock_db = AsyncMock()
        call_count = [0]

        async def fake_execute(stmt):
            call_count[0] += 1
            result = MagicMock()
            if call_count[0] <= 2:
                result.scalar_one_or_none.return_value = None  # initial resolve misses
            else:
                result.scalar_one_or_none.return_value = existing_user  # re-resolve hash hit
            return result

        mock_db.execute = fake_execute
        mock_db.add = MagicMock()
        mock_db.commit = AsyncMock(side_effect=IntegrityError("stmt", "params", "orig"))
        mock_db.rollback = AsyncMock()

        mock_api = AsyncMock()
        mock_api.get_profile = AsyncMock(
            return_value=SimpleNamespace(display_name="Racer", picture_url=None)
        )
        mp.setattr("app.core.line_client.get_line_bot_api", lambda: mock_api)
        user = await service.get_or_create_user("Urace", mock_db)

    assert user is existing_user


# ── 7. Concurrent lazy-populate race ─────────────────────────────


@pytest.mark.asyncio
async def test_concurrent_lazy_populate_race():
    """Two resolve_by_line_id find same NULL-hash user → IntegrityError → re-select."""
    legacy_user = SimpleNamespace(
        id=20,
        line_user_id="Ushared",
        line_user_id_hash=None,
        line_user_id_encrypted=None,
        line_key_version=None,
    )
    winner = SimpleNamespace(
        id=20,
        line_user_id="Ushared",
        line_user_id_hash=line_id_hash("Ushared"),
    )

    mock_db = AsyncMock()
    call_count = [0]

    async def fake_execute(stmt):
        call_count[0] += 1
        result = MagicMock()
        if call_count[0] == 1:
            result.scalar_one_or_none.return_value = None  # hash miss
        elif call_count[0] == 2:
            result.scalar_one_or_none.return_value = legacy_user  # plaintext hit
        else:
            result.scalar_one_or_none.return_value = winner  # re-select after IntegrityError
        return result

    mock_db.execute = fake_execute
    mock_db.flush = AsyncMock(side_effect=IntegrityError("stmt", "params", "orig"))
    mock_db.rollback = AsyncMock()

    with pytest.MonkeyPatch.context() as mp:
        mp.setattr("app.services.user_identity_service.settings.LINE_ID_HMAC_KEY", "test-key")
        mp.setattr(
            "app.services.user_identity_service.credential_service.encrypt_line_id",
            lambda raw: f"enc:{raw}",
        )
        resolved = await resolve_by_line_id(mock_db, "Ushared")

    assert resolved is winner
    mock_db.rollback.assert_awaited_once()


# ── 8. resolve_raw_for_push round-trip ────────────────────────────


@pytest.mark.asyncio
async def test_resolve_raw_for_push_prefers_decrypted():
    from app.services.line_service import resolve_raw_for_push

    user = SimpleNamespace(id=30, line_user_id="Ufallback", line_user_id_encrypted="enc:Ureal")

    mock_db = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = user
    mock_db.execute.return_value = mock_result

    with pytest.MonkeyPatch.context() as mp:
        mp.setattr(
            "app.services.user_identity_service.credential_service.decrypt_line_id",
            lambda token: token.removeprefix("enc:"),
        )
        result = await resolve_raw_for_push(mock_db, user)

    assert result == "Ureal"


@pytest.mark.asyncio
async def test_resolve_raw_for_push_falls_back_to_plaintext():
    from app.services.line_service import resolve_raw_for_push

    user = SimpleNamespace(id=31, line_user_id="Uplain", line_user_id_encrypted=None)

    mock_db = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = user
    mock_db.execute.return_value = mock_result

    result = await resolve_raw_for_push(mock_db, user)

    assert result == "Uplain"
