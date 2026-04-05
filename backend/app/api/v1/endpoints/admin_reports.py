"""Comprehensive reporting endpoints for admin dashboard."""

import csv
import io
from datetime import date, datetime, timedelta, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_admin, get_db
from app.models.chat_session import ChatSession, SessionStatus
from app.models.friend_event import FriendEvent, FriendEventType
from app.models.message import Message, MessageDirection
from app.models.service_request import RequestStatus, ServiceRequest
from app.models.user import User

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
    # Trends vs previous period
    requests_trend: TrendValue
    messages_trend: TrendValue
    followers_trend: TrendValue
    sessions_trend: TrendValue
    # Last 7 days activity
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
# Helpers
# ---------------------------------------------------------------------------

def _parse_dates(
    start_date: Optional[str],
    end_date: Optional[str],
    default_days: int = 30,
) -> tuple[datetime, datetime]:
    now = datetime.now(timezone.utc)

    def _parse_value(value: str, is_end: bool) -> datetime:
        try:
            parsed = datetime.fromisoformat(value)
        except ValueError:
            label = "end_date" if is_end else "start_date"
            raise HTTPException(status_code=422, detail=f"Invalid {label} format: {value}")

        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        else:
            parsed = parsed.astimezone(timezone.utc)

        if "T" not in value:
            parsed = parsed.replace(hour=0, minute=0, second=0, microsecond=0)
            if is_end:
                parsed = parsed + timedelta(days=1)
        return parsed

    try:
        end = _parse_value(end_date, is_end=True) if end_date else now
        start = _parse_value(start_date, is_end=False) if start_date else end - timedelta(days=default_days)
    except HTTPException:
        raise
    return start, end


def _time_range_for_day(day: date) -> tuple[datetime, datetime]:
    start = datetime(day.year, day.month, day.day, tzinfo=timezone.utc)
    return start, start + timedelta(days=1)


def _bucket_expression(column, period: str):
    bucket = {"daily": "day", "weekly": "week", "monthly": "month"}[period]
    return func.date_trunc(bucket, column)


def _format_bucket(bucket_value: datetime, period: str) -> str:
    normalized = bucket_value if bucket_value.tzinfo else bucket_value.replace(tzinfo=timezone.utc)
    normalized = normalized.astimezone(timezone.utc)
    if period == "monthly":
        return normalized.strftime("%Y-%m")
    if period == "weekly":
        iso = normalized.date().isocalendar()
        return f"{iso.year}-{iso.week:02d}"
    return normalized.strftime("%Y-%m-%d")


# ---------------------------------------------------------------------------
# GET /overview
# ---------------------------------------------------------------------------

