---
name: skn-live-chat-ops
description: >
  Adds, modifies, or debugs WebSocket live chat features in the SKN App backend.
  Covers the event dispatch loop, ConnectionManager, session lifecycle, and
  ws_manager routing. Use when asked to "add live chat feature", "add WS event",
  "เพิ่ม event ใน live chat", "แก้ live chat", "เพิ่มฟีเจอร์ live chat",
  "operator feature", "session transfer", "typing indicator", or any WebSocket
  feature in the admin live chat system.
  Do NOT use for LINE webhook parsing, LIFF apps, or flex message building.
license: MIT
compatibility: >
  SKN App (JskApp) backend. Python 3.11+, FastAPI async, SQLAlchemy 2.0 async,
  Redis Pub/Sub (via pubsub_manager). WebSocket at /api/v1/ws/live-chat.
metadata:
  author: SKN App Team
  version: 1.0.0
  project: skn-app
  category: live-chat
  tags: [websocket, live-chat, operator, session, real-time]
---

# skn-live-chat-ops

Adds and modifies WebSocket live chat features in the SKN App, following the
project's three-layer architecture: WS dispatch endpoint → ConnectionManager →
LiveChatService.

---

## CRITICAL: Project-Specific Rules

1. **`WSEventType` enum** — All event type strings live in `backend/app/schemas/ws_events.py`. Add new event types here first.
2. **elif dispatch chain** — `ws_live_chat.py` routes events via `elif msg_type == WSEventType.X.value:`. This is intentional — `isinstance` checks are avoided to keep serialization simple.
3. **DB sessions are NOT injected** — WebSocket handlers open their own: `async with AsyncSessionLocal() as db:`. Never use `Depends(get_db)` inside a WS handler.
4. **Room format is `conversation:{line_user_id}`** — Extract the user ID with `.replace("conversation:", "")`.
5. **Guard-then-continue** — Check `admin_id` and `current_room` at the top of each elif block; send an error and `continue` if invalid. Never let a handler silently fail.
6. **Rate limit checked on every non-ping message** — The check is already in the main loop before the elif chain; new handlers inherit it automatically.
7. **All state mutations via `live_chat_service`** — Never directly update `ChatSession` fields inside the WS endpoint; call the service methods.
8. **`ws_manager` handles Redis Pub/Sub** — `broadcast_to_room()` publishes to Redis automatically for horizontal scaling; callers don't need to know about Redis.

---

## Context7 Docs

Context7 MCP is active in this project. Use it to verify FastAPI WebSocket
connection lifecycle, Starlette WebSocket API, and SQLAlchemy async patterns.

**Relevant libraries:**

| Library | Resolve Name | Key Topics |
|---|---|---|
| FastAPI | `"fastapi"` | websocket, WebSocket class, accept/send/receive |
| Starlette | `"starlette"` | WebSocketDisconnect, WebSocket state |
| SQLAlchemy | `"sqlalchemy"` | async session, AsyncSessionLocal pattern |

**Usage:**
```
# 1. Resolve to Context7 library ID
mcp__context7__resolve-library-id  libraryName="fastapi"
→ { context7CompatibleLibraryID: "/tiangolo/fastapi" }

# 2. Fetch targeted docs
mcp__context7__get-library-docs
    context7CompatibleLibraryID="/tiangolo/fastapi"
    topic="websocket connection lifecycle"
    tokens=5000
```

When to use: FastAPI WebSocket class methods (`accept`, `send_json`, `receive_json`,
`close`), `WebSocketDisconnect` exception handling, or verifying async session
patterns inside non-dependency-injected contexts.

---

## Architecture Overview

