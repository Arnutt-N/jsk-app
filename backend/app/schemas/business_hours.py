"""Schemas for admin business-hours management.

The weekly schedule lives in a real table (one row per weekday), not in the
key-value settings store, so the payload carries all seven days at once — a
partial week would make the "which days are open" question depend on request
history rather than on the stored state.
"""
import re
from typing import List

from pydantic import BaseModel, Field, field_validator, model_validator

from app.models.business_hours import FULL_DAY_CLOSE

_HHMM_RE = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")


class BusinessHoursDay(BaseModel):
    day_of_week: int = Field(ge=0, le=6)
    is_open: bool
    open_time: str
    close_time: str

    @field_validator("open_time")
    @classmethod
    def _validate_open_time(cls, value: str) -> str:
        if not _HHMM_RE.match(value):
            raise ValueError("เวลาเปิดต้องอยู่ในรูปแบบ HH:MM (00:00-23:59)")
        return value

    @field_validator("close_time")
    @classmethod
    def _validate_close_time(cls, value: str) -> str:
        # "24:00" is the supported way to express "open until midnight"; it is
        # close-only because a day cannot start at 24:00.
        if value == FULL_DAY_CLOSE:
            return value
        if not _HHMM_RE.match(value) or value == "00:00":
            raise ValueError("เวลาปิดต้องอยู่ในรูปแบบ HH:MM (00:01-23:59) หรือ 24:00")
        return value

    @model_validator(mode="after")
    def _check_open_before_close(self):
        # Zero-padded HH:MM strings compare chronologically. Only enforced for
        # open days: closed days keep placeholder times that need no ordering.
        if self.is_open and self.open_time >= self.close_time:
            raise ValueError("เวลาเปิดต้องมาก่อนเวลาปิด")
        return self


class BusinessHoursUpdate(BaseModel):
    days: List[BusinessHoursDay] = Field(min_length=7, max_length=7)

    @field_validator("days")
    @classmethod
    def _check_all_weekdays(cls, days: List[BusinessHoursDay]) -> List[BusinessHoursDay]:
        seen = {d.day_of_week for d in days}
        if seen != set(range(7)):
            raise ValueError("ต้องมีข้อมูลครบทั้ง 7 วัน (0=จันทร์ ถึง 6=อาทิตย์) ไม่ซ้ำกัน")
        return days


class BusinessHoursOut(BaseModel):
    days: List[BusinessHoursDay]
