"""Regression tests for D4 — LIFF attachment URL forgery.

Bug: POST /api/v1/liff/service-requests persisted client-supplied
AttachmentRef{id,url,name} dicts verbatim into the JSONB attachments column.
Any authenticated LINE user could plant an arbitrary (phishing) URL inside a
case file that staff open from the admin detail page.

Fix contract (mirrors the admin create path in admin_requests.py):
- resolve each attachment id against MediaFile, 400 on unknown id
- regenerate the stored url server-side as /api/v1/media/{id}
- never persist a client-supplied url

LINE verify is faked by monkeypatching httpx.AsyncClient as imported into
liff.py (same pattern as test_liff_token.py). DB assertions use a throwaway
NullPool engine because the app's pooled session is bound to the TestClient's
event loop.
"""

import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool

from app.api.v1.endpoints import liff as liff_module
from app.core.config import settings
from app.models.media_file import MediaFile
from app.models.service_request import ServiceRequest

MEDIA_ENDPOINT = "/api/v1/liff/media"
SERVICE_REQUESTS_ENDPOINT = "/api/v1/liff/service-requests"
VERIFIED_SUB = "Ud4attachments000000000000000001"
JPEG_BYTES = b"\xff\xd8\xfffake-jpeg-d4"


def _service_request_body(marker: str, attachments: list | None = None) -> dict:
    body = {
        "prefix": "นาย",
        "firstname": "ทดสอบ",
        "lastname": "ระบบ",
        "phone_number": "0812345678",
        "agency": "ศูนย์ยุติธรรมชุมชน",
        "province": "เชียงใหม่",
        "district": "เมืองเชียงใหม่",
        "sub_district": "สุเทพ",
        "topic_category": "ร้องเรียน/ร้องทุกข์",
        "topic_subcategory": "อธิบายสั้นๆ",
        "description": f"pytest-liff-d4-{marker}",
    }
    if attachments is not None:
        body["attachments"] = attachments
    return body


class _FakeLineVerifyResponse:
    def __init__(self, status_code: int = 200, json_data: dict | None = None, text: str = ""):
        self.status_code = status_code
        self._json_data = json_data or {}
        self.text = text

    def json(self):
        return self._json_data


def _patch_line_verify(monkeypatch) -> None:
    fake_client = MagicMock()

    async def _post(url, **kwargs):
        return _FakeLineVerifyResponse(200, {"sub": VERIFIED_SUB})

    fake_client.post = _post

    fake_cm = MagicMock()
    fake_cm.__aenter__ = AsyncMock(return_value=fake_client)
    fake_cm.__aexit__ = AsyncMock(return_value=False)

    monkeypatch.setattr(liff_module.httpx, "AsyncClient", MagicMock(return_value=fake_cm))


def _fresh_engine():
    return create_async_engine(str(settings.DATABASE_URL), poolclass=NullPool)


async def _fetch_request_attachments(request_id: int) -> list | None:
    engine = _fresh_engine()
    Session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    try:
        async with Session() as session:
            result = await session.execute(
                select(ServiceRequest).where(ServiceRequest.id == request_id)
            )
            row = result.scalar_one_or_none()
            return list(row.attachments) if row and row.attachments else row.attachments
    finally:
        await engine.dispose()


async def _delete_request(request_id: int) -> None:
    engine = _fresh_engine()
    Session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    try:
        async with Session() as session:
            result = await session.execute(
                select(ServiceRequest).where(ServiceRequest.id == request_id)
            )
            row = result.scalar_one_or_none()
            if row is not None:
                await session.delete(row)
                await session.commit()
    finally:
        await engine.dispose()


async def _delete_media_file(media_id: uuid.UUID) -> None:
    engine = _fresh_engine()
    Session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    try:
        async with Session() as session:
            result = await session.execute(
                select(MediaFile).where(MediaFile.id == media_id)
            )
            row = result.scalar_one_or_none()
            if row is not None:
                await session.delete(row)
                await session.commit()
    finally:
        await engine.dispose()


async def _count_by_description(description: str) -> int:
    engine = _fresh_engine()
    Session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    try:
        async with Session() as session:
            result = await session.execute(
                select(ServiceRequest).where(ServiceRequest.description == description)
            )
            return len(result.scalars().all())
    finally:
        await engine.dispose()


