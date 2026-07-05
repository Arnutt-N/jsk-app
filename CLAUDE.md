# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

JskApp is a LINE Official Account system with LIFF integration for Community Justice Services. It features a FastAPI backend with PostgreSQL/Redis and a Next.js 16 frontend with React 19 and TypeScript. Key features include service request management, chatbot with intent matching, live-chat operator handoff, rich menu configuration, broadcast messaging, file management, user management, analytics reports, and multi-platform integrations (Telegram, n8n).

## Development Commands

### Quick Start
```bash
docker-compose up -d db redis              # Start PostgreSQL and Redis
cd backend && python run.py --target local   # Backend: http://localhost:8000/api/v1/docs
cd frontend && npm run dev                   # Frontend: http://localhost:3000
```

### Backend (FastAPI)
```bash
cd backend
python3.13 -m venv venv_linux
source venv_linux/bin/activate
pip install -r requirements.txt
python run.py --target local
```

### Frontend (Next.js)
```bash
cd frontend
npm install
npm run dev
npm run lint         # ESLint on all files
npx eslint <file>    # Lint specific file(s)
npm run build        # Production build (tsc + next build)
npx tsc --noEmit     # Type-check only (faster than full build)
npx vitest run       # Run all unit tests (29 tests across 3 files)
npx vitest run --reporter=verbose  # Detailed test output
npx playwright test  # Run E2E tests (requires dev server running)
```

### Database Migrations (Alembic)
```bash
cd backend
python scripts/db_target.py show --target local
python scripts/db_target.py alembic --target local current
python scripts/db_target.py alembic --target local revision --autogenerate -m "desc"
python scripts/db_target.py alembic --target local upgrade head
python scripts/db_target.py alembic --target local downgrade -1
python scripts/db_target.py alembic --target remote upgrade head  # deploy/migrate Supabase
```

### Testing
```bash
cd backend
python -m pytest                             # Run all tests
python scripts/test_endpoint.py              # Basic endpoint test with default sample payload
python scripts/verify_db.py                  # Quick DB verification
python scripts/verify_schema_extended.py     # Check request-related schema additions
python scripts/verify_api.py                 # Quick HTTP probe against a running backend
```

## Architecture

### Backend (`backend/app/`)

```
api/
├── deps.py                 # Dependency injection (DB sessions, auth)
└── v1/endpoints/
    ├── webhook.py          # LINE webhook (signature validation, event routing)
    ├── liff.py             # LIFF app endpoints (token verification)
    ├── admin_requests.py   # Service request CRUD
    ├── admin_live_chat.py  # Live chat operator endpoints
    ├── admin_intents.py    # Chatbot intent management
    ├── admin_settings.py   # System configuration
    ├── admin_credentials.py # LINE credential management
    ├── admin_users.py      # User CRUD, roles, password reset
    ├── admin_friends.py    # Friend event history (follow/block/refollow)
    ├── admin_broadcast.py  # LINE broadcast create/schedule/send
    ├── admin_reports.py    # Analytics reports (5 tabs + CSV export)
    ├── admin_integrations.py # Telegram, n8n, custom integration settings
    └── media.py            # File upload/download, categories, public links

core/
├── config.py               # Settings from environment
├── security.py             # JWT, password hashing
└── line_client.py          # LINE SDK singleton (AsyncMessagingApi)

models/                     # SQLAlchemy async models
├── user.py                 # User with roles, chat_mode (BOT/HUMAN)
├── message.py              # Messages with direction (INCOMING/OUTGOING)
├── chat_session.py         # Live chat sessions (WAITING/ACTIVE/CLOSED)
├── service_request.py      # Service requests with JSONB details
├── credential.py           # LINE channel credentials
├── friend_event.py         # Follow/unfollow/block/refollow events
├── broadcast.py            # Broadcast messages with status lifecycle
└── media_file.py           # Files with categories and public tokens

services/
├── line_service.py         # LINE Messaging API wrapper
├── live_chat_service.py    # Chat handoff logic (initiate, claim, close)
├── telegram_service.py     # Telegram notifications for handoffs
├── flex_messages.py        # Flex message template builders
└── rich_menu_service.py    # Rich menu management
```

### Frontend (`frontend/`)