```
Client (admin browser / LINE WS client)
    │  WebSocket frames (JSON)
    ▼
ws_live_chat.py  ← FastAPI @router.websocket("/ws/live-chat")
    │  Reads JSON, dispatches via elif chain
    │  Opens AsyncSessionLocal() per operation
    ▼
websocket_manager.py (ws_manager singleton)
    │  Tracks connections, rooms, analytics subscribers
    │  Publishes/receives via Redis Pub/Sub (cross-server)
    ├── send_personal(ws, data)       ← reply to one tab
    ├── send_to_admin(admin_id, data) ← reply to all tabs of one admin
    ├── broadcast_to_room(room, data) ← all admins watching a conversation
    └── broadcast_to_all(data)        ← all connected admins
    ▼
live_chat_service/ package (live_chat_service singleton facade)
    │  Handles DB state changes: session lifecycle, messages, CSAT, SLA
    │  Split into per-concern mixins in PR #137; import path/API unchanged.
    ├── claim_session(line_user_id, operator_id, db)          ← sessions.py
    ├── close_session(line_user_id, closed_by, db)            ← sessions.py
    ├── transfer_session(line_user_id, from_id, to_id, reason, db) ← sessions.py
    └── send_message(line_user_id, text, operator_id, db)     ← messaging.py
```

Key files:
```
backend/app/
├── api/v1/endpoints/ws_live_chat.py    ← elif dispatch loop — ADD NEW HANDLERS HERE
├── schemas/ws_events.py                ← WSEventType, WSErrorCode, payload schemas — ADD ENUM VALUES HERE
├── core/websocket_manager.py           ← ConnectionManager singleton: ws_manager
└── services/live_chat_service/         ← package: all session/message DB logic
                                          (handoff/sessions/messaging/conversations/
                                          unread/analytics mixins; same facade)
```

---

## Step 1: Understand the Dispatch Loop

The WebSocket endpoint runs a single `while True` loop per connection:

```python
@router.websocket("/ws/live-chat")
async def websocket_endpoint(websocket: WebSocket, token: Optional[str] = Query(None)):
    connection_id = await ws_manager.connect(websocket)
    admin_id: Optional[str] = None
    current_room: Optional[str] = None

    try:
        while True:
            data = await websocket.receive_json()
            msg_type = data.get("type")
            timestamp = datetime.now(timezone.utc).isoformat()

            # ── Rate limiter (auto-applied, not your concern) ──
            if admin_id and msg_type != WSEventType.PING.value:
                if not ws_rate_limiter.is_allowed(admin_id):
                    await ws_manager.send_personal(websocket, {
                        "type": WSEventType.ERROR.value,
                        "payload": {"message": "Rate limit exceeded", "code": WSErrorCode.RATE_LIMIT_EXCEEDED.value},
                        "timestamp": timestamp
                    })
                    continue

            # ── Event dispatch ──
            if msg_type == WSEventType.AUTH.value:
                ...
            elif msg_type == WSEventType.JOIN_ROOM.value:
                ...
            elif msg_type == WSEventType.SEND_MESSAGE.value:
                ...
            # ← YOUR NEW elif BLOCK GOES HERE

    except WebSocketDisconnect:
        await ws_manager.disconnect(websocket)
```

**Key variables available in every elif block:**
- `websocket` — the connection object (for `send_personal`)
- `admin_id` — authenticated operator ID (string); `None` until auth
- `current_room` — room ID like `"conversation:U1234abc"` (or `None` if not joined)
- `data` — full received dict: `{"type": "...", "payload": {...}}`
- `timestamp` — ISO datetime string for response timestamps

---

## Step 2: Add a New WS Event

Follow this 4-step sequence every time:

### 2a. Add the event type to the enum

In `backend/app/schemas/ws_events.py`:

```python
class WSEventType(str, Enum):
    # Existing...
    PING = "ping"

    # Add new client→server event:
    MY_ACTION = "my_action"

    # Add new server→client event (if needed):
    MY_ACTION_RESULT = "my_action_result"
```

### 2b. Add a payload schema (optional but recommended)

In `backend/app/schemas/ws_events.py`:

