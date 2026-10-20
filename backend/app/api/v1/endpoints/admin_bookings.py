"""Admin endpoints: work the day's appointments and configure the feature.

Reading and marking appointments is counter work, so it is open to staff.
Changing the configuration — which services are bookable, capacity, whether
reminders go out at all — is an administrator action and is audit-logged.
"""
import logging
from datetime import date as date_type
from datetime import datetime, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Path, Query
from sqlalchemy import func, or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_admin, get_current_staff
from app.core.audit import create_audit_log
from app.core.query_utils import escape_ilike
from app.db.session import get_db
from app.models.booking import Booking, BookingStatus
from app.models.user import User, UserRole
from app.schemas.booking import (
    AvailabilityOut,
    AvailabilityRangeOut,
    BookingAssignIn,
    BookingCreate,
    BookingOut,
    BookingSettingsIn,
    BookingSettingsOut,
    BookingUpdateIn,
    DayAvailabilityOut,
    SlotOut,
)
from app.core.permissions import can_assign, can_self_assign
from app.services import booking_service
from app.services.booking_notifications import (
    notify_booking_confirmed,
    notify_staff_new_booking,
    send_booking_reminder,
)
from app.services.booking_service import (
    BookingConfig,
    BookingNotCancellableError,
    BookingWindowError,
    DuplicateBookingError,
    MAX_AVAILABILITY_RANGE_DAYS,
    SlotFullError,
    SlotUnavailableError,
    UnknownServiceTypeError,
)
from app.services.booking_settings import load_booking_config, save_booking_config

logger = logging.getLogger(__name__)

router = APIRouter()

# Terminal states an operator can set from the counter. CONFIRMED is absent on
# purpose: un-cancelling would silently re-take a seat someone else may now hold.
SETTABLE_STATUSES = {
    BookingStatus.COMPLETED,
    BookingStatus.NOSHOW,
    BookingStatus.CANCELLED,
}


@router.get("", response_model=List[BookingOut], summary="List bookings")
async def list_bookings(
    booking_date: Optional[date_type] = Query(default=None, alias="date"),
    status: Optional[BookingStatus] = Query(default=None),
    service_type: Optional[str] = Query(default=None, max_length=200),
    search: Optional[str] = Query(default=None, alias="q", max_length=120,
                                   description="Search by name, phone, or queue number"),
    unassigned_only: bool = Query(default=False, description="Only bookings with no assignee"),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
    _staff=Depends(get_current_staff),
):
    stmt = select(Booking)
    if booking_date is not None:
        stmt = stmt.where(Booking.booking_date == booking_date)
    if status is not None:
        stmt = stmt.where(Booking.status == status)
    if service_type:
        stmt = stmt.where(Booking.service_type == service_type)
    if search:
        # Same wildcard escaping as the requests list: a literal % or _ in a
        # phone number must not turn into a wildcard.
        escaped = escape_ilike(search)
        stmt = stmt.where(
            (Booking.contact_name.ilike(f"%{escaped}%", escape="\\")) |
            (Booking.phone_number.ilike(f"%{escaped}%", escape="\\")) |
            (Booking.queue_number.ilike(f"%{escaped}%", escape="\\"))
        )

    if unassigned_only:
        stmt = stmt.where(Booking.assigned_staff_id.is_(None))

    stmt = (
        stmt.order_by(Booking.booking_date.asc(), Booking.booking_time.asc(), Booking.id.asc())
        .limit(limit)
        .offset(offset)
    )
    result = await db.execute(stmt)
    return [BookingOut.model_validate(b) for b in result.scalars().all()]


