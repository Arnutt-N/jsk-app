"""Redis client for caching and deduplication."""
import logging
from typing import Optional
import redis.asyncio as redis
from app.core.connection_targets import describe_redis_url
from app.core.config import settings

logger = logging.getLogger(__name__)

class RedisClient:
    """Async Redis client wrapper."""
    
    def __init__(self):
        self._redis: Optional[redis.Redis] = None
        self._url: str = getattr(settings, 'REDIS_URL', 'redis://localhost:6379/0')
    
    async def connect(self):
        """Connect to Redis."""
        try:
            self._redis = await redis.from_url(
                self._url,
                encoding='utf-8',
                decode_responses=True
            )
            await self._redis.ping()
            logger.info("Redis connected successfully")
        except Exception as e:
            logger.warning("Redis unavailable at %s: %s", describe_redis_url(self._url), e)
            self._redis = None
    
    async def disconnect(self):
        """Disconnect from Redis."""
        if self._redis:
            await self._redis.close()
            logger.info("Redis disconnected")
    
    async def exists(self, key: str) -> bool:
        """Check if key exists."""
        if not self._redis:
            return False
        try:
            result = await self._redis.exists(key)
            return bool(result)
        except Exception as e:
            logger.error(f"Redis exists error: {e}")
            return False
    
    async def setex(self, key: str, seconds: int, value: str):
        """Set key with expiration."""
        if not self._redis:
            return
        try:
            await self._redis.setex(key, seconds, value)
        except Exception as e:
            logger.error(f"Redis setex error: {e}")

    async def set(self, key: str, value: str, seconds: Optional[int] = None, nx: bool = False) -> bool:
        """Set key with optional expiration and NX semantics."""
        if not self._redis:
            return False
        try:
            result = await self._redis.set(key, value, ex=seconds, nx=nx)
            return bool(result)
        except Exception as e:
            logger.error(f"Redis set error: {e}")
            return False
    
    async def get(self, key: str) -> Optional[str]:
        """Get value by key."""
        if not self._redis:
            return None
        try:
            return await self._redis.get(key)
        except Exception as e:
            logger.error(f"Redis get error: {e}")
            return None

    async def mget(self, keys: list[str]) -> list[Optional[str]]:
        """Get multiple values by key."""
        if not keys:
            return []
        if not self._redis:
            return [None] * len(keys)
        try:
            result = await self._redis.mget(keys)
            return list(result)
        except Exception as e:
            logger.error(f"Redis mget error: {e}")
            return [None] * len(keys)
    
    async def delete(self, key: str):
        """Delete key."""
        if not self._redis:
            return
        try:
            await self._redis.delete(key)
        except Exception as e:
            logger.error(f"Redis delete error: {e}")
    
    @property
    def is_connected(self) -> bool:
        """Check if Redis is connected."""
        return self._redis is not None

# Global Redis client instance
redis_client = RedisClient()
