"""
Tests for WebSocket security features:
- JWT authentication
- Rate limiting
- Input validation and sanitization
"""
import pytest
import time
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from jose import jwt
from pydantic import ValidationError

from app.core.config import settings
from app.core.rate_limiter import WebSocketRateLimiter
from app.schemas.ws_events import AuthPayload, SendMessagePayload, JoinRoomPayload
from app.api.v1.endpoints.ws_live_chat import authenticate_ws_user
from app.models.user import UserRole


class TestRateLimiter:
    """Test WebSocket rate limiter"""

    def test_allows_within_limit(self):
        """Messages within rate limit should be allowed"""
        limiter = WebSocketRateLimiter()
        limiter.max_messages = 5
        limiter.window = 60

        client_id = "test_client_1"

        # Should allow first 5 messages
        for i in range(5):
            assert limiter.is_allowed(client_id) is True

    def test_blocks_over_limit(self):
        """Messages over rate limit should be blocked"""
        limiter = WebSocketRateLimiter()
        limiter.max_messages = 3
        limiter.window = 60

        client_id = "test_client_2"

        # Send 3 allowed messages
        for _ in range(3):
            limiter.is_allowed(client_id)

        # 4th should be blocked
        assert limiter.is_allowed(client_id) is False

    def test_resets_after_window(self):
        """Rate limit should reset after window expires"""
        limiter = WebSocketRateLimiter()
        limiter.max_messages = 2
        limiter.window = 0.1  # 100ms window for test speed

        client_id = "test_client_3"

        # Use up limit
        assert limiter.is_allowed(client_id) is True
        assert limiter.is_allowed(client_id) is True
        assert limiter.is_allowed(client_id) is False

        # Wait for window to expire
        time.sleep(0.15)

        # Should be allowed again
        assert limiter.is_allowed(client_id) is True

    def test_get_remaining(self):
        """Should correctly report remaining messages"""
        limiter = WebSocketRateLimiter()
        limiter.max_messages = 5
        limiter.window = 60

        client_id = "test_client_4"

        assert limiter.get_remaining(client_id) == 5

        limiter.is_allowed(client_id)
        assert limiter.get_remaining(client_id) == 4

        limiter.is_allowed(client_id)
        limiter.is_allowed(client_id)
        assert limiter.get_remaining(client_id) == 2

    def test_reset_clears_bucket(self):
        """Reset should clear client's rate limit bucket"""
        limiter = WebSocketRateLimiter()
        limiter.max_messages = 2
        limiter.window = 60

        client_id = "test_client_5"

        # Use up limit
        limiter.is_allowed(client_id)
        limiter.is_allowed(client_id)
        assert limiter.is_allowed(client_id) is False

        # Reset
        limiter.reset(client_id)

        # Should be allowed again
        assert limiter.is_allowed(client_id) is True

    def test_independent_clients(self):
        """Different clients should have independent rate limits"""
        limiter = WebSocketRateLimiter()
        limiter.max_messages = 2
        limiter.window = 60

        # Client 1 uses up limit
        limiter.is_allowed("client_a")
        limiter.is_allowed("client_a")
        assert limiter.is_allowed("client_a") is False

        # Client 2 should still have full limit
        assert limiter.is_allowed("client_b") is True
        assert limiter.is_allowed("client_b") is True


class TestAuthPayloadValidation:
    """Test AuthPayload schema validation"""

    def test_valid_token(self):
        """Valid token should pass validation"""
        payload = AuthPayload(token="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test.signature")
        assert payload.token.startswith("eyJ")

    def test_token_whitespace_stripped(self):
        """Whitespace should be stripped from token"""
        payload = AuthPayload(token="  eyJhbGciOiJIUzI1NiJ9.test.sig  ")
        assert payload.token == "eyJhbGciOiJIUzI1NiJ9.test.sig"

    def test_missing_token_fails(self):
        """Missing token should fail validation"""
        with pytest.raises(ValidationError):
            AuthPayload()

    def test_short_token_fails(self):
        """Token shorter than min_length should fail"""
        with pytest.raises(ValidationError):
            AuthPayload(token="short")


class TestSendMessagePayloadValidation:
    """Test SendMessagePayload schema validation"""

    def test_valid_message(self):
        """Valid message should pass"""
        payload = SendMessagePayload(text="Hello, world!")
        assert payload.text == "Hello, world!"

    def test_html_tags_stripped(self):
        """HTML tags should be stripped from message (content preserved)"""
        payload = SendMessagePayload(text="<script>alert('xss')</script>Hello")
        assert "<script>" not in payload.text
        assert "</script>" not in payload.text
        # Note: bleach strips HTML tags but preserves text content
        # The text "alert('xss')" is preserved since it's content, not a tag
        assert "Hello" in payload.text

    def test_whitespace_normalized(self):
        """Extra whitespace should be normalized"""
        payload = SendMessagePayload(text="Hello    world\n\ntest")
        assert payload.text == "Hello world test"

    def test_empty_message_fails(self):
        """Empty message should fail validation"""
        with pytest.raises(ValidationError):
            SendMessagePayload(text="")

    def test_message_too_long_fails(self):
        """Message over max length should fail"""
        long_text = "x" * 5001
        with pytest.raises(ValidationError):
            SendMessagePayload(text=long_text)

    def test_temp_id_optional(self):
        """temp_id should be optional"""
        payload = SendMessagePayload(text="test")
        assert payload.temp_id is None

        payload = SendMessagePayload(text="test", temp_id="abc123")
        assert payload.temp_id == "abc123"


