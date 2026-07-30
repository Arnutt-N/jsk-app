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


def _make_begin_nested_mock() -> MagicMock:
    """Return a MagicMock for db.begin_nested that supports `async with`.

    AsyncMock alone makes begin_nested() return a coroutine, but `async with`
    requires a synchronous call returning an object with async __aenter__/__aexit__.
    """
    ctx = MagicMock()
    ctx.__aenter__ = AsyncMock(return_value=None)
    ctx.__aexit__ = AsyncMock(return_value=False)
    return MagicMock(return_value=ctx)


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
    mock_db.begin_nested = _make_begin_nested_mock()

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
    mock_db.begin_nested = _make_begin_nested_mock()
    mock_db.flush = AsyncMock(side_effect=IntegrityError("stmt", "params", "orig"))

    with pytest.MonkeyPatch.context() as mp:
        mp.setattr("app.services.user_identity_service.settings.LINE_ID_HMAC_KEY", "test-key")
        mp.setattr(
            "app.services.user_identity_service.credential_service.encrypt_line_id",
            lambda raw: f"enc:{raw}",
        )
        resolved = await resolve_by_line_id(mock_db, "Ushared")

    assert resolved is winner
    mock_db.expire.assert_awaited_once()


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


# ── 9. Mode-aware: pseudonym skips plaintext fallback ─────────────


@pytest.mark.asyncio
async def test_pseudonym_mode_skips_plaintext_fallback():
    """In pseudonym mode, resolve_by_line_id returns None on hash miss (no fallback)."""
    mock_db = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = None  # hash miss
    mock_db.execute.return_value = mock_result

    with pytest.MonkeyPatch.context() as mp:
        mp.setattr("app.services.user_identity_service.settings.LINE_ID_HMAC_KEY", "test-key")
        mp.setattr("app.services.user_identity_service.settings.LINE_ID_STORAGE_MODE", "pseudonym")
        resolved = await resolve_by_line_id(mock_db, "Ughost")

    assert resolved is None
    # Only 1 execute call (hash lookup) — no plaintext fallback
    assert mock_db.execute.await_count == 1


@pytest.mark.asyncio
async def test_dual_mode_uses_plaintext_fallback():
    """In dual mode, resolve_by_line_id still falls back to plaintext on hash miss."""
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

    with pytest.MonkeyPatch.context() as mp:
        mp.setattr("app.services.user_identity_service.settings.LINE_ID_HMAC_KEY", "test-key")
        mp.setattr("app.services.user_identity_service.settings.LINE_ID_STORAGE_MODE", "dual")
        mp.setattr(
            "app.services.user_identity_service.credential_service.encrypt_line_id",
            lambda raw: f"enc:{raw}",
        )
        resolved = await resolve_by_line_id(mock_db, "Udual")

    assert resolved is legacy_user
    assert call_count[0] == 2  # hash miss + plaintext fallback


# ── 10. child_filter mode-awareness ───────────────────────────────


def test_child_filter_plaintext_uses_line_user_id():
    from app.services.user_identity_service import child_filter
    from app.models.message import Message

    with pytest.MonkeyPatch.context() as mp:
        mp.setattr("app.services.user_identity_service.settings.LINE_ID_STORAGE_MODE", "plaintext")
        clause = child_filter(Message, "Uabc", user_id=42)

    assert str(clause) == str(Message.line_user_id == "Uabc")


def test_child_filter_pseudonym_uses_user_id():
    from app.services.user_identity_service import child_filter
    from app.models.message import Message

    with pytest.MonkeyPatch.context() as mp:
        mp.setattr("app.services.user_identity_service.settings.LINE_ID_STORAGE_MODE", "pseudonym")
        clause = child_filter(Message, "Uabc", user_id=42)

    assert str(clause) == str(Message.user_id == 42)


