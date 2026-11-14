"""H2 quarantine regression test: one undecryptable row must not fail the inbox listing.

Red-first: on pre-fix code ``get_conversations`` raises ``InvalidToken`` out of the
fail-loud batch decrypt; fixed code skips the bad row, keeps the good one, and reports
``quarantined_count``. The payload must validate against ``ConversationList``
(``line_user_id`` is a required ``str`` — ``None`` rows would 500).
"""
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.schemas.live_chat import ConversationList
from app.services.credential_service import credential_service
from app.services.live_chat_service import live_chat_service

RAW_GOOD = "Uquarantinegood1"


def _result(rows):
    m = MagicMock()
    m.all.return_value = rows
    return m


def _quarantine_db(monkeypatch):
    good_token = credential_service.encrypt_line_id(RAW_GOOD)
    user1 = SimpleNamespace(
        id=1, display_name="Good", picture_url=None, friend_status=None, chat_mode=None
    )
    user2 = SimpleNamespace(
        id=2, display_name="Bad", picture_url=None, friend_status=None, chat_mode=None
    )
    inbox_result = _result([(user1, None, None, None), (user2, None, None, None)])
    decrypt_result = _result([(1, good_token), (2, "garbage-not-a-token")])
    tag_result = _result([])

    async def _route(stmt, *args, **kwargs):
        sql = str(stmt).lower().lstrip()
        # Inbox listing joins chat_sessions+messages; the batch decrypt reads
        # line_user_id_encrypted; the tag fetch joins user_tag. The inbox
        # select must be checked first — it also lists line_user_id_encrypted
        # among the User columns, so the narrower decrypt match comes after.
        if not sql.startswith("select"):
            raise AssertionError(f"unrouted non-select statement: {sql[:200]}")
        if "chat_sessions" in sql:
            return inbox_result
        if "line_user_id_encrypted" in sql and "user_tag" not in sql:
            return decrypt_result
        if "user_tag" in sql:
            return tag_result
        raise AssertionError(f"unrouted test statement: {sql[:200]}")

    db = AsyncMock()
    db.execute = AsyncMock(side_effect=_route)
    db.scalar = AsyncMock(return_value=0)
    return db


@pytest.mark.asyncio
async def test_inbox_listing_quarantines_undecryptable_row(monkeypatch):
    monkeypatch.setattr(credential_service, "cipher", None)
    db = _quarantine_db(monkeypatch)
    out = await live_chat_service.get_conversations(None, db, admin_id=None)
    assert out["quarantined_count"] == 1
    assert [c["line_user_id"] for c in out["conversations"]] == [RAW_GOOD]
    ConversationList(**out)


def _vanished_db():
    good_token = credential_service.encrypt_line_id(RAW_GOOD)
    user1 = SimpleNamespace(
        id=1, display_name="Good", picture_url=None, friend_status=None, chat_mode=None
    )
    user2 = SimpleNamespace(
        id=2, display_name="Gone", picture_url=None, friend_status=None, chat_mode=None
    )
    inbox_result = _result([(user1, None, None, None), (user2, None, None, None)])
    decrypt_result = _result([(1, good_token)])
    tag_result = _result([])

    async def _route(stmt, *args, **kwargs):
        sql = str(stmt).lower().lstrip()
        # Same gotcha as _quarantine_db: inbox select carries
        # line_user_id_encrypted, so it must win before the decrypt match.
        if not sql.startswith("select"):
            raise AssertionError(f"unrouted non-select statement: {sql[:200]}")
        if "chat_sessions" in sql:
            return inbox_result
        if "line_user_id_encrypted" in sql and "user_tag" not in sql:
            return decrypt_result
        if "user_tag" in sql:
            return tag_result
        raise AssertionError(f"unrouted test statement: {sql[:200]}")

    db = AsyncMock()
    db.execute = AsyncMock(side_effect=_route)
    db.scalar = AsyncMock(return_value=0)
    return db


@pytest.mark.asyncio
async def test_inbox_listing_skips_row_missing_from_decrypt(monkeypatch):
    monkeypatch.setattr(credential_service, "cipher", None)
    db = _vanished_db()
    out = await live_chat_service.get_conversations(None, db, admin_id=None)
    assert [c["line_user_id"] for c in out["conversations"]] == [RAW_GOOD]
    ConversationList(**out)