class TestJoinRoomPayloadValidation:
    """Test JoinRoomPayload schema validation"""

    def test_valid_line_user_id(self):
        """Valid LINE user ID should pass"""
        payload = JoinRoomPayload(line_user_id="U1234567890abcdef1234567890abcdef")
        assert payload.line_user_id.startswith("U")

    def test_invalid_format_fails(self):
        """Invalid LINE user ID format should fail"""
        with pytest.raises(ValidationError):
            JoinRoomPayload(line_user_id="invalid")

    def test_missing_U_prefix_fails(self):
        """Missing 'U' prefix should fail"""
        with pytest.raises(ValidationError):
            JoinRoomPayload(line_user_id="1234567890abcdef1234567890abcdef")


class TestJWTTokenGeneration:
    """Test JWT token creation for WebSocket auth"""

    def test_create_valid_token(self):
        """Should be able to create and decode valid token"""
        admin_id = "123"
        token = jwt.encode(
            {"sub": admin_id, "exp": datetime.now(timezone.utc) + timedelta(minutes=30)},
            settings.SECRET_KEY,
            algorithm=settings.ALGORITHM
        )

        decoded = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        assert decoded["sub"] == admin_id

    def test_expired_token_fails(self):
        """Expired token should raise ExpiredSignatureError"""
        from jose.exceptions import ExpiredSignatureError

        token = jwt.encode(
            {"sub": "123", "exp": datetime.now(timezone.utc) - timedelta(minutes=1)},
            settings.SECRET_KEY,
            algorithm=settings.ALGORITHM
        )

        with pytest.raises(ExpiredSignatureError):
            jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])

    def test_invalid_signature_fails(self):
        """Token with wrong secret should fail"""
        from jose import JWTError

        token = jwt.encode(
            {"sub": "123", "exp": datetime.now(timezone.utc) + timedelta(minutes=30)},
            "wrong_secret",
            algorithm=settings.ALGORITHM
        )

        with pytest.raises(JWTError):
            jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])


class TestWebSocketAuthHelper:
    """Test live chat websocket auth helper behavior."""

    @pytest.mark.asyncio
    async def test_access_token_allows_staff_user(self):
        websocket = SimpleNamespace()
        user = SimpleNamespace(id=7, role=UserRole.ADMIN, is_active=True)
        mock_db = AsyncMock()
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = user
        mock_db.execute.return_value = mock_result

        async_session = AsyncMock()
        async_session.__aenter__.return_value = mock_db
        async_session.__aexit__.return_value = None

        with patch("app.api.v1.endpoints.ws_live_chat.jwt.decode", return_value={"sub": "7", "type": "access"}), \
             patch("app.api.v1.endpoints.ws_live_chat.AsyncSessionLocal", return_value=async_session), \
             patch("app.api.v1.endpoints.ws_live_chat.ws_manager.send_personal", new=AsyncMock()) as mock_send:
            admin_id = await authenticate_ws_user(websocket, "valid-access-token")

        assert admin_id == "7"
        mock_send.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_refresh_token_is_rejected(self):
        websocket = SimpleNamespace()

        with patch("app.api.v1.endpoints.ws_live_chat.jwt.decode", return_value={"sub": "7", "type": "refresh"}), \
             patch("app.api.v1.endpoints.ws_live_chat.ws_manager.send_personal", new=AsyncMock()) as mock_send:
            admin_id = await authenticate_ws_user(websocket, "refresh-token")

        assert admin_id is None
        mock_send.assert_awaited_once()
        payload = mock_send.await_args.args[1]
        assert payload["type"] == "auth_error"

    @pytest.mark.asyncio
    async def test_non_staff_user_is_rejected(self):
        websocket = SimpleNamespace()
        user = SimpleNamespace(id=11, role=UserRole.USER, is_active=True)
        mock_db = AsyncMock()
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = user
        mock_db.execute.return_value = mock_result

        async_session = AsyncMock()
        async_session.__aenter__.return_value = mock_db
        async_session.__aexit__.return_value = None

        with patch("app.api.v1.endpoints.ws_live_chat.jwt.decode", return_value={"sub": "11", "type": "access"}), \
             patch("app.api.v1.endpoints.ws_live_chat.AsyncSessionLocal", return_value=async_session), \
             patch("app.api.v1.endpoints.ws_live_chat.ws_manager.send_personal", new=AsyncMock()) as mock_send:
            admin_id = await authenticate_ws_user(websocket, "valid-access-token")

        assert admin_id is None
        mock_send.assert_awaited_once()

