"""Live-chat initial message outbox (C-BE-01). Pure mocks, local.

Contract: the LINE push leaves only after the session/message commit, so a
commit failure sends nothing (no ghosts).
"""
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.api.v1.endpoints.admin_live_chat import CreateSessionRequest, create_conversation


def _user():
    return SimpleNamespace(id=5, chat_mode="BOT", display_name="Line User")


def _operator():
    return SimpleNamespace(id=1, display_name="Op")


def _db_stub():
    db = AsyncMock()
    db.add = MagicMock()
    return db


def _patch_conversation(monkeypatch, db, line_service):
    from app.api.v1.endpoints import admin_live_chat as module

    live_chat = MagicMock()
    live_chat.get_active_session = AsyncMock(return_value=None)
    monkeypatch.setattr(module, "live_chat_service", live_chat)
    monkeypatch.setattr(
        module, "resolve_by_line_id", AsyncMock(return_value=_user())
    )
    monkeypatch.setattr(module, "line_service", line_service)
    monkeypatch.setattr(
        module, "announce_session_event", AsyncMock()
    )


@pytest.mark.asyncio
async def test_commit_failure_sends_nothing(monkeypatch):
    """Forced commit failure ⇒ push_messages never called."""
    db = _db_stub()
    db.commit = AsyncMock(side_effect=RuntimeError("db down"))
    line_service = MagicMock()
    line_service.push_messages = AsyncMock()
    line_service.save_message = AsyncMock()
    _patch_conversation(monkeypatch, db, line_service)

    with pytest.raises(RuntimeError, match="db down"):
        await create_conversation(
            CreateSessionRequest(line_user_id="U1", initial_message="hello"),
            db,
            _operator(),
        )

    line_service.push_messages.assert_not_awaited()


@pytest.mark.asyncio
async def test_success_pushes_once_after_commit(monkeypatch):
    """Success ⇒ exactly 1 push with the literal text, ordered after commit."""
    calls: list[str] = []
    db = _db_stub()
    db.commit = AsyncMock(side_effect=lambda: calls.append("commit"))
    line_service = MagicMock()

    async def push(line_user_id, messages):
        calls.append("push")
        assert line_user_id == "U1"
        assert [m.text for m in messages] == ["hello"]

    line_service.push_messages = AsyncMock(side_effect=push)
    line_service.save_message = AsyncMock()
    _patch_conversation(monkeypatch, db, line_service)

    result = await create_conversation(
        CreateSessionRequest(line_user_id="U1", initial_message="hello"),
        db,
        _operator(),
    )

    assert calls == ["commit", "push"]
    line_service.push_messages.assert_awaited_once()
    line_service.save_message.assert_awaited_once()
    assert result["success"] is True
