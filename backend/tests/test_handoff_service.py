from types import SimpleNamespace
from unittest.mock import ANY, AsyncMock

import pytest

from app.models.user import ChatMode
from app.services.handoff_service import HandoffService


@pytest.mark.asyncio
async def test_get_configurable_keywords_uses_cached_defaults(monkeypatch):
    service = HandoffService()
    get_setting = AsyncMock(return_value="")
    monkeypatch.setattr("app.services.handoff_service.SettingsService.get_setting", get_setting)

    first = await service.get_configurable_keywords(AsyncMock())
    second = await service.get_configurable_keywords(AsyncMock())

    assert "agent" in first
    assert first == second
    assert get_setting.await_count == 1


@pytest.mark.asyncio
async def test_get_configurable_keywords_parses_json_list(monkeypatch):
    service = HandoffService()
    monkeypatch.setattr(
        "app.services.handoff_service.SettingsService.get_setting",
        AsyncMock(return_value='[" Escalate ", "ESCALATE", "help desk"]'),
    )

    keywords = await service.get_configurable_keywords(AsyncMock())

    assert keywords == ["escalate", "help desk"]


@pytest.mark.asyncio
async def test_check_handoff_keywords_uses_configured_keywords(monkeypatch):
    service = HandoffService()
    monkeypatch.setattr(
        "app.services.handoff_service.SettingsService.get_setting",
        AsyncMock(return_value="escalate"),
    )
    initiate_handoff = AsyncMock()
    monkeypatch.setattr("app.services.handoff_service.live_chat_service.initiate_handoff", initiate_handoff)
    user = SimpleNamespace(chat_mode=ChatMode.BOT, line_user_id="U123")

    result = await service.check_handoff_keywords("Please escalate this case", user, "reply-token", AsyncMock())

    assert result is True
    initiate_handoff.assert_awaited_once_with(user, "reply-token", ANY)
