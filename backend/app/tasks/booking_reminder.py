"""Background task: send advance reminders for upcoming appointments.

Mirrors ``broadcast_scheduler.py`` — an in-process asyncio loop started from the
app lifespan, so no external cron is needed.

**Single-delivery across workers.** Production runs more than one uvicorn worker
and each starts its own copy of this loop. ``claim_reminder`` takes a short-lived
lease with a conditional UPDATE (status, unsent, stale lease, future time) and
returns a token only to the winning worker. Status and time are rechecked after
the reload too, so a cancellation landing mid-flight is not mailed.

**Confirm only on a known outcome.** The lease is committed before the push. On
confirmed delivery, or an unknown provider outcome, ``finalize_reminder`` writes
``reminder_sent_at`` and clears the lease — both guarded by the token, so a
worker whose lease expired cannot confirm for its successor. On a definite
all-channel failure, ``clear_reminder_claim`` releases the lease for an
immediate retry. A crash between claim and finalize leaves the lease to expire
(TTL), trading a delayed retry against a duplicate to the public.

The config is re-read on every pass so an admin toggling reminders off, or
changing the lead time, takes effect without a restart.
"""
import asyncio
import logging
from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import AsyncSessionLocal
from app.models.booking import BookingStatus
from app.services.booking_notifications import (
    ReminderOutcome,
    send_booking_reminder_outcome,
)
from app.services.booking_service import (
    claim_reminder,
    clear_reminder_claim,
    finalize_reminder,
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
    config = await load_booking_config(db, fresh=True)
    if not config.enabled or not config.reminder_enabled:
        return
    if not config.email_enabled and not config.line_enabled:
        logger.debug("Booking reminder scheduler idle: no notification channel enabled")
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
            token = await claim_reminder(db, booking_id)
            if token is None:
                # Another worker got there first, or the booking was cancelled
                # or is no longer in the future. Nothing was changed, so end
                # the transaction with a commit rather than a rollback.
                await db.commit()
                continue

            # Commit the claim before sending — see the module docstring.
            await db.commit()

            # Re-read after the commit: this is the only way to hold live ORM
            # state that an earlier rollback in this loop cannot have expired.
            booking = await load_booking_for_reminder(db, booking_id)
            if booking is None:
                logger.warning("Booking %s vanished between claim and send", booking_id)
                await clear_reminder_claim(db, booking_id, token)
                await db.commit()
                continue

            # Recheck after the reload: a cancellation may have landed after
            # the claim's own guard ran. Release the lease so a valid booking
            # is not blocked until the TTL expires.
            appointment_at = datetime.combine(booking.booking_date, booking.booking_time)
            if booking.status != BookingStatus.CONFIRMED or appointment_at <= local_now():
                logger.info("Booking %s no longer due, dropping reminder claim", booking_id)
                await clear_reminder_claim(db, booking_id, token)
                await db.commit()
                continue

            outcome = await send_booking_reminder_outcome(db, booking, booking.user)
            if outcome in (ReminderOutcome.CONFIRMED, ReminderOutcome.UNKNOWN):
                # Confirmed delivery, or a provider error whose result is
                # genuinely unknown: keep the sent marker so a duplicate is
                # never sent to a member of the public.
                await finalize_reminder(db, booking_id, token)
            else:
                # Definite all-channel failure: release the lease so the next
                # scheduler pass can retry instead of losing the reminder.
                await clear_reminder_claim(db, booking_id, token)
            await db.commit()
        except Exception as e:
            logger.error("Booking reminder for %s failed: %s", booking_id, e)
            # Reset the shared session so a failure cannot leak an open
            # transaction or row locks into the next iteration. The lease is
            # intentionally left to expire on timeout/crash (see docstring).
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
