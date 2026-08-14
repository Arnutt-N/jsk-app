"""Background task: send advance reminders for upcoming appointments.

Mirrors ``broadcast_scheduler.py`` — an in-process asyncio loop started from the
app lifespan, so no external cron is needed.

**Exactly-once across workers.** Production runs more than one uvicorn worker and
each starts its own copy of this loop, so "have I already sent this?" cannot be
decided by reading a row and then acting on it. The guarantee comes from
``claim_reminder``: a conditional ``UPDATE ... WHERE reminder_sent_at IS NULL``
that reports how many rows it changed. Only the worker that changes the row
sends anything.

**At-most-once, deliberately.** The claim is committed *before* the push goes
out. If LINE then fails, that reminder is lost and logged at ERROR rather than
retried. The alternative — send first, mark afterwards — turns a mid-flight
crash into a duplicate message to a member of the public, which cannot be taken
back. A missed reminder is recoverable by staff; a duplicate is not.

The config is re-read on every pass so an admin toggling reminders off, or
changing the lead time, takes effect without a restart.
"""
import asyncio
import logging

from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import AsyncSessionLocal
from app.services.booking_notifications import send_booking_reminder
from app.services.booking_service import (
    claim_reminder,
    get_due_reminders,
    load_booking_for_reminder,
    local_now,
    reminder_window,
)
from app.services.booking_settings import load_booking_config

logger = logging.getLogger(__name__)

# Polling interval. Reminder lead times are configured in hours or days, so
# minute-level granularity is far finer than the feature needs.
REMINDER_INTERVAL_SECONDS = 60


async def run_booking_reminders():
    """Periodically send reminders for appointments entering the lead window."""
    logger.info("Booking reminder scheduler task started")
    while True:
        try:
            async with AsyncSessionLocal() as db:
                await _process_due_reminders(db)
        except Exception as e:
            logger.error(f"Booking reminder scheduler error: {e}")
        await asyncio.sleep(REMINDER_INTERVAL_SECONDS)


async def _process_due_reminders(db: AsyncSession):
    """Claim and send every reminder that is currently due."""
    config = await load_booking_config(db)
    if not config.enabled or not config.reminder_enabled:
        return

    window_start, window_end = reminder_window(config, local_now())
    due = await get_due_reminders(db, window_start=window_start, window_end=window_end)
    if not due:
        return

    logger.info("Booking reminder scheduler found %s due booking(s)", len(due))

    # Snapshot the ids as plain ints before doing any work. `Session.rollback()`
    # expires every instance in the session — it does that even under
    # `expire_on_commit=False`, which only governs commit — so holding ORM
    # objects across iterations would mean the first lost claim silently turned
    # every later `booking.id` into a lazy refresh, which raises MissingGreenlet
    # under async SQLAlchemy and would abandon the rest of the batch.
    booking_ids = [booking.id for booking in due]

    for booking_id in booking_ids:
        try:
            if not await claim_reminder(db, booking_id):
                # Another worker got there first. Nothing was changed, so end
                # the transaction with a commit rather than a rollback.
                await db.commit()
                continue

            # Commit the claim before sending — see the module docstring.
            await db.commit()

            # Re-read after the commit: the row is ours now, and this is the
            # only way to hold live ORM state that an earlier rollback in this
            # loop cannot have expired.
            booking = await load_booking_for_reminder(db, booking_id)
            if booking is None:
                logger.warning("Booking %s vanished between claim and send", booking_id)
                continue

            await send_booking_reminder(db, booking, booking.user)
        except Exception as e:
            logger.error("Booking reminder for %s failed: %s", booking_id, e)
            # Reset the shared session so a failure cannot leak an open
            # transaction or row locks into the next iteration.
            await db.rollback()


_scheduler_task: "asyncio.Task | None" = None


async def start_booking_reminder_scheduler():
    """Start the booking reminder background task."""
    global _scheduler_task
    _scheduler_task = asyncio.create_task(run_booking_reminders())
    logger.info("Booking reminder background task started")


async def stop_booking_reminder_scheduler():
    """Cancel and await the booking reminder background task."""
    global _scheduler_task
    if _scheduler_task and not _scheduler_task.done():
        _scheduler_task.cancel()
        try:
            await _scheduler_task
        except asyncio.CancelledError:
            pass
        logger.info("Booking reminder background task stopped")
    _scheduler_task = None
