"""F01: an acknowledged webhook event must survive a restart.

The receipt committed before ``200 OK`` must carry enough input to rebuild the
real SDK event, so restart recovery runs the same handlers as live intake:

* the stored payload keeps the sender id, content type, and text a handler
  reads, and drops ephemeral reply/quote tokens;
* replay rebuilds a real SDK event (``isinstance`` routing works);
* a receipt the dispatcher cannot rebuild gets a terminal error marker and does
  not stall a valid receipt in the same batch;
* retention bounds how long a payload is replayable.
"""
import json
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from linebot.v3.webhooks import MessageEvent, TextMessageContent

from app.api.v1.endpoints import webhook as webhook_module
from app.api.v1.endpoints.webhook import build_payload, line_webhook
from app.core.config import settings
from app.models.webhook_event import WebhookEvent
from app.tasks import webhook_recovery
from app.tasks.webhook_recovery import RECOVERY_GRACE_SECONDS

_EVENT_DICT = {
    "type": "message",
    "webhookEventId": "evt-f01",
    "mode": "active",
    "timestamp": 1700000000000,
    "deliveryContext": {"isRedelivery": False},
    "source": {"type": "user", "userId": "U123"},
    "replyToken": "reply-token",
    "message": {"id": "m1", "type": "text", "text": "ข้อมูลส่วนตัว", "quoteToken": "q"},
}


def _real_message_event(event_dict=None) -> MessageEvent:
    return MessageEvent.from_dict(dict(event_dict or _EVENT_DICT))


class _Result:
    def __init__(self, rows):
        self._rows = rows

    def scalars(self):
        return self

    def all(self):
        return list(self._rows)

    def scalar_one_or_none(self):
        return self._rows[0] if self._rows else None


class _Session:
    """Fake AsyncSession: `pending` holds rows the recovery select returns."""

    def __init__(self, pending=None):
        self.pending = list(pending or [])
        self.added = []
        self.statements = []
        self.commit = AsyncMock()
        self.rollback = AsyncMock()

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return False

    async def execute(self, stmt):
        self.statements.append(stmt)
        now = datetime.now(timezone.utc)
        cutoff = now - timedelta(seconds=webhook_recovery.RECOVERY_GRACE_SECONDS)
        retention = now - timedelta(seconds=settings.WEBHOOK_EVENT_TTL)
        rows = [r for r in self.pending if retention < r.received_at < cutoff]
        return _Result(rows)

    async def get(self, model, key):
        return None

    def add(self, row):
        self.added.append(row)

    def begin_nested(self):
        return _Nested()


class _Nested:
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


@pytest.mark.asyncio
async def test_receipt_stores_replayable_payload_without_ephemeral_tokens(monkeypatch):
    db = _Session()
    monkeypatch.setattr("app.api.v1.endpoints.webhook.AsyncSessionLocal", lambda: db)
    body = json.dumps({"destination": "Udest", "events": []}).encode("utf-8")
    monkeypatch.setattr(
        "app.api.v1.endpoints.webhook._read_body_with_limit", AsyncMock(return_value=body)
    )
    monkeypatch.setattr(
        "app.api.v1.endpoints.webhook.parser",
        SimpleNamespace(parse=lambda b, s: [_real_message_event()]),
    )

    await line_webhook(
        SimpleNamespace(headers={}),
        SimpleNamespace(add_task=lambda *a, **k: None),
        "sig",
    )

    row = db.added[0]
    assert row.event_id == "evt-f01"
    assert row.event_type == "MessageEvent"
    assert row.payload["source"]["userId"] == "U123"
    assert row.payload["message"]["text"] == "ข้อมูลส่วนตัว"
    assert "replyToken" not in row.payload
    assert "quoteToken" not in row.payload["message"]
    assert row.inbound_applied_at is None


def test_build_payload_keeps_text_and_drops_tokens():
    payload = build_payload(_real_message_event())

    assert payload is not None
    assert payload["message"]["id"] == "m1"
    assert payload["message"]["text"] == "ข้อมูลส่วนตัว"
    assert "replyToken" not in payload


def test_event_from_payload_rebuilds_real_sdk_event():
    payload = build_payload(_real_message_event())

    event = webhook_recovery.event_from_payload("MessageEvent", payload)

    assert isinstance(event, MessageEvent)
    assert isinstance(event.message, TextMessageContent)
    assert event.source.user_id == "U123"
    assert event.message.text == "ข้อมูลส่วนตัว"
    assert event.reply_token != "reply-token"  # never the live token