```python
class MyActionPayload(BaseModel):
    line_user_id: str
    some_field: str
    optional_field: Optional[str] = None
```

### 2c. Add the elif block in `ws_live_chat.py`

```python
elif msg_type == WSEventType.MY_ACTION.value:
    # ── Guard: require auth ──
    if not admin_id:
        await ws_manager.send_personal(websocket, {
            "type": WSEventType.ERROR.value,
            "payload": {"message": "Authentication required", "code": WSErrorCode.NOT_AUTHENTICATED.value},
            "timestamp": timestamp
        })
        continue

    # ── Guard: require room (if operation is per-conversation) ──
    if not current_room:
        await ws_manager.send_personal(websocket, {
            "type": WSEventType.ERROR.value,
            "payload": {"message": "Not in a room", "code": WSErrorCode.NOT_IN_ROOM.value},
            "timestamp": timestamp
        })
        continue

    # ── Parse payload ──
    payload = data.get("payload", {})
    line_user_id = current_room.replace("conversation:", "")

    # ── DB operation ──
    async with AsyncSessionLocal() as db:
        result = await live_chat_service.some_method(line_user_id, int(admin_id), db)
        await db.commit()

    # ── Respond to sender ──
    await ws_manager.send_personal(websocket, {
        "type": WSEventType.MY_ACTION_RESULT.value,
        "payload": {"status": "ok", "data": result},
        "timestamp": timestamp
    })

    # ── Broadcast to others in room (if needed) ──
    await ws_manager.broadcast_to_room(current_room, {
        "type": WSEventType.MY_ACTION_RESULT.value,
        "payload": {"admin_id": admin_id, "data": result},
        "timestamp": timestamp
    }, exclude_admin=admin_id)
```

### 2d. Import the payload schema (if you added one)

At the top of `ws_live_chat.py`, add to the schemas import:
```python
from app.schemas.ws_events import (
    WSEventType, WSErrorCode,
    AuthPayload, SendMessagePayload, TransferSessionPayload,
    MyActionPayload  # ← add here
)
```

---

## Step 3: Sending Responses

Choose the right send method for each use case:

```python
# Reply only to the sender's current tab
await ws_manager.send_personal(websocket, data)

# Reply to all tabs of a specific admin (multi-tab support)
await ws_manager.send_to_admin(admin_id, data)

# Broadcast to all admins watching this conversation
await ws_manager.broadcast_to_room(current_room, data, exclude_admin=admin_id)
# exclude_admin omits the sender from the broadcast (they already got send_personal)

# Broadcast to all connected admins (e.g., presence updates)
await ws_manager.broadcast_to_all(data)

# Send to analytics subscribers only
await ws_manager.broadcast_analytics_update(data)
```

**Standard response shape:**
```python
{
    "type": WSEventType.SOME_EVENT.value,   # always use .value for serialization
    "payload": { ... },                      # event-specific data
    "timestamp": timestamp                   # reuse the timestamp from loop top
}
```

---

## Step 4: Session Lifecycle Operations

These are the most common live chat operations, each mapped to a `live_chat_service` method:

### Claim a waiting session

```python
elif msg_type == WSEventType.CLAIM_SESSION.value:
    if not admin_id or not current_room:
        # ... error guards ...
        continue

    line_user_id = current_room.replace("conversation:", "")

    async with AsyncSessionLocal() as db:
        session = await live_chat_service.claim_session(
            line_user_id=line_user_id,
            operator_id=int(admin_id),
            db=db
        )
        await db.commit()

    await ws_manager.broadcast_to_all({
        "type": WSEventType.SESSION_CLAIMED.value,
        "payload": {
            "line_user_id": line_user_id,
            "operator_id": admin_id,
            "session_id": session.id
        },
        "timestamp": timestamp
    })
```

### Close a session

