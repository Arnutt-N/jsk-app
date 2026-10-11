"""C2: LINE/operator media must live in MediaFile, served by /api/v1/media/{id}.

persist_line_media / persist_operator_upload wrote bytes under uploads/ and
returned /uploads/... URLs — but main.py no longer mounts /uploads (media
goes through /api/v1/media/{id} with access control), so every chat image,
video, and file link was dead. Both now store a MediaFile row and return
its serving URL; the bytes round-trip through GET /api/v1/media/{id}.

Rows are public (same precedent as rich-menu images): LINE's servers fetch
push-image URLs without credentials, and admin <img> tags cannot send auth
headers. Row ids are unguessable UUIDs.
"""
import uuid
from unittest.mock import AsyncMock, patch
from urllib.parse import urlparse

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool

from app.core.config import settings
from app.models.media_file import MediaFile
from app.services.line_service import LineService

JPEG_BYTES = b"\xff\xd8\xfffake-jpeg-c2"
PREVIEW_BYTES = b"\xff\xd8\xfffake-preview-c2"


def _fresh_session_factory():
    engine = create_async_engine(str(settings.DATABASE_URL), poolclass=NullPool)
    return engine, sessionmaker(
        engine, class_=AsyncSession, expire_on_commit=False
    )


def _media_id_from_url(url: str) -> uuid.UUID:
    return uuid.UUID(url.rsplit("/media/", 1)[1])


async def _delete_media(session_factory, media_id: uuid.UUID) -> None:
    async with session_factory() as session:
        result = await session.execute(
            select(MediaFile).where(MediaFile.id == media_id)
        )
        row = result.scalar_one_or_none()
        if row is not None:
            await session.delete(row)
            await session.commit()


@pytest.mark.asyncio
async def test_persist_line_media_stores_media_file_and_serves_bytes(
    test_client,
):
    engine, Session = _fresh_session_factory()
    svc = LineService()
    media_ids: list = []
    try:
        with patch.object(
            LineService,
            "download_message_content",
            new=AsyncMock(side_effect=[
                (JPEG_BYTES, "image/jpeg"),
                (PREVIEW_BYTES, "image/jpeg"),
            ]),
        ):
            async with Session() as db:
                media = await svc.persist_line_media(
                    message_id="m-c2-line", media_type="image", db=db
                )
                await db.commit()

        assert media["url"] is not None
        assert "/uploads/" not in media["url"]
        assert "/api/v1/media/" in media["url"]
        assert media["preview_url"] is not None
        assert "/uploads/" not in media["preview_url"]

        for key in ("url", "preview_url"):
            mid = _media_id_from_url(media[key])
            media_ids.append(mid)
            async with Session() as db:
                row = (
                    await db.execute(
                        select(MediaFile).where(MediaFile.id == mid)
                    )
                ).scalar_one_or_none()
                assert row is not None
                assert row.is_public is True

            res = test_client.get(urlparse(media[key]).path)
            assert res.status_code == 200
            assert res.content == (
                JPEG_BYTES if key == "url" else PREVIEW_BYTES
            )
    finally:
        for mid in media_ids:
            await _delete_media(Session, mid)
        await engine.dispose()


@pytest.mark.asyncio
async def test_persist_operator_upload_stores_media_file_and_serves_bytes(
    test_client,
):
    engine, Session = _fresh_session_factory()
    svc = LineService()
    media_ids: list = []
    try:
        async with Session() as db:
            media = await svc.persist_operator_upload(
                data=JPEG_BYTES,
                media_type="image",
                file_name="photo.jpg",
                content_type="image/jpeg",
                db=db,
            )
            await db.commit()

        assert "/uploads/" not in media["url"]
        assert "/api/v1/media/" in media["url"]

        mid = _media_id_from_url(media["url"])
        media_ids.append(mid)
        async with Session() as db:
            row = (
                await db.execute(select(MediaFile).where(MediaFile.id == mid))
            ).scalar_one_or_none()
            assert row is not None
            assert row.is_public is True
            assert row.data == JPEG_BYTES

        res = test_client.get(urlparse(media["url"]).path)
        assert res.status_code == 200
        assert res.content == JPEG_BYTES
    finally:
        for mid in media_ids:
            await _delete_media(Session, mid)
        await engine.dispose()


@pytest.mark.asyncio
async def test_persist_line_media_empty_download_keeps_skip_shape():
    engine, Session = _fresh_session_factory()
    svc = LineService()
    try:
        with patch.object(
            LineService,
            "download_message_content",
            new=AsyncMock(return_value=(b"", None)),
        ):
            async with Session() as db:
                media = await svc.persist_line_media(
                    message_id="m-c2-empty", media_type="image", db=db
                )
        assert media["url"] is None
        assert media["size"] is None
    finally:
        await engine.dispose()