def test_child_filter_pseudonym_without_user_id_falls_back():
    from app.services.user_identity_service import child_filter
    from app.models.message import Message

    with pytest.MonkeyPatch.context() as mp:
        mp.setattr("app.services.user_identity_service.settings.LINE_ID_STORAGE_MODE", "pseudonym")
        clause = child_filter(Message, "Uabc", user_id=None)

    assert str(clause) == str(Message.line_user_id == "Uabc")


# ── 11. New mode-aware helpers (PR C read-cutover) ────────────────


def test_child_column_mode_aware():
    from app.services.user_identity_service import child_column
    from app.models.message import Message

    with pytest.MonkeyPatch.context() as mp:
        mp.setattr("app.services.user_identity_service.settings.LINE_ID_STORAGE_MODE", "dual")
        assert child_column(Message) is Message.line_user_id

    with pytest.MonkeyPatch.context() as mp:
        mp.setattr("app.services.user_identity_service.settings.LINE_ID_STORAGE_MODE", "pseudonym")
        assert child_column(Message) is Message.user_id


def test_child_join_condition_mode_aware():
    from app.services.user_identity_service import child_join_condition
    from app.models.message import Message
    from app.models.chat_session import ChatSession
    from app.models.user import User

    with pytest.MonkeyPatch.context() as mp:
        mp.setattr("app.services.user_identity_service.settings.LINE_ID_STORAGE_MODE", "dual")
        clause = child_join_condition(ChatSession, Message)
        assert str(clause) == str(ChatSession.line_user_id == Message.line_user_id)

    with pytest.MonkeyPatch.context() as mp:
        mp.setattr("app.services.user_identity_service.settings.LINE_ID_STORAGE_MODE", "pseudonym")
        clause = child_join_condition(ChatSession, Message)
        assert str(clause) == str(ChatSession.user_id == Message.user_id)


def test_child_join_condition_user_as_parent():
    from app.services.user_identity_service import child_join_condition
    from app.models.message import Message
    from app.models.user import User

    with pytest.MonkeyPatch.context() as mp:
        mp.setattr("app.services.user_identity_service.settings.LINE_ID_STORAGE_MODE", "dual")
        clause = child_join_condition(User, Message)
        assert str(clause) == str(User.line_user_id == Message.line_user_id)

    with pytest.MonkeyPatch.context() as mp:
        mp.setattr("app.services.user_identity_service.settings.LINE_ID_STORAGE_MODE", "pseudonym")
        clause = child_join_condition(User, Message)
        assert str(clause) == str(User.id == Message.user_id)


def test_user_identity_filter_mode_aware():
    from app.services.user_identity_service import user_identity_filter
    from app.models.user import User

    with pytest.MonkeyPatch.context() as mp:
        mp.setattr("app.services.user_identity_service.settings.LINE_ID_STORAGE_MODE", "dual")
        clause = user_identity_filter()
        assert str(clause) == str(User.line_user_id.isnot(None))

    with pytest.MonkeyPatch.context() as mp:
        mp.setattr("app.services.user_identity_service.settings.LINE_ID_STORAGE_MODE", "pseudonym")
        clause = user_identity_filter()
        assert str(clause) == str(User.line_user_id_hash.isnot(None))


@pytest.mark.asyncio
async def test_resolve_many_empty_input():
    from app.services.user_identity_service import resolve_many_by_line_id

    mock_db = AsyncMock()
    result = await resolve_many_by_line_id(mock_db, [])

    assert result == {}
    mock_db.execute.assert_not_awaited()


