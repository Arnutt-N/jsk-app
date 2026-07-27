"""Background task to cleanup inactive and abandoned chat sessions."""
import asyncio
import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import create_audit_log
from app.core.websocket_manager import ws_manager
from app.db.session import AsyncSessionLocal
from app.models.chat_session import ChatSession, SessionStatus
from app.models.user import ChatMode, User
from app.services.line_service import line_service
from app.services.analytics_service import analytics_service
from app.services.user_identity_service import resolve_by_line_id
from linebot.v3.messaging import TextMessage

logger = logging.getLogger(__name__)

# Configuration
INACTIVE_TIMEOUT_MINUTES = 30
WAITING_ABANDONMENT_MINUTES = 10
CLEANUP_INTERVAL_SECONDS = 300


async def cleanup_inactive_sessions():
    """Periodically close inactive active sessions and abandoned waiting sessions."""
    logger.info("Session cleanup task started")
    while True:
        try:
            async with AsyncSessionLocal() as db:
                await _process_inactive_sessions(db)
        except Exception as e:
            logger.error(f"Session cleanup error: {e}")
        await asyncio.sleep(CLEANUP_INTERVAL_SECONDS)


async def _process_inactive_sessions(db: AsyncSession):
    """Process both active inactivity timeout and waiting abandonment timeout."""
    now = datetime.now(timezone.utc)
    active_threshold = now - timedelta(minutes=INACTIVE_TIMEOUT_MINUTES)
    waiting_threshold = now - timedelta(minutes=WAITING_ABANDONMENT_MINUTES)

    inactive_result = await db.execute(
        select(ChatSession).where(
            ChatSession.status == SessionStatus.ACTIVE,
            ChatSession.last_activity_at < active_threshold,
        )
    )
    inactive_sessions = inactive_result.scalars().all()

    abandoned_result = await db.execute(
        select(ChatSession).where(
            ChatSession.status == SessionStatus.WAITING,
            ChatSession.claimed_at.is_(None),
            ChatSession.started_at < waiting_threshold,
        )
    )
    abandoned_sessions = abandoned_result.scalars().all()

    if not inactive_sessions and not abandoned_sessions:
        return

    logger.info(
        "Cleanup found inactive=%s abandoned_waiting=%s",
        len(inactive_sessions),
        len(abandoned_sessions),
    )

    for session in inactive_sessions:
        await _close_inactive_session(session, db)

    for session in abandoned_sessions:
        await _mark_abandoned_waiting_session(session, db)

    await db.commit()
    await analytics_service.emit_live_kpis_update(db)


async def _close_inactive_session(session: ChatSession, db: AsyncSession):
    """Close one active session due to inactivity timeout."""
    session.status = SessionStatus.CLOSED
    session.closed_at = datetime.now(timezone.utc)
    session.closed_by = "SYSTEM"

    user = await resolve_by_line_id(db, session.line_user_id)
    if user:
        await db.execute(
            update(User)
            .where(User.id == user.id)
            .values(chat_mode=ChatMode.BOT)
        )

    await create_audit_log(
        db=db,
        admin_id=None,
        action="auto_close_session",
        resource_type="chat_session",
        resource_id=str(session.id),
        details={
            "reason": "inactivity",
            "threshold_minutes": INACTIVE_TIMEOUT_MINUTES,
            "last_activity": session.last_activity_at.isoformat() if session.last_activity_at else None,
        },
    )

    try:
        await line_service.push_messages(
            session.line_user_id,
            [TextMessage(text="Chat session ended due to inactivity. Please message again to reopen.")],
        )
    except Exception as e:
        logger.error(f"Failed to notify inactive close user {session.line_user_id}: {e}")

    try:
        await ws_manager.broadcast_to_all(
            {
                "type": "session_closed",
                "payload": {
                    "line_user_id": session.line_user_id,
                    "closed_by": "SYSTEM",
                    "reason": "inactivity",
                },
            }
        )
    except Exception as e:
        logger.error(f"Failed to broadcast inactivity close: {e}")


async def _mark_abandoned_waiting_session(session: ChatSession, db: AsyncSession):
    """Close one waiting session as abandoned after timeout."""
    session.status = SessionStatus.CLOSED
    session.closed_at = datetime.now(timezone.utc)
    session.closed_by = "SYSTEM_TIMEOUT"

    user = await resolve_by_line_id(db, session.line_user_id)
    if user:
        await db.execute(
            update(User)
            .where(User.id == user.id)
            .values(chat_mode=ChatMode.BOT)
        )

    await create_audit_log(
        db=db,
        admin_id=None,
        action="abandon_waiting_session",
        resource_type="chat_session",
        resource_id=str(session.id),
        details={
            "reason": "waiting_timeout",
            "threshold_minutes": WAITING_ABANDONMENT_MINUTES,
            "started_at": session.started_at.isoformat() if session.started_at else None,
        },
    )

    try:
        await line_service.push_messages(
            session.line_user_id,
            [TextMessage(text="No operator was available in time. Please send a new message to rejoin queue.")],
        )
    except Exception as e:
        logger.error(f"Failed to notify abandoned waiting user {session.line_user_id}: {e}")

    try:
        await ws_manager.broadcast_to_all(
            {
                "type": "session_closed",
                "payload": {
                    "line_user_id": session.line_user_id,
                    "closed_by": "SYSTEM_TIMEOUT",
                    "reason": "waiting_timeout",
                },
            }
        )
    except Exception as e:
        logger.error(f"Failed to broadcast waiting timeout close: {e}")


_cleanup_task: asyncio.Task = None


async def start_cleanup_task():
    """Start cleanup background task."""
    global _cleanup_task
    _cleanup_task = asyncio.create_task(cleanup_inactive_sessions())
    logger.info("Session cleanup background task started")


async def stop_cleanup_task():
    """Cancel and await cleanup background task."""
    global _cleanup_task
    if _cleanup_task and not _cleanup_task.done():
        _cleanup_task.cancel()
        try:
            await _cleanup_task
        except asyncio.CancelledError:
            pass
        logger.info("Session cleanup background task stopped")
    _cleanup_task = None

