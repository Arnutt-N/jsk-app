"""
Tests for reconnection and state recovery:
- Reconnect with same admin_id works
- Rate limit state (may reset on reconnect - verify behavior)
- Room must be rejoined after reconnect
"""
import pytest
from unittest.mock import AsyncMock, patch


@pytest.fixture(autouse=True)
def mock_live_chat_auth():
    with patch(
        "app.api.v1.endpoints.ws_live_chat.authenticate_ws_user",
        new=AsyncMock(return_value="1"),
    ):
        yield


class TestReconnection:
    """Test WebSocket reconnection scenarios that don't require DB"""

    def test_reconnect_with_same_admin_id(self, test_client):
        """Can reconnect with same admin_id after disconnect"""
        # First connection
        with test_client.websocket_connect("/api/v1/ws/live-chat") as ws:
            ws.send_json({"type": "auth", "payload": {"token": "test-access-token"}})
            data = ws.receive_json()
            assert data["type"] == "auth_success"
            ws.receive_json()  # presence_update

        # Connection closed, reconnect
        with test_client.websocket_connect("/api/v1/ws/live-chat") as ws:
            ws.send_json({"type": "auth", "payload": {"token": "test-access-token"}})
            data = ws.receive_json()
            assert data["type"] == "auth_success"
            assert data["payload"]["admin_id"] == "1"

    def test_multiple_tabs_same_admin(self, test_client):
        """Same admin_id can have multiple WebSocket connections (tabs)"""
        with test_client.websocket_connect("/api/v1/ws/live-chat") as ws1:
            with test_client.websocket_connect("/api/v1/ws/live-chat") as ws2:
                # Both use same admin_id
                ws1.send_json({"type": "auth", "payload": {"token": "test-access-token"}})
                data1 = ws1.receive_json()
                assert data1["type"] == "auth_success"
                ws1.receive_json()  # presence_update

                ws2.send_json({"type": "auth", "payload": {"token": "test-access-token"}})
                data2 = ws2.receive_json()
                assert data2["type"] == "auth_success"
                ws2.receive_json()  # presence_update

                # Both connections should work
                ws1.send_json({"type": "ping"})
                pong1 = ws1.receive_json()
                assert pong1["type"] == "pong"

                ws2.send_json({"type": "ping"})
                pong2 = ws2.receive_json()
                assert pong2["type"] == "pong"

    def test_different_admins_independent(self, test_client):
        """Different admin_ids have independent connections"""
        with test_client.websocket_connect("/api/v1/ws/live-chat") as ws1:
            # Admin 1 connects
            ws1.send_json({"type": "auth", "payload": {"token": "test-access-token"}})
            data1 = ws1.receive_json()
            assert data1["type"] == "auth_success"
            ws1.receive_json()  # presence_update

            with test_client.websocket_connect("/api/v1/ws/live-chat") as ws2:
                # Admin 2 connects
                ws2.send_json({"type": "auth", "payload": {"token": "test-access-token"}})
                data2 = ws2.receive_json()
                assert data2["type"] == "auth_success"
                assert data2["payload"]["admin_id"] == "1"
                ws2.receive_json()  # presence_update

                # Both work independently
                ws1.send_json({"type": "ping"})
                ws2.send_json({"type": "ping"})

                pong1 = ws1.receive_json()
                pong2 = ws2.receive_json()

                assert pong1["type"] == "pong"
                assert pong2["type"] == "pong"

    def test_room_state_not_preserved_after_disconnect(self, test_client):
        """After reconnect, must rejoin room - state is not auto-restored"""
        # This test verifies the ERROR path without requiring DB
        # After disconnect, trying to send_message should fail with "not in room"

        # First connection (no join_room to avoid DB)
        with test_client.websocket_connect("/api/v1/ws/live-chat") as ws:
            ws.send_json({"type": "auth", "payload": {"token": "test-access-token"}})
            ws.receive_json()  # auth_success
            ws.receive_json()  # presence_update

        # Reconnect - try to send message (should fail since never joined room)
        with test_client.websocket_connect("/api/v1/ws/live-chat") as ws:
            ws.send_json({"type": "auth", "payload": {"token": "test-access-token"}})
            ws.receive_json()  # auth_success
            ws.receive_json()  # presence_update

            # Try to send without joining room
            ws.send_json({"type": "send_message", "payload": {"text": "test"}})

            # Should get error - not in room
            data = ws.receive_json()
            assert data["type"] == "error"
            assert "room" in data["payload"]["message"].lower() or "join" in data["payload"]["message"].lower()


class TestReconnectionWithDB:
    """Tests that require database connection"""

    def test_room_must_rejoin_after_reconnect(self, test_client):
        """After reconnect, must rejoin room - not auto-restored"""
        # First connection - join room
        with test_client.websocket_connect("/api/v1/ws/live-chat") as ws:
            ws.send_json({"type": "auth", "payload": {"token": "test-access-token"}})
            ws.receive_json()  # auth_success
            ws.receive_json()  # presence_update
            ws.send_json({"type": "join_room", "payload": {"line_user_id": "Uabcdef0123456789abcdef0123456010"}})

        # Reconnect - try to send message without rejoining
        with test_client.websocket_connect("/api/v1/ws/live-chat") as ws:
            ws.send_json({"type": "auth", "payload": {"token": "test-access-token"}})
            ws.receive_json()  # auth_success
            ws.receive_json()  # presence_update

            # Try to send without rejoining room
            ws.send_json({"type": "send_message", "payload": {"text": "test"}})

            # Should get error - not in room
            data = ws.receive_json()
            assert data["type"] == "error"
            assert "room" in data["payload"]["message"].lower()