@pytest.mark.asyncio
async def test_resolve_many_by_hash():
    from app.services.user_identity_service import resolve_many_by_line_id

    mock_db = AsyncMock()

    with pytest.MonkeyPatch.context() as mp:
        mp.setattr("app.services.user_identity_service.settings.LINE_ID_HMAC_KEY", "test-key")
        mp.setattr("app.services.user_identity_service.settings.LINE_ID_STORAGE_MODE", "dual")
        u1 = SimpleNamespace(id=1, line_user_id="Uaaa", line_user_id_hash=line_id_hash("Uaaa"))
        u2 = SimpleNamespace(id=2, line_user_id="Ubbb", line_user_id_hash=line_id_hash("Ubbb"))
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = [u1, u2]
        mock_db.execute.return_value = mock_result
        result = await resolve_many_by_line_id(mock_db, ["Uaaa", "Ubbb"])

    assert result == {"Uaaa": 1, "Ubbb": 2}
    assert mock_db.execute.await_count == 1  # hash hit, no plaintext query


@pytest.mark.asyncio
async def test_resolve_many_plaintext_fallback_records_gate_hit():
    from app.services.user_identity_service import resolve_many_by_line_id

    mock_db = AsyncMock()
    mock_db.begin_nested = _make_begin_nested_mock()
    gate_mock = AsyncMock()

    with pytest.MonkeyPatch.context() as mp:
        mp.setattr("app.services.user_identity_service.settings.LINE_ID_HMAC_KEY", "test-key")
        mp.setattr("app.services.user_identity_service.settings.LINE_ID_STORAGE_MODE", "dual")
        hashed = SimpleNamespace(id=1, line_user_id="Uaaa", line_user_id_hash=line_id_hash("Uaaa"))
        legacy = SimpleNamespace(id=2, line_user_id="Ulegacy", line_user_id_hash=None)

        call_count = [0]

        async def fake_execute(stmt):
            call_count[0] += 1
            result = MagicMock()
            if call_count[0] == 1:
                result.scalars.return_value.all.return_value = [hashed]  # hash query
            else:
                result.scalars.return_value.all.return_value = [legacy]  # plaintext query
            return result

        mock_db.execute = fake_execute
        mp.setattr("app.services.user_identity_service.record_fallback_hit", gate_mock)
        result = await resolve_many_by_line_id(mock_db, ["Uaaa", "Ulegacy", "Uaaa"])

    assert result == {"Uaaa": 1, "Ulegacy": 2}
    gate_mock.assert_awaited_once_with("Ulegacy", 2)


@pytest.mark.asyncio
async def test_resolve_many_pseudonym_skips_plaintext():
    from app.services.user_identity_service import resolve_many_by_line_id

    mock_db = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalars.return_value.all.return_value = []
    mock_db.execute.return_value = mock_result

    with pytest.MonkeyPatch.context() as mp:
        mp.setattr("app.services.user_identity_service.settings.LINE_ID_HMAC_KEY", "test-key")
        mp.setattr("app.services.user_identity_service.settings.LINE_ID_STORAGE_MODE", "pseudonym")
        result = await resolve_many_by_line_id(mock_db, ["Ughost"])

    assert result == {}
    assert mock_db.execute.await_count == 1  # hash query only


# ── 9. HMAC key fallback denial on a remote database ──────────────


def test_hmac_key_missing_on_remote_database_raises():
    """A development process aimed at hosted data must not use the dev key."""
    from app.core.config import Settings
    from app.services.user_identity_service import _get_hmac_key

    with pytest.MonkeyPatch.context() as mp:
        mp.setattr("app.services.user_identity_service.settings.LINE_ID_HMAC_KEY", "")
        mp.setattr(
            "app.services.user_identity_service.settings.ENVIRONMENT", "development"
        )
        mp.setattr(Settings, "is_remote_database", property(lambda self: True))
        with pytest.raises(RuntimeError, match="LINE_ID_HMAC_KEY"):
            _get_hmac_key()


def test_hmac_key_missing_on_local_database_uses_dev_fallback():
    from app.core.config import Settings
    from app.services.user_identity_service import _DEV_HMAC_KEY, _get_hmac_key

    with pytest.MonkeyPatch.context() as mp:
        mp.setattr("app.services.user_identity_service.settings.LINE_ID_HMAC_KEY", "")
        mp.setattr(
            "app.services.user_identity_service.settings.ENVIRONMENT", "development"
        )
        mp.setattr(Settings, "is_remote_database", property(lambda self: False))
        assert _get_hmac_key() == _DEV_HMAC_KEY


