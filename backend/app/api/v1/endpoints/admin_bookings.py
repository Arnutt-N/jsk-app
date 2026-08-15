"""Admin endpoints: work the day's appointments and configure the feature.

Reading and marking appointments is counter work, so it is open to staff.
Changing the configuration — which services are bookable, capacity, whether
reminders go out at all — is an administrator action and is audit-logged.
"""
import logging
from datetime import date as date_type
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Path, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_admin, get_current_staff
from app.core.audit import create_audit_log
from app.db.session import get_db
from app.models.booking import Booking, BookingStatus
from app.schemas.booking import BookingOut, BookingSettingsIn, BookingSettingsOut
from app.services.booking_service import BookingConfig
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

    stmt = (
        stmt.order_by(Booking.booking_date.asc(), Booking.booking_time.asc())
        .limit(limit)
        .offset(offset)
    )
    result = await db.execute(stmt)
    return [BookingOut.model_validate(b) for b in result.scalars().all()]


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
