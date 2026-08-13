"""LIFF booking endpoints: identity, ownership, and error mapping.

The route handlers are plain async functions, so they are called directly here
rather than through TestClient — that keeps the security-relevant behaviour
(token required, ownership enforced, statuses not leaking existence) testable
without Postgres and Redis.
"""
from datetime import date, time
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import HTTPException

from app.api.v1.endpoints import liff_bookings
from app.models.booking import BookingStatus
from app.schemas.booking import BookingCreate
from app.services.booking_service import (
    BookingNotCancellableError,
    DuplicateBookingError,
    SlotFullError,
    SlotUnavailableError,
    UnknownServiceTypeError,
)


def _booking(user_id=1, booking_id=10, status=BookingStatus.CONFIRMED):
    return SimpleNamespace(
        id=booking_id,
        user_id=user_id,
        service_type="ปรึกษากฎหมาย",
        booking_date=date(2026, 8, 19),
        booking_time=time(9, 0),
        queue_number="260819-001",
        status=status,
        contact_name="สมชาย ใจดี",
        phone_number="0812345678",
        note=None,
    )


def _enabled_config():
    return SimpleNamespace(enabled=True, service_types=("ปรึกษากฎหมาย",))


# --- identity ---


@pytest.mark.asyncio
async def test_missing_token_is_rejected():
    with pytest.raises(HTTPException) as exc:
        await liff_bookings.require_line_user_id(x_liff_id_token=None)
    assert exc.value.status_code == 401


@pytest.mark.asyncio
async def test_token_is_verified_against_line_not_trusted_as_given():
    with patch.object(
        liff_bookings, "verify_liff_token", new=AsyncMock(return_value="U-verified")
    ) as mock_verify:
        result = await liff_bookings.require_line_user_id(x_liff_id_token="tok")
    mock_verify.assert_awaited_once_with("tok")
    assert result == "U-verified"


# --- the master switch ---


@pytest.mark.asyncio
async def test_disabled_booking_returns_503():
    disabled = SimpleNamespace(enabled=False, service_types=())
    with patch.object(
        liff_bookings, "load_booking_config", new=AsyncMock(return_value=disabled)
    ):
        with pytest.raises(HTTPException) as exc:
            await liff_bookings._require_booking_enabled(AsyncMock())
    assert exc.value.status_code == 503


# --- error mapping on create ---


@pytest.mark.parametrize(
    "error,expected_status",
    [
        (UnknownServiceTypeError("x"), 404),
        (SlotUnavailableError("x"), 400),
        (SlotFullError("x"), 409),
        (DuplicateBookingError("x"), 409),
    ],
)
@pytest.mark.asyncio
async def test_service_errors_map_to_the_right_http_status(error, expected_status):
    payload = BookingCreate(
        service_type="ปรึกษากฎหมาย",
        booking_date=date(2026, 8, 19),
        booking_time=time(9, 0),
        contact_name="สมชาย ใจดี",
        phone_number="0812345678",
    )
    db = AsyncMock()

    with patch.object(liff_bookings, "load_booking_config", new=AsyncMock(return_value=_enabled_config())), \
         patch.object(liff_bookings.friend_service, "get_or_create_user", new=AsyncMock(return_value=SimpleNamespace(id=1))), \
         patch.object(liff_bookings.booking_service, "load_day_hours", new=AsyncMock(return_value=None)), \
         patch.object(liff_bookings.booking_service, "create_booking", new=AsyncMock(side_effect=error)):
        with pytest.raises(HTTPException) as exc:
            await liff_bookings.create_booking(payload, db=db, line_user_id="U1")

    assert exc.value.status_code == expected_status
    db.commit.assert_not_awaited()


@pytest.mark.asyncio
async def test_booking_is_committed_before_any_notification_is_sent():
    """Telling a citizen 'confirmed' before the transaction lands would be a lie."""
    order = []
    payload = BookingCreate(
        service_type="ปรึกษากฎหมาย",
        booking_date=date(2026, 8, 19),
        booking_time=time(9, 0),
    )
    db = AsyncMock()
    db.commit = AsyncMock(side_effect=lambda: order.append("commit"))

    with patch.object(liff_bookings, "load_booking_config", new=AsyncMock(return_value=_enabled_config())), \
         patch.object(liff_bookings.friend_service, "get_or_create_user", new=AsyncMock(return_value=SimpleNamespace(id=1))), \
         patch.object(liff_bookings.booking_service, "load_day_hours", new=AsyncMock(return_value=None)), \
         patch.object(liff_bookings.booking_service, "create_booking", new=AsyncMock(return_value=_booking())), \
         patch.object(liff_bookings, "notify_booking_confirmed", new=AsyncMock(side_effect=lambda *a: order.append("notify_user"))), \
         patch.object(liff_bookings, "notify_staff_new_booking", new=AsyncMock(side_effect=lambda *a: order.append("notify_staff"))):
        await liff_bookings.create_booking(payload, db=db, line_user_id="U1")

    assert order == ["commit", "notify_user", "notify_staff"]


# --- ownership ---


@pytest.mark.asyncio
async def test_cancelling_someone_elses_booking_is_a_404_not_a_403():
    """A 403 would confirm the booking id exists; 404 reveals nothing."""
    db = AsyncMock()
    db.get = AsyncMock(return_value=_booking(user_id=999))

    with patch.object(
        liff_bookings, "resolve_by_line_id", new=AsyncMock(return_value=SimpleNamespace(id=1))
    ):
        with pytest.raises(HTTPException) as exc:
            await liff_bookings.cancel_my_booking(booking_id=10, db=db, line_user_id="U1")

    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_cancelling_a_missing_booking_is_a_404():
    db = AsyncMock()
    db.get = AsyncMock(return_value=None)

    with patch.object(
        liff_bookings, "resolve_by_line_id", new=AsyncMock(return_value=SimpleNamespace(id=1))
    ):
        with pytest.raises(HTTPException) as exc:
            await liff_bookings.cancel_my_booking(booking_id=10, db=db, line_user_id="U1")

    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_an_uncancellable_booking_returns_409():
    db = AsyncMock()
    db.get = AsyncMock(return_value=_booking(user_id=1))

    with patch.object(liff_bookings, "resolve_by_line_id", new=AsyncMock(return_value=SimpleNamespace(id=1))), \
         patch.object(liff_bookings.booking_service, "cancel_booking", new=AsyncMock(side_effect=BookingNotCancellableError("x"))):
        with pytest.raises(HTTPException) as exc:
            await liff_bookings.cancel_my_booking(booking_id=10, db=db, line_user_id="U1")

    assert exc.value.status_code == 409


@pytest.mark.asyncio
async def test_listing_bookings_for_an_unknown_user_returns_empty_not_an_error():
    db = AsyncMock()
    with patch.object(liff_bookings, "resolve_by_line_id", new=AsyncMock(return_value=None)):
        result = await liff_bookings.list_my_bookings(db=db, line_user_id="U-never-seen")
    assert result == []
