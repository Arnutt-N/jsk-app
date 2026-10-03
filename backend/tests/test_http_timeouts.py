"""Shared httpx timeout budgets: one pin per file + the upload budget (R3-M23)."""
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from app.core.http_timeouts import DEFAULT_TIMEOUT, UPLOAD_TIMEOUT
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


class _FakeResp:
    def __init__(self, payload, status_code=200):
        self._payload = payload
        self.status_code = status_code
        self.text = "ok"

    def raise_for_status(self):
        if self.status_code >= 400:
            raise httpx.HTTPStatusError(
                "err", request=MagicMock(), response=MagicMock()
            )

    def json(self):
        return self._payload


class _FakeCM2:
    def __init__(self, payload, status_code=200):
        self._resp = _FakeResp(payload, status_code)

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc_info):
        return False

    async def get(self, url, **kwargs):
        return self._resp

    async def post(self, url, **kwargs):
        return self._resp


@pytest.mark.asyncio
async def test_telegram_client_uses_default_timeout():
    db = AsyncMock()
    with (
        patch.object(
            tg_mod.credential_service,
            "get_default_credential",
            new=AsyncMock(return_value=CRED),
        ),
        patch.object(
            tg_mod.credential_service,
            "decrypt_credentials",
            return_value={"bot_token": "tok"},
        ),
        patch("httpx.AsyncClient", return_value=_FakeCM(200, "ok")) as client_cls,
    ):
        assert await TelegramService().send_alert_message("hi", db) is True
    assert client_cls.call_args.kwargs["timeout"] == DEFAULT_TIMEOUT


@pytest.mark.asyncio
async def test_rich_menu_json_client_uses_default_timeout():
    from app.services.rich_menu_service import RichMenuService

    with (
        patch.object(
            RichMenuService,
            "get_client_headers",
            new=AsyncMock(return_value={}),
        ),
        patch(
            "httpx.AsyncClient", return_value=_FakeCM2({"richmenus": []})
        ) as client_cls,
    ):
        assert await RichMenuService.list_from_line(AsyncMock()) == []
    assert client_cls.call_args.kwargs["timeout"] == DEFAULT_TIMEOUT


@pytest.mark.asyncio
async def test_rich_menu_upload_uses_upload_timeout():
    from app.services.rich_menu_service import RichMenuService

    with (
        patch.object(
            RichMenuService,
            "get_client_headers",
            new=AsyncMock(return_value={}),
        ),
        patch("httpx.AsyncClient", return_value=_FakeCM2({})) as client_cls,
    ):
        assert await RichMenuService.upload_image_to_line(
            AsyncMock(), "menu1", b"img", "image/jpeg"
        ) == {}
    assert client_cls.call_args.kwargs["timeout"] == UPLOAD_TIMEOUT


@pytest.mark.asyncio
async def test_settings_validate_uses_default_timeout():
    from app.api.v1.endpoints.settings import (
        ValidateLineTokenRequest,
        validate_line_token,
    )

    db = AsyncMock()
    admin = SimpleNamespace(id=1)
    with (
        patch("httpx.AsyncClient", return_value=_FakeCM2({"userId": "U"})) as client_cls,
        patch(
            "app.api.v1.endpoints.settings.create_audit_log",
            new=AsyncMock(),
        ) as mock_audit,
    ):
        result = await validate_line_token(
            ValidateLineTokenRequest(channel_access_token="t"), db, admin
        )
    assert result["status"] == "valid"
    assert result["data"] == {"userId": "U"}
    assert client_cls.call_args.kwargs["timeout"] == DEFAULT_TIMEOUT
    mock_audit.assert_awaited_once()
