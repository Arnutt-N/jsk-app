"""Webhook body limits — F-005 (unbounded buffering) and F-011 (decode order).

POST /api/v1/line/webhook is public and unauthenticated, so everything here
happens before a signature is ever checked:

* F-005 — the handler called `await request.body()` with no cap, so an
  anonymous caller could make the process buffer arbitrary bytes. The cap has
  to reject on the declared Content-Length BEFORE reading, and still enforce a
  limit while streaming for a request that lies about (or omits) its length.
* F-011 — `body.decode("utf-8")` ran first, so a non-UTF-8 body raised
  UnicodeDecodeError and surfaced as a 500 with a traceback. Malformed input is
  a client error: 400.

Both are asserted against the real endpoint with the handler/db/redis layer
patched in the endpoint module, so no infrastructure runs.
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

# 1 MiB is the cap the handler enforces.
MAX_BODY_BYTES = 1024 * 1024


def _sign(raw: bytes, secret: str = settings.LINE_CHANNEL_SECRET) -> str:
    return base64.b64encode(
        hmac.new(secret.encode(), raw, hashlib.sha256).digest()
    ).decode()


def _valid_body() -> bytes:
    return json.dumps(
        {
            "destination": "U" + "d" * 32,
            "events": [
                {
                    "type": "message",
                    "replyToken": "reply-token",
                    "source": {"type": "user", "userId": "U" + "0" * 32},
                    "timestamp": 1700000000000,
                    "mode": "active",
                    "message": {
                        "type": "text",
                        "id": "m1",
                        "text": "hello",
                        "quoteToken": "q",
                    },
                    "webhookEventId": "ev-limits",
                    "deliveryContext": {"isRedelivery": False},
                }
            ],
        }
    ).encode("utf-8")


@pytest.fixture
def webhook_mocks():
    """Patch handlers, redis, and the session factory in the endpoint module."""
    with patch(
        "app.api.v1.endpoints.webhook._handle_message_event_impl", new=AsyncMock()
    ), patch(
        "app.api.v1.endpoints.webhook.handle_postback_event", new=AsyncMock()
    ), patch(
        "app.api.v1.endpoints.webhook.friend_service.get_or_create_user",
        new=AsyncMock(),
    ), patch(
        "app.api.v1.endpoints.webhook.redis_client"
    ) as redis_mock, patch(
        "app.api.v1.endpoints.webhook.AsyncSessionLocal"
    ) as session_factory:
        redis_mock.exists = AsyncMock(return_value=False)
        redis_mock.set = AsyncMock(return_value=True)
        redis_mock.setex = AsyncMock()
        redis_mock.delete = AsyncMock()
        redis_mock.release_lock = AsyncMock(return_value=True)

        session_ctx = AsyncMock()
        session_ctx.__aenter__ = AsyncMock(return_value=AsyncMock())
        session_ctx.__aexit__ = AsyncMock(return_value=False)
        session_factory.return_value = session_ctx
        yield redis_mock


class TestWebhookBodyCap:
    def test_oversize_body_is_413_before_buffering(self, webhook_mocks):
        """A 2 MiB body must be refused on the declared length, not buffered."""
        body = b"x" * (2 * MAX_BODY_BYTES)
        client = TestClient(app)
        try:
            res = client.post(
                BASE,
                content=body,
                headers={"X-Line-Signature": _sign(body)},
            )
        finally:
            client.close()

        assert res.status_code == 413, res.text

    def test_body_at_the_cap_is_still_processed(self, webhook_mocks):
        """The cap is a ceiling, not an off-by-one that rejects valid sizes."""
        body = _valid_body()
        padded = body + b" " * (MAX_BODY_BYTES - len(body))  # exactly the cap
        client = TestClient(app)
        try:
            res = client.post(
                BASE,
                content=padded,
                headers={"X-Line-Signature": _sign(padded)},
            )
        finally:
            client.close()

        # JSON allows trailing whitespace, so this is still a valid signed body.
        assert res.status_code == 200, res.text

    def test_chunked_body_without_content_length_is_still_capped(self, webhook_mocks):
        """A caller can omit Content-Length; the streaming read enforces the cap."""
        body = b"y" * (2 * MAX_BODY_BYTES)

        def _stream():
            # Two chunks, no Content-Length header.
            yield body[:MAX_BODY_BYTES]
            yield body[MAX_BODY_BYTES:]

        client = TestClient(app)
        try:
            res = client.post(
                BASE,
                content=_stream(),
                headers={"X-Line-Signature": _sign(body)},
            )
        finally:
            client.close()

        assert res.status_code == 413, res.text


class TestWebhookDecode:
    def test_non_utf8_body_is_400_not_500(self, webhook_mocks):
        """Malformed bytes are the client's problem, never a traceback."""
        body = b'\xff\xfe{"events": []}'
        client = TestClient(app)
        try:
            res = client.post(
                BASE,
                content=body,
                headers={"X-Line-Signature": _sign(body)},
            )
        finally:
            client.close()

        assert res.status_code == 400, res.text
        assert "unicode" not in res.text.lower()

    def test_valid_signed_body_still_verifies(self, webhook_mocks):
        """Guard the happy path against an over-eager decode change."""
        body = _valid_body()
        client = TestClient(app)
        try:
            res = client.post(
                BASE,
                content=body,
                headers={"X-Line-Signature": _sign(body)},
            )
        finally:
            client.close()

        assert res.status_code == 200, res.text

    def test_bad_signature_is_still_400(self, webhook_mocks):
        body = _valid_body()
        client = TestClient(app)
        try:
            res = client.post(
                BASE,
                content=body,
                headers={"X-Line-Signature": "not-a-real-signature"},
            )
        finally:
            client.close()

        assert res.status_code == 400, res.text
