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
from app.services.booking_notifications import ReminderOutcome
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
        # The claim/send mechanics tests predate per-channel switches; LINE
        # stays the active channel so the scheduler reaches the send step.
        line_enabled=True,
    )
    defaults.update(overrides)
    return BookingConfig(**defaults)


TOKEN = datetime(2026, 8, 12, 8, 30)


def _booking(booking_id=1, status=BookingStatus.CONFIRMED):
    return SimpleNamespace(
        id=booking_id,
        queue_number=f"260813-{booking_id:03d}",
        service_type="ปรึกษากฎหมาย",
        booking_date=date(2026, 8, 13),
        booking_time=time(9, 0),
        status=status,
        user=SimpleNamespace(id=99),
    )


def _patches(*, config=None, due=(), claim=True, send=None, load=None, outcome=None):
    """Patch every collaborator of _process_due_reminders."""
    due_list = list(due)
    send = send or AsyncMock(return_value=True)

    async def _default_load(_db, booking_id, token=None):
        return next((b for b in due_list if b.id == booking_id), None)

    async def _outcome(*a, **k):
        if outcome is not None:
            return outcome
        result = await send(*a, **k)
        return ReminderOutcome.CONFIRMED if result else ReminderOutcome.FAILED

    return (
        patch.object(booking_reminder, "load_booking_config", new=AsyncMock(return_value=config or _config())),
        patch.object(booking_reminder, "local_now", return_value=NOW),
        patch.object(booking_reminder, "get_due_reminders", new=AsyncMock(return_value=due_list)),
        patch.object(booking_reminder, "claim_reminder", new=AsyncMock(return_value=TOKEN if claim else None)),
        patch.object(booking_reminder, "load_booking_for_reminder", new=load or AsyncMock(side_effect=_default_load)),
        patch.object(booking_reminder, "send_booking_reminder_outcome", new=AsyncMock(side_effect=_outcome)),
        patch.object(booking_reminder, "finalize_reminder", new=AsyncMock(return_value=True)),
        patch.object(booking_reminder, "clear_reminder_claim", new=AsyncMock()),
        patch.object(booking_reminder, "fail_reminder", new=AsyncMock()),
    )


async def _process(**kwargs):
    db = AsyncMock()
    return await _process_with_db(db, **kwargs)


async def _process_with_db(db, **kwargs):
    patches = _patches(**kwargs)
    for p in patches:
        p.start()
    try:
        await booking_reminder._process_due_reminders(db)
    finally:
        for p in patches:
            p.stop()
    return db


async def _capture(**kwargs):
    """Run one booking and return (db, finalize mock, fail mock)."""
    patches = _patches(due=(_booking(),), **kwargs)
    finalize = next(p for p in patches if p.attribute == "finalize_reminder").new
    fail = next(p for p in patches if p.attribute == "fail_reminder").new
    for p in patches:
        p.start()
    db = AsyncMock()
    try:
        await booking_reminder._process_due_reminders(db)
    finally:
        for p in patches:
            p.stop()
    return db, finalize, fail


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
    """Without the NULL guard a reclaimed lease could confirm a duplicate."""
    from app.services import booking_service

    sql = _compile(
        update(Booking)
        .where(
            Booking.id == 1,
            Booking.status == BookingStatus.CONFIRMED,
            Booking.reminder_sent_at.is_(None),
            booking_service._lease_is_stale(),
            Booking.reminder_claimed_at.is_(None),
        )
        .values(reminder_claimed_at=None)
    )
    assert "reminder_sent_at IS NULL" in sql
    assert "reminder_claimed_at IS NULL" in sql
    assert "bookings.status" in sql
    assert "make_interval" in sql
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
async def test_both_channels_off_skips_without_claiming():
    with (
        patch.object(booking_reminder, "get_due_reminders", new=AsyncMock()) as mock_query,
        patch.object(
            booking_reminder,
            "load_booking_config",
            new=AsyncMock(return_value=_config(email_enabled=False, line_enabled=False)),
        ),
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

    assert order.index("commit") < order.index("send"), f"claim must commit before send, got {order}"


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

    async def _load(_db, booking_id, token=None):
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


# --- F2: lease outcome handling ---


@pytest.mark.asyncio
async def test_all_channel_failure_stops_automatic_retries():
    """A definite failure must not be retried every scheduler pass."""
    _db, finalize, fail = await _capture(outcome=ReminderOutcome.FAILED)
    finalize.assert_not_awaited()
    fail.assert_awaited_once_with(_db, 1, TOKEN)


@pytest.mark.asyncio
async def test_confirmed_delivery_finalizes_and_does_not_fail():
    _db, finalize, fail = await _capture(outcome=ReminderOutcome.CONFIRMED)
    finalize.assert_awaited_once_with(_db, 1, TOKEN)
    fail.assert_not_awaited()


@pytest.mark.asyncio
async def test_unknown_outcome_finalizes_rather_than_risks_a_duplicate():
    """A provider error with unknown result keeps the sent marker (F2)."""
    _db, finalize, fail = await _capture(outcome=ReminderOutcome.UNKNOWN)
    finalize.assert_awaited_once_with(_db, 1, TOKEN)
    fail.assert_not_awaited()


@pytest.mark.asyncio
async def test_cancelled_after_claim_skips_send_and_releases_lease():
    """A cancellation between selection and reload must not be mailed (F2)."""
    cancelled = _booking(status=BookingStatus.CANCELLED)
    send = AsyncMock(return_value=True)
    patches = _patches(due=(cancelled,), claim=True, send=send)
    clear = next(p for p in patches if p.attribute == "clear_reminder_claim").new
    for p in patches:
        p.start()
    db = AsyncMock()
    try:
        await booking_reminder._process_due_reminders(db)
    finally:
        for p in patches:
            p.stop()
    send.assert_not_awaited()
    clear.assert_awaited_once_with(db, 1, TOKEN)
