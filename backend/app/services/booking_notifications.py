"""Outbound notifications for bookings: LINE to the citizen, Telegram to staff.

Every function here is best-effort and returns a bool rather than raising. A
booking that is already CONFIRMED in the database must not be rolled back
because LINE happened to be unreachable — but a failure is never swallowed
silently either; it is logged at ERROR so the existing alerting picks it up.
"""
import logging
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.booking import Booking
from app.services.flex_messages import build_booking_confirmation
from app.services.line_service import line_service, resolve_raw_for_push
from app.services.telegram_service import telegram_service

logger = logging.getLogger(__name__)


def _describe(booking: Booking) -> str:
    return (
        f"{booking.queue_number or '-'} · {booking.service_type or '-'} · "
        f"{booking.booking_date} {booking.booking_time}"
    )


async def _push_flex(db: AsyncSession, user, alt_text: str, contents: dict) -> bool:
    """Resolve the push target from the user record and send one Flex bubble.

    The LINE id is resolved through the user relationship rather than stored on
    the booking, so this keeps working when storage flips to pseudonym mode.
    """
    raw_line_id = await resolve_raw_for_push(db, user)
    if not raw_line_id:
        logger.warning("No LINE id resolvable for user %s; skipping push", getattr(user, "id", "?"))
        return False

    await line_service.push_messages(
        raw_line_id,
        [{"type": "flex", "altText": alt_text, "contents": contents}],
    )
    return True


async def notify_booking_confirmed(db: AsyncSession, booking: Booking, user) -> bool:
    """Confirmation bubble to the citizen. Never raises."""
    try:
        return await _push_flex(
            db,
            user,
            alt_text=f"จองคิวสำเร็จ {booking.queue_number or ''}".strip(),
            contents=build_booking_confirmation(booking),
        )
    except Exception as exc:
        logger.error("Booking confirmation push failed for %s: %s", _describe(booking), exc)
        return False


async def send_booking_reminder(db: AsyncSession, booking: Booking, user) -> bool:
    """Advance-reminder bubble to the citizen. Never raises."""
    try:
        return await _push_flex(
            db,
            user,
            alt_text=f"เตือนนัดหมาย {booking.queue_number or ''}".strip(),
            contents=build_booking_confirmation(booking, title="🔔 เตือนนัดหมาย"),
        )
    except Exception as exc:
        logger.error("Booking reminder push failed for %s: %s", _describe(booking), exc)
        return False


async def notify_staff_new_booking(
    db: AsyncSession, booking: Booking, contact_name: Optional[str] = None
) -> bool:
    """Telegram alert so staff see the day filling up. Never raises."""
    try:
        text = (
            "📅 มีการจองคิวใหม่\n"
            f"คิว: {booking.queue_number or '-'}\n"
            f"บริการ: {booking.service_type or '-'}\n"
            f"วันเวลา: {booking.booking_date} {booking.booking_time}\n"
            f"ผู้จอง: {contact_name or booking.contact_name or '-'}\n"
            f"โทร: {booking.phone_number or '-'}"
        )
        return await telegram_service.send_alert_message(text, db)
    except Exception as exc:
        logger.error("Telegram alert failed for booking %s: %s", _describe(booking), exc)
        return False
