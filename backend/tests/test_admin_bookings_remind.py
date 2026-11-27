from datetime import datetime, time, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import HTTPException

from app.api.v1.endpoints import admin_bookings
from app.models.booking import BookingStatus
from app.services.booking_service import local_now
from app.services.delivery_outcome import DeliveryOutcome as ReminderOutcome


@pytest.fixture(autouse=True)
def _clear_outcome_ok(monkeypatch):
    monkeypatch.setattr(admin_bookings, "clear_reminder_outcome", AsyncMock(return_value=True))


def _config(**overrides):
    values = {"resend_enabled": True}
    values.update(overrides)
    return SimpleNamespace(**values)


def _stored_booking(**overrides):
    values = {
        "id": 11,
        "service_type": "ปรึกษากฎหมาย",
        "booking_date": local_now().date() + timedelta(days=30),
        "booking_time": time(9, 30),
        "queue_number": "261019-002",
        "status": BookingStatus.CONFIRMED,
        "contact_name": "สมชาย ใจดี",
        "phone_number": "0812345678",
        "note": None,
        "reminder_sent_at": None,
        "user": SimpleNamespace(id=7),
    }
    values.update(overrides)
    return SimpleNamespace(**values)


def _patches(db, booking, sent=True, claimed=1):
    claim = patch.object(
        admin_bookings.booking_service,
        "claim_reminder_for_staff",
        new=AsyncMock(return_value=datetime(2026, 8, 12, 8, 30) if claimed else None),
    )
    config = patch.object(
        admin_bookings, "load_booking_config", new=AsyncMock(return_value=_config())
    )
    loader = patch.object(
        admin_bookings.booking_service,
        "load_booking_for_reminder",
        new=AsyncMock(return_value=booking),
    )
    sender = patch.object(
        admin_bookings, "send_booking_reminder_outcome", new=AsyncMock(return_value=ReminderOutcome.SENT if sent else ReminderOutcome.NOT_SENT)
    )
    audit = patch.object(admin_bookings, "create_audit_log", new=AsyncMock())
    return claim, config, loader, sender, audit


def _call(db, booking_id=11):
    return admin_bookings.resend_booking_reminder(
        booking_id=booking_id, db=db, staff=SimpleNamespace(id=2)
    )


@pytest.mark.asyncio
async def test_resend_sends_pushes_and_audits():
    db = AsyncMock()
    claim, config, loader, sender, audit = _patches(db, _stored_booking())
    with claim, config, loader, sender as push, audit as log:
        result = await _call(db)

    push.assert_awaited_once()
    assert log.await_args.kwargs["action"] == "resend_booking_reminder"
    assert log.await_args.kwargs["admin_id"] == 2
    assert result.queue_number == "261019-002"
    db.commit.assert_awaited()


@pytest.mark.asyncio
async def test_resend_losing_the_claim_race_is_rejected():
    db = AsyncMock()
    booking = _stored_booking()
    claim, config, loader, sender, audit = _patches(db, booking, claimed=0)
    with claim, config, loader, sender as push, audit, pytest.raises(HTTPException) as exc:
        await _call(db)
    assert exc.value.status_code == 429
    push.assert_not_awaited()


@pytest.mark.asyncio
async def test_resend_needs_a_confirmed_booking():
    db = AsyncMock()
    booking = _stored_booking(status=BookingStatus.CANCELLED)
    claim, config, loader, sender, audit = _patches(db, booking)
    with config, loader, sender as push, audit, pytest.raises(HTTPException) as exc:
        await _call(db)
    assert exc.value.status_code == 409
    push.assert_not_awaited()


@pytest.mark.asyncio
async def test_resend_past_appointment_is_rejected():
    db = AsyncMock()
    booking = _stored_booking(
        booking_date=local_now().date() - timedelta(days=1),
    )
    claim, config, loader, sender, audit = _patches(db, booking)
    with config, loader, sender as push, audit, pytest.raises(HTTPException) as exc:
        await _call(db)
    assert exc.value.status_code == 409
    push.assert_not_awaited()


@pytest.mark.asyncio
async def test_resend_disabled_is_rejected_before_touching_the_database():
    db = AsyncMock()
    with patch.object(
        admin_bookings,
        "load_booking_config",
        new=AsyncMock(return_value=_config(resend_enabled=False)),
    ), pytest.raises(HTTPException) as exc:
        await _call(db)
    assert exc.value.status_code == 403
    db.execute.assert_not_called()


@pytest.mark.asyncio
async def test_resend_unknown_booking_is_404():
    db = AsyncMock()
    with patch.object(
        admin_bookings, "load_booking_config", new=AsyncMock(return_value=_config())
    ), patch.object(
        admin_bookings.booking_service,
        "load_booking_for_reminder",
        new=AsyncMock(return_value=None),
    ), pytest.raises(HTTPException) as exc:
        await _call(db, booking_id=999)
    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_resend_failure_records_the_outcome_and_reports_502():
    db = AsyncMock()
    claim, config, loader, sender, audit = _patches(db, _stored_booking(), sent=False)
    with claim, config, loader, sender, audit as log, pytest.raises(HTTPException) as exc:
        await _call(db)
    assert exc.value.status_code == 502
    assert log.await_args.kwargs["details"]["outcome"] == ReminderOutcome.NOT_SENT.value
    db.rollback.assert_not_awaited()
    db.commit.assert_awaited()
