---
name: skn-api-patterns
description: >
  Covers API conventions and cross-cutting patterns in the SKN App backend —
  dependency injection (deps.py), Pydantic schema conventions, HTTP status codes,
  response shapes, pagination, and WebSocket health monitoring.
  Use when asked to "add auth to endpoint", "protect endpoint", "use get_current_admin",
  "get_current_user vs get_current_admin", "agent role 403", "dev bypass not working",
  "create a response schema", "from_attributes", "use_enum_values", "pydantic config",
  "class Config", "response model pattern", "pagination schema", "cursor vs offset",
  "what HTTP status to use", "404 vs 400", "websocket health monitor", "ws metrics",
  "เพิ่ม auth ให้ endpoint", "ป้องกัน endpoint", "สร้าง schema response",
  "pagination ใน FastAPI", "HTTP status code ที่ใช้".
  Do NOT use for new endpoint creation (skn-fastapi-endpoint), model changes
  (skn-data-models), or JWT token logic (skn-auth-security).
license: MIT
compatibility: >
  Claude Code with SKN App project.
  Requires: FastAPI, Pydantic v2, SQLAlchemy 2.0 async.
metadata:
  author: SKN App Team
  version: 1.0.0
  project: skn-app
  category: backend
  tags: [api, deps, pydantic, schema, auth, pagination, http-status, websocket-health]
  related-skills:
    - skn-fastapi-endpoint
    - skn-auth-security
    - skn-data-models
    - skn-core-runtime
  documentation: ./references/api_patterns_reference.md
---

# skn-api-patterns

Cross-cutting API conventions used throughout the SKN App backend:

1. **`api/deps.py`** — Dependency injection: `get_db`, `get_current_user`, `get_current_admin`.

2. **Pydantic schema conventions** — Naming, `class Config`, `from_attributes`, `use_enum_values`, schema composition.

3. **HTTP status codes** — Which codes are used for which situations in this project.

4. **Pagination patterns** — Offset pagination (admin lists) and cursor pagination (messages).

5. **`core/websocket_health.py`** — `ws_health_monitor` singleton: connection/message/latency metrics.

---

## CRITICAL: Project-Specific Rules

1. **`HTTPBearer(auto_error=False)` enables the dev bypass — never change it** —
   `security = HTTPBearer(auto_error=False)` is declared at module level in `deps.py`.
   The `auto_error=False` means missing/invalid Authorization headers return `None`
   instead of auto-raising 401. This allows `get_current_user` to fall through to the
   dev bypass. If changed to `auto_error=True`, ALL dev-mode requests without tokens
   will fail immediately with 401 before the bypass logic runs:
   ```python
   # CORRECT (current):
   security = HTTPBearer(auto_error=False)

   # WRONG — breaks dev bypass:
   security = HTTPBearer()  # auto_error=True by default
   ```

2. **`get_current_admin` rejects AGENT role — use `get_current_user` for agent-accessible endpoints** —
   `get_current_admin` only allows `UserRole.ADMIN` and `UserRole.SUPER_ADMIN`.
   Agents (role=AGENT) get `403 Insufficient permissions`. If an endpoint should be
   accessible to operators/agents (e.g., live chat operations), use `get_current_user`
   and check role yourself:
   ```python
   # Admin-only:
   current_user = Depends(get_current_admin)

   # Agent + Admin:
   current_user = Depends(get_current_user)
   if current_user.role not in [UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.AGENT]:
       raise HTTPException(status_code=403, detail="Insufficient permissions")
   ```

3. **Dev bypass looks up `user.id == 1` in DB — NOT a static mock object** —
   In `ENVIRONMENT=development`, `get_current_user` does `SELECT * FROM users WHERE id=1`.
   If no user exists, it creates one (`User(id=1, role=ADMIN)`) and commits.
   The returned `user` is a real SQLAlchemy object from the session. Endpoints that
   call `db.refresh(current_user)` after a commit will work correctly.