```
app/
├── admin/                  # Admin dashboard (server components default)
│   ├── layout.tsx          # Responsive sidebar, collapses <1024px
│   ├── live-chat/          # Full-screen live chat interface
│   ├── requests/           # Service request management
│   ├── chatbot/            # Intent and auto-reply config
│   ├── friends/            # LINE friends + history
│   ├── users/              # User management CRUD
│   ├── files/              # File management (categories, public links)
│   ├── reports/            # 5-tab analytics dashboard
│   └── settings/           # Settings hub (LINE/Telegram/n8n/Custom)
└── liff/                   # LINE LIFF mini-apps

components/
├── ui/                     # Reusable UI components
└── admin/                  # Admin-specific (ChatModeToggle, TypingIndicator)

hooks/
└── useGuardedUpdate.ts     # Prevents concurrent form submissions
                            # (theme state: components/providers/ThemeProvider.tsx)

lib/
└── constants/
    ├── categories.ts       # Shared category/subcategory constants (admin + LIFF)
    ├── agencies.ts         # Shared agency constants (admin + LIFF)
    ├── request-status.ts   # Status labels, variants, icons
    └── permissions.ts      # Role-based permission checks
```

### API Routes (prefix: `/api/v1`)

| Route | Purpose |
|-------|---------|
| `POST /line/webhook` | LINE webhook (validates x-line-signature) |
| `/liff/*` | LIFF data endpoints |
| `/admin/requests` | Service request CRUD |
| `/admin/live-chat` | Conversations, messages, session management |
| `/admin/intents` | Chatbot intent CRUD |
| `/admin/settings` | LINE credentials, system config |
| `/admin/users` | User CRUD, workload, password reset |
| `/admin/friends` | Friend history, stats, refollow tracking |
| `/admin/broadcasts` | Broadcast create/schedule/send |
| `/admin/reports` | Analytics: overview, requests, messages, operators, followers |
| `/admin/settings` (integrations) | Telegram, n8n, custom integration config |
| `/media`, `/admin/media` | File upload, categories, public link generation |

## Key Patterns

### Async Database Operations
All DB interactions use SQLAlchemy 2.0 async with `AsyncSession`. Never use sync operations.

```python
async def get_user(db: AsyncSession, user_id: int):
    result = await db.execute(select(User).where(User.id == user_id))
    return result.scalar_one_or_none()
```

### LINE Webhook Processing
- Signature validated via `WebhookParser` before processing
- Events processed in `BackgroundTasks` for fast response
- Supports MessageEvent and PostbackEvent handlers

### LINE SDK Lazy Initialization
LINE SDK `AsyncApiClient` requires an async event loop. Use lazy initialization:

```python
# In line_client.py - use get_line_bot_api() instead of module-level creation
from app.core.line_client import get_line_bot_api

# In services - use @property for lazy access
class LineService:
    @property
    def api(self) -> AsyncMessagingApi:
        if self._api is None:
            self._api = get_line_bot_api()
        return self._api
```

### Live Chat Flow
1. User triggers handoff → `live_chat_service.initiate_session()`
2. User's `chat_mode` set to HUMAN, session created as WAITING
3. Telegram notification sent to operators
4. Operator claims session → status becomes ACTIVE
5. Messages routed to operator instead of bot
6. Operator closes → `chat_mode` reverts to BOT

### LIFF Token Verification
Always verify LIFF ID tokens on backend. Never trust client-side decoded data.

```python
# In endpoint
line_user_id = await verify_liff_token(id_token)
```

### Shared Constants Pattern
Category, subcategory, and agency options are defined once in `frontend/lib/constants/` and imported by both admin pages and LIFF mini-apps. When adding or reordering options, update the constants file only — all consumers pick up the change. Tests in `lib/constants/__tests__/` verify ordering and validity.

```typescript
// In lib/constants/categories.ts — source of truth
export const CATEGORIES = [
  { value: 'แจ้งเบาะแสยาเสพติด', label: 'แจ้งเบาะแสยาเสพติด' },
  { value: 'ร้องเรียน/ร้องทุกข์', label: 'ร้องเรียน/ร้องทุกข์' },
  // ...
] as const;

// In admin create page — use spread to pass mutable copy to Select
import { CATEGORIES } from '@/lib/constants/categories';
<Select options={[...CATEGORIES]} />

// In LIFF pages — iterate AGENCIES constant instead of hardcoding <option>s
import { AGENCIES } from '@/lib/constants/agencies';
{AGENCIES.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
```