@router.get(
    "/availability",
    response_model=AvailabilityOut,
    summary="Slots for one service on one day (counter)",
)
async def counter_availability(
    service_type: str = Query(max_length=200),
    booking_date: date_type = Query(alias="date"),
    db: AsyncSession = Depends(get_db),
    _staff=Depends(get_current_staff),
):
    """Same engine as the LIFF strip, minus the LINE token requirement."""
    config = await load_booking_config(db, fresh=True)
    try:
        slots = await booking_service.get_availability(
            db, service_type=service_type, target_date=booking_date, config=config
        )
    except UnknownServiceTypeError:
        raise HTTPException(status_code=404, detail="ไม่พบบริการที่เลือก")
    return AvailabilityOut(
        service_type=service_type,
        date=booking_date,
        slots=[
            SlotOut(
                time=s.start,
                capacity=s.capacity,
                booked=s.booked,
                remaining=s.remaining,
                is_full=s.is_full,
            )
            for s in slots
        ],
    )


@router.get(
    "/availability/range",
    response_model=AvailabilityRangeOut,
    summary="Open/full status per day across a window (counter)",
)
async def counter_availability_range(
    service_type: str = Query(max_length=200),
    range_start: date_type = Query(alias="from"),
    range_end: date_type = Query(alias="to"),
    db: AsyncSession = Depends(get_db),
    _staff=Depends(get_current_staff),
):
    config = await load_booking_config(db, fresh=True)
    if not config.calendar_enabled:
        raise HTTPException(status_code=403, detail="ปิดมุมมองปฏิทินไว้ในการตั้งค่า")
    if range_start > range_end:
        raise HTTPException(status_code=422, detail="ช่วงวันที่ไม่ถูกต้อง")
    if (range_end - range_start).days > MAX_AVAILABILITY_RANGE_DAYS:
        raise HTTPException(status_code=422, detail="ช่วงวันที่ยาวเกินไป")
    try:
        days = await booking_service.get_availability_range(
            db,
            service_type=service_type,
            start_date=range_start,
            end_date=range_end,
            config=config,
        )
    except UnknownServiceTypeError:
        raise HTTPException(status_code=404, detail="ไม่พบบริการที่เลือก")
    return AvailabilityRangeOut(
        service_type=service_type,
        days=[DayAvailabilityOut.model_validate(day) for day in days],
    )


async def _find_by_idempotency_key(db: AsyncSession, key: str) -> Booking | None:
    result = await db.execute(select(Booking).where(Booking.idempotency_key == key))
    return result.scalar_one_or_none()


@router.post(
    "",
    response_model=BookingOut,
    status_code=201,
    summary="Create a walk-in booking at the counter",
)
async def create_walkin_booking(
    payload: BookingCreate,
    db: AsyncSession = Depends(get_db),
    staff=Depends(get_current_staff),
):
    """Counter staff book on behalf of a citizen standing in front of them.

    Deliberately bypasses the public master switch: the counter works even
    when online booking is closed. Slot rules (service, window, capacity,
    no-duplicate) still apply — the seat accounting stays sound. Each
    walk-in gets its own bare User row (no LINE identity), so the
    per-user duplicate guard can never false-fire across strangers, and
    confirmations go by email when one is on file (there is no LINE identity
    to push to); staff still get the Telegram alert.
    """
    config = await load_booking_config(db, fresh=True)
    if not config.walkin_enabled:
        raise HTTPException(status_code=403, detail="ปิดรับคิวนอกไว้ในการตั้งค่า")
    if payload.email and not config.email_enabled:
        raise HTTPException(status_code=422, detail="ปิดรับอีเมลไว้ในการตั้งค่า")

    day_hours = await booking_service.load_day_hours(db, payload.booking_date.weekday())

    if payload.idempotency_key:
        found = await _find_by_idempotency_key(db, payload.idempotency_key)
        if found is not None:
            return BookingOut.model_validate(found)

    user = User(display_name=payload.contact_name or "ผู้มาติดต่อ")
    db.add(user)
    await db.flush()

    try:
        booking = await booking_service.create_booking(
            db,
            user_id=user.id,
            service_type=payload.service_type,
            booking_date=payload.booking_date,
            booking_time=payload.booking_time,
            contact_name=payload.contact_name,
            phone_number=payload.phone_number,
            note=payload.note,
            email=payload.email,
            idempotency_key=payload.idempotency_key,
            config=config,
            day_hours=day_hours,
        )
    except UnknownServiceTypeError:
        raise HTTPException(status_code=404, detail="ไม่พบบริการที่เลือก")
    except BookingWindowError as exc:
        raise HTTPException(
            status_code=422,
            detail=f"จองล่วงหน้าได้ไม่เกิน {exc.args[0]} วัน กรุณาเลือกวันใหม่",
        )
    except SlotUnavailableError:
        raise HTTPException(status_code=400, detail="ช่วงเวลาที่เลือกไม่เปิดให้จอง")
    except SlotFullError:
        raise HTTPException(status_code=409, detail="ช่วงเวลานี้เต็มแล้ว กรุณาเลือกเวลาอื่น")
    except DuplicateBookingError:
        raise HTTPException(status_code=409, detail="ช่วงเวลานี้ถูกจองแล้ว")
    except IntegrityError:
        await db.rollback()
        if payload.idempotency_key:
            # Deliberately any integrity failure, not only the key: a counter
            # double-submit must replay-or-retry, never mint a second row.
            found = await _find_by_idempotency_key(db, payload.idempotency_key)
            if found is not None:
                return BookingOut.model_validate(found)
        raise HTTPException(status_code=409, detail="บันทึกล้มเหลว กรุณารีเฟรชแล้วลองใหม่")

    await db.commit()
    await db.refresh(booking)

    await notify_booking_confirmed(db, booking, user)
    await notify_staff_new_booking(db, booking)

    await create_audit_log(
        db=db,
        admin_id=staff.id,
        action="create_booking_walkin",
        resource_type="booking",
        resource_id=str(booking.id),
        details={
            "service_type": booking.service_type,
            "date": booking.booking_date.isoformat(),
            "time": booking.booking_time.isoformat(),
            "queue_number": booking.queue_number,
        },
    )
    await db.commit()
    await db.refresh(booking)
    return BookingOut.model_validate(booking)


