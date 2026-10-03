"""LINE media persist enforces MAX_LINE_MEDIA_BYTES with a skip path (R3-M8)."""
from unittest.mock import AsyncMock, patch

import pytest

from app.services import line_service as line_service_mod
from app.services.line_service import LineService


def test_cap_is_the_documented_product_decision():
    assert line_service_mod.MAX_LINE_MEDIA_BYTES == 50 * 1024 * 1024


@pytest.mark.asyncio
async def test_oversized_media_skips_persist_but_records_size(monkeypatch):
    monkeypatch.setattr(line_service_mod, "MAX_LINE_MEDIA_BYTES", 10)
    svc = LineService()
    with patch.object(LineService, "download_message_content",
                       new=AsyncMock(return_value=(b"x" * 11, "video/mp4"))), patch(
                           "asyncio.to_thread", new=AsyncMock()) as mock_write:
        result = await svc.persist_line_media(message_id="m1", media_type="video")
    assert result["url"] is None
    assert result["size"] == 11
    assert result["skipped"] == "too_large"
    assert result["content_type"] == "video/mp4"
    mock_write.assert_not_called()


@pytest.mark.asyncio
async def test_empty_download_keeps_existing_shape():
    svc = LineService()
    with patch.object(LineService, "download_message_content",
                       new=AsyncMock(return_value=(b"", None))):
        result = await svc.persist_line_media(message_id="m1", media_type="image")
    assert result["url"] is None and result["size"] is None


@pytest.mark.asyncio
async def test_oversized_preview_skipped_independently(monkeypatch):
    monkeypatch.setattr(line_service_mod, "MAX_LINE_MEDIA_BYTES", 10)
    svc = LineService()
    with patch.object(LineService, "download_message_content",
                       new=AsyncMock(side_effect=[
                           (b"a" * 5, "image/jpeg"),
                           (b"b" * 11, "image/jpeg"),
                       ])), patch("asyncio.to_thread", new=AsyncMock()):
        result = await svc.persist_line_media(message_id="m1", media_type="image")
    assert result["url"] is not None  # main payload persists
    assert result["preview_url"] is None  # oversized preview skipped
    assert "skipped" not in result  # main-path marker untouched


@pytest.mark.asyncio
async def test_skipped_marker_propagates_to_image_payload():
    from types import SimpleNamespace

    from app.services.message_intake import media_extraction as me_mod

    line_svc = SimpleNamespace(persist_line_media=AsyncMock(return_value={
        "url": None, "preview_url": None, "content_type": "video/mp4",
        "size": 999, "file_name": None, "skipped": "too_large",
    }))
    with patch.object(me_mod, "get_line_service", return_value=line_svc):
        mtype, content, payload = await me_mod.extract_non_text_message(
            SimpleNamespace(type="image", id="m1")
        )
    assert mtype == "image" and content == "[Image]"
    assert payload["url"] is None
    assert payload["size"] == 999
    assert payload["skipped"] == "too_large"
