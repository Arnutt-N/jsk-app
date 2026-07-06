"""Operator auto-takeover on HUMAN mode toggle (live-chat send-bug fix).

Root cause: ``POST /conversations/{id}/mode`` with ``mode=HUMAN`` only set
``user.chat_mode`` and never created/claimed an ACTIVE session, so operator
sends were rejected by ``_require_active_session_owner`` ("ส่งข้อความไม่สำเร็จ")
and the "รับสาย" button never appeared (it only shows for WAITING sessions).
``toggle_mode`` now takes the conversation over on HUMAN and releases it on BOT.
"""
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch

import pytest
from fastapi import HTTPException

from app.api import deps
from app.main import app
from app.models.chat_session import ClosedBy, SessionStatus
from app.services.live_chat_service import LiveChatService


LINE_USER = "Uabcdef0123456789abcdef0123456789"
MODE_URL = f"/api/v1/admin/live-chat/conversations/{LINE_USER}/mode"


@pytest.fixture
def svc():
    return LiveChatService()


def _override_deps(mock_db, operator_id=7):
    async def _get_db():
        yield mock_db

    async def _get_staff():
        return SimpleNamespace(id=operator_id)

    app.dependency_overrides[deps.get_db] = _get_db
    app.dependency_overrides[deps.get_current_staff] = _get_staff


# ---------------------------------------------------------------------------
# Endpoint wiring — the regression guards (the bug lived here: no session op)
# ---------------------------------------------------------------------------

def test_toggle_human_takes_over_session(test_client):
    mock_db = AsyncMock()
    _override_deps(mock_db)
    try:
        with patch(
            "app.api.v1.endpoints.admin_live_chat.live_chat_service.set_chat_mode",
            new=AsyncMock(return_value=True),
        ), patch(
            "app.api.v1.endpoints.admin_live_chat.live_chat_service.ensure_operator_session",
            new=AsyncMock(return_value=SimpleNamespace(id=1)),
        ) as mock_ensure, patch(
            "app.api.v1.endpoints.admin_live_chat.live_chat_service.release_operator_session",
            new=AsyncMock(),
        ) as mock_release:
            res = test_client.post(MODE_URL, json={"mode": "HUMAN"})
        assert res.status_code == 200
        assert res.json()["mode"] == "HUMAN"
        mock_ensure.assert_awaited_once_with(LINE_USER, 7, mock_db)
        mock_release.assert_not_awaited()
        mock_db.commit.assert_awaited_once()
    finally:
        app.dependency_overrides.clear()


def test_toggle_bot_releases_session(test_client):
    mock_db = AsyncMock()
    _override_deps(mock_db)
    try:
        with patch(
            "app.api.v1.endpoints.admin_live_chat.live_chat_service.set_chat_mode",
            new=AsyncMock(return_value=True),
        ), patch(
            "app.api.v1.endpoints.admin_live_chat.live_chat_service.ensure_operator_session",
            new=AsyncMock(),
        ) as mock_ensure, patch(
            "app.api.v1.endpoints.admin_live_chat.live_chat_service.release_operator_session",
            new=AsyncMock(return_value=SimpleNamespace(id=1)),
        ) as mock_release:
            res = test_client.post(MODE_URL, json={"mode": "BOT"})
        assert res.status_code == 200
        assert res.json()["mode"] == "BOT"
        mock_release.assert_awaited_once_with(LINE_USER, 7, mock_db)
        mock_ensure.assert_not_awaited()
    finally:
        app.dependency_overrides.clear()


def test_toggle_human_propagates_conflict(test_client):
    mock_db = AsyncMock()
    _override_deps(mock_db)
    try:
        with patch(
            "app.api.v1.endpoints.admin_live_chat.live_chat_service.set_chat_mode",
            new=AsyncMock(return_value=True),
        ), patch(
            "app.api.v1.endpoints.admin_live_chat.live_chat_service.ensure_operator_session",
            new=AsyncMock(
                side_effect=HTTPException(
                    status_code=409,
                    detail="เจ้าหน้าที่อีกคนกำลังรับเรื่องนี้อยู่",
                )
            ),
        ):
            res = test_client.post(MODE_URL, json={"mode": "HUMAN"})
        assert res.status_code == 409
        assert "รับเรื่อง" in res.json()["detail"]
    finally:
        app.dependency_overrides.clear()