@router.patch(
    "/{booking_id}/contact",
    response_model=BookingOut,
    summary="Edit a booking's contact details",
)
async def update_booking_contact_info(
    payload: BookingUpdateIn,
    booking_id: int = Path(ge=1),
    db: AsyncSession = Depends(get_db),
    staff=Depends(get_current_staff),
):
    """Fix a typo in the name or phone number without cancelling the seat."""
    config = await load_booking_config(db, fresh=True)
    if not config.walkin_enabled:
        raise HTTPException(status_code=403, detail="ปิดการจัดการคิวนอกไว้ในการตั้งค่า")
    if payload.email and not config.email_enabled:
        raise HTTPException(status_code=422, detail="ปิดรับอีเมลไว้ในการตั้งค่า")

    booking = await db.get(Booking, booking_id)
    if booking is None:
        raise HTTPException(status_code=404, detail="ไม่พบการจอง")

    try:
        await booking_service.update_booking_contact(
            db,
            booking,
            contact_name=payload.contact_name,
            phone_number=payload.phone_number,
            note=payload.note,
            email=payload.email,
        )
    except BookingNotCancellableError:
        raise HTTPException(
            status_code=409,
            detail="การจองนี้เลยเวลาแก้ไขแล้ว (รองรับเฉพาะคิวที่ยืนยันและยังไม่ถึงเวลา)",
        )

    await create_audit_log(
        db=db,
        admin_id=staff.id,
        action="update_booking_contact",
        resource_type="booking",
        resource_id=str(booking_id),
        details={
            "contact_name": payload.contact_name,
            "phone_number": payload.phone_number,
            "note": payload.note,
            "email": payload.email,
        },
    )
    await db.commit()
    await db.refresh(booking)
    return BookingOut.model_validate(booking)


RESEND_COOLDOWN_SECONDS = 60


