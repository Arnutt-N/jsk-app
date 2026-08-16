"""Contract tests for the `last_message` field of the live-chat payloads.

`ConversationDetail` inherits `last_message` from `ConversationSummary`, but the
service dict never populated it, so the field silently serialized to null. The
admin sidebar sorts rows on `last_message.created_at`, so a client that merged
its list row off this response lost the row's sort key and the row dropped to
the bottom of the list on click.

`get_conversation_detail` takes the newest message as `messages[-1]`, which is
only correct because `get_recent_messages` returns oldest->newest. That ordering
is asserted here too — stubbing it in the detail tests would otherwise encode
the assumption instead of verifying it.
"""
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch

import pytest

from app.services.credential_service import credential_service
from app.services.live_chat_service import live_chat_service

LINE_ID = "Uabcdef0123456789abcdef0123456789"


def _message(content: str, created_at: datetime):
    return SimpleNamespace(content=content, created_at=created_at)


async def _detail(messages):
    """Run get_conversation_detail with every DB-touching collaborator stubbed."""
    db = AsyncMock()
    # The tags query is the only direct `db.execute` in the function.
    db.execute.return_value = Mock(all=Mock(return_value=[]))
    user = SimpleNamespace(
        id=1,
        line_user_id_encrypted=credential_service.encrypt_line_id(LINE_ID),
        display_name="Somchai",
        picture_url="",
        friend_status="ACTIVE",
        chat_mode="BOT",
    )
    resolve = patch(
        "app.services.live_chat_service.conversations.resolve_by_line_id",
        new=AsyncMock(return_value=user),
    )
    session = patch.object(
        type(live_chat_service), "get_active_session", new=AsyncMock(return_value=None)
    )
    recent = patch.object(
        type(live_chat_service), "get_recent_messages", new=AsyncMock(return_value=messages)
    )
    with resolve, session, recent:
        return await live_chat_service.get_conversation_detail(LINE_ID, db)


@pytest.mark.asyncio
async def test_detail_returns_newest_message_as_last_message():
    newest = datetime(2026, 8, 1, 10, 0, tzinfo=timezone.utc)
    # get_recent_messages returns oldest -> newest.
    detail = await _detail([
        _message("older", datetime(2026, 8, 1, 9, 0, tzinfo=timezone.utc)),
        _message("newest", newest),
    ])

    assert detail["last_message"] == {"content": "newest", "created_at": newest}


@pytest.mark.asyncio
async def test_detail_last_message_is_none_without_messages():
    detail = await _detail([])

    assert detail["last_message"] is None


@pytest.mark.asyncio
async def test_detail_coalesces_null_content():
    """`Message.content` is nullable but the `LastMessage` schema requires a str,
    so a legacy NULL-content row must not blow up serialization."""
    detail = await _detail([_message(None, datetime(2026, 8, 1, 10, 0, tzinfo=timezone.utc))])

    assert detail["last_message"]["content"] == ""


@pytest.mark.asyncio
async def test_get_recent_messages_returns_oldest_to_newest():
    """The invariant `get_conversation_detail` relies on for `messages[-1]`.

    The DB query orders newest-first with a LIMIT (so the cap keeps the *recent*
    messages); the service reverses that for display. If the reverse is ever
    dropped, `last_message` silently becomes the OLDEST of the page.
    """
    base = datetime(2026, 8, 1, 9, 0, tzinfo=timezone.utc)
    newest_first = [
        _message("newest", base + timedelta(minutes=2)),
        _message("middle", base + timedelta(minutes=1)),
        _message("oldest", base),
    ]
    db = AsyncMock()
    db.execute.return_value = Mock(scalars=Mock(return_value=Mock(all=Mock(return_value=newest_first))))

    with patch(
        "app.services.live_chat_service.conversations.resolve_by_line_id",
        new=AsyncMock(return_value=SimpleNamespace(id=1)),
    ):
        result = await live_chat_service.get_recent_messages(LINE_ID, 50, db)

    assert [m.content for m in result] == ["oldest", "middle", "newest"]
    assert result[-1].content == "newest"
