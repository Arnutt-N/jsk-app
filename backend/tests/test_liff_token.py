"""Tests for P0.2 — LIFF_STRICT_MODE wiring + ID token verification.

Covers the 7-case matrix from `.claude/PRPs/prds/p0.2-liff-id-token.prd.md` FR3:
1. flag OFF, no token -> 201, owner = body value, source LIFF-unverified.
2. flag OFF, valid token, forged body line_user_id -> 201, owner = verified
   sub (forgery ignored), source LIFF v2.
3. flag OFF, invalid token (LINE 400) -> 401.
4. flag ON, no token -> 401, no ServiceRequest row created.
5. flag ON, valid token -> 201, owner = sub.
6. flag ON, invalid token -> 401.
7. verify_liff_token: LINE 200 without `sub` -> 401.

LINE's `/oauth2/v2.1/verify` endpoint is faked by monkeypatching
`httpx.AsyncClient` as used inside `app.api.v1.endpoints.liff` (mirrors the
idiom in `test_rich_menu_alias_service.py`), so every case here exercises the
real `verify_liff_token` HTTP-response-parsing path rather than mocking that
function directly. `LIFF_STRICT_MODE` is toggled per-test via
`monkeypatch.setattr(settings, ...)`.

Never log or assert on token *values* beyond using an opaque placeholder
string as the header — no real token material is involved.
"""
from unittest.mock import AsyncMock, MagicMock

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool

from app.api.v1.endpoints import liff as liff_module
from app.core.config import settings
from app.models.service_request import ServiceRequest
from app.models.user import User
from app.services.credential_service import credential_service

# The app's own AsyncSessionLocal (app/db/session.py) is bound to a pooled
# engine whose connections get created inside the TestClient's ASGI event
# loop (a separate loop/thread from this async test function's own
# pytest-asyncio loop). Reusing that shared pool here throws
# "attached to a different loop". A throwaway NullPool engine, created and
# disposed within this same test's event loop, avoids that cross-loop reuse.
def _fresh_engine():
    return create_async_engine(str(settings.DATABASE_URL), poolclass=NullPool)


def _service_request_body(line_user_id, marker: str) -> dict:
    """Minimal valid ServiceRequestCreate payload with a unique description
    marker so each test can find/clean up only the row it created."""
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
        "description": f"pytest-liff-token-{marker}",
        "line_user_id": line_user_id,
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


async def _fetch_and_delete(request_id: int):
    """Fetch a persisted ServiceRequest row's raw LINE ID/details by id,
    then delete it (test cleanup — this endpoint has no DELETE route).

    PR C: ServiceRequest carries only a user_id FK, so the raw LINE ID is
    recovered by joining to User and decrypting the surrogate."""
    engine = _fresh_engine()
    Session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    try:
        async with Session() as session:
            result = await session.execute(
                select(ServiceRequest).where(ServiceRequest.id == request_id)
            )
            row = result.scalar_one_or_none()
            if row is None:
                return None, None
            line_user_id = None
            if row.user_id is not None:
                user_result = await session.execute(
                    select(User).where(User.id == row.user_id)
                )
                user = user_result.scalar_one_or_none()
                if user is not None and user.line_user_id_encrypted:
                    line_user_id = credential_service.decrypt_line_id(
                        user.line_user_id_encrypted
                    )
            details = dict(row.details) if row.details else None
            await session.delete(row)
            await session.commit()
            return line_user_id, details
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


