"""Admin walk-in bookings: counter create, contact edit, counter availability."""
from datetime import date, time
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from app.api.v1.endpoints import admin_bookings
from app.schemas.booking import BookingCreate, BookingSettingsIn
from app.services.booking_service import (
    BookingNotCancellableError,
    ReminderUnit,
    SlotFullError,
    UnknownServiceTypeError,
)


def _config(**overrides):
    values = dict(walkin_enabled=True, calendar_enabled=True, service_types=["ปรึกษากฎหมาย"])
    values.update(overrides)
    return SimpleNamespace(**values)


def _payload(**overrides):
    values = dict(
        service_type="ปรึกษากฎหมาย",
        booking_date=date(2026, 8, 19),
        booking_time=time(9, 0),
        contact_name="สมชาย ใจดี",
        phone_number="0812345678",
        note=None,
    )
    values.update(overrides)
    return BookingCreate(**values)


def _stored_booking(**overrides):
    values = dict(
        id=11,
        service_type="ปรึกษากฎหมาย",
        booking_date=date(2026, 8, 19),
        booking_time=time(9, 0),
        queue_number="260819-002",
        status="CONFIRMED",
        contact_name="สมชาย ใจดี",
        phone_number="0812345678",
        note=None,
    )
    values.update(overrides)
    return SimpleNamespace(**values)


# --- walk-in create ---


@pytest.mark.asyncio
async def test_walkin_disabled_is_rejected_before_touching_the_database():
    db = AsyncMock()
    with patch.object(
        admin_bookings, "load_booking_config", new=AsyncMock(return_value=_config(walkin_enabled=False))
    ):
        with pytest.raises(HTTPException) as exc:
            await admin_bookings.create_walkin_booking(
                _payload(), db=db, staff=SimpleNamespace(id=2)
            )
    assert exc.value.status_code == 403
    db.add.assert_not_called()


@pytest.mark.asyncio
async def test_walkin_creates_a_counter_user_and_notifies_staff():
    db = AsyncMock()
    stored = _stored_booking()
    with patch.object(
        admin_bookings, "load_booking_config", new=AsyncMock(return_value=_config())
    ), patch.object(
        admin_bookings.booking_service, "load_day_hours", new=AsyncMock(return_value=None)
    ), patch.object(
        admin_bookings.booking_service, "create_booking", new=AsyncMock(return_value=stored)
    ) as create, patch.object(
        admin_bookings, "notify_booking_confirmed", new=AsyncMock(return_value=True)
    ) as confirm, patch.object(
        admin_bookings, "notify_staff_new_booking", new=AsyncMock(return_value=True)
    ) as notify, patch.object(
        admin_bookings, "create_audit_log", new=AsyncMock()
    ) as audit:
        result = await admin_bookings.create_walkin_booking(
            _payload(), db=db, staff=SimpleNamespace(id=2)
        )

    created_user = db.add.call_args.args[0]
    assert created_user.display_name == "สมชาย ใจดี"
    create.assert_awaited_once()
    confirm.assert_awaited_once()
    notify.assert_awaited_once()
    assert audit.await_args.kwargs["action"] == "create_booking_walkin"
    assert audit.await_args.kwargs["admin_id"] == 2
    assert result.queue_number == "260819-002"
    db.commit.assert_awaited()


@pytest.mark.asyncio
async def test_walkin_without_a_name_still_gets_a_counter_user():
    db = AsyncMock()
    with patch.object(
        admin_bookings, "load_booking_config", new=AsyncMock(return_value=_config())
    ), patch.object(
        admin_bookings.booking_service, "load_day_hours", new=AsyncMock(return_value=None)
    ), patch.object(
        admin_bookings.booking_service,
        "create_booking",
        new=AsyncMock(return_value=_stored_booking()),
    ), patch.object(
        admin_bookings, "notify_booking_confirmed", new=AsyncMock(return_value=True)
    ), patch.object(
        admin_bookings, "notify_staff_new_booking", new=AsyncMock(return_value=True)
    ), patch.object(admin_bookings, "create_audit_log", new=AsyncMock()):
        await admin_bookings.create_walkin_booking(
            _payload(contact_name=None), db=db, staff=SimpleNamespace(id=2)
        )

    assert db.add.call_args.args[0].display_name == "ผู้มาติดต่อ"


