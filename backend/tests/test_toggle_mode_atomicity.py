"""set_chat_mode must not commit (R3-M1): toggle_mode commits once."""
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest

from app.models.user import ChatMode
from app.services.live_chat_service import LiveChatService


@pytest.mark.asyncio
async def test_set_chat_mode_sets_field_without_committing():
    svc = LiveChatService()
    user = SimpleNamespace(chat_mode=ChatMode.BOT)
    db = AsyncMock()
    with patch(
        "app.services.live_chat_service.messaging.resolve_by_line_id",
        new=AsyncMock(return_value=user),
    ):
        assert await svc.set_chat_mode("U1", ChatMode.HUMAN, db) is True
    assert user.chat_mode == ChatMode.HUMAN
    db.commit.assert_not_awaited()


@pytest.mark.asyncio
async def test_set_chat_mode_unknown_user_returns_false_without_committing():
    svc = LiveChatService()
    db = AsyncMock()
    with patch(
        "app.services.live_chat_service.messaging.resolve_by_line_id",
        new=AsyncMock(return_value=None),
    ):
        assert await svc.set_chat_mode("U1", ChatMode.HUMAN, db) is False
    db.commit.assert_not_awaited()
