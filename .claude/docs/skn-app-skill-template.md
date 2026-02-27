# SKN App — Comprehensive Skill Generation Template

> **Purpose:** Master template for creating Claude Skills for the JskApp project
> (LINE Official Account + LIFF + FastAPI + Next.js 16)
>
> **How to use:** Copy the relevant section, replace all `[PLACEHOLDER]` values, delete unused comments.
>
> **Last updated:** 2026-02-22 — Context7 MCP docs section added to all category templates

---

## Key Rules Learned from First Skill Build

These rules apply to **every** skill created for this project:

| Rule | Correct | Wrong |
|------|---------|-------|
| **SKILL.md language** | English throughout | Thai or mixed |
| **`description` triggers** | English + Thai phrases allowed | Thai only |
| **Router prefix/tags** | Set only in `api.py` at `include_router()` | Never in `router = APIRouter()` |
| **Auth dev bypass** | `settings.ENVIRONMENT == "development"` | `DEV_MODE = true` (does not exist) |
| **DB query result** | `.scalar_one_or_none()` / `.scalars().all()` | `.first()` (sync pattern) |
| **Commit cycle** | `commit()` → `refresh(obj)` → `return obj` | Returning without refresh |
| **Context7 docs** | Add `## Context7 Docs` section with category-specific library list | Omitting the section entirely |

---

## Part 1: Core SKILL.md Template

> The **entire SKILL.md file must be written in English** — instructions, comments, step descriptions, and error messages.
> Thai is only allowed inside the `description` YAML field for trigger phrases.

```markdown
---
name: [kebab-case-skill-name]
description: >
  [What the skill does — 1-2 clear sentences in English].
  Use when asked to "[trigger phrase 1]", "[trigger phrase 2]",
  "[Thai trigger phrase]", "[Thai trigger phrase 2]",
  or when the user needs [specific outcome].
  Do NOT use for [negative scope — be explicit].
license: MIT
compatibility: >
  Claude Code with SKN App project.
  Requires: FastAPI backend on localhost:8000,
  Next.js frontend on localhost:3000,
  PostgreSQL + Redis via docker-compose.
metadata:
  author: SKN App Team
  version: 1.0.0
  project: skn-app
  category: [backend | frontend | line-integration | websocket | devops]
  tags: [tag1, tag2]
---

# [Skill Display Name]

[1-2 sentences: what this skill does and why it is useful for the project.]

---

## CRITICAL: Project-Specific Rules

These rules are non-negotiable and must be followed every time:

1. **[Rule 1]** — [exact constraint]
2. **[Rule 2]** — [exact constraint]
3. **[Rule 3]** — [exact constraint]

---

## Context7 Docs

Context7 MCP is active in this project (`.mcp.json`). Use it before writing code
to verify current library APIs — especially for version-specific patterns.

**Relevant libraries:** *(fill in from the matching category template in Part 2)*

| Library | Resolve Name | Key Topics |
|---|---|---|
| [Library] | `"[resolve-name]"` | [specific topics] |

Usage: call `mcp__context7__resolve-library-id` with `libraryName`, then call
`mcp__context7__get-library-docs` with the returned `context7CompatibleLibraryID`,
a `topic` string, and `tokens=5000`.

When to use: version-specific breaking changes (SQLAlchemy 1→2, Tailwind v3→v4,
linebot v2→v3), or any API detail not covered in the skill body.

---

## Step 1: [First Major Step]

[Clear explanation of what to do.]

```[language]
# Example code or command
[example]
```

**Expected output:** [what success looks like]

## Step 2: [Second Step]

[Explanation.]

**Validation:** Confirm [condition] before proceeding.

## Step 3: [Third Step]

[Explanation.]

---

## Examples

### Example 1: [Most common scenario]

**User says:** "[example user input]"

**Actions:**
1. [action 1]
2. [action 2]
3. [action 3]

**Result:** [expected outcome]

### Example 2: [Edge case or variant]

**User says:** "[alternative input]"

**Actions:**
1. [action 1]
2. [action 2]

**Result:** [outcome]

---

## Common Issues

### [Error message or symptom 1]
**Cause:** [why it happens]
**Fix:**
```bash
[command or code fix]
```

### [Error message or symptom 2]
**Cause:** [why it happens]
**Fix:** [solution]

---

## Quality Checklist

Before finishing, verify:
- [ ] [quality criterion 1]
- [ ] [quality criterion 2]
- [ ] No `any` types in TypeScript (frontend skills)
- [ ] Every DB call uses `await` (backend skills)
- [ ] Semantic design tokens used, not raw Tailwind colors (frontend skills)
```

