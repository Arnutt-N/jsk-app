"""Unit tests for TelegramService real send paths (R3-H8).

Every test uses a FRESH TelegramService() — load_credentials mutates
bot_token/chat_id, so a shared instance would bleed config across tests.
Pure mocks: no DB, no network.
"""

from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest

from app.services import telegram_service as tg_mod
from app.services.telegram_service import TelegramService

CRED = SimpleNamespace(credentials="enc", metadata_json={"admin_chat_id": "42"})


class _FakeCM:
    """Minimal async stand-in for httpx.AsyncClient as a context manager."""

    def __init__(self, status_code=200, text="ok", exc=None, calls=None):
        self._s = (status_code, text, exc, calls if calls is not None else [])

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc_info):
        return False

    async def post(self, url, json=None):
        status_code, text, exc, calls = self._s
        calls.append({"url": url, "json": json})
        if exc is not None:
            raise exc
        return SimpleNamespace(status_code=status_code, text=text)


def _patch_creds(cred):
    return (
        patch.object(
            tg_mod.credential_service,
            "get_default_credential",
            new=AsyncMock(return_value=cred),
        ),
        patch.object(
            tg_mod.credential_service,
            "decrypt_credentials",
            return_value={"bot_token": "tok"},
        ),
    )


@pytest.mark.asyncio
async def test_send_alert_unconfigured_returns_false():
    db = AsyncMock()
    get_cred, decrypt = _patch_creds(None)
    with get_cred, decrypt, patch("httpx.AsyncClient") as client_cls:
        result = await TelegramService().send_alert_message("hi", db)
    assert result is False
    client_cls.assert_not_called()


@pytest.mark.asyncio
async def test_send_handoff_200_returns_true_and_posts_expected_payload():
    db = AsyncMock()
    calls = []
    get_cred, decrypt = _patch_creds(CRED)
    with (
        get_cred,
        decrypt,
        patch("httpx.AsyncClient", return_value=_FakeCM(200, "ok", calls=calls)),
    ):
        result = await TelegramService().send_handoff_notification(
            "Ann", None, [SimpleNamespace(content="hello")], "https://admin/x", db
        )
    assert result is True
    assert len(calls) == 1
    assert "tok" in calls[0]["url"]
    assert calls[0]["json"]["chat_id"] == "42"


@pytest.mark.asyncio
async def test_send_alert_non_200_returns_false():
    db = AsyncMock()
    get_cred, decrypt = _patch_creds(CRED)
    with (
        get_cred,
        decrypt,
        patch("httpx.AsyncClient", return_value=_FakeCM(500, "err")),
    ):
        result = await TelegramService().send_alert_message("hi", db)
    assert result is False


@pytest.mark.asyncio
async def test_send_alert_post_exception_returns_false():
    db = AsyncMock()
    get_cred, decrypt = _patch_creds(CRED)
    with (
        get_cred,
        decrypt,
        patch("httpx.AsyncClient", return_value=_FakeCM(exc=RuntimeError("boom"))),
    ):
        result = await TelegramService().send_alert_message("hi", db)
    assert result is False


@pytest.mark.asyncio
async def test_send_handoff_escapes_html_in_message_content():
    db = AsyncMock()
    calls = []
    get_cred, decrypt = _patch_creds(CRED)
    with (
        get_cred,
        decrypt,
        patch("httpx.AsyncClient", return_value=_FakeCM(200, "ok", calls=calls)),
    ):
        result = await TelegramService().send_handoff_notification(
            "Ann",
            None,
            [SimpleNamespace(content="<script>x</script>")],
            "https://admin/x",
            db,
        )
    assert result is True
    assert "&lt;script&gt;" in calls[0]["json"]["text"]
