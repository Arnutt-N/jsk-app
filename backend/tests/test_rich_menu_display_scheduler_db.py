"""Real-PostgreSQL integration test for the rich-menu display scheduler.

The unit tests in test_rich_menu_display_schedule.py use _SeqDB, which pops
preset results and never runs the SQL — inverting `display_start_at <= now` or
dropping the display_mode filter would keep them green (review finding H6).
This module exercises the ACTUAL WHERE clauses against PostgreSQL.

CI runs with PostgreSQL/Redis, so this executes there; locally (services down)
it SKIPS cleanly instead of erroring.
"""
import asyncio
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool

from app.core.config import settings
from app.models.rich_menu import RichMenu, RichMenuDisplayMode, RichMenuStatus, RichMenuSyncStatus
from app.services.rich_menu_service import RichMenuService
from app.tasks.rich_menu_display_scheduler import _activate_due, _expire_due

NOW = datetime.now(timezone.utc)


def _db_reachable() -> bool:
    """Cheap TCP probe of the configured PostgreSQL host (sync — safe at
    collection time; asyncpg's first connect can exceed 3s cold on Windows,
    which is why the previous async probe flapped to 'unreachable')."""
    import socket
    from urllib.parse import urlsplit

    u = urlsplit(str(settings.DATABASE_URL).replace("+asyncpg", ""))
    host = u.hostname or "localhost"
    port = u.port or 5432
    try:
        with socket.create_connection((host, port), timeout=3):
            return True
    except OSError:
        return False


_DB_UP = _db_reachable()
pytestmark = pytest.mark.skipif(
    not _DB_UP,
    reason="PostgreSQL not reachable (CI runs this; local dev skips)",
)


# pytest-asyncio gives each test its own event loop. Each test now uses a
# private NullPool engine (see _test_session), so there is no shared pool to
# go stale across loops — the app engine's pool is no longer touched here.
# (Historically an autouse dispose of the shared engine lived here; removed
# because disposing app state from inside tests caused cross-test surprises
# and is unnecessary with NullPool sessions.)


@pytest.fixture(autouse=True, scope="module")
def _silence_background_scheduler():
    """The session-scoped TestClient boots the app lifespan, which starts the
    real 60s display-scheduler loop on its own event loop against the SAME
    database. If a tick lands inside one of these tests' patch windows it
    calls the same set_default_on_line/cancel mocks (extra awaits → flaky
    assert_awaited_once) — observed once locally. The loop resolves
    _process_due_rich_menus from module globals on every tick, so patching it
    here turns the already-running background loop into a no-op for the rest
    of the pytest session. These tests drive _activate_due/_expire_due
    directly and never call _process_due_rich_menus themselves."""
    with patch(
        "app.tasks.rich_menu_display_scheduler._process_due_rich_menus",
        new=AsyncMock(return_value=None),
    ):
        yield


def _menu(**overrides):
    from types import SimpleNamespace  # noqa: F401 — rows are real ORM objects

    fields = dict(
        name="sched-itest",
        chat_bar_text="menu",
        line_rich_menu_id="rm-itest-1",
        config={"size": {"width": 2500, "height": 843},
                "selected": False, "name": "sched-itest",
                "chatBarText": "menu", "areas": []},
        status=RichMenuStatus.DRAFT.value,
        sync_status=RichMenuSyncStatus.SYNCED.value,
        display_mode=RichMenuDisplayMode.SCHEDULED.value,
        display_start_at=NOW - timedelta(hours=1),
        display_end_at=NOW + timedelta(hours=1),
    )
    fields.update(overrides)
    return RichMenu(**fields)


async def _create_rows(db, *menus):
    for m in menus:
        db.add(m)
    await db.commit()
    for m in menus:
        await db.refresh(m)
    return menus