@router.post(
    "/{booking_id}/remind",
    response_model=BookingOut,
    summary="Resend the advance reminder for one booking",
)
async def resend_booking_reminder(
    booking_id: int = Path(ge=1),
    db: AsyncSession = Depends(get_db),
    staff=Depends(get_current_staff),
):
    config = await load_booking_config(db, fresh=True)
    if not config.resend_enabled:
        raise HTTPException(status_code=403, detail="ปิดการส่งเตือนซ้ำไว้ในการตั้งค่า")

    booking = await booking_service.load_booking_for_reminder(db, booking_id)
    if booking is None:
        raise HTTPException(status_code=404, detail="ไม่พบการจอง")
    if booking.status != BookingStatus.CONFIRMED:
        raise HTTPException(status_code=409, detail="ส่งเตือนซ้ำได้เฉพาะคิวที่ยืนยันแล้ว")
    appointment_at = datetime.combine(booking.booking_date, booking.booking_time)
    if appointment_at <= booking_service.local_now():
        raise HTTPException(status_code=409, detail="คิวเลยเวลาแล้ว ส่งเตือนไม่ได้")

    claimed = await db.execute(
        update(Booking)
        .where(Booking.id == booking_id)
        .where(
            or_(
                Booking.reminder_sent_at.is_(None),
                Booking.reminder_sent_at
                < func.now() - timedelta(seconds=RESEND_COOLDOWN_SECONDS),
            )
        )
        .values(reminder_sent_at=func.now())
    )
    if claimed.rowcount == 0:
        raise HTTPException(
            status_code=429, detail="เพิ่งส่งเตือนไป กรุณารอครู่แล้วลองใหม่"
        )

    sent = await send_booking_reminder(db, booking, booking.user)
    if not sent:
        await db.rollback()
        raise HTTPException(
            status_code=502, detail="ส่งเตือนไม่สำเร็จ กรุณาลองใหม่"
        )

    await create_audit_log(
        db=db,
        admin_id=staff.id,
        action="resend_booking_reminder",
        resource_type="booking",
        resource_id=str(booking_id),
        details={"queue_number": booking.queue_number},
    )
    await db.commit()
    await db.refresh(booking)
    return BookingOut.model_validate(booking)


@router.patch(
    "/{booking_id}/status",
    response_model=BookingOut,
    summary="Mark a booking completed, no-show, or cancelled",
)
async def update_booking_status(
    status: BookingStatus,
    booking_id: int = Path(ge=1),
    db: AsyncSession = Depends(get_db),
    staff=Depends(get_current_staff),
):
    if status not in SETTABLE_STATUSES:
        raise HTTPException(status_code=400, detail="สถานะนี้ตั้งค่าจากหน้าจัดการไม่ได้")

    booking = await db.get(Booking, booking_id)
    if booking is None:
        raise HTTPException(status_code=404, detail="ไม่พบการจอง")

    previous = booking.status
    # A terminal booking cannot be moved back to another state — the seat may
    # already have been re-taken by someone else.
    if previous in SETTABLE_STATUSES and status != previous:
        raise HTTPException(
            status_code=409,
            detail="คิวนี้จบสถานะแล้ว เปลี่ยนย้อนกลับไม่ได้",
        )
    booking.status = status
    if status == BookingStatus.CANCELLED and booking.cancelled_at is None:
        from sqlalchemy import func

        booking.cancelled_at = func.now()

    await create_audit_log(
        db=db,
        admin_id=staff.id,
        action="update_booking_status",
        resource_type="booking",
        resource_id=str(booking_id),
        details={
            "from": getattr(previous, "value", str(previous)),
            "to": status.value,
        },
    )
    await db.commit()
    await db.refresh(booking)
    return BookingOut.model_validate(booking)


