"""Background task: activate/expire SCHEDULED rich menus at their display
period boundaries (PRD 2026-09-02-rich-menu-display-schedule).

Mirrors ``broadcast_scheduler.py``: an in-process asyncio loop started from the
app lifespan (single long-running uvicorn process, no external cron).

Activation (start time reached): set the menu as LINE's default → status
PUBLISHED. Expiry (end time reached): the default is cancelled ONLY if this
menu is still the one LINE reports as default — another menu published in the
meantime must not be silently un-published (AC4) — and status becomes INACTIVE.

Both write system audit logs (admin_id=None). A per-menu failure is logged and
retried on the next tick: activation is guarded by status != PUBLISHED, and
expiry keeps the row PUBLISHED until the cancel actually succeeded, so ticks
are idempotent.
"""
import asyncio
import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import create_audit_log
from app.db.session import AsyncSessionLocal
from app.models.rich_menu import RichMenu, RichMenuDisplayMode, RichMenuStatus
from app.services.rich_menu_service import RichMenuService

logger = logging.getLogger(__name__)

# Menu display has no delivery tolerance (unlike broadcasts' ±1 minute), so a
# relaxed poll is fine while still activating within ~a minute of the start.
SCHEDULER_INTERVAL_SECONDS = 60


async def _activate_due(db: AsyncSession, now) -> list[RichMenu]:
    """Publish SCHEDULED menus whose display period has started.

    Requires a line_rich_menu_id (synced): an unsynced menu has nothing to set
    as default yet — it will activate on a later tick once synced.
    """
    result = await db.execute(
        select(RichMenu).where(
            RichMenu.display_mode == RichMenuDisplayMode.SCHEDULED.value,
            RichMenu.status != RichMenuStatus.PUBLISHED.value,
            RichMenu.line_rich_menu_id.isnot(None),
            RichMenu.display_start_at.isnot(None),
            RichMenu.display_start_at <= now,
        )
    )
    due = result.scalars().all()
    for menu in due:
        await RichMenuService.set_default_on_line(db, menu.line_rich_menu_id)
        menu.status = RichMenuStatus.PUBLISHED.value
        await create_audit_log(
            db=db,
            admin_id=None,  # system action
            action="rich_menu_auto_publish",
            resource_type="rich_menu",
            resource_id=str(menu.id),
            details={"line_rich_menu_id": menu.line_rich_menu_id},
        )
        await db.commit()
    return due


async def _expire_due(db: AsyncSession, now) -> list[RichMenu]:
    """End SCHEDULED menus whose display period is over.

    LINE's reported default decides whether to cancel: only the menu that still
    owns the default gets cancelled (AC4); the status flips to INACTIVE either
    way so the row stops being picked up.
    """
    result = await db.execute(
        select(RichMenu).where(
            RichMenu.display_mode == RichMenuDisplayMode.SCHEDULED.value,
            RichMenu.status == RichMenuStatus.PUBLISHED.value,
            RichMenu.display_end_at.isnot(None),
            RichMenu.display_end_at <= now,
        )
    )
    due = result.scalars().all()
    for menu in due:
        still_default = False
        current = await RichMenuService.get_default_on_line(db)
        if current and current.get("richMenuId") == menu.line_rich_menu_id:
            still_default = True
            await RichMenuService.cancel_default_on_line(db)
        menu.status = RichMenuStatus.INACTIVE.value
        await create_audit_log(
            db=db,
            admin_id=None,  # system action
            action="rich_menu_auto_unpublish",
            resource_type="rich_menu",
            resource_id=str(menu.id),
            details={
                "cancelled_default": still_default,
                "line_rich_menu_id": menu.line_rich_menu_id,
            },
        )
        await db.commit()
    return due


async def _process_due_rich_menus(db: AsyncSession) -> None:
    from datetime import datetime, timezone

    now = datetime.now(timezone.utc)
    activated = await _activate_due(db, now)
    if activated:
        logger.info("Display scheduler activated %d scheduled rich menu(s)", len(activated))
    expired = await _expire_due(db, now)
    if expired:
        logger.info("Display scheduler expired %d scheduled rich menu(s)", len(expired))


async def run_rich_menu_display_scheduler():
    """Periodically activate/expire SCHEDULED rich menus."""
    logger.info("Rich menu display scheduler task started")
    while True:
        try:
            async with AsyncSessionLocal() as db:
                await _process_due_rich_menus(db)
        except Exception as e:
            logger.error("Rich menu display scheduler error: %s", e)
        await asyncio.sleep(SCHEDULER_INTERVAL_SECONDS)


_scheduler_task: "asyncio.Task | None" = None


async def start_rich_menu_display_scheduler():
    """Start the display scheduler background task."""
    global _scheduler_task
    _scheduler_task = asyncio.create_task(run_rich_menu_display_scheduler())
    logger.info("Rich menu display scheduler background task started")


async def stop_rich_menu_display_scheduler():
    """Cancel and await the display scheduler background task."""
    global _scheduler_task
    if _scheduler_task and not _scheduler_task.done():
        _scheduler_task.cancel()
        try:
            await _scheduler_task
        except asyncio.CancelledError:
            pass
        logger.info("Rich menu display scheduler background task stopped")
    _scheduler_task = None
