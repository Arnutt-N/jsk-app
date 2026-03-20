import pytest
from unittest.mock import AsyncMock, patch
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture(autouse=True)
def mock_live_chat_auth():
    """Patch websocket auth for endpoint smoke tests in this file."""
    with patch(
        "app.api.v1.endpoints.ws_live_chat.authenticate_ws_user",
        new=AsyncMock(return_value="1"),
    ):
        yield


def test_websocket_connect_and_auth():
    """Test WebSocket connection and authentication flow"""
    client = TestClient(app)
    with client.websocket_connect("/api/v1/ws/live-chat") as websocket:
        websocket.send_json({
            "type": "auth",
            "payload": {"token": "test-access-token"},
        })

        data = websocket.receive_json()
        assert data["type"] == "auth_success"
        assert data["payload"]["admin_id"] == "1"

        data = websocket.receive_json()
        assert data["type"] == "presence_update"


def test_websocket_ping_pong():
    """Test ping/pong heartbeat"""
    client = TestClient(app)
    with client.websocket_connect("/api/v1/ws/live-chat") as websocket:
        websocket.send_json({"type": "auth", "payload": {"token": "test-access-token"}})
        websocket.receive_json()  # auth_success
        websocket.receive_json()  # presence_update

        websocket.send_json({"type": "ping"})
        data = websocket.receive_json()
        assert data["type"] == "pong"


def test_websocket_requires_auth():
    """Test that operations require authentication"""
    client = TestClient(app)
    with client.websocket_connect("/api/v1/ws/live-chat") as websocket:
        websocket.send_json({
            "type": "join_room",
            "payload": {"line_user_id": "U123"}
        })

        data = websocket.receive_json()
        assert data["type"] == "error"
        assert "authenticated" in data["payload"]["message"].lower()


def test_websocket_unknown_message_type():
    """Test handling of unknown message types"""
    client = TestClient(app)
    with client.websocket_connect("/api/v1/ws/live-chat") as websocket:
        websocket.send_json({"type": "auth", "payload": {"token": "test-access-token"}})
        websocket.receive_json()  # auth_success
        websocket.receive_json()  # presence_update

        websocket.send_json({"type": "unknown_type", "payload": {}})

        data = websocket.receive_json()
        assert data["type"] == "error"
        assert "unknown" in data["payload"]["message"].lower()


def test_websocket_join_room_requires_line_user_id():
    """Test that join_room requires line_user_id"""
    client = TestClient(app)
    with client.websocket_connect("/api/v1/ws/live-chat") as websocket:
        websocket.send_json({"type": "auth", "payload": {"token": "test-access-token"}})
        websocket.receive_json()  # auth_success
        websocket.receive_json()  # presence_update

        websocket.send_json({"type": "join_room", "payload": {}})

        data = websocket.receive_json()
        assert data["type"] == "error"
        assert "line_user_id" in data["payload"]["message"].lower()


def test_websocket_send_message_requires_room():
    """Test that send_message requires being in a room"""
    client = TestClient(app)
    with client.websocket_connect("/api/v1/ws/live-chat") as websocket:
        websocket.send_json({"type": "auth", "payload": {"token": "test-access-token"}})
        websocket.receive_json()  # auth_success
        websocket.receive_json()  # presence_update

        websocket.send_json({
            "type": "send_message",
            "payload": {"text": "Hello"}
        })

        data = websocket.receive_json()
        assert data["type"] == "error"
        assert "room" in data["payload"]["message"].lower()


@pytest.mark.skip(reason="Requires database connection - join_room queries DB")
def test_websocket_send_message_requires_text():
    """Test that send_message requires non-empty text"""
    client = TestClient(app)
    with client.websocket_connect("/api/v1/ws/live-chat") as websocket:
        websocket.send_json({"type": "auth", "payload": {"token": "test-access-token"}})
        websocket.receive_json()  # auth_success
        websocket.receive_json()  # presence_update

        websocket.send_json({
            "type": "join_room",
            "payload": {"line_user_id": "Uabcdef0123456789abcdef0123456782"}
        })

        websocket.send_json({
            "type": "send_message",
            "payload": {"text": "   "}
        })

        data = websocket.receive_json()
        assert data["type"] == "error"


@pytest.mark.skip(reason="Requires database connection - join_room queries DB")
def test_websocket_leave_room():
    """Test leaving a room prevents sending messages"""
    client = TestClient(app)
    with client.websocket_connect("/api/v1/ws/live-chat") as websocket:
        websocket.send_json({"type": "auth", "payload": {"token": "test-access-token"}})
        websocket.receive_json()  # auth_success
        websocket.receive_json()  # presence_update

        websocket.send_json({"type": "join_room", "payload": {"line_user_id": "Uabcdef0123456789abcdef0123456789"}})
        websocket.send_json({"type": "leave_room", "payload": {}})
        websocket.send_json({"type": "send_message", "payload": {"text": "test"}})

        data = websocket.receive_json()
        assert data["type"] == "error"
        assert "room" in data["payload"]["message"].lower() or "join" in data["payload"]["message"].lower()


@pytest.mark.skip(reason="Requires database connection - join_room queries DB")
def test_websocket_typing_indicators():
    """Test typing start/stop events don't crash the connection"""
    client = TestClient(app)
    with client.websocket_connect("/api/v1/ws/live-chat") as websocket:
        websocket.send_json({"type": "auth", "payload": {"token": "test-access-token"}})
        websocket.receive_json()  # auth_success
        websocket.receive_json()  # presence_update

        websocket.send_json({"type": "join_room", "payload": {"line_user_id": "Uabcdef0123456789abcdef0123456780"}})
        websocket.send_json({"type": "typing_start", "payload": {}})
        websocket.send_json({"type": "typing_stop", "payload": {}})

        websocket.send_json({"type": "ping"})
        data = websocket.receive_json()
        assert data["type"] == "pong"


@pytest.mark.skip(reason="Requires database connection - join_room queries DB")
def test_websocket_join_room_valid_format():
    """Test joining room with valid LINE user ID format doesn't cause validation error"""
    client = TestClient(app)
    with client.websocket_connect("/api/v1/ws/live-chat") as websocket:
        websocket.send_json({"type": "auth", "payload": {"token": "test-access-token"}})
        websocket.receive_json()  # auth_success
        websocket.receive_json()  # presence_update

        websocket.send_json({
            "type": "join_room",
            "payload": {"line_user_id": "Uabcdef0123456789abcdef0123456781"}
        })

        websocket.send_json({"type": "ping"})
        data = websocket.receive_json()
        assert data["type"] == "pong"
