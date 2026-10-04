"""Webhook outbox: mutate → commit → announce (R3-M3). Pure mocks, local."""
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.api.v1.endpoints.webhook import process_webhook_events
from app.services.message_intake.commands import handle_check_status
from app.services.message_intake.message_handler import handle_message_event
from app.services.outbox import drain_outbox, new_outbox


@pytest.mark.asyncio
async def test_drain_sends_all_and_isolates_failures():
    first = AsyncMock()
    failing = AsyncMock(side_effect=RuntimeError("boom"))
    last = AsyncMock()
    box = [first, failing, last]

    await drain_outbox(box)  # must not raise

    first.assert_awaited_once()
    failing.assert_awaited_once()
    last.assert_awaited_once()


@pytest.mark.asyncio
async def test_box_mode_collects_without_sending():
    line_svc = MagicMock()
    line_svc.reply_text = AsyncMock()
    line_svc.reply_flex = AsyncMock()
    result = MagicMock()
    result.scalars.return_value.all.return_value = []  # no requests → L68 path
    db = AsyncMock()
    db.execute = AsyncMock(return_value=result)
    box = new_outbox()

    with (
        patch(
            "app.services.user_identity_service.resolve_by_line_id",
            new=AsyncMock(return_value=None),
        ),
        patch(
            "app.services.message_intake.commands.get_line_service",
            return_value=line_svc,
        ),
    ):
        await handle_check_status("U1", "tok", db, outbox=box)

    line_svc.reply_text.assert_not_awaited()
    assert len(box) == 1

    await drain_outbox(box)
    line_svc.reply_text.assert_awaited_once()


class _FakeMessageEvent:
    pass


class _FakeSessionContext:
    def __init__(self, db):
        self.db = db

    async def __aenter__(self):
        return self.db

    async def __aexit__(self, exc_type, exc, tb):
        return False


def _make_event():
    event = _FakeMessageEvent()
    event.webhook_event_id = "evt-order"
    return event


@pytest.mark.asyncio
async def test_webhook_drains_after_commit_in_order(monkeypatch):
    from app.api.v1.endpoints import webhook as webhook_module

    calls: list[str] = []
    handle = AsyncMock(side_effect=lambda *a, **k: calls.append("handle"))
    drain = AsyncMock(side_effect=lambda *a, **k: calls.append("drain"))
    db = AsyncMock()
    db.commit = AsyncMock(side_effect=lambda: calls.append("commit"))

    redis = MagicMock()
    redis.exists = AsyncMock(return_value=False)
    redis.set = AsyncMock(return_value=True)
    redis.setex = AsyncMock()
    redis.release_lock = AsyncMock(return_value=True)

    monkeypatch.setattr(webhook_module, "MessageEvent", _FakeMessageEvent)
    monkeypatch.setattr(webhook_module, "AsyncSessionLocal", lambda: _FakeSessionContext(db))
    monkeypatch.setattr(webhook_module, "handle_message_event", handle)
    monkeypatch.setattr(webhook_module, "drain_outbox", drain)
    monkeypatch.setattr(webhook_module, "redis_client", redis)

    await process_webhook_events([_make_event()])

    assert calls == ["handle", "commit", "drain"]
    handle.assert_awaited_once()
    db.commit.assert_awaited_once()
    drain.assert_awaited_once()


@pytest.mark.asyncio
async def test_webhook_skips_drain_when_handler_raises(monkeypatch):
    from app.api.v1.endpoints import webhook as webhook_module

    handle = AsyncMock(side_effect=RuntimeError("mutate failed"))
    drain = AsyncMock()
    db = AsyncMock()

    redis = MagicMock()
    redis.exists = AsyncMock(return_value=False)
    redis.set = AsyncMock(return_value=True)
    redis.setex = AsyncMock()
    redis.release_lock = AsyncMock(return_value=True)

    monkeypatch.setattr(webhook_module, "MessageEvent", _FakeMessageEvent)
    monkeypatch.setattr(webhook_module, "AsyncSessionLocal", lambda: _FakeSessionContext(db))
    monkeypatch.setattr(webhook_module, "handle_message_event", handle)
    monkeypatch.setattr(webhook_module, "drain_outbox", drain)
    monkeypatch.setattr(webhook_module, "redis_client", redis)

    await process_webhook_events([_make_event()])  # must not raise

    db.rollback.assert_awaited_once()
    drain.assert_not_awaited()


