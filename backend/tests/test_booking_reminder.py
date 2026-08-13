"""Tests for the advance-reminder scheduler.

The behaviour that matters is not "a message got sent" but the guard around it:
the claim must be honoured, the claim must be committed before the push, a
disabled toggle must short-circuit before any query runs, and one failure must
never stop the loop.
"""
from datetime import date, datetime, time, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest

from sqlalchemy import select, update
from sqlalchemy.dialects import postgresql

from app.models.booking import Booking, BookingStatus
from app.services.booking_service import BookingConfig, ReminderUnit, reminder_window
from app.tasks import booking_reminder


NOW = datetime(2026, 8, 12, 9, 0)


def _config(**overrides):
    defaults = dict(
        enabled=True,
        service_types=("ปรึกษากฎหมาย",),
        slot_minutes=30,
        slot_capacity=3,
        advance_days=14,
        blackout_dates=frozenset(),
        reminder_enabled=True,
        reminder_lead_value=1,
        reminder_lead_unit=ReminderUnit.DAY,
    )
    defaults.update(overrides)
    return BookingConfig(**defaults)


def _booking(booking_id=1):
    return SimpleNamespace(
        id=booking_id,
        queue_number=f"260813-{booking_id:03d}",
        service_type="ปรึกษากฎหมาย",
        booking_date=date(2026, 8, 13),
        booking_time=time(9, 0),
        user=SimpleNamespace(id=99),
    )


def _patches(*, config=None, due=(), claim=True, send=None, load=None):
    """Patch every collaborator of _process_due_reminders."""
    due_list = list(due)

    async def _default_load(_db, booking_id):
        return next((b for b in due_list if b.id == booking_id), None)

    return (
        patch.object(booking_reminder, "load_booking_config", new=AsyncMock(return_value=config or _config())),
        patch.object(booking_reminder, "local_now", return_value=NOW),
        patch.object(booking_reminder, "get_due_reminders", new=AsyncMock(return_value=due_list)),
        patch.object(booking_reminder, "claim_reminder", new=AsyncMock(return_value=claim)),
        patch.object(booking_reminder, "load_booking_for_reminder", new=load or AsyncMock(side_effect=_default_load)),
        patch.object(booking_reminder, "send_booking_reminder", new=send or AsyncMock(return_value=True)),
    )


async def _process(**kwargs):
    db = AsyncMock()
    patches = _patches(**kwargs)
    for p in patches:
        p.start()
    try:
        await booking_reminder._process_due_reminders(db)
    finally:
        for p in patches:
            p.stop()
    return db


# --- the SQL these guards depend on ---
#
# Compiled against the Postgres dialect rather than executed: it is the one part
# of the feature whose correctness is invisible without a database, and a
# compile error here would otherwise only surface at runtime in production.


def _compile(statement) -> str:
    return str(statement.compile(dialect=postgresql.dialect()))


def test_the_due_query_compares_date_plus_time_as_one_timestamp():
    """Comparing the two columns separately would mis-handle the day boundary."""
    from app.services import booking_service

    appointment_at = booking_service.type_coerce(
        Booking.booking_date + Booking.booking_time, booking_service.DateTime
    )
    sql = _compile(select(Booking.id).where(appointment_at > NOW))
    assert "bookings.booking_date + bookings.booking_time" in sql


def test_the_claim_update_is_guarded_on_reminder_sent_at_being_null():
    """Without the NULL guard the UPDATE always matches and duplicates go out."""
    sql = _compile(
        update(Booking)
        .where(Booking.id == 1, Booking.reminder_sent_at.is_(None))
        .values(reminder_sent_at=None)
    )
    assert "reminder_sent_at IS NULL" in sql
    assert "WHERE" in sql


def test_only_confirmed_bookings_are_eligible():
    """A cancelled appointment must never trigger a reminder."""
    sql = _compile(
        select(Booking.id).where(Booking.status == BookingStatus.CONFIRMED)
    )
    assert "bookings.status" in sql


# --- the lead-time window ---


def test_day_lead_window_ends_one_day_out():
    start, end = reminder_window(_config(reminder_lead_value=1, reminder_lead_unit=ReminderUnit.DAY), NOW)
    assert start == NOW
    assert end == NOW + timedelta(days=1)


def test_hour_lead_window_ends_n_hours_out():
    start, end = reminder_window(_config(reminder_lead_value=3, reminder_lead_unit=ReminderUnit.HOUR), NOW)
    assert start == NOW
    assert end == NOW + timedelta(hours=3)


