"""Appointment booking: configuration, slot availability, and booking creation.

The slot engine is deliberately a pure function. Every genuinely tricky rule of
this feature is a boundary condition — a slot that would run past closing time,
a slot that started minutes ago, the last day inside the booking window, a public
holiday that day-of-week business hours cannot express — and keeping the engine
free of I/O means those can all be pinned down by fast tests. The only part that
touches the database is counting what is already booked.
"""
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from enum import Enum
from typing import Mapping, Optional, Sequence

from sqlalchemy import DateTime, func, select, text, type_coerce, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.booking import Booking, BookingStatus
from app.models.business_hours import BusinessHours
from app.services.business_hours_service import BANGKOK_TZ


class BookingError(Exception):
    """Base class for booking failures the API layer maps to 4xx responses."""


class UnknownServiceTypeError(BookingError):
    """The requested service is not one an admin has opened for booking."""


class SlotUnavailableError(BookingError):
    """The requested date/time is not a bookable slot at all."""


class SlotFullError(BookingError):
    """The slot exists but has no remaining capacity."""


class DuplicateBookingError(BookingError):
    """This user already holds an active booking in this slot."""


class BookingNotCancellableError(BookingError):
    """Already cancelled/completed, or the appointment time has passed."""


# Statuses that still occupy a seat. A cancelled booking frees its place;
# a completed or no-show one is in the past and cannot be double-booked anyway.
ACTIVE_STATUSES = (BookingStatus.CONFIRMED,)


class ReminderUnit(str, Enum):
    """Unit for the admin-configurable advance-reminder lead time."""

    DAY = "DAY"
    HOUR = "HOUR"

    def to_timedelta(self, value: int) -> timedelta:
        return timedelta(days=value) if self is ReminderUnit.DAY else timedelta(hours=value)


@dataclass(frozen=True)
class BookingConfig:
    """Admin-editable settings, read fresh rather than cached.

    Frozen because the reminder scheduler re-reads this on every pass; a mutation
    that leaked between passes would be invisible and long-lived.
    """

    enabled: bool
    service_types: Sequence[str]
    slot_minutes: int
    slot_capacity: int
    advance_days: int
    blackout_dates: frozenset
    reminder_enabled: bool
    reminder_lead_value: int
    reminder_lead_unit: ReminderUnit

    @property
    def reminder_lead(self) -> timedelta:
        return self.reminder_lead_unit.to_timedelta(self.reminder_lead_value)


@dataclass(frozen=True)
class SlotAvailability:
    """One bookable time slot and how much room is left in it."""

    start: time
    capacity: int
    booked: int

    @property
    def remaining(self) -> int:
        # Clamped: an admin can lower capacity after bookings already exist,
        # which would otherwise produce a negative "remaining".
        return max(0, self.capacity - self.booked)

    @property
    def is_full(self) -> bool:
        return self.remaining == 0


def local_now() -> datetime:
    """Current wall-clock time in the service's timezone, naive for comparison.

    Dropping the tzinfo keeps it directly comparable with the naive datetimes
    built from `booking_date` + `booking_time`, which are stored as local dates
    and times rather than instants.
    """
    return datetime.now(BANGKOK_TZ).replace(tzinfo=None)


def _parse_hhmm(value: str) -> time:
    """Business hours are stored as 'HH:MM' strings."""
    return time.fromisoformat(value)


def compute_slots(
    *,
    target_date: date,
    day_hours: Optional[BusinessHours],
    config: BookingConfig,
    booked_counts: Mapping[time, int],
    now_local: datetime,
) -> list[SlotAvailability]:
    """Return the bookable slots for ``target_date``, with remaining capacity.

    ``day_hours`` is the business-hours row for that date's weekday (or None when
    none is configured). ``booked_counts`` maps a slot start time to the number
    of active bookings already held in it.
    """
    if not config.enabled:
        return []
    if day_hours is None or not day_hours.is_open:
        return []
    if target_date in config.blackout_dates:
        return []

    today = now_local.date()
    if target_date < today:
        return []
    if target_date > today + timedelta(days=config.advance_days):
        return []

    open_at = _parse_hhmm(day_hours.open_time)
    close_at = _parse_hhmm(day_hours.close_time)

    slots: list[SlotAvailability] = []
    cursor = datetime.combine(target_date, open_at)
    closing = datetime.combine(target_date, close_at)
    step = timedelta(minutes=config.slot_minutes)

    # `cursor + step <= closing` rather than `cursor < closing`: a slot must fit
    # entirely inside opening hours, so a 16:30 start cannot exist when the slot
    # runs 45 minutes and the office closes at 17:00.
    while cursor + step <= closing:
        start = cursor.time()
        # On the current day, a slot whose start has passed is no longer bookable.
        if target_date > today or cursor > now_local:
            slots.append(
                SlotAvailability(
                    start=start,
                    capacity=config.slot_capacity,
                    booked=booked_counts.get(start, 0),
                )
            )
        cursor += step

    return slots


