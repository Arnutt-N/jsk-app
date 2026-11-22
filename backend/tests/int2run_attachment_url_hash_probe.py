"""int2run probe: attachment url is transport-only but hashed for replay."""
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool

from app.api import deps
from app.api.v1.endpoints import liff as liff_module
from app.core.config import settings
from app.main import app
from app.models.media_file import MediaFile
from app.models.service_request import ServiceRequest
from app.models.user import User, UserRole
from app.services.user_identity_service import populate_surrogate


@pytest.mark.asyncio
async def test_attachment_url_change_causes_false_409_on_unchanged_case(
    test_client, monkeypatch
):
    marker = uuid.uuid4().hex[:8]
    sid = f"int2run-att-url-{marker}"
    sub = f"Uint2run{marker}000000000000000000000"
    token = f"int2run-tok-{marker}"

    fake_client = MagicMock()

    async def _post(url, **kwargs):
        resp = MagicMock()
        claimed = (kwargs.get("data") or {}).get("id_token")
        resp.status_code = 200 if claimed == token else 401
        resp.json.return_value = {"sub": sub}
        resp.text = "bad token"
        return resp

    fake_client.post = _post
    fake_cm = MagicMock()
    fake_cm.__aenter__ = AsyncMock(return_value=fake_client)
    fake_cm.__aexit__ = AsyncMock(return_value=False)
    monkeypatch.setattr(liff_module.httpx, "AsyncClient", MagicMock(return_value=fake_cm))
    monkeypatch.setattr(settings, "LIFF_STRICT_MODE", True)

    engine = create_async_engine(str(settings.DATABASE_URL), poolclass=NullPool)
    Session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    user_id = None
    media_id = uuid.uuid4()
    try:
        async with Session() as session:
            user = User(
                username=f"int2run-att-{marker}",
                display_name="INT2RUN",
                role=UserRole.USER,
                is_active=True,
            )
            populate_surrogate(user, sub)
            session.add(user)
            media = MediaFile(
                id=media_id,
                filename="proof.pdf",
                mime_type="application/pdf",
                data=b"%PDF-1.4 int2run",
                size_bytes=16,
                is_public=False,
                public_token=None,
            )
            session.add(media)
            await session.commit()
            user_id = user.id

        async def _fresh_get_db():
            async with Session() as session:
                yield session

        app.dependency_overrides[deps.get_db] = _fresh_get_db
        hdr = {"x-liff-id-token": token, "x-submission-id": sid}
        base = {
            "topic_category": "ร้องเรียน/ร้องทุกข์",
            "description": f"int2run-{marker}",
            "firstname": "ทดสอบ",
            "attachments": [
                {
                    "id": str(media_id),
                    "url": "https://first.example.com/image.png",
                    "name": "proof.pdf",
                }
            ],
        }
        changed_url = {
            **base,
            "attachments": [
                {
                    "id": str(media_id),
                    "url": "https://second.example.com/image.png",
                    "name": "proof.pdf",
                }
            ],
        }
        try:
            first = test_client.post("/api/v1/liff/service-requests", json=base, headers=hdr)
            retry = test_client.post(
                "/api/v1/liff/service-requests", json=changed_url, headers=hdr
            )
        finally:
            app.dependency_overrides.clear()

        print(f"INT2RUN first={first.status_code} retry={retry.status_code} body={retry.text}")
        assert first.status_code == 201, first.text
        assert retry.status_code == 201, retry.text
    finally:
        async with Session() as session:
            await session.execute(
                delete(ServiceRequest).where(ServiceRequest.submission_id == sid)
            )
            await session.execute(delete(MediaFile).where(MediaFile.id == media_id))
            if user_id is not None:
                await session.execute(delete(User).where(User.id == user_id))
            await session.commit()
        await engine.dispose()
