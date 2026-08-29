"""Tests for the LIFF media upload contract (POST /api/v1/liff/media).

Covers PRD `.claude/PRPs/prds/liff-media-upload-id-token.prd.md` matrix B1-B10:
token-required strict mode, always-verify-on-present-token, LINE verify spy
assertions, MIME/size validation with boundary, 503 misconfiguration guard,
and shared `liff-submit` rate-limit bucket wiring across both LIFF routes.

LINE's verify endpoint is faked by monkeypatching `httpx.AsyncClient` as
imported into `app.api.v1.endpoints.liff` (same pattern as test_liff_token.py,
no real network calls). DB assertions use a throwaway NullPool engine because
the app's pooled session is bound to the TestClient's event loop.
"""

import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool

from app.api.v1.endpoints import liff as liff_module
from app.core import http_rate_limit as http_rate_limit_module
from app.core.config import settings
from app.models.media_file import MediaFile

MEDIA_ENDPOINT = "/api/v1/liff/media"
SERVICE_REQUESTS_ENDPOINT = "/api/v1/liff/service-requests"
VERIFIED_SUB = "U0123456789abcdef0123456789abcdef"
JPEG_BYTES = b"\xff\xd8\xfffake-jpeg"


def _jpeg_file(content: bytes = JPEG_BYTES) -> dict:
    return {"file": ("photo.jpg", content, "image/jpeg")}


def _service_request_body() -> dict:
    """Minimal valid ServiceRequestCreate payload (same shape as
    test_liff_token.py's body helper)."""
    return {
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
        "description": "pytest-liff-media-upload-b10",
        "line_user_id": "Ubodyuser1234567890abcd",
    }


class _FakeLineVerifyResponse:
    """Stand-in for the httpx.Response returned by LINE's verify endpoint."""

    def __init__(self, status_code: int = 200, json_data: dict | None = None, text: str = ""):
        self.status_code = status_code
        self._json_data = json_data or {}
        self.text = text

    def json(self):
        return self._json_data


def _patch_line_verify(monkeypatch, resp: _FakeLineVerifyResponse) -> None:
    """Monkeypatch httpx.AsyncClient (as imported into liff.py) so that
    verify_liff_token's POST to LINE's verify endpoint returns `resp`,
    without making a real network call."""
    fake_client = MagicMock()

    async def _post(url, **kwargs):
        return resp

    fake_client.post = _post

    fake_cm = MagicMock()
    fake_cm.__aenter__ = AsyncMock(return_value=fake_client)
    fake_cm.__aexit__ = AsyncMock(return_value=False)

    monkeypatch.setattr(liff_module.httpx, "AsyncClient", MagicMock(return_value=fake_cm))


def _patch_line_verify_spy(monkeypatch, resp: _FakeLineVerifyResponse) -> AsyncMock:
    """Spy variant: returns the post AsyncMock so tests can assert the exact
    LINE verify call (positional URL + data kwargs + call count)."""
    post_mock = AsyncMock(return_value=resp)
    fake_client = MagicMock()
    fake_client.post = post_mock

    fake_cm = MagicMock()
    fake_cm.__aenter__ = AsyncMock(return_value=fake_client)
    fake_cm.__aexit__ = AsyncMock(return_value=False)

    monkeypatch.setattr(liff_module.httpx, "AsyncClient", MagicMock(return_value=fake_cm))
    return post_mock


def _fresh_engine():
    return create_async_engine(str(settings.DATABASE_URL), poolclass=NullPool)


async def _count_media_files() -> int:
    engine = _fresh_engine()
    Session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    try:
        async with Session() as session:
            result = await session.execute(select(func.count()).select_from(MediaFile))
            return result.scalar_one()
    finally:
        await engine.dispose()


async def _fetch_media_file(media_id: uuid.UUID) -> MediaFile | None:
    engine = _fresh_engine()
    Session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    try:
        async with Session() as session:
            result = await session.execute(
                select(MediaFile).where(MediaFile.id == media_id)
            )
            return result.scalar_one_or_none()
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


