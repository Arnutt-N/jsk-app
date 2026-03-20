"""Comprehensive reporting endpoints for admin dashboard."""

import csv
import io
from datetime import date, datetime, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import case, cast, func, select, text, Date, Integer
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_admin, get_db
from app.models.chat_session import ChatSession, SessionStatus
from app.models.friend_event import FriendEvent, FriendEventType
from app.models.message import Message, MessageDirection
from app.models.service_request import RequestStatus, ServiceRequest
from app.models.user import User, UserRole

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
    now = datetime.utcnow()
    try:
        end = datetime.fromisoformat(end_date) if end_date else now
    except ValueError:
        raise HTTPException(status_code=422, detail=f"Invalid end_date format: {end_date}")
    try:
        start = datetime.fromisoformat(start_date) if start_date else end - timedelta(days=default_days)
    except ValueError:
        raise HTTPException(status_code=422, detail=f"Invalid start_date format: {start_date}")
    return start, end


# ---------------------------------------------------------------------------
# GET /overview
# ---------------------------------------------------------------------------

@router.get("/overview", response_model=OverviewResponse)
async def report_overview(
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    today = date.today()
    yesterday = today - timedelta(days=1)
    week_ago = today - timedelta(days=7)
    two_weeks_ago = today - timedelta(days=14)

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
            cast(ServiceRequest.created_at, Date) >= week_ago
        )
    )).scalar() or 0
    prev_req = (await db.execute(
        select(func.count(ServiceRequest.id)).where(
            cast(ServiceRequest.created_at, Date) >= two_weeks_ago,
            cast(ServiceRequest.created_at, Date) < week_ago,
        )
    )).scalar() or 0

    # --- messages today ---
    msg_today_q = select(
        func.count(Message.id),
        func.count(Message.id).filter(Message.direction == MessageDirection.INCOMING),
        func.count(Message.id).filter(Message.direction == MessageDirection.OUTGOING),
    ).where(cast(Message.created_at, Date) == today)
    msg_row = (await db.execute(msg_today_q)).one()
    total_msg_today, inc_today, out_today = msg_row

    msg_yesterday = (await db.execute(
        select(func.count(Message.id)).where(cast(Message.created_at, Date) == yesterday)
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
            cast(FriendEvent.created_at, Date) >= week_ago,
        )
    )).scalar() or 0
    new_followers_prev = (await db.execute(
        select(func.count(FriendEvent.id)).where(
            FriendEvent.event_type == FriendEventType.FOLLOW.value,
            cast(FriendEvent.created_at, Date) >= two_weeks_ago,
            cast(FriendEvent.created_at, Date) < week_ago,
        )
    )).scalar() or 0

    # --- active sessions ---
    active_sessions = (await db.execute(
        select(func.count(ChatSession.id)).where(ChatSession.status == SessionStatus.ACTIVE.value)
    )).scalar() or 0

    active_sessions_yesterday = (await db.execute(
        select(func.count(ChatSession.id)).where(
            ChatSession.status == SessionStatus.ACTIVE.value,
            cast(ChatSession.started_at, Date) == yesterday,
        )
    )).scalar() or 0

    # --- daily activity last 7 days ---
    daily_q = (
        select(
            cast(ServiceRequest.created_at, Date).label("day"),
            func.count(ServiceRequest.id).label("requests"),
        )
        .where(cast(ServiceRequest.created_at, Date) >= week_ago)
        .group_by(text("day"))
        .order_by(text("day"))
    )
    daily_rows = (await db.execute(daily_q)).all()
    # messages per day
    msg_daily_q = (
        select(
            cast(Message.created_at, Date).label("day"),
            func.count(Message.id).label("messages"),
        )
        .where(cast(Message.created_at, Date) >= week_ago)
        .group_by(text("day"))
        .order_by(text("day"))
    )
    msg_daily_rows = (await db.execute(msg_daily_q)).all()

    msg_by_day = {str(r.day): r.messages for r in msg_daily_rows}
    daily_activity = []
    for r in daily_rows:
        daily_activity.append({
            "day": str(r.day),
            "requests": r.requests,
            "messages": msg_by_day.get(str(r.day), 0),
        })

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
    period: str = Query("daily", regex="^(daily|weekly|monthly)$"),
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    start, end = _parse_dates(start_date, end_date)

    base = select(ServiceRequest).where(
        ServiceRequest.created_at >= start,
        ServiceRequest.created_at <= end,
    )

    # by status
    status_q = (
        select(ServiceRequest.status, func.count(ServiceRequest.id))
        .where(ServiceRequest.created_at >= start, ServiceRequest.created_at <= end)
        .group_by(ServiceRequest.status)
    )
    by_status = {
        (s.value if s else "PENDING"): c
        for s, c in (await db.execute(status_q)).all()
    }

    # by category
    cat_q = (
        select(ServiceRequest.topic_category, func.count(ServiceRequest.id).label("count"))
        .where(ServiceRequest.created_at >= start, ServiceRequest.created_at <= end)
        .group_by(ServiceRequest.topic_category)
        .order_by(text("count DESC"))
    )
    by_category = [
        {"category": c or "ไม่ระบุ", "count": n}
        for c, n in (await db.execute(cat_q)).all()
    ]

    # over time
    if period == "monthly":
        date_expr = func.to_char(ServiceRequest.created_at, "YYYY-MM")
    elif period == "weekly":
        date_expr = func.to_char(ServiceRequest.created_at, "IYYY-IW")
    else:
        date_expr = func.to_char(ServiceRequest.created_at, "YYYY-MM-DD")

    time_q = (
        select(date_expr.label("period"), func.count(ServiceRequest.id).label("count"))
        .where(ServiceRequest.created_at >= start, ServiceRequest.created_at <= end)
        .group_by(text("period"))
        .order_by(text("period"))
    )
    over_time = [
        {"period": p, "count": c}
        for p, c in (await db.execute(time_q)).all()
    ]

    # avg resolution
    res_q = select(
        func.avg(
            func.extract("epoch", ServiceRequest.completed_at - ServiceRequest.created_at) / 86400
        )
    ).where(
        ServiceRequest.status == RequestStatus.COMPLETED,
        ServiceRequest.created_at >= start,
        ServiceRequest.created_at <= end,
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
    period: str = Query("daily", regex="^(daily|weekly|monthly)$"),
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    start, end = _parse_dates(start_date, end_date)

    if period == "monthly":
        date_expr = func.to_char(Message.created_at, "YYYY-MM")
    elif period == "weekly":
        date_expr = func.to_char(Message.created_at, "IYYY-IW")
    else:
        date_expr = func.to_char(Message.created_at, "YYYY-MM-DD")

    time_q = (
        select(
            date_expr.label("period"),
            func.count(Message.id).filter(Message.direction == MessageDirection.INCOMING).label("incoming"),
            func.count(Message.id).filter(Message.direction == MessageDirection.OUTGOING).label("outgoing"),
        )
        .where(Message.created_at >= start, Message.created_at <= end)
        .group_by(text("period"))
        .order_by(text("period"))
    )
    rows = (await db.execute(time_q)).all()
    over_time = [{"period": p, "incoming": i, "outgoing": o} for p, i, o in rows]

    totals_q = select(
        func.count(Message.id).filter(Message.direction == MessageDirection.INCOMING),
        func.count(Message.id).filter(Message.direction == MessageDirection.OUTGOING),
    ).where(Message.created_at >= start, Message.created_at <= end)
    inc_total, out_total = (await db.execute(totals_q)).one()

    # peak hours
    peak_q = (
        select(
            func.extract("hour", Message.created_at).label("hour"),
            func.count(Message.id).label("count"),
        )
        .where(Message.created_at >= start, Message.created_at <= end)
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
            ChatSession.started_at <= end,
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
                ChatSession.started_at <= end,
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
    period: str = Query("daily", regex="^(daily|weekly|monthly)$"),
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
        FriendEvent.created_at <= end,
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
    if period == "monthly":
        date_expr = func.to_char(FriendEvent.created_at, "YYYY-MM")
    elif period == "weekly":
        date_expr = func.to_char(FriendEvent.created_at, "IYYY-IW")
    else:
        date_expr = func.to_char(FriendEvent.created_at, "YYYY-MM-DD")

    time_q = (
        select(
            date_expr.label("period"),
            func.count(FriendEvent.id).filter(
                FriendEvent.event_type.in_([FriendEventType.FOLLOW.value, FriendEventType.REFOLLOW.value])
            ).label("gained"),
            func.count(FriendEvent.id).filter(
                FriendEvent.event_type == FriendEventType.UNFOLLOW.value
            ).label("lost"),
        )
        .where(*base_filter)
        .group_by(text("period"))
        .order_by(text("period"))
    )
    rows = (await db.execute(time_q)).all()
    over_time = [{"period": p, "gained": g, "lost": l} for p, g, l in rows]

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
    type: str = Query(..., regex="^(service-requests|messages|operators|followers)$"),
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
            ServiceRequest.created_at <= end,
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
            Message.created_at <= end,
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
        report = await report_operators(start_date=start_date, end_date=end_date, db=db, current_admin=current_admin)
        writer.writerow(["OperatorID", "Name", "SessionsHandled", "AvgResponseSec", "MessagesSent"])
        for op in report.operators:
            writer.writerow([op.operator_id, op.operator_name, op.sessions_handled, op.avg_response_seconds, op.messages_sent])

    elif type == "followers":
        writer.writerow(["ID", "LineUserID", "EventType", "Created"])
        q = select(FriendEvent).where(
            FriendEvent.created_at >= start,
            FriendEvent.created_at <= end,
        ).order_by(FriendEvent.created_at.desc())
        rows = (await db.execute(q)).scalars().all()
        for r in rows:
            writer.writerow([r.id, r.line_user_id, r.event_type, str(r.created_at)])

    buf.seek(0)
    filename = f"report-{type}-{start.strftime('%Y%m%d')}-{end.strftime('%Y%m%d')}.csv"
    return StreamingResponse(
        buf,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )
