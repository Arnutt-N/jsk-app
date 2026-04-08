import logging
from datetime import datetime, timedelta, timezone
from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import DateTime, String, and_, column, desc, func, select, update, values
from sqlalchemy.orm import aliased
from app.models.user import User, ChatMode, UserRole
from app.models.chat_session import ChatSession, SessionStatus, ClosedBy
from app.models.message import Message, MessageDirection
from app.models.tag import Tag, UserTag
from app.models.chat_analytics import ChatAnalytics
from app.services.line_service import line_service
from app.services.telegram_service import telegram_service
from app.services.sla_service import sla_service
from app.services.business_hours_service import business_hours_service
from app.core.config import settings
from app.core.audit import audit_action
from app.core.redis_client import redis_client
from app.core.websocket_manager import ConnectionManager
from typing import List, Optional, Any, Union
from linebot.v3.messaging import TextMessage

logger = logging.getLogger(__name__)

class LiveChatService:
    async def get_unread_count(self, line_user_id: str, admin_id: Union[int, str], db: AsyncSession) -> int:
        """Compute unread incoming messages for one admin and conversation."""
        admin_id_str = str(admin_id)
        raw_read = await redis_client.get(
            ConnectionManager.build_read_key(admin_id_str, line_user_id)
        )
        read_at = None
        if raw_read:
            try:
                read_at = datetime.fromisoformat(raw_read)
            except ValueError:
                read_at = None

        unread_stmt = select(func.count(Message.id)).where(
            Message.line_user_id == line_user_id,
            Message.direction == MessageDirection.INCOMING,
        )
        if read_at:
            unread_stmt = unread_stmt.where(Message.created_at > read_at)
        return (await db.scalar(unread_stmt)) or 0

    async def get_unread_counts(
        self,
        line_user_ids: list[str],
        admin_id: Union[int, str],
        db: AsyncSession,
    ) -> dict[str, int]:
        """Compute unread incoming messages for multiple conversations in batches."""
        unique_line_user_ids = [line_user_id for line_user_id in dict.fromkeys(line_user_ids) if line_user_id]
        if not unique_line_user_ids:
            return {}

        admin_id_str = str(admin_id)
        read_keys = [
            ConnectionManager.build_read_key(admin_id_str, line_user_id)
            for line_user_id in unique_line_user_ids
        ]
        raw_markers = await redis_client.mget(read_keys)

        counts = {line_user_id: 0 for line_user_id in unique_line_user_ids}
        ids_without_markers: list[str] = []
        ids_with_markers: list[tuple[str, datetime]] = []

        for line_user_id, raw_marker in zip(unique_line_user_ids, raw_markers):
            if not raw_marker:
                ids_without_markers.append(line_user_id)
                continue

            try:
                ids_with_markers.append((line_user_id, datetime.fromisoformat(raw_marker)))
            except ValueError:
                ids_without_markers.append(line_user_id)

        if ids_without_markers:
            result = await db.execute(
                select(
                    Message.line_user_id,
                    func.count(Message.id).label("unread_count"),
                )
                .where(
                    Message.line_user_id.in_(ids_without_markers),
                    Message.direction == MessageDirection.INCOMING,
                )
                .group_by(Message.line_user_id)
            )
            for line_user_id, unread_count in result.all():
                counts[line_user_id] = int(unread_count)

        if ids_with_markers:
            marker_values = (
                values(
                    column("line_user_id", String()),
                    column("read_at", DateTime(timezone=True)),
                    name="read_markers",
                )
                .data(ids_with_markers)
                .alias("read_markers")
            )
            result = await db.execute(
                select(
                    Message.line_user_id,
                    func.count(Message.id).label("unread_count"),
                )
                .select_from(Message)
                .join(
                    marker_values,
                    Message.line_user_id == marker_values.c.line_user_id,
                )
                .where(
                    Message.direction == MessageDirection.INCOMING,
                    Message.created_at > marker_values.c.read_at,
                )
                .group_by(Message.line_user_id)
            )
            for line_user_id, unread_count in result.all():
                counts[line_user_id] = int(unread_count)

        return counts

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
            session = ChatSession(
                line_user_id=user.line_user_id,
                status=SessionStatus.WAITING,
                started_at=datetime.now(timezone.utc),
                last_activity_at=datetime.now(timezone.utc)
            )
            db.add(session)
            user.chat_mode = ChatMode.HUMAN
            if commit:
                await db.commit()
            else:
                await db.flush()
            
            logger.info(f"After-hours handoff for user {user.line_user_id}, next open: {next_open}")
            return session
        
        # 2. Update user mode
        user.chat_mode = ChatMode.HUMAN

        # 3. Create chat session
        session = ChatSession(
            line_user_id=user.line_user_id,
            status=SessionStatus.WAITING,
            started_at=datetime.now(timezone.utc),
            last_activity_at=datetime.now(timezone.utc)
        )
        db.add(session)
        await db.flush()  # Flush to get session ID

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

    @audit_action("claim_session", "chat_session")
    async def claim_session(
        self,
        line_user_id: str,
        operator_id: int,
        db: AsyncSession
    ):
        """Operator claims a chat session"""
        session = await self.get_active_session(line_user_id, db)
        if not session:
            return None
        if session.status != SessionStatus.WAITING:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Session already claimed by another operator",
            )

        now = datetime.now(timezone.utc)
        result = await db.execute(
            update(ChatSession)
            .where(
                ChatSession.id == session.id,
                ChatSession.status == SessionStatus.WAITING,
            )
            .values(
                status=SessionStatus.ACTIVE,
                operator_id=operator_id,
                claimed_at=now,
                last_activity_at=now,
            )
        )
        if result.rowcount != 1:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Session already claimed by another operator",
            )

        refreshed = await db.get(ChatSession, session.id)
        await sla_service.check_queue_wait_on_claim(refreshed, db)
        return refreshed

    @audit_action("close_session", "chat_session")
    async def close_session(
        self,
        line_user_id: str,
        closed_by: ClosedBy,
        db: AsyncSession,
        operator_id: Optional[int] = None,
    ):
        """Close a chat session and return to bot mode"""
        session = await self.get_active_session(line_user_id, db)
        if not session or session.status != SessionStatus.ACTIVE:
            return None

        if operator_id is not None and session.operator_id != operator_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only the claiming operator can close this session",
            )

        session.status = SessionStatus.CLOSED
        session.closed_at = datetime.now(timezone.utc)
        session.closed_by = closed_by

        # Return user to bot mode
        result = await db.execute(select(User).where(User.line_user_id == line_user_id))
        user = result.scalar_one_or_none()
        if user:
            user.chat_mode = ChatMode.BOT

        await sla_service.check_resolution_on_close(session, db)

        # Send CSAT survey after closing (non-blocking)
        if session:
            try:
                from app.services.csat_service import csat_service
                await csat_service.send_survey(line_user_id, session.id)
            except Exception as e:
                logger.error(f"Failed to send CSAT survey: {e}")

        return session

    async def _require_active_session_owner(
        self,
        line_user_id: str,
        operator_id: int,
        db: AsyncSession,
    ) -> ChatSession:
        """Load an active session and ensure the operator owns it."""
        session = await self.get_active_session(line_user_id, db)
        if not session or session.status != SessionStatus.ACTIVE:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Active session not found",
            )
        if session.operator_id != operator_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only the claiming operator can respond to this session",
            )
        return session

    @audit_action("transfer_session", "chat_session")
    async def transfer_session(
        self,
        line_user_id: str,
        from_operator_id: int,
        to_operator_id: int,
        reason: Optional[str],
        db: AsyncSession
    ):
        """Transfer session to another operator."""
        session = await self.get_active_session(line_user_id, db)
        if not session or session.status != SessionStatus.ACTIVE:
            raise ValueError("No active session found")

        if session.operator_id != from_operator_id:
            raise ValueError("Only the current operator can transfer the session")

        if from_operator_id == to_operator_id:
            raise ValueError("Cannot transfer to yourself")

        # Verify target operator exists and has appropriate role
        to_operator = await db.get(User, to_operator_id)
        if not to_operator or to_operator.role not in [UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.AGENT]:
            raise ValueError("Invalid target operator")

        session.operator_id = to_operator_id
        session.transfer_count = (session.transfer_count or 0) + 1
        session.transfer_reason = reason
        session.last_activity_at = datetime.now(timezone.utc)

        logger.info(f"Session {session.id} transferred from operator {from_operator_id} to {to_operator_id}")
        return session

    async def get_recent_messages(
        self,
        line_user_id: str,
        limit: int,
        db: AsyncSession
    ):
        """Get recent messages for a user"""
        result = await db.execute(
            select(Message)
            .where(Message.line_user_id == line_user_id)
            .order_by(desc(Message.created_at))
            .limit(limit)
        )
        return list(reversed(result.scalars().all()))

    async def get_messages_paginated(
        self,
        line_user_id: str,
        db: AsyncSession,
        before_id: Optional[int] = None,
        limit: int = 50,
    ) -> dict:
        """Load messages in reverse cursor order and return oldest->newest."""
        safe_limit = max(1, min(limit, 100))
        query = select(Message).where(Message.line_user_id == line_user_id)
        if before_id is not None:
            query = query.where(Message.id < before_id)
        query = query.order_by(desc(Message.id)).limit(safe_limit + 1)
        result = await db.execute(query)
        rows = result.scalars().all()
        has_more = len(rows) > safe_limit
        page_rows = rows[:safe_limit]
        return {
            "messages": list(reversed(page_rows)),
            "has_more": has_more,
        }

    async def get_active_session(self, line_user_id: str, db: AsyncSession, lock: bool = False):
        """Get active session for user"""
        stmt = (
            select(ChatSession)
            .where(ChatSession.line_user_id == line_user_id)
            .where(ChatSession.status.in_([SessionStatus.WAITING, SessionStatus.ACTIVE]))
            .order_by(desc(ChatSession.started_at))
            .limit(1)
        )
        if lock:
            stmt = stmt.with_for_update()
            
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

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

    async def get_conversations(
        self,
        status: Optional[str],
        db: AsyncSession,
        admin_id: Optional[int] = None,
        include_archived: bool = False,
    ):
        """Get all conversations for inbox with optimized queries (No N+1)"""
        # 1. Latest session per user subquery
        session_status_filter = ChatSession.status.in_([
            SessionStatus.WAITING, SessionStatus.ACTIVE,
        ])
        session_base = select(
            ChatSession,
            func.row_number()
            .over(
                partition_by=ChatSession.line_user_id,
                order_by=desc(ChatSession.started_at),
            )
            .label("rn"),
        ).where(session_status_filter)

        if not include_archived:
            session_base = session_base.where(
                (ChatSession.is_archived == False) | (ChatSession.is_archived.is_(None))
            )

        latest_session_subquery = session_base.subquery()
        latest_session = aliased(ChatSession, latest_session_subquery)

        # 2. Latest message per user subquery
        latest_message_subquery = (
            select(
                Message,
                func.row_number()
                .over(
                    partition_by=Message.line_user_id,
                    order_by=desc(Message.created_at),
                )
                .label("rn"),
            )
            .subquery()
        )
        latest_message = aliased(Message, latest_message_subquery)

        # 3. Main query joining User, Session, and Message
        query = (
            select(User, latest_session, latest_message)
            .outerjoin(
                latest_session,
                and_(
                    User.line_user_id == latest_session.line_user_id,
                    latest_session_subquery.c.rn == 1,
                ),
            )
            .outerjoin(
                latest_message,
                and_(
                    User.line_user_id == latest_message.line_user_id,
                    latest_message_subquery.c.rn == 1,
                ),
            )
            .where(User.line_user_id.is_not(None))
        )

        if status == "WAITING":
            query = query.where(latest_session.status == SessionStatus.WAITING)
        elif status == "ACTIVE":
            query = query.where(latest_session.status == SessionStatus.ACTIVE)
        elif status == "BOT":
            query = query.where(User.chat_mode == ChatMode.BOT)

        query = query.order_by(desc(User.last_message_at))
        
        result = await db.execute(query)
        rows = result.all()
        
        # 4. Batch fetch tags
        user_ids = [user.id for user, _session, _last_msg in rows if user and user.id]
        tag_map: dict[int, list[dict[str, Any]]] = {}
        if user_ids:
            tag_rows = (
                await db.execute(
                    select(UserTag.user_id, Tag.id, Tag.name, Tag.color)
                    .join(Tag, Tag.id == UserTag.tag_id)
                    .where(UserTag.user_id.in_(user_ids))
                    .order_by(Tag.name.asc())
                )
            ).all()
            for user_id, tag_id, tag_name, tag_color in tag_rows:
                tag_map.setdefault(user_id, []).append(
                    {"id": tag_id, "name": tag_name, "color": tag_color}
                )

        unread_counts: dict[str, int] = {}
        if admin_id:
            unread_counts = await self.get_unread_counts(
                [user.line_user_id for user, _session, _last_msg in rows if user.line_user_id],
                admin_id=str(admin_id),
                db=db,
            )

        # 5. Conversations list construction
        conversations = []
        for user, session, last_msg in rows:
            unread_count = unread_counts.get(user.line_user_id, 0) if user.line_user_id else 0

            conversations.append({
                "line_user_id": user.line_user_id,
                "display_name": user.display_name,
                "picture_url": user.picture_url,
                "friend_status": user.friend_status or "ACTIVE",
                "chat_mode": user.chat_mode or "BOT",
                "session": session,
                "last_message": {
                    "content": last_msg.content,
                    "created_at": last_msg.created_at
                } if last_msg else None,
                "unread_count": unread_count,
                "tags": tag_map.get(user.id, []),
            })

        waiting_count = await db.scalar(select(func.count(ChatSession.id)).where(ChatSession.status == SessionStatus.WAITING))
        active_count = await db.scalar(select(func.count(ChatSession.id)).where(ChatSession.status == SessionStatus.ACTIVE))

        return {
            "conversations": conversations,
            "total": len(conversations),
            "waiting_count": waiting_count or 0,
            "active_count": active_count or 0
        }

    async def search_messages(
        self,
        query: str,
        db: AsyncSession,
        line_user_id: Optional[str] = None,
        limit: int = 20,
    ) -> list[dict]:
        """Search message text across conversations or within one conversation."""
        q = query.strip()
        if not q:
            return []

        safe_limit = max(1, min(limit, 100))
        stmt = (
            select(Message, User.display_name)
            .join(User, User.line_user_id == Message.line_user_id, isouter=True)
            .where(
                Message.content.is_not(None),
                Message.content.ilike(f"%{q}%"),
            )
        )
        if line_user_id:
            stmt = stmt.where(Message.line_user_id == line_user_id)
        stmt = stmt.order_by(desc(Message.created_at)).limit(safe_limit)

        rows = (await db.execute(stmt)).all()
        return [
            {
                "id": message.id,
                "line_user_id": message.line_user_id,
                "display_name": display_name,
                "content": message.content,
                "direction": message.direction.value if hasattr(message.direction, "value") else message.direction,
                "sender_role": message.sender_role.value if hasattr(message.sender_role, "value") else message.sender_role,
                "created_at": message.created_at.isoformat() if message.created_at else None,
            }
            for message, display_name in rows
        ]

    async def get_conversation_detail(self, line_user_id: str, db: AsyncSession):
        """Get full chat history with a user"""
        result = await db.execute(select(User).where(User.line_user_id == line_user_id))
        user = result.scalar_one_or_none()
        if not user:
            return None

        user_tags = (
            await db.execute(
                select(Tag.id, Tag.name, Tag.color)
                .join(UserTag, UserTag.tag_id == Tag.id)
                .where(UserTag.user_id == user.id)
                .order_by(Tag.name.asc())
            )
        ).all()
            
        session = await self.get_active_session(line_user_id, db)
        messages = await self.get_recent_messages(line_user_id, 50, db)
        
        return {
            "line_user_id": user.line_user_id,
            "display_name": user.display_name,
            "picture_url": user.picture_url,
            "friend_status": user.friend_status or "ACTIVE",
            "chat_mode": user.chat_mode or "BOT",
            "session": session,
            "messages": messages,
            "unread_count": 0,
            "tags": [{"id": tag_id, "name": name, "color": color} for tag_id, name, color in user_tags],
        }

    @audit_action("send_message", "message")
    async def send_message(self, line_user_id: str, text: str, operator_id: int, db: AsyncSession):
        """Send message from operator to user via LINE"""
        from linebot.v3.messaging import TextMessage

        session = await self._require_active_session_owner(line_user_id, operator_id, db)

        # Get operator name
        operator_result = await db.execute(select(User).where(User.id == operator_id))
        operator = operator_result.scalar_one_or_none()
        operator_name = operator.display_name if operator else "Admin"

        await line_service.push_messages(line_user_id, [TextMessage(text=text)])

        await line_service.save_message(
            db=db,
            line_user_id=line_user_id,
            direction=MessageDirection.OUTGOING,
            message_type="text",
            content=text,
            sender_role="ADMIN",
            operator_name=operator_name
        )

        session.message_count += 1
        session.last_activity_at = datetime.now(timezone.utc)
        if not session.first_response_at:
            session.first_response_at = datetime.now(timezone.utc)
            await sla_service.check_frt_on_first_response(session, db)

        return {"success": True}

    @audit_action("send_media", "message")
    async def send_media_message(
        self,
        line_user_id: str,
        operator_id: int,
        file_bytes: bytes,
        file_name: str,
        content_type: Optional[str],
        db: AsyncSession,
    ):
        """Send media from operator to user, persist file, and store outgoing message."""
        if not file_bytes:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Uploaded file is empty",
            )

        media_type = "image" if (content_type or "").startswith("image/") else "file"

        session = await self._require_active_session_owner(line_user_id, operator_id, db)

        operator_result = await db.execute(select(User).where(User.id == operator_id))
        operator = operator_result.scalar_one_or_none()
        operator_name = operator.display_name if operator else "Admin"

        media = await line_service.persist_operator_upload(
            data=file_bytes,
            media_type=media_type,
            file_name=file_name,
            content_type=content_type,
        )

        media_url = media.get("url")
        if not media_url:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to persist media",
            )

        if media_type == "image":
            if not str(media_url).startswith("http"):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="SERVER_BASE_URL must be configured for image sending",
                )
            await line_service.push_image_message(
                line_user_id=line_user_id,
                image_url=media_url,
                preview_url=media.get("preview_url") or media_url,
            )
            content = "[Image]"
        else:
            text = f"Attachment: {file_name}\n{media_url}"
            await line_service.push_messages(line_user_id, [TextMessage(text=text[:5000])])
            content = file_name or "[File]"

        payload = {
            "url": media_url,
            "preview_url": media.get("preview_url"),
            "file_name": media.get("file_name") or file_name,
            "content_type": media.get("content_type"),
            "size": media.get("size"),
        }
        saved_message = await line_service.save_message(
            db=db,
            line_user_id=line_user_id,
            direction=MessageDirection.OUTGOING,
            message_type=media_type,
            content=content,
            payload=payload,
            sender_role="ADMIN",
            operator_name=operator_name,
        )

        session.message_count += 1
        session.last_activity_at = datetime.now(timezone.utc)
        if not session.first_response_at:
            session.first_response_at = datetime.now(timezone.utc)
            await sla_service.check_frt_on_first_response(session, db)
        await db.commit()

        return {
            "success": True,
            "message": {
                "id": saved_message.id,
                "line_user_id": saved_message.line_user_id,
                "direction": saved_message.direction.value if hasattr(saved_message.direction, "value") else saved_message.direction,
                "content": saved_message.content,
                "message_type": saved_message.message_type,
                "payload": saved_message.payload,
                "sender_role": saved_message.sender_role.value if hasattr(saved_message.sender_role, "value") else saved_message.sender_role,
                "operator_name": saved_message.operator_name,
                "created_at": saved_message.created_at.isoformat() if saved_message.created_at else None,
            },
        }

    async def set_chat_mode(self, line_user_id: str, mode: ChatMode, db: AsyncSession):
        """Toggle chat mode"""
        result = await db.execute(select(User).where(User.line_user_id == line_user_id))
        user = result.scalar_one_or_none()
        if user:
            user.chat_mode = mode
            await db.commit()
            return True
        return False

    async def get_analytics(
        self,
        from_date: Optional[str],
        to_date: Optional[str],
        operator_id: Optional[int],
        db: AsyncSession
    ):
        """Get chat analytics dashboard data"""
        query = select(ChatAnalytics)
        
        if from_date:
            query = query.where(ChatAnalytics.date >= from_date)
        if to_date:
            query = query.where(ChatAnalytics.date <= to_date)
        if operator_id:
            query = query.where(ChatAnalytics.operator_id == operator_id)
            
        result = await db.execute(query.order_by(ChatAnalytics.date))
        rows = result.scalars().all()
        
        # Aggregate totals
        total_sessions = sum(r.total_sessions or 0 for r in rows)
        total_messages = sum(r.total_messages_sent or 0 for r in rows)
        
        # Calculate averages weighted by sessions? Or just simple average of averages?
        # Simple average for now
        avg_response = 0
        avg_resolution = 0
        if rows:
            valid_response_times = [r.avg_response_time_seconds for r in rows if r.avg_response_time_seconds]
            valid_resolution_times = [r.avg_resolution_time_seconds for r in rows if r.avg_resolution_time_seconds]
            
            if valid_response_times:
                avg_response = sum(valid_response_times) / len(valid_response_times)
            if valid_resolution_times:
                avg_resolution = sum(valid_resolution_times) / len(valid_resolution_times)
                
        return {
            "summary": {
                "total_sessions": total_sessions,
                "total_messages": total_messages,
                "avg_response_time": round(avg_response, 1),
                "avg_resolution_time": round(avg_resolution, 1)
            },
            "daily_stats": rows
        }

    async def get_operator_analytics(
        self,
        from_date: Optional[str],
        to_date: Optional[str],
        db: AsyncSession
    ):
        """Get per-operator performance metrics"""
        # Join with User to get names
        query = (
            select(
                ChatAnalytics.operator_id,
                User.display_name,
                func.sum(ChatAnalytics.total_sessions).label("total_sessions"),
                func.avg(ChatAnalytics.avg_response_time_seconds).label("avg_response"),
                func.avg(ChatAnalytics.avg_resolution_time_seconds).label("avg_resolution")
            )
            .join(User, ChatAnalytics.operator_id == User.id)
            .group_by(ChatAnalytics.operator_id, User.display_name)
        )

        if from_date:
            query = query.where(ChatAnalytics.date >= from_date)
        if to_date:
            query = query.where(ChatAnalytics.date <= to_date)
            
        result = await db.execute(query)
        rows = result.all()
        
        stats = []
        for r in rows:
            stats.append({
                "operator_id": r.operator_id,
                "operator_name": r.display_name,
                "total_sessions": r.total_sessions,
                "avg_response_time": round(r.avg_response, 1) if r.avg_response else 0,
                "avg_resolution_time": round(r.avg_resolution, 1) if r.avg_resolution else 0
            })
            
        return stats

live_chat_service = LiveChatService()
