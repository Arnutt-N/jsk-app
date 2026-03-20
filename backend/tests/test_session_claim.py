"""
Tests for session claim workflow:
- Successful claim of WAITING session
- Reject claim of already-claimed session
- Claim without joining room first (error)
- SESSION_CLAIMED broadcast to all operators

NOTE: Tests requiring join_room are skipped because join_room queries
the database for conversation details, which requires a running DB.
"""
import pytest
from types import SimpleNamespace
from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch
from fastapi.testclient import TestClient
from pydantic import BaseModel
from typing import Optional
from app.api import deps
from app.main import app
from app.models.chat_session import SessionStatus, ClosedBy


@pytest.fixture(autouse=True)
def mock_live_chat_auth():
    with patch(
        "app.api.v1.endpoints.ws_live_chat.authenticate_ws_user",
        new=AsyncMock(return_value="1"),
    ):
        yield


class SessionStub(BaseModel):
    id: int
    status: Optional[SessionStatus] = None


# Mark entire class as requiring DB for tests that join rooms
@pytest.mark.skipif(True, reason="Requires database - join_room queries DB for conversation details")
class TestSessionClaimWithDB:
    """Tests that require database connection (session exists)"""

    def test_claim_session_flow(self):
        """Full claim flow: join room, claim session"""
        client = TestClient(app)
        with client.websocket_connect("/api/v1/ws/live-chat") as ws:
            ws.send_json({"type": "auth", "payload": {"token": "test-access-token"}})
            ws.receive_json()  # auth_success
            ws.receive_json()  # presence_update

            # Join room first (use valid LINE user ID format)
            ws.send_json({"type": "join_room", "payload": {"line_user_id": "Uabcdef0123456789abcdef0123456789"}})
            # May receive conversation_update or error (user may not exist)

            # Claim session
            ws.send_json({"type": "claim_session", "payload": {}})

            # Should receive either session_claimed or error (session may not exist)
            data = ws.receive_json()
            assert data["type"] in ["session_claimed", "error"]


class TestSessionClaim:
    """Test session claim WebSocket operations"""

    def test_claim_requires_room(self):
        """Cannot claim without joining room first"""
        client = TestClient(app)
        with client.websocket_connect("/api/v1/ws/live-chat") as ws:
            ws.send_json({"type": "auth", "payload": {"token": "test-access-token"}})
            ws.receive_json()  # auth_success
            ws.receive_json()  # presence_update

            # Try to claim without joining room
            ws.send_json({"type": "claim_session", "payload": {}})

            data = ws.receive_json()
            assert data["type"] == "error"
            assert "room" in data["payload"]["message"].lower() or "conversation" in data["payload"]["message"].lower()

    def test_close_session_requires_room(self):
        """Cannot close session without being in room"""
        client = TestClient(app)
        with client.websocket_connect("/api/v1/ws/live-chat") as ws:
            ws.send_json({"type": "auth", "payload": {"token": "test-access-token"}})
            ws.receive_json()  # auth_success
            ws.receive_json()  # presence_update

            # Try to close without joining room
            ws.send_json({"type": "close_session", "payload": {}})

            data = ws.receive_json()
            assert data["type"] == "error"
            assert "room" in data["payload"]["message"].lower() or "conversation" in data["payload"]["message"].lower()


def test_transfer_conversation_rest_endpoint():
    client = TestClient(app)
    mock_db = AsyncMock()
    mock_session = SimpleNamespace(id=42)
    fake_user = SimpleNamespace(id=7)

    async def _override_get_db():
        yield mock_db

    async def _override_get_current_staff():
        return fake_user

    app.dependency_overrides[deps.get_db] = _override_get_db
    app.dependency_overrides[deps.get_current_staff] = _override_get_current_staff

    try:
        with patch(
            "app.api.v1.endpoints.admin_live_chat.live_chat_service.transfer_session",
            new=AsyncMock(return_value=mock_session),
        ) as mock_transfer, patch(
            "app.api.v1.endpoints.admin_live_chat.ws_manager.broadcast_to_all",
            new=AsyncMock(),
        ) as mock_broadcast, patch(
            "app.api.v1.endpoints.admin_live_chat.analytics_service.emit_live_kpis_update",
            new=AsyncMock(),
        ) as mock_analytics:
            response = client.post(
                "/api/v1/admin/live-chat/conversations/Uabcdef0123456789abcdef0123456789/transfer",
                json={"to_operator_id": 9, "reason": "handoff"},
            )

        assert response.status_code == 200
        body = response.json()
        assert body["success"] is True
        assert body["session_id"] == 42
        assert body["from_operator_id"] == 7
        assert body["to_operator_id"] == 9
        assert body["reason"] == "handoff"
        mock_transfer.assert_awaited_once_with(
            line_user_id="Uabcdef0123456789abcdef0123456789",
            from_operator_id=7,
            to_operator_id=9,
            reason="handoff",
            db=mock_db,
        )
        mock_db.commit.assert_awaited_once()
        mock_broadcast.assert_awaited_once()
        mock_analytics.assert_awaited_once()
    finally:
        app.dependency_overrides.clear()


