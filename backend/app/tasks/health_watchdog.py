"""Background watchdog that turns the pull-only /health checks into alerts.

Periodically probes the same components as the health endpoints (database,
Redis) and pushes a Telegram alert on state transitions: healthy -> DOWN
(breach) and DOWN -> healthy (recovery). While a component stays down, alerts
repeat only after HEALTH_ALERT_COOLDOWN_SECONDS so a long outage does not
flood the operator chat.

Telegram delivery reuses telegram_service (same channel as SLA breaches) and
is gated by HEALTH_ALERT_TELEGRAM_ENABLED; the watchdog always logs.
"""
import asyncio
import logging
import time
from dataclasses import dataclass, field
from typing import Dict, List, Optional

from sqlalchemy import text

from app.core.config import settings
from app.core.redis_client import redis_client
from app.db.session import AsyncSessionLocal
from app.services.telegram_service import telegram_service

logger = logging.getLogger(__name__)


@dataclass
class _ComponentState:
    is_healthy: bool = True
    last_alert_at: float = 0.0


@dataclass
class HealthWatchdog:
    """State machine deciding when component health changes warrant an alert."""

    alert_cooldown_seconds: int = 900
    _states: Dict[str, _ComponentState] = field(default_factory=dict)

    def evaluate(self, components: Dict[str, bool], now: Optional[float] = None) -> List[str]:
        """Compare current component health to tracked state; return alert texts."""
        if now is None:
            now = time.time()

        alerts: List[str] = []
        for name, is_healthy in components.items():
            state = self._states.setdefault(name, _ComponentState())

            if is_healthy and not state.is_healthy:
                alerts.append(f"[HEALTH] {name} RECOVERED")
                state.is_healthy = True
                state.last_alert_at = 0.0
            elif not is_healthy:
                went_down = state.is_healthy
                cooldown_elapsed = (now - state.last_alert_at) >= self.alert_cooldown_seconds
                if went_down or cooldown_elapsed:
                    alerts.append(f"[HEALTH] {name} DOWN")
                    state.last_alert_at = now
                state.is_healthy = False

        return alerts

    async def check_components(self) -> Dict[str, bool]:
        """Probe the same components as the /health endpoint."""
        db_ok = False
        try:
            async with AsyncSessionLocal() as db:
                await db.execute(text("SELECT 1"))
            db_ok = True
        except Exception as e:
            logger.error(f"Health watchdog: database check failed: {e}")

        redis_ok = False
        try:
            redis_ok = bool(redis_client.is_connected)
        except Exception as e:
            logger.error(f"Health watchdog: redis check failed: {e}")

        return {"database": db_ok, "redis": redis_ok}

    async def run_once(self) -> None:
        """One probe + alert cycle."""
        components = await self.check_components()
        alerts = self.evaluate(components)
        if not alerts:
            return

        message = "\n".join(alerts)
        logger.warning("Health watchdog alerts:\n%s", message)

        if not settings.HEALTH_ALERT_TELEGRAM_ENABLED:
            return
        try:
            async with AsyncSessionLocal() as db:
                await telegram_service.send_alert_message(text=message, db=db)
        except Exception as e:
            # Alerting must never take the app down with it.
            logger.error(f"Health watchdog: failed to send Telegram alert: {e}")


health_watchdog = HealthWatchdog(
    alert_cooldown_seconds=settings.HEALTH_ALERT_COOLDOWN_SECONDS,
)

_watchdog_task: Optional[asyncio.Task] = None


async def _watch_loop() -> None:
    logger.info("Health watchdog task started")
    while True:
        await asyncio.sleep(settings.HEALTH_CHECK_INTERVAL_SECONDS)
        try:
            await health_watchdog.run_once()
        except Exception as e:
            logger.error(f"Health watchdog cycle error: {e}")


async def start_health_watchdog() -> None:
    """Start the health watchdog background task."""
    global _watchdog_task
    if not settings.HEALTH_WATCHDOG_ENABLED:
        logger.info("Health watchdog disabled (HEALTH_WATCHDOG_ENABLED=false)")
        return
    _watchdog_task = asyncio.create_task(_watch_loop())
    logger.info("Health watchdog background task started")


async def stop_health_watchdog() -> None:
    """Cancel and await the health watchdog background task."""
    global _watchdog_task
    if _watchdog_task and not _watchdog_task.done():
        _watchdog_task.cancel()
        try:
            await _watchdog_task
        except asyncio.CancelledError:
            pass
        logger.info("Health watchdog background task stopped")
    _watchdog_task = None
