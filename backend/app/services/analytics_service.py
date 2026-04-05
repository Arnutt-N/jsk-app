"""Analytics service for calculating KPIs and metrics."""
import logging
from datetime import datetime, timedelta, timezone
from sqlalchemy import and_, exists, func, literal_column, select
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional

from app.models.chat_session import ChatSession, SessionStatus
from app.models.csat_response import CsatResponse
from app.models.user import User, ChatMode
from app.models.message import Message, MessageDirection
from app.core.redis_client import redis_client
from app.core.config import settings
from app.db.session import AsyncSessionLocal

logger = logging.getLogger(__name__)

class AnalyticsService:
    """Service for calculating live chat analytics and KPIs."""

    async def get_live_kpis(self, db: AsyncSession) -> dict:
        """
        Get real-time KPIs for the dashboard.
        
        Returns:
            Dict with waiting, active, FRT, resolution time, CSAT, FCR
        """
        # Waiting/Active counts
        waiting = await db.scalar(
            select(func.count()).where(ChatSession.status == SessionStatus.WAITING)
        )
        active = await db.scalar(
            select(func.count()).where(ChatSession.status == SessionStatus.ACTIVE)
        )

        # Average First Response Time (last hour)
        hour_ago = datetime.now(timezone.utc) - timedelta(hours=1)
        avg_frt_result = await db.execute(
            select(
                func.avg(
                    func.extract('epoch', ChatSession.first_response_at - ChatSession.claimed_at)
                )
            ).where(
                ChatSession.first_response_at.isnot(None),
                ChatSession.claimed_at > hour_ago
            )
        )
        avg_frt = avg_frt_result.scalar() or 0

        # Average Resolution Time (today)
        today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
        avg_resolution_result = await db.execute(
            select(
                func.avg(
                    func.extract('epoch', ChatSession.closed_at - ChatSession.started_at)
                )
            ).where(
                ChatSession.status == SessionStatus.CLOSED,
                ChatSession.closed_at > today_start
            )
        )
        avg_resolution = avg_resolution_result.scalar() or 0

        # CSAT (last 24 hours)
        day_ago = datetime.now(timezone.utc) - timedelta(days=1)
        csat_result = await db.execute(
            select(func.avg(CsatResponse.score)).where(
                CsatResponse.created_at > day_ago
            )
        )
        csat_avg = csat_result.scalar() or 0

        # FCR Rate (last 7 days)
        fcr_rate = await self.calculate_fcr_rate(db, days=7)
        abandonment_rate = await self.calculate_abandonment_rate(db, days=7)
        sla_breach_events_24h = await self.calculate_sla_breach_events(db, hours=24)

        # Sessions today
        sessions_today = await db.scalar(
            select(func.count()).where(
                ChatSession.started_at > today_start
            )
        )
        
        # Total users in HUMAN mode
        human_mode_users = await db.scalar(
            select(func.count()).where(User.chat_mode == ChatMode.HUMAN)
        )

        return {
            "waiting": waiting or 0,
            "active": active or 0,
            "avg_first_response_seconds": round(avg_frt, 1),
            "avg_resolution_seconds": round(avg_resolution, 1),
            "csat_average": round(csat_avg, 2) if csat_avg else 0,
            "csat_percentage": round((csat_avg / 5) * 100, 1) if csat_avg else 0,
            "fcr_rate": round(fcr_rate, 1),
            "abandonment_rate": round(abandonment_rate, 1),
            "sla_breach_events_24h": int(sla_breach_events_24h),
            "sessions_today": sessions_today or 0,
            "human_mode_users": human_mode_users or 0,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }

    async def emit_live_kpis_update(self, db: AsyncSession = None) -> None:
        """Emit live KPI updates to WebSocket analytics subscribers.

        Uses its own DB session so callers are never disrupted by a
        broadcast failure.  The ``db`` parameter is accepted for
        backward-compatibility but ignored — a fresh session is always
        created internally.
        """
        try:
            from app.core.websocket_manager import ws_manager
            from app.schemas.ws_events import WSEventType

            async with AsyncSessionLocal() as session:
                kpis = await self.get_live_kpis(session)
                await ws_manager.broadcast_analytics_update(
                    {
                        "type": WSEventType.ANALYTICS_UPDATE.value,
                        "payload": kpis,
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                    }
                )
        except Exception as e:
            logger.warning("KPI broadcast failed (non-fatal): %s", e)

    async def calculate_fcr_rate(self, db: AsyncSession, days: int = 7) -> float:
        """
        Calculate First Contact Resolution rate.
        
        A session is "first contact resolved" if:
        - Not reopened within 24 hours
        - Has a CSAT score >= 4 (or no CSAT but was closed normally)
        
        Args:
            db: Database session
            days: Lookback period in days
            
        Returns:
            FCR rate as percentage (0-100)
        """
        cutoff = datetime.now(timezone.utc) - timedelta(days=days)

        closed_sessions = (
            select(
                ChatSession.id.label("id"),
                ChatSession.line_user_id.label("line_user_id"),
                ChatSession.closed_at.label("closed_at"),
            )
            .where(
                ChatSession.status == SessionStatus.CLOSED,
                ChatSession.closed_at > cutoff
            )
            .subquery()
        )

        total_sessions = await db.scalar(
            select(func.count()).select_from(closed_sessions)
        )
        if not total_sessions:
            return 0

        reopened_exists = exists(
            select(ChatSession.id).where(
                and_(
                    ChatSession.line_user_id == closed_sessions.c.line_user_id,
                    ChatSession.started_at > closed_sessions.c.closed_at,
                    ChatSession.started_at < closed_sessions.c.closed_at + timedelta(hours=24),
                )
            )
        )

        fcr_count = await db.scalar(
            select(func.count())
            .select_from(closed_sessions)
            .where(~reopened_exists)
        )

        return ((fcr_count or 0) / total_sessions) * 100

    async def calculate_fcr_rate_window(
        self,
        db: AsyncSession,
        start: datetime,
        end: datetime,
    ) -> float:
        """Calculate FCR within an explicit closed_at time window."""
        closed_sessions = (
            select(
                ChatSession.id.label("id"),
                ChatSession.line_user_id.label("line_user_id"),
                ChatSession.closed_at.label("closed_at"),
            )
            .where(
                ChatSession.status == SessionStatus.CLOSED,
                ChatSession.closed_at >= start,
                ChatSession.closed_at < end,
            )
            .subquery()
        )
        total_sessions = await db.scalar(select(func.count()).select_from(closed_sessions))
        if not total_sessions:
            return 0.0
        reopened_exists = exists(
            select(ChatSession.id).where(
                and_(
                    ChatSession.line_user_id == closed_sessions.c.line_user_id,
                    ChatSession.started_at > closed_sessions.c.closed_at,
                    ChatSession.started_at < closed_sessions.c.closed_at + timedelta(hours=24),
                )
            )
        )
        fcr_count = await db.scalar(
            select(func.count()).select_from(closed_sessions).where(~reopened_exists)
        )
        return ((fcr_count or 0) / total_sessions) * 100

    async def calculate_abandonment_rate(self, db: AsyncSession, days: int = 7) -> float:
        """
        Calculate abandonment rate for waiting sessions that timed out.

        Formula:
            abandoned / (abandoned + claimed) * 100
        Where abandoned = closed_by SYSTEM_TIMEOUT, claimed = claimed_at is not null
        """
        cutoff = datetime.now(timezone.utc) - timedelta(days=days)

        abandoned = await db.scalar(
            select(func.count(ChatSession.id)).where(
                ChatSession.closed_at > cutoff,
                ChatSession.closed_by == "SYSTEM_TIMEOUT",
            )
        )

        claimed = await db.scalar(
            select(func.count(ChatSession.id)).where(
                ChatSession.claimed_at > cutoff,
                ChatSession.claimed_at.isnot(None),
            )
        )

        abandoned_count = abandoned or 0
        claimed_count = claimed or 0
        total = abandoned_count + claimed_count
        if total == 0:
            return 0.0
        return (abandoned_count / total) * 100

    async def calculate_abandonment_rate_window(
        self,
        db: AsyncSession,
        start: datetime,
        end: datetime,
    ) -> float:
        """Calculate abandonment rate for a specific time window."""
        abandoned = await db.scalar(
            select(func.count(ChatSession.id)).where(
                ChatSession.closed_at >= start,
                ChatSession.closed_at < end,
                ChatSession.closed_by == "SYSTEM_TIMEOUT",
            )
        )
        claimed = await db.scalar(
            select(func.count(ChatSession.id)).where(
                ChatSession.claimed_at >= start,
                ChatSession.claimed_at < end,
                ChatSession.claimed_at.isnot(None),
            )
        )
        abandoned_count = abandoned or 0
        claimed_count = claimed or 0
        total = abandoned_count + claimed_count
        if total == 0:
            return 0.0
        return (abandoned_count / total) * 100

    async def get_session_volume(self, db: AsyncSession, days: int = 7) -> list[dict]:
        """Get daily session counts for the last N days."""
        safe_days = max(1, min(days, 30))
        today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
        start = today - timedelta(days=safe_days - 1)
        day_bucket = func.date_trunc(literal_column("'day'"), ChatSession.started_at)

        result = await db.execute(
            select(
                day_bucket.label("day"),
                func.count(ChatSession.id).label("count"),
            )
            .where(ChatSession.started_at >= start)
            .group_by(day_bucket)
            .order_by(day_bucket)
        )
        raw = {row.day.date().isoformat(): int(row.count) for row in result.all() if row.day}

        series: list[dict] = []
        cursor = start.date()
        while cursor <= today.date():
            key = cursor.isoformat()
            series.append({"day": key, "sessions": raw.get(key, 0)})
            cursor = cursor + timedelta(days=1)
        return series

    async def get_peak_hours_heatmap(self, db: AsyncSession, days: int = 7) -> list[dict]:
        """Get message volume grouped by day-of-week and hour."""
        safe_days = max(1, min(days, 30))
        cutoff = datetime.now(timezone.utc) - timedelta(days=safe_days)
        result = await db.execute(
            select(
                func.extract("dow", Message.created_at).label("dow"),
                func.extract("hour", Message.created_at).label("hour"),
                func.count(Message.id).label("message_count"),
            )
            .where(Message.created_at >= cutoff)
            .group_by(
                func.extract("dow", Message.created_at),
                func.extract("hour", Message.created_at),
            )
        )
        return [
            {
                "day_of_week": int(row.dow),
                "hour": int(row.hour),
                "message_count": int(row.message_count),
            }
            for row in result.all()
        ]

    async def get_conversation_funnel(self, db: AsyncSession, days: int = 7) -> dict:
        """Get Bot -> Human -> Resolved funnel metrics."""
        safe_days = max(1, min(days, 30))
        cutoff = datetime.now(timezone.utc) - timedelta(days=safe_days)

        bot_entries = await db.scalar(
            select(func.count(func.distinct(Message.line_user_id))).where(
                Message.created_at >= cutoff,
                Message.direction == MessageDirection.INCOMING,
                Message.line_user_id.isnot(None),
            )
        )
        human_handoff = await db.scalar(
            select(func.count(ChatSession.id)).where(
                ChatSession.started_at >= cutoff,
                ChatSession.claimed_at.isnot(None),
            )
        )
        resolved = await db.scalar(
            select(func.count(ChatSession.id)).where(
                ChatSession.closed_at >= cutoff,
                ChatSession.status == SessionStatus.CLOSED,
            )
        )

        return {
            "bot_entries": int(bot_entries or 0),
            "human_handoff": int(human_handoff or 0),
            "resolved": int(resolved or 0),
        }

    async def get_percentiles(self, db: AsyncSession, days: int = 7) -> dict:
        """Get P50/P90/P99 for FRT and resolution times."""
        safe_days = max(1, min(days, 30))
        cutoff = datetime.now(timezone.utc) - timedelta(days=safe_days)

        frt_rows = await db.execute(
            select(func.extract("epoch", ChatSession.first_response_at - ChatSession.claimed_at))
            .where(
                ChatSession.first_response_at.isnot(None),
                ChatSession.claimed_at >= cutoff,
            )
        )
        resolution_rows = await db.execute(
            select(func.extract("epoch", ChatSession.closed_at - ChatSession.started_at))
            .where(
                ChatSession.closed_at.isnot(None),
                ChatSession.closed_at >= cutoff,
            )
        )
        frt_values = [float(v[0]) for v in frt_rows.all() if v[0] is not None]
        resolution_values = [float(v[0]) for v in resolution_rows.all() if v[0] is not None]

        return {
            "frt": {
                "p50": round(self._percentile(frt_values, 50), 1),
                "p90": round(self._percentile(frt_values, 90), 1),
                "p99": round(self._percentile(frt_values, 99), 1),
            },
            "resolution": {
                "p50": round(self._percentile(resolution_values, 50), 1),
                "p90": round(self._percentile(resolution_values, 90), 1),
                "p99": round(self._percentile(resolution_values, 99), 1),
            },
        }

    async def get_kpi_trends(self, db: AsyncSession) -> dict:
        """Compare today's KPIs against yesterday."""
        now = datetime.now(timezone.utc)
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        yesterday_start = today_start - timedelta(days=1)
        yesterday_end = today_start

        current = await self.get_live_kpis(db)

        yesterday_sessions = await db.scalar(
            select(func.count(ChatSession.id)).where(
                ChatSession.started_at >= yesterday_start,
                ChatSession.started_at < yesterday_end,
            )
        )
        yesterday_frt = (
            await db.execute(
                select(func.avg(func.extract("epoch", ChatSession.first_response_at - ChatSession.claimed_at)))
                .where(
                    ChatSession.first_response_at.isnot(None),
                    ChatSession.claimed_at >= yesterday_start,
                    ChatSession.claimed_at < yesterday_end,
                )
            )
        ).scalar() or 0
        yesterday_resolution = (
            await db.execute(
                select(func.avg(func.extract("epoch", ChatSession.closed_at - ChatSession.started_at)))
                .where(
                    ChatSession.closed_at.isnot(None),
                    ChatSession.closed_at >= yesterday_start,
                    ChatSession.closed_at < yesterday_end,
                )
            )
        ).scalar() or 0
        yesterday_csat = (
            await db.execute(
                select(func.avg(CsatResponse.score)).where(
                    CsatResponse.created_at >= yesterday_start,
                    CsatResponse.created_at < yesterday_end,
                )
            )
        ).scalar() or 0
        yesterday_csat_pct = (float(yesterday_csat) / 5) * 100 if yesterday_csat else 0
        yesterday_fcr = await self.calculate_fcr_rate_window(db, yesterday_start, yesterday_end)
        yesterday_abandon = await self.calculate_abandonment_rate_window(db, yesterday_start, yesterday_end)

        def trend(current_value: float, previous_value: float) -> dict:
            delta = float(current_value) - float(previous_value)
            return {
                "current": round(float(current_value), 2),
                "previous": round(float(previous_value), 2),
                "delta": round(delta, 2),
                "delta_percent": round((delta / previous_value * 100), 1) if previous_value else 0.0,
            }

        return {
            "sessions_today": trend(current["sessions_today"], yesterday_sessions or 0),
            "avg_first_response_seconds": trend(current["avg_first_response_seconds"], yesterday_frt),
            "avg_resolution_seconds": trend(current["avg_resolution_seconds"], yesterday_resolution),
            "csat_percentage": trend(current["csat_percentage"], yesterday_csat_pct),
            "fcr_rate": trend(current["fcr_rate"], yesterday_fcr),
            "abandonment_rate": trend(current.get("abandonment_rate", 0), yesterday_abandon),
        }

    async def get_dashboard(self, db: AsyncSession, days: int = 7) -> dict:
        """Aggregated analytics payload for dashboard UI.

        Use the caller's DB session to avoid opening multiple concurrent
        connections for a single dashboard request.
        """
        trends = await self.get_kpi_trends(db)
        session_volume = await self.get_session_volume(db, days=days)
        peak_hours = await self.get_peak_hours_heatmap(db, days=days)
        funnel = await self.get_conversation_funnel(db, days=days)
        percentiles = await self.get_percentiles(db, days=days)

        return {
            "trends": trends,
            "session_volume": session_volume,
            "peak_hours": peak_hours,
            "funnel": funnel,
            "percentiles": percentiles,
        }

    async def calculate_sla_breach_events(self, db: AsyncSession, hours: int = 24) -> int:
        """
        Count SLA breach events in the lookback window.

        This counts event categories separately:
        - queue wait breaches (claim latency)
        - first-response breaches
        - resolution-time breaches
        """
        safe_hours = max(1, min(hours, 24 * 30))
        cutoff = datetime.now(timezone.utc) - timedelta(hours=safe_hours)

        queue_wait_count = await db.scalar(
            select(func.count(ChatSession.id)).where(
                ChatSession.claimed_at.isnot(None),
                ChatSession.started_at.isnot(None),
                ChatSession.claimed_at >= cutoff,
                func.extract("epoch", ChatSession.claimed_at - ChatSession.started_at) > settings.SLA_MAX_QUEUE_WAIT_SECONDS,
            )
        )

        frt_count = await db.scalar(
            select(func.count(ChatSession.id)).where(
                ChatSession.first_response_at.isnot(None),
                ChatSession.claimed_at.isnot(None),
                ChatSession.first_response_at >= cutoff,
                func.extract("epoch", ChatSession.first_response_at - ChatSession.claimed_at) > settings.SLA_MAX_FRT_SECONDS,
            )
        )

        resolution_count = await db.scalar(
            select(func.count(ChatSession.id)).where(
                ChatSession.closed_at.isnot(None),
                ChatSession.started_at.isnot(None),
                ChatSession.closed_at >= cutoff,
                func.extract("epoch", ChatSession.closed_at - ChatSession.started_at) > settings.SLA_MAX_RESOLUTION_SECONDS,
            )
        )

        return int((queue_wait_count or 0) + (frt_count or 0) + (resolution_count or 0))

    async def get_operator_performance(
        self,
        db: AsyncSession,
        operator_id: Optional[int] = None,
        days: int = 7
    ) -> list:
        """
        Get operator performance metrics.
        
        Args:
            db: Database session
            operator_id: Specific operator ID or None for all
            days: Lookback period
            
        Returns:
            List of operator performance dicts
        """
        cutoff = datetime.now(timezone.utc) - timedelta(days=days)

        # Base query
        query = select(
            ChatSession.operator_id,
            User.display_name.label("operator_name"),
            func.count().label("total_sessions"),
            func.avg(
                func.extract('epoch', ChatSession.first_response_at - ChatSession.claimed_at)
            ).label("avg_frt"),
            func.avg(
                func.extract('epoch', ChatSession.closed_at - ChatSession.started_at)
            ).label("avg_resolution"),
            func.avg(
                func.extract('epoch', ChatSession.claimed_at - ChatSession.started_at)
            ).label("avg_queue_wait")
        ).where(
            ChatSession.operator_id.isnot(None),
            ChatSession.claimed_at > cutoff
        ).join(
            User,
            User.id == ChatSession.operator_id,
        ).group_by(
            ChatSession.operator_id,
            User.display_name,
        )

        if operator_id:
            query = query.where(ChatSession.operator_id == operator_id)

        result = await db.execute(query)
        rows = result.all()
        availability_map = await self.get_operator_availability_map(
            [row.operator_id for row in rows if row.operator_id is not None],
            days=days,
        )

        performance = []
        for row in rows:
            availability = availability_map.get(
                str(row.operator_id),
                {"availability_seconds": 0.0, "availability_percent": 0.0},
            )

            performance.append({
                "operator_id": row.operator_id,
                "operator_name": row.operator_name or f"Operator {row.operator_id}",
                "total_sessions": row.total_sessions,
                "avg_first_response_seconds": round(row.avg_frt or 0, 1),
                "avg_resolution_seconds": round(row.avg_resolution or 0, 1),
                "avg_queue_wait_seconds": round(row.avg_queue_wait or 0, 1),
                "availability_seconds": round(availability["availability_seconds"], 1),
                "availability_percent": round(availability["availability_percent"], 1),
            })

        return performance

    async def get_operator_availability_map(
        self,
        operator_ids: list[int],
        days: int = 7,
    ) -> dict[str, dict[str, float]]:
        """Get aggregated operator availability metrics from Redis."""
        if not operator_ids:
            return {}
        if not redis_client.is_connected or not redis_client._redis:
            return {
                str(op_id): {"availability_seconds": 0.0, "availability_percent": 0.0}
                for op_id in operator_ids
            }

        now = datetime.now(timezone.utc)
        window_start = (now - timedelta(days=days - 1)).replace(
            hour=0, minute=0, second=0, microsecond=0
        )
        totals: dict[str, float] = {str(op_id): 0.0 for op_id in operator_ids}
        operator_id_set = set(totals.keys())

        day_cursor = window_start.date()
        while day_cursor <= now.date():
            day_key = f"operator:availability:{day_cursor.isoformat()}"
            try:
                rows = await redis_client._redis.zrange(day_key, 0, -1, withscores=True)
                for member, score in rows:
                    member_id = str(member)
                    if member_id in operator_id_set:
                        totals[member_id] += float(score)
            except Exception:
                # Graceful degradation: skip Redis failures for one day bucket.
                pass
            day_cursor = day_cursor + timedelta(days=1)

        # Include ongoing online windows that are not persisted yet.
        for op_id in operator_ids:
            key = f"operator:online:{op_id}"
            try:
                raw_started = await redis_client._redis.get(key)
                if not raw_started:
                    continue
                started_at = datetime.fromisoformat(raw_started)
                effective_start = started_at if started_at > window_start else window_start
                if now > effective_start:
                    totals[str(op_id)] += (now - effective_start).total_seconds()
            except Exception:
                continue

        max_seconds = max(days, 1) * 86400
        result: dict[str, dict[str, float]] = {}
        for op_id in operator_ids:
            seconds = max(totals.get(str(op_id), 0.0), 0.0)
            percent = (seconds / max_seconds) * 100 if max_seconds else 0.0
            result[str(op_id)] = {
                "availability_seconds": seconds,
                "availability_percent": min(percent, 100.0),
            }
        return result

    async def get_hourly_stats(
        self,
        db: AsyncSession,
        hours: int = 24
    ) -> list:
        """
        Get hourly message/session stats for charting.
        
        Args:
            db: Database session
            hours: Number of hours to look back
            
        Returns:
            List of hourly stats dicts
        """
        from app.models.message import Message
        
        cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)
        
        # Get messages per hour
        result = await db.execute(
            select(
                func.date_trunc('hour', Message.created_at).label("hour"),
                func.count().label("count")
            ).where(
                Message.created_at > cutoff
            ).group_by(
                func.date_trunc('hour', Message.created_at)
            ).order_by("hour")
        )
        
        rows = result.all()
        
        stats = []
        for row in rows:
            stats.append({
                "hour": row.hour.isoformat() if row.hour else None,
                "message_count": row.count
            })
        
        return stats

    @staticmethod
    def _percentile(values: list[float], percentile: int) -> float:
        """Calculate percentile using nearest-rank with linear interpolation."""
        if not values:
            return 0.0
        p = max(0, min(percentile, 100)) / 100
        ordered = sorted(values)
        if len(ordered) == 1:
            return ordered[0]
        idx = p * (len(ordered) - 1)
        lower = int(idx)
        upper = min(lower + 1, len(ordered) - 1)
        weight = idx - lower
        return ordered[lower] * (1 - weight) + ordered[upper] * weight


# Global analytics service instance
analytics_service = AnalyticsService()

