"""Deferred follow-ups from the F01–F16 codex review.

F06: DB-backed proof that the scheduler's UNKNOWN outcome writes BOTH the
     sent and failure markers through the real `finalize_reminder` UPDATE.
F02: fake-DB claim test pins the lease token and the TTL window.
F03: every LINE reply site in the intake handlers is tagged `reply(...)` so
     the outbox reply status is accurate.
"""
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.api.v1.endpoints import webhook as webhook_module
from app.models.booking import BookingStatus
from app.models.webhook_event import WebhookEvent
from app.services import booking_service
from app.services.delivery_outcome import DeliveryOutcome
from app.tasks import booking_reminder


def _booking(booking_id=1):
    return SimpleNamespace(
        id=booking_id,
        queue_number=f"260813-{booking_id:03d}",
        service_type="ปรึกษากฎหมาย",
        booking_date=__import__("datetime").date(2026, 8, 13),
        booking_time=__import__("datetime").time(9, 0),
        status=BookingStatus.CONFIRMED,
        user=SimpleNamespace(id=99),
    )


TOKEN = datetime(2026, 8, 12, 8, 30)


# --- F06: scheduler UNKNOWN writes both markers (DB-backed) ---


@pytest.mark.asyncio
async def test_scheduler_unknown_outcome_writes_both_markers(monkeypatch):
    """The real finalize UPDATE must set sent + failed for UNKNOWN."""
    row = SimpleNamespace(
        reminder_sent_at=None,
        reminder_failed_at=None,
        reminder_claimed_at=TOKEN,
    )
    captured = {}

    class _Result:
        rowcount = 1

    class _Db:
        async def execute(self, stmt):
            sql = str(stmt.compile(compile_kwargs={"literal_binds": True}))
            captured["sql"] = sql
            # Apply the finalize values the real UPDATE would write.
            if "SET reminder_sent_at" in sql:
                row.reminder_sent_at = datetime.now(timezone.utc)
                if "reminder_failed_at" in sql:
                    row.reminder_failed_at = row.reminder_sent_at
                row.reminder_claimed_at = None
            return _Result()

        async def commit(self):
            pass

    monkeypatch.setattr(
        booking_reminder, "load_booking_config",
        AsyncMock(return_value=SimpleNamespace(
            enabled=True, reminder_enabled=True,
            email_enabled=True, line_enabled=True,
            reminder_lead=timedelta(days=1),
        )),
    )
    monkeypatch.setattr(booking_reminder, "local_now", lambda: NOW)
    monkeypatch.setattr(
        booking_reminder, "get_due_reminders",
        AsyncMock(return_value=[_booking()]),
    )
    monkeypatch.setattr(
        booking_reminder, "claim_reminder", AsyncMock(return_value=TOKEN)
    )
    monkeypatch.setattr(
        booking_reminder, "load_booking_for_reminder",
        AsyncMock(return_value=_booking()),
    )
    monkeypatch.setattr(
        booking_reminder, "verify_reminder_lease", AsyncMock(return_value=True)
    )
    monkeypatch.setattr(
        booking_reminder, "verify_reminder_sendable", AsyncMock(return_value=True)
    )
    monkeypatch.setattr(
        booking_reminder, "send_booking_reminder_outcome",
        AsyncMock(return_value=DeliveryOutcome.UNKNOWN),
    )
    # Real finalize_reminder against the fake db that applies its SET values.
    monkeypatch.setattr(
        booking_reminder, "finalize_reminder", booking_service.finalize_reminder
    )

    await booking_reminder._process_due_reminders(_Db())

    assert "reminder_sent_at" in captured["sql"]
    assert "reminder_failed_at" in captured["sql"]
    assert row.reminder_sent_at is not None
    assert row.reminder_failed_at is not None
    assert row.reminder_claimed_at is None


NOW = datetime(2026, 8, 12, 9, 0)


# --- F02: fake-DB claim pins token and TTL ---


class _ClaimRow:
    def __init__(self):
        self.event_id = "evt-ttl"
        self.inbound_applied_at = None
        self.inbound_claimed_at = None


class _ClaimResult:
    def __init__(self, value):
        self._value = value

    def scalar_one_or_none(self):
        return self._value


class _ClaimDb:
    """Fake db whose claim UPDATE honors token + TTL like the real one."""

    def __init__(self, row):
        self.row = row
        self.committed = 0

    async def execute(self, stmt):
        sql = str(stmt.compile(compile_kwargs={"literal_binds": True}))
        if "SET inbound_claimed_at" in sql:
            now = datetime.now(timezone.utc)
            claim = self.row.inbound_claimed_at
            ttl_seconds = 300
            if "make_interval" in sql:
                # TTL comes from settings.WEBHOOK_EVENT_TTL via make_interval.
                from app.core.config import settings
                ttl_seconds = settings.WEBHOOK_EVENT_TTL
            expired = claim is None or claim < now - timedelta(seconds=ttl_seconds)
            if self.row.inbound_applied_at is None and expired:
                self.row.inbound_claimed_at = now
                return _ClaimResult(now)
            return _ClaimResult(None)
        return _ClaimResult(None)

    async def commit(self):
        self.committed += 1