def test_toggle_unknown_user_returns_404(test_client):
    mock_db = AsyncMock()
    _override_deps(mock_db)
    try:
        with patch(
            "app.api.v1.endpoints.admin_live_chat.live_chat_service.set_chat_mode",
            new=AsyncMock(return_value=False),
        ), patch(
            "app.api.v1.endpoints.admin_live_chat.live_chat_service.ensure_operator_session",
            new=AsyncMock(),
        ) as mock_ensure:
            res = test_client.post(MODE_URL, json={"mode": "HUMAN"})
        assert res.status_code == 404
        mock_ensure.assert_not_awaited()
    finally:
        app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# Service logic — ensure_operator_session / release_operator_session
# ---------------------------------------------------------------------------

class _NestedCM:
    """Stub for ``db.begin_nested()`` used as an async context manager."""

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False


@pytest.mark.asyncio
async def test_ensure_returns_existing_when_self_owns_active(svc):
    mock_db = AsyncMock()
    mock_db.add = Mock()
    active = SimpleNamespace(id=5, status=SessionStatus.ACTIVE, operator_id=7)
    with patch.object(svc, "get_active_session", new=AsyncMock(return_value=active)):
        result = await svc.ensure_operator_session(LINE_USER, 7, mock_db)
    assert result is active
    mock_db.add.assert_not_called()


@pytest.mark.asyncio
async def test_ensure_conflicts_when_other_owns_active(svc):
    mock_db = AsyncMock()
    mock_db.get = AsyncMock(return_value=SimpleNamespace(display_name="Bob"))
    active = SimpleNamespace(id=5, status=SessionStatus.ACTIVE, operator_id=9)
    with patch.object(svc, "get_active_session", new=AsyncMock(return_value=active)):
        with pytest.raises(HTTPException) as exc:
            await svc.ensure_operator_session(LINE_USER, 7, mock_db)
    assert exc.value.status_code == 409
    assert "Bob" in exc.value.detail


@pytest.mark.asyncio
async def test_ensure_claims_waiting_session(svc):
    mock_db = AsyncMock()
    waiting = SimpleNamespace(id=5, status=SessionStatus.WAITING, operator_id=None)
    claimed = SimpleNamespace(id=5, status=SessionStatus.ACTIVE, operator_id=7)
    with patch.object(svc, "get_active_session", new=AsyncMock(return_value=waiting)), \
         patch.object(svc, "claim_session", new=AsyncMock(return_value=claimed)) as mock_claim:
        result = await svc.ensure_operator_session(LINE_USER, 7, mock_db)
    assert result is claimed
    mock_claim.assert_awaited_once_with(LINE_USER, 7, mock_db)


@pytest.mark.asyncio
async def test_ensure_creates_active_when_none(svc):
    mock_db = AsyncMock()
    mock_db.add = Mock()
    mock_db.begin_nested = Mock(return_value=_NestedCM())
    mock_db.flush = AsyncMock()
    with patch.object(svc, "get_active_session", new=AsyncMock(return_value=None)):
        result = await svc.ensure_operator_session(LINE_USER, 7, mock_db)
    assert result.status == SessionStatus.ACTIVE
    assert result.operator_id == 7
    assert result.line_user_id == LINE_USER
    mock_db.add.assert_called_once()


@pytest.mark.asyncio
async def test_release_closes_owned_active_session(svc):
    mock_db = AsyncMock()
    active = SimpleNamespace(id=5, status=SessionStatus.ACTIVE, operator_id=7)
    with patch.object(svc, "get_active_session", new=AsyncMock(return_value=active)), \
         patch.object(svc, "close_session", new=AsyncMock(return_value=active)) as mock_close:
        await svc.release_operator_session(LINE_USER, 7, mock_db)
    mock_close.assert_awaited_once_with(LINE_USER, ClosedBy.OPERATOR, mock_db, operator_id=7)


@pytest.mark.asyncio
async def test_release_noop_when_other_owns(svc):
    mock_db = AsyncMock()
    active = SimpleNamespace(id=5, status=SessionStatus.ACTIVE, operator_id=9)
    with patch.object(svc, "get_active_session", new=AsyncMock(return_value=active)), \
         patch.object(svc, "close_session", new=AsyncMock()) as mock_close:
        result = await svc.release_operator_session(LINE_USER, 7, mock_db)
    assert result is None
    mock_close.assert_not_awaited()
