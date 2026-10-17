"""Booking-config cache: 60s TTL, writer-invalidate, scheduler bypass.

Measurement, not guesswork: every load pays exactly 9 settings SELECTs on a
miss and 0 on a hit. A booking cold open chains 3 loads
(options → range → day), so the cache takes it from 27 reads to 9. The
remaining cost — 3 serial LINE token-verify round-trips — is out of scope
(caching identity verification is a security call, recorded as a follow-up).
"""
import pytest

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
    first = await load_booking_config(object())  # type: ignore[arg-type]
    assert len(counting_settings) == ALL_KEYS_COUNT

    second = await load_booking_config(object())  # type: ignore[arg-type]
    assert second is first
    assert len(counting_settings) == ALL_KEYS_COUNT


async def test_expired_ttl_reloads(counting_settings, cold_cache, frozen_time):
    await load_booking_config(object())  # type: ignore[arg-type]
    frozen_time["t"] += 61.0

    config = await load_booking_config(object())  # type: ignore[arg-type]
    assert isinstance(config, BookingConfig)
    assert len(counting_settings) == 2 * ALL_KEYS_COUNT


async def test_fresh_bypass_ignores_cache_and_refreshes_it(
    counting_settings, cold_cache, frozen_time
):
    await load_booking_config(object())  # type: ignore[arg-type]
    frozen_time["t"] += 1.0

    config = await load_booking_config(object(), fresh=True)  # type: ignore[arg-type]
    assert isinstance(config, BookingConfig)
    assert len(counting_settings) == 2 * ALL_KEYS_COUNT

    # The bypassed read re-primes the cache: the next normal load is a hit.
    await load_booking_config(object())  # type: ignore[arg-type]
    assert len(counting_settings) == 2 * ALL_KEYS_COUNT


async def test_cold_open_cost_is_nine_reads_not_twenty_seven(
    counting_settings, cold_cache, frozen_time
):
    """The 3-request frontend waterfall (options → range → day) shares one fill."""
    for _ in range(3):
        await load_booking_config(object())  # type: ignore[arg-type]
    assert len(counting_settings) == ALL_KEYS_COUNT


async def test_save_invalidates(counting_settings, cold_cache, frozen_time):
    await load_booking_config(object())  # type: ignore[arg-type]
    assert len(counting_settings) == ALL_KEYS_COUNT

    await save_booking_config(object(), DEFAULTS)  # type: ignore[arg-type]

    await load_booking_config(object())  # type: ignore[arg-type]
    assert len(counting_settings) == 2 * ALL_KEYS_COUNT + ALL_KEYS_COUNT
