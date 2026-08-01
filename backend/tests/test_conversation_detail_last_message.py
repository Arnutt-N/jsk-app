"""Contract test for `get_conversation_detail`.

`ConversationDetail` inherits `last_message` from `ConversationSummary`, but the
service dict never populated it, so the field silently serialized to null. The
admin sidebar sorts rows on `last_message.created_at`, so a client that merged
its list row off this response lost the row's sort key and the row dropped to
the bottom of the list on click.
"""
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch

import pytest

from app.services.live_chat_service import live_chat_service

LINE_ID = "Uabcdef0123456789abcdef0123456789"


def _message(content: str, created_at: datetime):
    return SimpleNamespace(content=content, created_at=created_at)


def _patch_collaborators(messages):
    """Stub every DB-touching collaborator of get_conversation_detail."""
    user = SimpleNamespace(
        id=1,
        line_user_id=LINE_ID,
        display_name="Somchai",
        picture_url="",
        friend_status="ACTIVE",
        chat_mode="BOT",
    )
    return patch.multiple(
        "app.services.live_chat_service.conversations",
        resolve_by_line_id=AsyncMock(return_value=user),
    ), patch.object(
        type(live_chat_service), "get_active_session", new=AsyncMock(return_value=None)
    ), patch.object(
        type(live_chat_service), "get_recent_messages", new=AsyncMock(return_value=messages)
    )


async def _run(messages):
    db = AsyncMock()
    # The tags query is the only direct `db.execute` in the function.
    db.execute.return_value = Mock(all=Mock(return_value=[]))
    resolve_p, session_p, recent_p = _patch_collaborators(messages)
    with resolve_p, session_p, recent_p:
        return await live_chat_service.get_conversation_detail(LINE_ID, db)


@pytest.mark.asyncio
async def test_detail_returns_newest_message_as_last_message():
    newest = datetime(2026, 8, 1, 10, 0, tzinfo=timezone.utc)
    # get_recent_messages returns oldest -> newest.
    detail = await _run([
        _message("older", datetime(2026, 8, 1, 9, 0, tzinfo=timezone.utc)),
        _message("newest", newest),
    ])

    assert detail["last_message"] == {"content": "newest", "created_at": newest}


@pytest.mark.asyncio
async def test_detail_last_message_is_none_without_messages():
    detail = await _run([])

    assert detail["last_message"] is None
