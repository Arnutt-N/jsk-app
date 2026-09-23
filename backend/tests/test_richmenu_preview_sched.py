from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock
import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool

from app.api import deps as api_deps
from app.core.config import settings
from app.main import app
from app.models.rich_menu import RichMenu, RichMenuDisplayMode
from app.models.user import UserRole


def _fresh_engine():
    return create_async_engine(str(settings.DATABASE_URL), poolclass=NullPool)


@pytest_asyncio.fixture
async def menu_without_image():
    engine = _fresh_engine()
    Session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with Session() as s:
        row = RichMenu(
            name="pytest-preview",
            chat_bar_text="เมนู",
            config={"size": {"width": 2500, "height": 1686}, "areas": []},
        )
        s.add(row)
        await s.commit()
        menu_id = row.id
    yield menu_id
    async with Session() as s:
        row = await s.get(RichMenu, menu_id)
        if row:
            await s.delete(row)
            await s.commit()
    await engine.dispose()


@pytest.mark.asyncio
async def test_imageless_preview_ok(test_client, menu_without_image):
    async def _override():
        yield SimpleNamespace(id=1, role=UserRole.ADMIN, is_active=True)

    app.dependency_overrides[api_deps.get_current_user] = _override
    try:
        resp = test_client.get(f"/api/v1/admin/rich-menus/{menu_without_image}/preview")
        assert resp.status_code == 200
        assert resp.json()["placeholder"] is True
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_scheduler_isolates_failure(menu_without_image):
    from app.tasks import rich_menu_display_scheduler as sched

    engine = _fresh_engine()
    Session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with Session() as s:
        ok_menu = RichMenu(
            name="pytest-sched-ok",
            chat_bar_text="เมนู2",
            config={"size": {"width": 2500, "height": 1686}, "areas": []},
            line_rich_menu_id="richmenu-pytest-sched-ok-unique",
            display_mode=RichMenuDisplayMode.SCHEDULED.value,
            display_start_at=datetime.now(timezone.utc) - timedelta(minutes=5),
        )
        s.add(ok_menu)
        await s.commit()
        ok_id = ok_menu.id
    original = sched.RichMenuService.set_default_on_line
    sched.RichMenuService.set_default_on_line = AsyncMock(side_effect=RuntimeError("LINE down"))
    try:
        # one failure must not escape the tick — the next menu still gets processed
        async with Session() as s:
            await sched._activate_due(s, datetime.now(timezone.utc))
    finally:
        sched.RichMenuService.set_default_on_line = original
    async with Session() as s:
        row = await s.get(RichMenu, ok_id)
        if row:
            await s.delete(row)
            await s.commit()
    await engine.dispose()
