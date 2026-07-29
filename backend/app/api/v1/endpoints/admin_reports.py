"""Comprehensive reporting endpoints for admin dashboard."""

import csv
import io
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_admin, get_db, require_permission
from app.core.permissions import KEY_VIEW_REPORTS, KEY_EXPORT_CHAT
from app.models.friend_event import FriendEvent
from app.models.message import Message
from app.models.service_request import ServiceRequest
from app.models.user import User
from app.services.report_service import report_service, parse_dates

router = APIRouter()


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class TrendValue(BaseModel):
    current: int
    previous: int
    change_percent: float


class OverviewResponse(BaseModel):
    total_requests: int
    requests_by_status: dict[str, int]
    total_messages_today: int
    messages_incoming_today: int
    messages_outgoing_today: int
    total_followers: int
    active_sessions: int
    requests_trend: TrendValue
    messages_trend: TrendValue
    followers_trend: TrendValue
    sessions_trend: TrendValue
    daily_activity: list[dict]


class ServiceRequestReportResponse(BaseModel):
    by_status: dict[str, int]
    by_category: list[dict]
    over_time: list[dict]
    avg_resolution_days: float
    top_categories: list[dict]


class MessagesReportResponse(BaseModel):
    over_time: list[dict]
    incoming_total: int
    outgoing_total: int
    peak_hours: list[dict]


class OperatorRow(BaseModel):
    operator_id: int
    operator_name: str
    sessions_handled: int
    avg_response_seconds: float
    messages_sent: int


class OperatorsReportResponse(BaseModel):
    operators: list[OperatorRow]


class FollowersReportResponse(BaseModel):
    total_followers: int
    new_this_period: int
    lost_this_period: int
    refollow_this_period: int
    net_growth: int
    refollow_rate: float
    over_time: list[dict]


# ---------------------------------------------------------------------------
# Report endpoints (thin delegation to report_service)
# ---------------------------------------------------------------------------

@router.get("/overview", response_model=OverviewResponse)
async def report_overview(
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(require_permission(KEY_VIEW_REPORTS)),
):
    data = await report_service.get_overview(db)
    return OverviewResponse(**data)


@router.get("/service-requests", response_model=ServiceRequestReportResponse)
async def report_service_requests(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    period: str = Query("daily", pattern="^(daily|weekly|monthly)$"),
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(require_permission(KEY_VIEW_REPORTS)),
):
    start, end = parse_dates(start_date, end_date)
    data = await report_service.get_service_request_report(start, end, period, db)
    return ServiceRequestReportResponse(**data)


@router.get("/messages", response_model=MessagesReportResponse)
async def report_messages(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    period: str = Query("daily", pattern="^(daily|weekly|monthly)$"),
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(require_permission(KEY_VIEW_REPORTS)),
):
    start, end = parse_dates(start_date, end_date)
    data = await report_service.get_message_report(start, end, period, db)
    return MessagesReportResponse(**data)


@router.get("/operators", response_model=OperatorsReportResponse)
async def report_operators(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(require_permission(KEY_VIEW_REPORTS)),
):
    start, end = parse_dates(start_date, end_date)
    data = await report_service.get_operator_report(start, end, db)
    return OperatorsReportResponse(**data)


@router.get("/followers", response_model=FollowersReportResponse)
async def report_followers(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    period: str = Query("daily", pattern="^(daily|weekly|monthly)$"),
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(require_permission(KEY_VIEW_REPORTS)),
):
    start, end = parse_dates(start_date, end_date)
    data = await report_service.get_follower_report(start, end, period, db)
    return FollowersReportResponse(**data)


# ---------------------------------------------------------------------------
# Export endpoints (presentation layer — CSV/PDF stay here)
# ---------------------------------------------------------------------------

