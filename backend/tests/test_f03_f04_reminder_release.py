"""F03/F04 release guards: one active attempt, distinct delivery outcomes.

Two real DB sessions prove the guard through conditional UPDATE. The fake
provider is held at a controlled point so the staff-vs-scheduler overlap is
deterministic without blocking an event loop in a TestClient thread.
"""
import uuid
from datetime import time, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import HTTPException
from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool

from app.api.v1.endpoints import admin_bookings
from app.core.config import settings
from app.models.audit_log import AuditLog
from app.models.booking import Booking, BookingStatus
from app.models.user import User, UserRole
from app.services import booking_notifications, booking_service
from app.services.booking_service import BookingConfig, ReminderUnit, local_now
from app.services.delivery_outcome import DeliveryOutcome
from app.tasks import booking_reminder


def _fresh_engine():
    return create_async_engine(str(settings.DATABASE_URL), poolclass=NullPool)


def _config(**overrides):
    values = dict(
        enabled=True,
        service_types=("ปรึกษากฎหมาย",),
        slot_minutes=30,
        slot_capacity=3,
        advance_days=14,
        blackout_dates=frozenset(),
        reminder_enabled=True,
        reminder_lead_value=1,
        reminder_lead_unit=ReminderUnit.DAY,
        email_enabled=False,
        line_enabled=True,
        resend_enabled=True,
    )
    values.update(overrides)
    return BookingConfig(**values)


async def _seed(Session):
    marker = uuid.uuid4().hex[:10]
    async with Session() as session:
        admin = User(
            username=f"f03-admin-{marker}",
            display_name="F03 Admin",
            role=UserRole.ADMIN,
            is_active=True,
        )
        citizen = User(display_name="F03 Citizen")
        session.add(admin)
        session.add(citizen)
        await session.flush()
        booking = Booking(
            user_id=citizen.id,
            service_type="ปรึกษากฎหมาย",
            booking_date=local_now().date() + timedelta(days=7),
            booking_time=time(9, 30),
            queue_number=f"F03-{marker}",
            status=BookingStatus.CONFIRMED,
        )
        session.add(booking)
        await session.flush()
        ids = (booking.id, citizen.id, admin.id)
        await session.commit()
    return ids


async def _cleanup(Session, booking_id, citizen_id, admin_id):
    async with Session() as session:
        await session.execute(
            delete(AuditLog).where(AuditLog.resource_id == str(booking_id))
        )
        await session.execute(delete(Booking).where(Booking.id == booking_id))
        await session.execute(delete(User).where(User.id.in_([citizen_id, admin_id])))
        await session.commit()


async def _state(Session, booking_id):
    async with Session() as session:
        row = (
            await session.execute(
                select(
                    Booking.reminder_sent_at,
                    Booking.reminder_failed_at,
                    Booking.reminder_claimed_at,
                ).where(Booking.id == booking_id)
            )
        ).one()
    return row.reminder_sent_at, row.reminder_failed_at, row.reminder_claimed_at


