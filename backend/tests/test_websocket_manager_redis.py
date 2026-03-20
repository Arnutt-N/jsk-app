import pytest
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock

from app.core.redis_client import redis_client
from app.core.websocket_manager import ConnectionManager


class FakeWebSocket:
    def __init__(self):
        self.send_json = AsyncMock()


@pytest.mark.asyncio
async def test_room_membership_tracks_each_websocket_independently():
    manager = ConnectionManager()
    ws1 = FakeWebSocket()
    ws2 = FakeWebSocket()
    room_id = "conversation:U123"

    await manager.register(ws1, "1")
    await manager.register(ws2, "1")
    await manager.join_room(ws1, room_id)
    await manager.join_room(ws2, room_id)

    assert room_id in manager.admin_metadata["1"]["rooms"]
    assert ws1 in manager.rooms[room_id]
    assert ws2 in manager.rooms[room_id]

    await manager.leave_room(ws1, room_id)

    assert room_id in manager.admin_metadata["1"]["rooms"]
    assert room_id not in manager.ws_rooms[ws1]
    assert room_id in manager.ws_rooms[ws2]
    assert ws1 not in manager.rooms[room_id]
    assert ws2 in manager.rooms[room_id]

    ws1.send_json.reset_mock()
    ws2.send_json.reset_mock()
    await manager.broadcast_to_room(room_id, {"type": "test"})

    ws1.send_json.assert_not_awaited()
    ws2.send_json.assert_awaited_once()


@pytest.mark.asyncio
async def test_broadcast_to_room_includes_sender_admin_for_remote_exclusion():
    manager = ConnectionManager()
    manager._pubsub_initialized = True
    ws = FakeWebSocket()

    await manager.register(ws, "7")
    await manager.join_room(ws, "conversation:U123")

    publish_mock = AsyncMock()
    with pytest.MonkeyPatch.context() as mp:
        mp.setattr("app.core.websocket_manager.pubsub_manager.publish", publish_mock)
        await manager.broadcast_to_room("conversation:U123", {"type": "test"}, exclude_websocket=ws)

    publish_mock.assert_awaited_once()
    published = publish_mock.await_args.args[1]
    assert published["_room_id"] == "conversation:U123"
    assert published["_exclude_admin"] == "7"


@pytest.mark.asyncio
async def test_remote_room_message_excludes_sender_admin_across_instances():
    manager = ConnectionManager()
    sender_ws_a = FakeWebSocket()
    sender_ws_b = FakeWebSocket()
    other_ws = FakeWebSocket()
    room_id = "conversation:U321"

    await manager.register(sender_ws_a, "1")
    await manager.register(sender_ws_b, "1")
    await manager.register(other_ws, "2")
    manager.rooms[room_id] = {sender_ws_a, sender_ws_b, other_ws}
    manager.ws_rooms[sender_ws_a].add(room_id)
    manager.ws_rooms[sender_ws_b].add(room_id)
    manager.ws_rooms[other_ws].add(room_id)

    await manager._handle_remote_room_message({
        "_room_id": room_id,
        "_exclude_admin": "1",
        "type": "test",
    })

    sender_ws_a.send_json.assert_not_awaited()
    sender_ws_b.send_json.assert_not_awaited()
    other_ws.send_json.assert_awaited_once()


@pytest.mark.asyncio
async def test_disconnect_one_tab_keeps_remaining_room_membership():
    manager = ConnectionManager()
    ws1 = FakeWebSocket()
    ws2 = FakeWebSocket()
    room_id = "conversation:U456"

    await manager.register(ws1, "1")
    await manager.register(ws2, "1")
    await manager.join_room(ws1, room_id)
    await manager.join_room(ws2, room_id)

    await manager.disconnect(ws1)

    assert room_id in manager.admin_metadata["1"]["rooms"]
    assert ws2 in manager.rooms[room_id]
    assert room_id in manager.ws_rooms[ws2]


@pytest.mark.asyncio
async def test_is_admin_in_room_global_falls_back_to_local_room_state():
    manager = ConnectionManager()
    ws = FakeWebSocket()
    room_id = "conversation:U789"

    await manager.register(ws, "1")
    await manager.join_room(ws, room_id)

    with pytest.MonkeyPatch.context() as mp:
        mp.setattr(redis_client, "_redis", None)
        assert await manager.is_admin_in_room_global("1", room_id) is True


@pytest.mark.asyncio
async def test_is_admin_in_room_uses_websocket_membership_when_metadata_is_stale():
    manager = ConnectionManager()
    ws = FakeWebSocket()
    room_id = "conversation:U999"

    await manager.register(ws, "1")
    manager.rooms.setdefault(room_id, set()).add(ws)
    manager.ws_rooms.setdefault(ws, set()).add(room_id)
    manager.admin_metadata["1"]["rooms"] = set()

    assert manager.is_admin_in_room("1", room_id) is True


