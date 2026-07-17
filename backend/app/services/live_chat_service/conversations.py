"""Conversation listing, history, and message search."""
import logging
from typing import Any, Optional

from sqlalchemy import and_, desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.models.chat_session import ChatSession, SessionStatus
from app.models.message import Message
from app.models.tag import Tag, UserTag
from app.models.user import ChatMode, User

logger = logging.getLogger(__name__)


class ConversationsMixin:
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
