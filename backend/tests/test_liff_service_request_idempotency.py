"""F4 — LIFF case submission must be idempotent per x-submission-id.

Two POSTs with the same submission id from the same verified caller must return
the original case, not create a duplicate. A different id creates a second
case, a concurrent same-id race yields one row, and a different caller reusing
the id gets 409. Uses the real DB (unique index + IntegrityError replay), the
same surface as test_admin_bookings_idempotency.py.
"""

import asyncio
import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool

from app.api import deps
from app.api.v1.endpoints import liff as liff_module
from app.core.config import settings
from app.models.service_request import ServiceRequest
from app.models.user import User, UserRole
from app.schemas.service_request_liff import ServiceRequestCreate
from app.services.user_identity_service import populate_surrogate

ENDPOINT = "/api/v1/liff/service-requests"
SUB_A = "UfidA00000000000000000000000001"
SUB_B = "UfidB00000000000000000000000001"
TOKEN_A = "tok-fid-A"
TOKEN_B = "tok-fid-B"
TOKEN_MAP = {TOKEN_A: SUB_A, TOKEN_B: SUB_B}


def _body(marker: str) -> dict:
    return {
        "topic_category": "ร้องเรียน/ร้องทุกข์",
        "description": f"pytest-fid-{marker}",
        "firstname": "ทดสอบ",
    }


def _fresh_engine():
    return create_async_engine(str(settings.DATABASE_URL), poolclass=NullPool)


def _patch_line_verify(monkeypatch) -> None:
    fake_client = MagicMock()

    async def _post(url, **kwargs):
        token = (kwargs.get("data") or {}).get("id_token")
        if token not in TOKEN_MAP:
            resp = MagicMock()
            resp.status_code = 401
            resp.text = "bad token"
            return resp
        resp = MagicMock()
        resp.status_code = 200
        resp.json.return_value = {"sub": TOKEN_MAP[token]}
        return resp

    fake_client.post = _post
    fake_cm = MagicMock()
    fake_cm.__aenter__ = AsyncMock(return_value=fake_client)
    fake_cm.__aexit__ = AsyncMock(return_value=False)
    monkeypatch.setattr(liff_module.httpx, "AsyncClient", MagicMock(return_value=fake_cm))


async def _seed_user(sub: str, suffix: str) -> int:
    engine = _fresh_engine()
    Session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    try:
        async with Session() as session:
            # Reuse a prior run's row if present (unique username/hash), so a
            # crashed test does not poison the next run.
            from app.services.user_identity_service import resolve_by_line_id

            existing = await resolve_by_line_id(session, sub)
            if existing is not None:
                return existing.id
            user = User(
                username=f"px-fid-{suffix}-{uuid.uuid4().hex[:8]}",
                display_name="PX FID",
                role=UserRole.USER,
                is_active=True,
            )
            populate_surrogate(user, sub)
            session.add(user)
            await session.commit()
            return user.id
    finally:
        await engine.dispose()


async def _rows_for(submission_id: str) -> list[int]:
    engine = _fresh_engine()
    Session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    try:
        async with Session() as session:
            result = await session.execute(
                select(ServiceRequest.id).where(
                    ServiceRequest.submission_id == submission_id
                )
            )
            return list(result.scalars().all())
    finally:
        await engine.dispose()


async def _cleanup(submission_ids: list[str]) -> None:
    engine = _fresh_engine()
    Session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    try:
        async with Session() as session:
            await session.execute(
                delete(ServiceRequest).where(
                    ServiceRequest.submission_id.in_(submission_ids)
                )
            )
            await session.commit()
    finally:
        await engine.dispose()


@pytest.fixture
def seeded_users():
    """One-time seed; ids returned for identity assertions."""
    a = asyncio.run(_seed_user(SUB_A, "a"))
    b = asyncio.run(_seed_user(SUB_B, "b"))
    return a, b


@pytest.fixture
def db_override():
    engine = _fresh_engine()
    Session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async def _fresh_get_db():
        async with Session() as session:
            yield session

    app = pytest.importorskip("app.main").app
    app.dependency_overrides[deps.get_db] = _fresh_get_db
    yield
    app.dependency_overrides.clear()
    # engine disposal deferred to GC-safe asyncio loop close in each test


