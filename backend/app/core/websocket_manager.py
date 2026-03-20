"""WebSocket connection manager with Redis Pub/Sub support for horizontal scaling."""
from typing import Dict, Set, Optional
from fastapi import WebSocket
from datetime import datetime, timedelta, timezone
import time
import json
import uuid
import logging

from app.core.rate_limiter import ws_rate_limiter
from app.core.pubsub_manager import pubsub_manager
from app.core.redis_client import redis_client

logger = logging.getLogger(__name__)


class ConnectionManager:
    """
    Manage WebSocket connections, rooms, and broadcasting.
    
    Supports horizontal scaling via Redis Pub/Sub - when running multiple
    server instances, messages are synchronized across all instances.
    """

    # Redis Pub/Sub channels
    BROADCAST_CHANNEL = "live_chat:broadcast"
    ROOM_CHANNEL_PREFIX = "live_chat:room:"
    READ_KEY_PREFIX = "read"
    REDIS_CONNECTION_PREFIX = "ws:connections"
    REDIS_ADMIN_SERVERS_PREFIX = "ws:admin_servers"
    REDIS_ADMIN_ROOMS_PREFIX = "ws:admin_rooms"
    REDIS_ROOM_PREFIX = "ws:rooms"
    REDIS_PRESENCE_KEY = "ws:presence"
    OPERATOR_ONLINE_PREFIX = "operator:online"
    OPERATOR_AVAILABILITY_PREFIX = "operator:availability"
    PRESENCE_TIMEOUT_SECONDS = 90

    def __init__(self):
        # admin_id -> set of WebSocket connections (supports multiple tabs)
        self.connections: Dict[str, Set[WebSocket]] = {}
        # room_id -> set of WebSocket connections
        self.rooms: Dict[str, Set[WebSocket]] = {}
        # websocket -> set of room_ids
        self.ws_rooms: Dict[WebSocket, Set[str]] = {}
        # websocket -> admin_id mapping for cleanup
        self.ws_to_admin: Dict[WebSocket, str] = {}
        # admin metadata: {connected_at, last_ping, rooms}
        self.admin_metadata: Dict[str, dict] = {}
        # analytics subscription tracking
        self.analytics_ws: Set[WebSocket] = set()
        self.analytics_subscribers: Dict[str, int] = {}
        self._pubsub_initialized = False
        self.server_id = uuid.uuid4().hex[:12]

    async def initialize(self):
        """Initialize Pub/Sub subscriptions for cross-server communication."""
        if self._pubsub_initialized:
            return

        # Connect to Pub/Sub
        connected = await pubsub_manager.connect()
        if connected:
            # Subscribe to broadcast channel
            await pubsub_manager.subscribe(
                self.BROADCAST_CHANNEL,
                self._handle_remote_broadcast
            )
            logger.info("WebSocket manager initialized with Pub/Sub")
            self._pubsub_initialized = True
        else:
            logger.warning("Pub/Sub not available, running in local-only mode")

    async def _handle_remote_broadcast(self, data: dict):
        """Handle broadcast from other servers via Pub/Sub."""
        # Only broadcast locally - don't re-publish to avoid loops
        await self._broadcast_local(data)

    async def _handle_remote_room_message(self, data: dict):
        """Handle room message from other servers via Pub/Sub."""
        room_id = data.get("_room_id")
        exclude_admin = data.get("_exclude_admin")
        if room_id:
            # Remove internal fields before broadcasting
            message = {k: v for k, v in data.items() if not k.startswith("_")}
            await self._broadcast_room_local(room_id, message, exclude_admin=exclude_admin)

    async def connect(self, websocket: WebSocket) -> str:
        """Accept connection, return connection_id"""
        await websocket.accept()
        return str(id(websocket))

    async def register(self, websocket: WebSocket, admin_id: str):
        """Register authenticated connection"""
        if admin_id not in self.connections:
            self.connections[admin_id] = set()
        self.connections[admin_id].add(websocket)
        self.ws_to_admin[websocket] = admin_id
        self.ws_rooms[websocket] = set()

        if admin_id not in self.admin_metadata:
            self.admin_metadata[admin_id] = {
                "connected_at": datetime.now(timezone.utc),
                "last_ping": datetime.now(timezone.utc),
                "rooms": set(),
                "status": "online"
            }

        await self._redis_register_presence(admin_id)
        await self._redis_mark_operator_online(admin_id)
        logger.info(f"Admin {admin_id} registered. Connections: {len(self.connections[admin_id])}")

    async def disconnect(self, websocket: WebSocket):
        """Clean up connection"""
        admin_id = self.ws_to_admin.get(websocket)
        if not admin_id:
            return

        # Remove analytics subscription for this websocket if present
        await self.unsubscribe_analytics(websocket)

        # Leave all rooms
        for room_id in list(self.ws_rooms.get(websocket, set())):
            await self.leave_room(websocket, room_id)

        # Remove connection
        self.ws_rooms.pop(websocket, None)
        if admin_id in self.connections:
            self.connections[admin_id].discard(websocket)
            if not self.connections[admin_id]:
                # Clean up rate limiter when last connection closes
                ws_rate_limiter.reset(admin_id)
                del self.connections[admin_id]
                # Clean up admin metadata to prevent memory leak
                if admin_id in self.admin_metadata:
                    del self.admin_metadata[admin_id]
                await self._redis_unregister_presence(admin_id)
            else:
                await self._redis_register_presence(admin_id)

        self.ws_to_admin.pop(websocket, None)
        logger.info(f"Admin {admin_id} disconnected")

    async def subscribe_analytics(self, websocket: WebSocket):
        """Subscribe an authenticated websocket to analytics updates."""
        admin_id = self.ws_to_admin.get(websocket)
        if not admin_id:
            return
        if websocket in self.analytics_ws:
            return
        self.analytics_ws.add(websocket)
        self.analytics_subscribers[admin_id] = self.analytics_subscribers.get(admin_id, 0) + 1

    async def unsubscribe_analytics(self, websocket: WebSocket):
        """Unsubscribe websocket from analytics updates."""
        if websocket not in self.analytics_ws:
            return
        self.analytics_ws.discard(websocket)
        admin_id = self.ws_to_admin.get(websocket)
        if not admin_id:
            return
        count = self.analytics_subscribers.get(admin_id, 0)
        if count <= 1:
            self.analytics_subscribers.pop(admin_id, None)
        else:
            self.analytics_subscribers[admin_id] = count - 1

    async def broadcast_analytics_update(self, data: dict):
        """Broadcast analytics updates to subscribed admins only."""
        for admin_id in list(self.analytics_subscribers.keys()):
            await self.send_to_admin(admin_id, data)

    async def join_room(self, websocket: WebSocket, room_id: str):
        """Add connection to a room"""
        admin_id = self.ws_to_admin.get(websocket)
        if not admin_id:
            return

        previous_rooms = set(self.admin_metadata.get(admin_id, {}).get("rooms", set()))
        if room_id not in self.rooms:
            self.rooms[room_id] = set()
            # Subscribe to room channel for cross-server messages
            if self._pubsub_initialized:
                channel = f"{self.ROOM_CHANNEL_PREFIX}{room_id}"
                await pubsub_manager.subscribe(channel, self._handle_remote_room_message)
        self.rooms[room_id].add(websocket)
        self.ws_rooms.setdefault(websocket, set()).add(room_id)
        await self._refresh_admin_room_state(admin_id)

        if room_id not in previous_rooms:
            # Notify others in room only when the admin joins the room for the first time.
            await self.broadcast_to_room(room_id, {
                "type": "operator_joined",
                "payload": {"admin_id": admin_id, "room_id": room_id},
                "timestamp": datetime.now(timezone.utc).isoformat()
            }, exclude_websocket=websocket)

        logger.info(f"Admin {admin_id} joined room {room_id}")

    async def leave_room(self, websocket: WebSocket, room_id: str):
        """Remove connection from a room"""
        admin_id = self.ws_to_admin.get(websocket)
        if not admin_id:
            return

        previous_rooms = set(self.admin_metadata.get(admin_id, {}).get("rooms", set()))
        if room_id in self.rooms:
            self.rooms[room_id].discard(websocket)
            if not self.rooms[room_id]:
                del self.rooms[room_id]
                # Unsubscribe from room channel
                if self._pubsub_initialized:
                    channel = f"{self.ROOM_CHANNEL_PREFIX}{room_id}"
                    await pubsub_manager.unsubscribe(channel)

        if websocket in self.ws_rooms:
            self.ws_rooms[websocket].discard(room_id)
        await self._refresh_admin_room_state(admin_id)

        if room_id in previous_rooms and room_id not in self.admin_metadata.get(admin_id, {}).get("rooms", set()):
            # Notify others only when the admin fully leaves the room.
            await self.broadcast_to_room(room_id, {
                "type": "operator_left",
                "payload": {"admin_id": admin_id, "room_id": room_id},
                "timestamp": datetime.now(timezone.utc).isoformat()
            }, exclude_websocket=websocket)

        logger.info(f"Admin {admin_id} left room {room_id}")

    async def send_personal(self, websocket: WebSocket, data: dict) -> bool:
        """Send to specific connection. Returns True if successful."""
        try:
            await websocket.send_json(data)
            return True
        except Exception as e:
            logger.error(f"Error sending to websocket: {e}")
            return False

    async def send_to_admin(self, admin_id: str, data: dict) -> bool:
        """Send to all connections of an admin. Returns True if at least one send succeeded."""
        if admin_id not in self.connections:
            return False

        disconnected = []
        success = False
        for ws in self.connections[admin_id]:
            try:
                await ws.send_json(data)
                success = True
                await self.touch_presence(admin_id)
            except Exception as e:
                logger.debug("send_to_admin failed for admin %s: %s", admin_id, e)
                disconnected.append(ws)

        for ws in disconnected:
            await self.disconnect(ws)

        return success

    async def broadcast_to_room(
        self,
        room_id: str,
        data: dict,
        exclude_websocket: Optional[WebSocket] = None,
        exclude_admin: Optional[str] = None,
    ) -> int:
        """
        Broadcast to all admins in a room across all servers.
        Returns count of successful sends.
        """
        # Publish to Redis for other servers
        if self._pubsub_initialized:
            derived_exclude_admin = exclude_admin
            if derived_exclude_admin is None and exclude_websocket is not None:
                derived_exclude_admin = self.ws_to_admin.get(exclude_websocket)
            message = {
                **data,
                "_room_id": room_id,
                "_exclude_admin": derived_exclude_admin,
            }
            channel = f"{self.ROOM_CHANNEL_PREFIX}{room_id}"
            await pubsub_manager.publish(channel, message)

        # Broadcast locally
        return await self._broadcast_room_local(room_id, data, exclude_websocket, exclude_admin)

    async def _broadcast_room_local(
        self,
        room_id: str,
        data: dict,
        exclude_websocket: Optional[WebSocket] = None,
        exclude_admin: Optional[str] = None,
    ) -> int:
        """Broadcast to local connections only."""
        if room_id not in self.rooms:
            return 0

        success_count = 0
        for websocket in list(self.rooms.get(room_id, [])):
            admin_id = self.ws_to_admin.get(websocket)
            if exclude_websocket is not None and websocket == exclude_websocket:
                continue
            if exclude_admin is not None and admin_id == exclude_admin:
                continue
            if await self.send_personal(websocket, data):
                success_count += 1
        return success_count

    async def broadcast_to_all(self, data: dict, exclude_admin: Optional[str] = None):
        """Broadcast to all connected admins across all servers."""
        # Publish to Redis for other servers
        if self._pubsub_initialized:
            await pubsub_manager.publish(self.BROADCAST_CHANNEL, data)

        # Broadcast locally
        await self._broadcast_local(data, exclude_admin)

    async def _broadcast_local(self, data: dict, exclude_admin: Optional[str] = None):
        """Broadcast to local connections only."""
        for admin_id in list(self.connections.keys()):
            if admin_id != exclude_admin:
                await self.send_to_admin(admin_id, data)

    def get_room_id(self, line_user_id: str) -> str:
        """Generate room ID from line_user_id"""
        return f"conversation:{line_user_id}"

    async def get_online_admins(self) -> list:
        """Get list of online admins (Redis-backed across instances, local fallback)."""
        if redis_client.is_connected and redis_client._redis:
            now_epoch = time.time()
            min_score = now_epoch - self.PRESENCE_TIMEOUT_SECONDS
            try:
                admin_ids = await redis_client._redis.zrangebyscore(
                    self.REDIS_PRESENCE_KEY, min_score, now_epoch
                )
                result = []
                for admin_id in admin_ids:
                    active_chats = await self._redis_get_active_room_count(admin_id)
                    result.append(
                        {
                            "id": str(admin_id),
                            "status": "online",
                            "active_chats": active_chats,
                        }
                    )
                return result
            except Exception as e:
                logger.error("Redis online admin query failed, fallback to local: %s", e)

        result = []
        for admin_id, meta in self.admin_metadata.items():
            if meta.get("status") == "online":
                result.append({
                    "id": admin_id,
                    "status": meta["status"],
                    "active_chats": len(meta.get("rooms", []))
                })
        return result

    def get_connected_admin_ids(self) -> list[str]:
        """Get all connected admin IDs on this server instance."""
        return list(self.connections.keys())

    def is_admin_in_room(self, admin_id: str, room_id: str) -> bool:
        """Check if an admin currently joined a room on this instance."""
        if room_id in self.admin_metadata.get(admin_id, {}).get("rooms", set()):
            return True
        for websocket in self.rooms.get(room_id, set()):
            if self.ws_to_admin.get(websocket) == admin_id:
                return True
        return False

    async def is_admin_in_room_global(self, admin_id: str, room_id: str) -> bool:
        """Check room membership across all instances (Redis-backed)."""
        if self.is_admin_in_room(admin_id, room_id):
            return True
        if redis_client.is_connected and redis_client._redis:
            try:
                return await self._redis_is_admin_in_room(admin_id, room_id)
            except Exception as e:
                logger.error("Redis room membership check failed: %s", e)
        return False

    def is_admin_online(self, admin_id: str) -> bool:
        """Check if admin is connected"""
        return admin_id in self.connections and len(self.connections[admin_id]) > 0

    def get_stats(self) -> dict:
        """Get connection statistics."""
        return {
            "total_admins": len(self.connections),
            "total_connections": sum(len(ws_set) for ws_set in self.connections.values()),
            "total_rooms": len(self.rooms),
            "pubsub_connected": self._pubsub_initialized
        }

    @classmethod
    def build_read_key(cls, admin_id: str, line_user_id: str) -> str:
        return f"{cls.READ_KEY_PREFIX}:{admin_id}:{line_user_id}"

    async def mark_conversation_read(self, admin_id: str, line_user_id: str, timestamp: Optional[datetime] = None):
        """Persist operator read marker in Redis for unread calculations."""
        ts = timestamp or datetime.now(timezone.utc)
        key = self.build_read_key(admin_id, line_user_id)
        # Long TTL so unread state survives reconnect/restart
        await redis_client.setex(key, 60 * 60 * 24 * 30, ts.isoformat())

    async def get_conversation_read_at(self, admin_id: str, line_user_id: str) -> Optional[datetime]:
        """Get read marker timestamp from Redis."""
        key = self.build_read_key(admin_id, line_user_id)
        raw = await redis_client.get(key)
        if not raw:
            return None
        try:
            return datetime.fromisoformat(raw)
        except ValueError:
            return None

    async def touch_presence(self, admin_id: str):
        """Refresh admin presence heartbeat."""
        if admin_id in self.admin_metadata:
            self.admin_metadata[admin_id]["last_ping"] = datetime.now(timezone.utc)
        if redis_client.is_connected and redis_client._redis:
            try:
                await redis_client._redis.zadd(
                    self.REDIS_PRESENCE_KEY,
                    {str(admin_id): time.time()},
                )
                await redis_client._redis.expire(
                    f"{self.REDIS_CONNECTION_PREFIX}:{admin_id}:{self.server_id}",
                    self.PRESENCE_TIMEOUT_SECONDS * 2,
                )
            except Exception as e:
                logger.error("Failed to refresh Redis presence: %s", e)

    async def _redis_register_presence(self, admin_id: str):
        """Persist connection metadata into Redis."""
        if not redis_client.is_connected or not redis_client._redis:
            return
        try:
            now_epoch = time.time()
            connection_key = f"{self.REDIS_CONNECTION_PREFIX}:{admin_id}:{self.server_id}"
            rooms_key = f"{self.REDIS_ADMIN_ROOMS_PREFIX}:{admin_id}:{self.server_id}"
            servers_key = f"{self.REDIS_ADMIN_SERVERS_PREFIX}:{admin_id}"
            payload = {
                "connected_at": datetime.now(timezone.utc).isoformat(),
                "server_id": self.server_id,
                "admin_id": str(admin_id),
            }
            await redis_client._redis.setex(
                connection_key,
                self.PRESENCE_TIMEOUT_SECONDS * 2,
                json.dumps(payload),
            )
            await redis_client._redis.expire(rooms_key, self.PRESENCE_TIMEOUT_SECONDS * 2)
            await redis_client._redis.sadd(servers_key, self.server_id)
            await redis_client._redis.expire(servers_key, 60 * 60 * 24 * 7)
            await redis_client._redis.zadd(self.REDIS_PRESENCE_KEY, {str(admin_id): now_epoch})
        except Exception as e:
            logger.error("Failed to register Redis presence: %s", e)

    async def _redis_unregister_presence(self, admin_id: str):
        """Remove Redis connection metadata for one admin on this server."""
        if not redis_client.is_connected or not redis_client._redis:
            return
        try:
            connection_key = f"{self.REDIS_CONNECTION_PREFIX}:{admin_id}:{self.server_id}"
            rooms_key = f"{self.REDIS_ADMIN_ROOMS_PREFIX}:{admin_id}:{self.server_id}"
            room_ids = await redis_client._redis.smembers(rooms_key)
            for room_id in room_ids:
                member = f"{admin_id}:{self.server_id}"
                await redis_client._redis.srem(f"{self.REDIS_ROOM_PREFIX}:{room_id}", member)
            await redis_client._redis.delete(connection_key)
            await redis_client._redis.delete(rooms_key)

            servers_key = f"{self.REDIS_ADMIN_SERVERS_PREFIX}:{admin_id}"
            await redis_client._redis.srem(servers_key, self.server_id)
            remaining = await redis_client._redis.scard(servers_key)
            if remaining <= 0:
                await redis_client._redis.zrem(self.REDIS_PRESENCE_KEY, str(admin_id))
                await redis_client._redis.delete(servers_key)
                await self._redis_mark_operator_offline(admin_id)
        except Exception as e:
            logger.error("Failed to unregister Redis presence: %s", e)

    async def _redis_add_room_membership(self, admin_id: str, room_id: str):
        """Persist room membership in Redis."""
        if not redis_client.is_connected or not redis_client._redis:
            return
        try:
            room_key = f"{self.REDIS_ROOM_PREFIX}:{room_id}"
            rooms_key = f"{self.REDIS_ADMIN_ROOMS_PREFIX}:{admin_id}:{self.server_id}"
            ttl = self.PRESENCE_TIMEOUT_SECONDS * 2
            member = f"{admin_id}:{self.server_id}"
            await redis_client._redis.sadd(room_key, member)
            await redis_client._redis.sadd(rooms_key, room_id)
            await redis_client._redis.expire(room_key, ttl)
            await redis_client._redis.expire(rooms_key, ttl)
            await redis_client._redis.expire(f"{self.REDIS_CONNECTION_PREFIX}:{admin_id}:{self.server_id}", ttl)
        except Exception as e:
            logger.error("Failed to add Redis room membership: %s", e)

    async def _redis_remove_room_membership(self, admin_id: str, room_id: str):
        """Remove room membership from Redis."""
        if not redis_client.is_connected or not redis_client._redis:
            return
        try:
            member = f"{admin_id}:{self.server_id}"
            await redis_client._redis.srem(f"{self.REDIS_ROOM_PREFIX}:{room_id}", member)
            await redis_client._redis.srem(
                f"{self.REDIS_ADMIN_ROOMS_PREFIX}:{admin_id}:{self.server_id}",
                room_id,
            )
        except Exception as e:
            logger.error("Failed to remove Redis room membership: %s", e)

    async def _redis_get_active_room_count(self, admin_id: str) -> int:
        """Get active room count for an admin across servers."""
        if not redis_client.is_connected or not redis_client._redis:
            return len(self.admin_metadata.get(admin_id, {}).get("rooms", []))
        try:
            servers_key = f"{self.REDIS_ADMIN_SERVERS_PREFIX}:{admin_id}"
            server_ids = await redis_client._redis.smembers(servers_key)
            rooms: set[str] = set()
            for sid in server_ids:
                rooms_key = f"{self.REDIS_ADMIN_ROOMS_PREFIX}:{admin_id}:{sid}"
                values = await redis_client._redis.smembers(rooms_key)
                if not values:
                    await redis_client._redis.srem(servers_key, sid)
                    continue
                rooms.update(values)
            return len(rooms)
        except Exception as e:
            logger.error("Failed to get Redis room count: %s", e)
            return len(self.admin_metadata.get(admin_id, {}).get("rooms", []))

    async def _redis_is_admin_in_room(self, admin_id: str, room_id: str) -> bool:
        """Check room membership from per-admin server room sets."""
        if not redis_client.is_connected or not redis_client._redis:
            return self.is_admin_in_room(admin_id, room_id)

        try:
            servers_key = f"{self.REDIS_ADMIN_SERVERS_PREFIX}:{admin_id}"
            server_ids = await redis_client._redis.smembers(servers_key)
            for sid in server_ids:
                rooms_key = f"{self.REDIS_ADMIN_ROOMS_PREFIX}:{admin_id}:{sid}"
                in_room = await redis_client._redis.sismember(rooms_key, room_id)
                if in_room:
                    return True
            return False
        except Exception as e:
            logger.warning("Redis check for admin %s in room %s failed: %s", admin_id, room_id, e)
            return self.is_admin_in_room(admin_id, room_id)

    async def _refresh_admin_room_state(self, admin_id: str):
        """Synchronize admin room metadata and Redis room membership with websocket state."""
        if admin_id not in self.admin_metadata:
            return

        previous_rooms = set(self.admin_metadata[admin_id].get("rooms", set()))
        current_rooms: Set[str] = set()
        for websocket in self.connections.get(admin_id, set()):
            current_rooms.update(self.ws_rooms.get(websocket, set()))

        self.admin_metadata[admin_id]["rooms"] = current_rooms

        added_rooms = current_rooms - previous_rooms
        removed_rooms = previous_rooms - current_rooms

        for room_id in added_rooms:
            await self._redis_add_room_membership(admin_id, room_id)
        for room_id in removed_rooms:
            await self._redis_remove_room_membership(admin_id, room_id)

    @classmethod
    def _operator_online_key(cls, admin_id: str) -> str:
        return f"{cls.OPERATOR_ONLINE_PREFIX}:{admin_id}"

    @classmethod
    def _operator_availability_key(cls, date_str: str) -> str:
        return f"{cls.OPERATOR_AVAILABILITY_PREFIX}:{date_str}"

    async def _redis_mark_operator_online(self, admin_id: str):
        """Persist operator online start timestamp once per online window."""
        if not redis_client.is_connected or not redis_client._redis:
            return
        try:
            key = self._operator_online_key(admin_id)
            await redis_client._redis.set(key, datetime.now(timezone.utc).isoformat(), nx=True)
        except Exception as e:
            logger.error("Failed to mark operator online: %s", e)

    async def _redis_mark_operator_offline(self, admin_id: str):
        """Finalize online window and aggregate duration into daily availability score."""
        if not redis_client.is_connected or not redis_client._redis:
            return
        key = self._operator_online_key(admin_id)
        try:
            started_raw = await redis_client._redis.get(key)
            if not started_raw:
                return

            now = datetime.now(timezone.utc)
            try:
                started_at = datetime.fromisoformat(started_raw)
            except ValueError:
                await redis_client._redis.delete(key)
                return

            if started_at > now:
                await redis_client._redis.delete(key)
                return

            cursor = started_at
            while cursor.date() < now.date():
                day_end = datetime(
                    year=cursor.year,
                    month=cursor.month,
                    day=cursor.day,
                    hour=23,
                    minute=59,
                    second=59,
                    microsecond=999999,
                    tzinfo=timezone.utc,
                )
                seconds = max((day_end - cursor).total_seconds(), 0)
                if seconds > 0:
                    day_key = self._operator_availability_key(cursor.date().isoformat())
                    await redis_client._redis.zincrby(day_key, seconds, str(admin_id))
                    await redis_client._redis.expire(day_key, 60 * 60 * 24 * 120)
                cursor = datetime(
                    year=cursor.year,
                    month=cursor.month,
                    day=cursor.day,
                    tzinfo=timezone.utc,
                ) + timedelta(days=1)

            final_seconds = max((now - cursor).total_seconds(), 0)
            if final_seconds > 0:
                day_key = self._operator_availability_key(now.date().isoformat())
                await redis_client._redis.zincrby(day_key, final_seconds, str(admin_id))
                await redis_client._redis.expire(day_key, 60 * 60 * 24 * 120)

            await redis_client._redis.delete(key)
        except Exception as e:
            logger.error("Failed to mark operator offline: %s", e)


# Singleton instance
ws_manager = ConnectionManager()

