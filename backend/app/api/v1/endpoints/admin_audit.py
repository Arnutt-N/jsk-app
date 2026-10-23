"""Admin audit log API endpoints."""
from datetime import UTC, date, datetime, timedelta

from app.api.deps import get_db, require_permission
from app.core.permissions import KEY_VIEW_AUDIT_LOG
from app.models.audit_log import AuditLog
from app.models.user import User
from fastapi import APIRouter, Depends, Query
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter()


class _Window:
    """Half-open UTC window (start, end] for audit queries."""
    def __init__(self, start: datetime, end: datetime):
        self.start = start
        self.end = end


def resolve_window(start_date: date | None, end_date: date | None, days: int) -> _Window:
    """Explicit YYYY-MM-DD range wins; otherwise fall back to last-N-days."""
    end = (
        datetime(end_date.year, end_date.month, end_date.day, 23, 59, 59, tzinfo=UTC)
        if end_date else datetime.now(UTC)
    )
    start = (
        datetime(start_date.year, start_date.month, start_date.day, tzinfo=UTC)
        if start_date else end - timedelta(days=days)
    )
    return _Window(start, end)


@router.get("/logs")
async def get_audit_logs(
    admin_id: int | None = Query(None, description="Filter by admin ID"),
    action: str | None = Query(None, description="Filter by action type"),
    resource_type: str | None = Query(None, description="Filter by resource type"),
    resource_id: str | None = Query(None, description="Filter by resource ID"),
    # le=3650: timeline หน้า request detail ต้องเห็นประวัติแก้ไขทั้งหมด ไม่ใช่แค่ 90 วัน
    days: int = Query(7, ge=1, le=3650, description="Number of days to look back (default 7)"),
    start_date: date | None = Query(None, description="Range start (YYYY-MM-DD); overrides days"),
    end_date: date | None = Query(None, description="Range end inclusive (YYYY-MM-DD); overrides days"),
    limit: int = Query(50, ge=1, le=500, description="Number of logs to return"),
    offset: int = Query(0, ge=0, description="Pagination offset"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission(KEY_VIEW_AUDIT_LOG))
):
    """
    Get audit logs with filtering and pagination.

    Returns:
        - total: Total matching logs
        - logs: List of audit log entries
        - limit: Applied limit
        - offset: Applied offset
    """
    window = resolve_window(start_date, end_date, days)

    # Build query
    query = select(AuditLog).where(AuditLog.created_at > window.start, AuditLog.created_at <= window.end)

    if admin_id:
        query = query.where(AuditLog.admin_id == admin_id)

    if action:
        query = query.where(AuditLog.action == action)

    if resource_type:
        query = query.where(AuditLog.resource_type == resource_type)

    if resource_id:
        query = query.where(AuditLog.resource_id == resource_id)

    # Count total
    count_query = query.with_only_columns(func.count())
    total = await db.scalar(count_query)

    # Get logs with admin info
    query = query.order_by(desc(AuditLog.created_at)).offset(offset).limit(limit)
    result = await db.execute(query)
    logs = result.scalars().all()

    # Enrich with admin names — single batched query (avoids N+1 per log row)
    admin_ids = {log.admin_id for log in logs if log.admin_id}
    user_map: dict = {}
    if admin_ids:
        users_result = await db.execute(select(User).where(User.id.in_(admin_ids)))
        user_map = {u.id: u.display_name for u in users_result.scalars().all()}

    enriched_logs = []
    for log in logs:
        admin_name = None
        if log.admin_id:
            admin_name = user_map.get(log.admin_id) or f"Admin {log.admin_id}"

        enriched_logs.append({
            "id": log.id,
            "admin_id": log.admin_id,
            "admin_name": admin_name,
            "action": log.action,
            "resource_type": log.resource_type,
            "resource_id": log.resource_id,
            "details": log.details,
            "ip_address": log.ip_address,
            "user_agent": log.user_agent,
            "created_at": log.created_at.isoformat() if log.created_at else None
        })

    return {
        "total": total,
        "logs": enriched_logs,
        "limit": limit,
        "offset": offset
    }


@router.get("/stats")
async def get_audit_stats(
    days: int = Query(7, ge=1, le=90, description="Number of days to look back"),
    start_date: date | None = Query(None, description="Range start (YYYY-MM-DD); overrides days"),
    end_date: date | None = Query(None, description="Range end inclusive (YYYY-MM-DD); overrides days"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission(KEY_VIEW_AUDIT_LOG))
):
    """
    Get audit log statistics.

    Returns:
        - total_actions: Total actions logged
        - action_breakdown: Counts by action type
        - resource_breakdown: Counts by resource type
    """
    window = resolve_window(start_date, end_date, days)

    # Total actions
    total = await db.scalar(
        select(func.count())
        .where(AuditLog.created_at > window.start, AuditLog.created_at <= window.end)
    )

    # Action breakdown
    action_result = await db.execute(
        select(AuditLog.action, func.count())
        .where(AuditLog.created_at > window.start, AuditLog.created_at <= window.end)
        .group_by(AuditLog.action)
    )
    action_breakdown = {row.action: row.count for row in action_result.all()}

    # Resource breakdown
    resource_result = await db.execute(
        select(AuditLog.resource_type, func.count())
        .where(AuditLog.created_at > window.start, AuditLog.created_at <= window.end)
        .group_by(AuditLog.resource_type)
    )
    resource_breakdown = {row.resource_type: row.count for row in resource_result.all()}

    return {
        "total_actions": total,
        "action_breakdown": action_breakdown,
        "resource_breakdown": resource_breakdown,
        "period_days": days
    }
