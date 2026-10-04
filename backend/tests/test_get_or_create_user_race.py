"""Create-race must not roll back the caller's transaction (R3-M5)."""
import socket
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, Mock, patch
from urllib.parse import urlsplit
from uuid import uuid4

import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool

from app.core.config import settings
from app.services.friend_service import friend_service


def _db_reachable() -> bool:
    u = urlsplit(str(settings.DATABASE_URL).replace("+asyncpg", ""))
    try:
        with socket.create_connection((u.hostname or "localhost", u.port or 5432), timeout=3):
            return True
    except OSError:
        return False


def _test_session():
    """Session on a private NullPool engine (mirrors
    test_rich_menu_display_scheduler_db._test_session): the app's shared
    AsyncSessionLocal pool holds connections created inside the
    session-scoped TestClient's ASGI portal loop; using it from this
    test's own pytest-asyncio loop binds a foreign loop's connection and
    corrupts the asyncpg protocol state. NullPool creates a fresh
    connection per checkout on the CURRENT loop and drops it on close."""
    engine = create_async_engine(str(settings.DATABASE_URL), poolclass=NullPool)
    return sessionmaker(engine, class_=AsyncSession, expire_on_commit=False), engine


def _db_with_nested(flush_effect=None):
    db = AsyncMock()
    db.add = MagicMock()  # real Session.add is sync (avoids un-awaited warnings)
    nested = AsyncMock()
    nested.__aenter__ = AsyncMock(return_value=None)
    nested.__aexit__ = AsyncMock(return_value=False)
    db.begin_nested = Mock(return_value=nested)
    if flush_effect is not None:
        db.flush = AsyncMock(side_effect=flush_effect)
    return db, nested


@pytest.mark.asyncio
async def test_race_re_resolves_without_full_rollback():
    db, nested = _db_with_nested()
    order: list[str] = []
    nested.__aenter__.side_effect = lambda *a, **k: order.append("enter")
    db.add.side_effect = lambda *a, **k: order.append("add")

    async def _flush(*a, **k):
        order.append("flush")
        raise IntegrityError("stmt", {}, Exception("dup"))

    db.flush = _flush
    winner = SimpleNamespace(id=9)
    profile = SimpleNamespace(display_name="N", picture_url=None)
    api = SimpleNamespace(get_profile=AsyncMock(return_value=profile))
    with patch("app.services.user_identity_service.resolve_by_line_id",
               new=AsyncMock(side_effect=[None, winner])), patch(
                   "app.services.user_identity_service.populate_surrogate"), patch(
                       "app.core.line_client.get_line_bot_api", return_value=api):
        assert await friend_service.get_or_create_user("U1", db) is winner
    db.begin_nested.assert_called_once()
    db.rollback.assert_not_awaited()
    db.commit.assert_not_awaited()
    # add-inside-savepoint ordering (G2 finding): with add-outside the
    # order would be ["add", "enter", "flush"] and the re-resolve would
    # re-emit the INSERT via autoflush.
    assert order == ["enter", "add", "flush"]


@pytest.mark.asyncio
async def test_non_race_integrity_error_reraises_original():
    """F6: re-resolve finds no winner -> original IntegrityError, not RuntimeError."""
    db, _nested = _db_with_nested()

    async def _flush(*a, **k):
        raise IntegrityError("stmt", {}, Exception("null-viol"))

    db.flush = _flush
    profile = SimpleNamespace(display_name="N", picture_url=None)
    api = SimpleNamespace(get_profile=AsyncMock(return_value=profile))
    with patch("app.services.user_identity_service.resolve_by_line_id",
               new=AsyncMock(return_value=None)), patch(
                   "app.services.user_identity_service.populate_surrogate"), patch(
                       "app.core.line_client.get_line_bot_api", return_value=api):
        with pytest.raises(IntegrityError):
            await friend_service.get_or_create_user("U1", db)


@pytest.mark.asyncio
async def test_happy_path_still_commits_and_refreshes():
    db, _nested = _db_with_nested()
    profile = SimpleNamespace(display_name="N", picture_url=None)
    api = SimpleNamespace(get_profile=AsyncMock(return_value=profile))
    with patch("app.services.user_identity_service.resolve_by_line_id",
               new=AsyncMock(return_value=None)), patch(
                   "app.services.user_identity_service.populate_surrogate"), patch(
                       "app.core.line_client.get_line_bot_api", return_value=api):
        user = await friend_service.get_or_create_user("U1", db)
    assert user.display_name == "N"
    db.commit.assert_awaited_once()
    db.refresh.assert_awaited_once()


@pytest.mark.asyncio
@pytest.mark.skipif(not _db_reachable(), reason="PostgreSQL not reachable (CI runs this; local dev skips)")
async def test_race_keeps_prior_pending_work_db():
    from sqlalchemy import delete

    from app.models.user import User
    from app.services import user_identity_service as ident
    from tests.identity_helpers import create_line_user

    Session, engine = _test_session()
    try:
        raw = f"UT3RACE{uuid4().hex[:12]}"
        async with Session() as seed_db:
            winner = await create_line_user(seed_db, raw, display_name="Winner")
            await seed_db.commit()
            winner_id = winner.id

        profile = SimpleNamespace(display_name="Racer", picture_url=None)
        api = SimpleNamespace(get_profile=AsyncMock(return_value=profile))
        real_resolve = ident.resolve_by_line_id
        calls = []

        async def _flaky_resolve(db, raw_id):
            calls.append(1)
            if len(calls) == 1:
                return None  # force the race path: miss, then flush conflicts
            return await real_resolve(db, raw_id)

        async with Session() as db:
            prior = User(display_name="prior-uncommitted")
            db.add(prior)
            with patch.object(ident, "resolve_by_line_id", new=_flaky_resolve), patch(
                "app.core.line_client.get_line_bot_api", return_value=api
            ):
                # commit=False: caller still owns the transaction.
                user = await friend_service.get_or_create_user(raw, db, commit=False)
            assert user.id == winner_id
            # prior in db (NOT db.new): the savepoint-entry flush moves
            # prior to persistent — `in db.new` is False in BOTH shapes
            # (G2 round-2 probe). `in db` discriminates: True=fixed,
            # False=old (rollback evicts).
            assert prior in db  # prior work NOT rolled back (the fix)
            await db.commit()  # session healthy: commit succeeds
            prior_id = prior.id
            assert prior_id is not None

        async with Session() as db:
            await db.execute(delete(User).where(User.id.in_([winner_id, prior_id])))
            await db.commit()
    finally:
        await engine.dispose()
