"""User-initiated commands: status check and phone binding."""
import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.service_request import ServiceRequest
from app.services.flex_messages import build_booking_list, build_request_status_list

from ._deps import get_line_service

logger = logging.getLogger(__name__)

# Text a citizen might send to ask about their appointment. Matched on the whole
# message (like "ติดตาม"/"สถานะ" above) rather than as a substring, so an
# ordinary sentence mentioning a queue still falls through to intent matching.
BOOKING_QUERY_KEYWORDS = frozenset({"คิว", "คิวของฉัน", "นัดหมาย", "จองคิว", "ดูคิว"})


async def handle_check_booking(line_user_id: str, reply_token: str, db: AsyncSession):
    """Reply with the citizen's own bookings as a Flex bubble."""
    line_svc = get_line_service()
    try:
        from app.services.booking_service import list_user_bookings
        from app.services.user_identity_service import resolve_by_line_id

        user = await resolve_by_line_id(db, line_user_id)
        bookings = await list_user_bookings(db, user.id) if user else []

        flex_content = build_booking_list(bookings)
        await line_svc.reply_flex(reply_token, "คิวนัดหมายของคุณ", flex_content)
    except Exception as e:
        logger.error(f"Error checking bookings for {line_user_id}: {e}")
        await line_svc.reply_text(reply_token, "ขออภัย ไม่สามารถดึงข้อมูลคิวนัดหมายได้ในขณะนี้")


async def handle_check_status(line_user_id: str, reply_token: str, db: AsyncSession):
    """Fetch latest 5 requests and reply with Flex Message or ask for Phone."""
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
                "เพื่อค้นหาและเชื่อมโยงข้อมูลครับ"
            )
            await line_svc.reply_text(reply_token, msg)
            return

        flex_content = build_request_status_list(requests)
        await line_svc.reply_flex(reply_token, "สถานะคำร้องของคุณ", flex_content)

    except Exception as e:
        logger.error(f"Error checking status for {line_user_id}: {e}")
        await line_svc.reply_text(reply_token, "ขออภัย ไม่สามารถดึงข้อมูลสถานะได้ในขณะนี้")


async def handle_bind_phone(phone_number: str, line_user_id: str, reply_token: str, db: AsyncSession):
    """Search by phone, bind LINE ID, and show status."""
    line_svc = get_line_service()
    try:
        from app.services.user_identity_service import resolve_by_line_id

        resolved_user = await resolve_by_line_id(db, line_user_id)
        user_id = resolved_user.id if resolved_user else None

        stmt = select(ServiceRequest).where(ServiceRequest.phone_number == phone_number)
        result = await db.execute(stmt)
        requests = result.scalars().all()

        if not requests:
            await line_svc.reply_text(reply_token, f"❌ ไม่พบข้อมูลคำร้องของเบอร์ {phone_number} ครับ")
            return

        bindable = [r for r in requests if not r.line_user_id or r.line_user_id == line_user_id]
        already_bound_to_others = len(requests) - len(bindable)

        if not bindable:
            await line_svc.reply_text(
                reply_token,
                f"คำร้องเบอร์ {phone_number} ถูกผูกกับบัญชี LINE อื่นแล้วครับ "
                "กรุณาติดต่อเจ้าหน้าที่เพื่อดำเนินการ"
            )
            return

        for req in bindable:
            req.line_user_id = line_user_id
            if user_id is not None:
                req.user_id = user_id
        await db.flush()

        if already_bound_to_others > 0:
            logger.warning(
                f"Phone bind: {already_bound_to_others} requests for {phone_number} "
                f"already bound to other LINE users, skipped"
            )

        stmt_latest = (
            select(ServiceRequest)
            .where(ServiceRequest.line_user_id == line_user_id)
            .order_by(ServiceRequest.created_at.desc())
            .limit(5)
        )
        result_latest = await db.execute(stmt_latest)
        latest_requests = result_latest.scalars().all()

        flex_content = build_request_status_list(latest_requests)
        await line_svc.reply_flex(reply_token, "สถานะคำร้องของคุณ", flex_content)

    except Exception as e:
        logger.error(f"Error binding phone {phone_number}: {e}")
        await line_svc.reply_text(reply_token, "ขออภัย เกิดข้อผิดพลาดในการเชื่อมโยงข้อมูล")