class FakeRedis:
    def __init__(self):
        self.sets: dict[str, set[str]] = {}
        self.kv: dict[str, str] = {}
        self.expiry: dict[str, int] = {}
        self.zsets: dict[str, dict[str, float]] = {}

    async def sadd(self, key: str, *members: str):
        self.sets.setdefault(key, set()).update(str(m) for m in members)

    async def srem(self, key: str, *members: str):
        values = self.sets.get(key, set())
        for m in members:
            values.discard(str(m))
        self.sets[key] = values

    async def smembers(self, key: str):
        return set(self.sets.get(key, set()))

    async def sismember(self, key: str, member: str):
        return str(member) in self.sets.get(key, set())

    async def scard(self, key: str):
        return len(self.sets.get(key, set()))

    async def expire(self, key: str, ttl: int):
        self.expiry[key] = ttl

    async def delete(self, key: str):
        self.sets.pop(key, None)
        self.kv.pop(key, None)

    async def setex(self, key: str, _ttl: int, value: str):
        self.kv[key] = value

    async def zadd(self, _key: str, _mapping: dict[str, float]):
        return None

    async def zrem(self, _key: str, _member: str):
        return None

    async def set(self, key: str, value: str, nx: bool = False):
        if nx and key in self.kv:
            return None
        self.kv[key] = value

    async def get(self, key: str):
        return self.kv.get(key)

    async def zincrby(self, _key: str, _amount: float, _member: str):
        bucket = self.zsets.setdefault(_key, {})
        bucket[_member] = bucket.get(_member, 0.0) + float(_amount)
        return bucket[_member]


@pytest.mark.asyncio
async def test_is_admin_in_room_global_uses_server_room_sets():
    manager = ConnectionManager()
    manager.server_id = "srv-a"
    fake = FakeRedis()

    with pytest.MonkeyPatch.context() as mp:
        mp.setattr(redis_client, "_redis", fake)
        admin_id = "42"
        room_id = "conversation:U123"
        await fake.sadd(f"{manager.REDIS_ADMIN_SERVERS_PREFIX}:{admin_id}", "srv-a", "srv-b")
        await fake.sadd(f"{manager.REDIS_ADMIN_ROOMS_PREFIX}:{admin_id}:srv-b", room_id)

        assert await manager.is_admin_in_room_global(admin_id, room_id) is True


@pytest.mark.asyncio
async def test_server_scoped_room_membership_does_not_remove_other_servers():
    manager = ConnectionManager()
    manager.server_id = "srv-a"
    fake = FakeRedis()

    with pytest.MonkeyPatch.context() as mp:
        mp.setattr(redis_client, "_redis", fake)
        admin_id = "42"
        room_id = "conversation:U123"
        room_key = f"{manager.REDIS_ROOM_PREFIX}:{room_id}"

        await manager._redis_add_room_membership(admin_id, room_id)
        await fake.sadd(room_key, f"{admin_id}:srv-b")

        assert f"{admin_id}:srv-a" in await fake.smembers(room_key)
        assert f"{admin_id}:srv-b" in await fake.smembers(room_key)

        await manager._redis_remove_room_membership(admin_id, room_id)
        remaining = await fake.smembers(room_key)

        assert f"{admin_id}:srv-a" not in remaining
        assert f"{admin_id}:srv-b" in remaining


@pytest.mark.asyncio
async def test_mark_operator_offline_aggregates_same_day_availability():
    manager = ConnectionManager()
    fake = FakeRedis()

    with pytest.MonkeyPatch.context() as mp:
        mp.setattr(redis_client, "_redis", fake)
        admin_id = "7"
        started_at = datetime.now(timezone.utc) - timedelta(hours=2)
        await fake.set(manager._operator_online_key(admin_id), started_at.isoformat())

        await manager._redis_mark_operator_offline(admin_id)

        day_key = manager._operator_availability_key(datetime.now(timezone.utc).date().isoformat())
        assert admin_id in fake.zsets.get(day_key, {})
        assert fake.zsets[day_key][admin_id] > 0
        assert await fake.get(manager._operator_online_key(admin_id)) is None


@pytest.mark.asyncio
async def test_mark_operator_offline_aggregates_cross_day_availability():
    manager = ConnectionManager()
    fake = FakeRedis()

    with pytest.MonkeyPatch.context() as mp:
        mp.setattr(redis_client, "_redis", fake)
        admin_id = "9"
        started_at = datetime.now(timezone.utc) - timedelta(hours=26)
        await fake.set(manager._operator_online_key(admin_id), started_at.isoformat())

        await manager._redis_mark_operator_offline(admin_id)

        touched_keys = [k for k in fake.zsets.keys() if k.startswith(manager.OPERATOR_AVAILABILITY_PREFIX)]
        assert len(touched_keys) >= 2
        for key in touched_keys:
            assert fake.zsets[key].get(admin_id, 0.0) >= 0.0
        assert await fake.get(manager._operator_online_key(admin_id)) is None