@router.get("/export")
async def export_report(
    type: str = Query(..., pattern="^(service-requests|messages|operators|followers)$"),
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(require_permission(KEY_EXPORT_CHAT)),
):
    start, end = parse_dates(start_date, end_date)
    buf = io.StringIO()
    writer = csv.writer(buf)

    if type == "service-requests":
        writer.writerow(["ID", "Status", "Category", "Subcategory", "Requester", "Created", "Completed"])
        q = select(ServiceRequest).where(
            ServiceRequest.created_at >= start, ServiceRequest.created_at < end,
        ).order_by(ServiceRequest.created_at.desc())
        rows = (await db.execute(q)).scalars().all()
        for r in rows:
            writer.writerow([
                r.id,
                r.status.value if r.status else "PENDING",
                r.topic_category or r.category or "",
                r.topic_subcategory or r.subcategory or "",
                f"{r.firstname or ''} {r.lastname or ''}".strip() or r.requester_name or "",
                str(r.created_at) if r.created_at else "",
                str(r.completed_at) if r.completed_at else "",
            ])

    elif type == "messages":
        writer.writerow(["ID", "LineUserID", "Direction", "Type", "SenderRole", "Created"])
        q = select(Message).where(
            Message.created_at >= start, Message.created_at < end,
        ).order_by(Message.created_at.desc()).limit(10000)
        rows = (await db.execute(q)).scalars().all()
        for r in rows:
            writer.writerow([
                r.id, r.line_user_id or "",
                r.direction.value if r.direction else "",
                r.message_type or "",
                r.sender_role.value if r.sender_role else "",
                str(r.created_at) if r.created_at else "",
            ])

    elif type == "operators":
        report = await report_operators(
            start_date=start.isoformat(), end_date=end.isoformat(),
            db=db, current_admin=current_admin,
        )
        writer.writerow(["OperatorID", "Name", "SessionsHandled", "AvgResponseSec", "MessagesSent"])
        for op in report.operators:
            writer.writerow([op.operator_id, op.operator_name, op.sessions_handled, op.avg_response_seconds, op.messages_sent])

    elif type == "followers":
        writer.writerow(["ID", "LineUserID", "EventType", "Created"])
        q = select(FriendEvent).where(
            FriendEvent.created_at >= start, FriendEvent.created_at < end,
        ).order_by(FriendEvent.created_at.desc())
        rows = (await db.execute(q)).scalars().all()
        for r in rows:
            writer.writerow([r.id, r.line_user_id, r.event_type, str(r.created_at)])

    buf.seek(0)
    inclusive_end = end - timedelta(microseconds=1)
    filename = f"report-{type}-{start.strftime('%Y%m%d')}-{inclusive_end.strftime('%Y%m%d')}.csv"
    return StreamingResponse(
        buf, media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.get("/export/pdf")
async def export_report_pdf(
    report_type: str = Query(
        ..., pattern="^(overview|service-requests|messages|operators|followers)$",
        description="Report type: overview, service-requests, messages, operators, followers",
    ),
    period: int = Query(30, ge=1, le=90),
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(require_permission(KEY_EXPORT_CHAT)),
):
    """Export report as PDF with Content-Disposition for direct download."""
    from app.services.pdf_report_service import PDFReportService

    end_dt = datetime.now(timezone.utc)
    start_dt = end_dt - timedelta(days=period)
    start_iso = start_dt.isoformat()
    end_iso = end_dt.isoformat()

    if report_type == "overview":
        report = await report_overview(db=db, current_admin=current_admin)
        data = report.model_dump()
    elif report_type == "service-requests":
        report = await report_service_requests(start_date=start_iso, end_date=end_iso, period="daily", db=db, current_admin=current_admin)
        data = report.model_dump()
    elif report_type == "messages":
        report = await report_messages(start_date=start_iso, end_date=end_iso, period="daily", db=db, current_admin=current_admin)
        data = report.model_dump()
    elif report_type == "operators":
        report = await report_operators(start_date=start_iso, end_date=end_iso, db=db, current_admin=current_admin)
        data = report.model_dump()
    elif report_type == "followers":
        report = await report_followers(start_date=start_iso, end_date=end_iso, period="daily", db=db, current_admin=current_admin)
        data = report.model_dump()
    else:
        raise HTTPException(status_code=400, detail=f"Unsupported report type: {report_type}")

    service = PDFReportService()
    pdf_buffer = service.generate(report_type, data, period)
    filename = f"report_{report_type}_{datetime.now(timezone.utc).strftime('%Y%m%d')}.pdf"
    return StreamingResponse(
        pdf_buffer, media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
