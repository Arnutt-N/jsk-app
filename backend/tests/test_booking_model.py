"""Shape tests for the Booking model.

The `bookings` table already exists in production (created by the initial
migration ``1349087a4a24``), so this feature *extends* a live table rather than
creating one. These tests are pure metadata assertions — no database needed.

Index names are asserted explicitly because Alembic compares indexes **by name**:
the lesson of PR #183 was that a model declaring ``index=True`` generates
``ix_<table>_<col>``, and when a hand-written migration used a different name,
autogenerate proposed dropping the production index and recreating it. Anything
a migration creates must be declared in ``__table_args__`` under the name the
live schema actually uses.
"""
import pytest
from sqlalchemy import Date, DateTime, Integer, String, Text, Time

from app.models.booking import Booking, BookingStatus


@pytest.fixture(scope="module")
def columns():
    return Booking.__table__.columns


# --- columns that already exist in production; guard against accidental drift ---


def test_preexisting_columns_are_unchanged(columns):
    """The live table's original shape must survive this feature's migration."""
    assert columns["service_type"].nullable is False
    assert columns["booking_date"].nullable is False
    assert columns["booking_time"].nullable is False
    assert isinstance(columns["booking_date"].type, Date)
    assert isinstance(columns["booking_time"].type, Time)
    assert isinstance(columns["user_id"].type, Integer)


def test_booking_status_enum_members_are_unchanged():
    """Auto-confirm was chosen, so no PENDING state is introduced."""
    assert [s.value for s in BookingStatus] == [
        "CONFIRMED",
        "CANCELLED",
        "COMPLETED",
        "NOSHOW",
    ]


# --- new columns ---


@pytest.mark.parametrize(
    "name,expected_type,length",
    [
        ("contact_name", String, 120),
        ("phone_number", String, 20),
    ],
)
def test_new_contact_columns(columns, name, expected_type, length):
    col = columns[name]
    assert isinstance(col.type, expected_type)
    assert col.type.length == length
    assert col.nullable is True


def test_note_column_is_free_text(columns):
    assert isinstance(columns["note"].type, Text)
    assert columns["note"].nullable is True


@pytest.mark.parametrize("name", ["reminder_sent_at", "cancelled_at", "updated_at"])
def test_new_timestamp_columns_are_timezone_aware(columns, name):
    """Naive timestamps would break lead-time maths against `now()`."""
    col = columns[name]
    assert isinstance(col.type, DateTime)
    assert col.type.timezone is True
    assert col.nullable is True


def test_reminder_sent_at_defaults_to_null():
    """The reminder claim guard (`WHERE reminder_sent_at IS NULL`) depends on this.

    A server_default of now() would make every new booking look already-reminded.
    """
    col = Booking.__table__.columns["reminder_sent_at"]
    assert col.default is None
    assert col.server_default is None


def test_no_line_user_id_column():
    """Push targets resolve through the `user` relationship instead.

    Storing a raw LINE ID here would cut against the in-flight pseudonymisation
    work, so this absence is deliberate and worth locking down.
    """
    assert "line_user_id" not in Booking.__table__.columns


# --- indexes ---


def _index_by_name(name):
    return next((i for i in Booking.__table__.indexes if i.name == name), None)


def test_slot_index_supports_availability_lookups():
    idx = _index_by_name("ix_bookings_slot")
    assert idx is not None, "availability queries filter on service_type+date+time"
    assert [c.name for c in idx.columns] == [
        "service_type",
        "booking_date",
        "booking_time",
    ]
    assert idx.unique is False  # capacity > 1 per slot, so never unique


def test_reminder_due_index_supports_the_scheduler_poll():
    idx = _index_by_name("ix_bookings_reminder_due")
    assert idx is not None, "the reminder loop polls this every 60s"
    assert [c.name for c in idx.columns] == [
        "status",
        "reminder_sent_at",
        "booking_date",
    ]
    assert idx.unique is False


def test_queue_number_index_keeps_its_production_name():
    """`ix_bookings_queue_number` was created by the initial migration."""
    assert _index_by_name("ix_bookings_queue_number") is not None
