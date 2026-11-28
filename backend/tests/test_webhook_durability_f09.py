"""F09: durable webhook intake, exactly-once inbound effects, separate reply status."""
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.api.v1.endpoints import webhook as webhook_module
from app.api.v1.endpoints.webhook import line_webhook, process_webhook_events
from app.models.webhook_event import ReplyDeliveryStatus, WebhookEvent
from app.services.outbox import other, reply


def _event(event_id="evt-f09", text="สวัสดี"):
    return SimpleNamespace(
        webhook_event_id=event_id,
        reply_token="reply-token",
        source=SimpleNamespace(user_id="U123"),
        message=SimpleNamespace(id="m1", type="text", text=text),
    )


class _Scalar:
    def __init__(self, value):
        self._value = value

    def scalar_one_or_none(self):
        return self._value


class _Session:
    """Minimal identity-map DB double used by both endpoint paths."""

    def __init__(self, rows):
        self.rows = rows
        self.commit = AsyncMock()
        self.rollback = AsyncMock()

    def __call__(self):
        return self

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return False

    async def get(self, model, key):
        return self.rows.get(key)

    async def execute(self, stmt):
        sql = str(stmt.compile(compile_kwargs={"literal_binds": True}))
        row = next((r for key, r in self.rows.items() if f"'{key}'" in sql), None)
        if row is None:
            return _Scalar(None)
        now = datetime.now(timezone.utc)
        if "SET inbound_claimed_at" in sql:
            if getattr(row, "inbound_applied_at", None) is not None:
                return _Scalar(None)
            claim = getattr(row, "inbound_claimed_at", None)
            if claim is None or claim < now - timedelta(seconds=300):
                row.inbound_claimed_at = now
                return _Scalar(now)
            return _Scalar(None)
        if "SET inbound_applied_at" in sql:
            if getattr(row, "inbound_claimed_at", None) is None:
                return _Scalar(None)
            row.inbound_applied_at = now
            row.inbound_claimed_at = None
            return _Scalar(row.event_id)
        return _Scalar(None)

    def add(self, row):
        self.rows[row.event_id] = row

    def begin_nested(self):
        return _Nested(self)


class _Nested:
    def __init__(self, db):
        self.db = db

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return False


def _redis():
    redis = MagicMock()
    redis.exists = AsyncMock(return_value=False)
    redis.set = AsyncMock(return_value=True)
    redis.setex = AsyncMock()
    redis.release_lock = AsyncMock(return_value=True)
    return redis


def test_reply_status_persists_lowercase_enum_values():
    column = WebhookEvent.__table__.c.reply_status
    assert column.type.enums == ["none", "sent", "failed", "unknown"]
    assert column.type._valid_lookup["sent"] == ReplyDeliveryStatus.SENT


@pytest.mark.asyncio
async def test_event_id_committed_before_ack(monkeypatch):
    from linebot.v3.webhooks import MessageEvent

    rows = {}
    db = _Session(rows)
    parsed = [
        MessageEvent.from_dict(
            {
                "type": "message",
                "webhookEventId": "evt-ack",
                "mode": "active",
                "timestamp": 1700000000000,
                "deliveryContext": {"isRedelivery": False},
                "source": {"type": "user", "userId": "U123"},
                "replyToken": "reply-token",
                "message": {"id": "m1", "type": "text", "text": "hi", "quoteToken": "q"},
            }
        )
    ]
    monkeypatch.setattr("app.api.v1.endpoints.webhook.AsyncSessionLocal", db)
    monkeypatch.setattr("app.api.v1.endpoints.webhook.parser", SimpleNamespace(parse=lambda body, sig: parsed))
    monkeypatch.setattr("app.api.v1.endpoints.webhook._read_body_with_limit", AsyncMock(return_value=b"{}"))
    background = MagicMock()

    result = await line_webhook(
        MagicMock(), background, "sig"
    )

    assert result == "OK"
    db.commit.assert_awaited_once()
    row = rows["evt-ack"]
    assert row.event_type == "MessageEvent"
    assert row.reply_status in (None, ReplyDeliveryStatus.NONE)
    assert row.inbound_applied_at is None
    background.add_task.assert_called_once()


@pytest.mark.asyncio
async def test_redelivery_after_reply_failure_skips_inbound_and_records_failure(monkeypatch):
    row = WebhookEvent(event_id="evt-fail", event_type="MessageEvent")
    rows = {row.event_id: row}
    db = _Session(rows)
    handle = AsyncMock()
    failing_send = AsyncMock(side_effect=RuntimeError("LINE down"))

    def handle_with_failed_send(event, db, box):
        box.append(failing_send)
        return handle(event, db, box)

    async def drain(box):
        try:
            await box[0]()
        except RuntimeError:
            pass
        return 1

    monkeypatch.setattr("app.api.v1.endpoints.webhook.AsyncSessionLocal", lambda: db)
    monkeypatch.setattr("app.api.v1.endpoints.webhook.MessageEvent", type(_event()))
    monkeypatch.setattr("app.api.v1.endpoints.webhook.handle_message_event", handle_with_failed_send)
    monkeypatch.setattr("app.api.v1.endpoints.webhook.drain_outbox", drain)
    monkeypatch.setattr("app.api.v1.endpoints.webhook.redis_client", _redis())

    await process_webhook_events([_event("evt-fail")])
    assert row.inbound_applied_at is not None
    assert row.reply_status is ReplyDeliveryStatus.FAILED
    handle.assert_awaited_once()
    failing_send.assert_awaited_once()

    # Redis marker expired; same event arrives again.
    handle.reset_mock()
    # Durable row and inbound_applied_at are checked before any handler runs;
    # the handler wrapper is no longer called on redelivery.
    monkeypatch.setattr(
        "app.api.v1.endpoints.webhook.MessageEvent",
        type(None),
    )
    await process_webhook_events([_event("evt-fail")])
    handle.assert_not_awaited()
    assert row.reply_status is ReplyDeliveryStatus.FAILED


