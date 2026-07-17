"""Human handoff initiation and queue-position helpers."""
import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.chat_session import ChatSession, SessionStatus
from app.models.user import ChatMode, User
from app.services.business_hours_service import business_hours_service
from app.services.line_service import line_service
from app.services.telegram_service import telegram_service

logger = logging.getLogger(__name__)


class HandoffMixin:
    async def _add_open_session(self, user: User, db: AsyncSession) -> tuple[ChatSession, bool]:
        """Insert a new WAITING session under a SAVEPOINT.

        The partial unique index uq_chat_sessions_open_per_user rejects a second
        open session per user. Losing that race must not poison the caller's
        transaction (the webhook flow still holds the flushed-but-uncommitted
        INCOMING message), so the insert runs in a nested transaction: on
        IntegrityError only the savepoint rolls back and the concurrent winner's
        session is fetched and reused. Returns (session, created).
        """
        session = ChatSession(
            line_user_id=user.line_user_id,
            status=SessionStatus.WAITING,
            started_at=datetime.now(timezone.utc),
            last_activity_at=datetime.now(timezone.utc),
        )
        try:
            async with db.begin_nested():
                db.add(session)
                await db.flush()
        except IntegrityError:
            existing = await self.get_active_session(user.line_user_id, db)
            if existing is None:
                raise
            logger.info(
                f"Concurrent handoff race for {user.line_user_id}: reusing open session {existing.id}"
            )
            return existing, False
        return session, True

    async def initiate_handoff(
        self,
        user: User,
        reply_token: str,
        db: AsyncSession,
        background_tasks=None, # Kept for compatibility but unused
        commit: bool = True,
    ):
        """
        Initiate human handoff for a user.

        Checks business hours first. If after hours, sends after-hours message
        and creates an offline ticket for follow-up.
        """
        existing_session = await self.get_active_session(user.line_user_id, db)
        if existing_session:
            user.chat_mode = ChatMode.HUMAN
            if commit:
                await db.commit()
            else:
                await db.flush()
            return existing_session

        # 1. Check business hours
        if not await business_hours_service.is_within_business_hours(db):
            next_open = await business_hours_service.get_next_open_time(db)

            after_hours_msg = (
                f"ขออภัยค่ะ/ครับ ขณะนี้อยู่นอกเวลาทำการ\n"
                f"เวลาทำการ: จันทร์-ศุกร์ 08:00-17:00 น.\n"
                f"{next_open}\n\n"
                f"กรุณาฝากข้อความไว้ เจ้าหน้าที่จะติดต่อกลับในวันถัดไปค่ะ/ครับ"
            )

            await line_service.reply_text(reply_token, after_hours_msg)

            # Create offline session (still in WAITING but user notified it's after hours)
            # This allows the user to leave a message that will be handled next business day
            session, created = await self._add_open_session(user, db)
            # chat_mode is set after the savepoint: a savepoint rollback would
            # discard a chat_mode change flushed inside it
            user.chat_mode = ChatMode.HUMAN
            if commit:
                await db.commit()
            else:
                await db.flush()

            if created:
                logger.info(f"After-hours handoff for user {user.line_user_id}, next open: {next_open}")
            return session

        # 2. Create chat session (savepoint-guarded against the open-session race)
        session, created = await self._add_open_session(user, db)

        # 3. Update user mode — after the savepoint so a rollback there cannot
        #    discard a flushed chat_mode change
        user.chat_mode = ChatMode.HUMAN

        if not created:
            # A concurrent handoff won the race and already sent its own
            # greeting and notifications — just adopt its session.
            if commit:
                await db.commit()
            else:
                await db.flush()
            return session

        # 4. Send auto-greeting with queue position
        greeting = "เจ้าหน้าที่จะติดต่อกลับในไม่ช้า กรุณารอสักครู่"
        await line_service.reply_text(reply_token, greeting)

        # 5. Send queue position info
        queue_info = await self.get_queue_position(user.line_user_id, db)
        if queue_info["position"] > 0:
            await self._send_queue_flex_message(user.line_user_id, queue_info)

        # 6. Telegram notification
        recent_msgs = await self.get_recent_messages(user.line_user_id, 3, db)
        admin_url = f"{settings.ADMIN_URL}/admin/live-chat?user={user.line_user_id}"

        # Send directly (async)
        await telegram_service.send_handoff_notification(
            user.display_name or "Unknown",
            user.picture_url,
            recent_msgs,
            admin_url,
            db
        )

        if commit:
            await db.commit()
        else:
            await db.flush()
        return session

    async def _send_queue_flex_message(self, line_user_id: str, queue_info: dict):
        """Send queue position as a Flex Message"""
        from linebot.v3.messaging import FlexMessage

        flex_content = {
            "type": "bubble",
            "body": {
                "type": "box",
                "layout": "vertical",
                "contents": [
                    {
                        "type": "text",
                        "text": "🕐 กำลังรอเจ้าหน้าที่",
                        "weight": "bold",
                        "size": "lg",
                        "color": "#1DB446"
                    },
                    {
                        "type": "separator",
                        "margin": "md"
                    },
                    {
                        "type": "box",
                        "layout": "horizontal",
                        "margin": "md",
                        "contents": [
                            {"type": "text", "text": "ตำแหน่งคิว:", "color": "#555555", "flex": 1},
                            {"type": "text", "text": f"{queue_info['position']}/{queue_info['total_waiting']}", "weight": "bold", "flex": 1, "align": "end"}
                        ]
                    },
                    {
                        "type": "box",
                        "layout": "horizontal",
                        "margin": "sm",
                        "contents": [
                            {"type": "text", "text": "เวลารอโดยประมาณ:", "color": "#555555", "flex": 2},
                            {"type": "text", "text": f"~{queue_info['estimated_wait_minutes']} นาที", "weight": "bold", "flex": 1, "align": "end"}
                        ]
                    }
                ]
            }
        }

        flex_message = FlexMessage(
            alt_text=f"ตำแหน่งคิว: {queue_info['position']}/{queue_info['total_waiting']}",
            contents=flex_content
        )

        await line_service.push_messages(line_user_id, [flex_message])

    async def get_queue_position(self, line_user_id: str, db: AsyncSession) -> dict:
        """
        Get user's position in WAITING queue with estimated wait time.

        Args:
            line_user_id: User's LINE ID
            db: Database session

        Returns:
            Dict with position, total_waiting, and estimated_wait_minutes
        """
        # Get all waiting sessions ordered by creation time (FIFO)
        stmt = select(ChatSession).where(
            ChatSession.status == SessionStatus.WAITING
        ).order_by(ChatSession.started_at)

        result = await db.execute(stmt)
        waiting_sessions = result.scalars().all()

        # Find user's position
        position = next(
            (i + 1 for i, s in enumerate(waiting_sessions) if s.line_user_id == line_user_id),
            0
        )

        # Calculate average wait time from recent sessions
        avg_wait = await self._calculate_avg_wait_time(db)
        estimated_wait = position * avg_wait if position > 0 else 0

        return {
            "position": position,
            "total_waiting": len(waiting_sessions),
            "estimated_wait_seconds": estimated_wait,
            "estimated_wait_minutes": round(estimated_wait / 60, 1)
        }

    async def _calculate_avg_wait_time(self, db: AsyncSession, hours: int = 24) -> float:
        """
        Calculate average wait time from sessions claimed in last N hours.

        Args:
            db: Database session
            hours: Lookback period in hours

        Returns:
            Average wait time in seconds (default 120s if no data)
        """
        from sqlalchemy import func

        stmt = select(
            func.avg(
                func.extract('epoch', ChatSession.claimed_at - ChatSession.started_at)
            )
        ).where(
            ChatSession.claimed_at.isnot(None),
            ChatSession.claimed_at > datetime.now(timezone.utc) - timedelta(hours=hours)
        )

        result = await db.execute(stmt)
        avg_seconds = result.scalar()

        # Default 2 minutes if no data
        return avg_seconds if avg_seconds else 120