@pytest.mark.asyncio
async def test_walkin_maps_engine_errors_to_thai_http_errors():
    db = AsyncMock()
    cases = [
        (UnknownServiceTypeError("x"), 404),
        (SlotFullError("full"), 409),
    ]
    for error, status_code in cases:
        with patch.object(
            admin_bookings, "load_booking_config", new=AsyncMock(return_value=_config())
        ), patch.object(
            admin_bookings.booking_service, "load_day_hours", new=AsyncMock(return_value=None)
        ), patch.object(
            admin_bookings.booking_service, "create_booking", new=AsyncMock(side_effect=error)
        ):
            with pytest.raises(HTTPException) as exc:
                await admin_bookings.create_walkin_booking(
                    _payload(), db=db, staff=SimpleNamespace(id=2)
                )
        assert exc.value.status_code == status_code


# --- contact edit ---


@pytest.mark.asyncio
async def test_contact_edit_disabled_is_rejected():
    db = AsyncMock()
    with patch.object(
        admin_bookings, "load_booking_config", new=AsyncMock(return_value=_config(walkin_enabled=False))
    ):
        with pytest.raises(HTTPException) as exc:
            await admin_bookings.update_booking_contact_info(
                SimpleNamespace(contact_name="ใหม่", phone_number=None, note=None, email=None),
                booking_id=11,
                db=db,
                staff=SimpleNamespace(id=2),
            )
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_contact_edit_applies_and_audits():
    booking = _stored_booking()
    db = AsyncMock()
    db.get = AsyncMock(return_value=booking)

    async def _apply(db_, booking_, **fields):
        if fields.get("contact_name") is not None:
            booking_.contact_name = fields["contact_name"]

    with patch.object(
        admin_bookings, "load_booking_config", new=AsyncMock(return_value=_config())
    ), patch.object(
        admin_bookings.booking_service, "update_booking_contact", new=AsyncMock(side_effect=_apply)
    ), patch.object(
        admin_bookings, "create_audit_log", new=AsyncMock()
    ) as audit:
        result = await admin_bookings.update_booking_contact_info(
            SimpleNamespace(contact_name="สมศรี ใจดี", phone_number=None, note=None, email=None),
            booking_id=11,
            db=db,
            staff=SimpleNamespace(id=2),
        )

    assert result.contact_name == "สมศรี ใจดี"
    assert audit.await_args.kwargs["action"] == "update_booking_contact"
    db.commit.assert_awaited()


@pytest.mark.asyncio
async def test_contact_edit_on_a_finished_booking_is_rejected():
    db = AsyncMock()
    db.get = AsyncMock(return_value=_stored_booking(status="COMPLETED"))
    with patch.object(
        admin_bookings, "load_booking_config", new=AsyncMock(return_value=_config())
    ), patch.object(
        admin_bookings.booking_service,
        "update_booking_contact",
        new=AsyncMock(side_effect=BookingNotCancellableError("done")),
    ):
        with pytest.raises(HTTPException) as exc:
            await admin_bookings.update_booking_contact_info(
                SimpleNamespace(contact_name="ใหม่", phone_number=None, note=None, email=None),
                booking_id=11,
                db=db,
                staff=SimpleNamespace(id=2),
            )
    assert exc.value.status_code == 409


@pytest.mark.asyncio
async def test_contact_edit_missing_booking_returns_404():
    db = AsyncMock()
    db.get = AsyncMock(return_value=None)
    with patch.object(
        admin_bookings, "load_booking_config", new=AsyncMock(return_value=_config())
    ):
        with pytest.raises(HTTPException) as exc:
            await admin_bookings.update_booking_contact_info(
                SimpleNamespace(contact_name="ใหม่", phone_number=None, note=None, email=None),
                booking_id=999,
                db=db,
                staff=SimpleNamespace(id=2),
            )
    assert exc.value.status_code == 404


# --- counter availability ---