class TestLiffAttachmentResolution:
    @pytest.mark.asyncio
    async def test_forged_url_not_persisted(self, test_client, monkeypatch):
        """A real media id + phishing url stores the server URL, not the forgery."""
        monkeypatch.setattr(settings, "LIFF_STRICT_MODE", True)
        _patch_line_verify(monkeypatch)
        headers = {"x-liff-id-token": "tok-d4"}

        upload = test_client.post(
            MEDIA_ENDPOINT,
            files={"file": ("photo.jpg", JPEG_BYTES, "image/jpeg")},
            headers=headers,
        )
        assert upload.status_code == 200
        media_id = uuid.UUID(upload.json()["id"])
        request_id = None
        try:
            body = _service_request_body(
                "forged",
                attachments=[
                    {
                        "id": str(media_id),
                        "url": "https://evil.example/phish-login",
                        "name": "photo.jpg",
                    }
                ],
            )
            res = test_client.post(
                SERVICE_REQUESTS_ENDPOINT, json=body, headers=headers
            )
            assert res.status_code == 201
            request_id = res.json()["id"]

            stored = await _fetch_request_attachments(request_id)
            assert stored is not None and len(stored) == 1
            assert stored[0]["id"] == str(media_id)
            assert stored[0]["url"] == f"/api/v1/media/{media_id}"
            assert "evil.example" not in str(stored)
        finally:
            if request_id is not None:
                await _delete_request(request_id)
            await _delete_media_file(media_id)

    @pytest.mark.asyncio
    async def test_unknown_media_id_returns_400(self, test_client, monkeypatch):
        monkeypatch.setattr(settings, "LIFF_STRICT_MODE", True)
        _patch_line_verify(monkeypatch)

        body = _service_request_body(
            "unknown",
            attachments=[
                {
                    "id": str(uuid.uuid4()),
                    "url": "https://evil.example/phish-login",
                    "name": "photo.jpg",
                }
            ],
        )
        try:
            res = test_client.post(
                SERVICE_REQUESTS_ENDPOINT,
                json=body,
                headers={"x-liff-id-token": "tok-d4"},
            )

            assert res.status_code == 400
            assert await _count_by_description(body["description"]) == 0
        finally:
            # Self-cleaning: a regressed (201) run must not poison the next run.
            engine = _fresh_engine()
            Session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
            try:
                async with Session() as session:
                    result = await session.execute(
                        select(ServiceRequest).where(
                            ServiceRequest.description == body["description"]
                        )
                    )
                    for row in result.scalars().all():
                        await session.delete(row)
                    await session.commit()
            finally:
                await engine.dispose()

    @pytest.mark.asyncio
    async def test_honest_upload_round_trips(self, test_client, monkeypatch):
        """The real client flow (upload -> submit id) keeps working."""
        monkeypatch.setattr(settings, "LIFF_STRICT_MODE", True)
        _patch_line_verify(monkeypatch)
        headers = {"x-liff-id-token": "tok-d4"}

        upload = test_client.post(
            MEDIA_ENDPOINT,
            files={"file": ("photo.jpg", JPEG_BYTES, "image/jpeg")},
            headers=headers,
        )
        assert upload.status_code == 200
        media_id = uuid.UUID(upload.json()["id"])
        request_id = None
        try:
            body = _service_request_body(
                "honest",
                attachments=[
                    {
                        "id": str(media_id),
                        "url": f"/api/v1/media/{media_id}",
                        "name": upload.json()["filename"],
                    }
                ],
            )
            res = test_client.post(
                SERVICE_REQUESTS_ENDPOINT, json=body, headers=headers
            )
            assert res.status_code == 201
            request_id = res.json()["id"]

            stored = await _fetch_request_attachments(request_id)
            assert stored is not None and len(stored) == 1
            assert stored[0]["id"] == str(media_id)
            assert stored[0]["url"] == f"/api/v1/media/{media_id}"
        finally:
            if request_id is not None:
                await _delete_request(request_id)
            await _delete_media_file(media_id)
