"""Health check endpoints for monitoring."""
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

from app.api.deps import get_db, get_current_admin
from app.core.websocket_health import ws_health_monitor
from app.core.websocket_manager import ws_manager
from app.core.redis_client import redis_client
from app.core.pseudonym_gate import get_gate_status
from app.models.user import User

router = APIRouter()

logger = logging.getLogger(__name__)


@router.get("/health")
async def health_check(db: AsyncSession = Depends(get_db)):
    """
    Basic health check endpoint.
    
    Returns 200 OK if all services are healthy.
    """
    checks = {
        "database": False,
        "redis": False,
        "status": "unhealthy"
    }
    
    # Check database
    try:
        await db.execute(text("SELECT 1"))
        checks["database"] = True
    except Exception:
        logger.exception("health database check failed")

    # Check Redis
    try:
        if redis_client.is_connected:
            checks["redis"] = True
    except Exception:
        logger.exception("health redis check failed")
    
    # Determine overall status
    if checks["database"] and checks["redis"]:
        checks["status"] = "healthy"
    elif checks["database"]:
        checks["status"] = "degraded"

    return checks


@router.get("/health/pseudonym-gate")
async def pseudonym_gate_status(
    _current_admin: User = Depends(get_current_admin),
):
    """PR C gate observability — admin-only.

    Reports the `line_id_plaintext_fallback_hit` counter so operators can verify
    the gate (zero hits for 3-5 consecutive days in dual mode) without reading
    Koyeb logs directly. See `app/core/pseudonym_gate.py` for the counter design.
    """
    return await get_gate_status()


@router.get("/health/websocket")
async def websocket_health(
    _current_admin: User = Depends(get_current_admin),
):
    """
    WebSocket-specific health check.
    
    Returns detailed metrics about WebSocket connections and health.
    """
    health = await ws_health_monitor.get_health_status()
    
    # Add connection manager stats
    health["connection_stats"] = ws_manager.get_stats()
    
    return health


@router.get("/health/detailed")
async def detailed_health(
    db: AsyncSession = Depends(get_db),
    _current_admin: User = Depends(get_current_admin),
):
    """
    Detailed health check with all metrics.
    
    Returns comprehensive health information for all services.
    """
    checks = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "status": "healthy",
        "services": {}
    }
    
    # Database check
    try:
        start = __import__('time').time()
        await db.execute(text("SELECT 1"))
        db_latency = (__import__('time').time() - start) * 1000
        checks["services"]["database"] = {
            "status": "healthy",
            "latency_ms": round(db_latency, 2)
        }
    except Exception:
        logger.exception("health detailed database check failed")
        checks["services"]["database"] = {
            "status": "unhealthy"
        }
        checks["status"] = "unhealthy"
    
    # Redis check
    try:
        if redis_client.is_connected:
            checks["services"]["redis"] = {
                "status": "healthy",
                "connected": True
            }
        else:
            checks["services"]["redis"] = {
                "status": "unhealthy",
                "connected": False
            }
            if checks["status"] == "healthy":
                checks["status"] = "degraded"
    except Exception:
        logger.exception("health detailed redis check failed")
        checks["services"]["redis"] = {
            "status": "unhealthy"
        }
        if checks["status"] == "healthy":
            checks["status"] = "degraded"
    
    # WebSocket check
    try:
        ws_health = await ws_health_monitor.get_health_status()
        checks["services"]["websocket"] = ws_health
        if ws_health["status"] != "healthy" and checks["status"] == "healthy":
            checks["status"] = "degraded"
    except Exception:
        logger.exception("health detailed websocket check failed")
        checks["services"]["websocket"] = {
            "status": "unhealthy"
        }
        if checks["status"] == "healthy":
            checks["status"] = "degraded"
    
    return checks
