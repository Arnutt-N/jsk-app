"""LINE media persist enforces MAX_LINE_MEDIA_BYTES with a skip path (R3-M8).

D3 follow-up: full downloads stream with a mid-stream cap (raw httpx);
preview downloads stay on the SDK.
"""
from unittest.mock import AsyncMock, patch

import httpx
import pytest

from app.services import line_service as line_service_mod
from app.services.line_service import LineService, _MediaTooLarge


def _stream_client_factory(handler, seen):
    """Build an AsyncClient factory routing through a MockTransport."""
    transport = httpx.MockTransport(handler)
    real_client = httpx.AsyncClient  # capture before patch.object replaces it

    def factory(**kwargs):
        seen["kwargs"] = kwargs
        return real_client(transport=transport, **kwargs)

    return factory


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


# --- D3: raw-httpx streaming path ---


@pytest.mark.asyncio
async def test_streamed_download_returns_bytes_and_hits_blob_url():
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["url"] = str(request.url)
        seen["auth"] = request.headers.get("Authorization")
        return httpx.Response(200, content=b"hello", headers={"Content-Type": "image/jpeg"})

    svc = LineService()
    with patch.object(line_service_mod.httpx, "AsyncClient",
                       _stream_client_factory(handler, seen)):
        data, content_type = await svc.download_message_content("m1")

    assert data == b"hello"
    assert content_type == "image/jpeg"
    assert seen["url"] == "https://api-data.line.me/v2/bot/message/m1/content"
    assert seen["auth"] is not None and seen["auth"].startswith("Bearer ")
    assert seen["kwargs"]["timeout"] == line_service_mod.UPLOAD_TIMEOUT


@pytest.mark.asyncio
async def test_streamed_download_raises_when_cap_exceeded(monkeypatch):
    monkeypatch.setattr(line_service_mod, "MAX_LINE_MEDIA_BYTES", 10)

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, content=b"x" * 11)

    svc = LineService()
    with patch.object(line_service_mod.httpx, "AsyncClient",
                       _stream_client_factory(handler, {})):
        with pytest.raises(_MediaTooLarge):
            await svc.download_message_content("m1")


@pytest.mark.asyncio
async def test_persist_maps_midstream_abort_to_skip_shape(monkeypatch):
    monkeypatch.setattr(line_service_mod, "MAX_LINE_MEDIA_BYTES", 10)

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, content=b"x" * 64, headers={"Content-Type": "video/mp4"})

    svc = LineService()
    with patch.object(line_service_mod.httpx, "AsyncClient",
                       _stream_client_factory(handler, {})), patch(
                           "asyncio.to_thread", new=AsyncMock()) as mock_write:
        result = await svc.persist_line_media(message_id="m1", media_type="video")

    assert result["url"] is None
    assert result["preview_url"] is None
    assert result["skipped"] == "too_large"
    assert result["size"] is None
    assert result["content_type"] is None
    assert result["file_name"] is None
    mock_write.assert_not_called()


@pytest.mark.asyncio
async def test_streamed_download_http_error_returns_empty():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(404, content=b"nope")

    svc = LineService()
    with patch.object(line_service_mod.httpx, "AsyncClient",
                       _stream_client_factory(handler, {})):
        data, content_type = await svc.download_message_content("m1")

    assert data == b"" and content_type is None