@router.patch(
    "/{booking_id}/assignment",
    response_model=BookingOut,
    summary="Assign a booking to a staff member",
)
async def assign_booking_staff(
    payload: BookingAssignIn,
    booking_id: int = Path(ge=1),
    db: AsyncSession = Depends(get_db),
    staff=Depends(get_current_staff),
):
    config = await load_booking_config(db, fresh=True)
    if not config.assign_enabled:
        raise HTTPException(status_code=403, detail="ปิดการมอบหมายคิวไว้ในการตั้งค่า")

    booking = await db.get(Booking, booking_id)
    if booking is None:
        raise HTTPException(status_code=404, detail="ไม่พบการจอง")

    target_id = payload.assigned_staff_id
    if target_id == booking.assigned_staff_id:
        return BookingOut.model_validate(booking)

    if target_id is None:
        if booking.assigned_staff_id == staff.id:
            if not (can_assign(staff.role) or can_self_assign(staff.role)):
                raise HTTPException(status_code=403, detail="คุณไม่มีสิทธิ์ถอนการมอบหมายงาน")
        elif not can_assign(staff.role):
            raise HTTPException(status_code=403, detail="คุณไม่มีสิทธิ์ถอนการมอบหมายงาน")
    elif target_id == staff.id:
        if not can_self_assign(staff.role):
            raise HTTPException(
                status_code=403, detail="คุณไม่มีสิทธิ์รับคิวด้วยตนเอง"
            )
    else:
        if not can_assign(staff.role):
            raise HTTPException(status_code=403, detail="คุณไม่มีสิทธิ์มอบหมายงานให้ผู้อื่น")
        target = await db.get(User, target_id)
        if target is None:
            raise HTTPException(status_code=404, detail="ไม่พบเจ้าหน้าที่")
        if target.role == UserRole.USER or not target.is_active:
            raise HTTPException(status_code=422, detail="เจ้าหน้าที่ที่เลือกไม่สามารถรับมอบหมายได้")

    previous = booking.assigned_staff_id
    booking.assigned_staff_id = target_id
    await create_audit_log(
        db=db,
        admin_id=staff.id,
        action="assign_booking",
        resource_type="booking",
        resource_id=str(booking_id),
        details={"from": previous, "to": target_id},
    )
    await db.commit()
    await db.refresh(booking)
    return BookingOut.model_validate(booking)


@router.get(
    "/settings",
    response_model=BookingSettingsOut,
    summary="Read booking configuration",
)
async def get_booking_settings(
    db: AsyncSession = Depends(get_db),
    _staff=Depends(get_current_staff),
):
    config = await load_booking_config(db)
    return BookingSettingsOut(
        enabled=config.enabled,
        service_types=list(config.service_types),
        slot_minutes=config.slot_minutes,
        slot_capacity=config.slot_capacity,
        advance_days=config.advance_days,
        blackout_dates=sorted(config.blackout_dates),
        reminder_enabled=config.reminder_enabled,
        reminder_lead_value=config.reminder_lead_value,
        reminder_lead_unit=config.reminder_lead_unit,
        walkin_enabled=config.walkin_enabled,
        calendar_enabled=config.calendar_enabled,
        resend_enabled=config.resend_enabled,
        assign_enabled=config.assign_enabled,
        email_enabled=config.email_enabled,
    )


@router.put(
    "/settings",
    response_model=BookingSettingsOut,
    summary="Update booking configuration",
)
async def update_booking_settings(
    payload: BookingSettingsIn,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_admin),
):
    config = BookingConfig(
        enabled=payload.enabled,
        service_types=tuple(payload.service_types),
        slot_minutes=payload.slot_minutes,
        slot_capacity=payload.slot_capacity,
        advance_days=payload.advance_days,
        blackout_dates=frozenset(payload.blackout_dates),
        reminder_enabled=payload.reminder_enabled,
        reminder_lead_value=payload.reminder_lead_value,
        reminder_lead_unit=payload.reminder_lead_unit,
        walkin_enabled=payload.walkin_enabled,
        calendar_enabled=payload.calendar_enabled,
        resend_enabled=payload.resend_enabled,
        assign_enabled=payload.assign_enabled,
        email_enabled=payload.email_enabled,
    )
    await save_booking_config(db, config)
    await create_audit_log(
        db=db,
        admin_id=admin.id,
        action="update_booking_settings",
        resource_type="booking_settings",
        resource_id=None,
        details={
            "enabled": payload.enabled,
            "reminder_enabled": payload.reminder_enabled,
            "reminder_lead": f"{payload.reminder_lead_value} {payload.reminder_lead_unit.value}",
            "slot_capacity": payload.slot_capacity,
        },
    )
    await db.commit()
    return BookingSettingsOut(**payload.model_dump())
