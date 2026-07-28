"""Unit tests for webhook non-text message extraction."""
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest

from app.services.message_intake.media_extraction import extract_non_text_message as _extract_non_text_message


class TestExtractNonTextMessage:
    @pytest.mark.asyncio
    async def test_image_message_with_media_persistence(self):
        message = SimpleNamespace(type="image", id="123")
        media_payload = {
            "url": "/uploads/line_media/img.jpg",
            "preview_url": "/uploads/line_media/preview_img.jpg",
            "content_type": "image/jpeg",
            "size": 2048,
        }

        with patch(
            "app.services.message_intake.line_service.persist_line_media",
            new=AsyncMock(return_value=media_payload),
        ) as mock_persist:
            message_type, content, payload = await _extract_non_text_message(message)

        assert message_type == "image"
        assert content == "[Image]"
        assert payload["line_message_id"] == "123"
        assert payload["url"] == media_payload["url"]
        assert payload["preview_url"] == media_payload["preview_url"]
        mock_persist.assert_awaited_once_with(message_id="123", media_type="image")

    @pytest.mark.asyncio
    async def test_image_message_without_id_returns_null_media_urls(self):
        message = SimpleNamespace(type="image", id=None)

        with patch(
            "app.services.message_intake.line_service.persist_line_media",
            new=AsyncMock(),
        ) as mock_persist:
            message_type, content, payload = await _extract_non_text_message(message)

        assert message_type == "image"
        assert content == "[Image]"
        assert payload["line_message_id"] is None
        assert payload["url"] is None
        assert payload["preview_url"] is None
        mock_persist.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_sticker_message_maps_ids(self):
        message = SimpleNamespace(
            type="sticker",
            id="sticker-msg-id",
            package_id="11537",
            sticker_id="52002734",
            sticker_resource_type="ANIMATION",
        )

        message_type, content, payload = await _extract_non_text_message(message)

        assert message_type == "sticker"
        assert content == "[Sticker 11537/52002734]"
        assert payload["line_message_id"] == "sticker-msg-id"
        assert payload["package_id"] == "11537"
        assert payload["sticker_id"] == "52002734"
        assert payload["sticker_resource_type"] == "ANIMATION"

    @pytest.mark.asyncio
    async def test_file_message_uses_persisted_filename(self):
        message = SimpleNamespace(type="file", id="file-123", file_name="invoice.pdf", file_size=1234)
        media_payload = {
            "url": "/uploads/line_media/invoice_saved.pdf",
            "preview_url": None,
            "content_type": "application/pdf",
            "size": 5678,
            "file_name": "invoice_saved.pdf",
        }

        with patch(
            "app.services.message_intake.line_service.persist_line_media",
            new=AsyncMock(return_value=media_payload),
        ) as mock_persist:
            message_type, content, payload = await _extract_non_text_message(message)

        assert message_type == "file"
        assert content == "invoice.pdf"
        assert payload["line_message_id"] == "file-123"
        assert payload["file_name"] == "invoice_saved.pdf"
        assert payload["size"] == 5678
        assert payload["url"] == media_payload["url"]
        assert payload["content_type"] == media_payload["content_type"]
        mock_persist.assert_awaited_once_with(
            message_id="file-123",
            media_type="file",
            file_name="invoice.pdf",
        )

    @pytest.mark.asyncio
    async def test_unsupported_message_returns_none(self):
        message = SimpleNamespace(type="location", id="loc-1")

        message_type, content, payload = await _extract_non_text_message(message)

        assert message_type is None
        assert content == ""
        assert payload == {}
