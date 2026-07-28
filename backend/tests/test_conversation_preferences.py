"""Tests for live-chat conversation actions: per-operator preferences
(pin / mute / spam) and soft-delete (force-close + archive)."""
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch

import pytest

from app.api import deps
from app.main import app
from app.models.chat_session import SessionStatus
from app.models.operator_conversation_preference import OperatorConversationPreference
from app.services.live_chat_service import live_chat_service

LINE_ID = "Uabcdef0123456789abcdef0123456789"
PREF_URL = f"/api/v1/admin/live-chat/conversations/{LINE_ID}/preferences"
DELETE_URL = f"/api/v1/admin/live-chat/conversations/{LINE_ID}"


def _override(mock_db, user_id=7):
    async def _get_db():
        yield mock_db

    async def _get_staff():
        return SimpleNamespace(id=user_id)

    app.dependency_overrides[deps.get_db] = _get_db
    app.dependency_overrides[deps.get_current_staff] = _get_staff


class TestUpdatePreferences:
    def test_upsert_returns_flags(self, test_client):
        mock_db = AsyncMock()
        pref = SimpleNamespace(is_pinned=True, is_muted=False, is_spam=False)
        _override(mock_db)
        try:
            with patch(
                "app.api.v1.endpoints.admin_live_chat.live_chat_service.upsert_preference",
                new=AsyncMock(return_value=pref),
            ) as mock_upsert:
                response = test_client.patch(PREF_URL, json={"is_pinned": True})

            assert response.status_code == 200
            body = response.json()
            assert body["success"] is True
            assert body["line_user_id"] == LINE_ID
            assert body["is_pinned"] is True
            assert body["is_muted"] is False
            assert body["is_spam"] is False
            mock_upsert.assert_awaited_once_with(
                mock_db, 7, LINE_ID, {"is_pinned": True}
            )
        finally:
            app.dependency_overrides.clear()

    def test_multiple_flags_passed_through(self, test_client):
        mock_db = AsyncMock()
        pref = SimpleNamespace(is_pinned=False, is_muted=True, is_spam=True)
        _override(mock_db)
        try:
            with patch(
                "app.api.v1.endpoints.admin_live_chat.live_chat_service.upsert_preference",
                new=AsyncMock(return_value=pref),
            ) as mock_upsert:
                response = test_client.patch(
                    PREF_URL, json={"is_muted": True, "is_spam": True}
                )

            assert response.status_code == 200
            assert response.json()["is_muted"] is True
            assert response.json()["is_spam"] is True
            mock_upsert.assert_awaited_once_with(
                mock_db, 7, LINE_ID, {"is_muted": True, "is_spam": True}
            )
        finally:
            app.dependency_overrides.clear()

    def test_empty_payload_rejected(self, test_client):
        mock_db = AsyncMock()
        _override(mock_db)
        try:
            with patch(
                "app.api.v1.endpoints.admin_live_chat.live_chat_service.upsert_preference",
                new=AsyncMock(),
            ) as mock_upsert:
                response = test_client.patch(PREF_URL, json={})

            assert response.status_code == 400
            assert response.json()["detail"] == "No preference fields provided"
            mock_upsert.assert_not_awaited()
        finally:
            app.dependency_overrides.clear()

    def test_unknown_user_returns_404(self, test_client):
        mock_db = AsyncMock()
        _override(mock_db)
        try:
            with patch(
                "app.api.v1.endpoints.admin_live_chat.live_chat_service.upsert_preference",
                new=AsyncMock(return_value=None),
            ):
                response = test_client.patch(PREF_URL, json={"is_pinned": True})

            assert response.status_code == 404
            assert response.json()["detail"] == "User not found"
        finally:
            app.dependency_overrides.clear()