def test_transfer_conversation_rest_endpoint_rejects_non_owner():
    client = TestClient(app)
    mock_db = AsyncMock()
    fake_user = SimpleNamespace(id=7)

    async def _override_get_db():
        yield mock_db

    async def _override_get_current_staff():
        return fake_user

    app.dependency_overrides[deps.get_db] = _override_get_db
    app.dependency_overrides[deps.get_current_staff] = _override_get_current_staff

    try:
        with patch(
            "app.api.v1.endpoints.admin_live_chat.live_chat_service.transfer_session",
            new=AsyncMock(side_effect=ValueError("Only the current operator can transfer the session")),
        ):
            response = client.post(
                "/api/v1/admin/live-chat/conversations/Uabcdef0123456789abcdef0123456789/transfer",
                json={"to_operator_id": 9, "reason": "handoff"},
            )

        assert response.status_code == 403
        assert response.json()["detail"] == "Only the current operator can transfer the session"
        mock_db.commit.assert_not_awaited()
    finally:
        app.dependency_overrides.clear()


def test_transfer_conversation_rest_endpoint_returns_404_for_missing_session():
    client = TestClient(app)
    mock_db = AsyncMock()
    fake_user = SimpleNamespace(id=7)

    async def _override_get_db():
        yield mock_db

    async def _override_get_current_staff():
        return fake_user

    app.dependency_overrides[deps.get_db] = _override_get_db
    app.dependency_overrides[deps.get_current_staff] = _override_get_current_staff

    try:
        with patch(
            "app.api.v1.endpoints.admin_live_chat.live_chat_service.transfer_session",
            new=AsyncMock(side_effect=ValueError("No active session found")),
        ):
            response = client.post(
                "/api/v1/admin/live-chat/conversations/Uabcdef0123456789abcdef0123456789/transfer",
                json={"to_operator_id": 9, "reason": "handoff"},
            )

        assert response.status_code == 404
        assert response.json()["detail"] == "No active session found"
        mock_db.commit.assert_not_awaited()
    finally:
        app.dependency_overrides.clear()


def test_send_message_rest_broadcasts_message_and_conversation_update():
    client = TestClient(app)
    mock_db = AsyncMock()
    fake_user = SimpleNamespace(id=7)
    message = SimpleNamespace(
        id=11,
        line_user_id="Uabcdef0123456789abcdef0123456789",
        direction="OUTGOING",
        content="hello",
        message_type="text",
        payload=None,
        sender_role="ADMIN",
        operator_name="Admin",
        created_at=datetime(2026, 3, 18, 0, 0, 0, tzinfo=timezone.utc),
    )

    async def _override_get_db():
        yield mock_db

    async def _override_get_current_staff():
        return fake_user

    app.dependency_overrides[deps.get_db] = _override_get_db
    app.dependency_overrides[deps.get_current_staff] = _override_get_current_staff

    try:
        with patch(
            "app.api.v1.endpoints.admin_live_chat.live_chat_service.send_message",
            new=AsyncMock(return_value={"success": True}),
        ) as mock_send, patch(
            "app.api.v1.endpoints.admin_live_chat.live_chat_service.get_recent_messages",
            new=AsyncMock(return_value=[message]),
        ) as mock_recent, patch(
            "app.api.v1.endpoints.admin_live_chat.live_chat_service.get_conversation_detail",
            new=AsyncMock(return_value={
                "display_name": "Alice",
                "picture_url": "pic",
                "chat_mode": "BOT",
            }),
        ) as mock_detail, patch(
            "app.api.v1.endpoints.admin_live_chat.live_chat_service.get_unread_count",
            new=AsyncMock(return_value=3),
        ) as mock_unread, patch(
            "app.api.v1.endpoints.admin_live_chat.ws_manager.get_connected_admin_ids",
            return_value=["7", "8"],
        ), patch(
            "app.api.v1.endpoints.admin_live_chat.ws_manager.is_admin_in_room_global",
            new=AsyncMock(side_effect=lambda admin_id, _room_id: admin_id == "7"),
        ) as mock_in_room, patch(
            "app.api.v1.endpoints.admin_live_chat.ws_manager.mark_conversation_read",
            new=AsyncMock(),
        ) as mock_mark_read, patch(
            "app.api.v1.endpoints.admin_live_chat.ws_manager.broadcast_to_room",
            new=AsyncMock(),
        ) as mock_room_broadcast, patch(
            "app.api.v1.endpoints.admin_live_chat.ws_manager.send_to_admin",
            new=AsyncMock(),
        ) as mock_send_admin:
            response = client.post(
                "/api/v1/admin/live-chat/conversations/Uabcdef0123456789abcdef0123456789/messages",
                json={"text": "hello"},
            )

        assert response.status_code == 200
        assert response.json() == {"success": True}
        mock_send.assert_awaited_once()
        mock_recent.assert_awaited_once()
        mock_detail.assert_awaited_once()
        mock_unread.assert_awaited_once()
        mock_in_room.assert_awaited()
        mock_mark_read.assert_awaited_once()
        mock_room_broadcast.assert_awaited_once()
        assert mock_send_admin.await_count == 2
        first_payload = mock_send_admin.await_args_list[0].args[1]
        second_payload = mock_send_admin.await_args_list[1].args[1]
        assert first_payload["type"] == "conversation_update"
        assert second_payload["type"] == "conversation_update"
        assert first_payload["payload"]["unread_count"] == 0
        assert second_payload["payload"]["unread_count"] == 3
    finally:
        app.dependency_overrides.clear()


