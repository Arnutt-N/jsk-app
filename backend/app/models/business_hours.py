"""Business hours model for defining operating hours."""
from sqlalchemy import Column, Integer, Boolean, Index, String, DateTime, UniqueConstraint, text
from sqlalchemy.orm import validates
from app.db.base import Base

# Sentinel close time meaning "open until midnight". datetime.time cannot hold
# 24:00, so every consumer must compare against this constant rather than parse.
FULL_DAY_CLOSE = "24:00"


class BusinessHours(Base):
    """Business hours configuration for each day of the week."""

    __tablename__ = "business_hours"

    id = Column(Integer, primary_key=True)
    # Uniqueness and the index are declared in __table_args__ under the names
    # the live schema actually uses; `unique=True, index=True` here would name
    # them differently and make autogenerate propose a drop/recreate.
    day_of_week = Column(Integer, nullable=False)  # 0=Monday, 6=Sunday
    is_open = Column(Boolean, default=True, server_default='true')
    open_time = Column(String(5), nullable=False)  # HH:MM format
    close_time = Column(String(5), nullable=False)  # HH:MM format
    timezone = Column(String(50), server_default='Asia/Bangkok')
    created_at = Column(DateTime(timezone=True), server_default=text('now()'))
    updated_at = Column(DateTime(timezone=True), server_default=text('now()'))

    __table_args__ = (
        UniqueConstraint("day_of_week", name="uq_business_hours_day"),
        Index("ix_business_hours_day", "day_of_week", unique=True),
    )

    @validates('day_of_week')
    def validate_day_of_week(self, key, value):
        """Ensure day_of_week is 0-6."""
        if not 0 <= value <= 6:
            raise ValueError("day_of_week must be between 0 (Monday) and 6 (Sunday)")
        return value

    @classmethod
    def get_default_hours(cls):
        """Default business hours: Mon-Fri 08:00-17:00."""
        defaults = []
        for i in range(7):
            defaults.append(cls(
                day_of_week=i,
                open_time="08:00",
                close_time="17:00",
                is_open=(i < 5)  # Active Mon-Fri only
            ))
        return defaults

    def __repr__(self):
        day_names = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
        name = day_names[self.day_of_week] if 0 <= self.day_of_week <= 6 else f"Day{self.day_of_week}"
        status = "Open" if self.is_open else "Closed"
        return f"<BusinessHours({name}: {status} {self.open_time}-{self.close_time})>"
