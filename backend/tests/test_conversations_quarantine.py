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
    db = AsyncMock()
    db.execute = AsyncMock(
        side_effect=[
            _result([(user1, None, None, None), (user2, None, None, None)]),
            _result([(1, good_token), (2, "garbage-not-a-token")]),
            _result([]),
        ]
    )
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
    db = AsyncMock()
    db.execute = AsyncMock(
        side_effect=[
            _result([(user1, None, None, None), (user2, None, None, None)]),
            _result([(1, good_token)]),
            _result([]),
        ]
    )
    db.scalar = AsyncMock(return_value=0)
    return db


@pytest.mark.asyncio
async def test_inbox_listing_skips_row_missing_from_decrypt(monkeypatch):
    monkeypatch.setattr(credential_service, "cipher", None)
    db = _vanished_db()
    out = await live_chat_service.get_conversations(None, db, admin_id=None)
    assert [c["line_user_id"] for c in out["conversations"]] == [RAW_GOOD]
    ConversationList(**out)
