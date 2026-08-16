"""SLA monitoring and alert emission for live chat operations."""
from datetime import datetime, timezone
import logging
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.websocket_manager import ws_manager
from app.models.chat_session import ChatSession
from app.schemas.ws_events import WSEventType
from app.services.telegram_service import telegram_service
from app.services.user_identity_service import decrypt_line_id_for_user

logger = logging.getLogger(__name__)


async def _safe_decrypt(db: AsyncSession, user_id: Optional[int]) -> Optional[str]:
    try:
        return await decrypt_line_id_for_user(db, user_id)
    except Exception as e:
        logger.error(f"SLA alert decrypt failed user_id={user_id}: {e}")
        return None


class SLAService:
    """Checks SLA thresholds and broadcasts breaches to operators."""

    async def check_queue_wait_on_claim(self, session: Optional[ChatSession], db: AsyncSession):
        """Check queue wait SLA when a session is claimed."""
        if (
            not session
            or not isinstance(session.started_at, datetime)
            or not isinstance(session.claimed_at, datetime)
        ):
            return
        elapsed = (session.claimed_at - session.started_at).total_seconds()
        await self._maybe_emit_alert(
            metric="queue_wait_seconds",
            value_seconds=elapsed,
            threshold_seconds=settings.SLA_MAX_QUEUE_WAIT_SECONDS,
            line_user_id=await _safe_decrypt(db, session.user_id),
            session_id=session.id,
            db=db,
        )

    async def check_resolution_on_close(self, session: Optional[ChatSession], db: AsyncSession):
        """Check resolution-time SLA when a session is closed."""
        if (
            not session
            or not isinstance(session.started_at, datetime)
            or not isinstance(session.closed_at, datetime)
        ):
            return
        elapsed = (session.closed_at - session.started_at).total_seconds()
        await self._maybe_emit_alert(
            metric="resolution_seconds",
            value_seconds=elapsed,
            threshold_seconds=settings.SLA_MAX_RESOLUTION_SECONDS,
            line_user_id=await _safe_decrypt(db, session.user_id),
            session_id=session.id,
            db=db,
        )

    async def check_frt_on_first_response(self, session: Optional[ChatSession], db: AsyncSession):
        """Check first-response-time SLA when first response is sent."""
        if (
            not session
            or not isinstance(session.claimed_at, datetime)
            or not isinstance(session.first_response_at, datetime)
        ):
            return
        elapsed = (session.first_response_at - session.claimed_at).total_seconds()
        await self._maybe_emit_alert(
            metric="first_response_seconds",
            value_seconds=elapsed,
            threshold_seconds=settings.SLA_MAX_FRT_SECONDS,
            line_user_id=await _safe_decrypt(db, session.user_id),
            session_id=session.id,
            db=db,
        )

    async def _maybe_emit_alert(
        self,
        metric: str,
        value_seconds: float,
        threshold_seconds: int,
        line_user_id: Optional[str],
        session_id: int,
        db: AsyncSession,
    ):
        try:
            value = float(value_seconds)
        except (TypeError, ValueError):
            return

        if value <= threshold_seconds:
            return

        timestamp = datetime.now(timezone.utc).isoformat()
        payload = {
            "metric": metric,
            "value_seconds": round(value, 1),
            "threshold_seconds": threshold_seconds,
            "line_user_id": line_user_id,
            "session_id": session_id,
            "severity": "warning",
            "message": f"SLA breach: {metric} {value:.1f}s > {threshold_seconds}s",
        }

        await ws_manager.broadcast_to_all(
            {
                "type": WSEventType.SLA_ALERT.value,
                "payload": payload,
                "timestamp": timestamp,
            }
        )
        logger.warning(payload["message"])

        if settings.SLA_ALERT_TELEGRAM_ENABLED:
            await telegram_service.send_alert_message(
                text=(
                    f"[SLA] {metric} breach\n"
                    f"user={line_user_id} session={session_id}\n"
                    f"value={value:.1f}s threshold={threshold_seconds}s"
                ),
                db=db,
            )


sla_service = SLAService()

