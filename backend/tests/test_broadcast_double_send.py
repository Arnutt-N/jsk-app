"""A3: two concurrent sends of one broadcast must deliver exactly once.

Context: send_broadcast used to check-then-set the status in Python (read
attribute, assign SENDING, commit), so two overlapping sends both passed the
check and both broadcast. The claim must be one atomic conditional UPDATE.

Each sender owns its session end-to-end (open, load, send, close) so a
rejected loser releases everything promptly; a start barrier guarantees both
senders loaded DRAFT before either sends, making the overlap deterministic.
"""
import asyncio
import uuid
from unittest.mock import AsyncMock

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool

from app.core.config import settings
from app.models.broadcast import BroadcastStatus, BroadcastType
from app.services.broadcast_service import BroadcastService


@pytest.mark.asyncio
async def test_concurrent_sends_deliver_exactly_once():
    # Own NullPool engine (same pattern as test_liff_attachments_resolve):
    # the shared AsyncSessionLocal pool hands out connections bound to other
    # tests' event loops (the session TestClient portal's, ...), and
    # pool_pre_ping on a cross-loop connection raises "attached to a
    # different loop" — a suite-order flake unrelated to the race itself.
    engine = create_async_engine(str(settings.DATABASE_URL), poolclass=NullPool)
    Session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    svc = BroadcastService()
    title = f"pytest-a3-race-{uuid.uuid4().hex[:8]}"

    async def slow_broadcast(*args, **kwargs):
        await asyncio.sleep(0.5)

    api = AsyncMock()
    api.broadcast.side_effect = slow_broadcast
    svc._api = api

    async with Session() as db:
        created = await svc.create_broadcast(
            db,
            title=title,
            message_type=BroadcastType.TEXT,
            content={"text": "race"},
            target_audience="all",
        )
        broadcast_id = created.id

    ready: list = []
    go = asyncio.Event()

    async def attempt(results, index):
        # Own session: a rejected loser closes (rolls back) immediately.
        async with Session() as db:
            bc = await svc.get_broadcast(db, broadcast_id)
            ready.append(index)
            if len(ready) == 2:
                go.set()
            else:
                await go.wait()
            try:
                out = await svc.send_broadcast(db, bc)
            except ValueError as exc:
                results[index] = ("rejected", str(exc))
            else:
                results[index] = ("sent", out.status)

    try:
        results: dict = {}
        try:
            await asyncio.wait_for(
                asyncio.gather(attempt(results, 0), attempt(results, 1)),
                timeout=60,
            )
        except asyncio.TimeoutError:
            pytest.fail("concurrent sends deadlocked instead of resolving")
        sent = [r for r in results.values() if r[0] == "sent"]
        rejected = [r for r in results.values() if r[0] == "rejected"]
        assert len(sent) == 1
        assert sent[0][1] == BroadcastStatus.COMPLETED
        assert len(rejected) == 1
        assert api.broadcast.await_count == 1
    finally:
        async with Session() as db:
            bc = await svc.get_broadcast(db, broadcast_id)
            if bc is not None:
                await db.delete(bc)
                await db.commit()
        await engine.dispose()
