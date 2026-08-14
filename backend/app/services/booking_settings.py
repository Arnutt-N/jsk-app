"""Read and write the admin-editable booking configuration.

Values live in `system_settings` as free text, so every read has to survive an
admin typo. The reminder scheduler reloads this on every pass — a parse error
that raised would take the background loop down with it — so a bad value falls
back to its default and is logged rather than propagated.
"""
import json
import logging
from datetime import date
from typing import Any, Callable, Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.services.booking_service import BookingConfig, ReminderUnit
from app.services.settings_service import SettingsService

logger = logging.getLogger(__name__)


KEY_ENABLED = "booking_enabled"
KEY_SERVICE_TYPES = "booking_service_types"
KEY_SLOT_MINUTES = "booking_slot_minutes"
KEY_SLOT_CAPACITY = "booking_slot_capacity"
KEY_ADVANCE_DAYS = "booking_advance_days"
KEY_BLACKOUT_DATES = "booking_blackout_dates"
KEY_REMINDER_ENABLED = "booking_reminder_enabled"
KEY_REMINDER_LEAD_VALUE = "booking_reminder_lead_value"
KEY_REMINDER_LEAD_UNIT = "booking_reminder_lead_unit"

ALL_KEYS = (
    KEY_ENABLED,
    KEY_SERVICE_TYPES,
    KEY_SLOT_MINUTES,
    KEY_SLOT_CAPACITY,
    KEY_ADVANCE_DAYS,
    KEY_BLACKOUT_DATES,
    KEY_REMINDER_ENABLED,
    KEY_REMINDER_LEAD_VALUE,
    KEY_REMINDER_LEAD_UNIT,
)

# Booking starts switched off with no services listed: a half-configured feature
# must not quietly start accepting public appointments.
DEFAULTS = BookingConfig(
    enabled=False,
    service_types=(),
    slot_minutes=30,
    slot_capacity=3,
    advance_days=14,
    blackout_dates=frozenset(),
    reminder_enabled=False,
    reminder_lead_value=1,
    reminder_lead_unit=ReminderUnit.DAY,
)

_TRUTHY = {"true", "1", "yes", "on"}

# Minimum viable slot length. Zero or negative would make the slot-generation
# loop advance by nothing and never terminate.
MIN_SLOT_MINUTES = 1


def _parse_bool(raw: str) -> bool:
    return raw.strip().lower() in _TRUTHY


def _parse_int(raw: str, *, key: str, default: int, minimum: int) -> int:
    try:
        value = int(str(raw).strip())
    except (TypeError, ValueError):
        logger.warning("Ignoring invalid %s=%r; using default %s", key, raw, default)
        return default
    if value < minimum:
        logger.warning("Clamping %s=%s up to the minimum %s", key, value, minimum)
        return minimum
    return value


def _parse_json_list(raw: str, *, key: str) -> Optional[list]:
    try:
        parsed = json.loads(raw)
    except (TypeError, ValueError):
        logger.warning("Ignoring malformed JSON in %s=%r", key, raw)
        return None
    if not isinstance(parsed, list):
        logger.warning("Ignoring %s: expected a JSON list, got %s", key, type(parsed).__name__)
        return None
    return parsed


def _parse_service_types(raw: str) -> Optional[tuple]:
    items = _parse_json_list(raw, key=KEY_SERVICE_TYPES)
    if items is None:
        return None
    return tuple(str(item) for item in items)


def _parse_blackout_dates(raw: str) -> Optional[frozenset]:
    items = _parse_json_list(raw, key=KEY_BLACKOUT_DATES)
    if items is None:
        return None
    parsed = set()
    for item in items:
        try:
            parsed.add(date.fromisoformat(str(item)))
        except ValueError:
            # One bad entry must not discard the whole holiday list.
            logger.warning("Skipping unparseable blackout date %r in %s", item, KEY_BLACKOUT_DATES)
    return frozenset(parsed)


