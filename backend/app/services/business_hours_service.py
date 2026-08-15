"""Business hours service for checking operating hours."""
from datetime import datetime, time
from typing import Optional
import pytz
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.business_hours import BusinessHours, FULL_DAY_CLOSE
import logging

logger = logging.getLogger(__name__)

# Thailand timezone
BANGKOK_TZ = pytz.timezone('Asia/Bangkok')


def _parse_time(time_str: str) -> time:
    """Parse HH:MM string to time object."""
    h, m = time_str.split(':')
    return time(int(h), int(m))


class BusinessHoursService:
    """Service for checking and managing business hours."""

    async def is_within_business_hours(self, db: AsyncSession) -> bool:
        """Check if current time is within business hours."""
        now = datetime.now(BANGKOK_TZ)
        day = now.weekday()  # 0=Monday
        current_time = now.time()

        stmt = select(BusinessHours).where(
            BusinessHours.day_of_week == day,
            BusinessHours.is_open == True
        )
        result = await db.execute(stmt)
        hours = result.scalar_one_or_none()

        if not hours:
            return False

        open_t = _parse_time(hours.open_time)
        if hours.close_time == FULL_DAY_CLOSE:
            # "24:00" = open until midnight; datetime.time cannot hold it, so
            # any time at or after opening is within hours.
            return open_t <= current_time
        close_t = _parse_time(hours.close_time)
        return open_t <= current_time <= close_t

    async def get_next_open_time(self, db: AsyncSession) -> str:
        """Get next available business hours in Thai format."""
        now = datetime.now(BANGKOK_TZ)
        current_day = now.weekday()
        current_time = now.time()

        for days_ahead in range(7):
            check_day = (current_day + days_ahead) % 7

            stmt = select(BusinessHours).where(
                BusinessHours.day_of_week == check_day,
                BusinessHours.is_open == True
            )
            result = await db.execute(stmt)
            hours = result.scalar_one_or_none()

            if not hours:
                continue

            open_t = _parse_time(hours.open_time)

            if days_ahead == 0:
                if current_time < open_t:
                    return f"วันนี้ เวลา {hours.open_time} น."
                # Short-circuit keeps "24:00" away from _parse_time, which
                # datetime.time cannot hold.
                if hours.close_time == FULL_DAY_CLOSE or current_time < _parse_time(hours.close_time):
                    return f"เปิดให้บริการอยู่ (ถึง {hours.close_time} น.)"
                continue

            day_name_th = self._get_thai_day_name(check_day)
            return f"{day_name_th} เวลา {hours.open_time} น."

        return "ไม่มีเวลาทำการที่กำหนดไว้"

    async def get_current_status(self, db: AsyncSession) -> dict:
        """Get current business hours status."""
        is_open = await self.is_within_business_hours(db)
        next_open = await self.get_next_open_time(db)

        now = datetime.now(BANGKOK_TZ)
        current_hours = None

        if is_open:
            stmt = select(BusinessHours).where(
                BusinessHours.day_of_week == now.weekday()
            )
            result = await db.execute(stmt)
            hours = result.scalar_one_or_none()
            if hours:
                current_hours = {
                    "open": hours.open_time,
                    "close": hours.close_time
                }

        return {
            "is_open": is_open,
            "current_hours": current_hours,
            "next_open": next_open if not is_open else None,
            "timezone": "Asia/Bangkok"
        }

    def _get_thai_day_name(self, day_of_week: int) -> str:
        """Convert day number to Thai day name."""
        days = [
            "วันจันทร์", "วันอังคาร", "วันพุธ", "วันพฤหัสบดี",
            "วันศุกร์", "วันเสาร์", "วันอาทิตย์"
        ]
        return days[day_of_week]

    async def initialize_defaults(self, db: AsyncSession):
        """Initialize default business hours if none exist."""
        result = await db.execute(select(BusinessHours))
        existing = result.scalars().all()

        if not existing:
            logger.info("Initializing default business hours")
            defaults = BusinessHours.get_default_hours()
            for hours in defaults:
                db.add(hours)
            await db.commit()
            logger.info("Default business hours created")


# Global business hours service instance
business_hours_service = BusinessHoursService()
