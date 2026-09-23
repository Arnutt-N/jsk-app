from types import SimpleNamespace
import uuid

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool

from app.api import deps as api_deps
from app.core.config import settings
from app.main import app
from app.models.user import User, UserRole


def _fresh_engine():
    return create_async_engine(str(settings.DATABASE_URL), poolclass=NullPool)


def _valid_days():
    # body ครบ 7 วันตาม BusinessHoursUpdate — ให้ gate เป็นตัวตอบ ไม่ใช่ 422
    return [
        {"day_of_week": i, "is_open": False, "open_time": "08:00", "close_time": "17:00"}
        for i in range(7)
    ]


@pytest_asyncio.fixture
async def real_admin():
    """Real user row — the PUT audit-log write has an FK to users."""
    engine = _fresh_engine()
    Session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with Session() as s:
        row = User(username=f"t-permkeys-{uuid.uuid4().hex[:8]}", role=UserRole.ADMIN, is_active=True)
        s.add(row)
        await s.commit()
        uid = row.id
    yield uid
    async with Session() as s:
        row = await s.get(User, uid)
        if row:
            await s.delete(row)
            await s.commit()
    await engine.dispose()


@pytest.mark.asyncio
async def test_matrix_has_new_keys(test_client):
    async def _override():
        yield SimpleNamespace(id=1, role=UserRole.SUPER_ADMIN, is_active=True)

    app.dependency_overrides[api_deps.get_current_user] = _override
    try:
        resp = test_client.get("/api/v1/admin/settings/permissions")
        assert resp.status_code == 200
        assert "manage_credentials" in resp.text
        assert "edit_business_hours" in resp.text
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_business_hours_put_admin_keeps_access(test_client, real_admin):
    # LOCK (ไม่ใช่ red-green — 200 ทั้งก่อนและหลัง):
    # ADMIN อยู่ใน DEFAULT_POLICY ของ key ใหม่ ({SUPER_ADMIN, ADMIN} ตาม Step 3)
    # เทสนี้กัน regression ว่า ADMIN ไม่เสียสิทธิ์หลังผูก gate;
    # RED-GREEN ของ task นี้อยู่ที่ test_matrix_has_new_keys (keys โผล่ใน matrix)
    async def _override():
        yield SimpleNamespace(id=real_admin, role=UserRole.ADMIN, is_active=True)

    app.dependency_overrides[api_deps.get_current_user] = _override
    try:
        resp = test_client.put(
            "/api/v1/admin/settings/business-hours",
            json={"days": _valid_days()},
        )
        assert resp.status_code == 200
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_business_hours_put_agent_still_forbidden(test_client):
    # LOCK (ไม่ใช่ red-green — ผ่านทั้งก่อนและหลัง): AGENT โดน gate เดิมกันอยู่แล้ว
    async def _override():
        yield SimpleNamespace(id=3, role=UserRole.AGENT, is_active=True)

    valid_days = [
        {"day_of_week": i, "is_open": False, "open_time": "08:00", "close_time": "17:00"}
        for i in range(7)
    ]
    app.dependency_overrides[api_deps.get_current_user] = _override
    try:
        resp = test_client.put(
            "/api/v1/admin/settings/business-hours",
            json={"days": valid_days},
        )
        assert resp.status_code == 403
    finally:
        app.dependency_overrides.clear()