4. **All response schemas MUST have `class Config: from_attributes = True`** —
   SQLAlchemy model instances cannot be serialized by Pydantic without this setting.
   Every `XxxResponse` schema used as `response_model=` in a route must have it:
   ```python
   class MyResponse(BaseModel):
       id: int
       name: str
       class Config:
           from_attributes = True   # required for ORM serialization
   ```
   Forgetting this causes `PydanticSerializationError` at runtime.

5. **Use `use_enum_values=True` in Config for schemas with Enum fields** —
   Without this, Pydantic serializes enum instances as enum objects, not strings.
   JSON responses then contain `"status": "SessionStatus.WAITING"` instead of
   `"status": "WAITING"`:
   ```python
   class Config:
       from_attributes = True
       use_enum_values = True   # → "WAITING" not "SessionStatus.WAITING"
   ```

6. **Schema naming convention is `XxxBase` → `XxxCreate` → `XxxResponse`** —
   The project follows this hierarchy:
   ```
   XxxBase        — shared fields (no id, no timestamps)
   XxxCreate      — fields for POST requests (inherits Base, no id)
   XxxUpdate      — fields for PATCH requests (all Optional)
   XxxResponse    — output schema (id + timestamps, from_attributes=True)
   XxxListResponse — wraps List[XxxResponse] + pagination meta
   ```
   Not all levels exist for every model — omit levels that aren't needed.

7. **Pagination uses `skip`/`limit` (offset) for admin lists, `before_id` (cursor) for messages** —
   Admin list endpoints (`/admin/requests`, `/admin/users`) use:
   ```python
   skip: int = 0, limit: int = 50
   # SQL: .offset(skip).limit(limit)
   ```
   Message history endpoint uses cursor:
   ```python
   before_id: Optional[int] = None, limit: int = 50
   # SQL: .where(Message.id < before_id).order_by(Message.id.desc()).limit(limit)
   ```
   Never use `page`/`per_page` parameters — the project doesn't use page numbers.

8. **`json_schema_extra` documents Swagger examples — use for public LIFF endpoints** —
   LIFF endpoints (public-facing, no auth) include Swagger examples via `json_schema_extra`
   on the schema class `Config`. Admin endpoints typically don't bother. Add when a
   schema has many optional fields and the expected shape needs to be clear:
   ```python
   class Config:
       json_schema_extra = {"example": {"prefix": "นาย", "firstname": "สมชาย", ...}}
   ```

---

## File Structure

```
backend/app/
├── api/
│   └── deps.py               — get_db, get_current_user, get_current_admin
├── schemas/
│   ├── auth.py               — Token, TokenData, LoginRequest
│   ├── chat_session.py       — ChatSessionResponse, SessionStatus, ClosedBy
│   ├── live_chat.py          — ConversationSummary/Detail/List, SendMessageRequest
│   ├── message.py            — MessageResponse, MessageDirection, SenderRole
│   ├── service_request_liff.py — ServiceRequestCreate/Response, RequestCommentResponse
│   ├── intent.py             — IntentCategoryResponse, KeywordResponse
│   ├── reply_object.py       — ReplyObjectResponse, ReplyType
│   ├── auto_reply.py         — AutoReplyResponse, MatchType
│   ├── rich_menu.py          — RichMenuResponse, SystemSettingBase
│   ├── credential.py         — CredentialResponse, ProviderType
│   ├── friend_event.py       — FriendEventResponse, FriendEventListResponse
│   └── ws_events.py          — WebSocket event Pydantic models
└── core/
    └── websocket_health.py   — WebSocketHealthMonitor, WebSocketMetrics
```

---

## Step 1 — Protect an Endpoint

```python
from fastapi import APIRouter, Depends, HTTPException, status
from app.api import deps
from app.models.user import UserRole

router = APIRouter()

# Admin/SuperAdmin only:
@router.get("/admin/my-feature")
async def my_admin_endpoint(
    current_user = Depends(deps.get_current_admin),
    db = Depends(deps.get_db)
):
    ...

# Any authenticated user (USER/AGENT/ADMIN):
@router.get("/my-feature")
async def my_user_endpoint(
    current_user = Depends(deps.get_current_user),
    db = Depends(deps.get_db)
):
    ...

# Agent + Admin only (custom):
@router.post("/operator-action")
async def operator_endpoint(
    current_user = Depends(deps.get_current_user),
    db = Depends(deps.get_db)
):
    if current_user.role not in [UserRole.AGENT, UserRole.ADMIN, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Agents only")
    ...
```