---

## Part 2: Category-Specific Templates

---

### Category A: Backend (FastAPI)

**Relevant files:**
```
backend/app/
├── api/v1/api.py        ← Register all routers here
├── api/v1/endpoints/    ← New endpoint files go here
├── api/deps.py          ← get_db, get_current_user, get_current_admin
├── models/              ← SQLAlchemy async models
├── schemas/             ← Pydantic schemas
├── services/            ← Business logic
└── core/audit.py        ← @audit_action decorator
```

**YAML frontmatter:**
```yaml
---
name: skn-[feature]-backend
description: >
  Creates/modifies FastAPI backend for [feature] in SKN App (JskApp).
  Use when asked to "create endpoint", "add API route", "new backend API",
  "create CRUD for [resource]", "เพิ่ม endpoint", "สร้าง API", "เพิ่ม route".
  Do NOT use for WebSocket endpoints or LINE webhook handlers.
compatibility: SKN App FastAPI backend, Python 3.11+, SQLAlchemy 2.0 async
metadata:
  category: backend
  tags: [fastapi, sqlalchemy, postgresql, async]
---
```

**SKILL.md body template (English):**
```markdown
## CRITICAL: Backend Rules

1. **Always async** — every function and DB operation must use `async/await`
2. **No prefix/tags on router** — applied only in `api.py` at `include_router()` time
3. **Query pattern:** `result = await db.execute(select(...))` → `.scalar_one_or_none()`
4. **Commit cycle:** `await db.commit()` → `await db.refresh(obj)` → `return obj`
5. **Auth in dev:** bypass is automatic via `settings.ENVIRONMENT == "development"` in `deps.py`
6. **Register in api.py:** every new router must be imported and included there

## Context7 Docs

Context7 MCP is active. Use before writing SQLAlchemy 2.0 async or Pydantic v2 code.

| Library | Resolve Name | Key Topics |
|---|---|---|
| FastAPI | `"fastapi"` | dependencies, response models, background tasks |
| SQLAlchemy | `"sqlalchemy"` | async session, select, insert, update |
| Pydantic | `"pydantic"` | v2 validators, model_config, field_validator |
| Alembic | `"alembic"` | autogenerate, async env, upgrade/downgrade |

Usage: `mcp__context7__resolve-library-id libraryName="sqlalchemy"` →
`mcp__context7__get-library-docs context7CompatibleLibraryID="..." topic="async session" tokens=5000`

## Step 1: Create SQLAlchemy Model (if needed)

File: `backend/app/models/[resource].py`

\```python
from sqlalchemy import Column, Integer, String, DateTime, Enum
from sqlalchemy.sql import func
import enum
from app.db.base import Base

class [Resource]Status(str, enum.Enum):
    ACTIVE = "ACTIVE"
    INACTIVE = "INACTIVE"

class [Resource](Base):
    __tablename__ = "[resources]"
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    status = Column(Enum([Resource]Status), default=[Resource]Status.ACTIVE, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
\```

## Step 2: Create Pydantic Schemas

File: `backend/app/schemas/[resource].py`

\```python
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime

class [Resource]Create(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)

class [Resource]Update(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=255)

class [Resource]Response([Resource]Create):
    id: int
    created_at: datetime
    updated_at: Optional[datetime] = None
    class Config:
        from_attributes = True
        use_enum_values = True
\```

## Step 3: Create Endpoint File

File: `backend/app/api/v1/endpoints/admin_[resource].py`

\```python
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Any
from app.api import deps
from app.models.[resource] import [Resource]
from app.schemas.[resource] import [Resource]Create, [Resource]Update, [Resource]Response

router = APIRouter()  # No prefix or tags here

@router.get("", response_model=List[[Resource]Response])
async def list_[resources](db: AsyncSession = Depends(deps.get_db)) -> Any:
    result = await db.execute(select([Resource]).order_by([Resource].created_at.desc()))
    return result.scalars().all()

@router.get("/{id}", response_model=[Resource]Response)
async def get_[resource](id: int, db: AsyncSession = Depends(deps.get_db)) -> Any:
    result = await db.execute(select([Resource]).where([Resource].id == id))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="[Resource] not found")
    return item

@router.post("", response_model=[Resource]Response, status_code=status.HTTP_201_CREATED)
async def create_[resource](data: [Resource]Create, db: AsyncSession = Depends(deps.get_db)) -> Any:
    item = [Resource](**data.model_dump())
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return item

@router.patch("/{id}", response_model=[Resource]Response)
async def update_[resource](id: int, data: [Resource]Update, db: AsyncSession = Depends(deps.get_db)) -> Any:
    result = await db.execute(select([Resource]).where([Resource].id == id))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="[Resource] not found")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(item, field, value)
    await db.commit()
    await db.refresh(item)
    return item

@router.delete("/{id}", status_code=204)
async def delete_[resource](id: int, db: AsyncSession = Depends(deps.get_db)) -> None:
    result = await db.execute(select([Resource]).where([Resource].id == id))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="[Resource] not found")
    await db.delete(item)
    await db.commit()
    return None
\```

## Step 4: Register in api.py

In `backend/app/api/v1/api.py`, add two lines:

\```python
# In the import block:
from app.api.v1.endpoints import admin_[resource]

# In the include_router block (before ws_live_chat and health):
api_router.include_router(admin_[resource].router, prefix="/admin/[resources]", tags=["admin"])
\```

## Step 5: Run Alembic Migration (if new model)

\```bash
cd backend
alembic revision --autogenerate -m "add [resource] table"
alembic upgrade head
\```

## Common Issues

### `greenlet_spawn has not been called`
**Cause:** Sync SQLAlchemy operation inside async context.
**Fix:** Ensure every DB call uses `await db.execute(...)`.

### Model not detected by Alembic
**Cause:** Model not imported into base metadata.
**Fix:** Check `backend/app/db/base.py` — model must be imported there.
```