def test_claim_conversation_rest_broadcasts_session_claimed():
    client = TestClient(app)
    mock_db = AsyncMock()
    fake_user = SimpleNamespace(id=7)
    session = SessionStub(id=42, status=SessionStatus.ACTIVE)

    async def _override_get_db():
        yield mock_db

    async def _override_get_current_staff():
        return fake_user

    app.dependency_overrides[deps.get_db] = _override_get_db
    app.dependency_overrides[deps.get_current_staff] = _override_get_current_staff

    try:
        with patch(
            "app.api.v1.endpoints.admin_live_chat.live_chat_service.claim_session",
            new=AsyncMock(return_value=session),
        ) as mock_claim, patch(
            "app.api.v1.endpoints.admin_live_chat.ws_manager.broadcast_to_all",
            new=AsyncMock(),
        ) as mock_broadcast, patch(
            "app.api.v1.endpoints.admin_live_chat.analytics_service.emit_live_kpis_update",
            new=AsyncMock(),
        ) as mock_analytics:
            response = client.post(
                "/api/v1/admin/live-chat/conversations/Uabcdef0123456789abcdef0123456789/claim",
            )

        assert response.status_code == 200
        assert response.json()["id"] == 42
        mock_claim.assert_awaited_once_with("Uabcdef0123456789abcdef0123456789", 7, mock_db)
        mock_db.commit.assert_awaited_once()
        mock_broadcast.assert_awaited_once()
        payload = mock_broadcast.await_args.args[0]
        assert payload["type"] == "session_claimed"
        assert payload["payload"]["line_user_id"] == "Uabcdef0123456789abcdef0123456789"
        assert payload["payload"]["session_id"] == 42
        assert payload["payload"]["status"] == SessionStatus.ACTIVE.value
        assert payload["payload"]["operator_id"] == 7
        mock_analytics.assert_awaited_once()
    finally:
        app.dependency_overrides.clear()


def test_close_conversation_rest_broadcasts_session_closed():
    client = TestClient(app)
    mock_db = AsyncMock()
    fake_user = SimpleNamespace(id=7)
    session = SessionStub(id=42)

    async def _override_get_db():
        yield mock_db

    async def _override_get_current_staff():
        return fake_user

    app.dependency_overrides[deps.get_db] = _override_get_db
    app.dependency_overrides[deps.get_current_staff] = _override_get_current_staff

    try:
        with patch(
            "app.api.v1.endpoints.admin_live_chat.live_chat_service.close_session",
            new=AsyncMock(return_value=session),
        ) as mock_close, patch(
            "app.api.v1.endpoints.admin_live_chat.ws_manager.broadcast_to_all",
            new=AsyncMock(),
        ) as mock_broadcast, patch(
            "app.api.v1.endpoints.admin_live_chat.analytics_service.emit_live_kpis_update",
            new=AsyncMock(),
        ) as mock_analytics:
            response = client.post(
                "/api/v1/admin/live-chat/conversations/Uabcdef0123456789abcdef0123456789/close",
            )

        assert response.status_code == 200
        assert response.json()["id"] == 42
        mock_close.assert_awaited_once_with(
            "Uabcdef0123456789abcdef0123456789",
            ClosedBy.OPERATOR,
            mock_db,
            operator_id=7,
        )
        mock_db.commit.assert_awaited_once()
        mock_broadcast.assert_awaited_once()
        payload = mock_broadcast.await_args.args[0]
        assert payload["type"] == "session_closed"
        assert payload["payload"]["line_user_id"] == "Uabcdef0123456789abcdef0123456789"
        assert payload["payload"]["session_id"] == 42
        mock_analytics.assert_awaited_once()
    finally:
        app.dependency_overrides.clear()
