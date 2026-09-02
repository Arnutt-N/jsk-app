"""Admin media upload allowlist + serving-header tests (review findings M10, M5, L2).

The admin upload route now sniffs magic bytes (JPEG/PNG/PDF only — the client
Content-Type is spoofable and these bytes are served publicly without auth),
rejects oversized uploads BEFORE buffering, and the public/media responses
carry X-Content-Type-Options: nosniff with inline dispositions restricted to
sniff-safe images. The private-file token compare is constant-time.
"""
from io import BytesIO
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from fastapi import HTTPException
from starlette.datastructures import Headers, UploadFile

from app.api.v1.endpoints import media
from app.models.media_file import FileCategory
from app.models.user import UserRole

PNG_MAGIC = b"\x89PNG\r\n\x1a\n" + b"0" * 32


def _admin_user():
    return SimpleNamespace(id=1, role=UserRole.ADMIN, username="admin")


def _media_file(**overrides):
    fields = dict(
        id=uuid4(),
        filename="pic.png",
        mime_type="image/png",
        data=PNG_MAGIC,
        size_bytes=len(PNG_MAGIC),
        category=FileCategory.IMAGE,
        is_public=True,
        public_token=None,
        thumbnail_url=None,
        created_at=None,
    )
    fields.update(overrides)
    return SimpleNamespace(**fields)


# ── Upload: magic-byte allowlist (M10) ──────────────────────────────


@pytest.mark.asyncio
async def test_upload_rejects_html_payload_even_with_image_content_type():
    """Spoofed image Content-Type + HTML bytes → 422 (stored-XSS payload)."""
    db = AsyncMock()
    file = UploadFile(
        BytesIO(b"<html><script>alert(1)</script></html>"),
        filename="evil.png",
        headers=Headers({"content-type": "image/png"}),
    )
    with pytest.raises(HTTPException) as exc:
        await media.upload_media(file=file, db=db, _admin=_admin_user())
    assert exc.value.status_code == 422
    assert "JPEG, PNG, or PDF" in exc.value.detail
    db.add.assert_not_called()


@pytest.mark.asyncio
async def test_upload_sniffs_real_mime_over_declared():
    db = AsyncMock()
    db.add = MagicMock()

    async def _refresh(obj):
        obj.id = uuid4()
        obj.is_public = False
        obj.public_token = None
        obj.category = FileCategory.IMAGE
        obj.thumbnail_url = None
        obj.created_at = None

    db.refresh.side_effect = _refresh
    file = UploadFile(
        BytesIO(PNG_MAGIC),
        filename="pic.jpg",  # extension lies too; sniff decides
        headers=Headers({"content-type": "image/jpeg"}),
    )
    response = await media.upload_media(file=file, db=db, _admin=_admin_user())
    assert response["mime_type"] == "image/png"
    added = db.add.call_args.args[0]
    assert added.mime_type == "image/png"


# ── Upload: oversize rejected before the body is buffered (M5) ──────


@pytest.mark.asyncio
async def test_oversize_rejected_before_read(monkeypatch):
    """file.size header check must fire before read() buffers the body."""
    monkeypatch.setattr(media, "MAX_UPLOAD_BYTES", 8)
    db = AsyncMock()

    read_calls = []

    class _FakeFile:
        size = 64

        async def read(self):
            read_calls.append(1)
            return b"0" * 64

    with pytest.raises(HTTPException) as exc:
        await media.upload_media(
            file=object.__new__(_FakeFile), db=db, _admin=_admin_user()
        )
    assert exc.value.status_code == 413
    assert not read_calls, "body must not be read when the header already says oversize"


# ── Serving headers (M10) + constant-time token (L2) ───────────────


@pytest.mark.asyncio
async def test_get_media_wrong_token_403_and_correct_token_passes():
    db = AsyncMock()

    async def _execute(stmt):
        class _R:
            def scalar_one_or_none(self_inner):
                return _media_file(is_public=False, public_token="tok-123")

        return _R()

    db.execute = _execute

    with pytest.raises(HTTPException) as exc:
        await media.get_media(media.db if False else uuid4(), db=db, token="wrong")
    assert exc.value.status_code == 403

    resp = await media.get_media(uuid4(), db=db, token="tok-123")
    assert resp.headers["x-content-type-options"] == "nosniff"


def _session_with(media_file):
    """get_public_file opens its own AsyncSessionLocal — patch it."""

    class _R:
        def scalar_one_or_none(self_inner):
            return media_file

    class _DB:
        async def execute(self, stmt):
            return _R()

    ctx = AsyncMock()
    ctx.__aenter__ = AsyncMock(return_value=_DB())
    ctx.__aexit__ = AsyncMock(return_value=False)
    return ctx


@pytest.mark.asyncio
async def test_public_file_pdf_gets_attachment_disposition():
    with patch.object(media, "AsyncSessionLocal",
                      return_value=_session_with(_media_file(
                          mime_type="application/pdf",
                          data=b"%PDF-1.4 fake", filename="doc.pdf"))):
        resp = await media.get_public_file(public_token="pub-1")
    assert resp.headers["content-disposition"].startswith("attachment")
    assert resp.headers["x-content-type-options"] == "nosniff"


@pytest.mark.asyncio
async def test_public_file_png_stays_inline():
    with patch.object(media, "AsyncSessionLocal",
                      return_value=_session_with(_media_file())):
        resp = await media.get_public_file(public_token="pub-1")
    assert resp.headers["content-disposition"].startswith("inline")
    assert resp.headers["x-content-type-options"] == "nosniff"