# --- booking creation -------------------------------------------------------


async def _acquire_booking_day_lock(db: AsyncSession, booking_date: date) -> None:
    """Serialise every booking write for one day.

    `pg_advisory_xact_lock` is used rather than row locks because the hazard is a
    *phantom* row: `SELECT ... FOR UPDATE` can only lock rows that already exist,
    so it cannot stop a concurrent INSERT from taking the same last seat. The
    lock is transaction-scoped and releases on commit or rollback.

    The day is the right granularity because two invariants need protecting and
    both are day-wide or narrower: per-slot capacity, and the per-day queue
    number sequence.
    """
    await db.execute(
        text("SELECT pg_advisory_xact_lock(hashtext(:key))"),
        {"key": f"booking:{booking_date.isoformat()}"},
    )


async def _count_active_in_slot(
    db: AsyncSession, service_type: str, booking_date: date, booking_time: time
) -> int:
    result = await db.execute(
        select(func.count())
        .select_from(Booking)
        .where(
            Booking.service_type == service_type,
            Booking.booking_date == booking_date,
            Booking.booking_time == booking_time,
            Booking.status.in_(ACTIVE_STATUSES),
        )
    )
    return int(result.scalar_one())


async def _has_active_booking(
    db: AsyncSession,
    user_id: int,
    service_type: str,
    booking_date: date,
    booking_time: time,
) -> bool:
    result = await db.execute(
        select(Booking.id)
        .where(
            Booking.user_id == user_id,
            Booking.service_type == service_type,
            Booking.booking_date == booking_date,
            Booking.booking_time == booking_time,
            Booking.status.in_(ACTIVE_STATUSES),
        )
        .limit(1)
    )
    return result.scalar_one_or_none() is not None


async def _next_queue_number(db: AsyncSession, booking_date: date) -> str:
    """Allocate the next running number for the day, e.g. ``260819-001``.

    Counts every row for the date, cancellations included, so a number is never
    reused — a citizen may already be holding a printed slip bearing it.
    """
    result = await db.execute(
        select(func.count())
        .select_from(Booking)
        .where(Booking.booking_date == booking_date)
    )
    sequence = int(result.scalar_one()) + 1
    return f"{booking_date:%y%m%d}-{sequence:03d}"


async def create_booking(
    db: AsyncSession,
    *,
    user_id: int,
    service_type: str,
    booking_date: date,
    booking_time: time,
    contact_name: Optional[str],
    phone_number: Optional[str],
    note: Optional[str],
    config: BookingConfig,
    day_hours: Optional[BusinessHours],
) -> Booking:
    """Create a CONFIRMED booking, or raise a `BookingError` subclass.

    The caller owns the transaction: this flushes but does not commit, so the
    advisory lock stays held until the caller commits the whole unit of work.
    """
    if service_type not in config.service_types:
        raise UnknownServiceTypeError(service_type)

    # Validate the requested time really is a bookable slot *before* touching the
    # database, so a malformed request never takes the day lock. Capacity is left
    # at zero here because the authoritative count happens under the lock below.
    available = compute_slots(
        target_date=booking_date,
        day_hours=day_hours,
        config=config,
        booked_counts={},
        now_local=local_now(),
    )
    if booking_time not in {slot.start for slot in available}:
        raise SlotUnavailableError(f"{booking_date} {booking_time}")

    await _acquire_booking_day_lock(db, booking_date)

    if await _has_active_booking(db, user_id, service_type, booking_date, booking_time):
        raise DuplicateBookingError(f"user {user_id} already booked {booking_date} {booking_time}")

    booked = await _count_active_in_slot(db, service_type, booking_date, booking_time)
    if booked >= config.slot_capacity:
        raise SlotFullError(f"{booking_date} {booking_time} is full")

    booking = Booking(
        user_id=user_id,
        service_type=service_type,
        booking_date=booking_date,
        booking_time=booking_time,
        contact_name=contact_name,
        phone_number=phone_number,
        note=note,
        status=BookingStatus.CONFIRMED,
        queue_number=await _next_queue_number(db, booking_date),
    )
    db.add(booking)
    await db.flush()
    return booking


# --- reads for the API layer ------------------------------------------------


