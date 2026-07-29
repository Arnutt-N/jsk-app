"""Service request report queries."""
from datetime import datetime

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.service_request import RequestStatus, ServiceRequest

from .helpers import bucket_expression, format_bucket


class ServiceRequestReportMixin:

    async def get_service_request_report(
        self, start: datetime, end: datetime, period: str, db: AsyncSession
    ) -> dict:
        status_q = (
            select(ServiceRequest.status, func.count(ServiceRequest.id))
            .where(ServiceRequest.created_at >= start, ServiceRequest.created_at < end)
            .group_by(ServiceRequest.status)
        )
        by_status = {
            (s.value if s else "PENDING"): c
            for s, c in (await db.execute(status_q)).all()
        }

        cat_q = (
            select(ServiceRequest.topic_category, func.count(ServiceRequest.id).label("count"))
            .where(ServiceRequest.created_at >= start, ServiceRequest.created_at < end)
            .group_by(ServiceRequest.topic_category)
            .order_by(text("count DESC"))
        )
        by_category = [
            {"category": c or "ไม่ระบุ", "count": n}
            for c, n in (await db.execute(cat_q)).all()
        ]

        date_bucket = bucket_expression(ServiceRequest.created_at, period)
        time_q = (
            select(date_bucket.label("period_start"), func.count(ServiceRequest.id).label("count"))
            .where(ServiceRequest.created_at >= start, ServiceRequest.created_at < end)
            .group_by(date_bucket).order_by(date_bucket)
        )
        over_time = [
            {"period": format_bucket(period_start, period), "count": c}
            for period_start, c in (await db.execute(time_q)).all()
        ]

        res_q = select(
            func.avg(func.extract("epoch", ServiceRequest.completed_at - ServiceRequest.created_at) / 86400)
        ).where(
            ServiceRequest.status == RequestStatus.COMPLETED,
            ServiceRequest.created_at >= start,
            ServiceRequest.created_at < end,
        )
        avg_res = (await db.execute(res_q)).scalar() or 0.0

        return {
            "by_status": by_status,
            "by_category": by_category,
            "over_time": over_time,
            "avg_resolution_days": round(float(avg_res), 2),
            "top_categories": by_category[:10],
        }
