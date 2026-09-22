import uuid as uuid_mod
import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool

from app.core.config import settings
from app.models.media_file import MediaFile


def _fresh_engine():
    return create_async_engine(str(settings.DATABASE_URL), poolclass=NullPool)


@pytest_asyncio.fixture
async def private_media():
    engine = _fresh_engine()
    Session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with Session() as s:
        row = MediaFile(
            id=uuid_mod.uuid4(),
            filename="secret.pdf",
            mime_type="application/pdf",
            data=b"%PDF-1.4 pytest",
            size_bytes=15,
            is_public=False,
            public_token="tok-private-1234567890",
        )
        s.add(row)
        await s.commit()
        yield row
    async with Session() as s:
        await s.delete(await s.get(MediaFile, row.id))
        await s.commit()
    await engine.dispose()


@pytest.mark.asyncio
async def test_private_media_empty_token_denied(test_client, private_media):
    mid = str(private_media.id)
    for qs in ["", "?token=", "?token=wrong"]:
        resp = test_client.get(f"/api/v1/media/{mid}{qs}")
        assert resp.status_code == 403, qs
    ok = test_client.get(f"/api/v1/media/{mid}?token={private_media.public_token}")
    assert ok.status_code == 200


@pytest_asyncio.fixture
async def tokenless_private_media():
    engine = _fresh_engine()
    Session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with Session() as s:
        row = MediaFile(
            id=uuid_mod.uuid4(),
            filename="secret2.pdf",
            mime_type="application/pdf",
            data=b"%PDF-1.4 pytest",
            size_bytes=15,
            is_public=False,
            public_token=None,
        )
        s.add(row)
        await s.commit()
        yield row
    async with Session() as s:
        await s.delete(await s.get(MediaFile, row.id))
        await s.commit()
    await engine.dispose()


@pytest.mark.asyncio
async def test_tokenless_private_media_denied_for_empty_token(
    test_client, tokenless_private_media
):
    # ว่างชนว่างต้องไม่ผ่าน: private file ที่ไม่มี token เก็บ ต้อง 403 เสมอ
    mid = str(tokenless_private_media.id)
    for qs in ["", "?token="]:
        resp = test_client.get(f"/api/v1/media/{mid}{qs}")
        assert resp.status_code == 403, qs
