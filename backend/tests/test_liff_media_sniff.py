"""LIFF media upload enforces magic-byte sniffing (R3-M2).

Spoofed Content-Types must 422; real bytes store the sniffed mime.
Mock-db style (runs locally, no Postgres); the B1-B10 DB-backed contract
lives in test_liff_media_upload.py.
"""
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi.testclient import TestClient

from app.api.v1.endpoints import liff as liff_module
from app.core.http_rate_limit import reset_all_http_limiters
from app.db.session import get_db as session_get_db
from app.main import app

PNG_BYTES = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64
HTML_BYTES = b"<html><body>not an image</body></html>"


async def _override_get_db():
    db = AsyncMock()
    db.add = MagicMock()
    yield db


def _post_media(client, content, filename, content_type):
    return client.post(
        "/api/v1/liff/media",
        files={"file": (filename, content, content_type)},
        headers={"X-LIFF-Id-Token": "dummy"},
    )


def test_spoofed_content_type_returns_422():
    reset_all_http_limiters()
    app.dependency_overrides[session_get_db] = _override_get_db
    client = TestClient(app)
    try:
        with patch.object(
            liff_module, "require_liff_identity", new=AsyncMock(return_value="U1")
        ):
            response = _post_media(client, HTML_BYTES, "evil.html", "image/png")
    finally:
        client.close()
        app.dependency_overrides.clear()
    assert response.status_code == 422


def test_real_png_returns_200_with_sniffed_mime():
    reset_all_http_limiters()
    captured = {}

    async def _capture_get_db():
        db = AsyncMock()
        db.add = MagicMock(side_effect=lambda obj: captured.setdefault("media", obj))
        yield db

    app.dependency_overrides[session_get_db] = _capture_get_db
    client = TestClient(app)
    try:
        with patch.object(
            liff_module, "require_liff_identity", new=AsyncMock(return_value="U1")
        ):
            response = _post_media(client, PNG_BYTES, "a.png", "image/png")
    finally:
        client.close()
        app.dependency_overrides.clear()
    assert response.status_code == 200
    assert captured["media"].mime_type == "image/png"