def _parse_reminder_unit(raw: str) -> Optional[ReminderUnit]:
    try:
        return ReminderUnit(raw.strip().upper())
    except ValueError:
        logger.warning(
            "Ignoring unknown %s=%r; using default %s",
            KEY_REMINDER_LEAD_UNIT,
            raw,
            DEFAULTS.reminder_lead_unit.value,
        )
        return None


def _coalesce(raw: str, parser: Callable[[str], Any], default: Any) -> Any:
    """Apply `parser` to a non-empty value, falling back to `default`."""
    if raw is None or str(raw).strip() == "":
        return default
    parsed = parser(raw)
    return default if parsed is None else parsed


async def load_booking_config(db: AsyncSession) -> BookingConfig:
    """Build a typed, immutable config from `system_settings`.

    Never raises: an unreadable value degrades to its default so the reminder
    loop and the public booking endpoints keep working.
    """

    async def get(key: str) -> str:
        return await SettingsService.get_setting(db, key, "")

    return BookingConfig(
        enabled=_coalesce(await get(KEY_ENABLED), _parse_bool, DEFAULTS.enabled),
        service_types=_coalesce(
            await get(KEY_SERVICE_TYPES), _parse_service_types, DEFAULTS.service_types
        ),
        slot_minutes=_parse_int(
            await get(KEY_SLOT_MINUTES) or DEFAULTS.slot_minutes,
            key=KEY_SLOT_MINUTES,
            default=DEFAULTS.slot_minutes,
            minimum=MIN_SLOT_MINUTES,
        ),
        slot_capacity=_parse_int(
            await get(KEY_SLOT_CAPACITY) or DEFAULTS.slot_capacity,
            key=KEY_SLOT_CAPACITY,
            default=DEFAULTS.slot_capacity,
            minimum=0,
        ),
        advance_days=_parse_int(
            await get(KEY_ADVANCE_DAYS) or DEFAULTS.advance_days,
            key=KEY_ADVANCE_DAYS,
            default=DEFAULTS.advance_days,
            minimum=0,
        ),
        blackout_dates=_coalesce(
            await get(KEY_BLACKOUT_DATES), _parse_blackout_dates, DEFAULTS.blackout_dates
        ),
        reminder_enabled=_coalesce(
            await get(KEY_REMINDER_ENABLED), _parse_bool, DEFAULTS.reminder_enabled
        ),
        reminder_lead_value=_parse_int(
            await get(KEY_REMINDER_LEAD_VALUE) or DEFAULTS.reminder_lead_value,
            key=KEY_REMINDER_LEAD_VALUE,
            default=DEFAULTS.reminder_lead_value,
            minimum=1,
        ),
        reminder_lead_unit=_coalesce(
            await get(KEY_REMINDER_LEAD_UNIT), _parse_reminder_unit, DEFAULTS.reminder_lead_unit
        ),
    )


async def save_booking_config(db: AsyncSession, config: BookingConfig) -> BookingConfig:
    """Persist a validated config. Validation belongs to the API schema layer."""
    values = {
        KEY_ENABLED: "true" if config.enabled else "false",
        KEY_SERVICE_TYPES: json.dumps(list(config.service_types), ensure_ascii=False),
        KEY_SLOT_MINUTES: str(config.slot_minutes),
        KEY_SLOT_CAPACITY: str(config.slot_capacity),
        KEY_ADVANCE_DAYS: str(config.advance_days),
        KEY_BLACKOUT_DATES: json.dumps(
            sorted(d.isoformat() for d in config.blackout_dates), ensure_ascii=False
        ),
        KEY_REMINDER_ENABLED: "true" if config.reminder_enabled else "false",
        KEY_REMINDER_LEAD_VALUE: str(config.reminder_lead_value),
        KEY_REMINDER_LEAD_UNIT: config.reminder_lead_unit.value,
    }
    for key, value in values.items():
        await SettingsService.set_setting(db, key, value)
    return config
