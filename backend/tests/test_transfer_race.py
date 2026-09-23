import asyncio
import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool

from app.core.config import settings
from app.models.chat_session import ChatSession, SessionStatus
from app.models.user import User, UserRole
from app.services.friend_service import friend_service
from app.services.live_chat_service import live_chat_service, TRANSFER_ERR_CONFLICT


def _fresh_engine():
    return create_async_engine(str(settings.DATABASE_URL), poolclass=NullPool)


@pytest_asyncio.fixture
async def seeded():
    engine = _fresh_engine()
    Session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    line_id = "Utransferace00000000000001"
    async with Session() as db:
        op_a = User(username="t-race-a", role=UserRole.AGENT, is_active=True)
        op_b = User(username="t-race-b", role=UserRole.AGENT, is_active=True)
        db.add_all([op_a, op_b])
        await db.flush()
        citizen = await friend_service.get_or_create_user(line_id, db, commit=False)
        sess = ChatSession(
            user_id=citizen.id,
            status=SessionStatus.ACTIVE.value,
            operator_id=op_a.id,
        )
        db.add(sess)
        await db.commit()
        ids = {"a": op_a.id, "b": op_b.id, "citizen": citizen.id, "session": sess.id, "line": line_id}
    yield Session, ids
    async with Session() as db:
        for row in [
            await db.get(ChatSession, ids["session"]),
            await db.get(User, ids["citizen"]),
            await db.get(User, ids["a"]),
            await db.get(User, ids["b"]),
        ]:
            if row:
                await db.delete(row)
        await db.commit()
    await engine.dispose()


@pytest.mark.asyncio
async def test_concurrent_transfer_single_winner(seeded):
    Session, ids = seeded

    async def attempt():
        async with Session() as db:
            return await live_chat_service.transfer_session(
                line_user_id=ids["line"],
                from_operator_id=ids["a"],
                to_operator_id=ids["b"],
                reason="ฝากดูต่อ",
                db=db,
            )

    results = await asyncio.gather(attempt(), attempt(), return_exceptions=True)
    ok = [r for r in results if not isinstance(r, Exception)]
    conflicts = [r for r in results if isinstance(r, ValueError) and str(r) == TRANSFER_ERR_CONFLICT]
    assert len(ok) == 1
    assert len(conflicts) == 1
    async with Session() as db:
        row = await db.get(ChatSession, ids["session"])
        assert row.operator_id == ids["b"]
        assert row.transfer_count == 1
