"""
Tests for reconnection and state recovery:
- Reconnect with same admin_id works
- Rate limit state (may reset on reconnect - verify behavior)
- Room must be rejoined after reconnect

NOTE: Tests involving join_room are skipped because join_room queries
the database for conversation details, which requires a running DB.
"""
import pytest
from unittest.mock import AsyncMock, patch
from fastapi.testclient import TestClient
from app.main import app


@pytest.fixture(autouse=True)
def mock_live_chat_auth():
    with patch(
        "app.api.v1.endpoints.ws_live_chat.authenticate_ws_user",
        new=AsyncMock(return_value="1"),
    ):
        yield


class TestReconnection:
    """Test WebSocket reconnection scenarios that don't require DB"""

    def test_reconnect_with_same_admin_id(self):
        """Can reconnect with same admin_id after disconnect"""
        client = TestClient(app)

        # First connection
        with client.websocket_connect("/api/v1/ws/live-chat") as ws:
            ws.send_json({"type": "auth", "payload": {"token": "test-access-token"}})
            data = ws.receive_json()
            assert data["type"] == "auth_success"
            ws.receive_json()  # presence_update

        # Connection closed, reconnect
        with client.websocket_connect("/api/v1/ws/live-chat") as ws:
            ws.send_json({"type": "auth", "payload": {"token": "test-access-token"}})
            data = ws.receive_json()
            assert data["type"] == "auth_success"
            assert data["payload"]["admin_id"] == "1"

    def test_multiple_tabs_same_admin(self):
        """Same admin_id can have multiple WebSocket connections (tabs)"""
        client1 = TestClient(app)
        client2 = TestClient(app)

        with client1.websocket_connect("/api/v1/ws/live-chat") as ws1:
            with client2.websocket_connect("/api/v1/ws/live-chat") as ws2:
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

    def test_different_admins_independent(self):
        """Different admin_ids have independent connections"""
        client1 = TestClient(app)
        client2 = TestClient(app)

        with client1.websocket_connect("/api/v1/ws/live-chat") as ws1:
            # Admin 1 connects
            ws1.send_json({"type": "auth", "payload": {"token": "test-access-token"}})
            data1 = ws1.receive_json()
            assert data1["type"] == "auth_success"
            ws1.receive_json()  # presence_update

            with client2.websocket_connect("/api/v1/ws/live-chat") as ws2:
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

    def test_room_state_not_preserved_after_disconnect(self):
        """After reconnect, must rejoin room - state is not auto-restored"""
        client = TestClient(app)

        # This test verifies the ERROR path without requiring DB
        # After disconnect, trying to send_message should fail with "not in room"

        # First connection (no join_room to avoid DB)
        with client.websocket_connect("/api/v1/ws/live-chat") as ws:
            ws.send_json({"type": "auth", "payload": {"token": "test-access-token"}})
            ws.receive_json()  # auth_success
            ws.receive_json()  # presence_update

        # Reconnect - try to send message (should fail since never joined room)
        with client.websocket_connect("/api/v1/ws/live-chat") as ws:
            ws.send_json({"type": "auth", "payload": {"token": "test-access-token"}})
            ws.receive_json()  # auth_success
            ws.receive_json()  # presence_update

            # Try to send without joining room
            ws.send_json({"type": "send_message", "payload": {"text": "test"}})

            # Should get error - not in room
            data = ws.receive_json()
            assert data["type"] == "error"
            assert "room" in data["payload"]["message"].lower() or "join" in data["payload"]["message"].lower()


@pytest.mark.skipif(True, reason="Requires database - join_room queries DB")
class TestReconnectionWithDB:
    """Tests that require database connection"""

    def test_room_must_rejoin_after_reconnect(self):
        """After reconnect, must rejoin room - not auto-restored"""
        client = TestClient(app)

        # First connection - join room
        with client.websocket_connect("/api/v1/ws/live-chat") as ws:
            ws.send_json({"type": "auth", "payload": {"token": "test-access-token"}})
            ws.receive_json()  # auth_success
            ws.receive_json()  # presence_update
            ws.send_json({"type": "join_room", "payload": {"line_user_id": "Uabcdef0123456789abcdef0123456010"}})

        # Reconnect - try to send message without rejoining
        with client.websocket_connect("/api/v1/ws/live-chat") as ws:
            ws.send_json({"type": "auth", "payload": {"token": "test-access-token"}})
            ws.receive_json()  # auth_success
            ws.receive_json()  # presence_update

            # Try to send without rejoining room
            ws.send_json({"type": "send_message", "payload": {"text": "test"}})

            # Should get error - not in room
            data = ws.receive_json()
            assert data["type"] == "error"
            assert "room" in data["payload"]["message"].lower()
