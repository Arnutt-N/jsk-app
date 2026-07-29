"""Overview report queries."""
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.chat_session import ChatSession, SessionStatus
from app.models.friend_event import FriendEvent, FriendEventType
from app.models.message import Message, MessageDirection
from app.models.service_request import ServiceRequest
from app.models.user import User
from app.services.user_identity_service import user_identity_filter


class OverviewMixin:

    async def get_overview(self, db: AsyncSession) -> dict:
        now = datetime.now(timezone.utc)
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        tomorrow_start = today_start + timedelta(days=1)
        yesterday_start = today_start - timedelta(days=1)
        week_ago = today_start - timedelta(days=7)
        two_weeks_ago = today_start - timedelta(days=14)
        activity_start = today_start - timedelta(days=6)

        status_q = select(
            ServiceRequest.status, func.count(ServiceRequest.id)
        ).group_by(ServiceRequest.status)
        status_rows = (await db.execute(status_q)).all()
        by_status: dict[str, int] = {}
        total_requests = 0
        for s, c in status_rows:
            key = s.value if s else "PENDING"
            by_status[key] = c
            total_requests += c

        cur_req = (await db.execute(
            select(func.count(ServiceRequest.id)).where(ServiceRequest.created_at >= week_ago)
        )).scalar() or 0
        prev_req = (await db.execute(
            select(func.count(ServiceRequest.id)).where(
                ServiceRequest.created_at >= two_weeks_ago,
                ServiceRequest.created_at < week_ago,
            )
        )).scalar() or 0

        msg_today_q = select(
            func.count(Message.id),
            func.count(Message.id).filter(Message.direction == MessageDirection.INCOMING),
            func.count(Message.id).filter(Message.direction == MessageDirection.OUTGOING),
        ).where(Message.created_at >= today_start, Message.created_at < tomorrow_start)
        msg_row = (await db.execute(msg_today_q)).one()
        total_msg_today, inc_today, out_today = msg_row

        msg_yesterday = (await db.execute(
            select(func.count(Message.id)).where(
                Message.created_at >= yesterday_start, Message.created_at < today_start,
            )
        )).scalar() or 0

        total_followers = (await db.execute(
            select(func.count(User.id)).where(user_identity_filter(), User.friend_status == "ACTIVE")
        )).scalar() or 0

        new_followers_week = (await db.execute(
            select(func.count(FriendEvent.id)).where(
                FriendEvent.event_type == FriendEventType.FOLLOW.value,
                FriendEvent.created_at >= week_ago,
            )
        )).scalar() or 0
        new_followers_prev = (await db.execute(
            select(func.count(FriendEvent.id)).where(
                FriendEvent.event_type == FriendEventType.FOLLOW.value,
                FriendEvent.created_at >= two_weeks_ago,
                FriendEvent.created_at < week_ago,
            )
        )).scalar() or 0

        active_sessions = (await db.execute(
            select(func.count(ChatSession.id)).where(ChatSession.status == SessionStatus.ACTIVE.value)
        )).scalar() or 0
        active_sessions_yesterday = (await db.execute(
            select(func.count(ChatSession.id)).where(
                ChatSession.status == SessionStatus.ACTIVE.value,
                ChatSession.started_at >= yesterday_start,
                ChatSession.started_at < today_start,
            )
        )).scalar() or 0

        request_day_bucket = func.date_trunc("day", ServiceRequest.created_at)
        daily_rows = (await db.execute(
            select(request_day_bucket.label("day"), func.count(ServiceRequest.id).label("requests"))
            .where(ServiceRequest.created_at >= activity_start)
            .group_by(request_day_bucket).order_by(request_day_bucket)
        )).all()

        message_day_bucket = func.date_trunc("day", Message.created_at)
        msg_daily_rows = (await db.execute(
            select(message_day_bucket.label("day"), func.count(Message.id).label("messages"))
            .where(Message.created_at >= activity_start)
            .group_by(message_day_bucket).order_by(message_day_bucket)
        )).all()

        request_by_day = {
            row.day.astimezone(timezone.utc).date().isoformat(): int(row.requests)
            for row in daily_rows if row.day
        }
        msg_by_day = {
            row.day.astimezone(timezone.utc).date().isoformat(): int(row.messages)
            for row in msg_daily_rows if row.day
        }
        daily_activity = []
        current_day = activity_start.date()
        while current_day <= today_start.date():
            key = current_day.isoformat()
            daily_activity.append({"day": key, "requests": request_by_day.get(key, 0), "messages": msg_by_day.get(key, 0)})
            current_day += timedelta(days=1)

        def _trend(cur: int, prev: int) -> dict:
            pct = ((cur - prev) / prev * 100) if prev else (100.0 if cur else 0.0)
            return {"current": cur, "previous": prev, "change_percent": round(pct, 1)}

        return {
            "total_requests": total_requests,
            "requests_by_status": by_status,
            "total_messages_today": total_msg_today,
            "messages_incoming_today": inc_today,
            "messages_outgoing_today": out_today,
            "total_followers": total_followers,
            "active_sessions": active_sessions,
            "requests_trend": _trend(cur_req, prev_req),
            "messages_trend": _trend(total_msg_today, msg_yesterday),
            "followers_trend": _trend(new_followers_week, new_followers_prev),
            "sessions_trend": _trend(active_sessions, active_sessions_yesterday),
            "daily_activity": daily_activity,
        }
