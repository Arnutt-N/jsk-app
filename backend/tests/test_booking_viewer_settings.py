"""N10: VIEWER gets booking display options, not operational settings."""
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest

from app.api.v1.endpoints import admin_bookings
from app.models.user import UserRole


def _config():
    return SimpleNamespace(
        enabled=True,
        service_types=["ปรึกษากฎหมาย"],
        slot_minutes=30,
        slot_capacity=1,
        advance_days=30,
        blackout_dates=[],
        reminder_enabled=True,
        reminder_lead_value=1,
        reminder_lead_unit="DAY",
        walkin_enabled=True,
        calendar_enabled=True,
        resend_enabled=True,
        assign_enabled=True,
        email_enabled=True,
        line_enabled=True,
    )


async def _settings(role):
    with patch.object(
        admin_bookings,
        "load_booking_config",
        new=AsyncMock(return_value=_config()),
    ):
        return await admin_bookings.get_booking_settings(
            AsyncMock(), SimpleNamespace(role=role)
        )


@pytest.mark.asyncio
async def test_viewer_settings_contain_only_display_fields():
    result = await _settings(UserRole.VIEWER)
    payload = result.model_dump()

    assert set(payload) == {"service_types", "calendar_enabled", "email_enabled"}
    assert payload["service_types"] == ["ปรึกษากฎหมาย"]
    assert payload["calendar_enabled"] is True


@pytest.mark.asyncio
async def test_staff_settings_keep_full_contract():
    result = await _settings(UserRole.AGENT)
    payload = result.model_dump()

    assert payload["assign_enabled"] is True
    assert payload["walkin_enabled"] is True
    assert payload["slot_capacity"] == 1
    assert payload["reminder_enabled"] is True
