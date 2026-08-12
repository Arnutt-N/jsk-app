"""The oversell guard, proven against a real Postgres.

`test_booking_create.py` asserts the *ordering* — lock before count — with mocks.
That catches a refactor dropping the lock, but it cannot prove Postgres actually
serialises the two transactions. Only two real, concurrent transactions can.

Skips (rather than errors) when Postgres is unreachable, so a laptop without
Docker still gets a clean run; CI has the database and executes it.
"""
import asyncio
import os
import socket
from datetime import date, datetime, time, timedelta
from urllib.parse import urlparse

import pytest
from sqlalchemy import delete, select, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.models.booking import Booking, BookingStatus
from app.models.business_hours import BusinessHours
from app.models.user import User
from app.services.booking_service import (
    BookingConfig,
    ReminderUnit,
    SlotFullError,
    create_booking,
)


def _postgres_reachable() -> bool:
    url = os.environ.get(
        "DATABASE_URL", "postgresql+asyncpg://postgres:password@127.0.0.1:5432/skn_app_db"
    )
    parsed = urlparse(url.replace("postgresql+asyncpg://", "postgresql://", 1))
    try:
        with socket.create_connection((parsed.hostname or "127.0.0.1", parsed.port or 5432), timeout=3):
            return True
    except OSError:
        return False


pytestmark = pytest.mark.skipif(
    not _postgres_reachable(),
    reason="needs Postgres (docker compose up -d db) — the point of this test is real locking",
)


SERVICE = "ทดสอบจองคิว"
# Far enough out to stay inside the advance window and clear of "already started".
TARGET = date.today() + timedelta(days=3)
SLOT = time(10, 0)


def _config(capacity: int) -> BookingConfig:
    return BookingConfig(
        enabled=True,
        service_types=(SERVICE,),
        slot_minutes=30,
        slot_capacity=capacity,
        advance_days=30,
        blackout_dates=frozenset(),
        reminder_enabled=False,
        reminder_lead_value=1,
        reminder_lead_unit=ReminderUnit.DAY,
    )


def _open_hours() -> BusinessHours:
    return BusinessHours(
        day_of_week=TARGET.weekday(), open_time="08:00", close_time="17:00", is_open=True
    )


@pytest.fixture
async def sessions():
    """Two sessions on separate connections — one shared session cannot race."""
    engine = create_async_engine(
        os.environ.get(
            "DATABASE_URL", "postgresql+asyncpg://postgres:password@127.0.0.1:5432/skn_app_db"
        ),
        pool_size=4,
    )
    maker = async_sessionmaker(engine, expire_on_commit=False)

    async with maker() as setup:
        await setup.execute(delete(Booking).where(Booking.service_type == SERVICE))
        await setup.commit()

    async with maker() as a, maker() as b:
        yield a, b

    async with maker() as cleanup:
        await cleanup.execute(delete(Booking).where(Booking.service_type == SERVICE))
        await cleanup.commit()
    await engine.dispose()


async def _any_user_id(db: AsyncSession) -> int:
    result = await db.execute(select(User.id).limit(1))
    user_id = result.scalar_one_or_none()
    if user_id is None:
        pytest.skip("no users seeded; run scripts/seed_admin.py --apply")
    return user_id


async def _attempt(db: AsyncSession, user_id: int, capacity: int):
    """Run one booking attempt to completion, returning the outcome."""
    try:
        booking = await create_booking(
            db,
            user_id=user_id,
            service_type=SERVICE,
            booking_date=TARGET,
            booking_time=SLOT,
            contact_name="ผู้ทดสอบ",
            phone_number=None,
            note=None,
            config=_config(capacity),
            day_hours=_open_hours(),
        )
        await db.commit()
        return ("ok", booking.queue_number)
    except SlotFullError:
        await db.rollback()
        return ("full", None)
    except Exception as exc:  # pragma: no cover - surfaces real infra failures
        await db.rollback()
        return ("error", repr(exc))


@pytest.mark.asyncio
async def test_only_one_of_two_racing_bookings_takes_the_last_seat(sessions):
    """The phantom-row race: both would pass a naive count-then-insert."""
    db_a, db_b = sessions
    user_id = await _any_user_id(db_a)

    results = await asyncio.gather(
        _attempt(db_a, user_id, capacity=1),
        _attempt(db_b, user_id, capacity=1),
    )
    outcomes = sorted(outcome for outcome, _ in results)

    assert outcomes == ["full", "ok"], f"expected exactly one winner, got {results}"


@pytest.mark.asyncio
async def test_racing_bookings_receive_distinct_queue_numbers(sessions):
    """The day lock also covers the per-day sequence, so no number repeats."""
    db_a, db_b = sessions
    user_id = await _any_user_id(db_a)

    results = await asyncio.gather(
        _attempt(db_a, user_id, capacity=5),
        _attempt(db_b, user_id, capacity=5),
    )
    queue_numbers = [queue for outcome, queue in results if outcome == "ok"]

    assert len(queue_numbers) == 2, f"both should succeed with room to spare: {results}"
    assert len(set(queue_numbers)) == 2, f"duplicate queue number issued: {queue_numbers}"


@pytest.mark.asyncio
async def test_a_cancelled_booking_frees_its_seat(sessions):
    """Capacity counts active bookings only, or a cancellation would strand a slot."""
    db_a, _ = sessions
    user_id = await _any_user_id(db_a)

    outcome, _ = await _attempt(db_a, user_id, capacity=1)
    assert outcome == "ok"

    result = await db_a.execute(
        select(Booking).where(
            Booking.service_type == SERVICE,
            Booking.booking_date == TARGET,
            Booking.booking_time == SLOT,
        )
    )
    booking = result.scalars().first()
    booking.status = BookingStatus.CANCELLED
    await db_a.commit()

    # The seat is free again, so a second attempt at capacity 1 now succeeds.
    outcome_again, _ = await _attempt(db_a, user_id, capacity=1)
    assert outcome_again == "ok"


@pytest.mark.asyncio
async def test_the_advisory_lock_is_actually_held_until_commit(sessions):
    """Directly observe that a second transaction blocks on the same day key."""
    db_a, db_b = sessions
    key = f"booking:{TARGET.isoformat()}"

    await db_a.execute(text("SELECT pg_advisory_xact_lock(hashtext(:key))"), {"key": key})

    async def _try_lock():
        await db_b.execute(text("SELECT pg_advisory_xact_lock(hashtext(:key))"), {"key": key})
        return "acquired"

    task = asyncio.create_task(_try_lock())
    await asyncio.sleep(0.3)
    assert not task.done(), "second transaction should still be waiting on the lock"

    await db_a.commit()  # releases the transaction-scoped lock
    assert await asyncio.wait_for(task, timeout=5) == "acquired"
    await db_b.rollback()