### Frontend Data Fetching
- Server components fetch data directly with fetch()
- Use `export const dynamic = 'force-dynamic'` for real-time data
- Live chat uses WebSocket for real-time updates with REST polling fallback

### WebSocket Live Chat

Real-time communication via WebSocket at `/api/v1/ws/live-chat`.

**Connect**: `ws://host/api/v1/ws/live-chat`

**Connection Flow**:
1. Client connects
2. Server accepts
3. Client sends `auth` message: `{"type": "auth", "payload": {"admin_id": "1"}}`
4. Server responds with `auth_success` + `presence_update`
5. Client can join rooms and send messages

**Events (Client → Server)**:
- `auth`: Authenticate connection
- `join_room`: Select conversation `{"payload": {"line_user_id": "U..."}}`
- `leave_room`: Deselect conversation
- `send_message`: Send to LINE user `{"payload": {"text": "..."}}`
- `typing_start/typing_stop`: Typing indicator
- `claim_session`: Operator claims waiting session
- `close_session`: End session, return user to bot
- `ping`: Keepalive

**Events (Server → Client)**:
- `auth_success/auth_error`: Auth result
- `new_message`: Incoming LINE message
- `message_sent`: Confirmation of sent message
- `typing_indicator`: User/operator typing
- `session_claimed/session_closed`: Session state changes
- `presence_update`: Online operators list
- `conversation_update`: Full conversation state
- `operator_joined/operator_left`: Room membership changes
- `error`: Error message
- `pong`: Keepalive response

**Room Structure**: `conversation:{line_user_id}`

**Key Files**:
- `backend/app/api/v1/endpoints/ws_live_chat.py` - WebSocket endpoint
- `backend/app/core/websocket_manager.py` - Connection manager
- `frontend/hooks/useLiveChatSocket.ts` - React hook for live chat
- `frontend/lib/websocket/client.ts` - WebSocket client

## Environment Variables

### Backend (`backend/.env`)
```
DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/sknapp
SECRET_KEY=<jwt-secret>
LINE_CHANNEL_ACCESS_TOKEN=<messaging-api-token>
LINE_CHANNEL_SECRET=<messaging-api-secret>
LINE_LOGIN_CHANNEL_ID=<login-channel-id>
SERVER_BASE_URL=https://your-domain.com  # Required for media URLs
ADMIN_URL=/admin  # For Telegram notification links
```

### Frontend (`frontend/.env.local`)
```
NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1
```

## Database Schema (Key Models)

### User Roles & Chat Mode
- `UserRole`: SUPER_ADMIN, ADMIN, AGENT, USER
- `ChatMode`: BOT (automated), HUMAN (operator handling)

### Message Direction
- `INCOMING`: From LINE user
- `OUTGOING`: From bot or operator

### Session Status
- `WAITING`: User waiting for operator
- `ACTIVE`: Operator handling conversation
- `CLOSED`: Session ended

## Git Workflow

Commit format: `<type>(<scope>): <description>`

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`

Example: `feat(live-chat): add operator typing indicator`

### CI Checks (run on push)
- **Frontend Lint & Build**: ESLint + `tsc --noEmit` + `next build`
- **Backend Pytest**: `python -m pytest`
- **Playwright Smoke**: E2E tests against Vercel preview deployment
- **Source Encoding Scan**: Checks for malformed UTF-8 / BOM issues
- **Vercel**: Preview deployment for PR review

### PRP Artifacts (`.claude/PRPs/`)
Feature work follows PRP (Planning-Review-Polish) structure:
- `prds/` — Feature specifications (e.g., `community-agencies-drug-reporting.prd.md`)
- `plans/` — Implementation plans with phases and tasks
- `reports/` — Completion reports with validation evidence
- `reviews/` — Code review artifacts (local reviews before commit, PR reviews)

## Agent skills

### Issue tracker

Issues and PRDs live as markdown files under `.scratch/<feature-slug>/` in this
repo (local-markdown tracker; external PRs are not a triage surface). See
`docs/agents/issue-tracker.md`.

### Triage labels

Five canonical triage roles using the default label strings (`needs-triage`,
`needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See
`docs/agents/triage-labels.md`.

### Domain docs

Single-context — one `CONTEXT.md` + `docs/adr/` at the repo root. See
`docs/agents/domain.md`.
