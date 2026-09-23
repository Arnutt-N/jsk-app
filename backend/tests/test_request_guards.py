from types import SimpleNamespace
import pytest
import pytest_asyncio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool

from app.api import deps as api_deps
from app.core.config import settings
from app.main import app
from app.models.audit_log import AuditLog
from app.models.service_request import ServiceRequest
from app.models.user import User, UserRole


def _fresh_engine():
    return create_async_engine(str(settings.DATABASE_URL), poolclass=NullPool)


@pytest_asyncio.fixture
async def owned_request():
    engine = _fresh_engine()
    Session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with Session() as s:
        admin = User(username="pytest-del-audit", role=UserRole.SUPER_ADMIN, is_active=True)
        s.add(admin)
        await s.flush()
        row = ServiceRequest(description="pytest-delete-audit", source="ADMIN")
        s.add(row)
        await s.commit()
        rid, admin_id = row.id, admin.id
        yield Session, rid, admin_id
    async with Session() as s:
        for r in (await s.execute(
            select(AuditLog).where(AuditLog.resource_id == str(rid))
        )).scalars():
            await s.delete(r)
        left = await s.get(ServiceRequest, rid)
        if left:
            await s.delete(left)
        admin_row = await s.get(User, admin_id)
        if admin_row:
            await s.delete(admin_row)
        await s.commit()
    await engine.dispose()


@pytest.mark.asyncio
async def test_delete_writes_audit(test_client, owned_request):
    Session, rid, admin_id = owned_request

    async def _override():
        yield SimpleNamespace(id=admin_id, role=UserRole.SUPER_ADMIN, is_active=True)

    async def _override_db():
        async with Session() as s:
            yield s

    app.dependency_overrides[api_deps.get_current_user] = _override
    app.dependency_overrides[api_deps.get_current_admin] = _override
    app.dependency_overrides[api_deps.get_db] = _override_db
    try:
        resp = test_client.delete(f"/api/v1/admin/requests/{rid}")
        assert resp.status_code == 204
        async with Session() as s:
            logs = (await s.execute(select(AuditLog).where(
                AuditLog.action == "delete_request",
                AuditLog.resource_id == str(rid),
            ))).scalars().all()
            assert len(logs) == 1
    finally:
        app.dependency_overrides.clear()
