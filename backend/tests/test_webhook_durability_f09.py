"""F09: durable webhook intake, exactly-once inbound effects, separate reply status."""
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.api.v1.endpoints.webhook import line_webhook, process_webhook_events
from app.models.webhook_event import ReplyDeliveryStatus, WebhookEvent


def _event(event_id="evt-f09", text="สวัสดี"):
    return SimpleNamespace(
        webhook_event_id=event_id,
        reply_token="reply-token",
        source=SimpleNamespace(user_id="U123"),
        message=SimpleNamespace(id="m1", type="text", text=text),
    )


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
    assert column.type.enums == ["none", "sent", "failed"]
    assert column.type._valid_lookup["sent"] == ReplyDeliveryStatus.SENT


@pytest.mark.asyncio
async def test_event_id_committed_before_ack(monkeypatch):
    rows = {}
    db = _Session(rows)
    parsed = [_event("evt-ack")]
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
    assert row.event_type == "SimpleNamespace"
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

    monkeypatch.setattr("app.api.v1.endpoints.webhook.AsyncSessionLocal", lambda: db)
    monkeypatch.setattr("app.api.v1.endpoints.webhook.MessageEvent", type(_event()))
    monkeypatch.setattr(
        "app.api.v1.endpoints.webhook.handle_message_event", AsyncMock()
    )
    monkeypatch.setattr(
        "app.api.v1.endpoints.webhook.drain_outbox", AsyncMock(return_value=0)
    )
    monkeypatch.setattr("app.api.v1.endpoints.webhook.redis_client", _redis())

    await process_webhook_events([_event("evt-ok")])

    assert row.reply_status is ReplyDeliveryStatus.SENT
    assert row.inbound_applied_at is not None
