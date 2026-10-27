"""Webhook outbox accounting (C-BE-02). Pure mocks, local.

Contract: drain_outbox returns the failure count; the webhook marks the
dedup key only when the count is zero, else logs delivery_failed.
"""
import logging
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.api.v1.endpoints.webhook import process_webhook_events
from app.services.outbox import drain_outbox


@pytest.mark.asyncio
async def test_drain_returns_zero_when_all_succeed():
    box = [AsyncMock(), AsyncMock()]

    failures = await drain_outbox(box)

    assert failures == 0


@pytest.mark.asyncio
async def test_drain_returns_failure_count_and_continues():
    first = AsyncMock()
    failing = AsyncMock(side_effect=RuntimeError("boom"))
    last = AsyncMock()
    box = [first, failing, last]

    failures = await drain_outbox(box)  # must not raise

    assert failures == 1
    first.assert_awaited_once()
    failing.assert_awaited_once()
    last.assert_awaited_once()


class _FakeMessageEvent:
    pass


class _FakeSessionContext:
    def __init__(self, db):
        self.db = db

    async def __aenter__(self):
        return self.db

    async def __aexit__(self, exc_type, exc, tb):
        return False


def _make_event(event_id="evt-accounting"):
    event = _FakeMessageEvent()
    event.webhook_event_id = event_id
    return event


def _redis_stub():
    redis = MagicMock()
    redis.exists = AsyncMock(return_value=False)
    redis.set = AsyncMock(return_value=True)
    redis.setex = AsyncMock()
    redis.release_lock = AsyncMock(return_value=True)
    return redis


@pytest.mark.asyncio
async def test_failed_drain_skips_dedup_marker(monkeypatch, caplog):
    """One send raises ⇒ marker absent + delivery_failed logged."""
    from app.api.v1.endpoints import webhook as webhook_module

    async def handle(event, db, box):
        async def boom():
            raise RuntimeError("send down")

        box.append(boom)

    db = AsyncMock()
    redis = _redis_stub()

    monkeypatch.setattr(webhook_module, "MessageEvent", _FakeMessageEvent)
    monkeypatch.setattr(webhook_module, "AsyncSessionLocal", lambda: _FakeSessionContext(db))
    monkeypatch.setattr(webhook_module, "handle_message_event", handle)
    monkeypatch.setattr(webhook_module, "redis_client", redis)

    with caplog.at_level(logging.ERROR, logger="app.services.outbox"):
        await process_webhook_events([_make_event()])

    db.commit.assert_awaited_once()
    redis.setex.assert_not_awaited()
    assert "delivery_failed" in caplog.text


@pytest.mark.asyncio
async def test_clean_drain_sets_dedup_marker(monkeypatch, caplog):
    """All sends succeed ⇒ marker present + no delivery_failed logged."""
    from app.api.v1.endpoints import webhook as webhook_module

    async def handle(event, db, box):
        box.append(AsyncMock())

    db = AsyncMock()
    redis = _redis_stub()

    monkeypatch.setattr(webhook_module, "MessageEvent", _FakeMessageEvent)
    monkeypatch.setattr(webhook_module, "AsyncSessionLocal", lambda: _FakeSessionContext(db))
    monkeypatch.setattr(webhook_module, "handle_message_event", handle)
    monkeypatch.setattr(webhook_module, "redis_client", redis)

    with caplog.at_level(logging.ERROR):
        await process_webhook_events([_make_event("evt-clean")])

    db.commit.assert_awaited_once()
    redis.setex.assert_awaited_once()
    assert "delivery_failed" not in caplog.text