@pytest.mark.asyncio
async def test_counter_availability_returns_slots():
    db = AsyncMock()
    slot = SimpleNamespace(start=time(9, 0), capacity=3, booked=1, remaining=2, is_full=False)
    with patch.object(
        admin_bookings, "load_booking_config", new=AsyncMock(return_value=_config())
    ), patch.object(
        admin_bookings.booking_service, "get_availability", new=AsyncMock(return_value=[slot])
    ):
        result = await admin_bookings.counter_availability(
            service_type="ปรึกษากฎหมาย", booking_date=date(2026, 8, 19), db=db,
            _staff=SimpleNamespace(id=2),
        )
    assert result.service_type == "ปรึกษากฎหมาย"
    assert result.slots[0].remaining == 2
    assert result.slots[0].is_full is False


@pytest.mark.asyncio
async def test_counter_availability_unknown_service_returns_404():
    db = AsyncMock()
    with patch.object(
        admin_bookings, "load_booking_config", new=AsyncMock(return_value=_config())
    ), patch.object(
        admin_bookings.booking_service,
        "get_availability",
        new=AsyncMock(side_effect=UnknownServiceTypeError("x")),
    ):
        with pytest.raises(HTTPException) as exc:
            await admin_bookings.counter_availability(
                service_type="ไม่มี", booking_date=date(2026, 8, 19), db=db,
                _staff=SimpleNamespace(id=2),
            )
    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_counter_availability_disabled_is_rejected():
    db = AsyncMock()
    with patch.object(
        admin_bookings,
        "load_booking_config",
        new=AsyncMock(return_value=_config(calendar_enabled=False)),
    ), pytest.raises(HTTPException) as exc:
        await admin_bookings.counter_availability(
            service_type="ปรึกษากฎหมาย", booking_date=date(2026, 8, 19), db=db,
            _staff=SimpleNamespace(id=2),
        )
    assert exc.value.status_code == 403


# --- search (q) ---


@pytest.mark.asyncio
async def test_search_filters_name_phone_and_queue_with_escaped_wildcards():
    """A literal % in the query must not become a wildcard — same rule as requests."""
    from unittest.mock import MagicMock
    from sqlalchemy.dialects import postgresql

    db = AsyncMock()
    result = MagicMock()
    result.scalars.return_value.all.return_value = []
    db.execute.return_value = result

    await admin_bookings.list_bookings(
        search="081%", db=db, _staff=SimpleNamespace(id=1), limit=100, offset=0
    )

    stmt = db.execute.call_args.args[0]
    sql = str(stmt.compile(dialect=postgresql.dialect()))
    assert "bookings.contact_name ILIKE" in sql
    assert "bookings.phone_number ILIKE" in sql
    assert "bookings.queue_number ILIKE" in sql
    assert "ESCAPE" in sql


@pytest.mark.asyncio
async def test_blank_search_adds_no_filter():
    from unittest.mock import MagicMock
    from sqlalchemy.dialects import postgresql

    db = AsyncMock()
    result = MagicMock()
    result.scalars.return_value.all.return_value = []
    db.execute.return_value = result

    await admin_bookings.list_bookings(
        search="", db=db, _staff=SimpleNamespace(id=1), limit=100, offset=0
    )

    stmt = db.execute.call_args.args[0]
    assert "ILIKE" not in str(stmt.compile(dialect=postgresql.dialect()))


# --- settings carry the new toggle ---


def test_settings_default_keeps_old_payloads_valid():
    payload = BookingSettingsIn(
        enabled=True,
        service_types=["ปรึกษากฎหมาย"],
        slot_minutes=30,
        slot_capacity=3,
        advance_days=14,
        blackout_dates=[],
        reminder_enabled=False,
        reminder_lead_value=1,
        reminder_lead_unit=ReminderUnit.DAY,
    )
    assert payload.walkin_enabled is True


def test_settings_rejects_a_non_bool_toggle():
    with pytest.raises(ValidationError):
        BookingSettingsIn(
            enabled=True,
            service_types=[],
            slot_minutes=30,
            slot_capacity=3,
            advance_days=14,
            blackout_dates=[],
            reminder_enabled=False,
            reminder_lead_value=1,
            reminder_lead_unit=ReminderUnit.DAY,
            walkin_enabled="sometimes",
        )
