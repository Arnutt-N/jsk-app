"""Inbox message windows are index-driven DISTINCT ON (R3-M19)."""
import socket
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
from urllib.parse import urlsplit
from uuid import uuid4

import pytest
from sqlalchemy.dialects import postgresql
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool

from app.core.config import settings
from app.services.live_chat_service import live_chat_service


def _db_reachable() -> bool:
    u = urlsplit(str(settings.DATABASE_URL).replace("+asyncpg", ""))
    try:
        with socket.create_connection((u.hostname or "localhost", u.port or 5432), timeout=3):
            return True
    except OSError:
        return False


def _test_session():
    """Private NullPool engine — same foreign-loop rationale as T3 (see
    test_rich_menu_display_scheduler_db._test_session): seeding must not use
    the shared AsyncSessionLocal pool from this test's own loop."""
    engine = create_async_engine(str(settings.DATABASE_URL), poolclass=NullPool)
    return sessionmaker(engine, class_=AsyncSession, expire_on_commit=False), engine


@pytest.mark.asyncio
async def test_inbox_sql_uses_distinct_on_and_keeps_session_window():
    result = MagicMock()
    result.all.return_value = []
    db = AsyncMock()
    db.execute = AsyncMock(return_value=result)
    db.scalar = AsyncMock(return_value=0)

    out = await live_chat_service.get_conversations(None, db)

    assert out["conversations"] == []
    stmt = db.execute.call_args_list[0].args[0]
    sql = str(stmt.compile(dialect=postgresql.dialect()))
    assert sql.count("DISTINCT ON") == 2
    assert sql.count("row_number") == 1  # session window only


@pytest.mark.asyncio
@pytest.mark.skipif(not _db_reachable(), reason="PostgreSQL not reachable (CI runs this; local dev skips)")
async def test_inbox_equivalence_db(test_client):
    from datetime import datetime, timezone

    from sqlalchemy import delete

    from app.api import deps
    from app.main import app
    from app.models.message import Message, MessageDirection
    from app.models.user import User, UserRole
    from tests.identity_helpers import create_line_user

    nonce = uuid4().hex[:12]
    raw1, raw2 = f"UT9{nonce}A", f"UT9{nonce}B"
    staff_name = f"ut9staff{nonce}"
    t0 = datetime(2026, 1, 1, 0, 0, 0, tzinfo=timezone.utc)
    t1 = datetime(2026, 1, 1, 0, 0, 1, tzinfo=timezone.utc)
    t2 = datetime(2026, 1, 1, 0, 0, 2, tzinfo=timezone.utc)

    Session, engine = _test_session()
    user_ids: list[int] = []
    try:
        async with Session() as db:
            u1 = await create_line_user(db, raw1, display_name="UT9 One")
            u2 = await create_line_user(db, raw2, display_name="UT9 Two")
            staff = User(username=staff_name, display_name="UT9 Staff", role=UserRole.AGENT)
            db.add(staff)
            await db.flush()
            db.add_all([
                Message(user_id=u1.id, direction=MessageDirection.INCOMING,
                        message_type="text", content="u1-first", created_at=t0),
                Message(user_id=u1.id, direction=MessageDirection.OUTGOING,
                        message_type="text", content="u1-second", created_at=t1),
                Message(user_id=u1.id, direction=MessageDirection.INCOMING,
                        message_type="text", content="u1-third", created_at=t2),
                Message(user_id=u2.id, direction=MessageDirection.INCOMING,
                        message_type="text", content="u2-only", created_at=t0),
                Message(user_id=None, direction=MessageDirection.INCOMING,
                        message_type="text", content="ut9-orphan", created_at=t2),
                Message(user_id=staff.id, direction=MessageDirection.INCOMING,
                        message_type="text", content="ut9-staff-msg", created_at=t2),
            ])
            await db.commit()
            user_ids = [u1.id, u2.id, staff.id]

        async def _override_staff():
            return SimpleNamespace(id=staff.id, role=UserRole.AGENT)

        app.dependency_overrides[deps.get_current_staff] = _override_staff
        try:
            response = test_client.get("/api/v1/admin/live-chat/conversations")
        finally:
            app.dependency_overrides.clear()
        assert response.status_code == 200, response.text

        ours = {
            c["line_user_id"]: c
            for c in response.json()["conversations"]
            if (c["line_user_id"] or "").startswith("UT9" + nonce)
        }

        def _as_utc_ts(iso: str) -> float:
            # The API serializes UTC with a "Z" suffix; PG timestamptz
            # round-trips through the server timezone — compare instants.
            return datetime.fromisoformat(iso.replace("Z", "+00:00")).timestamp()

        assert set(ours) == {raw1, raw2}
        assert ours[raw1]["last_message"]["content"] == "u1-third"
        assert _as_utc_ts(ours[raw1]["last_user_activity_at"]) == t2.timestamp()
        assert ours[raw2]["last_message"]["content"] == "u2-only"
        assert _as_utc_ts(ours[raw2]["last_user_activity_at"]) == t0.timestamp()
        for row in ours.values():
            assert row["last_message"]["content"] not in ("ut9-orphan", "ut9-staff-msg")
    finally:
        async with Session() as db:
            if user_ids:
                await db.execute(delete(Message).where(Message.user_id.in_(user_ids)))
                await db.execute(
                    delete(Message).where(Message.content == "ut9-orphan")
                )
                await db.execute(delete(User).where(User.id.in_(user_ids)))
                await db.commit()
        await engine.dispose()
