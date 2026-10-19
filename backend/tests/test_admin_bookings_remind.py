from datetime import date, datetime, time, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import HTTPException

from app.api.v1.endpoints import admin_bookings
from app.models.booking import BookingStatus


def _config(**overrides):
    values = {"resend_enabled": True}
    values.update(overrides)
    return SimpleNamespace(**values)


def _stored_booking(**overrides):
    values = {
        "id": 11,
        "service_type": "ปรึกษากฎหมาย",
        "booking_date": date(2026, 10, 19),
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


def _patches(db, booking, sent=True):
    config = patch.object(
        admin_bookings, "load_booking_config", new=AsyncMock(return_value=_config())
    )
    loader = patch.object(
        admin_bookings.booking_service,
        "load_booking_for_reminder",
        new=AsyncMock(return_value=booking),
    )
    sender = patch.object(
        admin_bookings, "send_booking_reminder", new=AsyncMock(return_value=sent)
    )
    audit = patch.object(admin_bookings, "create_audit_log", new=AsyncMock())
    return config, loader, sender, audit


def _call(db, booking_id=11):
    return admin_bookings.resend_booking_reminder(
        booking_id=booking_id, db=db, staff=SimpleNamespace(id=2)
    )


@pytest.mark.asyncio
async def test_resend_sends_pushes_and_audits():
    db = AsyncMock()
    config, loader, sender, audit = _patches(db, _stored_booking())
    with config, loader, sender as push, audit as log:
        result = await _call(db)

    push.assert_awaited_once()
    assert log.await_args.kwargs["action"] == "resend_booking_reminder"
    assert log.await_args.kwargs["admin_id"] == 2
    assert result.queue_number == "261019-002"
    db.commit.assert_awaited()


@pytest.mark.asyncio
async def test_resend_within_a_minute_is_rejected():
    db = AsyncMock()
    booking = _stored_booking(reminder_sent_at=datetime.now(timezone.utc))
    config, loader, sender, audit = _patches(db, booking)
    with config, loader, sender, audit:
        with pytest.raises(HTTPException) as exc:
            await _call(db)
    assert exc.value.status_code == 429


@pytest.mark.asyncio
async def test_resend_needs_a_confirmed_booking():
    db = AsyncMock()
    booking = _stored_booking(status=BookingStatus.CANCELLED)
    config, loader, sender, audit = _patches(db, booking)
    with config, loader, sender as push, audit:
        with pytest.raises(HTTPException) as exc:
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
    ):
        with pytest.raises(HTTPException) as exc:
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
    ):
        with pytest.raises(HTTPException) as exc:
            await _call(db, booking_id=999)
    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_resend_push_failure_is_502_without_a_stamp():
    db = AsyncMock()
    config, loader, sender, audit = _patches(db, _stored_booking(), sent=False)
    with config, loader, sender, audit as log:
        with pytest.raises(HTTPException) as exc:
            await _call(db)
    assert exc.value.status_code == 502
    log.assert_not_awaited()
    db.commit.assert_not_awaited()
