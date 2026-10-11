"""User-initiated commands: status check and phone binding."""
import logging
from functools import partial

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.service_request import ServiceRequest
from app.services.flex_messages import build_booking_list, build_request_status_list
from app.services.outbox import Outbox, drain_outbox

from ._deps import get_line_service
from app.core.logging_utils import mask_line_id, mask_phone

logger = logging.getLogger(__name__)

# Text a citizen might send to ask about their appointment. Matched on the whole
# message (like "ติดตาม"/"สถานะ" above) rather than as a substring, so an
# ordinary sentence mentioning a queue still falls through to intent matching.
BOOKING_QUERY_KEYWORDS = frozenset({"คิว", "คิวของฉัน", "นัดหมาย", "จองคิว", "ดูคิว"})

async def handle_check_booking(
    line_user_id: str, reply_token: str, db: AsyncSession, outbox: Outbox | None = None
):
    """Reply with the citizen's own bookings as a Flex bubble."""
    box = outbox if outbox is not None else []
    line_svc = get_line_service()
    try:
        from app.services.booking_service import list_user_bookings
        from app.services.user_identity_service import resolve_by_line_id

        user = await resolve_by_line_id(db, line_user_id)
        bookings = await list_user_bookings(db, user.id) if user else []

        flex_content = build_booking_list(bookings)
        box.append(partial(line_svc.reply_flex, reply_token, "คิวนัดหมายของคุณ", flex_content))
    except Exception as e:
        logger.error(f"Error checking bookings for {mask_line_id(line_user_id)}: {e}")
        box.append(partial(line_svc.reply_text, reply_token, "ขออภัย ไม่สามารถดึงข้อมูลคิวนัดหมายได้ในขณะนี้"))
    if outbox is None:
        await drain_outbox(box)


async def handle_check_status(
    line_user_id: str, reply_token: str, db: AsyncSession, outbox: Outbox | None = None
):
    """Fetch latest 5 requests and reply with Flex Message or ask for Phone."""
    box = outbox if outbox is not None else []
    line_svc = get_line_service()
    try:
        from app.services.user_identity_service import resolve_by_line_id, child_filter

        resolved_user = await resolve_by_line_id(db, line_user_id)
        user_id = resolved_user.id if resolved_user else None

        stmt = (
            select(ServiceRequest)
            .where(child_filter(ServiceRequest, line_user_id, user_id))
            .order_by(ServiceRequest.created_at.desc())
            .limit(5)
        )
        result = await db.execute(stmt)
        requests = result.scalars().all()

        if not requests:
            msg = (
                "⚠️ ไม่พบประวัติคำร้องที่ผูกกับ LINE ของคุณ\n\n"
                "หากท่านเคยยื่นเรื่องไว้ กรุณาพิมพ์ **เบอร์โทรศัพท์** (10 หลัก) "
                "เพื่อค้นหา หรือติดต่อเจ้าหน้าที่เพื่อยืนยันรับเรื่องครับ"
            )
            box.append(partial(line_svc.reply_text, reply_token, msg))
            if outbox is None:
                await drain_outbox(box)
            return

        flex_content = build_request_status_list(requests)
        box.append(partial(line_svc.reply_flex, reply_token, "สถานะคำร้องของคุณ", flex_content))

    except Exception as e:
        logger.error(f"Error checking status for {mask_line_id(line_user_id)}: {e}")
        box.append(partial(line_svc.reply_text, reply_token, "ขออภัย ไม่สามารถดึงข้อมูลสถานะได้ในขณะนี้"))
    if outbox is None:
        await drain_outbox(box)


async def handle_bind_phone(
    phone_number: str, line_user_id: str, reply_token: str, db: AsyncSession, outbox: Outbox | None = None
):
    """Reply with masked presence (found/not-found, no exact count); never auto-bind.

    Self-service claiming by phone number let anyone bind strangers' unbound
    requests to their own LINE account, so this handler only confirms
    presence and directs the citizen to staff for verified linking.
    """
    box = outbox if outbox is not None else []
    line_svc = get_line_service()
    try:
        from app.services.user_identity_service import resolve_by_line_id

        resolved_user = await resolve_by_line_id(db, line_user_id)
        user_id = resolved_user.id if resolved_user else None

        if user_id is None:
            logger.warning(f"Phone bind: ไม่พบผู้ใช้สำหรับ LINE ID {mask_line_id(line_user_id)}")
            box.append(partial(line_svc.reply_text, reply_token, "ขออภัย ไม่พบข้อมูลผู้ใช้ของคุณ กรุณาลองใหม่อีกครั้ง"))
            if outbox is None:
                await drain_outbox(box)
            return

        result = await db.execute(
            select(func.count(ServiceRequest.id)).where(ServiceRequest.phone_number == phone_number)
        )
        count = result.scalar() or 0

        logger.info(
            f"Phone claim attempt for {mask_phone(phone_number)} "
            f"by {mask_line_id(line_user_id)}: {count} requests found, no auto-bind"
        )

        if count == 0:
            box.append(partial(line_svc.reply_text, reply_token, "❌ ไม่พบข้อมูลคำร้องของเบอร์ที่ระบุครับ"))
        else:
            # Presence only, no exact count: the count let anyone probe how
            # many cases a phone number has (enumeration oracle).
            box.append(partial(
                line_svc.reply_text,
                reply_token,
                "พบคำร้องที่ใช้เบอร์นี้ กรุณาติดต่อเจ้าหน้าที่เพื่อยืนยันรับเรื่อง",
            ))

    except Exception as e:
        logger.error(f"Error binding phone {mask_phone(phone_number)}: {e}")
        box.append(partial(line_svc.reply_text, reply_token, "ขออภัย เกิดข้อผิดพลาดในการเชื่อมโยงข้อมูล"))
    if outbox is None:
        await drain_outbox(box)
