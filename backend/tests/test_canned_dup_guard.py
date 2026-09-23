import uuid
from types import SimpleNamespace
import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool

from sqlalchemy import delete as sa_delete

from app.api import deps as api_deps
from app.core.config import settings
from app.main import app
from app.models.canned_response import CannedResponse
from app.models.user import User, UserRole


def _fresh_engine():
    return create_async_engine(str(settings.DATABASE_URL), poolclass=NullPool)


@pytest_asyncio.fixture
async def canned_admin():
    """Real user row — canned_responses.created_by has an FK to users."""
    engine = _fresh_engine()
    Session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with Session() as s:
        admin = User(username=f"t-canned-{uuid.uuid4().hex[:8]}", role=UserRole.SUPER_ADMIN, is_active=True)
        s.add(admin)
        await s.commit()
        admin_id = admin.id
    yield admin_id
    async with Session() as s:
        # hard delete: the API delete is a soft delete and the shortcut unique
        # index is not partial, so leftovers would collide on the next run
        await s.execute(sa_delete(CannedResponse).where(CannedResponse.created_by == admin_id))
        row = await s.get(User, admin_id)
        if row:
            await s.delete(row)
        await s.commit()
    await engine.dispose()


@pytest.mark.asyncio
async def test_duplicate_normalized_content_rejected(test_client, canned_admin):
    async def _override():
        yield SimpleNamespace(id=canned_admin, role=UserRole.SUPER_ADMIN, is_active=True)

    app.dependency_overrides[api_deps.get_current_user] = _override
    r1 = None
    try:
        r1 = test_client.post(
            "/api/v1/admin/canned-responses",
            json={"shortcut": "dup-a", "title": "ทักทาย", "content": "สวัสดีค่ะ"},
        )
        assert r1.status_code == 200
        dup = test_client.post(
            "/api/v1/admin/canned-responses",
            json={"shortcut": "dup-b", "title": "ทักทาย2", "content": "  สวัสดีค่ะ  "},
        )
        assert dup.status_code == 409
        assert "ทักทาย" in dup.text  # บอกชื่อรายการที่ชน (PRD story 22)
    finally:
        # cleanup: dup-b ไม่ถูกสร้าง (409) — ลบแค่ dup-a ผ่าน DELETE /{id}
        # (ต้องลบก่อน clear override — endpoint ต้อง auth)
        if r1 is not None and r1.status_code == 200:
            test_client.delete(f"/api/v1/admin/canned-responses/{r1.json()['id']}")
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_stale_updated_at_rejected(test_client, canned_admin):
    async def _override():
        yield SimpleNamespace(id=canned_admin, role=UserRole.SUPER_ADMIN, is_active=True)

    app.dependency_overrides[api_deps.get_current_user] = _override
    r1 = None
    try:
        r1 = test_client.post(
            "/api/v1/admin/canned-responses",
            json={"shortcut": "dup-c", "title": "นัดหมาย", "content": "นัดหมายล่วงหน้า"},
        )
        rid = r1.json()["id"]
        stale = test_client.put(
            f"/api/v1/admin/canned-responses/{rid}",
            json={"content": "แก้ทับ", "updated_at": "2000-01-01T00:00:00+00:00"},
        )
        assert stale.status_code == 409
    finally:
        if r1 is not None and r1.status_code == 200:
            test_client.delete(f"/api/v1/admin/canned-responses/{r1.json()['id']}")
        app.dependency_overrides.clear()
