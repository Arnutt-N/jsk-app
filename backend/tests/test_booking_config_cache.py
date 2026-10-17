"""Booking-config cache behaviour."""
from typing import cast

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

pytestmark = pytest.mark.asyncio

from app.services import booking_settings
from app.services.booking_settings import (
    BookingConfig,
    DEFAULTS,
    load_booking_config,
    save_booking_config,
)
from app.services.settings_service import SettingsService

ALL_KEYS_COUNT = 9

FAKE_DB = cast(AsyncSession, object())


@pytest.fixture
def counting_settings(monkeypatch):
    calls: list[str] = []

    async def fake_get(db, key, default=""):
        calls.append(key)
        return default

    async def fake_set(db, key, value, description=None):
        calls.append(f"set:{key}")
        return None

    monkeypatch.setattr(SettingsService, "get_setting", staticmethod(fake_get))
    monkeypatch.setattr(SettingsService, "set_setting", staticmethod(fake_set))
    return calls


@pytest.fixture
def cold_cache(monkeypatch):
    monkeypatch.setattr(booking_settings, "_cached_config", None)
    monkeypatch.setattr(booking_settings, "_cached_at", 0.0)
    return booking_settings


@pytest.fixture
def frozen_time(monkeypatch):
    now = {"t": 1000.0}
    monkeypatch.setattr(booking_settings, "monotonic", lambda: now["t"])
    return now


async def test_second_load_within_ttl_reads_zero_settings(
    counting_settings, cold_cache, frozen_time
):
    first = await load_booking_config(FAKE_DB)
    assert len(counting_settings) == ALL_KEYS_COUNT

    second = await load_booking_config(FAKE_DB)
    assert second is first
    assert len(counting_settings) == ALL_KEYS_COUNT


async def test_expired_ttl_reloads(counting_settings, cold_cache, frozen_time):
    await load_booking_config(FAKE_DB)
    frozen_time["t"] += 61.0

    config = await load_booking_config(FAKE_DB)
    assert isinstance(config, BookingConfig)
    assert len(counting_settings) == 2 * ALL_KEYS_COUNT


async def test_fresh_bypass_ignores_cache_and_refreshes_it(
    counting_settings, cold_cache, frozen_time
):
    await load_booking_config(FAKE_DB)
    frozen_time["t"] += 1.0

    config = await load_booking_config(FAKE_DB, fresh=True)
    assert isinstance(config, BookingConfig)
    assert len(counting_settings) == 2 * ALL_KEYS_COUNT

    await load_booking_config(FAKE_DB)
    assert len(counting_settings) == 2 * ALL_KEYS_COUNT


async def test_cold_open_cost_is_nine_reads_not_twenty_seven(
    counting_settings, cold_cache, frozen_time
):
    for _ in range(3):
        await load_booking_config(FAKE_DB)
    assert len(counting_settings) == ALL_KEYS_COUNT


async def test_save_invalidates(counting_settings, cold_cache, frozen_time):
    await load_booking_config(FAKE_DB)
    assert len(counting_settings) == ALL_KEYS_COUNT

    await save_booking_config(FAKE_DB, DEFAULTS)

    await load_booking_config(FAKE_DB)
    assert len(counting_settings) == 2 * ALL_KEYS_COUNT + ALL_KEYS_COUNT
