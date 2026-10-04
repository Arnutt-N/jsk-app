"""Lightweight conversation identity for broadcast/read/media paths (R3-M17)."""
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import HTTPException

from app.api.v1.endpoints.admin_live_chat import (
    _broadcast_conversation_update,
    mark_conversation_read,
)
from app.schemas.live_chat import ReadConversationRequest
from app.services.live_chat_service import LiveChatService


@pytest.mark.asyncio
async def test_identity_returns_display_fields():
    svc = LiveChatService()
    user = SimpleNamespace(
        display_name="Ann", picture_url="pic", chat_mode="HUMAN"
    )
    with patch(
        "app.services.live_chat_service.conversations.resolve_by_line_id",
        new=AsyncMock(return_value=user),
    ):
        identity = await svc.get_conversation_identity("U1", AsyncMock())
    assert identity == {
        "display_name": "Ann",
        "picture_url": "pic",
        "chat_mode": "HUMAN",
    }


@pytest.mark.asyncio
async def test_identity_none_for_unknown_user_and_bot_default():
    svc = LiveChatService()
    with patch(
        "app.services.live_chat_service.conversations.resolve_by_line_id",
        new=AsyncMock(return_value=None),
    ):
        assert await svc.get_conversation_identity("U1", AsyncMock()) is None

    user = SimpleNamespace(
        display_name="Ann", picture_url=None, chat_mode=None
    )
    with patch(
        "app.services.live_chat_service.conversations.resolve_by_line_id",
        new=AsyncMock(return_value=user),
    ):
        identity = await svc.get_conversation_identity("U1", AsyncMock())
    assert identity["chat_mode"] == "BOT"


@pytest.mark.asyncio
async def test_broadcast_uses_identity_not_detail():
    identity = {"display_name": "Ann", "picture_url": "pic", "chat_mode": "BOT"}
    with (
        patch(
            "app.api.v1.endpoints.admin_live_chat.live_chat_service.get_conversation_identity",
            new=AsyncMock(return_value=identity),
        ) as mock_identity,
        patch(
            "app.api.v1.endpoints.admin_live_chat.live_chat_service.get_conversation_detail",
            new=AsyncMock(),
        ) as mock_detail,
        patch(
            "app.api.v1.endpoints.admin_live_chat.notify_admins_message_sent",
            new=AsyncMock(),
        ) as mock_notify,
    ):
        await _broadcast_conversation_update(
            "U1", AsyncMock(), {"content": "hi", "created_at": "ts"}
        )
    mock_identity.assert_awaited_once()
    mock_detail.assert_not_awaited()
    mock_notify.assert_awaited_once()
    kwargs = mock_notify.await_args.kwargs
    assert kwargs["display_name"] == "Ann"
    assert kwargs["picture_url"] == "pic"
    assert kwargs["content"] == "hi"


@pytest.mark.asyncio
async def test_mark_read_404_when_identity_missing():
    with patch(
        "app.api.v1.endpoints.admin_live_chat.live_chat_service.get_conversation_identity",
        new=AsyncMock(return_value=None),
    ):
        with pytest.raises(HTTPException) as exc:
            await mark_conversation_read(
                "U1", ReadConversationRequest(), AsyncMock(),
                SimpleNamespace(id=7),
            )
    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_mark_read_200_when_identity_present():
    now = datetime(2026, 1, 1, tzinfo=timezone.utc)
    with (
        patch(
            "app.api.v1.endpoints.admin_live_chat.live_chat_service.get_conversation_identity",
            new=AsyncMock(return_value={"display_name": "Ann"}),
        ),
        patch(
            "app.api.v1.endpoints.admin_live_chat.ws_manager.mark_conversation_read",
            new=AsyncMock(return_value=now),
        ),
    ):
        result = await mark_conversation_read(
            "U1", ReadConversationRequest(), AsyncMock(), SimpleNamespace(id=7)
        )
    assert result["success"] is True
    assert result["line_user_id"] == "U1"