@router.get("/overview", response_model=OverviewResponse)
async def report_overview(
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    tomorrow_start = today_start + timedelta(days=1)
    yesterday_start = today_start - timedelta(days=1)
    week_ago = today_start - timedelta(days=7)
    two_weeks_ago = today_start - timedelta(days=14)
    activity_start = today_start - timedelta(days=6)

    # --- requests by status ---
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

    # --- requests trend (this week vs last week) ---
    cur_req = (await db.execute(
        select(func.count(ServiceRequest.id)).where(
            ServiceRequest.created_at >= week_ago
        )
    )).scalar() or 0
    prev_req = (await db.execute(
        select(func.count(ServiceRequest.id)).where(
            ServiceRequest.created_at >= two_weeks_ago,
            ServiceRequest.created_at < week_ago,
        )
    )).scalar() or 0

    # --- messages today ---
    msg_today_q = select(
        func.count(Message.id),
        func.count(Message.id).filter(Message.direction == MessageDirection.INCOMING),
        func.count(Message.id).filter(Message.direction == MessageDirection.OUTGOING),
    ).where(
        Message.created_at >= today_start,
        Message.created_at < tomorrow_start,
    )
    msg_row = (await db.execute(msg_today_q)).one()
    total_msg_today, inc_today, out_today = msg_row

    msg_yesterday = (await db.execute(
        select(func.count(Message.id)).where(
            Message.created_at >= yesterday_start,
            Message.created_at < today_start,
        )
    )).scalar() or 0

    # --- followers ---
    total_followers = (await db.execute(
        select(func.count(User.id)).where(
            User.line_user_id.isnot(None),
            User.friend_status == "ACTIVE",
        )
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

    # --- active sessions ---
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

    # --- daily activity last 7 days ---
    request_day_bucket = func.date_trunc("day", ServiceRequest.created_at)
    daily_q = (
        select(
            request_day_bucket.label("day"),
            func.count(ServiceRequest.id).label("requests"),
        )
        .where(ServiceRequest.created_at >= activity_start)
        .group_by(request_day_bucket)
        .order_by(request_day_bucket)
    )
    daily_rows = (await db.execute(daily_q)).all()
    # messages per day
    message_day_bucket = func.date_trunc("day", Message.created_at)
    msg_daily_q = (
        select(
            message_day_bucket.label("day"),
            func.count(Message.id).label("messages"),
        )
        .where(Message.created_at >= activity_start)
        .group_by(message_day_bucket)
        .order_by(message_day_bucket)
    )
    msg_daily_rows = (await db.execute(msg_daily_q)).all()

    request_by_day = {
        row.day.astimezone(timezone.utc).date().isoformat(): int(row.requests)
        for row in daily_rows
        if row.day
    }
    msg_by_day = {
        row.day.astimezone(timezone.utc).date().isoformat(): int(row.messages)
        for row in msg_daily_rows
        if row.day
    }
    daily_activity = []
    current_day = activity_start.date()
    while current_day <= today_start.date():
        key = current_day.isoformat()
        daily_activity.append({
            "day": key,
            "requests": request_by_day.get(key, 0),
            "messages": msg_by_day.get(key, 0),
        })
        current_day += timedelta(days=1)

    def _trend(cur: int, prev: int) -> TrendValue:
        pct = ((cur - prev) / prev * 100) if prev else (100.0 if cur else 0.0)
        return TrendValue(current=cur, previous=prev, change_percent=round(pct, 1))

    return OverviewResponse(
        total_requests=total_requests,
        requests_by_status=by_status,
        total_messages_today=total_msg_today,
        messages_incoming_today=inc_today,
        messages_outgoing_today=out_today,
        total_followers=total_followers,
        active_sessions=active_sessions,
        requests_trend=_trend(cur_req, prev_req),
        messages_trend=_trend(total_msg_today, msg_yesterday),
        followers_trend=_trend(new_followers_week, new_followers_prev),
        sessions_trend=_trend(active_sessions, active_sessions_yesterday),
        daily_activity=daily_activity,
    )


# ---------------------------------------------------------------------------
# GET /service-requests
# ---------------------------------------------------------------------------

@router.get("/service-requests", response_model=ServiceRequestReportResponse)
async def report_service_requests(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    period: str = Query("daily", pattern="^(daily|weekly|monthly)$"),
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    start, end = _parse_dates(start_date, end_date)

    # by status
    status_q = (
        select(ServiceRequest.status, func.count(ServiceRequest.id))
        .where(ServiceRequest.created_at >= start, ServiceRequest.created_at < end)
        .group_by(ServiceRequest.status)
    )
    by_status = {
        (s.value if s else "PENDING"): c
        for s, c in (await db.execute(status_q)).all()
    }

    # by category
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

    # over time
    date_bucket = _bucket_expression(ServiceRequest.created_at, period)

    time_q = (
        select(date_bucket.label("period_start"), func.count(ServiceRequest.id).label("count"))
        .where(ServiceRequest.created_at >= start, ServiceRequest.created_at < end)
        .group_by(date_bucket)
        .order_by(date_bucket)
    )
    over_time = [
        {"period": _format_bucket(period_start, period), "count": c}
        for period_start, c in (await db.execute(time_q)).all()
    ]

    # avg resolution
    res_q = select(
        func.avg(
            func.extract("epoch", ServiceRequest.completed_at - ServiceRequest.created_at) / 86400
        )
    ).where(
        ServiceRequest.status == RequestStatus.COMPLETED,
        ServiceRequest.created_at >= start,
        ServiceRequest.created_at < end,
    )
    avg_res = (await db.execute(res_q)).scalar() or 0.0

    return ServiceRequestReportResponse(
        by_status=by_status,
        by_category=by_category,
        over_time=over_time,
        avg_resolution_days=round(float(avg_res), 2),
        top_categories=by_category[:10],
    )


# ---------------------------------------------------------------------------
# GET /messages
# ---------------------------------------------------------------------------

@router.get("/messages", response_model=MessagesReportResponse)
async def report_messages(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    period: str = Query("daily", pattern="^(daily|weekly|monthly)$"),
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    start, end = _parse_dates(start_date, end_date)

    date_bucket = _bucket_expression(Message.created_at, period)

    time_q = (
        select(
            date_bucket.label("period_start"),
            func.count(Message.id).filter(Message.direction == MessageDirection.INCOMING).label("incoming"),
            func.count(Message.id).filter(Message.direction == MessageDirection.OUTGOING).label("outgoing"),
        )
        .where(Message.created_at >= start, Message.created_at < end)
        .group_by(date_bucket)
        .order_by(date_bucket)
    )
    rows = (await db.execute(time_q)).all()
    over_time = [
        {"period": _format_bucket(period_start, period), "incoming": i, "outgoing": o}
        for period_start, i, o in rows
    ]

    totals_q = select(
        func.count(Message.id).filter(Message.direction == MessageDirection.INCOMING),
        func.count(Message.id).filter(Message.direction == MessageDirection.OUTGOING),
    ).where(Message.created_at >= start, Message.created_at < end)
    inc_total, out_total = (await db.execute(totals_q)).one()

    # peak hours
    peak_q = (
        select(
            func.extract("hour", Message.created_at).label("hour"),
            func.count(Message.id).label("count"),
        )
        .where(Message.created_at >= start, Message.created_at < end)
        .group_by(text("hour"))
        .order_by(text("hour"))
    )
    peak_rows = (await db.execute(peak_q)).all()
    peak_hours = [{"hour": int(h), "count": c} for h, c in peak_rows]

    return MessagesReportResponse(
        over_time=over_time,
        incoming_total=inc_total or 0,
        outgoing_total=out_total or 0,
        peak_hours=peak_hours,
    )


# ---------------------------------------------------------------------------
# GET /operators
# ---------------------------------------------------------------------------

@router.get("/operators", response_model=OperatorsReportResponse)
async def report_operators(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    start, end = _parse_dates(start_date, end_date)

    # sessions per operator
    sessions_q = (
        select(
            ChatSession.operator_id,
            User.display_name,
            func.count(ChatSession.id).label("sessions_handled"),
            func.avg(
                func.extract(
                    "epoch",
                    ChatSession.first_response_at - ChatSession.started_at,
                )
            ).label("avg_response_seconds"),
        )
        .join(User, ChatSession.operator_id == User.id)
        .where(
            ChatSession.operator_id.isnot(None),
            ChatSession.started_at >= start,
            ChatSession.started_at < end,
        )
        .group_by(ChatSession.operator_id, User.display_name)
        .order_by(text("sessions_handled DESC"))
    )
    rows = (await db.execute(sessions_q)).all()

    # Count operator messages by matching outgoing ADMIN messages on sessions
    # owned by each operator (via line_user_id).  The Message model lacks an
    # operator_id column, so a direct FK join is not possible.  Previously this
    # used Message.operator_name (display name) which is unreliable because
    # display names can change or collide.  Instead we correlate through
    # ChatSession.line_user_id to count outgoing admin messages within sessions
    # each operator handled.
    operator_ids = [row.operator_id for row in rows]
    msg_by_operator: dict[int, int] = {}
    if operator_ids:
        op_msg_q = (
            select(
                ChatSession.operator_id,
                func.count(Message.id).label("msg_count"),
            )
            .join(
                Message,
                (Message.line_user_id == ChatSession.line_user_id)
                & (Message.created_at >= ChatSession.started_at)
                & (
                    (Message.created_at <= ChatSession.closed_at)
                    | (ChatSession.closed_at.is_(None))
                ),
            )
            .where(
                ChatSession.operator_id.in_(operator_ids),
                ChatSession.started_at >= start,
                ChatSession.started_at < end,
                Message.direction == MessageDirection.OUTGOING,
                Message.sender_role == "ADMIN",
            )
            .group_by(ChatSession.operator_id)
        )
        op_msg_rows = (await db.execute(op_msg_q)).all()
        msg_by_operator = {oid: cnt for oid, cnt in op_msg_rows}

    operators = []
    for row in rows:
        operators.append(OperatorRow(
            operator_id=row.operator_id,
            operator_name=row.display_name or f"Operator #{row.operator_id}",
            sessions_handled=row.sessions_handled,
            avg_response_seconds=round(float(row.avg_response_seconds or 0), 1),
            messages_sent=msg_by_operator.get(row.operator_id, 0),
        ))

    return OperatorsReportResponse(operators=operators)


# ---------------------------------------------------------------------------
# GET /followers
# ---------------------------------------------------------------------------

@router.get("/followers", response_model=FollowersReportResponse)
async def report_followers(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    period: str = Query("daily", pattern="^(daily|weekly|monthly)$"),
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    start, end = _parse_dates(start_date, end_date)

    total_followers = (await db.execute(
        select(func.count(User.id)).where(
            User.line_user_id.isnot(None),
            User.friend_status == "ACTIVE",
        )
    )).scalar() or 0

    # Events in period
    base_filter = [
        FriendEvent.created_at >= start,
        FriendEvent.created_at < end,
    ]

    new_count = (await db.execute(
        select(func.count(FriendEvent.id)).where(
            FriendEvent.event_type == FriendEventType.FOLLOW.value,
            *base_filter,
        )
    )).scalar() or 0

    lost_count = (await db.execute(
        select(func.count(FriendEvent.id)).where(
            FriendEvent.event_type == FriendEventType.UNFOLLOW.value,
            *base_filter,
        )
    )).scalar() or 0

    refollow_count = (await db.execute(
        select(func.count(FriendEvent.id)).where(
            FriendEvent.event_type == FriendEventType.REFOLLOW.value,
            *base_filter,
        )
    )).scalar() or 0

    net = new_count + refollow_count - lost_count
    total_follows = new_count + refollow_count
    refollow_rate = (refollow_count / total_follows * 100) if total_follows else 0.0

    # Over time
    date_bucket = _bucket_expression(FriendEvent.created_at, period)

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
        .group_by(date_bucket)
        .order_by(date_bucket)
    )
    rows = (await db.execute(time_q)).all()
    over_time = [
        {"period": _format_bucket(period_start, period), "gained": g, "lost": l}
        for period_start, g, l in rows
    ]

    return FollowersReportResponse(
        total_followers=total_followers,
        new_this_period=new_count,
        lost_this_period=lost_count,
        refollow_this_period=refollow_count,
        net_growth=net,
        refollow_rate=round(refollow_rate, 1),
        over_time=over_time,
    )


# ---------------------------------------------------------------------------
# GET /export  (CSV)
# ---------------------------------------------------------------------------

@router.get("/export")
async def export_report(
    type: str = Query(..., pattern="^(service-requests|messages|operators|followers)$"),
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    start, end = _parse_dates(start_date, end_date)
    buf = io.StringIO()
    writer = csv.writer(buf)

    if type == "service-requests":
        writer.writerow(["ID", "Status", "Category", "Subcategory", "Requester", "Created", "Completed"])
        q = select(ServiceRequest).where(
            ServiceRequest.created_at >= start,
            ServiceRequest.created_at < end,
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
            Message.created_at >= start,
            Message.created_at < end,
        ).order_by(Message.created_at.desc()).limit(10000)
        rows = (await db.execute(q)).scalars().all()
        for r in rows:
            writer.writerow([
                r.id,
                r.line_user_id or "",
                r.direction.value if r.direction else "",
                r.message_type or "",
                r.sender_role.value if r.sender_role else "",
                str(r.created_at) if r.created_at else "",
            ])

    elif type == "operators":
        # report_operators expects str params, convert datetime back to ISO strings
        report = await report_operators(
            start_date=start.isoformat() if start else None,
            end_date=end.isoformat() if end else None,
            db=db,
            current_admin=current_admin,
        )
        writer.writerow(["OperatorID", "Name", "SessionsHandled", "AvgResponseSec", "MessagesSent"])
        for op in report.operators:
            writer.writerow([op.operator_id, op.operator_name, op.sessions_handled, op.avg_response_seconds, op.messages_sent])

    elif type == "followers":
        writer.writerow(["ID", "LineUserID", "EventType", "Created"])
        q = select(FriendEvent).where(
            FriendEvent.created_at >= start,
            FriendEvent.created_at < end,
        ).order_by(FriendEvent.created_at.desc())
        rows = (await db.execute(q)).scalars().all()
        for r in rows:
            writer.writerow([r.id, r.line_user_id, r.event_type, str(r.created_at)])

    buf.seek(0)
    inclusive_end = end - timedelta(microseconds=1)
    filename = f"report-{type}-{start.strftime('%Y%m%d')}-{inclusive_end.strftime('%Y%m%d')}.csv"
    return StreamingResponse(
        buf,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


# ---------------------------------------------------------------------------
# GET /export/pdf
# ---------------------------------------------------------------------------

@router.get("/export/pdf")
async def export_report_pdf(
    report_type: str = Query(
        ...,
        pattern="^(overview|service-requests|messages|operators|followers)$",
        description="Report type: overview, service-requests, messages, operators, followers",
    ),
    period: int = Query(30, ge=1, le=90),
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    """Export report as PDF with Content-Disposition for direct download."""
    from app.services.pdf_report_service import PDFReportService

    end_dt = datetime.now(timezone.utc)
    start_dt = end_dt - timedelta(days=period)
    start_iso = start_dt.isoformat()
    end_iso = end_dt.isoformat()

    # Gather data by calling existing report endpoint functions internally
    if report_type == "overview":
        report = await report_overview(db=db, current_admin=current_admin)
        data = report.model_dump()

    elif report_type == "service-requests":
        report = await report_service_requests(
            start_date=start_iso,
            end_date=end_iso,
            period="daily",
            db=db,
            current_admin=current_admin,
        )
        data = report.model_dump()

    elif report_type == "messages":
        report = await report_messages(
            start_date=start_iso,
            end_date=end_iso,
            period="daily",
            db=db,
            current_admin=current_admin,
        )
        data = report.model_dump()

    elif report_type == "operators":
        report = await report_operators(
            start_date=start_iso,
            end_date=end_iso,
            db=db,
            current_admin=current_admin,
        )
        data = report.model_dump()

    elif report_type == "followers":
        report = await report_followers(
            start_date=start_iso,
            end_date=end_iso,
            period="daily",
            db=db,
            current_admin=current_admin,
        )
        data = report.model_dump()

    else:
        raise HTTPException(status_code=400, detail=f"Unsupported report type: {report_type}")

    service = PDFReportService()
    pdf_buffer = service.generate(report_type, data, period)

    filename = f"report_{report_type}_{datetime.now(timezone.utc).strftime('%Y%m%d')}.pdf"
    return StreamingResponse(
        pdf_buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
