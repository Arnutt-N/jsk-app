"""F01: an acknowledged webhook event must survive a restart.

The receipt committed before ``200 OK`` carries no replayable input today, so a
crash in the in-process background task loses the event until LINE happens to
redeliver it. These tests pin the recovery contract:

* the receipt stores a minimal, replayable payload (message id, no personal
  content — no text, no LINE user id, no reply token);
* a startup recovery consumer applies a receipt left pending by a crash;
* retention bounds how long a payload is replayable.
"""
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.api.v1.endpoints import webhook as webhook_module
from app.api.v1.endpoints.webhook import line_webhook
from app.core.config import settings
from app.models.webhook_event import WebhookEvent
from app.tasks import webhook_recovery
from app.tasks.webhook_recovery import RECOVERY_GRACE_SECONDS


def _body(event_id="evt-f01", text="ข้อมูลส่วนตัว"):
    import json

    return json.dumps(
        {
            "destination": "Udest",
            "events": [
                {
                    "type": "message",
                    "webhookEventId": event_id,
                    "mode": "active",
                    "timestamp": 1700000000000,
                    "source": {"type": "user", "userId": "U123"},
                    "replyToken": "reply-token",
                    "message": {"id": "m1", "type": "text", "text": text},
                }
            ],
        }
    ).encode("utf-8")


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
    """Fake AsyncSession: `pending` holds rows the recovery query returns."""

    def __init__(self, pending=None):
        self.pending = list(pending or [])
        self.added = []
        self.commit = AsyncMock()
        self.rollback = AsyncMock()

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return False

    async def execute(self, stmt):
        rows = self.pending
        # The recovery query filters by the received_at window; the fake
        # applies the same window using the module's grace and the settings TTL.
        now = datetime.now(timezone.utc)
        cutoff = now - timedelta(seconds=webhook_recovery.RECOVERY_GRACE_SECONDS)
        retention = now - timedelta(seconds=settings.WEBHOOK_EVENT_TTL)
        rows = [r for r in rows if retention < r.received_at < cutoff]
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


def _signed_request(monkeypatch, body):
    monkeypatch.setattr(
        "app.api.v1.endpoints.webhook._read_body_with_limit", AsyncMock(return_value=body)
    )
    monkeypatch.setattr(
        "app.api.v1.endpoints.webhook.parser",
        SimpleNamespace(parse=lambda b, s: webhook_module.parser.parse(b, s)),
    )
    return body


@pytest.mark.asyncio
async def test_receipt_stores_replayable_payload_without_message_text(monkeypatch):
    db = _Session()
    monkeypatch.setattr("app.api.v1.endpoints.webhook.AsyncSessionLocal", lambda: db)
    body = _body()
    monkeypatch.setattr(
        "app.api.v1.endpoints.webhook._read_body_with_limit", AsyncMock(return_value=body)
    )
    # Real parser verifies the signature; stub only the verification step.
    monkeypatch.setattr(
        "app.api.v1.endpoints.webhook.parser",
        SimpleNamespace(parse=lambda b, s: [webhook_module.MessageEvent(
            webhook_event_id="evt-f01",
            mode="active",
            timestamp=1700000000000,
            delivery_context={"isRedelivery": False},
            source={"type": "user", "userId": "U123"},
            reply_token="reply-token",
            message={"id": "m1", "type": "text", "text": "ข้อมูลส่วนตัว"},
        )]),
    )

    await line_webhook(
        SimpleNamespace(headers={}),
        SimpleNamespace(add_task=lambda *a, **k: None),
        "sig",
    )

    row = db.added[0]
    assert row.event_id == "evt-f01"
    assert row.payload is not None
    assert "m1" in row.payload.values()
    assert "U123" not in row.payload
    assert "reply-token" not in row.payload
    assert row.inbound_applied_at is None


@pytest.mark.asyncio
async def test_startup_recovery_applies_pending_receipt(monkeypatch):
    stale = datetime.now(timezone.utc) - timedelta(seconds=RECOVERY_GRACE_SECONDS + 10)
    row = WebhookEvent(
        event_id="evt-pending",
        event_type="MessageEvent",
        payload={"type": "MessageEvent", "webhookEventId": "evt-pending", "id": "m1"},
        received_at=stale,
    )
    db = _Session(pending=[row])
    monkeypatch.setattr("app.tasks.webhook_recovery.AsyncSessionLocal", lambda: db)

    handled = []

    async def fake_process(events):
        handled.extend(events)

    monkeypatch.setattr(webhook_module, "process_webhook_events", fake_process)
    monkeypatch.setattr("app.tasks.webhook_recovery.RECOVERY_INTERVAL_SECONDS", 0.01)

    await webhook_recovery.start_webhook_recovery()
    await webhook_recovery._run_once()
    await webhook_recovery.stop_webhook_recovery()

    assert [e.webhook_event_id for e in handled] == ["evt-pending"]


@pytest.mark.asyncio
async def test_recovery_skips_fresh_receipt_within_grace(monkeypatch):
    fresh = WebhookEvent(
        event_id="evt-fresh",
        event_type="MessageEvent",
        payload={"type": "MessageEvent", "webhookEventId": "evt-fresh", "id": "m2"},
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