---

## Step 2 — Create a Response Schema

```python
# backend/app/schemas/my_feature.py
from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional, List

class MyFeatureBase(BaseModel):
    name: str
    description: Optional[str] = None

class MyFeatureCreate(MyFeatureBase):
    pass   # fields for POST body

class MyFeatureUpdate(BaseModel):
    name: Optional[str] = None          # all Optional for PATCH
    description: Optional[str] = None

class MyFeatureResponse(MyFeatureBase):
    id: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True           # REQUIRED for ORM objects
        use_enum_values = True           # if any Enum fields

class MyFeatureListResponse(BaseModel):
    items: List[MyFeatureResponse]
    total: int
    # For cursor pagination: add next_cursor: Optional[int] = None
```

---

## Step 3 — Add Pagination to an Endpoint

```python
# Offset pagination (admin list endpoints):
@router.get("/admin/my-features", response_model=MyFeatureListResponse)
async def list_my_features(
    skip: int = 0,
    limit: int = 50,
    db: AsyncSession = Depends(deps.get_db),
    current_user = Depends(deps.get_current_admin)
):
    stmt = select(MyFeature).offset(skip).limit(limit)
    count_stmt = select(func.count(MyFeature.id))

    result = await db.execute(stmt)
    items = result.scalars().all()

    count_result = await db.execute(count_stmt)
    total = count_result.scalar()

    return {"items": items, "total": total}

# Cursor pagination (message history):
@router.get("/messages", response_model=MessageListResponse)
async def get_messages(
    line_user_id: str,
    before_id: Optional[int] = None,
    limit: int = 50,
    db: AsyncSession = Depends(deps.get_db)
):
    stmt = (
        select(Message)
        .where(Message.line_user_id == line_user_id)
        .order_by(Message.id.desc())
        .limit(limit)
    )
    if before_id:
        stmt = stmt.where(Message.id < before_id)
    ...
```

---

## Common Issues

### `PydanticSerializationError` when returning SQLAlchemy object
**Cause:** Missing `from_attributes = True` in response schema `Config`.
**Fix:** Add `class Config: from_attributes = True` to the schema.

### Enum values serialized as `"SessionStatus.WAITING"` instead of `"WAITING"`
**Cause:** Missing `use_enum_values = True` in schema `Config`.
**Fix:** Add `use_enum_values = True` to the `class Config` block.

### Agent user gets `403 Insufficient permissions` on admin endpoint
**Cause:** Endpoint uses `Depends(deps.get_current_admin)` which blocks AGENT role.
**Fix:** Switch to `Depends(deps.get_current_user)` and check role manually, or confirm
the endpoint should be admin-only.

### Dev bypass not working — getting 401 without token
**Cause 1:** `settings.ENVIRONMENT` is not `"development"` (check `backend/.env`).
**Cause 2:** `HTTPBearer` has `auto_error=True` — token absence raises 401 before bypass.
**Fix:** Set `ENVIRONMENT=development` in `backend/.env`.

---

## Quality Checklist

When creating or modifying schemas and endpoints:
- [ ] Response schemas have `class Config: from_attributes = True`
- [ ] Schemas with Enum fields have `use_enum_values = True`
- [ ] Admin-only endpoints use `Depends(deps.get_current_admin)`
- [ ] Agent-accessible endpoints use `Depends(deps.get_current_user)` + manual role check
- [ ] List endpoints use `skip`/`limit` (not `page`/`per_page`)
- [ ] Message/history endpoints use `before_id` cursor pagination
- [ ] New schemas follow `XxxBase` → `XxxCreate` → `XxxResponse` naming

## Additional Resources

See `references/api_patterns_reference.md` for:
- Complete `deps.py` function signatures
- HTTP status code usage table
- All schema files with their key types
- `WebSocketHealthMonitor` API reference
- Schema composition examples
