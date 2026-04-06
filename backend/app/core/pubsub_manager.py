"""Redis Pub/Sub manager for cross-server WebSocket communication."""
import json
import asyncio
import logging
from typing import Callable, Optional, Dict, List
import redis.asyncio as redis
from app.core.connection_targets import describe_redis_url
from app.core.config import settings

logger = logging.getLogger(__name__)


async def _close_redis_resource(resource) -> None:
    """Close a Redis async resource across redis-py versions/test doubles."""
    close = getattr(resource, "aclose", None) or getattr(resource, "close", None)
    if close is None:
        return
    await close()


class PubSubManager:
    """
    Redis Pub/Sub manager for cross-server communication.
    
    This enables horizontal scaling by broadcasting messages across
    multiple server instances via Redis.
    """

    def __init__(self):
        self._redis: Optional[redis.Redis] = None
        self._pubsub: Optional[redis.client.PubSub] = None
        self._callbacks: Dict[str, List[Callable]] = {}
        self._listener_task: Optional[asyncio.Task] = None
        self._url: str = getattr(settings, 'REDIS_URL', 'redis://localhost:6379/0')

    async def connect(self) -> bool:
        """
        Connect to Redis Pub/Sub.
        
        Returns:
            True if connected successfully, False otherwise
        """
        try:
            self._redis = await redis.from_url(
                self._url,
                encoding='utf-8',
                decode_responses=True
            )
            self._pubsub = self._redis.pubsub()
            await self._redis.ping()
            logger.info("Redis Pub/Sub connected successfully")
            return True
        except Exception as e:
            logger.warning("Redis Pub/Sub unavailable at %s: %s", describe_redis_url(self._url), e)
            self._redis = None
            self._pubsub = None
            return False

    async def disconnect(self):
        """Disconnect from Redis Pub/Sub."""
        listener_task = self._listener_task
        self._listener_task = None
        current_task = asyncio.current_task()
        if listener_task and listener_task is not current_task:
            listener_task.cancel()
            try:
                await listener_task
            except asyncio.CancelledError:
                pass

        pubsub = self._pubsub
        self._pubsub = None
        if pubsub:
            try:
                await _close_redis_resource(pubsub)
            except RuntimeError as e:
                if "Event loop is closed" not in str(e):
                    raise
                logger.warning("Pub/Sub close skipped after loop shutdown")

        redis_client = self._redis
        self._redis = None
        if redis_client:
            try:
                await _close_redis_resource(redis_client)
            except RuntimeError as e:
                if "Event loop is closed" not in str(e):
                    raise
                logger.warning("Pub/Sub Redis close skipped after loop shutdown")

        logger.info("Redis Pub/Sub disconnected")

    async def publish(self, channel: str, message: dict):
        """
        Publish a message to a channel.
        
        Args:
            channel: Redis channel name
            message: Message dict to publish
        """
        if not self._redis:
            logger.warning("Redis not connected, skipping publish")
            return

        try:
            await self._redis.publish(channel, json.dumps(message))
            logger.debug(f"Published to {channel}: {message.get('type', 'unknown')}")
        except Exception as e:
            logger.error(f"Failed to publish to {channel}: {e}")

    async def subscribe(self, channel: str, callback: Callable):
        """
        Subscribe to a channel with a callback.
        
        Args:
            channel: Redis channel name
            callback: Async function to call when message received
        """
        if channel not in self._callbacks:
            self._callbacks[channel] = []
        self._callbacks[channel].append(callback)

        if self._pubsub:
            await self._pubsub.subscribe(channel)
            logger.info(f"Subscribed to channel: {channel}")

            if not self._listener_task:
                self._listener_task = asyncio.create_task(self._listen())

    async def unsubscribe(self, channel: str, callback: Callable = None):
        """
        Unsubscribe from a channel.
        
        Args:
            channel: Redis channel name
            callback: Specific callback to remove (None = remove all)
        """
        if channel in self._callbacks:
            if callback:
                self._callbacks[channel] = [
                    cb for cb in self._callbacks[channel] if cb != callback
                ]
            else:
                self._callbacks[channel] = []

            if not self._callbacks[channel]:
                del self._callbacks[channel]
                if self._pubsub:
                    await self._pubsub.unsubscribe(channel)
                    logger.info(f"Unsubscribed from channel: {channel}")

    async def _listen(self):
        """Listen for messages on subscribed channels."""
        try:
            async for message in self._pubsub.listen():
                if message['type'] == 'message':
                    channel = message['channel']
                    try:
                        data = json.loads(message['data'])
                    except json.JSONDecodeError:
                        logger.error(f"Failed to decode message from {channel}")
                        continue

                    # Call all registered callbacks for this channel
                    callbacks = self._callbacks.get(channel, [])
                    for callback in callbacks:
                        try:
                            await callback(data)
                        except Exception as e:
                            logger.error(f"Callback error for {channel}: {e}")

        except asyncio.CancelledError:
            logger.debug("Pub/Sub listener cancelled")
        except Exception as e:
            logger.error(f"Pub/Sub listener error: {e}")
            # Attempt reconnect with backoff
            for attempt in range(5):
                wait_time = min(2 ** attempt, 30)
                logger.info("Pub/Sub reconnect attempt %d in %ds...", attempt + 1, wait_time)
                await asyncio.sleep(wait_time)
                try:
                    await self.disconnect()
                    if await self.connect():
                        # Re-subscribe to all channels
                        for channel in list(self._callbacks.keys()):
                            await self._pubsub.subscribe(channel)
                        logger.info("Pub/Sub reconnected successfully")
                        # Restart listener loop
                        self._listener_task = asyncio.create_task(self._listen())
                        return
                except Exception as reconnect_err:
                    logger.error("Pub/Sub reconnect attempt %d failed: %s", attempt + 1, reconnect_err)
            logger.critical("Pub/Sub listener permanently dead after 5 reconnect attempts. Cross-server WS broadcasting is offline.")

    @property
    def is_connected(self) -> bool:
        """Check if connected to Redis."""
        return self._redis is not None and self._pubsub is not None


# Global PubSub manager instance
pubsub_manager = PubSubManager()