class TestLiffMediaUploadContract:
    """PRD matrix B1-B10 — POST /api/v1/liff/media contract."""

    @pytest.mark.asyncio
    async def test_b1_strict_on_no_token_returns_401_without_db_write(
        self, test_client, monkeypatch
    ):
        monkeypatch.setattr(settings, "LIFF_STRICT_MODE", True)
        before = await _count_media_files()

        res = test_client.post(MEDIA_ENDPOINT, files=_jpeg_file())

        assert res.status_code == 401
        assert res.json()["detail"] == "LIFF ID token required"
        assert await _count_media_files() == before

    @pytest.mark.asyncio
    async def test_b2_strict_on_valid_token_uploads_and_verifies(
        self, test_client, monkeypatch
    ):
        monkeypatch.setattr(settings, "LIFF_STRICT_MODE", True)
        post_mock = _patch_line_verify_spy(
            monkeypatch, _FakeLineVerifyResponse(200, {"sub": VERIFIED_SUB})
        )

        media_id = None
        try:
            res = test_client.post(
                MEDIA_ENDPOINT,
                files=_jpeg_file(),
                headers={"x-liff-id-token": "tok-valid"},
            )

            assert res.status_code == 200
            data = res.json()
            assert data["filename"] == "photo.jpg"
            media_id = uuid.UUID(data["id"])

            post_mock.assert_awaited_once_with(
                "https://api.line.me/oauth2/v2.1/verify",
                data={
                    "id_token": "tok-valid",
                    "client_id": settings.LINE_LOGIN_CHANNEL_ID,
                },
            )

            media = await _fetch_media_file(media_id)
            assert media is not None
            assert media.filename == "photo.jpg"
            assert media.mime_type == "image/jpeg"
            assert media.size_bytes == len(JPEG_BYTES)
            assert media.data == JPEG_BYTES
        finally:
            if media_id is not None:
                await _delete_media_file(media_id)

    @pytest.mark.asyncio
    async def test_b3_strict_on_invalid_token_returns_401(
        self, test_client, monkeypatch
    ):
        monkeypatch.setattr(settings, "LIFF_STRICT_MODE", True)
        _patch_line_verify(
            monkeypatch, _FakeLineVerifyResponse(400, {}, text="invalid_request")
        )

        res = test_client.post(
            MEDIA_ENDPOINT,
            files=_jpeg_file(),
            headers={"x-liff-id-token": "tok-invalid"},
        )

        assert res.status_code == 401
        assert res.json()["detail"] == "Invalid LIFF ID token"

    @pytest.mark.asyncio
    async def test_b4_strict_on_verify_200_without_sub_returns_401(
        self, test_client, monkeypatch
    ):
        monkeypatch.setattr(settings, "LIFF_STRICT_MODE", True)
        _patch_line_verify(monkeypatch, _FakeLineVerifyResponse(200, {"no_sub_here": True}))

        res = test_client.post(
            MEDIA_ENDPOINT,
            files=_jpeg_file(),
            headers={"x-liff-id-token": "tok-no-sub"},
        )

        assert res.status_code == 401
        assert res.json()["detail"] == "LIFF token missing sub claim"

    @pytest.mark.asyncio
    async def test_b5_disallowed_mime_returns_400(self, test_client, monkeypatch):
        monkeypatch.setattr(settings, "LIFF_STRICT_MODE", True)
        _patch_line_verify(
            monkeypatch, _FakeLineVerifyResponse(200, {"sub": VERIFIED_SUB})
        )

        res = test_client.post(
            MEDIA_ENDPOINT,
            files={"file": ("notes.txt", b"hello", "text/plain")},
            headers={"x-liff-id-token": "tok-valid"},
        )

        assert res.status_code == 400
        assert "ประเภทไฟล์ไม่รองรับ" in res.json()["detail"]

    @pytest.mark.asyncio
    async def test_b6_size_boundary_max_accepted_max_plus_one_rejected(
        self, test_client, monkeypatch
    ):
        monkeypatch.setattr(settings, "LIFF_STRICT_MODE", True)
        monkeypatch.setattr(liff_module, "_LIFF_MEDIA_MAX_BYTES", 16)
        _patch_line_verify(
            monkeypatch, _FakeLineVerifyResponse(200, {"sub": VERIFIED_SUB})
        )

        media_id = None
        try:
            exactly_max = test_client.post(
                MEDIA_ENDPOINT,
                files=_jpeg_file(b"\xff\xd8\xff" + b"\x00" * 13),
                headers={"x-liff-id-token": "tok-valid"},
            )
            assert exactly_max.status_code == 200
            media_id = uuid.UUID(exactly_max.json()["id"])

            over_max = test_client.post(
                MEDIA_ENDPOINT,
                files=_jpeg_file(b"\xff\xd8\xff" + b"\x00" * 14),
                headers={"x-liff-id-token": "tok-valid"},
            )
            assert over_max.status_code == 413
            assert "ใหญ่เกินไป" in over_max.json()["detail"]
        finally:
            if media_id is not None:
                await _delete_media_file(media_id)

    @pytest.mark.asyncio
    async def test_b7_strict_off_no_token_accepted(self, test_client, monkeypatch):
        monkeypatch.setattr(settings, "LIFF_STRICT_MODE", False)

        media_id = None
        try:
            res = test_client.post(MEDIA_ENDPOINT, files=_jpeg_file())

            assert res.status_code == 200
            data = res.json()
            assert data["filename"] == "photo.jpg"
            media_id = uuid.UUID(data["id"])
            media = await _fetch_media_file(media_id)
            assert media is not None
            assert media.mime_type == "image/jpeg"
        finally:
            if media_id is not None:
                await _delete_media_file(media_id)

    @pytest.mark.asyncio
    async def test_b8_strict_off_invalid_token_still_rejected(
        self, test_client, monkeypatch
    ):
        monkeypatch.setattr(settings, "LIFF_STRICT_MODE", False)
        _patch_line_verify(
            monkeypatch, _FakeLineVerifyResponse(400, {}, text="invalid_request")
        )

        res = test_client.post(
            MEDIA_ENDPOINT,
            files=_jpeg_file(),
            headers={"x-liff-id-token": "tok-invalid"},
        )

        assert res.status_code == 401
        assert res.json()["detail"] == "Invalid LIFF ID token"

    @pytest.mark.asyncio
    @pytest.mark.parametrize("blank_channel_id", ["", "   "])
    async def test_b9_blank_channel_id_returns_503_without_db_write(
        self, test_client, monkeypatch, blank_channel_id
    ):
        monkeypatch.setattr(settings, "LIFF_STRICT_MODE", True)
        monkeypatch.setattr(settings, "LINE_LOGIN_CHANNEL_ID", blank_channel_id)
        before = await _count_media_files()

        res = test_client.post(
            MEDIA_ENDPOINT,
            files=_jpeg_file(),
            headers={"x-liff-id-token": "tok-valid"},
        )

        assert res.status_code == 503
        assert res.json()["detail"] == "LIFF verification unavailable: server misconfiguration"
        assert await _count_media_files() == before

    @pytest.mark.asyncio
    async def test_b10_media_shares_liff_submit_bucket_with_service_requests(
        self, test_client, monkeypatch
    ):
        """FR8 proof: both LIFF routes share the exact `liff-submit` bucket.

        The rate-limit dependency captures max_events at decoration time, so
        settings monkeypatching has no effect; instead we read the captured
        value and fake the Redis-backed counter deterministically. The
        monkeypatch restores the real binding afterwards, so nothing leaks.
        """
        monkeypatch.setattr(settings, "LIFF_STRICT_MODE", True)
        recorded: list[str] = []
        limit = settings.LIFF_SUBMIT_RATE_LIMIT

        async def fake_fixed_window_allow(key, *, max_events, window_seconds):
            recorded.append(key)
            return len(recorded) <= max_events

        monkeypatch.setattr(
            http_rate_limit_module.redis_client,
            "fixed_window_allow",
            fake_fixed_window_allow,
        )

        for _ in range(limit):
            res = test_client.post(MEDIA_ENDPOINT, files=_jpeg_file())
            # strict mode + no token: 401 from the handler, but the route
            # rate-limit dependency already ran and counted the request.
            assert res.status_code == 401

        res = test_client.post(SERVICE_REQUESTS_ENDPOINT, json=_service_request_body())
        assert res.status_code == 429

        assert len(set(recorded)) == 1
        assert recorded[0].startswith("ratelimit:liff-submit:")
