"""Public (LIFF) appointment booking endpoints.

Unlike the older `/liff/service-requests` route, the LIFF ID token is required
here unconditionally — there are no legacy clients to keep working, and every
route either writes a booking or reads one citizen's own data, so an unverified
caller has nothing legitimate to do. The verified `sub` claim is the only source
of identity; nothing in the request body is trusted to say who the caller is.
"""
import logging
from datetime import date as date_type
from typing import List, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Path, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.http_rate_limit import http_rate_limit
from app.db.session import get_db
from app.models.booking import Booking
from app.schemas.booking import (
    AvailabilityOut,
    BookingCreate,
    BookingOptionsOut,
    BookingOut,
    SlotOut,
)
from app.services import booking_service
from app.services.booking_notifications import (
    notify_booking_confirmed,
    notify_staff_new_booking,
)
from app.services.booking_service import (
    BookingNotCancellableError,
    DuplicateBookingError,
    SlotFullError,
    SlotUnavailableError,
    UnknownServiceTypeError,
)
from app.services.booking_settings import load_booking_config
from app.services.friend_service import friend_service
from app.services.user_identity_service import resolve_by_line_id
from app.api.v1.endpoints.liff import verify_liff_token

logger = logging.getLogger(__name__)

router = APIRouter()

_submit_rate_limit = Depends(
    http_rate_limit(
        "liff-booking",
        max_events=settings.LIFF_SUBMIT_RATE_LIMIT,
        window_seconds=settings.LIFF_SUBMIT_RATE_WINDOW,
    )
)


async def require_line_user_id(x_liff_id_token: Optional[str] = Header(None)) -> str:
    """Verified LINE user id, or 401. Identity never comes from the body."""
    if not x_liff_id_token:
        raise HTTPException(status_code=401, detail="LIFF ID token required")
    return await verify_liff_token(x_liff_id_token)


async def _require_booking_enabled(db: AsyncSession):
    config = await load_booking_config(db)
    if not config.enabled:
        raise HTTPException(status_code=503, detail="ระบบจองคิวยังไม่เปิดให้บริการ")
    return config


@router.get(
    "/options",
    response_model=BookingOptionsOut,
    summary="Bookable services and the date window",
)
async def get_booking_options(
    db: AsyncSession = Depends(get_db),
    _line_user_id: str = Depends(require_line_user_id),
):
    config = await _require_booking_enabled(db)
    return BookingOptionsOut(
        service_types=list(config.service_types),
        advance_days=config.advance_days,
        blackout_dates=sorted(config.blackout_dates),
    )


@router.get(
    "/availability",
    response_model=AvailabilityOut,
    summary="List bookable slots for a service on a date",
)
async def get_availability(
    service_type: str = Query(min_length=1, max_length=200),
    target_date: date_type = Query(alias="date"),
    db: AsyncSession = Depends(get_db),
    _line_user_id: str = Depends(require_line_user_id),
):
    config = await _require_booking_enabled(db)
    try:
        slots = await booking_service.get_availability(
            db, service_type=service_type, target_date=target_date, config=config
        )
    except UnknownServiceTypeError:
        raise HTTPException(status_code=404, detail="ไม่พบบริการที่เลือก")

    return AvailabilityOut(
        service_type=service_type,
        date=target_date,
        slots=[
            SlotOut(
                time=slot.start,
                capacity=slot.capacity,
                booked=slot.booked,
                remaining=slot.remaining,
                is_full=slot.is_full,
            )
            for slot in slots
        ],
    )


@router.post(
    "",
    response_model=BookingOut,
    status_code=201,
    summary="Book an appointment slot",
    dependencies=[_submit_rate_limit],
)
async def create_booking(
    payload: BookingCreate,
    db: AsyncSession = Depends(get_db),
    line_user_id: str = Depends(require_line_user_id),
):
    config = await _require_booking_enabled(db)
    user = await friend_service.get_or_create_user(line_user_id, db, commit=False)
    day_hours = await booking_service.load_day_hours(db, payload.booking_date.weekday())

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
            config=config,
            day_hours=day_hours,
        )
    except UnknownServiceTypeError:
        raise HTTPException(status_code=404, detail="ไม่พบบริการที่เลือก")
    except SlotUnavailableError:
        raise HTTPException(status_code=400, detail="ช่วงเวลาที่เลือกไม่เปิดให้จอง")
    except SlotFullError:
        raise HTTPException(status_code=409, detail="ช่วงเวลานี้เต็มแล้ว กรุณาเลือกเวลาอื่น")
    except DuplicateBookingError:
        raise HTTPException(status_code=409, detail="ท่านจองช่วงเวลานี้ไว้แล้ว")

    # Commit first: the booking is the durable outcome, and notifications are
    # best-effort. Sending before the commit would risk telling a citizen their
    # appointment is confirmed when the transaction later fails.
    await db.commit()
    await db.refresh(booking)

    await notify_booking_confirmed(db, booking, user)
    await notify_staff_new_booking(db, booking)

    return BookingOut.model_validate(booking)


@router.get(
    "/me",
    response_model=List[BookingOut],
    summary="List my bookings",
)
async def list_my_bookings(
    db: AsyncSession = Depends(get_db),
    line_user_id: str = Depends(require_line_user_id),
):
    user = await resolve_by_line_id(db, line_user_id)
    if user is None:
        return []
    bookings = await booking_service.list_user_bookings(db, user.id)
    return [BookingOut.model_validate(b) for b in bookings]


@router.post(
    "/{booking_id}/cancel",
    response_model=BookingOut,
    summary="Cancel my booking",
    dependencies=[_submit_rate_limit],
)
async def cancel_my_booking(
    booking_id: int = Path(ge=1),
    db: AsyncSession = Depends(get_db),
    line_user_id: str = Depends(require_line_user_id),
):
    user = await resolve_by_line_id(db, line_user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="ไม่พบการจอง")

    booking = await db.get(Booking, booking_id)
    # Same 404 for "does not exist" and "belongs to someone else": a different
    # status would let a caller probe which booking ids are real.
    if booking is None or booking.user_id != user.id:
        raise HTTPException(status_code=404, detail="ไม่พบการจอง")

    try:
        await booking_service.cancel_booking(db, booking)
    except BookingNotCancellableError:
        raise HTTPException(status_code=409, detail="การจองนี้ยกเลิกไม่ได้แล้ว")

    await db.commit()
    await db.refresh(booking)
    return BookingOut.model_validate(booking)