def test_configured_hmac_key_wins_on_remote_database():
    from app.core.config import Settings
    from app.services.user_identity_service import _get_hmac_key

    with pytest.MonkeyPatch.context() as mp:
        mp.setattr(
            "app.services.user_identity_service.settings.LINE_ID_HMAC_KEY",
            "configured-key",
        )
        mp.setattr(Settings, "is_remote_database", property(lambda self: True))
        assert _get_hmac_key() == "configured-key"


# ── 10. Batch resolver backfills surrogates on a plaintext hit ────


@pytest.mark.asyncio
async def test_resolve_many_plaintext_fallback_backfills_surrogates():
    from app.services.user_identity_service import resolve_many_by_line_id

    mock_db = AsyncMock()
    mock_db.begin_nested = _make_begin_nested_mock()
    legacy = SimpleNamespace(
        id=7,
        line_user_id="Ulegacy",
        line_user_id_hash=None,
        line_user_id_encrypted=None,
        line_key_version=None,
    )

    with pytest.MonkeyPatch.context() as mp:
        mp.setattr("app.services.user_identity_service.settings.LINE_ID_HMAC_KEY", "test-key")
        mp.setattr("app.services.user_identity_service.settings.LINE_ID_STORAGE_MODE", "dual")
        mp.setattr("app.services.user_identity_service.record_fallback_hit", AsyncMock())

        call_count = [0]

        async def fake_execute(stmt):
            call_count[0] += 1
            result = MagicMock()
            result.scalars.return_value.all.return_value = (
                [] if call_count[0] == 1 else [legacy]
            )
            return result

        mock_db.execute = fake_execute
        result = await resolve_many_by_line_id(mock_db, ["Ulegacy"])

        assert result == {"Ulegacy": 7}
        assert legacy.line_user_id_hash == line_id_hash("Ulegacy")

    assert legacy.line_user_id_encrypted is not None
    assert legacy.line_key_version == CURRENT_LINE_KEY_VERSION
    mock_db.flush.assert_awaited_once()


@pytest.mark.asyncio
async def test_resolve_many_backfill_integrity_error_keeps_mapping():
    """A conflicting row degrades to count-only instead of failing the batch."""
    from app.services.user_identity_service import resolve_many_by_line_id

    mock_db = AsyncMock()
    ctx = MagicMock()
    ctx.__aenter__ = AsyncMock(return_value=None)
    ctx.__aexit__ = AsyncMock(return_value=False)
    mock_db.begin_nested = MagicMock(return_value=ctx)
    mock_db.flush = AsyncMock(side_effect=IntegrityError("stmt", {}, Exception("dup")))
    legacy = SimpleNamespace(
        id=7,
        line_user_id="Ulegacy",
        line_user_id_hash=None,
        line_user_id_encrypted=None,
        line_key_version=None,
    )

    with pytest.MonkeyPatch.context() as mp:
        mp.setattr("app.services.user_identity_service.settings.LINE_ID_HMAC_KEY", "test-key")
        mp.setattr("app.services.user_identity_service.settings.LINE_ID_STORAGE_MODE", "dual")
        mp.setattr("app.services.user_identity_service.record_fallback_hit", AsyncMock())

        call_count = [0]

        async def fake_execute(stmt):
            call_count[0] += 1
            result = MagicMock()
            result.scalars.return_value.all.return_value = (
                [] if call_count[0] == 1 else [legacy]
            )
            return result

        mock_db.execute = fake_execute
        result = await resolve_many_by_line_id(mock_db, ["Ulegacy"])

    assert result == {"Ulegacy": 7}
    mock_db.expire.assert_awaited_once_with(legacy)
