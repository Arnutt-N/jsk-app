"""Follower report queries."""
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.friend_event import FriendEvent, FriendEventType
from app.models.user import User
from app.services.user_identity_service import user_identity_filter

from .helpers import bucket_expression, format_bucket


class FollowerReportMixin:

    async def get_follower_report(
        self, start: datetime, end: datetime, period: str, db: AsyncSession
    ) -> dict:
        total_followers = (await db.execute(
            select(func.count(User.id)).where(user_identity_filter(), User.friend_status == "ACTIVE")
        )).scalar() or 0

        base_filter = [FriendEvent.created_at >= start, FriendEvent.created_at < end]

        new_count = (await db.execute(
            select(func.count(FriendEvent.id)).where(
                FriendEvent.event_type == FriendEventType.FOLLOW.value, *base_filter,
            )
        )).scalar() or 0

        lost_count = (await db.execute(
            select(func.count(FriendEvent.id)).where(
                FriendEvent.event_type == FriendEventType.UNFOLLOW.value, *base_filter,
            )
        )).scalar() or 0

        refollow_count = (await db.execute(
            select(func.count(FriendEvent.id)).where(
                FriendEvent.event_type == FriendEventType.REFOLLOW.value, *base_filter,
            )
        )).scalar() or 0

        net = new_count + refollow_count - lost_count
        total_follows = new_count + refollow_count
        refollow_rate = (refollow_count / total_follows * 100) if total_follows else 0.0

        date_bucket = bucket_expression(FriendEvent.created_at, period)
        time_q = (
            select(
                date_bucket.label("period_start"),
                func.count(FriendEvent.id).filter(
                    FriendEvent.event_type.in_([FriendEventType.FOLLOW.value, FriendEventType.REFOLLOW.value])
                ).label("gained"),
                func.count(FriendEvent.id).filter(
                    FriendEvent.event_type == FriendEventType.UNFOLLOW.value
                ).label("lost"),
            )
            .where(*base_filter)
            .group_by(date_bucket).order_by(date_bucket)
        )
        rows = (await db.execute(time_q)).all()
        over_time = [
            {"period": format_bucket(period_start, period), "gained": g, "lost": l}
            for period_start, g, l in rows
        ]

        return {
            "total_followers": total_followers,
            "new_this_period": new_count,
            "lost_this_period": lost_count,
            "refollow_this_period": refollow_count,
            "net_growth": net,
            "refollow_rate": round(refollow_rate, 1),
            "over_time": over_time,
        }