---

### Category B: Frontend (Next.js + React)

**Relevant files:**
```
frontend/
├── app/admin/           ← Admin pages (server components by default)
├── app/liff/            ← LIFF mini-apps
├── components/ui/       ← Reusable UI components
├── components/admin/    ← Admin-specific (SidebarItem, ChatModeToggle…)
├── _store/              ← Zustand stores
├── hooks/               ← Custom React hooks
└── lib/                 ← Utilities, websocket client
```

**YAML frontmatter:**
```yaml
---
name: skn-[feature]-frontend
description: >
  Creates/modifies Next.js frontend components for [feature] in SKN App admin.
  Use when asked to "create component", "add admin page", "build UI for [feature]",
  "สร้าง component", "เพิ่ม UI", "สร้าง หน้า admin".
  Do NOT use for backend endpoints or LINE webhook handlers.
compatibility: SKN App frontend, Next.js 16, React 19, Tailwind CSS v4, Zustand
metadata:
  category: frontend
  tags: [nextjs, react, tailwind, zustand, typescript]
---
```

**SKILL.md body template (English):**
```markdown
## CRITICAL: Frontend Rules

1. **Semantic tokens always** — never use raw Tailwind colors:
   - Backgrounds: `bg-surface`, `bg-surface-elevated`
   - Text: `text-text-primary`, `text-text-secondary`, `text-text-tertiary`
   - Borders: `border-border-default`, `border-border-strong`
   - Brand: `bg-brand-primary`, `text-brand-primary`

2. **Sidebar is always dark** — `bg-[#0f172a]` with gradient `from-slate-900 via-[#1e1b4b] to-[#172554]`
   - Active nav item: use `.gradient-active` CSS class
   - Nav links: use `SidebarItem` component (`components/admin/SidebarItem.tsx`)

3. **Navbar** — use `.glass-navbar` class only; never set bg/border manually

4. **Heights** — sidebar logo area `h-20`, navbar `h-20` (must match)

5. **State pattern** — read state from Zustand selectors, API methods from Context:
   \```typescript
   const messages = useLiveChatStore(state => state.messages)
   const { sendMessage } = useContext(LiveChatContext)
   // closure-safe access in callbacks:
   const store = useLiveChatStore.getState()
   \```

6. **No `any` types** — always define proper interfaces for props and API responses

7. **Verification** — no `npm test`; use `npm run lint` + `npx tsc --noEmit` + `npm run build`

## Context7 Docs

Context7 MCP is active. Use before writing Tailwind v4, Next.js 16, or React 19 code.

| Library | Resolve Name | Key Topics |
|---|---|---|
| Next.js | `"nextjs"` | app router, server components, route handlers |
| React | `"react"` | hooks, forwardRef, use() API |
| Tailwind CSS | `"tailwindcss"` | v4 config, utility changes, @layer |
| class-variance-authority | `"class-variance-authority"` | cva(), VariantProps |
| Zustand | `"zustand"` | create, subscribeWithSelector, getState |

Usage: `mcp__context7__resolve-library-id libraryName="nextjs"` →
`mcp__context7__get-library-docs context7CompatibleLibraryID="..." topic="server components" tokens=5000`
```

---

### Category C: LINE Integration

**Relevant files:**
```
backend/app/
├── api/v1/endpoints/webhook.py    ← LINE webhook (signature validation + event routing)
├── api/v1/endpoints/liff.py       ← LIFF token verification endpoints
├── services/line_service.py       ← LINE Messaging API wrapper
├── services/flex_messages.py      ← Flex message template builders
└── services/rich_menu_service.py  ← Rich menu management
```

**YAML frontmatter:**
```yaml
---
name: skn-line-[feature]
description: >
  Manages LINE integration for [feature] in SKN App.
  Use when asked to "create flex message", "configure rich menu",
  "modify webhook handler", "debug LINE event", "LIFF [action]",
  "สร้าง flex message", "ตั้งค่า rich menu", "debug LINE event".
compatibility: SKN App, LINE Messaging API v3, LIFF SDK 2.x
metadata:
  category: line-integration
  tags: [line, webhook, liff, flex-message, rich-menu]
---
```

**SKILL.md body template (English):**
```markdown
## CRITICAL: LINE Integration Rules

1. **Webhook must process in BackgroundTasks** — always return fast, process async
2. **Always verify LIFF tokens on backend** — never trust client-side decoded data
3. **Use lazy initialization for LINE SDK** — `get_line_bot_api()` not module-level instance

## Context7 Docs

Context7 MCP is active. Use before writing linebot v3 SDK or Flex Message code.

| Library | Resolve Name | Key Topics |
|---|---|---|
| LINE Bot SDK (Python) | `"line-bot-sdk-python"` | FlexMessage, FlexContainer, QuickReply |
| LINE Messaging API | `"line-messaging-api"` | Flex component schemas, rate limits |

Usage: `mcp__context7__resolve-library-id libraryName="line-bot-sdk-python"` →
`mcp__context7__get-library-docs context7CompatibleLibraryID="..." topic="FlexMessage v3" tokens=5000`

## Webhook Pattern
\```python
@router.post("/webhook")
async def webhook(request: Request, background_tasks: BackgroundTasks):
    body = await request.body()
    signature = request.headers.get("x-line-signature", "")
    # validate signature first, then:
    background_tasks.add_task(process_events, events)
    return {"status": "ok"}
\```

## LIFF Token Verification
\```python
line_user_id = await verify_liff_token(id_token)
# Never trust client-decoded data — always verify on backend
\```

## Live Chat Handoff Flow
1. User triggers handoff → `live_chat_service.initiate_session()`
2. `chat_mode` set to HUMAN, session status = WAITING
3. Telegram notification sent to operators
4. Operator claims → status = ACTIVE
5. Messages routed to operator instead of bot
6. Operator closes → `chat_mode` reverts to BOT
```

---

### Category D: WebSocket & Real-time

**Relevant files:**
```
backend/app/
├── api/v1/endpoints/ws_live_chat.py  ← WebSocket endpoint (elif event chain)
└── core/websocket_manager.py         ← Connection manager + room management

frontend/
├── hooks/useLiveChatSocket.ts        ← React WebSocket hook
└── lib/websocket/client.ts           ← WebSocket client
```

**YAML frontmatter:**
```yaml
---
name: skn-websocket-[feature]
description: >
  Develops/modifies WebSocket real-time features for [feature] in SKN App.
  Use when asked to "add WebSocket event", "modify real-time [feature]",
  "debug WebSocket", "create [feature] notification",
  "เพิ่ม WebSocket event", "แก้ไข real-time".
compatibility: SKN App, WebSocket at /api/v1/ws/live-chat, Redis Pub/Sub
metadata:
  category: websocket
  tags: [websocket, redis, real-time, live-chat]
---
```

**SKILL.md body template (English):**
```markdown
## CRITICAL: WebSocket Rules

1. **Room format:** always `conversation:{line_user_id}`
2. **Backend events:** add new events to the `elif` chain in `ws_live_chat.py`
3. **Frontend events:** subscribe in `useLiveChatSocket.ts`, dispatch to Zustand store

## Context7 Docs

Context7 MCP is active. Use before writing FastAPI WebSocket or SQLAlchemy async code.

| Library | Resolve Name | Key Topics |
|---|---|---|
| FastAPI | `"fastapi"` | websocket, WebSocket class, accept/send/receive |
| Starlette | `"starlette"` | WebSocketDisconnect, WebSocket state |
| SQLAlchemy | `"sqlalchemy"` | async session, AsyncSessionLocal pattern |

Usage: `mcp__context7__resolve-library-id libraryName="fastapi"` →
`mcp__context7__get-library-docs context7CompatibleLibraryID="..." topic="websocket" tokens=5000`

## Adding a New Backend Event
\```python
# In ws_live_chat.py — add to elif chain
elif event_type == "your_new_event":
    payload = data.get("payload", {})
    await manager.send_to_room(room_id, {
        "type": "your_response_event",
        "payload": result
    })
\```

## Adding a New Frontend Event
\```typescript
// In useLiveChatSocket.ts
socket.on('your_response_event', (data) => {
  useLiveChatStore.getState().handleYourEvent(data)
})
\```

## WebSocket Event Reference
Client → Server: `auth`, `join_room`, `leave_room`, `send_message`,
  `typing_start`, `typing_stop`, `claim_session`, `close_session`, `ping`

Server → Client: `auth_success`, `auth_error`, `new_message`, `message_sent`,
  `typing_indicator`, `session_claimed`, `session_closed`, `presence_update`,
  `conversation_update`, `operator_joined`, `operator_left`, `pong`, `error`
```

---

### Category E: DevOps & Database

**YAML frontmatter:**
```yaml
---
name: skn-devops-[task]
description: >
  Manages infrastructure and database operations for SKN App.
  Use when asked to "migrate database", "debug docker", "set up environment",
  "run alembic", "fix migration", "migrate database", "สร้าง migration".
compatibility: SKN App, Docker Compose, PostgreSQL, Redis, Alembic
metadata:
  category: devops
  tags: [docker, postgresql, redis, alembic, migration]
---
```

**SKILL.md body template (English):**
```markdown
## Environment Variables

Backend (`backend/.env`):
\```
DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/sknapp
SECRET_KEY=<jwt-secret>
LINE_CHANNEL_ACCESS_TOKEN=<token>
LINE_CHANNEL_SECRET=<secret>
LINE_LOGIN_CHANNEL_ID=<id>
SERVER_BASE_URL=https://your-domain.com
ADMIN_URL=/admin
\```

Frontend (`frontend/.env.local`):
\```
NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1
\```

## Quick Start
\```bash
docker-compose up -d db redis
cd backend && uvicorn app.main:app --reload   # port 8000
cd frontend && npm run dev                    # port 3000
\```

## Alembic Migration Workflow
\```bash
cd backend
alembic current                              # check current version
alembic revision --autogenerate -m "desc"    # generate migration
alembic upgrade head                         # apply
alembic downgrade -1                         # rollback one step
\```

## Frontend Verification (no npm test)
\```bash
cd frontend
npm run lint          # ESLint check
npx tsc --noEmit      # TypeScript check
npm run build         # full build test
\```
```

---

## Part 3: Complete YAML Frontmatter Reference

```yaml
---
# ─── REQUIRED ───────────────────────────────────────────────────────────────
name: skn-[feature-name]         # kebab-case only, matches folder name
description: >                   # MUST contain both WHAT and WHEN
  [What the skill does — English, 1-2 sentences].
  Use when asked to "[English trigger]", "[English trigger]",
  "[Thai trigger]", "[Thai trigger]",
  or when the user needs [specific outcome].
  Do NOT use for [negative scope].

# ─── OPTIONAL ────────────────────────────────────────────────────────────────
license: MIT

allowed-tools: "Bash(python:*) Bash(npm:*) Bash(npx:*) WebFetch"
# Bash(python:*) = run python scripts
# Bash(npm:*)    = run npm commands
# Bash(npx:*)    = run npx commands

compatibility: >
  Claude Code, SKN App project.
  Backend: Python 3.11+, FastAPI, SQLAlchemy 2.0 async.
  Frontend: Node.js 18+, Next.js 16, React 19.
  Services: PostgreSQL, Redis (via docker-compose).

metadata:
  author: SKN App Team
  version: 1.0.0
  project: skn-app
  category: backend | frontend | line-integration | websocket | devops
  tags:
    - [tag1]
    - [tag2]
  related-skills:
    - [other-skill-name]
  documentation: ./references/[doc-file].md
---
```

---

## Part 4: Folder Structure

```
.claude/skills/
├── skn-[feature]-backend/
│   ├── SKILL.md                  # Main skill — English only
│   ├── references/
│   │   ├── patterns.md           # Real code snippets from codebase
│   │   └── api-guide.md          # API reference notes
│   └── scripts/                  # Optional: validation helpers
│
├── skn-[feature]-frontend/
│   ├── SKILL.md                  # Main skill — English only
│   ├── references/
│   │   ├── design-tokens.md      # Semantic token reference
│   │   └── component-patterns.md # Component code examples
│   └── assets/                   # Optional: starter templates
│       └── component-template.tsx
│
├── skn-line-[feature]/
│   ├── SKILL.md
│   └── references/
│       ├── webhook-events.md
│       └── flex-message-spec.md
│
└── skn-websocket-[feature]/
    ├── SKILL.md
    └── references/
        └── ws-events.md
```

---

## Part 5: Test Cases Template

```markdown
## Test Cases for [Skill Name]

### Triggering Tests

**Should trigger:**
- "[clear English trigger phrase]"
- "[paraphrased English trigger]"
- "[Thai trigger phrase]"

**Should NOT trigger:**
- "[unrelated query 1]"
- "[close but out-of-scope query]"

### Functional Tests

**Test 1: Basic case**
```
Given: [context]
When:  [user request]
Then:
  - [expected outcome 1]
  - [expected outcome 2]
  - No TypeScript errors (frontend)
  - No SQLAlchemy warnings (backend)
```

**Test 2: Edge case**
```
Given: [context]
When:  [edge case request]
Then:  [expected handling]
```

### Performance Baseline

| Metric | Without Skill | With Skill | Target |
|--------|--------------|------------|--------|
| Back-and-forth messages | ~10 | ~2 | ≤3 |
| Failed attempts | ~2 | 0 | 0 |
| Time to complete | ~15 min | ~3 min | ≤5 min |
```

---

## Part 6: Skill Roadmap

### Priority 1 — High Impact, High Frequency
| Skill Name | Category | Status | Trigger Examples |
|-----------|----------|--------|----------------|
| `skn-fastapi-endpoint` | Backend | **DONE** ✅ | "create endpoint", "add API route", "สร้าง API" |
| `skn-admin-component` | Frontend | **DONE** ✅ | "create component", "add admin page", "สร้าง component" |
| `skn-line-flex-builder` | LINE | **DONE** ✅ | "create flex message", "สร้าง flex message" |

### Priority 2 — Specialized Workflows
| Skill Name | Category | Status | Trigger Examples |
|-----------|----------|--------|----------------|
| `skn-live-chat-ops` | WebSocket | **DONE** ✅ | "add live chat feature", "เพิ่ม event ใน live chat" |
| `skn-intent-manager` | LINE | **DONE** ✅ | "create intent", "สร้าง intent", "bot ไม่ตอบ" |
| `skn-migration-helper` | DevOps | **DONE** ✅ | "migrate database", "create alembic migration" |

### Priority 3 — Advanced
| Skill Name | Category | Status | Trigger Examples |
|-----------|----------|--------|----------------|
| `skn-webhook-handler` | LINE | **DONE** ✅ | "add webhook event", "handle follow event", "เพิ่ม special command" |
| `skn-line-service-ops` | LINE | **DONE** ✅ | "send LINE message", "push to user", "LINE circuit open", "ส่ง flex message" |
| `skn-auth-security` | Backend | **DONE** ✅ | "add auth", "JWT error", "create admin", "audit log", "เพิ่ม auth" |
| `skn-webhook-debugger` | LINE | **DONE** ✅ | "debug webhook", "test LINE event" |
| `skn-rich-menu-builder` | LINE | **DONE** ✅ | "create rich menu", "ตั้งค่า LINE menu" |
| `skn-performance-audit` | DevOps | **DONE** ✅ | "audit performance", "find slow queries" |
| `skn-service-request` | Backend | **DONE** ✅ | "add service request field", "fix request stats", "assign request", "add comment", "send status flex" |
| `skn-settings-config` | Backend | **DONE** ✅ | "add LINE config", "add Telegram config", "store API key securely", "register credential API", "ENCRYPTION_KEY" |
| `skn-user-management` | Backend | **DONE** ✅ | "create admin user", "JWT login", "refresh token", "operator workload", "สร้าง admin user", "login ไม่ได้" |
| `skn-analytics-audit` | Backend | **DONE** ✅ | "add KPI", "live KPI dashboard", "operator performance", "audit log", "track admin action", "ดู audit log" |
| `skn-operator-tools` | Backend | **DONE** ✅ | "add canned response", "create shortcut", "tag user", "LINE friend list", "เพิ่ม canned response", "ติด tag" |
| `skn-liff-data` | Backend | **DONE** ✅ | "LIFF form submission", "province list", "district cascade", "upload attachment", "LIFF ส่งฟอร์ม", "ดึงจังหวัด" |
| `skn-reply-auto` | Backend | **DONE** ✅ | "create reply object", "$flex_traffic", "auto-reply rule", "export conversation CSV", "สร้าง reply object", "export บทสนทนา" |
| `skn-live-chat-frontend` | Frontend | **DONE** ✅ | "add live chat feature", "modify chat UI", "canned response picker", "typing indicator", "optimistic message", "เพิ่มฟีเจอร์ live chat", "แก้ไข chat UI" |
| `skn-liff-form` | Frontend | **DONE** ✅ | "add LIFF form field", "add topic category", "fix LIFF SDK init", "LIFF form not submitting", "แก้ไขฟอร์ม LIFF", "เพิ่มหัวข้อคำร้อง", "dropdown จังหวัด" |
| `skn-admin-requests` | Frontend | **DONE** ✅ | "add filter to requests list", "modify request detail page", "add request status", "fix kanban", "request assignment", "เพิ่มฟิลเตอร์คำร้อง", "แก้ไขหน้าจัดการคำร้อง", "มอบหมายคำร้อง" |
| `skn-rich-menu-frontend` | Frontend | **DONE** ✅ | "add rich menu template", "modify rich menu create page", "add area action type", "fix rich menu image upload", "เพิ่ม template rich menu", "แก้ไขหน้าสร้าง rich menu" |
| `skn-chatbot-frontend` | Frontend | **DONE** ✅ | "add intent category", "edit keyword", "add response type", "fix reply object form", "เพิ่ม category chatbot", "แก้ไข keyword intent", "เพิ่ม response type", "แก้ reply object" |
| `skn-analytics-frontend` | Frontend | **DONE** ✅ | "add KPI card", "add chart", "modify analytics dashboard", "add audit filter", "fix operator table", "เพิ่ม KPI card", "แก้ไข dashboard analytics", "เพิ่มฟิลเตอร์ audit" |
| `skn-admin-overview` | Frontend | **DONE** ✅ | "modify LINE settings", "add connect validation", "fix admin home", "add report card", "fix friends list", "แก้หน้าตั้งค่า LINE", "แก้หน้าหลัก admin", "เพิ่มรายงาน" |
| `skn-ui-library` | Frontend | **DONE** ✅ | "add button", "use Badge/Card/Modal/Input/Select", "use AdminSearchFilterBar", "add StatsCard", "use SidebarItem", "use PageHeader", "use useTheme", "use useSessionTimeout", "ใช้ component Button/Badge/Card", "เพิ่ม StatsCard", "ใช้ Modal ยืนยัน" |
| `skn-app-shell` | Frontend | **DONE** ✅ | "add menu to admin sidebar", "add page to nav", "modify admin layout", "fix auth", "add login", "use useWebSocket", "add MessageType", "เพิ่มเมนู sidebar", "แก้ layout admin", "เพิ่ม menu admin", "แก้ websocket client" |
| `skn-backend-infra` | Backend | **DONE** ✅ | "add new router", "register endpoint in api.py", "fix api.py", "health check", "backend startup sequence", "CORS config", "/uploads static files", "fix friends page 404", "admin_friends not registered", "login page", "reports page", "เพิ่ม router ใหม่", "ลงทะเบียน endpoint" |
| `skn-core-runtime` | Backend | **DONE** ✅ | "check business hours", "send CSAT", "CSAT postback", "SLA alert", "SLA threshold", "add handoff keyword", "use redis_client", "use AsyncSessionLocal", "session cleanup timeout", "session auto-close", "rate limiter", "settings env var", "เช็คเวลาทำการ", "handoff keyword ภาษาไทย", "ส่ง CSAT", "auto close session" |
| `skn-data-models` | Backend | **DONE** ✅ | "add field to model", "add new model", "what fields does User have", "Booking model", "Organization model", "add FK", "JSONB field", "models/__init__.py", "alembic autogenerate empty", "resolve media URL", "url_utils", "LINE image broken", "strip flex body", "เพิ่ม field ใน model", "สร้าง model ใหม่" |
| `skn-devtools` | DevOps | **DONE** ✅ | "start docker", "seed admin", "create admin user", "run tests", "write a test", "test WebSocket", "conftest", "TestClient", "drain_auth_responses", "debug routes", "verify DB", "hashed_secret not working", "seed_admin_sync wrong DB", "docker-compose", "รัน tests", "เริ่ม Docker", "seed ข้อมูล admin" |
| `skn-api-patterns` | Backend | **DONE** ✅ | "add auth to endpoint", "protect endpoint", "get_current_user vs get_current_admin", "agent role 403", "dev bypass not working", "create a response schema", "from_attributes", "use_enum_values", "class Config", "pagination schema", "cursor vs offset", "what HTTP status to use", "websocket health monitor", "ws metrics", "เพิ่ม auth ให้ endpoint", "สร้าง schema response", "pagination ใน FastAPI" |
| `skn-design-system` | Frontend | **DONE** ✅ | "use semantic tokens", "fix token usage", "add scrollbar class", "Thai text style", "status color", "badge color for waiting/active/closed", "sidebar gradient", "glass navbar", "live chat bubble", "status dot", "message bubble", "design system rules", "never touch list", "available components", "add design token", "table page recipe", "focus-ring", "toast-slide", "thai-no-break", "thai-text", "ใช้ semantic token", "สี status", "หน้า admin ใหม่" |

---

## Part 7: Quick Start Checklist

**Phase 1: Planning**
- [ ] Identify 2-3 concrete use cases
- [ ] Define trigger phrases (both English and Thai)
- [ ] Choose category (A–E above)
- [ ] Define success criteria

**Phase 2: Development**
- [ ] Copy the matching category template
- [ ] Replace all `[PLACEHOLDER]` values
- [ ] Folder name is kebab-case: `skn-[feature]-[category]`
- [ ] YAML has opening and closing `---` delimiters
- [ ] `name` matches folder name
- [ ] `description` has WHAT + WHEN + negative scope (English + Thai triggers)
- [ ] **SKILL.md body is entirely in English**
- [ ] Instructions are specific and actionable
- [ ] Error handling covers SKN App common failure modes
- [ ] `references/patterns.md` includes real code from the codebase
- [ ] `## Context7 Docs` section present with relevant libraries for the category

**Phase 3: Testing**
- [ ] Triggers on obvious phrases
- [ ] Triggers on paraphrased phrases (English and Thai)
- [ ] Does NOT trigger on unrelated queries
- [ ] Functional output is correct
- [ ] Tested in live Claude Code session

**Phase 4: Deploy**
- [ ] Placed in `.claude/skills/[skill-name]/`
- [ ] `metadata.version` set
- [ ] Skill appears in Claude Code system reminder
- [ ] Roadmap table above updated (Status → DONE ✅)

---

*Template for JskApp — based on "The Complete Guide to Building Skills for Claude" (Anthropic, 2026)*
*First skill completed: `skn-fastapi-endpoint` (2026-02-22)*
*Second skill completed: `skn-admin-component` (2026-02-22)*
*Third skill completed: `skn-line-flex-builder` (2026-02-22)*
*Fourth skill completed: `skn-live-chat-ops` (2026-02-22)*
*Fifth skill completed: `skn-intent-manager` (2026-02-22)*
