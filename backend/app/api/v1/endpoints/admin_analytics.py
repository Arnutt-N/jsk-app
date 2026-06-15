"""Admin analytics API endpoints."""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional

from app.api.deps import get_db, get_current_admin, require_permission
from app.core.permissions import KEY_VIEW_REPORTS
from app.models.user import User
from app.services.analytics_service import analytics_service

router = APIRouter()


@router.get("/live-kpis")
async def get_live_kpis(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission(KEY_VIEW_REPORTS))
):
    """
    Get real-time KPIs for the dashboard.
    
    Returns:
        - waiting: Number of users waiting
        - active: Number of active sessions
        - avg_first_response_seconds: Average FRT
        - avg_resolution_seconds: Average resolution time
        - csat_average: Average CSAT score
        - csat_percentage: CSAT as percentage
        - fcr_rate: First Contact Resolution rate
        - sla_breach_events_24h: Total SLA breach events in last 24 hours
        - sessions_today: Sessions created today
        - human_mode_users: Users in HUMAN mode
    """
    return await analytics_service.get_live_kpis(db)


@router.get("/operator-performance")
async def get_operator_performance(
    operator_id: Optional[int] = Query(None, description="Filter by operator ID"),
    days: int = Query(7, ge=1, le=30, description="Number of days to look back"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission(KEY_VIEW_REPORTS))
):
    """
    Get operator performance metrics.
    
    Returns list of operators with their session counts,
    average first response time, and resolution time.
    """
    return await analytics_service.get_operator_performance(db, operator_id, days)


@router.get("/hourly-stats")
async def get_hourly_stats(
    hours: int = Query(24, ge=1, le=168, description="Number of hours to look back"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission(KEY_VIEW_REPORTS))
):
    """
    Get hourly message stats for charting.
    
    Returns message counts per hour for the specified period.
    """
    return await analytics_service.get_hourly_stats(db, hours)


@router.get("/dashboard")
async def get_dashboard(
    days: int = Query(7, ge=1, le=30, description="Number of days to look back"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission(KEY_VIEW_REPORTS)),
):
    """Get aggregated dashboard payload including trends, funnel, heatmap and percentiles."""
    return await analytics_service.get_dashboard(db, days)