def _test_session():
    """Session on a private NullPool engine, mirroring the idiom in
    test_liff_token.py. The app's shared AsyncSessionLocal pool holds
    connections created inside the session-scoped TestClient's ASGI portal
    loop; when that lifespan is alive (any earlier test requested test_client),
    using it from this module's own pytest-asyncio loop binds a foreign loop's
    connection to these tests — failing inside db.commit() and leaving
    overlapped I/O that hangs TestClient teardown on Windows (proactor
    loop.close never drains). NullPool creates a fresh connection per checkout
    on the CURRENT loop and drops it on close."""
    engine = create_async_engine(str(settings.DATABASE_URL), poolclass=NullPool)
    return sessionmaker(engine, class_=AsyncSession, expire_on_commit=False), engine


@pytest.mark.asyncio
async def test_activate_due_selects_only_truly_due_rows():
    """The SQL WHERE is the thing under test: mode + start<=now + not-yet-published
    + has a line id. Inverting any of these must fail this test."""
    Session, engine = _test_session()
    try:
        due = _menu(line_rich_menu_id="rm-due")
        not_due = _menu(line_rich_menu_id="rm-future",
                        display_start_at=NOW + timedelta(days=1))
        already_published = _menu(line_rich_menu_id="rm-live",
                                  status=RichMenuStatus.PUBLISHED.value)
        async with Session() as db:
            due, not_due, already_published = await _create_rows(
                db, due, not_due, already_published
            )
            try:
                with patch.object(RichMenuService, "set_default_on_line",
                                  new=AsyncMock()) as set_default, \
                     patch("app.tasks.rich_menu_display_scheduler.create_audit_log",
                           new=AsyncMock()):
                    activated = await _activate_due(db, NOW)

                activated_ids = {m.id for m in activated}
                assert due.id in activated_ids
                assert not_due.id not in activated_ids
                assert already_published.id not in activated_ids
                set_default.assert_awaited_once_with(db, "rm-due")
                await db.refresh(due)
                assert due.status == RichMenuStatus.PUBLISHED.value
                await db.refresh(not_due)
                assert not_due.status == RichMenuStatus.DRAFT.value
            finally:
                for m in (due, not_due, already_published):
                    await db.delete(m)
                await db.commit()
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_expire_due_cancels_only_when_still_default():
    """Expiry flips INACTIVE; the LINE default is cancelled ONLY when this menu
    still owns it (AC4 — never un-publish someone else's default)."""
    Session, engine = _test_session()
    try:
        mine = _menu(line_rich_menu_id="rm-expiring",
                     status=RichMenuStatus.PUBLISHED.value,
                     display_end_at=NOW - timedelta(minutes=5))
        async with Session() as db:
            mine = await _create_rows(db, mine)
            mine = mine[0]
            try:
                with patch.object(RichMenuService, "get_default_on_line",
                                  new=AsyncMock(return_value={"richMenuId": "rm-expiring"})), \
                     patch.object(RichMenuService, "cancel_default_on_line",
                                  new=AsyncMock()) as cancel, \
                     patch("app.tasks.rich_menu_display_scheduler.create_audit_log",
                           new=AsyncMock()) as audit:
                    expired = await _expire_due(db, NOW)

                assert mine.id in {m.id for m in expired}
                cancel.assert_awaited_once()
                assert audit.await_args.kwargs["details"]["cancelled_default"] is True
                await db.refresh(mine)
                assert mine.status == RichMenuStatus.INACTIVE.value
            finally:
                await db.delete(mine)
                await db.commit()
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_expire_due_skips_period_still_open():
    Session, engine = _test_session()
    try:
        open_menu = _menu(line_rich_menu_id="rm-open",
                          status=RichMenuStatus.PUBLISHED.value,
                          display_end_at=NOW + timedelta(days=1))
        async with Session() as db:
            open_menu = (await _create_rows(db, open_menu))[0]
            try:
                with patch.object(RichMenuService, "get_default_on_line",
                                  new=AsyncMock(return_value={"richMenuId": "rm-open"})), \
                     patch.object(RichMenuService, "cancel_default_on_line",
                                  new=AsyncMock()) as cancel:
                    expired = await _expire_due(db, NOW)

                assert expired == []
                cancel.assert_not_awaited()
                await db.refresh(open_menu)
                assert open_menu.status == RichMenuStatus.PUBLISHED.value
            finally:
                await db.delete(open_menu)
                await db.commit()
    finally:
        await engine.dispose()
