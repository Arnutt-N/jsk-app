"""Booking creation: validation, capacity enforcement, and the oversell guard.

Counting then inserting is not safe on its own: `SELECT ... FOR UPDATE` locks
rows that already exist and cannot block a concurrent INSERT into the same slot,
so two citizens can both pass the capacity check for the last seat. The fix is a
transaction-scoped advisory lock keyed on the booking *day* — which also covers
the per-day queue-number sequence, an invariant a slot-scoped lock would miss.

That ordering — lock *before* counting — is the whole guarantee, so it is
asserted directly here. A true two-transaction race needs a live Postgres and
lives in `test_booking_create_concurrency.py`.
"""
from datetime import date, datetime, time
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.models.business_hours import BusinessHours
from app.services import booking_service
from app.services.booking_service import (
    BookingConfig,
    DuplicateBookingError,
    ReminderUnit,
    SlotFullError,
    SlotUnavailableError,
    UnknownServiceTypeError,
    create_booking,
)


TARGET = date(2026, 8, 19)
SLOT = time(9, 0)
NOW = datetime(2026, 8, 12, 9, 15)


def _hours():
    return BusinessHours(
        day_of_week=TARGET.weekday(),
        open_time="08:00",
        close_time="17:00",
        is_open=True,
    )


def _config(**overrides):
    defaults = dict(
        enabled=True,
        service_types=("ปรึกษากฎหมาย",),
        slot_minutes=30,
        slot_capacity=2,
        advance_days=14,
        blackout_dates=frozenset(),
        reminder_enabled=True,
        reminder_lead_value=1,
        reminder_lead_unit=ReminderUnit.DAY,
    )
    defaults.update(overrides)
    return BookingConfig(**defaults)


def _db():
    """AsyncSession stub. `add` is synchronous, so it must not be an AsyncMock."""
    db = AsyncMock()
    db.add = MagicMock()
    return db


async def _create(db=None, *, config=None, **overrides):
    kwargs = dict(
        user_id=7,
        service_type="ปรึกษากฎหมาย",
        booking_date=TARGET,
        booking_time=SLOT,
        contact_name="สมชาย ใจดี",
        phone_number="0812345678",
        note=None,
        config=config or _config(),
        day_hours=_hours(),
    )
    kwargs.update(overrides)
    with patch.object(booking_service, "local_now", return_value=NOW):
        return await create_booking(db or _db(), **kwargs)


@pytest.fixture
def stub_db_calls():
    """Patch the DB helpers, recording the order they are invoked in."""
    calls = []

    def _record(name, result):
        async def _fn(*args, **kwargs):
            calls.append(name)
            return result
        return _fn

    with patch.object(booking_service, "_acquire_booking_day_lock", new=_record("lock", None)), \
         patch.object(booking_service, "_count_active_in_slot", new=_record("count", 0)), \
         patch.object(booking_service, "_has_active_booking", new=_record("dup", False)), \
         patch.object(booking_service, "_next_queue_number", new=_record("queue", "260819-001")):
        yield calls


# --- the oversell guard ---


@pytest.mark.asyncio
async def test_the_slot_lock_is_taken_before_anything_is_counted(stub_db_calls):
    """Counting before locking is the phantom-row race this feature must avoid."""
    await _create()
    assert stub_db_calls[0] == "lock", f"lock must come first, got {stub_db_calls}"
    assert "count" in stub_db_calls
    assert stub_db_calls.index("lock") < stub_db_calls.index("count")


@pytest.mark.asyncio
async def test_queue_number_is_allocated_inside_the_lock(stub_db_calls):
    """Two concurrent inserts would otherwise hand out the same queue number."""
    await _create()
    assert stub_db_calls.index("lock") < stub_db_calls.index("queue")


@pytest.mark.asyncio
async def test_lock_is_scoped_to_the_booking_day_not_the_slot():
    """The lock has to cover queue numbering too, which is a per-day sequence.

    A slot-scoped lock would leave two bookings in *different* slots on the same
    day free to compute the same `count + 1` and hand out a duplicate queue
    number. Locking the day covers both invariants with one lock, and avoids the
    ordering hazard of taking two.
    """
    captured = {}

    async def _capture(db, booking_date):
        captured["booking_date"] = booking_date

    with patch.object(booking_service, "_acquire_booking_day_lock", new=_capture), \
         patch.object(booking_service, "_count_active_in_slot", new=AsyncMock(return_value=0)), \
         patch.object(booking_service, "_has_active_booking", new=AsyncMock(return_value=False)), \
         patch.object(booking_service, "_next_queue_number", new=AsyncMock(return_value="260819-001")):
        await _create()

    assert captured == {"booking_date": TARGET}


