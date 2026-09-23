import uuid

import pytest
import pytest_asyncio
from fastapi import HTTPException
from sqlalchemy import delete, update
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool

from app.core.config import settings
from app.core.websocket_manager import ws_manager
from app.models.chat_session import ChatSession, SessionStatus
from app.models.message import Message
from app.models.user import User, UserRole
from app.services.friend_service import friend_service


def _fresh_engine():
    return create_async_engine(str(settings.DATABASE_URL), poolclass=NullPool)


@pytest_asyncio.fixture
async def live_session():
    engine = _fresh_engine()
    Session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    line_id = "Ughostpush00000000000001"
    suffix = uuid.uuid4().hex[:8]
    async with Session() as db:
        op = User(username=f"t-ghost-op-{suffix}", role=UserRole.AGENT, is_active=True)
        db.add(op)
        await db.flush()
        citizen = await friend_service.get_or_create_user(line_id, db, commit=False)
        sess = ChatSession(user_id=citizen.id, status=SessionStatus.ACTIVE.value, operator_id=op.id)
        db.add(sess)
        await db.commit()
        ids = {"line": line_id, "op": op.id, "citizen": citizen.id, "session": sess.id}
    yield Session, ids
    async with Session() as db:
        sess = await db.get(ChatSession, ids["session"])
        if sess:
            await db.delete(sess)
            await db.commit()
        # the citizen row may already hold messages/sessions from other tests —
        # drop those references before deleting the user
        await db.execute(delete(Message).where(Message.user_id == ids["citizen"]))
        await db.execute(delete(ChatSession).where(ChatSession.user_id == ids["citizen"]))
        await db.commit()
        for uid in (ids["citizen"], ids["op"]):
            row = await db.get(User, uid)
            if row:
                await db.delete(row)
        await db.commit()
    await engine.dispose()


@pytest.mark.asyncio
async def test_push_after_transfer_blocked(live_session, monkeypatch):
    from app.services.live_chat_service import live_chat_service

    Session, ids = live_session
    pushed = []
    import app.services.live_chat_service.messaging as messaging_module

    async def _fake_push(line_user_id, messages):
        pushed.append(line_user_id)

    monkeypatch.setattr(messaging_module.line_service, "push_messages", _fake_push)
    async with Session() as db:
        other = User(username=f"t-ghost-op2-{uuid.uuid4().hex[:8]}", role=UserRole.AGENT, is_active=True)
        db.add(other)
        await db.flush()
        await db.execute(
            update(ChatSession)
            .where(ChatSession.id == ids["session"])
            .values(operator_id=other.id)
        )
        await db.commit()
        other_id = other.id
    try:
        async with Session() as db:
            with pytest.raises(HTTPException) as exc:
                await live_chat_service.send_message(ids["line"], "ผี", ids["op"], db)
            # contract ที่ล็อก: pre-check เดิม (_require_active_session_owner,
            # sessions.py:148-152) ยิงก่อน guard เสมอ → displaced operator ได้ 403
            # (พฤติกรรมเดิม ห้ามเปลี่ยนเพราะ admin_live_chat ผูกอยู่); 409 เป็นของ
            # guard สำหรับ TOCTOU race ในเทสถัดไป
            assert exc.value.status_code == 403
        assert pushed == []  # ไม่มี ghost push ถึงประชาชน
    finally:
        async with Session() as db:
            await db.delete(await db.get(User, other_id))
            await db.commit()


@pytest.mark.asyncio
async def test_push_race_blocked_409(live_session, monkeypatch):
    """TOCTOU race: pre-check ผ่านตอนยังเป็นเจ้าของ แล้วเคสถูกโอนก่อนถึง push."""
    from app.services.live_chat_service import live_chat_service

    Session, ids = live_session
    pushed = []
    import app.services.live_chat_service.messaging as messaging_module

    async def _fake_push(line_user_id, messages):
        pushed.append(line_user_id)

    monkeypatch.setattr(messaging_module.line_service, "push_messages", _fake_push)
    async with Session() as db:
        other = User(username=f"t-ghost-op3-{uuid.uuid4().hex[:8]}", role=UserRole.AGENT, is_active=True)
        db.add(other)
        await db.flush()
        await db.execute(
            update(ChatSession)
            .where(ChatSession.id == ids["session"])
            .values(operator_id=other.id)
        )
        await db.commit()
        other_id = other.id

    # จำลอง pre-check ที่ผ่านไปแล้วก่อนโอน: คืน session ตาม id โดยไม่ตรวจเจ้าของ
    async def _stale_check(line_user_id, operator_id, db):
        return await db.get(ChatSession, ids["session"])

    monkeypatch.setattr(live_chat_service, "_require_active_session_owner", _stale_check)
    try:
        async with Session() as db:
            with pytest.raises(HTTPException) as exc:
                await live_chat_service.send_message(ids["line"], "ผี", ids["op"], db)
            assert exc.value.status_code == 409  # guard จับได้หลัง save ก่อน push
        assert pushed == []
    finally:
        async with Session() as db:
            await db.delete(await db.get(User, other_id))
            await db.commit()


@pytest.mark.asyncio
async def test_presence_burst_bounded(monkeypatch):
    from app.core.redis_client import redis_client

    # the singleton connects during app lifespan; unit tests connect directly
    if redis_client._redis is None:
        await redis_client.connect()
    real = redis_client._redis
    assert real is not None, "Redis ต้อง online (conftest probe)"

    class _Counting:
        def __init__(self, inner):
            self._inner = inner
            self.zadd_calls = 0

        def __getattr__(self, name):
            return getattr(self._inner, name)

        async def zadd(self, *a, **k):
            self.zadd_calls += 1
            return await self._inner.zadd(*a, **k)

    counting = _Counting(real)
    monkeypatch.setattr(redis_client, "_redis", counting)
    monkeypatch.setattr(ws_manager, "PRESENCE_THROTTLE_SECONDS", 30)
    await redis_client.delete("ws:presence-throttle:7")
    try:
        for _ in range(100):
            await ws_manager.touch_presence("7")
        assert counting.zadd_calls <= 2  # เดิม: 100 ครั้ง
    finally:
        await redis_client.delete("ws:presence-throttle:7")
