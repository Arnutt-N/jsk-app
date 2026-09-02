"""Tests for webhook event deduplication."""
import pytest
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import datetime, timezone
from app.api.v1.endpoints.webhook import process_webhook_events, WEBHOOK_EVENT_KEY_PREFIX
from app.core.redis_client import RedisClient


class TestWebhookDeduplication:
    """Test webhook event deduplication logic."""

    @pytest.fixture
    def mock_redis(self):
        """Mock Redis client."""
        with patch('app.api.v1.endpoints.webhook.redis_client') as mock:
            mock.exists = AsyncMock(return_value=False)
            mock.set = AsyncMock(return_value=True)
            mock.setex = AsyncMock()
            mock.delete = AsyncMock()
            yield mock

    @pytest.fixture
    def mock_event_with_id(self):
        """Create a mock event with webhook_event_id."""
        event = MagicMock()
        event.webhook_event_id = "test-event-id-12345"
        return event

    @pytest.fixture
    def mock_event_without_id(self):
        """Create a mock event without webhook_event_id."""
        event = MagicMock()
        event.webhook_event_id = None
        return event

    @pytest.mark.asyncio
    async def test_duplicate_event_skipped(self, mock_redis, mock_event_with_id):
        """Test that duplicate events are skipped."""
        # Arrange: Redis returns True (key exists)
        mock_redis.exists.return_value = True
        
        events = [mock_event_with_id]
        
        # Act
        await process_webhook_events(events)
        
        # Assert: Event should be skipped (no setex call for this event)
        mock_redis.exists.assert_called_once_with(f"{WEBHOOK_EVENT_KEY_PREFIX}test-event-id-12345")

    @pytest.mark.asyncio
    async def test_new_event_processed(self, mock_redis, mock_event_with_id):
        """Test that new events are processed and cached."""
        # Arrange: Redis returns False (key doesn't exist)
        mock_redis.exists.return_value = False
        
        events = [mock_event_with_id]
        
        # Act
        with patch('app.api.v1.endpoints.webhook.handle_follow_event') as mock_handler:
            await process_webhook_events(events)
            
            # Assert
            mock_redis.set.assert_called_once()
            mock_redis.setex.assert_called_once()
            cache_key = mock_redis.setex.call_args[0][0]
            assert "test-event-id-12345" in cache_key

    @pytest.mark.asyncio
    async def test_successful_event_commits_before_cache_mark(self, mock_redis, monkeypatch):
        """A successful event should be committed by the outer webhook processor."""
        from app.api.v1.endpoints import webhook as webhook_module

        class FakeMessageEvent:
            pass

        class FakeSessionContext:
            def __init__(self, db):
                self.db = db

            async def __aenter__(self):
                return self.db

            async def __aexit__(self, exc_type, exc, tb):
                return False

        db = AsyncMock()
        event = FakeMessageEvent()
        event.webhook_event_id = "evt-success"

        monkeypatch.setattr(webhook_module, "MessageEvent", FakeMessageEvent)
        monkeypatch.setattr(webhook_module, "AsyncSessionLocal", lambda: FakeSessionContext(db))
        monkeypatch.setattr(webhook_module, "handle_message_event", AsyncMock())

        await process_webhook_events([event])

        db.commit.assert_awaited_once()
        mock_redis.setex.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_event_without_id_processed(self, mock_redis, mock_event_without_id):
        """Test that events without ID are still processed."""
        events = [mock_event_without_id]
        
        # Act
        await process_webhook_events(events)
        
        # Assert: Redis should not be called for events without ID
        mock_redis.exists.assert_not_called()
        mock_redis.set.assert_not_called()
        mock_redis.setex.assert_not_called()

    @pytest.mark.asyncio
    async def test_multiple_events_mixed(self, mock_redis):
        """Test processing mix of duplicate and new events."""
        # Arrange
        event1 = MagicMock()  # Duplicate
        event1.webhook_event_id = "duplicate-id"
        
        event2 = MagicMock()  # New
        event2.webhook_event_id = "new-id"
        
        event3 = MagicMock()  # No ID
        event3.webhook_event_id = None
        
        async def mock_exists(key):
            return "duplicate" in key
        
        mock_redis.exists.side_effect = mock_exists
        events = [event1, event2, event3]
        
        # Act
        await process_webhook_events(events)
        
        # Assert: Only event2 should be cached
        assert mock_redis.setex.call_count == 1
        cache_key = mock_redis.setex.call_args[0][0]
        assert "new-id" in cache_key

    @pytest.mark.asyncio
    async def test_handler_failure_rolls_back_and_continues(self, mock_redis, monkeypatch):
        """A failed event should rollback the session before the next event runs."""
        from app.api.v1.endpoints import webhook as webhook_module

        class FakeMessageEvent:
            pass

        class FakeSessionContext:
            def __init__(self, db):
                self.db = db

            async def __aenter__(self):
                return self.db

            async def __aexit__(self, exc_type, exc, tb):
                return False

        db = AsyncMock()
        event_one = FakeMessageEvent()
        event_one.webhook_event_id = "evt-1"
        event_two = FakeMessageEvent()
        event_two.webhook_event_id = "evt-2"

        handler = AsyncMock(side_effect=[RuntimeError("boom"), None])

        monkeypatch.setattr(webhook_module, "MessageEvent", FakeMessageEvent)
        monkeypatch.setattr(webhook_module, "AsyncSessionLocal", lambda: FakeSessionContext(db))
        monkeypatch.setattr(webhook_module, "handle_message_event", handler)

        await process_webhook_events([event_one, event_two])

        assert handler.await_count == 2
        db.commit.assert_awaited_once()
        db.rollback.assert_awaited_once()
        assert mock_redis.setex.call_count == 1
        processed_key = mock_redis.setex.call_args[0][0]
        assert processed_key.endswith("evt-2")

    @pytest.mark.asyncio
    async def test_handler_failure_does_not_mark_event_processed(self, mock_redis, monkeypatch):
        """A failed event should release its lock without caching success."""
        from app.api.v1.endpoints import webhook as webhook_module

        class FakeMessageEvent:
            pass

        class FakeSessionContext:
            def __init__(self, db):
                self.db = db

            async def __aenter__(self):
                return self.db

            async def __aexit__(self, exc_type, exc, tb):
                return False

        db = AsyncMock()
        event = FakeMessageEvent()
        event.webhook_event_id = "evt-fail"

        monkeypatch.setattr(webhook_module, "MessageEvent", FakeMessageEvent)
        monkeypatch.setattr(webhook_module, "AsyncSessionLocal", lambda: FakeSessionContext(db))
        monkeypatch.setattr(
            webhook_module,
            "handle_message_event",
            AsyncMock(side_effect=RuntimeError("boom")),
        )

        await process_webhook_events([event])

        mock_redis.set.assert_awaited_once()
        mock_redis.setex.assert_not_awaited()
        mock_redis.delete.assert_awaited()

    @pytest.mark.asyncio
    async def test_redelivered_message_skips_bot_flow_when_message_already_exists(self, monkeypatch):
        """A redelivered LINE message should exit before re-running bot logic."""
        from app.api.v1.endpoints import webhook as webhook_module
        from app.services import message_intake as mi_pkg

        existing_message = SimpleNamespace(id=99, created_at=datetime.now(timezone.utc))
        event = SimpleNamespace(
            reply_token="reply-token",
            source=SimpleNamespace(user_id="U123"),
            message=SimpleNamespace(id="line-msg-123"),
        )
        db = AsyncMock()

        get_existing = AsyncMock(return_value=existing_message)
        get_or_create_user = AsyncMock()
        refresh_profile = AsyncMock()
        save_message = AsyncMock()
        reply_messages = AsyncMock()

        monkeypatch.setattr(mi_pkg.line_service, "get_incoming_message_by_line_message_id", get_existing)
        monkeypatch.setattr(mi_pkg.friend_service, "get_or_create_user", get_or_create_user)
        monkeypatch.setattr(mi_pkg.friend_service, "refresh_profile", refresh_profile)
        monkeypatch.setattr(mi_pkg.line_service, "save_message", save_message)
        monkeypatch.setattr(mi_pkg.line_service, "reply_messages", reply_messages)

        await webhook_module.handle_message_event(event, db)

        get_existing.assert_awaited_once_with(
            db=db,
            line_user_id="U123",
            line_message_id="line-msg-123",
        )
        get_or_create_user.assert_not_awaited()
        refresh_profile.assert_not_awaited()
        save_message.assert_not_awaited()
        reply_messages.assert_not_awaited()


class TestRedisClient:
    """Test Redis client functionality."""

    @pytest.fixture
    def redis_client(self):
        """Create Redis client instance."""
        return RedisClient()

    @pytest.mark.asyncio
    async def test_exists_with_no_connection(self, redis_client):
        """Test exists() returns False when not connected."""
        result = await redis_client.exists("any-key")
        assert result is False

    @pytest.mark.asyncio
    async def test_setex_with_no_connection(self, redis_client):
        """Test setex() silently fails when not connected."""
        # Should not raise exception
        await redis_client.setex("key", 300, "value")

    @pytest.mark.asyncio
    async def test_set_with_no_connection(self, redis_client):
        """Test set() returns None when not connected (tri-state contract:
        None = redis unavailable, False = NX lost — the webhook dedup lock
        fails open on None so a Redis outage cannot drop events)."""
        result = await redis_client.set("key", "value", seconds=300, nx=True)
        assert result is None

    @pytest.mark.asyncio
    async def test_is_connected_property(self, redis_client):
        """Test is_connected property."""
        assert redis_client.is_connected is False