# --- capacity ---


@pytest.mark.asyncio
async def test_booking_succeeds_when_the_slot_has_room(stub_db_calls):
    booking = await _create()
    assert booking.service_type == "ปรึกษากฎหมาย"
    assert booking.booking_date == TARGET
    assert booking.booking_time == SLOT
    assert booking.queue_number == "260819-001"
    assert booking.status.value == "CONFIRMED"
    assert booking.reminder_sent_at is None


@pytest.mark.asyncio
async def test_a_full_slot_is_rejected():
    with patch.object(booking_service, "_acquire_booking_day_lock", new=AsyncMock()), \
         patch.object(booking_service, "_has_active_booking", new=AsyncMock(return_value=False)), \
         patch.object(booking_service, "_count_active_in_slot", new=AsyncMock(return_value=2)), \
         patch.object(booking_service, "_next_queue_number", new=AsyncMock()):
        with pytest.raises(SlotFullError):
            await _create(config=_config(slot_capacity=2))


@pytest.mark.asyncio
async def test_capacity_check_uses_greater_than_or_equal():
    """An over-filled slot (capacity lowered later) must still reject."""
    with patch.object(booking_service, "_acquire_booking_day_lock", new=AsyncMock()), \
         patch.object(booking_service, "_has_active_booking", new=AsyncMock(return_value=False)), \
         patch.object(booking_service, "_count_active_in_slot", new=AsyncMock(return_value=9)), \
         patch.object(booking_service, "_next_queue_number", new=AsyncMock()):
        with pytest.raises(SlotFullError):
            await _create(config=_config(slot_capacity=2))


@pytest.mark.asyncio
async def test_same_user_cannot_double_book_the_same_slot():
    with patch.object(booking_service, "_acquire_booking_day_lock", new=AsyncMock()), \
         patch.object(booking_service, "_has_active_booking", new=AsyncMock(return_value=True)), \
         patch.object(booking_service, "_count_active_in_slot", new=AsyncMock(return_value=0)), \
         patch.object(booking_service, "_next_queue_number", new=AsyncMock()):
        with pytest.raises(DuplicateBookingError):
            await _create()


# --- input validation, before any lock is taken ---


@pytest.mark.asyncio
async def test_unknown_service_type_is_rejected(stub_db_calls):
    with pytest.raises(UnknownServiceTypeError):
        await _create(service_type="บริการที่ไม่มีอยู่จริง")
    assert stub_db_calls == [], "validation must happen before locking"


@pytest.mark.asyncio
async def test_a_time_that_is_not_a_real_slot_is_rejected(stub_db_calls):
    """09:07 is not on the 30-minute grid."""
    with pytest.raises(SlotUnavailableError):
        await _create(booking_time=time(9, 7))
    assert stub_db_calls == []


@pytest.mark.asyncio
async def test_booking_on_a_blackout_date_is_rejected(stub_db_calls):
    with pytest.raises(SlotUnavailableError):
        await _create(config=_config(blackout_dates=frozenset({TARGET})))
    assert stub_db_calls == []


@pytest.mark.asyncio
async def test_booking_on_a_closed_day_is_rejected(stub_db_calls):
    closed = BusinessHours(
        day_of_week=TARGET.weekday(), open_time="08:00", close_time="17:00", is_open=False
    )
    with pytest.raises(SlotUnavailableError):
        await _create(day_hours=closed)
    assert stub_db_calls == []


@pytest.mark.asyncio
async def test_booking_in_the_past_is_rejected(stub_db_calls):
    with pytest.raises(SlotUnavailableError):
        await _create(booking_date=date(2026, 8, 1))
    assert stub_db_calls == []


@pytest.mark.asyncio
async def test_booking_beyond_the_advance_window_is_rejected(stub_db_calls):
    with pytest.raises(SlotUnavailableError):
        await _create(booking_date=date(2026, 9, 30))
    assert stub_db_calls == []


@pytest.mark.asyncio
async def test_booking_is_rejected_while_the_feature_is_disabled(stub_db_calls):
    with pytest.raises(SlotUnavailableError):
        await _create(config=_config(enabled=False))
    assert stub_db_calls == []
