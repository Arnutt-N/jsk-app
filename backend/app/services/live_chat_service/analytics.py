"""Chat analytics aggregation (dashboard and per-operator metrics)."""
import logging
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.chat_analytics import ChatAnalytics
from app.models.user import User

logger = logging.getLogger(__name__)


class AnalyticsMixin:
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
