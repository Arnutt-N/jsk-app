"""Message report queries."""
from datetime import datetime

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.message import Message, MessageDirection

from .helpers import bucket_expression, format_bucket


class MessageReportMixin:

    async def get_message_report(
        self, start: datetime, end: datetime, period: str, db: AsyncSession
    ) -> dict:
        date_bucket = bucket_expression(Message.created_at, period)

        time_q = (
            select(
                date_bucket.label("period_start"),
                func.count(Message.id).filter(Message.direction == MessageDirection.INCOMING).label("incoming"),
                func.count(Message.id).filter(Message.direction == MessageDirection.OUTGOING).label("outgoing"),
            )
            .where(Message.created_at >= start, Message.created_at < end)
            .group_by(date_bucket).order_by(date_bucket)
        )
        rows = (await db.execute(time_q)).all()
        over_time = [
            {"period": format_bucket(period_start, period), "incoming": i, "outgoing": o}
            for period_start, i, o in rows
        ]

        totals_q = select(
            func.count(Message.id).filter(Message.direction == MessageDirection.INCOMING),
            func.count(Message.id).filter(Message.direction == MessageDirection.OUTGOING),
        ).where(Message.created_at >= start, Message.created_at < end)
        inc_total, out_total = (await db.execute(totals_q)).one()

        peak_q = (
            select(
                func.extract("hour", Message.created_at).label("hour"),
                func.count(Message.id).label("count"),
            )
            .where(Message.created_at >= start, Message.created_at < end)
            .group_by(text("hour")).order_by(text("hour"))
        )
        peak_rows = (await db.execute(peak_q)).all()
        peak_hours = [{"hour": int(h), "count": c} for h, c in peak_rows]

        return {
            "over_time": over_time,
            "incoming_total": inc_total or 0,
            "outgoing_total": out_total or 0,
            "peak_hours": peak_hours,
        }