def test_event_from_payload_rejects_unusable_payloads():
    assert webhook_recovery.event_from_payload("MessageEvent", None) is None
    assert webhook_recovery.event_from_payload("JoinEvent", {"type": "join"}) is None
    assert webhook_recovery.event_from_payload("MessageEvent", {"bogus": 1}) is None


@pytest.mark.asyncio
async def test_unsupported_event_writes_no_receipt(monkeypatch):
    db = _Session()
    monkeypatch.setattr("app.api.v1.endpoints.webhook.AsyncSessionLocal", lambda: db)
    body = json.dumps({"destination": "Udest", "events": []}).encode("utf-8")
    monkeypatch.setattr(
        "app.api.v1.endpoints.webhook._read_body_with_limit", AsyncMock(return_value=body)
    )
    monkeypatch.setattr(
        "app.api.v1.endpoints.webhook.parser",
        SimpleNamespace(parse=lambda b, s: [SimpleNamespace(webhook_event_id="evt-join")]),
    )

    await line_webhook(
        SimpleNamespace(headers={}),
        SimpleNamespace(add_task=lambda *a, **k: None),
        "sig",
    )

    assert db.added == []


@pytest.mark.asyncio
async def test_recovered_event_routes_through_real_dispatcher(monkeypatch):
    payload = build_payload(_real_message_event())
    event = webhook_recovery.event_from_payload("MessageEvent", payload)
    handler = AsyncMock()

    monkeypatch.setattr(
        webhook_module, "_claim_event", AsyncMock(return_value=datetime.now(timezone.utc))
    )
    monkeypatch.setattr(webhook_module, "_finalize_event", AsyncMock(return_value=True))
    monkeypatch.setattr(webhook_module, "AsyncSessionLocal", lambda: _Session())
    monkeypatch.setattr(webhook_module, "handle_message_event", handler)
    monkeypatch.setattr(webhook_module, "redis_client", _redis())

    await webhook_module.process_webhook_events([event])

    handler.assert_awaited_once()
    routed = handler.await_args.args[0]
    assert isinstance(routed, MessageEvent)
    assert routed.message.text == "ข้อมูลส่วนตัว"


@pytest.mark.asyncio
async def test_recovery_dispatches_valid_row_and_skips_unrecoverable_one(monkeypatch):
    stale = datetime.now(timezone.utc) - timedelta(seconds=RECOVERY_GRACE_SECONDS + 10)
    valid = WebhookEvent(
        event_id="evt-ok",
        event_type="MessageEvent",
        payload=build_payload(_real_message_event()),
        received_at=stale,
    )
    null_payload = WebhookEvent(
        event_id="evt-null",
        event_type="MessageEvent",
        payload=None,
        received_at=stale,
    )
    db = _Session(pending=[null_payload, valid])
    monkeypatch.setattr("app.tasks.webhook_recovery.AsyncSessionLocal", lambda: db)

    handled = []

    async def fake_process(events):
        handled.extend(events)

    monkeypatch.setattr(webhook_module, "process_webhook_events", fake_process)

    await webhook_recovery._run_once()

    assert [e.webhook_event_id for e in handled] == ["evt-f01"]
    # A terminal error marker was written for the null row, and no exception
    # aborted the batch.
    assert any("inbound_error" in str(stmt) for stmt in db.statements)


@pytest.mark.asyncio
async def test_recovery_skips_fresh_receipt_within_grace(monkeypatch):
    fresh = WebhookEvent(
        event_id="evt-fresh",
        event_type="MessageEvent",
        payload=build_payload(_real_message_event()),
        received_at=datetime.now(timezone.utc),
    )
    db = _Session(pending=[fresh])
    monkeypatch.setattr("app.tasks.webhook_recovery.AsyncSessionLocal", lambda: db)
    handled = []

    async def fake_process(events):
        handled.extend(events)

    monkeypatch.setattr(webhook_module, "process_webhook_events", fake_process)

    await webhook_recovery._run_once()

    assert handled == []


def test_payload_column_and_retention_defaults_exist():
    column = WebhookEvent.__table__.c.payload
    assert column is not None
    assert webhook_recovery.RECOVERY_GRACE_SECONDS >= 30
    assert webhook_recovery.RECOVERY_INTERVAL_SECONDS >= 1
    assert settings.WEBHOOK_EVENT_CLAIM_SECONDS < settings.WEBHOOK_EVENT_TTL