class TestDeleteConversation:
    def test_force_closes_open_session_then_archives(self, test_client):
        mock_db = AsyncMock()
        session = SimpleNamespace(
            id=42,
            status=SessionStatus.ACTIVE.value,
            is_archived=False,
            closed_at=None,
            closed_by=None,
            archived_at=None,
            archived_by=None,
        )
        mock_db.execute.return_value = SimpleNamespace(
            scalar_one_or_none=lambda: session
        )
        _override(mock_db)
        try:
            response = test_client.delete(DELETE_URL)

            assert response.status_code == 200
            body = response.json()
            assert body["success"] is True
            assert body["session_id"] == 42
            assert body["status"] == SessionStatus.CLOSED.value
            assert body["is_archived"] is True
            assert session.status == SessionStatus.CLOSED.value
            assert session.closed_by == "OPERATOR"
            assert session.is_archived is True
            assert session.archived_by == 7
            mock_db.commit.assert_awaited_once()
        finally:
            app.dependency_overrides.clear()

    def test_archives_already_closed_session_without_reclosing(self, test_client):
        mock_db = AsyncMock()
        session = SimpleNamespace(
            id=42,
            status=SessionStatus.CLOSED.value,
            is_archived=False,
            closed_at=None,
            closed_by=None,
            archived_at=None,
            archived_by=None,
        )
        mock_db.execute.return_value = SimpleNamespace(
            scalar_one_or_none=lambda: session
        )
        _override(mock_db)
        try:
            response = test_client.delete(DELETE_URL)

            assert response.status_code == 200
            assert session.status == SessionStatus.CLOSED.value
            assert session.closed_by is None  # not re-closed
            assert session.is_archived is True
        finally:
            app.dependency_overrides.clear()

    def test_missing_session_returns_404(self, test_client):
        mock_db = AsyncMock()
        mock_db.execute.return_value = SimpleNamespace(
            scalar_one_or_none=lambda: None
        )
        _override(mock_db)
        try:
            response = test_client.delete(DELETE_URL)

            assert response.status_code == 404
            assert response.json()["detail"] == "No session found for this user"
            mock_db.commit.assert_not_awaited()
        finally:
            app.dependency_overrides.clear()


class TestUpsertPreferenceService:
    @pytest.mark.asyncio
    @patch("app.services.live_chat_service.preferences.resolve_by_line_id")
    async def test_creates_new_preference_row(self, mock_resolve):
        mock_resolve.return_value = SimpleNamespace(id=99)
        mock_db = AsyncMock()
        mock_db.add = Mock()
        mock_db.execute.return_value = SimpleNamespace(
            scalar_one_or_none=lambda: None
        )

        pref = await live_chat_service.upsert_preference(
            mock_db, 7, LINE_ID, {"is_pinned": True, "is_muted": True}
        )

        assert isinstance(pref, OperatorConversationPreference)
        assert pref.operator_id == 7
        assert pref.user_id == 99
        assert pref.is_pinned is True
        assert pref.is_muted is True
        assert pref.is_spam is False
        assert pref.pinned_at is not None
        mock_db.add.assert_called_once_with(pref)
        mock_db.commit.assert_awaited_once()

    @pytest.mark.asyncio
    @patch("app.services.live_chat_service.preferences.resolve_by_line_id")
    async def test_updates_existing_and_clears_pinned_at(self, mock_resolve):
        mock_resolve.return_value = SimpleNamespace(id=99)
        existing = OperatorConversationPreference(
            operator_id=7, user_id=99, is_pinned=True, is_muted=False, is_spam=False
        )
        from datetime import datetime, timezone

        existing.pinned_at = datetime.now(timezone.utc)
        mock_db = AsyncMock()
        mock_db.add = Mock()
        mock_db.execute.return_value = SimpleNamespace(
            scalar_one_or_none=lambda: existing
        )

        pref = await live_chat_service.upsert_preference(
            mock_db, 7, LINE_ID, {"is_pinned": False}
        )

        assert pref is existing
        assert pref.is_pinned is False
        assert pref.pinned_at is None
        mock_db.add.assert_not_called()

    @pytest.mark.asyncio
    @patch("app.services.live_chat_service.preferences.resolve_by_line_id")
    async def test_returns_none_for_unknown_user(self, mock_resolve):
        mock_resolve.return_value = None
        mock_db = AsyncMock()
        mock_db.add = Mock()

        pref = await live_chat_service.upsert_preference(
            mock_db, 7, LINE_ID, {"is_pinned": True}
        )

        assert pref is None
        mock_db.add.assert_not_called()
        mock_db.commit.assert_not_awaited()
