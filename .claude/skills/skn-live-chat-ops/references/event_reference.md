# Live Chat WS — Event & API Reference

Extracted from `backend/app/schemas/ws_events.py`, `ws_live_chat.py`, `websocket_manager.py`, and the `live_chat_service/` package (facade unchanged; split into mixins in PR #137).

---

## WSEventType Enum

All values are lowercase strings (the enum inherits from `str`).

### Client → Server Events

| Enum Member | Wire Value | Description |
|---|---|---|
| `AUTH` | `"auth"` | Authenticate with JWT token or admin_id (dev) |
| `JOIN_ROOM` | `"join_room"` | Watch a conversation (`line_user_id` required) |
| `LEAVE_ROOM` | `"leave_room"` | Stop watching a conversation |
| `SEND_MESSAGE` | `"send_message"` | Send text to a LINE user |
| `TYPING_START` | `"typing_start"` | Operator started typing |
| `TYPING_STOP` | `"typing_stop"` | Operator stopped typing |
| `CLAIM_SESSION` | `"claim_session"` | Claim a WAITING session |
| `CLOSE_SESSION` | `"close_session"` | Close session, return user to bot |
| `TRANSFER_SESSION` | `"transfer_session"` | Transfer to another operator |
| `SUBSCRIBE_ANALYTICS` | `"subscribe_analytics"` | Subscribe to analytics stream |
| `PING` | `"ping"` | Keepalive (rate limiter bypassed) |

### Server → Client Events

| Enum Member | Wire Value | Description |
|---|---|---|
| `AUTH_SUCCESS` | `"auth_success"` | Auth accepted, includes `admin_id` |
| `AUTH_ERROR` | `"auth_error"` | Auth rejected |
| `NEW_MESSAGE` | `"new_message"` | Incoming LINE message from user |
| `MESSAGE_SENT` | `"message_sent"` | Confirmation after `send_message` |
| `TYPING_INDICATOR` | `"typing_indicator"` | User or operator typing indicator |
| `SESSION_CLAIMED` | `"session_claimed"` | A session moved WAITING → ACTIVE |
| `SESSION_CLOSED` | `"session_closed"` | A session was closed |
| `SESSION_TRANSFERRED` | `"session_transferred"` | Session transferred to new operator |
| `PRESENCE_UPDATE` | `"presence_update"` | Online operator list changed |
| `CONVERSATION_UPDATE` | `"conversation_update"` | Full conversation state refresh |
| `OPERATOR_JOINED` | `"operator_joined"` | Another admin joined the room |
| `OPERATOR_LEFT` | `"operator_left"` | Another admin left the room |
| `ANALYTICS_UPDATE` | `"analytics_update"` | Real-time KPI data (subscribers only) |
| `SLA_ALERT` | `"sla_alert"` | SLA threshold warning broadcast |
| `ERROR` | `"error"` | Error response, includes `code` and `message` |
| `PONG` | `"pong"` | Keepalive response to `ping` |

---

## WSErrorCode Enum

All values are lowercase strings.

| Enum Member | Wire Value | When to Use |
|---|---|---|
| `AUTH_INVALID_TOKEN` | `"auth_invalid_token"` | JWT decode failed / signature invalid |
| `AUTH_EXPIRED_TOKEN` | `"auth_expired_token"` | JWT has expired |
| `AUTH_MISSING_TOKEN` | `"auth_missing_token"` | No token provided in auth event |
| `RATE_LIMIT_EXCEEDED` | `"rate_limit_exceeded"` | Too many messages per second |
| `VALIDATION_ERROR` | `"validation_error"` | Pydantic validation failed on payload |
| `INVALID_REQUEST` | `"invalid_request"` | Business logic error (e.g., session conflict) |
| `MESSAGE_TOO_LONG` | `"message_too_long"` | Text exceeds max message length |
| `NOT_AUTHENTICATED` | `"not_authenticated"` | Action attempted before auth |
| `NOT_IN_ROOM` | `"not_in_room"` | Operation requires active room, none joined |
| `SESSION_NOT_FOUND` | `"session_not_found"` | No active session for line_user_id |
| `INTERNAL_ERROR` | `"internal_error"` | Unexpected server-side exception |
| `UNKNOWN_EVENT` | `"unknown_event"` | msg_type not recognized in dispatch chain |

---

## Standard Message Shape

Every message (C→S and S→C) follows the same envelope:

```python
{
    "type": "event_type_value",       # WSEventType wire value (string)
    "payload": { ... },               # event-specific object (may be None)
    "timestamp": "2026-01-01T12:00:00.000Z"  # ISO 8601 UTC
}
```

---

## Payload Schemas (from `ws_events.py`)

```python
# C→S: auth
class AuthPayload(BaseModel):
    token: Optional[str] = None       # JWT token
    admin_id: Optional[str] = None    # dev mode bypass

# C→S: join_room / leave_room
class JoinRoomPayload(BaseModel):
    line_user_id: str

# C→S: send_message
class SendMessagePayload(BaseModel):
    text: str                          # max 2000 chars

# C→S: transfer_session
class TransferSessionPayload(BaseModel):
    to_operator_id: int
    reason: Optional[str] = None
```

---

## `ws_manager` Method Reference

Import: `from app.core.websocket_manager import ws_manager`

```python
# Connection lifecycle
await ws_manager.connect(websocket) -> str          # accept + return connection_id
await ws_manager.register(websocket, admin_id)      # register after auth
await ws_manager.disconnect(websocket)              # clean up on disconnect

# Room management
await ws_manager.join_room(websocket, room_id)      # add to room, fires operator_joined
await ws_manager.leave_room(websocket, room_id)     # remove from room, fires operator_left

# Send to specific target
await ws_manager.send_personal(websocket, data) -> bool      # one connection (one tab)
await ws_manager.send_to_admin(admin_id, data) -> bool       # all tabs of one admin

# Broadcast
await ws_manager.broadcast_to_room(room_id, data, exclude_admin=None) -> int
await ws_manager.broadcast_to_all(data)

# Analytics channel
await ws_manager.subscribe_analytics(websocket)
await ws_manager.unsubscribe_analytics(websocket)
await ws_manager.broadcast_analytics_update(data)
```

**Room naming convention:**
```python
room_id = f"conversation:{line_user_id}"           # e.g., "conversation:U1234abc5678"
line_user_id = current_room.replace("conversation:", "")
```

---

## `live_chat_service` Method Reference

Import: `from app.services.live_chat_service import live_chat_service`

All methods are `async` and require a `db: AsyncSession` (opened via `AsyncSessionLocal`).

```python
# Session lifecycle
await live_chat_service.claim_session(
    line_user_id: str,
    operator_id: int,
    db: AsyncSession
) -> ChatSession
# Raises HTTPException(409) if session already claimed

await live_chat_service.close_session(
    line_user_id: str,
    closed_by: ClosedBy,      # ClosedBy.OPERATOR | .USER | .SYSTEM | .SYSTEM_TIMEOUT
    db: AsyncSession
) -> ChatSession | None
# Side effects: sets user.chat_mode=BOT, sends CSAT survey

await live_chat_service.transfer_session(
    line_user_id: str,
    from_operator_id: int,
    to_operator_id: int,
    reason: str,
    db: AsyncSession
) -> ChatSession
# Raises ValueError if not active, wrong operator, or invalid target

# Query helpers
await live_chat_service.get_active_session(line_user_id: str, db) -> ChatSession | None
await live_chat_service.get_recent_messages(line_user_id: str, limit: int, db) -> list[Message]
await live_chat_service.get_queue_position(line_user_id: str, db) -> dict
# Returns: {"position": int, "total_waiting": int, "estimated_wait_minutes": int}

# Initiate handoff (from webhook, not WS)
await live_chat_service.initiate_handoff(user: User, reply_token: str, db) -> ChatSession
```

### `ClosedBy` Enum (from `app.models.chat_session`)

```python
from app.models.chat_session import ClosedBy

ClosedBy.OPERATOR       # operator clicked Close
ClosedBy.USER           # user left / cancelled
ClosedBy.SYSTEM         # automated close (e.g., timeout trigger)
ClosedBy.SYSTEM_TIMEOUT # inactivity timeout specifically
```

---

## SessionStatus Lifecycle

```python
from app.models.chat_session import SessionStatus

SessionStatus.WAITING    # Created, no operator assigned
SessionStatus.ACTIVE     # operator_id set, operator handling conversation
SessionStatus.CLOSED     # Conversation ended
```

State machine:
```
WAITING ──► ACTIVE ──► CLOSED
  │           │
  └──(expires after timeout)──► CLOSED (closed_by=SYSTEM_TIMEOUT)
```

---

## DB Access Pattern (inside WS handler)

```python
# CORRECT: open your own session per operation
async with AsyncSessionLocal() as db:
    result = await live_chat_service.some_method(line_user_id, int(admin_id), db)
    await db.commit()

# WRONG: do not use Depends(get_db) — not available in WS context
# WRONG: do not share one db session across multiple operations in the loop
```

Import: `from app.db.session import AsyncSessionLocal`

---

## Auth Pattern Inside WS

```python
# In the AUTH elif block:
if settings.ENVIRONMENT == "development" and not payload_token:
    # Dev mode: trust admin_id directly
    admin_id = str(auth_payload.admin_id)
else:
    # Production: decode JWT
    from app.core.security import verify_access_token
    decoded = verify_access_token(payload_token)
    admin_id = str(decoded.get("sub"))

await ws_manager.register(websocket, admin_id)
```

`admin_id` is always a string (even though DB IDs are int) — cast with `int(admin_id)` when passing to service methods.

---

## Rate Limiter

`ws_rate_limiter` checks are automatic in the main loop. You do NOT add rate limit checks inside your elif block. The limiter is reset on last-connection disconnect via `ws_manager.disconnect()`.

---

## Redis Pub/Sub (Cross-Server Broadcast)

You don't call `pubsub_manager` directly. Use `ws_manager.broadcast_to_room()` and `ws_manager.broadcast_to_all()` — they publish to Redis automatically. This supports horizontal scaling (multiple backend pods).

Pub/Sub channels:
- Room channel: `f"ws:room:{room_id}"` — for conversation-specific broadcasts
- Presence channel: `"ws:presence"` — for online operator list
- Broadcast channel: `"ws:broadcast"` — for all-admin messages
