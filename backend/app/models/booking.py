from sqlalchemy import (
    Column,
    Integer,
    String,
    Text,
    Date,
    Time,
    DateTime,
    ForeignKey,
    Enum,
    Index,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum
from app.db.base import Base

class BookingStatus(str, enum.Enum):
    CONFIRMED = "CONFIRMED"
    CANCELLED = "CANCELLED"
    COMPLETED = "COMPLETED"
    NOSHOW = "NOSHOW"

class Booking(Base):
    __tablename__ = "bookings"

    id = Column(Integer, primary_key=True, index=True)

    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    user = relationship("User", back_populates="bookings")

    service_type = Column(String, nullable=False)
    booking_date = Column(Date, nullable=False)
    booking_time = Column(Time, nullable=False)

    queue_number = Column(String, index=True) # A001

    status = Column(Enum(BookingStatus), default=BookingStatus.CONFIRMED)

    # Contact details captured at booking time. Kept on the booking itself rather
    # than read off the user record so staff still have a number to call if the
    # citizen later edits their profile.
    contact_name = Column(String(120), nullable=True)
    phone_number = Column(String(20), nullable=True)
    note = Column(Text, nullable=True)

    # Claim marker for the advance-reminder scheduler. Must stay NULL on insert:
    # the guard is `UPDATE ... WHERE reminder_sent_at IS NULL`, so any default
    # here would make every new booking look already-reminded.
    reminder_sent_at = Column(DateTime(timezone=True), nullable=True)

    cancelled_at = Column(DateTime(timezone=True), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Declared here under explicit names rather than via `index=True`: Alembic
    # compares indexes by name, so a name that drifts from the one the migration
    # created makes autogenerate propose dropping the production index (PR #183).
    # `ix_bookings_id` and `ix_bookings_queue_number` above keep their
    # `index=True` form because that already matches the names the initial
    # migration created via op.f().
    __table_args__ = (
        # Availability lookups filter a slot by service + date + time.
        Index("ix_bookings_slot", "service_type", "booking_date", "booking_time"),
        # The reminder loop polls for CONFIRMED, not-yet-reminded, upcoming rows.
        Index(
            "ix_bookings_reminder_due",
            "status",
            "reminder_sent_at",
            "booking_date",
        ),
    )