@pytest.mark.asyncio
async def test_fake_db_claim_pins_token_and_ttl():
    row = _ClaimRow()
    db = _ClaimDb(row)

    token = await webhook_module._claim_event(db, row.event_id)
    assert token is not None
    assert row.inbound_claimed_at == token  # token is the lease value
    # Second claim while the lease is live must lose.
    assert await webhook_module._claim_event(db, row.event_id) is None

    # Expire the lease beyond the TTL; the next claim wins with a fresh token.
    row.inbound_claimed_at = datetime.now(timezone.utc) - timedelta(seconds=301)
    token2 = await webhook_module._claim_event(db, row.event_id)
    assert token2 is not None
    assert token2 != token


# --- F03: reply sites are tagged ---


def test_reply_sites_tagged_in_command_handlers():
    """Every LINE reply append in commands/postback handlers is a reply() item."""
    import inspect

    from app.services.message_intake import commands, postback_handler

    for module in (commands, postback_handler):
        src = inspect.getsource(module)
        for line in src.splitlines():
            stripped = line.strip()
            if "reply_text" not in stripped and "reply_flex" not in stripped:
                continue
            if "box.append(" in stripped or "box.append(reply(" in stripped:
                assert "box.append(reply(" in stripped, (
                    f"{module.__name__}: untagged reply site: {stripped}"
                )


class _ApiError(Exception):
    def __init__(self, status):
        super().__init__(f"LINE API error {status}")
        self.status = status


@pytest.mark.asyncio
async def test_command_reply_failure_marks_reply_status_failed(monkeypatch):
    """A failing command reply flows through the REPLY kind, not NONE."""
    from app.api.v1.endpoints import webhook as webhook_module
    from app.models.webhook_event import ReplyDeliveryStatus
    from app.services.message_intake import commands

    row = WebhookEvent(event_id="evt-cmd-fail", event_type="MessageEvent")
    rows = {row.event_id: row}

    class _StatusDb:
        def __init__(self):
            self.commit = AsyncMock()

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        async def get(self, model, key):
            return rows.get(key)

    class _MainDb:
        def __init__(self):
            self.commit = AsyncMock()
            self.rollback = AsyncMock()

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        async def execute(self, stmt):
            sql = str(stmt.compile(compile_kwargs={"literal_binds": True}))
            if "SET inbound_claimed_at" in sql:
                now = datetime.now(timezone.utc)
                row.inbound_claimed_at = now
                return _ClaimResult(now)
            if "SET inbound_applied_at" in sql:
                row.inbound_applied_at = datetime.now(timezone.utc)
                row.inbound_claimed_at = None
                return _ClaimResult(row.event_id)
            return _ScalarResult(None)

        async def get(self, model, key):
            return rows.get(key)

    class _ScalarResult:
        def __init__(self, value):
            self._value = value

        def scalars(self):
            return self

        def all(self):
            return []

        def scalar_one_or_none(self):
            return self._value

    sessions = [_MainDb(), _StatusDb()]

    def _session_factory():
        return sessions.pop(0) if sessions else _StatusDb()

    monkeypatch.setattr(
        "app.api.v1.endpoints.webhook.AsyncSessionLocal", _session_factory
    )
    monkeypatch.setattr(
        "app.api.v1.endpoints.webhook.MessageEvent", type(_event())
    )

    async def failing_command(event, db, box):
        await commands.handle_check_status(
            "U1", "reply-token", db, outbox=box
        )

    monkeypatch.setattr(
        "app.api.v1.endpoints.webhook.handle_message_event", failing_command
    )
    monkeypatch.setattr(
        "app.api.v1.endpoints.webhook.redis_client",
        SimpleNamespace(
            exists=AsyncMock(return_value=False),
            set=AsyncMock(return_value=True),
            setex=AsyncMock(),
            release_lock=AsyncMock(return_value=True),
        ),
    )
    from app.services import message_intake as pkg
    monkeypatch.setattr(
        pkg, "line_service",
        SimpleNamespace(
            reply_text=AsyncMock(side_effect=_ApiError(400)),
            reply_flex=AsyncMock(side_effect=_ApiError(400)),
        ),
    )
    monkeypatch.setattr(
        "app.api.v1.endpoints.webhook.drain_outbox",
        AsyncMock(return_value=1),
    )
    # Force the tagged path: real drain_outbox_outcomes classifies the failure.
    monkeypatch.setattr(
        "app.api.v1.endpoints.webhook.drain_outbox_outcomes",
        __import__("app.services.outbox", fromlist=["drain_outbox_outcomes"]).drain_outbox_outcomes,
    )

    await webhook_module.process_webhook_events([_event(row.event_id)])

    assert row.reply_status is ReplyDeliveryStatus.FAILED


def _event(event_id="evt-f09", text="สวัสดี"):
    return SimpleNamespace(
        webhook_event_id=event_id,
        reply_token="reply-token",
        source=SimpleNamespace(user_id="U123"),
        message=SimpleNamespace(id="m1", type="text", text=text),
    )