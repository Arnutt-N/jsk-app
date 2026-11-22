"""F2 reminder lease: real-DB proof of the CAS guards and stale-lease reclaim.

Mocks assert the SQL was called; these tests prove the guards *work* against
Postgres: terminal failure, cancelled-after-claim skip, stale lease reclaim,
and token-scoped finalize. Each test seeds and cleans its own rows.
"""
import uuid
from datetime import time, timedelta
from unittest.mock import AsyncMock, patch

import pytest
from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool

from app.core.config import settings
from app.models.booking import Booking, BookingStatus
from app.models.user import User
from app.services import booking_service
from app.services.booking_service import BookingConfig, ReminderUnit, local_now
from app.services.business_hours_service import BANGKOK_TZ
from app.tasks import booking_reminder


def _fresh_engine():
    return create_async_engine(str(settings.DATABASE_URL), poolclass=NullPool)


async def _seed(Session, *, status=BookingStatus.CONFIRMED, when=None, claimed_at=None):
    marker = uuid.uuid4().hex[:10]
    target = when or (local_now().date() + timedelta(days=7))
    async with Session() as session:
        citizen = User(display_name="Lease Citizen")
        session.add(citizen)
        await session.flush()
        booking = Booking(
            user_id=citizen.id,
            service_type="ปรึกษากฎหมาย",
            booking_date=target,
            booking_time=time(9, 30),
            queue_number=f"LEASE-{marker}",
            status=status,
            reminder_claimed_at=claimed_at,
        )
        session.add(booking)
        await session.flush()
        ids = (booking.id, citizen.id)
        await session.commit()
    return ids


async def _cleanup(Session, booking_id, user_id):
    async with Session() as session:
        await session.execute(delete(Booking).where(Booking.id == booking_id))
        await session.execute(delete(User).where(User.id == user_id))
        await session.commit()


async def _state(Session, booking_id):
    async with Session() as session:
        row = (
            await session.execute(
                select(
                    Booking.reminder_sent_at,
                    Booking.reminder_claimed_at,
                    Booking.status,
                ).where(Booking.id == booking_id)
            )
        ).one()
    return row.reminder_sent_at, row.reminder_claimed_at, row.status


@pytest.mark.asyncio
async def test_claim_then_finalize_sets_sent_only_for_the_owning_token():
    engine = _fresh_engine()
    Session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    booking_id, user_id = await _seed(Session)
    try:
        async with Session() as db:
            token = await booking_service.claim_reminder(db, booking_id)
            await db.commit()
            assert token is not None
            # A different token must not finalize this lease.
            assert await booking_service.finalize_reminder(
                db, booking_id, token - timedelta(seconds=1)
            ) is False
            sent, claimed, _ = await _state(Session, booking_id)
            assert sent is None and claimed is not None
            # The owning token finalizes and clears the lease.
            assert await booking_service.finalize_reminder(db, booking_id, token) is True
            await db.commit()
            sent, claimed, _ = await _state(Session, booking_id)
            assert sent is not None and claimed is None
    finally:
        await _cleanup(Session, booking_id, user_id)
        await engine.dispose()


@pytest.mark.asyncio
async def test_failed_reminder_is_excluded_from_later_passes():
    engine = _fresh_engine()
    Session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    booking_id, user_id = await _seed(Session)
    try:
        async with Session() as db:
            token = await booking_service.claim_reminder(db, booking_id)
            await db.commit()
            await booking_service.fail_reminder(db, booking_id, token)
            await db.commit()
            _, claimed, _ = await _state(Session, booking_id)
            assert claimed is None
            due = await booking_service.get_due_reminders(
                db,
                window_start=local_now(),
                window_end=local_now() + timedelta(days=7),
            )
            assert booking_id not in [row.id for row in due]
            assert await booking_service.claim_reminder(db, booking_id) is None
    finally:
        await _cleanup(Session, booking_id, user_id)
        await engine.dispose()


@pytest.mark.asyncio
async def test_claim_guard_rejects_cancelled_booking():
    engine = _fresh_engine()
    Session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    booking_id, user_id = await _seed(Session, status=BookingStatus.CANCELLED)
    try:
        async with Session() as db:
            assert await booking_service.claim_reminder(db, booking_id) is None
            sent, claimed, _ = await _state(Session, booking_id)
            assert sent is None and claimed is None
    finally:
        await _cleanup(Session, booking_id, user_id)
        await engine.dispose()


