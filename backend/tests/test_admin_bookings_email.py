from datetime import date, time
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from app.api.v1.endpoints import admin_bookings
from app.schemas.booking import BookingCreate, BookingSettingsIn
from app.services import booking_email, booking_notifications
from app.services.booking_email import (
    build_confirmation_email,
    build_reminder_email,
    send_booking_email,
)
from app.services.booking_service import ReminderUnit


def _booking(**overrides):
    values = {
        "queue_number": "261019-002",
        "service_type": "ปรึกษากฎหมาย",
        "booking_date": date(2026, 8, 19),
        "booking_time": time(9, 30),
        "contact_name": "สมชาย ใจดี",
        "email": None,
    }
    values.update(overrides)
    return SimpleNamespace(**values)


def _config(**overrides):
    values = {"email_enabled": True}
    values.update(overrides)
    return SimpleNamespace(**values)


def _smtp_settings(**overrides):
    values = {
        "SMTP_HOST": "mail.example.com",
        "SMTP_PORT": 587,
        "SMTP_USERNAME": "",
        "SMTP_PASSWORD": "",
        "SMTP_FROM": "noreply@example.com",
        "SMTP_USE_TLS": True,
    }
    values.update(overrides)
    return SimpleNamespace(**values)



@pytest.mark.asyncio
async def test_confirmation_with_email_skips_line_push():
    db = AsyncMock()
    booking = _booking(email="citizen@example.com")
    with patch.object(
        booking_notifications, "load_booking_config", new=AsyncMock(return_value=_config())
    ), patch.object(
        booking_notifications, "send_booking_email", new=AsyncMock(return_value=True)
    ) as mail, patch.object(
        booking_notifications, "_push_flex", new=AsyncMock()
    ) as push:
        assert await booking_notifications.notify_booking_confirmed(db, booking, SimpleNamespace()) is True
    mail.assert_awaited_once()
    push.assert_not_awaited()


@pytest.mark.asyncio
async def test_confirmation_without_email_pushes_to_line():
    db = AsyncMock()
    booking = _booking()
    with patch.object(
        booking_notifications, "load_booking_config", new=AsyncMock(return_value=_config())
    ), patch.object(
        booking_notifications, "send_booking_email", new=AsyncMock()
    ) as mail, patch.object(
        booking_notifications, "_push_flex", new=AsyncMock(return_value=True)
    ) as push:
        assert await booking_notifications.notify_booking_confirmed(db, booking, SimpleNamespace()) is True
    mail.assert_not_awaited()
    push.assert_awaited_once()


@pytest.mark.asyncio
async def test_reminder_with_email_skips_line_push():
    db = AsyncMock()
    booking = _booking(email="citizen@example.com")
    with patch.object(
        booking_notifications, "load_booking_config", new=AsyncMock(return_value=_config())
    ), patch.object(
        booking_notifications, "send_booking_email", new=AsyncMock(return_value=True)
    ) as mail, patch.object(
        booking_notifications, "_push_flex", new=AsyncMock()
    ) as push:
        assert await booking_notifications.send_booking_reminder(db, booking, SimpleNamespace()) is True
    mail.assert_awaited_once()
    push.assert_not_awaited()


@pytest.mark.asyncio
async def test_email_toggle_off_falls_back_to_push():
    db = AsyncMock()
    booking = _booking(email="citizen@example.com")
    with patch.object(
        booking_notifications,
        "load_booking_config",
        new=AsyncMock(return_value=_config(email_enabled=False)),
    ), patch.object(
        booking_notifications, "send_booking_email", new=AsyncMock()
    ) as mail, patch.object(
        booking_notifications, "_push_flex", new=AsyncMock(return_value=True)
    ) as push:
        assert await booking_notifications.send_booking_reminder(db, booking, SimpleNamespace()) is True
    mail.assert_not_awaited()
    push.assert_awaited_once()



@pytest.mark.asyncio
async def test_unconfigured_smtp_is_a_clean_false():
    with patch.object(booking_email, "settings", _smtp_settings(SMTP_HOST="")):
        assert await send_booking_email("a@b.co", "s", "b") is False


@pytest.mark.asyncio
async def test_smtp_failure_is_a_clean_false():
    with patch.object(booking_email, "settings", _smtp_settings()), patch(
        "smtplib.SMTP", side_effect=OSError("down")
    ):
        assert await send_booking_email("a@b.co", "s", "b") is False


def test_templates_render_buddhist_era_dates():
    subject, body = build_confirmation_email(_booking())
    assert "261019-002" in subject
    assert "19/8/2569" in body
    reminder_subject, reminder_body = build_reminder_email(_booking())
    assert "261019-002" in reminder_subject
    assert "19/8/2569" in reminder_body



def _settings_payload(**overrides):
    values = {
        "enabled": True,
        "service_types": ["ปรึกษากฎหมาย"],
        "slot_minutes": 30,
        "slot_capacity": 3,
        "advance_days": 14,
        "blackout_dates": [],
        "reminder_enabled": False,
        "reminder_lead_value": 1,
        "reminder_lead_unit": ReminderUnit.DAY,
        "email_enabled": True,
    }
    values.update(overrides)
    return values


def test_settings_accepts_the_email_toggle():
    assert BookingSettingsIn(**_settings_payload()).email_enabled is True
    assert BookingSettingsIn(**_settings_payload(email_enabled=False)).email_enabled is False


def _create_payload(**overrides):
    values = {
        "service_type": "ปรึกษากฎหมาย",
        "booking_date": date(2026, 8, 19),
        "booking_time": time(9, 0),
    }
    values.update(overrides)
    return BookingCreate(**values)


def test_create_rejects_a_bad_email_with_422_shape():
    with pytest.raises(ValidationError):
        _create_payload(email="not-an-email")


def test_create_accepts_a_blank_email_as_none():
    assert _create_payload(email="  ").email is None


@pytest.mark.asyncio
async def test_walkin_rejects_email_when_the_channel_is_off():
    db = AsyncMock()
    payload = _create_payload(email="citizen@example.com")
    with patch.object(
        admin_bookings,
        "load_booking_config",
        new=AsyncMock(return_value=SimpleNamespace(walkin_enabled=True, email_enabled=False)),
    ), pytest.raises(HTTPException) as exc:
        await admin_bookings.create_walkin_booking(
            payload, db=db, staff=SimpleNamespace(id=2)
        )
    assert exc.value.status_code == 422
