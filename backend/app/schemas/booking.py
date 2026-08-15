"""Request/response schemas for appointment booking.

Validation here is the outer boundary: anything reaching the service layer has
already been shape-checked, so the service can focus on the rules that need a
database (capacity, duplicates) rather than re-checking field types.
"""
from datetime import date, time
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.services.booking_service import ReminderUnit


class SlotOut(BaseModel):
    """One bookable slot as the LIFF app sees it."""

    time: time
    capacity: int
    booked: int
    remaining: int
    is_full: bool


class BookingOptionsOut(BaseModel):
    """What the LIFF app needs before it can ask about a specific slot.

    Deliberately narrow: capacity and reminder settings are operational detail
    the public app has no use for.
    """

    service_types: List[str]
    advance_days: int
    blackout_dates: List[date]


class AvailabilityOut(BaseModel):
    service_type: str
    date: date
    slots: List[SlotOut]


class BookingCreate(BaseModel):
    service_type: str = Field(min_length=1, max_length=200)
    booking_date: date
    booking_time: time
    contact_name: Optional[str] = Field(default=None, max_length=120)
    phone_number: Optional[str] = Field(default=None, max_length=20)
    note: Optional[str] = Field(default=None, max_length=1000)

    @field_validator("phone_number")
    @classmethod
    def _digits_only(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        cleaned = value.strip().replace("-", "").replace(" ", "")
        if not cleaned:
            return None
        if not cleaned.isdigit():
            raise ValueError("phone_number must contain digits only")
        return cleaned

    @field_validator("contact_name", "note")
    @classmethod
    def _strip_blank(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        return value.strip() or None


class BookingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    service_type: str
    booking_date: date
    booking_time: time
    queue_number: Optional[str]
    status: str
    contact_name: Optional[str]
    phone_number: Optional[str]
    note: Optional[str]

    @field_validator("status", mode="before")
    @classmethod
    def _enum_to_value(cls, value):
        return getattr(value, "value", value)


class BookingUpdateIn(BaseModel):
    """Citizen-editable contact fields. All optional — send only what changed.

    Deliberately excludes service/date/time: changing those means cancelling
    and re-booking, so the seat accounting stays sound.
    """
    contact_name: Optional[str] = Field(default=None, max_length=120)
    phone_number: Optional[str] = Field(default=None, max_length=20)
    note: Optional[str] = Field(default=None, max_length=1000)

    @field_validator("phone_number")
    @classmethod
    def _digits_only(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        cleaned = value.strip().replace("-", "").replace(" ", "")
        if not cleaned:
            return None
        if not cleaned.isdigit():
            raise ValueError("phone_number must contain digits only")
        return cleaned

    @field_validator("contact_name", "note")
    @classmethod
    def _strip_blank(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        return value.strip() or None


class BookingSettingsIn(BaseModel):
    """Admin-editable configuration. Rejects values that would break the engine."""

    enabled: bool
    service_types: List[str] = Field(default_factory=list)
    slot_minutes: int = Field(ge=5, le=480)
    slot_capacity: int = Field(ge=0, le=1000)
    advance_days: int = Field(ge=0, le=365)
    blackout_dates: List[date] = Field(default_factory=list)
    reminder_enabled: bool
    reminder_lead_value: int = Field(ge=1, le=90)
    reminder_lead_unit: ReminderUnit

    @field_validator("service_types")
    @classmethod
    def _clean_service_types(cls, values: List[str]) -> List[str]:
        cleaned = [v.strip() for v in values if v and v.strip()]
        if len(set(cleaned)) != len(cleaned):
            raise ValueError("service_types must not contain duplicates")
        return cleaned


class BookingSettingsOut(BookingSettingsIn):
    pass
