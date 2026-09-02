"""Webhook signature matrix — the public unauthenticated entry point.

POST /api/v1/webhook verifies X-Line-Signature (base64 HMAC-SHA256 of the raw
body with LINE_CHANNEL_SECRET) and dispatches events via BackgroundTasks.
Zero tests touched this endpoint before this file (review finding H5), and the
dedup lock must FAIL OPEN when Redis is unavailable (H1 tri-state contract).

Isolation: handlers + redis + AsyncSessionLocal are patched in the
`app.api.v1.endpoints.webhook` module namespace, so no DB/Redis/LINE IO ever
runs. Background tasks execute synchronously when TestClient.post returns.
(TestClient is built without a context manager, so the app lifespan never
starts — same pattern as test_rich_menu_image_media.py.)
"""
import base64
import hashlib
import hmac
import json
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app

BASE = "/api/v1/line/webhook"


def _sign(body: str, secret: str = settings.LINE_CHANNEL_SECRET) -> str:
    return base64.b64encode(
        hmac.new(secret.encode(), body.encode(), hashlib.sha256).digest()
    ).decode()


def _text_event_body(event_id: str = "ev-1") -> str:
    return json.dumps({
        "destination": "U" + "d" * 32,
        "events": [{
            "type": "message",
            "replyToken": "reply-token",
            "source": {"type": "user", "userId": "U" + "0" * 32},
            "timestamp": 1700000000000,
            "mode": "active",
            "message": {"type": "text", "id": "m1", "text": "hello", "quoteToken": "q"},
            "webhookEventId": event_id,
            "deliveryContext": {"isRedelivery": False},
        }],
    })


@pytest.fixture
def webhook_mocks():
    """Patch handlers, redis, and the DB session factory in the endpoint module."""
    with patch("app.api.v1.endpoints.webhook._handle_message_event_impl",
               new=AsyncMock()) as msg_handler, \
         patch("app.api.v1.endpoints.webhook.handle_postback_event",
               new=AsyncMock()) as pb_handler, \
         patch("app.api.v1.endpoints.webhook.friend_service.get_or_create_user",
               new=AsyncMock()), \
         patch("app.api.v1.endpoints.webhook.friend_service.handle_follow",
               new=AsyncMock()), \
         patch("app.api.v1.endpoints.webhook.friend_service.handle_unfollow",
               new=AsyncMock()), \
         patch("app.api.v1.endpoints.webhook.redis_client") as redis_mock, \
         patch("app.api.v1.endpoints.webhook.AsyncSessionLocal") as session_factory:
        redis_mock.exists = AsyncMock(return_value=False)
        redis_mock.set = AsyncMock(return_value=True)  # lock acquired
        redis_mock.setex = AsyncMock()
        redis_mock.delete = AsyncMock()

        session_ctx = AsyncMock()
        session_ctx.__aenter__ = AsyncMock(return_value=AsyncMock())
        session_ctx.__aexit__ = AsyncMock(return_value=False)
        session_factory.return_value = session_ctx

        yield {"message_handler": msg_handler, "postback_handler": pb_handler, "redis": redis_mock}


def _post(client: TestClient, body: str, signature):
    headers = {}
    if signature is not None:
        headers["X-Line-Signature"] = signature
    return client.post(BASE, content=body.encode("utf-8"), headers=headers)


class TestWebhookSignature:
    def test_missing_signature_header_is_400(self, webhook_mocks):
        client = TestClient(app)
        try:
            resp = _post(client, _text_event_body(), signature=None)
        finally:
            client.close()
        assert resp.status_code == 400
        assert "Missing X-Line-Signature" in resp.json()["detail"]
        webhook_mocks["message_handler"].assert_not_awaited()

    def test_forged_signature_is_400(self, webhook_mocks):
        client = TestClient(app)
        try:
            resp = _post(client, _text_event_body(), signature="bogus==")
        finally:
            client.close()
        assert resp.status_code == 400
        assert "Invalid signature" in resp.json()["detail"]
        webhook_mocks["message_handler"].assert_not_awaited()

    def test_wrong_secret_signature_is_400(self, webhook_mocks):
        """A signature computed with a different secret must not validate."""
        client = TestClient(app)
        body = _text_event_body()
        try:
            resp = _post(client, body, signature=_sign(body, secret="other-secret"))
        finally:
            client.close()
        assert resp.status_code == 400

    def test_valid_signature_processes_event(self, webhook_mocks):
        client = TestClient(app)
        body = _text_event_body()
        try:
            resp = _post(client, body, signature=_sign(body))
        finally:
            client.close()
        assert resp.status_code == 200
        webhook_mocks["message_handler"].assert_awaited_once()
        # the dedup lock was attempted with the event's lock key
        lock_calls = [c for c in webhook_mocks["redis"].set.call_args_list
                      if c.args and "lock" in str(c.args[0])]
        assert lock_calls, "dedup lock must be attempted for events with an id"

    def test_redis_unavailable_fails_open_and_processes(self, webhook_mocks):
        """H1: set() returning None (Redis down) must NOT drop the event."""
        webhook_mocks["redis"].set = AsyncMock(return_value=None)
        client = TestClient(app)
        body = _text_event_body()
        try:
            resp = _post(client, body, signature=_sign(body))
        finally:
            client.close()
        assert resp.status_code == 200
        webhook_mocks["message_handler"].assert_awaited_once()

    def test_duplicate_event_is_skipped(self, webhook_mocks):
        """set() → False (another worker holds the lock) skips processing."""
        webhook_mocks["redis"].set = AsyncMock(return_value=False)
        client = TestClient(app)
        body = _text_event_body()
        try:
            resp = _post(client, body, signature=_sign(body))
        finally:
            client.close()
        assert resp.status_code == 200
        webhook_mocks["message_handler"].assert_not_awaited()
