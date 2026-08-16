"""PATCH /liff/bookings/{id} — a citizen edits their own contact info.

The guard rails mirror cancel_booking: same 404 for "does not exist" and
"belongs to someone else" (so a caller cannot probe which booking ids are
real), and a 409 once the booking is no longer editable (not CONFIRMED, or
the appointment has already started).
"""
from datetime import date, datetime, time
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from app.api.v1.endpoints import liff_bookings
from app.models.booking import Booking, BookingStatus
from app.schemas.booking import BookingUpdateIn


def _booking(status=BookingStatus.CONFIRMED, user_id=7):
    return Booking(
        id=1,
        user_id=user_id,
        service_type="ปรึกษากฎหมาย",
        booking_date=date(2026, 8, 19),
        booking_time=time(9, 0),
        status=status,
    )


def _db_with(booking):
    db = AsyncMock()
    db.get = AsyncMock(return_value=booking)
    return db


def _patch_identity(user_id=7):
    return patch(
        "app.api.v1.endpoints.liff_bookings.resolve_by_line_id",
        new=AsyncMock(return_value=SimpleNamespace(id=user_id)),
    )


def _freeze_now(at: datetime):
    return patch("app.services.booking_service.local_now", return_value=at)


@pytest.mark.asyncio
async def test_update_contact_info_happy_path():
    booking = _booking()
    db = _db_with(booking)

    with _patch_identity(), _freeze_now(datetime(2026, 8, 12, 9, 0)):
        result = await liff_bookings.update_my_booking(
            booking_id=1,
            payload=BookingUpdateIn(contact_name="ชื่อใหม่", note="นัดใหม่"),
            db=db,
            line_user_id="U1",
        )

    assert booking.contact_name == "ชื่อใหม่"
    assert booking.note == "นัดใหม่"
    assert result.contact_name == "ชื่อใหม่"
    db.commit.assert_awaited()


@pytest.mark.asyncio
async def test_update_booking_of_another_user_is_404():
    db = _db_with(_booking(user_id=99))

    with _patch_identity(user_id=7):
        with pytest.raises(HTTPException) as exc:
            await liff_bookings.update_my_booking(
                booking_id=1,
                payload=BookingUpdateIn(contact_name="x"),
                db=db,
                line_user_id="U1",
            )

    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_update_cancelled_booking_is_409():
    db = _db_with(_booking(status=BookingStatus.CANCELLED))

    with _patch_identity():
        with pytest.raises(HTTPException) as exc:
            await liff_bookings.update_my_booking(
                booking_id=1,
                payload=BookingUpdateIn(contact_name="x"),
                db=db,
                line_user_id="U1",
            )

    assert exc.value.status_code == 409


@pytest.mark.asyncio
async def test_update_past_booking_is_409():
    db = _db_with(_booking())

    with _patch_identity(), _freeze_now(datetime(2026, 8, 20, 9, 0)):
        with pytest.raises(HTTPException) as exc:
            await liff_bookings.update_my_booking(
                booking_id=1,
                payload=BookingUpdateIn(contact_name="x"),
                db=db,
                line_user_id="U1",
            )

    assert exc.value.status_code == 409


@pytest.mark.asyncio
async def test_update_unknown_user_is_404():
    db = AsyncMock()

    with _patch_identity(user_id=None):
        with pytest.raises(HTTPException) as exc:
            await liff_bookings.update_my_booking(
                booking_id=1,
                payload=BookingUpdateIn(contact_name="x"),
                db=db,
                line_user_id="U-new",
            )

    assert exc.value.status_code == 404


# --- schema validation (the schema is the guard) ---


def test_phone_number_rejects_non_digits():
    with pytest.raises(ValidationError):
        BookingUpdateIn(phone_number="0812-abc")


def test_phone_number_strips_separators():
    payload = BookingUpdateIn(phone_number="081-234-5678")
    assert payload.phone_number == "0812345678"


def test_blank_contact_name_becomes_none():
    payload = BookingUpdateIn(contact_name="   ")
    assert payload.contact_name is None


def test_update_cannot_change_service_or_time():
    with pytest.raises(ValidationError):
        BookingUpdateIn(service_type="ไกล่เกลี่ยข้อพิพาท")