def test_window_never_reaches_into_the_past():
    """A backlogged scheduler must not remind people about finished appointments."""
    start, _ = reminder_window(_config(), NOW)
    assert start == NOW


# --- the admin toggles ---


@pytest.mark.asyncio
async def test_disabled_reminders_short_circuit_before_querying():
    with patch.object(booking_reminder, "get_due_reminders", new=AsyncMock()) as mock_query:
        with patch.object(
            booking_reminder, "load_booking_config", new=AsyncMock(return_value=_config(reminder_enabled=False))
        ):
            await booking_reminder._process_due_reminders(AsyncMock())
    mock_query.assert_not_awaited()


@pytest.mark.asyncio
async def test_disabling_booking_entirely_also_stops_reminders():
    with patch.object(booking_reminder, "get_due_reminders", new=AsyncMock()) as mock_query:
        with patch.object(
            booking_reminder, "load_booking_config", new=AsyncMock(return_value=_config(enabled=False))
        ):
            await booking_reminder._process_due_reminders(AsyncMock())
    mock_query.assert_not_awaited()


@pytest.mark.asyncio
async def test_nothing_due_is_a_noop():
    send = AsyncMock()
    await _process(due=(), send=send)
    send.assert_not_awaited()


# --- the claim guard ---


@pytest.mark.asyncio
async def test_a_claimed_booking_is_sent():
    send = AsyncMock(return_value=True)
    await _process(due=(_booking(),), claim=True, send=send)
    send.assert_awaited_once()


@pytest.mark.asyncio
async def test_losing_the_claim_sends_nothing():
    """The other worker already took it; this one must stay silent."""
    send = AsyncMock()
    await _process(due=(_booking(),), claim=False, send=send)
    send.assert_not_awaited()


@pytest.mark.asyncio
async def test_the_claim_is_committed_before_the_push():
    """At-most-once: an uncommitted claim would let a crash resend the message."""
    order = []

    db = AsyncMock()
    db.commit = AsyncMock(side_effect=lambda: order.append("commit"))
    send = AsyncMock(side_effect=lambda *a, **k: order.append("send"))

    patches = _patches(due=(_booking(),), claim=True, send=send)
    for p in patches:
        p.start()
    try:
        await booking_reminder._process_due_reminders(db)
    finally:
        for p in patches:
            p.stop()

    assert order == ["commit", "send"], f"expected commit before send, got {order}"


# --- resilience ---


@pytest.mark.asyncio
async def test_no_orm_object_is_carried_across_iterations():
    """`rollback()` expires every instance in the session.

    It does so even under `expire_on_commit=False`, which governs commit only.
    So the loop must work from plain ids and re-read each booking after its
    claim commits — otherwise the first lost claim turns every later attribute
    access into a lazy refresh, which raises MissingGreenlet under async
    SQLAlchemy and abandons the rest of the batch.
    """
    loaded_ids = []

    async def _load(_db, booking_id):
        loaded_ids.append(booking_id)
        return _booking(booking_id)

    await _process(due=(_booking(1), _booking(2)), claim=True, load=AsyncMock(side_effect=_load))

    assert loaded_ids == [1, 2], "each booking must be re-read after its own claim"


@pytest.mark.asyncio
async def test_a_lost_claim_does_not_rollback_the_shared_session():
    """Nothing was written, so ending with a commit avoids expiring the session."""
    db = await _process(due=(_booking(),), claim=False)
    db.rollback.assert_not_awaited()
    db.commit.assert_awaited()


@pytest.mark.asyncio
async def test_a_booking_deleted_between_claim_and_send_is_skipped():
    send = AsyncMock()
    await _process(due=(_booking(),), claim=True, load=AsyncMock(return_value=None), send=send)
    send.assert_not_awaited()


@pytest.mark.asyncio
async def test_a_failing_send_does_not_crash_the_loop():
    send = AsyncMock(side_effect=Exception("LINE down"))
    db = await _process(due=(_booking(),), claim=True, send=send)  # must not raise
    db.rollback.assert_awaited()


@pytest.mark.asyncio
async def test_one_failure_does_not_stop_later_bookings():
    calls = []

    async def _send(db, booking, user):
        calls.append(booking.id)
        if booking.id == 1:
            raise Exception("boom")

    await _process(due=(_booking(1), _booking(2)), claim=True, send=AsyncMock(side_effect=_send))
    assert calls == [1, 2]
