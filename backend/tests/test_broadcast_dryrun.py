from types import SimpleNamespace
import pytest
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool

from app.api import deps as api_deps
from app.core.config import settings
from app.main import app
from app.models.broadcast import Broadcast
from app.models.user import UserRole


def _fresh_engine():
    return create_async_engine(str(settings.DATABASE_URL), poolclass=NullPool)


async def _count_broadcasts() -> int:
    engine = _fresh_engine()
    Session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    try:
        async with Session() as s:
            return (await s.execute(select(func.count()).select_from(Broadcast))).scalar_one()
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_dry_run_creates_nothing(test_client):
    async def _override():
        yield SimpleNamespace(id=1, role=UserRole.SUPER_ADMIN, is_active=True)

    app.dependency_overrides[api_deps.get_current_user] = _override
    try:
        before = await _count_broadcasts()
        resp = test_client.post(
            "/api/v1/admin/broadcasts",
            json={
                "title": "ทดสอบ dry-run",
                "message_type": "text",
                "content": {"text": "สวัสดี"},
                "target_audience": "all",
                "dry_run": True,
            },
        )
        assert resp.status_code == 200
        assert resp.json()["dry_run"] is True
        assert await _count_broadcasts() == before
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_agent_cannot_create_broadcast(test_client):
    async def _override():
        yield SimpleNamespace(id=2, role=UserRole.AGENT, is_active=True)

    app.dependency_overrides[api_deps.get_current_user] = _override
    try:
        resp = test_client.post(
            "/api/v1/admin/broadcasts",
            json={"title": "x", "message_type": "text", "content": {"text": "x"}, "target_audience": "all"},
        )
        assert resp.status_code == 403
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_retry_exhaustion_persists_failed_tokens(test_client, monkeypatch):
    # mock multicast พังครบ 3 รอบ -> ต้องมี failed-token rows ถูกสร้าง
    # (idempotent: รันซ้ำไม่สร้างซ้ำ) + timezone ข้ามวันยังตรง
    import asyncio as _asyncio
    from app.services.broadcast_service import broadcast_service
    from app.models.broadcast import Broadcast, BroadcastType
    from app.models.broadcast_failed_recipient import BroadcastFailedRecipient
    calls = {"n": 0}

    async def _boom(*_a, **_k):
        calls["n"] += 1
        raise RuntimeError("LINE down")

    async def _no_sleep(_s):
        return None

    # api is a lazy @property (no setter) — patch the backing attribute
    monkeypatch.setattr(broadcast_service, "_api", SimpleNamespace(multicast=_boom))
    monkeypatch.setattr(_asyncio, "sleep", _no_sleep)
    engine = _fresh_engine()
    Session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    try:
        async with Session() as db:
            # target_audience != "all" routes through the multicast chunk
            # loop where the bounded retry lives; "all" would hit api.broadcast
            # which the SimpleNamespace mock doesn't provide.
            b = Broadcast(title="retry", message_type=BroadcastType.TEXT,
                          content={"text": "hi"}, target_audience="specific",
                          target_filter={"user_ids": ["U1", "U2", "U3"]},
                          status="draft")
            db.add(b)
            await db.commit()
            await db.refresh(b)
            # RED: ก่อน implement send จะไม่ retry 3 รอบ และไม่มี failed rows
            out = await broadcast_service.send_broadcast(db, b)
            assert calls["n"] >= 3, "retry must attempt multicast 3 times before giving up"
            assert out.failure_count and out.failure_count > 0
            rows = (await db.execute(
                select(BroadcastFailedRecipient).where(
                    BroadcastFailedRecipient.broadcast_id == b.id))
            ).scalars().all()
            assert len(rows) > 0
            # cleanup กันพังกลางทาง
            for r in rows:
                await db.delete(r)
            await db.delete(b)
            await db.commit()
    finally:
        await engine.dispose()