@pytest.mark.asyncio
async def test_successful_reply_sets_sent_status(monkeypatch):
    row = WebhookEvent(event_id="evt-ok", event_type="MessageEvent")
    rows = {row.event_id: row}
    db = _Session(rows)

    async def handler(event, session, box):
        box.append(reply(AsyncMock()))

    monkeypatch.setattr("app.api.v1.endpoints.webhook.AsyncSessionLocal", lambda: db)
    monkeypatch.setattr("app.api.v1.endpoints.webhook.MessageEvent", type(_event()))
    monkeypatch.setattr("app.api.v1.endpoints.webhook.handle_message_event", handler)
    monkeypatch.setattr("app.api.v1.endpoints.webhook.redis_client", _redis())

    await process_webhook_events([_event("evt-ok")])

    assert row.reply_status is ReplyDeliveryStatus.SENT
    assert row.inbound_applied_at is not None


@pytest.mark.asyncio
async def test_empty_outbox_records_no_reply_attempt(monkeypatch):
    """An event that queued no reply must not claim a LINE reply was sent (F15)."""
    row = WebhookEvent(event_id="evt-empty", event_type="MessageEvent")
    rows = {row.event_id: row}
    db = _Session(rows)

    monkeypatch.setattr("app.api.v1.endpoints.webhook.AsyncSessionLocal", lambda: db)
    monkeypatch.setattr("app.api.v1.endpoints.webhook.MessageEvent", type(_event()))
    monkeypatch.setattr(
        "app.api.v1.endpoints.webhook.handle_message_event", AsyncMock()
    )
    monkeypatch.setattr("app.api.v1.endpoints.webhook.redis_client", _redis())

    await process_webhook_events([_event("evt-empty")])

    assert row.reply_status is ReplyDeliveryStatus.NONE
    assert row.inbound_applied_at is not None


@pytest.mark.asyncio
async def test_durable_claim_allows_only_one_worker():
    row = WebhookEvent(event_id="evt-claim", event_type="MessageEvent")
    db = _Session({row.event_id: row})

    token = await webhook_module._claim_event(db, row.event_id)
    second = await webhook_module._claim_event(db, row.event_id)

    assert token is not None
    assert second is None
    assert await webhook_module._finalize_event(db, row.event_id, token) is True
    assert row.inbound_applied_at is not None
    assert row.inbound_claimed_at is None


@pytest.mark.asyncio
async def test_redis_outage_still_applies_event_once(monkeypatch):
    row = WebhookEvent(event_id="evt-redis-down", event_type="MessageEvent")
    db = _Session({row.event_id: row})
    handler = AsyncMock()

    monkeypatch.setattr("app.api.v1.endpoints.webhook.AsyncSessionLocal", lambda: db)
    monkeypatch.setattr("app.api.v1.endpoints.webhook.MessageEvent", type(_event()))
    monkeypatch.setattr("app.api.v1.endpoints.webhook.handle_message_event", handler)
    monkeypatch.setattr("app.api.v1.endpoints.webhook.drain_outbox", AsyncMock(return_value=0))
    redis = _redis()
    redis.set = AsyncMock(return_value=None)
    monkeypatch.setattr("app.api.v1.endpoints.webhook.redis_client", redis)

    await process_webhook_events([_event(row.event_id)])

    handler.assert_awaited_once()
    assert row.inbound_applied_at is not None


class _ApiError(Exception):
    def __init__(self, status):
        super().__init__(f"LINE API error {status}")
        self.status = status


@pytest.mark.asyncio
async def test_staff_failure_does_not_mark_reply_failed(monkeypatch):
    row = WebhookEvent(event_id="evt-staff-fail", event_type="MessageEvent")
    db = _Session({row.event_id: row})

    async def handler(event, session, box):
        box.append(reply(AsyncMock()))
        box.append(other(AsyncMock(side_effect=_ApiError(500))))

    monkeypatch.setattr("app.api.v1.endpoints.webhook.AsyncSessionLocal", lambda: db)
    monkeypatch.setattr("app.api.v1.endpoints.webhook.MessageEvent", type(_event()))
    monkeypatch.setattr("app.api.v1.endpoints.webhook.handle_message_event", handler)
    monkeypatch.setattr("app.api.v1.endpoints.webhook.redis_client", _redis())

    await process_webhook_events([_event(row.event_id)])

    assert row.reply_status is ReplyDeliveryStatus.SENT


@pytest.mark.asyncio
async def test_uncertain_reply_is_recorded_as_unknown(monkeypatch):
    row = WebhookEvent(event_id="evt-reply-unknown", event_type="MessageEvent")
    db = _Session({row.event_id: row})

    async def handler(event, session, box):
        box.append(reply(AsyncMock(side_effect=TimeoutError())))

    monkeypatch.setattr("app.api.v1.endpoints.webhook.AsyncSessionLocal", lambda: db)
    monkeypatch.setattr("app.api.v1.endpoints.webhook.MessageEvent", type(_event()))
    monkeypatch.setattr("app.api.v1.endpoints.webhook.handle_message_event", handler)
    monkeypatch.setattr("app.api.v1.endpoints.webhook.redis_client", _redis())

    await process_webhook_events([_event(row.event_id)])

    assert row.reply_status is ReplyDeliveryStatus.UNKNOWN
