from datetime import datetime, time, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import HTTPException

from app.api.v1.endpoints import admin_bookings
from app.models.booking import BookingStatus
from app.services import booking_service
from app.services.delivery_outcome import DeliveryOutcome


def _booking(status=BookingStatus.CONFIRMED):
    return SimpleNamespace(
        id=7,
        booking_date=(datetime.now(timezone.utc) + timedelta(days=1)).date(),
        booking_time=time(10, 0),
        status=status,
        queue_number="Q7",
        user=SimpleNamespace(id=1),
    )


@pytest.mark.asyncio
async def test_cancelled_after_claim_does_not_reach_provider():
    token = datetime.now(timezone.utc)
    db = AsyncMock()
    with (
        patch.object(admin_bookings, "load_booking_config", new=AsyncMock(
            return_value=SimpleNamespace(resend_enabled=True, email_enabled=False, line_enabled=True))),
        patch.object(booking_service, "load_booking_for_reminder", new=AsyncMock(
            side_effect=[_booking(), None])) as reload_booking,
        patch.object(booking_service, "claim_reminder_for_staff", new=AsyncMock(return_value=token)),
        patch.object(booking_service, "clear_reminder_claim", new=AsyncMock()) as clear,
        patch.object(admin_bookings, "send_booking_reminder_outcome", new=AsyncMock()) as send,
    ):
        with pytest.raises(HTTPException) as exc:
            await admin_bookings.resend_booking_reminder(booking_id=7, db=db, staff=SimpleNamespace(id=1))

    assert exc.value.status_code == 409
    send.assert_not_awaited()
    clear.assert_awaited_once()
    assert reload_booking.await_args_list[-1].args[2] is token


@pytest.mark.asyncio
async def test_lost_lease_after_provider_is_reported_as_conflict():
    token = datetime.now(timezone.utc)
    db = AsyncMock()
    with (
        patch.object(admin_bookings, "load_booking_config", new=AsyncMock(
            return_value=SimpleNamespace(resend_enabled=True, email_enabled=False, line_enabled=True))),
        patch.object(booking_service, "load_booking_for_reminder", new=AsyncMock(
            side_effect=[_booking(), _booking()])),
        patch.object(booking_service, "claim_reminder_for_staff", new=AsyncMock(return_value=token)),
        patch.object(admin_bookings, "send_booking_reminder_outcome", new=AsyncMock(
            return_value=DeliveryOutcome.SENT)),
        patch.object(admin_bookings, "clear_reminder_outcome", new=AsyncMock(return_value=False)),
    ):
        with pytest.raises(HTTPException) as exc:
            await admin_bookings.resend_booking_reminder(booking_id=7, db=db, staff=SimpleNamespace(id=1))

    assert exc.value.status_code == 409