@pytest.mark.asyncio
async def test_staff_resend_during_a_scheduled_claim_makes_one_provider_call():
    """Two sessions, one held provider: staff cannot start a second call."""
    engine = _fresh_engine()
    Session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    booking_id, citizen_id, admin_id = await _seed(Session)
    calls = []
    staff_status = []

    async def _provider(*_args, **_kwargs):
        calls.append("provider")
        # The worker holds the provider open; staff acts on another session
        # before the worker finalizes its lease.
        async with Session() as staff_db:
            try:
                await admin_bookings.resend_booking_reminder(
                    booking_id=booking_id,
                    db=staff_db,
                    staff=SimpleNamespace(id=admin_id),
                )
                staff_status.append(200)
            except HTTPException as exc:
                staff_status.append(exc.status_code)
        return DeliveryOutcome.SENT

    with (
            patch.object(
                booking_notifications,
                "line_service",
                SimpleNamespace(push_messages=AsyncMock(side_effect=_provider)),
            ),
            patch.object(
                booking_notifications,
                "resolve_raw_for_push",
                new=AsyncMock(return_value="U123"),
            ),
            patch.object(
                booking_notifications,
                "load_booking_config",
                new=AsyncMock(return_value=_config()),
            ),
            patch.object(
                admin_bookings,
                "load_booking_config",
                new=AsyncMock(return_value=_config()),
            ),
        ):
            async with Session() as db:
                token = await booking_service.claim_reminder(db, booking_id)
                await db.commit()
                assert token is not None
                booking = await booking_service.load_booking_for_reminder(db, booking_id, token=token)
                outcome = await booking_notifications.send_booking_reminder_outcome(
                    db, booking, booking.user
                )
                await booking_service.finalize_reminder(db, booking_id, token)
                await db.commit()

    try:
        assert calls == ["provider"]
        assert staff_status == [429]

        sent, failed, claimed = await _state(Session, booking_id)
        assert sent is not None
        assert failed is None
        assert claimed is None
    finally:
        await _cleanup(Session, booking_id, citizen_id, admin_id)
        await engine.dispose()


@pytest.mark.asyncio
async def test_cancellation_before_final_handoff_skips_the_provider():
    engine = _fresh_engine()
    Session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    booking_id, citizen_id, _ = await _seed(Session)
    try:
        async with Session() as db:
            token = await booking_service.claim_reminder(db, booking_id)
            await db.commit()
            assert token is not None

            async with Session() as other:
                await other.execute(
                    update(Booking)
                    .where(Booking.id == booking_id)
                    .values(status=BookingStatus.CANCELLED)
                )
                await other.commit()

            send = AsyncMock(return_value=DeliveryOutcome.SENT)
            cancelled = SimpleNamespace(
                id=booking_id,
                status=BookingStatus.CANCELLED,
                booking_date=local_now().date() + timedelta(days=7),
                booking_time=time(9, 30),
                user=SimpleNamespace(id=citizen_id),
            )
            with (
                patch.object(
                    booking_reminder, "load_booking_config",
                    new=AsyncMock(return_value=_config()),
                ),
                patch.object(
                    booking_reminder, "get_due_reminders",
                    new=AsyncMock(return_value=[cancelled]),
                ),
                patch.object(
                    booking_reminder, "claim_reminder",
                    new=AsyncMock(return_value=token),
                ),
                patch.object(
                    booking_reminder, "load_booking_for_reminder",
                    new=AsyncMock(return_value=cancelled),
                ),
                patch.object(
                    booking_reminder, "verify_reminder_lease",
                    new=AsyncMock(return_value=True),
                ),
                patch.object(
                    booking_reminder, "send_booking_reminder_outcome", new=send,
                ),
            ):
                await booking_reminder._process_due_reminders(db)

            send.assert_not_awaited()
    finally:
        await _cleanup(Session, booking_id, citizen_id, None)
        await engine.dispose()


@pytest.mark.asyncio
async def test_unknown_staff_outcome_records_failure_without_a_sent_marker():
    engine = _fresh_engine()
    Session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    booking_id, citizen_id, admin_id = await _seed(Session)
    try:
        async with Session() as db:
            with (
                patch.object(
                    admin_bookings, "load_booking_config",
                    new=AsyncMock(return_value=_config()),
                ),
                patch.object(
                    admin_bookings,
                    "send_booking_reminder_outcome",
                    new=AsyncMock(return_value=DeliveryOutcome.UNKNOWN),
                ),
                pytest.raises(HTTPException) as exc,
            ):
                await admin_bookings.resend_booking_reminder(
                    booking_id=booking_id,
                    db=db,
                    staff=SimpleNamespace(id=admin_id),
                )
            assert exc.value.status_code == 502

        sent, failed, claimed = await _state(Session, booking_id)
        assert sent is not None
        assert failed is not None
        assert claimed is None
        async with Session() as session:
            outcome = (
                await session.execute(
                    select(AuditLog.details).where(
                        AuditLog.resource_id == str(booking_id),
                        AuditLog.action == "resend_booking_reminder",
                    )
                )
            ).scalar_one()
            assert outcome["outcome"] == DeliveryOutcome.UNKNOWN.value
    finally:
        await _cleanup(Session, booking_id, citizen_id, admin_id)
        await engine.dispose()


