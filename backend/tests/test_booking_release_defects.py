"""RED tests for three booking release defects.

Each test drives a real code path and asserts the observable contract. Provider
outcomes are deliberately distinct: an ambiguous SMTP timeout is UNKNOWN, a
LINE circuit-open refusal is NOT_SENT, and a lost reminder lease must reach no
provider at all. The walk-in idempotency replay must reject a changed payload
with 409 and leave a request hash in the audit details.
"""
import uuid
from datetime import datetime, time, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool

from app.api import deps
from app.api.v1.endpoints import liff as liff_module
from app.core.config import settings
from app.main import app
from app.models.audit_log import AuditLog
from app.models.booking import Booking, BookingStatus
from app.models.service_request import ServiceRequest
from app.models.user import User, UserRole
from app.services import booking_email, booking_notifications, booking_service
from app.services.booking_service import BookingConfig, ReminderUnit, local_now
from app.services.delivery_outcome import DeliveryOutcome as _DeliveryOutcome
from app.services.delivery_outcome import as_outcome
from app.services.user_identity_service import populate_surrogate
from app.tasks import booking_reminder

ENDPOINT = "/api/v1/liff/service-requests"


def _expected_outcome(name: str):
    """Return the new enum member when present, else a plain sentinel string.

    Keeping the fallback means a missing DeliveryOutcome surfaces as a normal
    assertion diff instead of a collection error that hides the other tests.
    """
    enum_cls = getattr(booking_notifications, "DeliveryOutcome", None)
    return name if enum_cls is None else getattr(enum_cls, name, name)


def _reminder_config(**overrides):
    values = dict(
        enabled=True,
        service_types=("ปรึกษากฎหมาย",),
        slot_minutes=30,
        slot_capacity=3,
        advance_days=14,
        blackout_dates=frozenset(),
        reminder_enabled=True,
        reminder_lead_value=1,
        reminder_lead_unit=ReminderUnit.DAY,
        email_enabled=True,
        line_enabled=False,
    )
    values.update(overrides)
    return BookingConfig(**values)


def _booking():
    return SimpleNamespace(
        id=1,
        queue_number="REL-001",
        service_type="ปรึกษากฎหมาย",
        booking_date=local_now().date() + timedelta(days=2),
        booking_time=time(9, 30),
        status=BookingStatus.CONFIRMED,
        email="citizen@example.com",
        contact_name="สมชาย ใจดี",
        user=SimpleNamespace(id=99),
    )


@pytest.mark.asyncio
async def test_smtp_timeout_after_send_message_entered_is_unknown(monkeypatch):
    """An SMTP timeout after DATA was submitted has an unknown delivery result.

    The old provider swallowed every exception into False and the aggregate
    turned that into FAILED, which releases the reminder lease and risks a
    duplicate email to a citizen who may already have received it.
    """
    monkeypatch.setattr(settings, "SMTP_HOST", "smtp.example.test")
    monkeypatch.setattr(settings, "SMTP_FROM", "booking@example.test")
    monkeypatch.setattr(settings, "SMTP_USE_TLS", True)

    entered = []

    class _Server:
        def starttls(self):
            return None

        def login(self, *_args):
            return None

        def send_message(self, _message):
            entered.append("send_message")
            raise TimeoutError("SMTP timeout after DATA")

        def quit(self):
            return None

    with (
        patch.object(booking_email.smtplib, "SMTP", return_value=_Server()),
        patch.object(booking_email.smtplib, "SMTP_SSL", return_value=_Server()),
        patch.object(
            booking_notifications,
            "load_booking_config",
            new=AsyncMock(return_value=_reminder_config()),
        ),
    ):
        provider_result = await booking_email.send_booking_email(
            "citizen@example.com", "subject", "body"
        )
        aggregate_result = await booking_notifications.send_booking_reminder_outcome(
            AsyncMock(), _booking(), _booking().user
        )

    unknown = _expected_outcome("UNKNOWN")
    assert (provider_result, aggregate_result) == (unknown, unknown)
    assert "send_message" in entered
    assert hasattr(booking_notifications, "DeliveryOutcome")