@pytest.mark.asyncio
async def test_claim_guard_rejects_past_appointment():
    engine = _fresh_engine()
    Session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    booking_id, user_id = await _seed(Session, when=local_now().date() - timedelta(days=1))
    try:
        async with Session() as db:
            assert await booking_service.claim_reminder(db, booking_id) is None
    finally:
        await _cleanup(Session, booking_id, user_id)
        await engine.dispose()


@pytest.mark.asyncio
async def test_stale_lease_can_be_reclaimed():
    engine = _fresh_engine()
    Session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    stale = BANGKOK_TZ.localize(local_now()) - timedelta(
        seconds=booking_service.REMINDER_CLAIM_TTL_SECONDS + 5
    )
    booking_id, user_id = await _seed(Session, claimed_at=stale)
    try:
        async with Session() as db:
            token = await booking_service.claim_reminder(db, booking_id)
            await db.commit()
            assert token is not None
            _, claimed, _ = await _state(Session, booking_id)
            assert claimed is not None and claimed != stale
    finally:
        await _cleanup(Session, booking_id, user_id)
        await engine.dispose()


@pytest.mark.asyncio
async def test_live_lease_is_excluded_from_due_query():
    engine = _fresh_engine()
    Session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    booking_id, user_id = await _seed(Session, claimed_at=local_now())
    try:
        async with Session() as db:
            now = local_now()
            due = await booking_service.get_due_reminders(
                db,
                window_start=now,
                window_end=now + timedelta(days=1),
            )
            assert all(b.id != booking_id for b in due)
    finally:
        await _cleanup(Session, booking_id, user_id)
        await engine.dispose()


@pytest.mark.asyncio
async def test_cancellation_after_claim_is_seen_on_reload_and_blocks_reminder():
    """Two real connections: cancel after claim, reload must see CANCELLED.

    The worker loads the booking into its session before claiming. A plain
    reselect returns that same stale object, so a later cancellation in another
    connection is invisible and the reminder is sent to a cancelled booking.
    """
    engine = _fresh_engine()
    Session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    booking_id, user_id = await _seed(Session)
    try:
        async with Session() as db:
            now = local_now()
            due = await booking_service.get_due_reminders(
                db, window_start=now, window_end=now + timedelta(days=8)
            )
            assert any(b.id == booking_id for b in due)

            token = await booking_service.claim_reminder(db, booking_id)
            await db.commit()
            assert token is not None

            # A different connection cancels while session A still holds the
            # CONFIRMED object in its identity map.
            async with Session() as other:
                await other.execute(
                    update(Booking)
                    .where(Booking.id == booking_id)
                    .values(status=BookingStatus.CANCELLED)
                )
                await other.commit()

            reloaded = await booking_service.load_booking_for_reminder(db, booking_id)
            assert reloaded.status == BookingStatus.CANCELLED

            config = BookingConfig(
                enabled=True,
                service_types=("ปรึกษากฎหมาย",),
                slot_minutes=30,
                slot_capacity=3,
                advance_days=14,
                blackout_dates=frozenset(),
                reminder_enabled=True,
                reminder_lead_value=1,
                reminder_lead_unit=ReminderUnit.DAY,
                email_enabled=True,
            )
            send = AsyncMock()
            with (
                patch.object(
                    booking_reminder, "load_booking_config",
                    new=AsyncMock(return_value=config),
                ),
                patch.object(
                    booking_reminder, "get_due_reminders",
                    new=AsyncMock(return_value=due),
                ),
                patch.object(
                    booking_reminder, "claim_reminder",
                    new=AsyncMock(return_value=token),
                ),
                patch.object(
                    booking_reminder, "send_booking_reminder_outcome", new=send,
                ),
            ):
                await booking_reminder._process_due_reminders(db)

            send.assert_not_awaited()
            sent, claimed, status = await _state(Session, booking_id)
            assert sent is None
            assert claimed is None
            assert status == BookingStatus.CANCELLED
    finally:
        await _cleanup(Session, booking_id, user_id)
        await engine.dispose()