@pytest.mark.asyncio
async def test_replay_same_submission_id_returns_original_case(
    test_client, monkeypatch, seeded_users, db_override
):
    marker = uuid.uuid4().hex[:10]
    sid = f"sub-fid-replay-{marker}"
    monkeypatch.setattr(settings, "LIFF_STRICT_MODE", True)
    _patch_line_verify(monkeypatch)
    try:
        body = _body(marker)
        hdr = {"x-liff-id-token": TOKEN_A, "x-submission-id": sid}
        first = test_client.post(ENDPOINT, json=body, headers=hdr)
        second = test_client.post(ENDPOINT, json=body, headers=hdr)
        assert first.status_code == 201, first.text
        assert second.status_code == 201, second.text
        assert first.json()["id"] == second.json()["id"]
        assert len(await _rows_for(sid)) == 1
    finally:
        await _cleanup([sid])


@pytest.mark.asyncio
async def test_changed_payload_conflict_has_machine_readable_code(
    test_client, monkeypatch, seeded_users, db_override
):
    marker = uuid.uuid4().hex[:10]
    sid = f"sub-fid-conflict-{marker}"
    monkeypatch.setattr(settings, "LIFF_STRICT_MODE", True)
    _patch_line_verify(monkeypatch)
    try:
        hdr = {"x-liff-id-token": TOKEN_A, "x-submission-id": sid}
        original = test_client.post(ENDPOINT, json=_body(marker), headers=hdr)
        edited = test_client.post(ENDPOINT, json=_body(f"{marker}-edited"), headers=hdr)
        assert original.status_code == 201, original.text
        assert edited.status_code == 409, edited.text
        detail = edited.json()["detail"]
        assert detail["code"] == liff_module.SUBMISSION_CONFLICT_CODE
        assert len(await _rows_for(sid)) == 1
    finally:
        await _cleanup([sid])


@pytest.mark.asyncio
async def test_different_submission_ids_create_two_rows(
    test_client, monkeypatch, seeded_users, db_override
):
    marker = uuid.uuid4().hex[:10]
    sid1 = f"sub-fid-two-a-{marker}"
    sid2 = f"sub-fid-two-b-{marker}"
    monkeypatch.setattr(settings, "LIFF_STRICT_MODE", True)
    _patch_line_verify(monkeypatch)
    try:
        hdr1 = {"x-liff-id-token": TOKEN_A, "x-submission-id": sid1}
        hdr2 = {"x-liff-id-token": TOKEN_A, "x-submission-id": sid2}
        first = test_client.post(ENDPOINT, json=_body(marker), headers=hdr1)
        second = test_client.post(ENDPOINT, json=_body(marker), headers=hdr2)
        assert first.status_code == 201, first.text
        assert second.status_code == 201, second.text
        assert first.json()["id"] != second.json()["id"]
        assert len(await _rows_for(sid1)) == 1
        assert len(await _rows_for(sid2)) == 1
    finally:
        await _cleanup([sid1, sid2])


@pytest.mark.asyncio
async def test_mismatched_identity_gets_409(
    test_client, monkeypatch, seeded_users, db_override
):
    marker = uuid.uuid4().hex[:10]
    sid = f"sub-fid-ident-{marker}"
    monkeypatch.setattr(settings, "LIFF_STRICT_MODE", True)
    _patch_line_verify(monkeypatch)
    try:
        own = test_client.post(
            ENDPOINT,
            json=_body(marker),
            headers={"x-liff-id-token": TOKEN_A, "x-submission-id": sid},
        )
        other = test_client.post(
            ENDPOINT,
            json=_body(marker),
            headers={"x-liff-id-token": TOKEN_B, "x-submission-id": sid},
        )
        assert own.status_code == 201, own.text
        assert other.status_code == 409, other.text
        assert len(await _rows_for(sid)) == 1
    finally:
        await _cleanup([sid])


@pytest.mark.asyncio
async def test_concurrent_same_submission_id_yields_one_row(monkeypatch, seeded_users):
    """Real DB race: two coroutines with separate sessions, one id, one row."""
    marker = uuid.uuid4().hex[:10]
    sid = f"sub-fid-race-{marker}"
    _patch_line_verify(monkeypatch)
    payload = ServiceRequestCreate(**_body(marker))

    async def _call():
        async with AsyncSession(_fresh_engine()) as session:
            return await liff_module.create_service_request(
                payload,
                db=session,
                x_liff_id_token=TOKEN_A,
                x_submission_id=sid,
            )

    try:
        first, second = await asyncio.gather(_call(), _call())
        assert first.id == second.id
        assert len(await _rows_for(sid)) == 1
    finally:
        await _cleanup([sid])