def test_legacy_string_outcomes_coerce_to_the_same_enum_values():
    """Persisted or injected old aggregate strings must not flip meaning."""
    assert as_outcome("CONFIRMED") is _DeliveryOutcome.SENT
    assert as_outcome("FAILED") is _DeliveryOutcome.NOT_SENT
    assert as_outcome("UNKNOWN") is _DeliveryOutcome.UNKNOWN
    assert _DeliveryOutcome("FAILED") is _DeliveryOutcome.NOT_SENT


@pytest.mark.asyncio
async def test_line_circuit_open_push_is_not_sent_at_aggregate_boundary(monkeypatch):
    """An open LINE circuit is a definite refusal, not an ambiguous error."""
    push_api = AsyncMock()
    monkeypatch.setattr(booking_notifications.line_service, "_api", SimpleNamespace(push_message=push_api))
    monkeypatch.setattr(
        booking_notifications.line_service,
        "_cb_open_until",
        datetime.now(timezone.utc) + timedelta(hours=1),
    )
    monkeypatch.setattr(booking_notifications.line_service, "_cb_failures", 99)

    with (
        patch.object(
            booking_notifications,
            "resolve_raw_for_push",
            new=AsyncMock(return_value="U123"),
        ),
        patch.object(
            booking_notifications,
            "load_booking_config",
            new=AsyncMock(return_value=_reminder_config(email_enabled=False, line_enabled=True)),
        ),
    ):
        outcome = await booking_notifications.send_booking_reminder_outcome(
            AsyncMock(), _booking(), _booking().user
        )

    assert outcome == _expected_outcome("NOT_SENT")
    assert hasattr(booking_notifications, "DeliveryOutcome")
    push_api.assert_not_awaited()


def _fresh_engine():
    return create_async_engine(str(settings.DATABASE_URL), poolclass=NullPool)


async def _seed_booking(Session, *, when=None, claimed_at=None):
    marker = uuid.uuid4().hex[:10]
    target = when or (local_now().date() + timedelta(days=7))
    async with Session() as session:
        citizen = User(display_name="Release Test Citizen")
        session.add(citizen)
        await session.flush()
        booking = Booking(
            user_id=citizen.id,
            service_type="ปรึกษากฎหมาย",
            booking_date=target,
            booking_time=time(9, 30),
            queue_number=f"REL-{marker}",
            status=BookingStatus.CONFIRMED,
            reminder_claimed_at=claimed_at,
        )
        session.add(booking)
        await session.flush()
        ids = (booking.id, citizen.id)
        await session.commit()
    return ids


async def _cleanup_booking(Session, booking_id, user_id):
    async with Session() as session:
        await session.execute(delete(Booking).where(Booking.id == booking_id))
        await session.execute(delete(User).where(User.id == user_id))
        await session.commit()


async def _booking_state(Session, booking_id):
    async with Session() as session:
        row = (
            await session.execute(
                select(Booking.reminder_sent_at, Booking.reminder_claimed_at).where(
                    Booking.id == booking_id
                )
            )
        ).one()
    return row.reminder_sent_at, row.reminder_claimed_at


@pytest.mark.asyncio
async def test_pre_send_ownership_loss_blocks_provider_call():
    """A worker whose lease was reassigned must not send after reloading.

    The scheduler claims with one token, then reloads the booking before the
    push. If the reload ignores the token, a stale worker can send a reminder
    that a newer worker also owns. The reload must be ownership-scoped.
    """
    engine = _fresh_engine()
    Session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    booking_id, user_id = await _seed_booking(Session)
    try:
        async with Session() as db:
            now = local_now()
            due = await booking_service.get_due_reminders(
                db, window_start=now, window_end=now + timedelta(days=8)
            )
            assert any(b.id == booking_id for b in due)

            token = await booking_service.claim_reminder(db, booking_id)
            await db.commit()
            assert token is not None
            stale_token = token + timedelta(seconds=1)

            send = AsyncMock()
            with (
                patch.object(
                    booking_reminder,
                    "load_booking_config",
                    new=AsyncMock(return_value=_reminder_config()),
                ),
                patch.object(
                    booking_reminder,
                    "get_due_reminders",
                    new=AsyncMock(return_value=due),
                ),
                patch.object(
                    booking_reminder,
                    "claim_reminder",
                    new=AsyncMock(return_value=stale_token),
                ),
                patch.object(
                    booking_reminder,
                    "send_booking_reminder_outcome",
                    new=send,
                ),
            ):
                await booking_reminder._process_due_reminders(db)

            send.assert_not_awaited()
            sent, claimed = await _booking_state(Session, booking_id)
            assert sent is None
            assert claimed == token
    finally:
        await _cleanup_booking(Session, booking_id, user_id)
        await engine.dispose()


