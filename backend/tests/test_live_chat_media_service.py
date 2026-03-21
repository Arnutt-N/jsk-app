"""Unit tests for operator media sending in live chat service."""
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException

from app.models.chat_session import SessionStatus
from app.services.live_chat_service import LiveChatService


@pytest.fixture
def service():
    return LiveChatService()


def _make_active_session(operator_id: int):
    """Return a mock ChatSession that passes _require_active_session_owner."""
    session = MagicMock()
    session.status = SessionStatus.ACTIVE
    session.operator_id = operator_id
    return session


@pytest.mark.asyncio
async def test_send_media_image_success(service):
    mock_operator = MagicMock()
    mock_operator.display_name = "Agent A"

    mock_db = AsyncMock()
    operator_result = MagicMock()
    operator_result.scalar_one_or_none.return_value = mock_operator
    mock_db.execute.return_value = operator_result

    saved_message = MagicMock()
    saved_message.id = 10
    saved_message.line_user_id = "U123"
    saved_message.direction = MagicMock(value="OUTGOING")
    saved_message.content = "[Image]"
    saved_message.message_type = "image"
    saved_message.payload = {"url": "https://example.com/uploads/operator_media/img.jpg"}
    saved_message.sender_role = MagicMock(value="ADMIN")
    saved_message.operator_name = "Agent A"
    saved_message.created_at = datetime.now(timezone.utc)

    with patch(
        "app.services.live_chat_service.line_service.persist_operator_upload",
        new=AsyncMock(return_value={
            "url": "https://example.com/uploads/operator_media/img.jpg",
            "preview_url": "https://example.com/uploads/operator_media/img.jpg",
            "content_type": "image/jpeg",
            "size": 123,
            "file_name": "img.jpg",
        }),
    ) as mock_persist, patch(
        "app.services.live_chat_service.line_service.push_image_message",
        new=AsyncMock(),
    ) as mock_push_image, patch(
        "app.services.live_chat_service.line_service.save_message",
        new=AsyncMock(return_value=saved_message),
    ) as mock_save, patch.object(
        service, "get_active_session",
        new_callable=AsyncMock,
        return_value=_make_active_session(operator_id=1),
    ):
        result = await service.send_media_message(
            line_user_id="U123",
            operator_id=1,
            file_bytes=b"image-bytes",
            file_name="photo.jpg",
            content_type="image/jpeg",
            db=mock_db,
        )

    assert result["success"] is True
    assert result["message"]["message_type"] == "image"
    mock_persist.assert_awaited_once()
    mock_push_image.assert_awaited_once()
    mock_save.assert_awaited_once()


@pytest.mark.asyncio
async def test_send_media_file_sends_text_with_url(service):
    mock_operator = MagicMock()
    mock_operator.display_name = "Agent B"

    mock_db = AsyncMock()
    operator_result = MagicMock()
    operator_result.scalar_one_or_none.return_value = mock_operator
    mock_db.execute.return_value = operator_result

    saved_message = MagicMock()
    saved_message.id = 11
    saved_message.line_user_id = "U123"
    saved_message.direction = MagicMock(value="OUTGOING")
    saved_message.content = "invoice.pdf"
    saved_message.message_type = "file"
    saved_message.payload = {"url": "https://example.com/uploads/operator_media/invoice.pdf"}
    saved_message.sender_role = MagicMock(value="ADMIN")
    saved_message.operator_name = "Agent B"
    saved_message.created_at = datetime.now(timezone.utc)

    with patch(
        "app.services.live_chat_service.line_service.persist_operator_upload",
        new=AsyncMock(return_value={
            "url": "https://example.com/uploads/operator_media/invoice.pdf",
            "preview_url": None,
            "content_type": "application/pdf",
            "size": 555,
            "file_name": "invoice_saved.pdf",
        }),
    ), patch(
        "app.services.live_chat_service.line_service.push_messages",
        new=AsyncMock(),
    ) as mock_push_messages, patch(
        "app.services.live_chat_service.line_service.save_message",
        new=AsyncMock(return_value=saved_message),
    ), patch.object(
        service, "get_active_session",
        new_callable=AsyncMock,
        return_value=_make_active_session(operator_id=2),
    ):
        result = await service.send_media_message(
            line_user_id="U123",
            operator_id=2,
            file_bytes=b"%PDF...",
            file_name="invoice.pdf",
            content_type="application/pdf",
            db=mock_db,
        )

    assert result["success"] is True
    assert result["message"]["message_type"] == "file"
    mock_push_messages.assert_awaited_once()


@pytest.mark.asyncio
async def test_send_media_image_requires_public_url(service):
    mock_db = AsyncMock()
    operator_result = MagicMock()
    operator_result.scalar_one_or_none.return_value = MagicMock(display_name="Agent C")
    mock_db.execute.return_value = operator_result

    with patch(
        "app.services.live_chat_service.line_service.persist_operator_upload",
        new=AsyncMock(return_value={
            "url": "/uploads/operator_media/local.jpg",
            "preview_url": "/uploads/operator_media/local.jpg",
            "content_type": "image/jpeg",
            "size": 123,
            "file_name": "local.jpg",
        }),
    ), patch.object(
        service, "get_active_session",
        new_callable=AsyncMock,
        return_value=_make_active_session(operator_id=3),
    ):
        with pytest.raises(HTTPException) as exc:
            await service.send_media_message(
                line_user_id="U123",
                operator_id=3,
                file_bytes=b"abc",
                file_name="local.jpg",
                content_type="image/jpeg",
                db=mock_db,
            )
    assert exc.value.status_code == 400