async def load_day_hours(db: AsyncSession, weekday: int) -> Optional[BusinessHours]:
    """Business hours row for a weekday (0=Monday), or None if unconfigured."""
    result = await db.execute(
        select(BusinessHours).where(BusinessHours.day_of_week == weekday)
    )
    return result.scalar_one_or_none()


async def get_booked_counts(
    db: AsyncSession, service_type: str, booking_date: date
) -> dict:
    """Map slot start time -> number of seats already taken, for one day."""
    result = await db.execute(
        select(Booking.booking_time, func.count())
        .where(
            Booking.service_type == service_type,
            Booking.booking_date == booking_date,
            Booking.status.in_(ACTIVE_STATUSES),
        )
        .group_by(Booking.booking_time)
    )
    return {row[0]: int(row[1]) for row in result.all()}


async def get_availability(
    db: AsyncSession, *, service_type: str, target_date: date, config: BookingConfig
) -> list[SlotAvailability]:
    """Slots and remaining capacity for one service on one day."""
    if service_type not in config.service_types:
        raise UnknownServiceTypeError(service_type)

    day_hours = await load_day_hours(db, target_date.weekday())
    booked_counts = await get_booked_counts(db, service_type, target_date)
    return compute_slots(
        target_date=target_date,
        day_hours=day_hours,
        config=config,
        booked_counts=booked_counts,
        now_local=local_now(),
    )


async def list_user_bookings(
    db: AsyncSession, user_id: int, *, limit: int = 10
) -> Sequence[Booking]:
    """A citizen's own bookings, soonest first, upcoming before past."""
    result = await db.execute(
        select(Booking)
        .where(Booking.user_id == user_id)
        .order_by(Booking.booking_date.desc(), Booking.booking_time.desc())
        .limit(limit)
    )
    return result.scalars().all()


async def cancel_booking(db: AsyncSession, booking: Booking) -> Booking:
    """Move a booking to CANCELLED, freeing its seat. Idempotent-ish guard."""
    if booking.status != BookingStatus.CONFIRMED:
        raise BookingNotCancellableError(f"booking {booking.id} is {booking.status}")

    appointment_at = datetime.combine(booking.booking_date, booking.booking_time)
    if appointment_at <= local_now():
        raise BookingNotCancellableError(f"booking {booking.id} is in the past")

    booking.status = BookingStatus.CANCELLED
    booking.cancelled_at = func.now()
    await db.flush()
    return booking


# --- advance reminders ------------------------------------------------------


def reminder_window(config: BookingConfig, now: datetime) -> tuple:
    """The (earliest, latest) appointment time that is due for a reminder now.

    Lower bound is `now`: an appointment already in the past must never trigger
    a reminder, however far behind the scheduler has fallen.
    """
    return now, now + config.reminder_lead


async def get_due_reminders(
    db: AsyncSession, *, window_start: datetime, window_end: datetime, limit: int = 100
) -> Sequence[Booking]:
    """Confirmed, not-yet-reminded bookings whose appointment falls in the window."""
    # Postgres evaluates `date + time` as a timestamp; type_coerce tells
    # SQLAlchemy the result type without altering the emitted SQL.
    appointment_at = type_coerce(Booking.booking_date + Booking.booking_time, DateTime)

    result = await db.execute(
        select(Booking)
        # The reminder push resolves its LINE target through booking.user, and a
        # lazy load there would raise MissingGreenlet under async SQLAlchemy
        # rather than merely being slow.
        .options(selectinload(Booking.user))
        .where(
            Booking.status == BookingStatus.CONFIRMED,
            Booking.reminder_sent_at.is_(None),
            appointment_at > window_start,
            appointment_at <= window_end,
        )
        .order_by(Booking.booking_date, Booking.booking_time)
        .limit(limit)
    )
    return result.scalars().all()


async def load_booking_for_reminder(
    db: AsyncSession, booking_id: int
) -> Optional[Booking]:
    """Re-read one booking with its user eagerly loaded, for the reminder push."""
    result = await db.execute(
        select(Booking)
        .options(selectinload(Booking.user))
        .where(Booking.id == booking_id)
    )
    return result.scalar_one_or_none()


async def claim_reminder(db: AsyncSession, booking_id: int) -> bool:
    """Atomically mark a booking as reminded; True only for the winning caller.

    This conditional UPDATE — not the surrounding transaction or any row lock —
    is what makes the reminder exactly-once across the two uvicorn workers that
    each run their own scheduler loop. A worker that loses the race sees zero
    rows updated and sends nothing.
    """
    result = await db.execute(
        update(Booking)
        .where(Booking.id == booking_id, Booking.reminder_sent_at.is_(None))
        .values(reminder_sent_at=func.now())
    )
    return result.rowcount == 1
