import pytest
import pytest_asyncio
from types import SimpleNamespace
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool

from app.api import deps as api_deps
from app.core.config import settings
from app.main import app
from app.models.message import Message, MessageDirection, SenderRole
from app.models.user import User, UserRole
from app.services.friend_service import friend_service


def _fresh_engine():
    return create_async_engine(str(settings.DATABASE_URL), poolclass=NullPool)


@pytest_asyncio.fixture
async def seeded_conversation():
    # identity แบบเดียวกับ B1/C8: get_or_create_user เติม HMAC surrogate เอง
    # (resolve_by_line_id ค้นด้วย hash — user_identity_service.py:81-86)
    from sqlalchemy import select

    engine = _fresh_engine()
    Session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    line_id = "Uhistories00000000000001"
    async with Session() as s:
        citizen = await friend_service.get_or_create_user(line_id, s, commit=False)
        await s.flush()
        for i in range(5):
            s.add(Message(
                user_id=citizen.id,
                direction=MessageDirection.INCOMING,
                message_type="text",
                content=f"ข้อความ {i}",
                sender_role=SenderRole.USER,
            ))
        await s.commit()
        uid = citizen.id
    yield Session, uid, line_id
    async with Session() as s:
        for r in (await s.execute(
            select(Message).where(Message.user_id == uid)
        )).scalars().all():
            await s.delete(r)
        u = await s.get(User, uid)
        if u:
            await s.delete(u)
        await s.commit()
    await engine.dispose()


@pytest.mark.asyncio
async def test_messages_limit_clamped(test_client, seeded_conversation):
    Session, uid, line_id = seeded_conversation

    async def _override():
        yield SimpleNamespace(id=1, role=UserRole.ADMIN, is_active=True)

    app.dependency_overrides[api_deps.get_current_user] = _override
    try:
        resp = test_client.get(
            f"/api/v1/admin/live-chat/conversations/{line_id}/messages?limit=9999"
        )
        assert resp.status_code == 200
        assert len(resp.json()["messages"]) <= 100
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_csv_export_streams_with_rfc5987_filename(test_client, seeded_conversation):
    Session, uid, line_id = seeded_conversation

    async def _override():
        yield SimpleNamespace(id=1, role=UserRole.ADMIN, is_active=True)

    app.dependency_overrides[api_deps.get_current_user] = _override
    try:
        resp = test_client.get(f"/api/v1/admin/export/conversations/{line_id}/csv")
        assert resp.status_code == 200
        assert "text/csv" in resp.headers["content-type"]
        assert "filename*=" in resp.headers["content-disposition"]
    finally:
        app.dependency_overrides.clear()