```python
from app.models.chat_session import ClosedBy

async with AsyncSessionLocal() as db:
    session = await live_chat_service.close_session(
        line_user_id=line_user_id,
        closed_by=ClosedBy.OPERATOR,
        db=db
    )
    await db.commit()
# ClosedBy values: OPERATOR, USER, SYSTEM, SYSTEM_TIMEOUT
```

### Transfer a session

```python
# payload = {"to_operator_id": 5, "reason": "Specialist needed"}
to_operator_id = payload.get("to_operator_id")
reason = payload.get("reason", "")

async with AsyncSessionLocal() as db:
    session = await live_chat_service.transfer_session(
        line_user_id=line_user_id,
        from_operator_id=int(admin_id),
        to_operator_id=int(to_operator_id),
        reason=reason,
        db=db
    )
    await db.commit()
```

**Session lifecycle states:**
```
WAITING ──(claim_session)──► ACTIVE ──(close_session)──► CLOSED
                              │
                              └──(transfer_session)──► ACTIVE (new operator)
```

---

## Step 5: Error Handling and Guard Patterns

### Standard error response

```python
await ws_manager.send_personal(websocket, {
    "type": WSEventType.ERROR.value,
    "payload": {
        "message": "Human-readable description",
        "code": WSErrorCode.SOME_CODE.value
    },
    "timestamp": timestamp
})
continue  # ← ALWAYS continue after an error in the dispatch loop
```

### Guard template — copy this for each new handler

```python
elif msg_type == WSEventType.MY_ACTION.value:
    # 1. Auth guard
    if not admin_id:
        await ws_manager.send_personal(websocket, {
            "type": WSEventType.ERROR.value,
            "payload": {"message": "Authentication required", "code": WSErrorCode.NOT_AUTHENTICATED.value},
            "timestamp": timestamp
        })
        continue

    # 2. Room guard (for conversation-scoped operations)
    if not current_room:
        await ws_manager.send_personal(websocket, {
            "type": WSEventType.ERROR.value,
            "payload": {"message": "Not in a room", "code": WSErrorCode.NOT_IN_ROOM.value},
            "timestamp": timestamp
        })
        continue

    # 3. Payload validation (use try/except for Pydantic)
    try:
        payload_obj = MyActionPayload(**data.get("payload", {}))
    except ValidationError as e:
        await ws_manager.send_personal(websocket, {
            "type": WSEventType.ERROR.value,
            "payload": {"message": str(e), "code": WSErrorCode.VALIDATION_ERROR.value},
            "timestamp": timestamp
        })
        continue

    # 4. Service call with try/except
    try:
        async with AsyncSessionLocal() as db:
            result = await live_chat_service.some_method(...)
            await db.commit()
    except ValueError as e:
        await ws_manager.send_personal(websocket, {
            "type": WSEventType.ERROR.value,
            "payload": {"message": str(e), "code": WSErrorCode.INVALID_REQUEST.value},
            "timestamp": timestamp
        })
        continue
    except Exception as e:
        logger.error(f"my_action error: {e}")
        await ws_manager.send_personal(websocket, {
            "type": WSEventType.ERROR.value,
            "payload": {"message": "Internal server error", "code": WSErrorCode.INTERNAL_ERROR.value},
            "timestamp": timestamp
        })
        continue

    # 5. Success response
    await ws_manager.send_personal(websocket, {
        "type": WSEventType.MY_ACTION_RESULT.value,
        "payload": {"status": "ok"},
        "timestamp": timestamp
    })
```

---

## Step 6: Analytics Subscription

The analytics channel is separate from conversation rooms. Admins subscribe/unsubscribe to receive real-time KPI updates:

```python
elif msg_type == WSEventType.SUBSCRIBE_ANALYTICS.value:
    if not admin_id:
        # auth guard
        continue
    await ws_manager.subscribe_analytics(websocket)
    await ws_manager.send_personal(websocket, {
        "type": "subscribed_analytics",
        "payload": {"status": "ok"},
        "timestamp": timestamp
    })

# To push an analytics update from anywhere in the backend:
await ws_manager.broadcast_analytics_update({
    "type": WSEventType.ANALYTICS_UPDATE.value,
    "payload": { "active_sessions": 3, "waiting": 1 },
    "timestamp": datetime.now(timezone.utc).isoformat()
})
```