class _FakePostbackEvent:
    pass


def _make_postback_event(data="csat|5|5"):
    event = _FakePostbackEvent()
    event.webhook_event_id = "evt-postback"
    event.source = SimpleNamespace(user_id="U1")
    event.postback = SimpleNamespace(data=data)
    event.reply_token = "tok"
    return event


@pytest.mark.asyncio
async def test_postback_drains_after_commit_in_order(monkeypatch):
    """D2: postback branch mirrors the message branch (handle → commit → drain)."""
    from app.api.v1.endpoints import webhook as webhook_module

    calls: list[str] = []
    handle = AsyncMock(side_effect=lambda *a, **k: calls.append("handle"))
    drain = AsyncMock(side_effect=lambda *a, **k: calls.append("drain"))
    db = AsyncMock()
    db.commit = AsyncMock(side_effect=lambda: calls.append("commit"))

    redis = MagicMock()
    redis.exists = AsyncMock(return_value=False)
    redis.set = AsyncMock(return_value=True)
    redis.setex = AsyncMock()
    redis.release_lock = AsyncMock(return_value=True)

    monkeypatch.setattr(webhook_module, "PostbackEvent", _FakePostbackEvent)
    monkeypatch.setattr(webhook_module, "AsyncSessionLocal", lambda: _FakeSessionContext(db))
    monkeypatch.setattr(webhook_module, "handle_postback_event", handle)
    monkeypatch.setattr(webhook_module, "drain_outbox", drain)
    monkeypatch.setattr(webhook_module, "redis_client", redis)

    await process_webhook_events([_make_postback_event()])

    assert calls == ["handle", "commit", "drain"]
    handle.assert_awaited_once()
    db.commit.assert_awaited_once()
    drain.assert_awaited_once()


@pytest.mark.asyncio
async def test_csat_thank_you_queued_not_sent():
    """D2: CSAT thank-you is queued into the shared box, never sent pre-commit."""
    from app.services.message_intake.postback_handler import handle_csat_response
    from app.services.outbox import drain_outbox as real_drain

    line_svc = MagicMock()
    line_svc.reply_text = AsyncMock()
    box = new_outbox()
    db = AsyncMock()

    with (
        patch(
            "app.services.message_intake.postback_handler.get_line_service",
            return_value=line_svc,
        ),
        patch(
            "app.services.csat_service.csat_service",
        ) as csat_svc,
        patch(
            "app.services.user_identity_service.resolve_by_line_id",
            new=AsyncMock(return_value=SimpleNamespace(id=7)),
        ),
    ):
        csat_svc.record_response = AsyncMock()
        csat_svc.get_thank_you_message = MagicMock(return_value="thanks!")
        await handle_csat_response("U1", "csat|5|5", "tok", db, outbox=box)

    line_svc.reply_text.assert_not_awaited()
    assert len(box) == 1

    await real_drain(box)
    line_svc.reply_text.assert_awaited_once_with("tok", "thanks!")


@pytest.mark.asyncio
async def test_postback_invalid_data_queues_nothing():
    """D2: malformed/unknown postbacks queue nothing (no ghosts, no crash)."""
    from app.services.message_intake.postback_handler import handle_postback_event

    line_svc = MagicMock()
    line_svc.show_loading_animation = AsyncMock()

    for data in ("csat|bad", "action=unknown"):
        box = new_outbox()
        with patch(
            "app.services.message_intake.postback_handler.get_line_service",
            return_value=line_svc,
        ):
            await handle_postback_event(_make_postback_event(data), AsyncMock(), box)
        assert box == []


@pytest.mark.asyncio
async def test_wrapper_clears_box_on_inner_failure():
    with (
        patch(
            "app.services.message_intake.message_handler._handle_message_event_inner",
            new=AsyncMock(side_effect=RuntimeError("boom")),
        ),
        patch(
            "app.services.message_intake.message_handler.drain_outbox",
            new=AsyncMock(),
        ) as drain,
    ):
        with pytest.raises(RuntimeError, match="boom"):
            await handle_message_event(object(), AsyncMock())

    drain.assert_not_awaited()
