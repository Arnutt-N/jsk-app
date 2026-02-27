# API Patterns — Reference

Sources: `backend/app/api/deps.py`, `backend/app/schemas/*.py`,
`backend/app/core/websocket_health.py`

---

## `deps.py` — Dependency Functions

```python
from app.api import deps

# DB session (all endpoints):
db: AsyncSession = Depends(deps.get_db)

# Any authenticated user (USER / AGENT / ADMIN / SUPER_ADMIN):
current_user = Depends(deps.get_current_user)

# Admin or SuperAdmin only (AGENT → 403):
current_user = Depends(deps.get_current_admin)
```

### `get_current_user` — Flow

```
Request arrives with/without Authorization: Bearer <token>
              │
              ▼
  credentials = HTTPBearer(auto_error=False)
              │
   ┌──── no credentials? ────┐
   │                         │
ENVIRONMENT==development?  token provided
   │ YES                     │
   │                         ▼
   │            verify_token(token) → payload
   │                         │
   ▼              payload["type"] == "access"?
DB lookup: User.id==1        │ YES
(create mock if missing)     ▼
   │              DB lookup: User.id == int(payload["sub"])
   │                         │
   └────────────►  return user
```

### `get_current_admin` — Role Check

```python
if current_user.role not in [UserRole.ADMIN, UserRole.SUPER_ADMIN]:
    raise HTTPException(403, "Insufficient permissions")
```

Roles allowed: `ADMIN`, `SUPER_ADMIN`
Roles blocked: `AGENT`, `USER` → 403

---

## HTTP Status Codes — Project Usage

| Code | Situation | Example |
|---|---|---|
| `200` | Success, resource returned | GET list, GET detail |
| `201` | Resource created | POST create (some endpoints use 200) |
| `204` | Success, no content | DELETE |
| `400` | Invalid input / business rule violation | "Invalid status value", "keyword exists" |
| `401` | Not authenticated | No/expired token |
| `403` | Authenticated but forbidden | Agent accessing admin endpoint |
| `404` | Resource not found | "Request not found", "User not found" |
| `409` | Conflict / duplicate | "Shortcut already exists" (canned responses) |
| `500` | Internal server error | Unhandled exception |

**Note:** The project uses `HTTPException(status_code=400)` for both input validation
AND business logic violations (not always 422). Endpoint-level Pydantic validation
automatically returns 422.

---

## Schema Conventions

### Naming Pattern

```
MyFeatureBase         — shared mutable fields, no id/timestamps
MyFeatureCreate       — input for POST (inherits Base or standalone)
MyFeatureUpdate       — input for PATCH (all fields Optional)
MyFeatureResponse     — output (id + timestamps + from_attributes=True)
MyFeatureListResponse — wraps List[MyFeatureResponse] + total
MyFeatureDetail       — extends Response with nested/eager-loaded relations
```

### Required `class Config`

| Setting | When Required | Effect |
|---|---|---|
| `from_attributes = True` | All Response schemas | Enables ORM object serialization |
| `use_enum_values = True` | Schemas with Enum fields | Serializes `"WAITING"` not `"SessionStatus.WAITING"` |
| `json_schema_extra` | Public LIFF endpoints | Adds Swagger example in docs |

**Style note:** All schemas use old-style `class Config:` (Pydantic v1 compat mode).
Do NOT use `model_config = ConfigDict(...)` — it's not used anywhere in the project.

### Schema Composition

```python
# Simple inheritance (add fields to parent):
class ConversationDetail(ConversationSummary):
    messages: List[MessageResponse]   # adds messages to existing summary fields

# Response wraps ORM output with extra computed field:
class ServiceRequestResponse(ServiceRequestCreate):
    id: int
    assignee_name: Optional[str] = None   # computed, not in DB column
    created_at: datetime
    class Config:
        from_attributes = True
```

---

## Pagination Reference

### Offset Pagination (admin list endpoints)

```python
# Parameters: skip=0, limit=50
# SQL: .offset(skip).limit(limit)

# Response shape:
class XxxListResponse(BaseModel):
    items: List[XxxResponse]
    total: int          # COUNT(*) for full dataset
    # optional extras: waiting_count, active_count, etc.
```