Analytics subscriptions auto-cancel on disconnect — `ws_manager.disconnect()` calls `unsubscribe_analytics()` internally.

---

## Step 7: Test the New Event

### Manual test via Python WebSocket client

```python
import asyncio, json
import websockets

async def test_my_action():
    async with websockets.connect("ws://localhost:8000/api/v1/ws/live-chat") as ws:
        # Auth (dev mode: just send admin_id)
        await ws.send(json.dumps({"type": "auth", "payload": {"admin_id": "1"}}))
        print(await ws.recv())  # expect auth_success

        # Join a room
        await ws.send(json.dumps({"type": "join_room", "payload": {"line_user_id": "U1234abc"}}))
        print(await ws.recv())

        # Send your new event
        await ws.send(json.dumps({"type": "my_action", "payload": {"some_field": "value"}}))
        print(await ws.recv())  # expect my_action_result

asyncio.run(test_my_action())
```

### Unit test with pytest-asyncio

```python
from unittest.mock import AsyncMock, patch
import pytest

@pytest.mark.asyncio
async def test_my_action_handler():
    # Mock the service
    with patch("app.api.v1.endpoints.ws_live_chat.live_chat_service") as mock_svc:
        mock_svc.some_method = AsyncMock(return_value=mock_result)
        # ... test via TestClient or direct function call
```

---

## Common Issues

### `ValidationError` on WSEventType enum

**Cause:** Using `WSEventType.MY_ACTION` (enum member) where `.value` is expected.
**Fix:** Always use `WSEventType.MY_ACTION.value` in response dicts.

### Handler fires but DB changes don't persist

**Cause:** Missing `await db.commit()` after the service call.
**Fix:** Every `async with AsyncSessionLocal() as db:` block that modifies data must `await db.commit()` before exiting the `with` block.

### `broadcast_to_room` sends to empty room

**Cause:** The room key doesn't match — likely `"U1234abc"` instead of `"conversation:U1234abc"`.
**Fix:** `current_room` already has the `conversation:` prefix. Use `current_room` directly for broadcast and `current_room.replace("conversation:", "")` only when calling service methods.

### Session conflict (409) when claiming

**Cause:** Two operators sent `claim_session` simultaneously; optimistic lock failed.
**Fix:** `live_chat_service.claim_session()` raises `HTTPException(409)`. Catch it and send `WSErrorCode.INVALID_REQUEST` back to the operator.

### New event not recognized — falls through to `else` / unknown event

**Cause:** The `WSEventType` enum value was added but the `elif` block was not.
**Fix:** Both changes are required: enum in `ws_events.py` AND elif in `ws_live_chat.py`.

---

## Quality Checklist

Before finishing, verify:

- [ ] New event type added to `WSEventType` enum in `ws_events.py`
- [ ] Server→client response type also added to enum (if new)
- [ ] Payload schema added in `ws_events.py` and imported in `ws_live_chat.py`
- [ ] elif block includes auth guard (`if not admin_id`)
- [ ] elif block includes room guard (`if not current_room`) for conversation-scoped ops
- [ ] `await db.commit()` present inside every `AsyncSessionLocal()` that mutates
- [ ] `continue` after every error path (never fall through)
- [ ] `broadcast_to_room` uses `current_room` (with prefix), service calls use `.replace("conversation:", "")`
- [ ] Response uses `.value` on all `WSEventType` and `WSErrorCode` enum members
- [ ] Tested manually or with WebSocket client

---

*See `references/event_reference.md` for full WSEventType, WSErrorCode, ws_manager method, and live_chat_service method tables.*