class TestLiffStrictModeWiring:
    """FR3 matrix — LIFF_STRICT_MODE + ID token verification (P0.2)."""

    @pytest.mark.asyncio
    async def test_case1_flag_off_no_token_uses_body_fallback(self, test_client, monkeypatch):
        monkeypatch.setattr(settings, "LIFF_STRICT_MODE", False)
        body = _service_request_body(line_user_id="Ubodyuser1234567890abcd", marker="case1")

        res = test_client.post("/api/v1/liff/service-requests", json=body)

        assert res.status_code == 201
        data = res.json()
        assert data["line_user_id"] == "Ubodyuser1234567890abcd"

        line_user_id, details = await _fetch_and_delete(data["id"])
        assert line_user_id == "Ubodyuser1234567890abcd"
        assert details == {"source": "LIFF-unverified"}

    @pytest.mark.asyncio
    async def test_case2_flag_off_valid_token_ignores_forged_body_id(self, test_client, monkeypatch):
        monkeypatch.setattr(settings, "LIFF_STRICT_MODE", False)
        verified_sub = "Uverifiedsub1234567890abcdef"
        _patch_line_verify(monkeypatch, _FakeLineVerifyResponse(200, {"sub": verified_sub}))

        body = _service_request_body(line_user_id="Uforgedbody0000000000000", marker="case2")
        res = test_client.post(
            "/api/v1/liff/service-requests",
            json=body,
            headers={"x-liff-id-token": "opaque-test-token"},
        )

        assert res.status_code == 201
        data = res.json()
        assert data["line_user_id"] == verified_sub
        assert data["line_user_id"] != body["line_user_id"]

        line_user_id, details = await _fetch_and_delete(data["id"])
        assert line_user_id == verified_sub
        assert details == {"source": "LIFF v2"}

    @pytest.mark.asyncio
    async def test_case3_flag_off_invalid_token_rejected(self, test_client, monkeypatch):
        monkeypatch.setattr(settings, "LIFF_STRICT_MODE", False)
        _patch_line_verify(monkeypatch, _FakeLineVerifyResponse(400, {}, text="invalid_request"))

        body = _service_request_body(line_user_id="Ushouldnotmatter00000000", marker="case3")
        res = test_client.post(
            "/api/v1/liff/service-requests",
            json=body,
            headers={"x-liff-id-token": "opaque-bad-token"},
        )

        assert res.status_code == 401
        assert await _count_by_description(body["description"]) == 0

    @pytest.mark.asyncio
    async def test_case4_flag_on_no_token_rejected_no_db_write(self, test_client, monkeypatch):
        monkeypatch.setattr(settings, "LIFF_STRICT_MODE", True)
        body = _service_request_body(line_user_id="Ushouldnotmatter11111111", marker="case4")

        res = test_client.post("/api/v1/liff/service-requests", json=body)

        assert res.status_code == 401
        assert await _count_by_description(body["description"]) == 0

    @pytest.mark.asyncio
    async def test_case5_flag_on_valid_token_creates_with_verified_sub(self, test_client, monkeypatch):
        monkeypatch.setattr(settings, "LIFF_STRICT_MODE", True)
        verified_sub = "Uverifiedsubstrict0000000001"
        _patch_line_verify(monkeypatch, _FakeLineVerifyResponse(200, {"sub": verified_sub}))

        body = _service_request_body(line_user_id=None, marker="case5")
        res = test_client.post(
            "/api/v1/liff/service-requests",
            json=body,
            headers={"x-liff-id-token": "opaque-good-token"},
        )

        assert res.status_code == 201
        data = res.json()
        assert data["line_user_id"] == verified_sub

        line_user_id, details = await _fetch_and_delete(data["id"])
        assert line_user_id == verified_sub
        assert details == {"source": "LIFF v2"}

    @pytest.mark.asyncio
    async def test_case6_flag_on_invalid_token_rejected(self, test_client, monkeypatch):
        monkeypatch.setattr(settings, "LIFF_STRICT_MODE", True)
        _patch_line_verify(monkeypatch, _FakeLineVerifyResponse(400, {}, text="invalid_request"))

        body = _service_request_body(line_user_id=None, marker="case6")
        res = test_client.post(
            "/api/v1/liff/service-requests",
            json=body,
            headers={"x-liff-id-token": "opaque-bad-token"},
        )

        assert res.status_code == 401
        assert await _count_by_description(body["description"]) == 0

    @pytest.mark.asyncio
    async def test_case7_verify_liff_token_rejects_200_without_sub(self, test_client, monkeypatch):
        # Exercises the real verify_liff_token parsing path directly (FR3 #7):
        # LINE returns HTTP 200 but the payload is missing the `sub` claim.
        monkeypatch.setattr(settings, "LIFF_STRICT_MODE", False)
        _patch_line_verify(monkeypatch, _FakeLineVerifyResponse(200, {"no_sub_here": True}))

        body = _service_request_body(line_user_id="Ushouldnotmatter22222222", marker="case7")
        res = test_client.post(
            "/api/v1/liff/service-requests",
            json=body,
            headers={"x-liff-id-token": "opaque-token-without-sub"},
        )

        assert res.status_code == 401
        assert await _count_by_description(body["description"]) == 0
