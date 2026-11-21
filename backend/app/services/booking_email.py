"""smtplib is synchronous, so the network call runs in a worker thread and
never blocks the event loop.
"""
import asyncio
import hashlib
import logging
import smtplib
from email.message import EmailMessage

from app.core.config import settings
from app.services.delivery_outcome import DeliveryOutcome

logger = logging.getLogger(__name__)

_SMTP_TIMEOUT_SECONDS = 10


def _thai_numeric_date(booking) -> str:
    target = booking.booking_date
    return f"{target.day}/{target.month}/{target.year + 543}"


def _booking_line(booking) -> str:
    return (
        f"คิว: {booking.queue_number or '-'}\n"
        f"บริการ: {booking.service_type or '-'}\n"
        f"วันนัด: {_thai_numeric_date(booking)} เวลา {str(booking.booking_time)[:5]} น.\n"
        f"ผู้จอง: {booking.contact_name or '-'}"
    )


def build_confirmation_email(booking) -> tuple[str, str]:
    subject = f"ยืนยันการจองคิว {booking.queue_number or ''}".strip()
    body = (
        "การจองคิวของท่านสำเร็จแล้ว\n\n"
        f"{_booking_line(booking)}\n\n"
        "กรุณามาก่อนเวลานัด 15 นาที\n"
        "ข้อความนี้ส่งอัตโนมัติ กรุณาอย่าตอบกลับ"
    )
    return subject, body


def build_reminder_email(booking) -> tuple[str, str]:
    subject = f"เตือนนัดหมาย {booking.queue_number or ''}".strip()
    body = (
        "แจ้งเตือนนัดหมายที่กำลังจะถึง\n\n"
        f"{_booking_line(booking)}\n\n"
        "กรุณามาก่อนเวลานัด 15 นาที\n"
        "ข้อความนี้ส่งอัตโนมัติ กรุณาอย่าตอบกลับ"
    )
    return subject, body


def _send_sync(to: str, subject: str, body: str, has_submitted: list[bool]) -> None:
    message = EmailMessage()
    message["From"] = settings.SMTP_FROM
    message["To"] = to
    message["Subject"] = subject
    message.set_content(body)
    if settings.SMTP_USE_TLS:
        server = smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=_SMTP_TIMEOUT_SECONDS)
        try:
            server.starttls()
            if settings.SMTP_USERNAME:
                server.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)
            has_submitted[0] = True
            server.send_message(message)
        finally:
            _quit_quietly(server)
    else:
        server = smtplib.SMTP_SSL(settings.SMTP_HOST, settings.SMTP_PORT, timeout=_SMTP_TIMEOUT_SECONDS)
        try:
            if settings.SMTP_USERNAME:
                server.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)
            has_submitted[0] = True
            server.send_message(message)
        finally:
            _quit_quietly(server)


def _quit_quietly(server) -> None:
    try:
        server.quit()
    except Exception as exc:
        logger.debug("SMTP quit failed (teardown noise): %s", exc)


async def send_booking_email(to: str, subject: str, body: str):
    """Return bool for legacy callers, or UNKNOWN for an ambiguous timeout."""
    digest = hashlib.sha256(to.encode("utf-8")).hexdigest()[:12]
    if not settings.SMTP_HOST or not settings.SMTP_FROM:
        logger.error("SMTP not configured; cannot email %s", digest)
        return False
    has_submitted = [False]
    try:
        await asyncio.to_thread(_send_sync, to, subject, body, has_submitted)
    except Exception as exc:
        logger.error("Booking email to %s failed: %s", digest, exc)
        # Once DATA was submitted the server may have accepted the message, so a
        # timeout there is ambiguous rather than a definite decline.
        if isinstance(exc, TimeoutError) or type(exc).__name__ == "SMTPServerDisconnected":
            return DeliveryOutcome.UNKNOWN if has_submitted[0] else False
        return False
    return True
