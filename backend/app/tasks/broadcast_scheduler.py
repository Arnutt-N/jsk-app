"""Background task: send scheduled broadcasts once their time has come.

Mirrors ``session_cleanup.py``: an in-process asyncio loop started from the app
lifespan. The backend runs as a single long-running uvicorn process, so no
external cron is needed.

Double-send is prevented by the ``SCHEDULED -> SENDING`` status transition inside
``send_broadcast`` (a row already SENDING/COMPLETED is rejected) — this is the
real guarantee and holds even across processes. ``get_due_scheduled`` adds
``SELECT ... FOR UPDATE SKIP LOCKED`` so that, within a poll, rows are claimed
without contention; note the lock is released when ``send_broadcast`` commits the
SENDING state, so under a hypothetical multi-worker deployment a second worker
simply no-ops on the status guard rather than relying on the lock alone.
"""
import asyncio
import logging

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import create_audit_log
from app.db.session import AsyncSessionLocal
from app.services.broadcast_service import BroadcastClaimConflict, broadcast_service

logger = logging.getLogger(__name__)

# How often to poll for due broadcasts. 30s << the ±1 minute delivery tolerance.
SCHEDULER_INTERVAL_SECONDS = 30


async def run_scheduled_broadcasts():
    """Periodically send broadcasts whose scheduled_at has passed."""
    logger.info("Broadcast scheduler task started")
    while True:
        try:
            async with AsyncSessionLocal() as db:
                await _process_due_broadcasts(db)
        except Exception as e:
            logger.error(f"Broadcast scheduler error: {e}")
        await asyncio.sleep(SCHEDULER_INTERVAL_SECONDS)


async def _process_due_broadcasts(db: AsyncSession):
    """Send all broadcasts that are due, logging a system audit entry per send."""
    due = await broadcast_service.get_due_scheduled(db)
    if not due:
        return

    logger.info("Scheduler found %s due broadcast(s)", len(due))

    # Snapshot plain IDs before any per-item rollback. Session.rollback()
    # expires ORM objects even with expire_on_commit=False, so later
    # `broadcast.id` reads would trigger an async lazy load (MissingGreenlet)
    # and abandon the rest of the batch.
    broadcast_ids = [broadcast.id for broadcast in due]

    for broadcast_id in broadcast_ids:
        try:
            # Reload inside the guarded operation so this iteration owns live
            # ORM state regardless of an earlier rollback.
            broadcast = await broadcast_service.get_broadcast(db, broadcast_id)
            if broadcast is None:
                continue
            result = await broadcast_service.send_broadcast(db, broadcast)
            if result is None:
                result = broadcast
            await create_audit_log(
                db=db,
                admin_id=None,  # None = system action
                action="auto_send_broadcast",
                resource_type="broadcast",
                resource_id=str(broadcast_id),
                details={
                    "status": result.status.value,
                    "success_count": result.success_count,
                    "failure_count": result.failure_count,
                },
            )
            await db.commit()
        except BroadcastClaimConflict:
            # Another worker owns the send; no changes to roll back.
            await db.commit()
        except Exception as e:
            logger.error("Auto-send broadcast %s failed: %s", broadcast_id, e)
            await db.rollback()


_scheduler_task: "asyncio.Task | None" = None


async def start_broadcast_scheduler():
    """Start the broadcast scheduler background task."""
    global _scheduler_task
    _scheduler_task = asyncio.create_task(run_scheduled_broadcasts())
    logger.info("Broadcast scheduler background task started")


async def stop_broadcast_scheduler():
    """Cancel and await the broadcast scheduler background task."""
    global _scheduler_task
    if _scheduler_task and not _scheduler_task.done():
        _scheduler_task.cancel()
        try:
            await _scheduler_task
        except asyncio.CancelledError:
            pass
        logger.info("Broadcast scheduler background task stopped")
    _scheduler_task = None
