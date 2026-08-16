"""Tests for LINE user ID pseudonymization (PR C contract phase).

The plaintext ``line_user_id`` column is dropped: resolution is hash-only
(no legacy fallback), decryption is fail-loud, and child-table queries go
through the ``user_id`` FK exclusively.
"""
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from sqlalchemy import false
from sqlalchemy.exc import IntegrityError

from app.services.user_identity_service import (
    CURRENT_LINE_KEY_VERSION,
    decrypt_line_id_for_user,
    decrypt_user_line_id,
    line_id_hash,
    populate_surrogate,
    resolve_by_line_id,
)


# ── 1. Resolve existing user by hash (idempotent) ─────────────────


@pytest.mark.asyncio
async def test_resolve_existing_user_by_hash():
    user = SimpleNamespace(id=42, line_user_id_hash=line_id_hash("Uabc"))

    mock_db = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = user
    mock_db.execute.return_value = mock_result

    resolved = await resolve_by_line_id(mock_db, "Uabc")

    assert resolved is user
    assert resolved.id == 42
    mock_db.flush.assert_not_awaited()


# ── 2. Hash miss returns None — no plaintext fallback anymore ─────


@pytest.mark.asyncio
async def test_resolve_miss_returns_none_even_if_plaintext_could_match():
    """PR C regression: on a hash miss, resolve_by_line_id returns None even
    when a hypothetical plaintext row for the same raw ID exists. There is
    exactly one query (the hash lookup) — no secondary plaintext path."""
    legacy_user = SimpleNamespace(
        id=7,
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
            # Any second query would "find" the legacy row — it must never run.
            result.scalar_one_or_none.return_value = legacy_user
        return result

    mock_db.execute = fake_execute

    with pytest.MonkeyPatch.context() as mp:
        mp.setattr("app.services.user_identity_service.settings.LINE_ID_HMAC_KEY", "test-key")
        resolved = await resolve_by_line_id(mock_db, "Ulegacy")

    assert resolved is None
    assert call_count[0] == 1  # hash lookup only — no plaintext fallback


# ── 3. populate_surrogate sets all three fields ───────────────────


def test_populate_surrogate_sets_hash_encrypted_version():
    user = SimpleNamespace(
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


# ── 4. Hash stability (deterministic) ─────────────────────────────


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


# ── 5. Decrypt: fail-loud contract ────────────────────────────────


@pytest.mark.asyncio
async def test_decrypt_line_id_for_user_roundtrip():
    user = SimpleNamespace(
        id=10,
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
async def test_decrypt_line_id_for_user_returns_none_only_for_missing_row():
    mock_db = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = None  # user row does not exist
    mock_db.execute.return_value = mock_result

    result = await decrypt_line_id_for_user(mock_db, 999)

    assert result is None


def test_decrypt_user_line_id_raises_when_encrypted_empty():
    """PR C regression: fail-loud — an empty line_user_id_encrypted means the
    backfill is incomplete and must surface, not degrade to plaintext."""
    user = SimpleNamespace(id=11, line_user_id_encrypted=None)

    with pytest.raises(RuntimeError, match="line_user_id_encrypted"):
        decrypt_user_line_id(user)


def test_decrypt_user_line_id_raises_when_encrypted_empty_string():
    user = SimpleNamespace(id=12, line_user_id_encrypted="")

    with pytest.raises(RuntimeError, match="line_user_id_encrypted"):
        decrypt_user_line_id(user)


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
            line_user_id_hash=line_id_hash("Urace"),
        )

        mock_db = AsyncMock()
        call_count = [0]

        async def fake_execute(stmt):
            call_count[0] += 1
            result = MagicMock()
            if call_count[0] == 1:
                result.scalar_one_or_none.return_value = None  # initial resolve miss
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


# ── 7. resolve_raw_for_push — fail-loud decrypt ───────────────────


@pytest.mark.asyncio
async def test_resolve_raw_for_push_decrypts_surrogate():
    from app.services.line_service import resolve_raw_for_push

    user = SimpleNamespace(id=30, line_user_id_encrypted="enc:Ureal")

    with pytest.MonkeyPatch.context() as mp:
        mp.setattr(
            "app.services.user_identity_service.credential_service.decrypt_line_id",
            lambda token: token.removeprefix("enc:"),
        )
        result = await resolve_raw_for_push(AsyncMock(), user)

    assert result == "Ureal"


@pytest.mark.asyncio
async def test_resolve_raw_for_push_raises_when_encrypted_empty():
    from app.services.line_service import resolve_raw_for_push

    user = SimpleNamespace(id=31, line_user_id_encrypted=None)

    with pytest.raises(RuntimeError, match="line_user_id_encrypted"):
        await resolve_raw_for_push(AsyncMock(), user)


@pytest.mark.asyncio
async def test_resolve_raw_for_push_raises_when_user_missing():
    from app.services.line_service import resolve_raw_for_push

    with pytest.raises(RuntimeError):
        await resolve_raw_for_push(AsyncMock(), None)


# ── 8. child_filter — user_id FK only, false() when unresolved ────


def test_child_filter_uses_user_id():
    from app.services.user_identity_service import child_filter
    from app.models.message import Message

    clause = child_filter(Message, "Uabc", user_id=42)

    assert str(clause) == str(Message.user_id == 42)


def test_child_filter_without_user_id_matches_nothing():
    """PR C regression: an unresolved user (user_id=None) must match nothing —
    there is no plaintext fallback column to fall back to."""
    from app.services.user_identity_service import child_filter
    from app.models.message import Message

    clause = child_filter(Message, "Uabc", user_id=None)

    assert str(clause) == str(false())


# ── 9. child_column / child_join_condition / user_identity_filter ─


def test_child_column_is_user_id():
    from app.services.user_identity_service import child_column
    from app.models.message import Message

    assert child_column(Message) is Message.user_id


def test_child_join_condition_user_as_parent():
    """PR C regression: User joins to child tables on child.user_id == User.id."""
    from app.services.user_identity_service import child_join_condition
    from app.models.message import Message
    from app.models.chat_session import ChatSession
    from app.models.user import User

    clause = child_join_condition(User, Message)
    assert str(clause) == str(User.id == Message.user_id)

    clause = child_join_condition(User, ChatSession)
    assert str(clause) == str(User.id == ChatSession.user_id)


def test_child_join_condition_child_to_child():
    from app.services.user_identity_service import child_join_condition
    from app.models.message import Message
    from app.models.chat_session import ChatSession

    clause = child_join_condition(ChatSession, Message)
    assert str(clause) == str(ChatSession.user_id == Message.user_id)


def test_user_identity_filter_checks_hash_presence():
    from app.services.user_identity_service import user_identity_filter
    from app.models.user import User

    clause = user_identity_filter()
    assert str(clause) == str(User.line_user_id_hash.isnot(None))


# ── 10. Batch resolver (hash-only) ────────────────────────────────


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
        u1 = SimpleNamespace(id=1, line_user_id_hash=line_id_hash("Uaaa"))
        u2 = SimpleNamespace(id=2, line_user_id_hash=line_id_hash("Ubbb"))
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = [u1, u2]
        mock_db.execute.return_value = mock_result
        result = await resolve_many_by_line_id(mock_db, ["Uaaa", "Ubbb", "Uaaa"])

    assert result == {"Uaaa": 1, "Ubbb": 2}
    assert mock_db.execute.await_count == 1  # single hash IN query


@pytest.mark.asyncio
async def test_resolve_many_unknown_ids_yield_empty_mapping():
    from app.services.user_identity_service import resolve_many_by_line_id

    mock_db = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalars.return_value.all.return_value = []
    mock_db.execute.return_value = mock_result

    with pytest.MonkeyPatch.context() as mp:
        mp.setattr("app.services.user_identity_service.settings.LINE_ID_HMAC_KEY", "test-key")
        result = await resolve_many_by_line_id(mock_db, ["Ughost"])

    assert result == {}
    assert mock_db.execute.await_count == 1  # hash query only, no fallback


# ── 11. Batch decrypt (fail-loud) ─────────────────────────────────


@pytest.mark.asyncio
async def test_decrypt_line_ids_for_users_maps_roundtrip():
    from app.services.user_identity_service import decrypt_line_ids_for_users

    mock_db = AsyncMock()
    mock_result = MagicMock()
    mock_result.all.return_value = [(1, "enc:Uaaa"), (2, "enc:Ubbb")]
    mock_db.execute.return_value = mock_result

    with pytest.MonkeyPatch.context() as mp:
        mp.setattr(
            "app.services.user_identity_service.credential_service.decrypt_line_id",
            lambda token: token.removeprefix("enc:"),
        )
        result = await decrypt_line_ids_for_users(mock_db, [1, 2, 1])

    assert result == {1: "Uaaa", 2: "Ubbb"}


@pytest.mark.asyncio
async def test_decrypt_line_ids_for_users_raises_on_empty_token():
    from app.services.user_identity_service import decrypt_line_ids_for_users

    mock_db = AsyncMock()
    mock_result = MagicMock()
    mock_result.all.return_value = [(1, None)]
    mock_db.execute.return_value = mock_result

    with pytest.raises(RuntimeError, match="line_user_id_encrypted"):
        await decrypt_line_ids_for_users(mock_db, [1])


@pytest.mark.asyncio
async def test_decrypt_line_ids_for_users_empty_input():
    from app.services.user_identity_service import decrypt_line_ids_for_users

    mock_db = AsyncMock()
    result = await decrypt_line_ids_for_users(mock_db, [])

    assert result == {}
    mock_db.execute.assert_not_awaited()


# ── 12. HMAC key fallback denial on a remote database ──────────────


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