Used by: `/admin/requests`, `/admin/users`, `/admin/intents`, `/admin/audit/logs`

### Cursor Pagination (message history)

```python
# Parameters: before_id=None, limit=50
# SQL: .where(Message.id < before_id).order_by(Message.id.desc()).limit(limit)

# Response shape: List[MessageResponse] (no total)
# Frontend: prependMessages() (not setMessages()) when loading older history
```

Used by: `GET /admin/live-chat/{line_user_id}/messages`

---

## All Schema Files — Key Types

| File | Key Types |
|---|---|
| `auth.py` | `Token(access_token, token_type)`, `LoginRequest(username, password)` |
| `chat_session.py` | `ChatSessionResponse`, `SessionStatus(WAITING/ACTIVE/CLOSED)`, `ClosedBy` |
| `live_chat.py` | `ConversationSummary/Detail/List`, `SendMessageRequest`, `ModeToggleRequest` |
| `message.py` | `MessageResponse`, `MessageDirection(INCOMING/OUTGOING)`, `SenderRole` |
| `service_request_liff.py` | `ServiceRequestCreate/Response`, `RequestCommentResponse` |
| `intent.py` | `IntentCategoryResponse`, `IntentKeywordResponse`, `IntentResponseResponse` |
| `reply_object.py` | `ReplyObjectResponse(object_id: str)`, `ReplyObjectCreate/Update` |
| `auto_reply.py` | `AutoReplyResponse`, `MatchType`, `ReplyType` |
| `rich_menu.py` | `RichMenuResponse`, `SystemSettingBase`, `SystemSettingUpdate` |
| `credential.py` | `CredentialResponse`, `CredentialCreate`, `ProviderType` |
| `friend_event.py` | `FriendEventResponse`, `FriendEventListResponse(events, total)` |
| `ws_events.py` | `WSMessage`, `WSAuthPayload`, `WSJoinRoomPayload`, etc. |

---

## `websocket_health.py` — API Reference

```python
from app.core.websocket_health import ws_health_monitor

# Record events (called inside ws_live_chat.py):
ws_health_monitor.record_connection(admin_id)
ws_health_monitor.record_disconnection(admin_id)
ws_health_monitor.record_message_sent()
ws_health_monitor.record_message_received()
ws_health_monitor.record_error()
ws_health_monitor.record_latency(ms: float)

# Get health status (used by health.py /health/websocket):
status: dict = await ws_health_monitor.get_health_status()
```

### `WebSocketMetrics` fields

| Field | Type | Description |
|---|---|---|
| `total_connections` | int | Cumulative connections since startup |
| `active_connections` | int | Currently connected clients |
| `messages_sent` | int | Total messages sent to clients |
| `messages_received` | int | Total messages received from clients |
| `errors` | int | Total error events |
| `avg_latency_ms` | float | Rolling average latency |
| `peak_connections` | int | Historical maximum concurrent connections |
| `peak_latency_ms` | float | Worst latency recorded |
| `total_messages` | int | `messages_sent + messages_received` |
| `start_time` | float | `time.time()` at initialization |

`ws_health_monitor` is a module-level singleton — imported and used directly.
Latency samples are kept up to 1000 (rolling window); connection history up to 100 entries.

---

## Known Gaps

| ID | Gap | Location | Severity |
|---|---|---|---|
| GAP-1 | No `get_current_agent` dep — agent-accessible endpoints require manual role check | `deps.py` | Low |
| GAP-2 | `get_current_admin` missing `AGENT` role — operators can't use endpoints that should allow them | `deps.py` | Medium |
| GAP-3 | Dev mock user (`id=1`) has `role=UserRole.ADMIN` hardcoded — changing role in DB doesn't affect mock | `deps.py` | Low |
| GAP-4 | Old-style `class Config:` used everywhere — migration to Pydantic v2 `model_config` deferred | `schemas/*.py` | Info |
| GAP-5 | `ws_health_monitor` metrics are in-memory only — reset on every app restart | `websocket_health.py` | Low |
