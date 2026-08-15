"""Admin booking endpoints: status transitions, audit trail, and settings validation."""
from datetime import date, time
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from app.api.v1.endpoints import admin_bookings
from app.models.booking import Booking, BookingStatus
from app.schemas.booking import BookingSettingsIn
from app.services.booking_service import ReminderUnit


def _booking(status=BookingStatus.CONFIRMED):
    return SimpleNamespace(
        id=10,
        user_id=1,
        service_type="ปรึกษากฎหมาย",
        booking_date=date(2026, 8, 19),
        booking_time=time(9, 0),
        queue_number="260819-001",
        status=status,
        contact_name="สมชาย ใจดี",
        phone_number="0812345678",
        note=None,
        cancelled_at=None,
    )


def _settings_payload(**overrides):
    defaults = dict(
        enabled=True,
        service_types=["ปรึกษากฎหมาย"],
        slot_minutes=30,
        slot_capacity=3,
        advance_days=14,
        blackout_dates=[date(2026, 12, 5)],
        reminder_enabled=True,
        reminder_lead_value=1,
        reminder_lead_unit=ReminderUnit.DAY,
    )
    defaults.update(overrides)
    return defaults


# --- status transitions ---


@pytest.mark.asyncio
async def test_confirmed_cannot_be_set_from_the_admin_screen():
    """Un-cancelling would silently re-take a seat someone else may now hold."""
    with pytest.raises(HTTPException) as exc:
        await admin_bookings.update_booking_status(
            status=BookingStatus.CONFIRMED,
            booking_id=10,
            db=AsyncMock(),
            staff=SimpleNamespace(id=2),
        )
    assert exc.value.status_code == 400


@pytest.mark.asyncio
async def test_missing_booking_returns_404():
    db = AsyncMock()
    db.get = AsyncMock(return_value=None)
    with pytest.raises(HTTPException) as exc:
        await admin_bookings.update_booking_status(
            status=BookingStatus.COMPLETED, booking_id=10, db=db, staff=SimpleNamespace(id=2)
        )
    assert exc.value.status_code == 404


@pytest.mark.parametrize(
    "status", [BookingStatus.COMPLETED, BookingStatus.NOSHOW, BookingStatus.CANCELLED]
)
@pytest.mark.asyncio
async def test_a_status_change_is_audit_logged_with_both_ends(status):
    booking = _booking()
    db = AsyncMock()
    db.get = AsyncMock(return_value=booking)

    with patch.object(admin_bookings, "create_audit_log", new=AsyncMock()) as audit:
        await admin_bookings.update_booking_status(
            status=status, booking_id=10, db=db, staff=SimpleNamespace(id=2)
        )

    assert booking.status == status
    kwargs = audit.await_args.kwargs
    assert kwargs["action"] == "update_booking_status"
    assert kwargs["resource_type"] == "booking"
    assert kwargs["resource_id"] == "10"
    assert kwargs["admin_id"] == 2
    assert kwargs["details"] == {"from": "CONFIRMED", "to": status.value}
    db.commit.assert_awaited()


@pytest.mark.asyncio
async def test_cancelling_from_admin_stamps_cancelled_at():
    booking = _booking()
    db = AsyncMock()
    db.get = AsyncMock(return_value=booking)

    with patch.object(admin_bookings, "create_audit_log", new=AsyncMock()):
        await admin_bookings.update_booking_status(
            status=BookingStatus.CANCELLED, booking_id=10, db=db, staff=SimpleNamespace(id=2)
        )

    assert booking.cancelled_at is not None


# --- settings validation (the schema is the guard) ---


def test_valid_settings_round_trip():
    payload = BookingSettingsIn(**_settings_payload())
    assert payload.reminder_lead_unit is ReminderUnit.DAY
    assert payload.service_types == ["ปรึกษากฎหมาย"]


@pytest.mark.parametrize(
    "field,value",
    [
        ("slot_minutes", 0),
        ("slot_minutes", 1000),
        ("slot_capacity", -1),
        ("advance_days", -1),
        ("advance_days", 400),
        ("reminder_lead_value", 0),
    ],
)
def test_out_of_range_settings_are_rejected(field, value):
    with pytest.raises(ValidationError):
        BookingSettingsIn(**_settings_payload(**{field: value}))


def test_an_unknown_reminder_unit_is_rejected():
    with pytest.raises(ValidationError):
        BookingSettingsIn(**_settings_payload(reminder_lead_unit="FORTNIGHT"))


def test_duplicate_service_types_are_rejected():
    with pytest.raises(ValidationError):
        BookingSettingsIn(**_settings_payload(service_types=["ปรึกษากฎหมาย", "ปรึกษากฎหมาย"]))


def test_blank_service_types_are_dropped():
    payload = BookingSettingsIn(**_settings_payload(service_types=["ปรึกษากฎหมาย", "  ", ""]))
    assert payload.service_types == ["ปรึกษากฎหมาย"]


# --- settings write ---


@pytest.mark.asyncio
async def test_settings_update_is_persisted_and_audit_logged():
    db = AsyncMock()
    payload = BookingSettingsIn(**_settings_payload(reminder_lead_value=3, reminder_lead_unit=ReminderUnit.HOUR))

    with patch.object(admin_bookings, "save_booking_config", new=AsyncMock()) as save, \
         patch.object(admin_bookings, "create_audit_log", new=AsyncMock()) as audit:
        result = await admin_bookings.update_booking_settings(
            payload, db=db, admin=SimpleNamespace(id=5)
        )

    saved_config = save.await_args.args[1]
    assert saved_config.reminder_lead_value == 3
    assert saved_config.reminder_lead_unit is ReminderUnit.HOUR
    assert saved_config.blackout_dates == frozenset({date(2026, 12, 5)})

    kwargs = audit.await_args.kwargs
    assert kwargs["action"] == "update_booking_settings"
    assert kwargs["details"]["reminder_lead"] == "3 HOUR"
    assert result.reminder_lead_value == 3
    db.commit.assert_awaited()


# --- list ordering ---


@pytest.mark.asyncio
async def test_list_orders_soonest_first():
    """The counter must see tomorrow's bookings before today's — a far-future
    appointment disappearing from the top of the list is how staff convinced
    themselves 'nobody has booked yet'."""
    from unittest.mock import MagicMock
    from sqlalchemy.dialects import postgresql

    db = AsyncMock()
    result = MagicMock()  # scalars().all() is sync in the endpoint
    result.scalars.return_value.all.return_value = []
    db.execute.return_value = result

    await admin_bookings.list_bookings(
        db=db, _staff=SimpleNamespace(id=1), limit=100, offset=0
    )

    stmt = db.execute.call_args.args[0]
    sql = str(stmt.compile(dialect=postgresql.dialect()))
    assert "bookings.booking_date ASC" in sql
    assert "bookings.booking_time ASC" in sql
    assert "DESC" not in sql