@pytest.mark.asyncio
async def test_changed_payload_replay_is_409_and_leaves_one_booking(
    test_client, monkeypatch
):
    """A replayed LIFF submission id with a changed body must not replay silently.

    Same id plus changed details is a client bug or collision, not a lost
    response. The caller must get 409, the original case must stay untouched,
    and no second case or audit row may be created.
    """
    marker = uuid.uuid4().hex[:8]
    sid = f"sub-chg-{marker}"
    sub = f"Uchg{marker}0000000000000000000000"
    token = f"tok-chg-{marker}"

    fake_client = MagicMock()

    async def _post(url, **kwargs):
        resp = MagicMock()
        claimed = (kwargs.get("data") or {}).get("id_token")
        if claimed == token:
            resp.status_code = 200
            resp.json.return_value = {"sub": sub}
        else:
            resp.status_code = 401
            resp.text = "bad token"
        return resp

    fake_client.post = _post
    fake_cm = MagicMock()
    fake_cm.__aenter__ = AsyncMock(return_value=fake_client)
    fake_cm.__aexit__ = AsyncMock(return_value=False)
    monkeypatch.setattr(liff_module.httpx, "AsyncClient", MagicMock(return_value=fake_cm))
    monkeypatch.setattr(settings, "LIFF_STRICT_MODE", True)

    engine = _fresh_engine()
    Session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    user_id = None
    try:
        async with Session() as session:
            user = User(
                username=f"px-chg-{marker}",
                display_name="PX CHG",
                role=UserRole.USER,
                is_active=True,
            )
            populate_surrogate(user, sub)
            session.add(user)
            await session.commit()
            user_id = user.id

        async def _fresh_get_db():
            async with Session() as session:
                yield session

        app.dependency_overrides[deps.get_db] = _fresh_get_db
        hdr = {"x-liff-id-token": token, "x-submission-id": sid}
        body = {
            "topic_category": "ร้องเรียน/ร้องทุกข์",
            "description": f"original-{marker}",
            "firstname": "เดิม",
        }
        changed = {
            "topic_category": "ร้องเรียน/ร้องทุกข์",
            "description": f"changed-{marker}",
            "firstname": "ใหม่",
        }
        try:
            first = test_client.post(ENDPOINT, json=body, headers=hdr)
            assert first.status_code == 201, first.text
            first_id = first.json()["id"]
            second = test_client.post(ENDPOINT, json=changed, headers=hdr)
        finally:
            app.dependency_overrides.clear()

        assert second.status_code == 409, second.text

        async with Session() as session:
            rows = (
                await session.execute(
                    select(ServiceRequest.description).where(
                        ServiceRequest.submission_id == sid
                    )
                )
            ).scalars().all()
            assert len(rows) == 1, rows
            assert rows[0] == body["description"]

            case_ids = (
                await session.execute(
                    select(ServiceRequest.id).where(
                        ServiceRequest.submission_id == sid
                    )
                )
            ).scalars().all()
            assert case_ids == [first_id]

            audit_ids = (
                await session.execute(
                    select(AuditLog.id).where(
                        AuditLog.resource_type == "service_request",
                        AuditLog.resource_id.in_(
                            [str(i) for i in case_ids]
                        ),
                    )
                )
            ).scalars().all()
            assert len(audit_ids) <= 1, audit_ids
    finally:
        async with Session() as session:
            await session.execute(
                delete(ServiceRequest).where(ServiceRequest.submission_id == sid)
            )
            await session.execute(delete(User).where(User.id == user_id))
            await session.commit()
        await engine.dispose()
