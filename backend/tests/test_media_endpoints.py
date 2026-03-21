from datetime import datetime, timezone
from io import BytesIO
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
from fastapi import HTTPException
from starlette.datastructures import Headers, UploadFile

from app.api.v1.endpoints import media
from app.models.media_file import FileCategory
from app.models.user import UserRole


def _admin_user():
    return SimpleNamespace(id=1, role=UserRole.ADMIN, username="admin")


@pytest.mark.asyncio
async def test_upload_media_returns_created_payload():
    db = AsyncMock()
    db.add = MagicMock()

    async def _refresh(obj):
        obj.id = uuid4()
        obj.is_public = False
        obj.public_token = None
        obj.category = FileCategory.DOCUMENT
        obj.thumbnail_url = None
        obj.created_at = datetime.now(timezone.utc)

    db.refresh.side_effect = _refresh

    file = UploadFile(
        BytesIO(b"hello world"),
        filename="manual.pdf",
        headers=Headers({"content-type": "application/pdf"}),
    )

    response = await media.upload_media(file=file, db=db, _admin=_admin_user())

    assert response["filename"] == "manual.pdf"
    assert response["id"] is not None
    db.add.assert_called_once()
    db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_list_media_returns_paginated_dict():
    media_file = SimpleNamespace(
        id=uuid4(),
        filename="manual.pdf",
        mime_type="application/pdf",
        size_bytes=2048,
        category="DOCUMENT",
        is_public=False,
        public_token=None,
        thumbnail_url=None,
        created_at=datetime(2026, 3, 15, 10, 0, tzinfo=timezone.utc),
    )

    db = AsyncMock()
    # count query
    count_result = MagicMock()
    count_result.scalar.return_value = 1
    # list query
    list_result = MagicMock()
    scalars = MagicMock()
    scalars.all.return_value = [media_file]
    list_result.scalars.return_value = scalars
    db.execute.side_effect = [count_result, list_result]

    response = await media.list_media(
        category=None, search=None, page=1, page_size=20,
        db=db, _admin=_admin_user(),
    )

    assert response["total"] == 1
    assert len(response["items"]) == 1
    assert response["items"][0]["filename"] == "manual.pdf"
    assert response["items"][0]["mime_type"] == "application/pdf"
    assert response["items"][0]["size_bytes"] == 2048


@pytest.mark.asyncio
async def test_delete_media_removes_existing_row():
    media_file = SimpleNamespace(id=uuid4(), filename="manual.pdf")

    db = AsyncMock()
    result = MagicMock()
    result.scalar_one_or_none.return_value = media_file
    db.execute.return_value = result

    response = await media.delete_media(
        media_id=media_file.id, db=db, _admin=_admin_user(),
    )

    assert response == {"ok": True}
    db.delete.assert_awaited_once_with(media_file)
    db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_delete_media_raises_404_when_missing():
    db = AsyncMock()
    result = MagicMock()
    result.scalar_one_or_none.return_value = None
    db.execute.return_value = result

    with pytest.raises(HTTPException) as exc:
        await media.delete_media(
            media_id=uuid4(), db=db, _admin=_admin_user(),
        )

    assert exc.value.status_code == 404
    assert exc.value.detail == "Media not found"


# ── T5: Public link management tests ──────────────────────────────


@pytest.mark.asyncio
async def test_create_public_link_generates_token():
    media_file = SimpleNamespace(
        id=uuid4(), filename="doc.pdf", mime_type="application/pdf",
        size_bytes=100, category="DOCUMENT",
        is_public=False, public_token=None,
        thumbnail_url=None,
        created_at=datetime.now(timezone.utc),
    )
    db = AsyncMock()
    result = MagicMock()
    result.scalar_one_or_none.return_value = media_file
    db.execute.return_value = result

    # refresh should be a no-op (token already set by the endpoint logic)
    db.refresh = AsyncMock()

    response = await media.create_public_link(
        media_id=media_file.id, db=db, _admin=_admin_user(),
    )

    assert media_file.is_public is True
    assert media_file.public_token is not None
    db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_create_public_link_preserves_existing_token():
    """Idempotent: if public_token already exists, it should be preserved."""
    existing_token = "existing-token-123"
    media_file = SimpleNamespace(
        id=uuid4(), filename="doc.pdf", mime_type="application/pdf",
        size_bytes=100, category="DOCUMENT",
        is_public=False, public_token=existing_token,
        thumbnail_url=None,
        created_at=datetime.now(timezone.utc),
    )
    db = AsyncMock()
    result = MagicMock()
    result.scalar_one_or_none.return_value = media_file
    db.execute.return_value = result
    db.refresh = AsyncMock()

    await media.create_public_link(
        media_id=media_file.id, db=db, _admin=_admin_user(),
    )

    # Token should remain unchanged
    assert media_file.public_token == existing_token
    assert media_file.is_public is True


@pytest.mark.asyncio
async def test_revoke_public_link_clears_token():
    media_file = SimpleNamespace(
        id=uuid4(), filename="doc.pdf", mime_type="application/pdf",
        size_bytes=100, category="DOCUMENT",
        is_public=True, public_token="some-token",
        thumbnail_url=None,
        created_at=datetime.now(timezone.utc),
    )
    db = AsyncMock()
    result = MagicMock()
    result.scalar_one_or_none.return_value = media_file
    db.execute.return_value = result
    db.refresh = AsyncMock()

    response = await media.revoke_public_link(
        media_id=media_file.id, db=db, _admin=_admin_user(),
    )

    assert media_file.is_public is False
    assert media_file.public_token is None
    db.commit.assert_awaited_once()