@pytest.mark.asyncio
async def test_unknown_outcome_is_not_auto_resent():
    engine = _fresh_engine()
    Session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    booking_id, citizen_id, admin_id = await _seed(Session)
    try:
        async with Session() as db:
            token = await booking_service.claim_reminder(db, booking_id)
            await db.commit()
            await booking_service.clear_reminder_outcome(
                db, booking_id, token, outcome=DeliveryOutcome.UNKNOWN
            )
            await db.commit()
            assert booking_id not in [
                b.id
                for b in await booking_service.get_due_reminders(
                    db,
                    window_start=local_now(),
                    window_end=local_now() + timedelta(days=8),
                )
            ]
    finally:
        await _cleanup(Session, booking_id, citizen_id, admin_id)
        await engine.dispose()


@pytest.mark.asyncio
async def test_temporary_failure_retries_after_the_backoff():
    engine = _fresh_engine()
    Session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    booking_id, citizen_id, _ = await _seed(Session)
    try:
        async with Session() as db:
            token = await booking_service.claim_reminder(db, booking_id)
            await db.commit()
            await booking_service.fail_reminder(db, booking_id, token)
            await db.commit()

            async def due_ids():
                return [
                    b.id
                    for b in await booking_service.get_due_reminders(
                        db,
                        window_start=local_now(),
                        window_end=local_now() + timedelta(days=8),
                    )
                ]

            assert booking_id not in await due_ids()

            async with Session() as other:
                await other.execute(
                    update(Booking)
                    .where(Booking.id == booking_id)
                    .values(
                        reminder_failed_at=func.now()
                        - func.make_interval(
                            0, 0, 0, 0, 0, 0, booking_service.REMINDER_RETRY_DELAY_SECONDS + 1
                        )
                    )
                )
                await other.commit()

            assert booking_id in await due_ids()
    finally:
        await _cleanup(Session, booking_id, citizen_id, None)
        await engine.dispose()


@pytest.mark.asyncio
async def test_temporary_and_definite_provider_errors_are_distinguished():
    booking = SimpleNamespace(
        email=None,
        queue_number="F04-001",
        service_type="ปรึกษากฎหมาย",
        booking_date=local_now().date(),
        booking_time=time(9, 30),
        contact_name="t",
    )
    user = SimpleNamespace(id=1)

    temporary = RuntimeError("LINE API error 429 quota exceeded")
    definite = RuntimeError("LINE API rejected the message: invalid token")

    with (
        patch.object(
            booking_notifications, "load_booking_config",
            new=AsyncMock(return_value=_config(email_enabled=False, line_enabled=True)),
        ),
        patch.object(
            booking_notifications, "resolve_raw_for_push",
            new=AsyncMock(return_value="U123"),
        ),
    ):
        with patch.object(
            booking_notifications.line_service, "push_messages",
            new=AsyncMock(side_effect=temporary),
        ):
            temp_outcome = await booking_notifications.send_booking_reminder_outcome(
                AsyncMock(), booking, user
            )
        with patch.object(
            booking_notifications.line_service, "push_messages",
            new=AsyncMock(side_effect=definite),
        ):
            definite_outcome = await booking_notifications.send_booking_reminder_outcome(
                AsyncMock(), booking, user
            )

    assert temp_outcome is DeliveryOutcome.TEMPORARY_FAILURE
    assert definite_outcome is DeliveryOutcome.UNKNOWN
