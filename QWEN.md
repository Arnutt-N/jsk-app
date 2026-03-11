# QWEN.md - SknApp Project Guide

> **For Qwen Code Agents**: This document provides essential context for working on the SknApp project - a LINE Official Account system with LIFF integration for Community Justice Services.

---

## 📋 Project Overview

**SknApp** (also known as **JskApp**) is a comprehensive LINE Official Account management system designed for Community Justice Services. It provides:

- **LINE Messaging API** integration with webhook processing
- **LIFF (LINE Frontend Framework)** mini-apps for service requests
- **Real-time live chat** with WebSocket support and operator handoff
- **Chatbot functionality** with intent matching and auto-replies
- **Rich menu management** and synchronization
- **Service request tracking** with Kanban-style workflow
- **Role-based access control (RBAC)** for multi-tier user management

### Key Statistics
- **Latest Version**: v1.6.0 (as of 2026-02-15)
- **Active Branch**: `fix/live-chat-redesign-issues`
- **Development Mode**: WSL2 required (Windows host + Linux execution)
- **Languages**: Thai (primary UI), English (secondary)

---

## 🏗️ Technology Stack

### Backend (FastAPI)
| Component | Technology | Version |
|-----------|------------|---------|
| Framework | FastAPI | ≥0.109.0 |
| Language | Python | 3.13+ |
| Database | PostgreSQL | 16 (via Docker) |
| Cache | Redis | 7 (via Docker) |
| ORM | SQLAlchemy | ≥2.0.25 (async) |
| Migrations | Alembic | ≥1.13.1 |
| Validation | Pydantic | V2 (≥2.5.0) |
| LINE SDK | line-bot-sdk | ≥3.0.0 |
| Auth | python-jose + passlib | JWT + bcrypt |
| Testing | pytest + pytest-asyncio | ≥8.0.0 |

### Frontend (Next.js)
| Component | Technology | Version |
|-----------|------------|---------|
| Framework | Next.js | 16.1.1 (App Router) |
| UI Library | React | 19.2.3 |
| Language | TypeScript | ≥5.x |
| Styling | Tailwind CSS | v4 |
| Icons | Lucide React | ≥0.473.0 |
| Charts | Recharts | ≥2.15.0 |
| LINE SDK | @line/liff | ≥2.27.3 |
| State | Zustand | ≥5.0.11 |
| Forms | react-hook-form + zod | ≥3.9.1 |

### Infrastructure
- **Containerization**: Docker Compose (PostgreSQL + Redis)
- **Host OS**: Windows 32-bit
- **Runtime**: WSL2 (Windows Subsystem for Linux)
- **Package Managers**: pip (backend), npm (frontend)

---

## 📁 Project Structure

```
skn-app/
├── backend/                      # FastAPI Backend
│   ├── app/
│   │   ├── api/
│   │   │   ├── deps.py           # Dependency injection
│   │   │   └── v1/
│   │   │       ├── api.py        # Router aggregation
│   │   │       └── endpoints/    # API endpoints
│   │   │           ├── webhook.py         # LINE webhook
│   │   │           ├── liff.py            # LIFF endpoints
│   │   │           ├── admin_live_chat.py # Live chat REST
│   │   │           ├── ws_live_chat.py    # WebSocket endpoint
│   │   │           ├── admin_requests.py  # Service requests
│   │   │           ├── admin_intents.py   # Chatbot intents
│   │   │           ├── admin_auto_replies.py
│   │   │           ├── rich_menus.py      # Rich menu mgmt
│   │   │           ├── admin_users.py
│   │   │           └── ...
│   │   ├── core/
│   │   │   ├── config.py         # Pydantic Settings
│   │   │   ├── line_client.py    # LINE SDK singleton
│   │   │   ├── websocket_manager.py
│   │   │   └── rate_limiter.py
│   │   ├── db/
│   │   │   ├── base.py           # SQLAlchemy Base
│   │   │   └── session.py        # Async Session factory
│   │   ├── models/               # SQLAlchemy models
│   │   │   ├── user.py           # User + RBAC
│   │   │   ├── service_request.py
│   │   │   ├── chat_session.py
│   │   │   ├── intent.py
│   │   │   └── ...
│   │   ├── schemas/              # Pydantic schemas
│   │   └── services/             # Business logic
│   ├── alembic/                  # DB migrations
│   ├── tests/                    # pytest tests
│   ├── requirements.txt
│   └── venv_linux/               # WSL virtual environment
│
├── frontend/                     # Next.js Frontend
│   ├── app/
│   │   ├── admin/                # Admin dashboard
│   │   │   ├── layout.tsx        # Admin sidebar layout
│   │   │   ├── page.tsx          # Dashboard home
│   │   │   ├── live-chat/        # Real-time chat UI
│   │   │   ├── requests/         # Service request mgmt
│   │   │   ├── chatbot/          # Chatbot config
│   │   │   ├── rich-menus/       # Rich menu editor
│   │   │   └── ...
│   │   ├── liff/                 # LIFF mini-apps
│   │   │   └── service-request/  # Service request form
│   │   ├── layout.tsx            # Root + Thai font
│   │   ├── page.tsx              # Landing page
│   │   └── globals.css           # Tailwind CSS v4
│   ├── components/
│   │   ├── ui/                   # Reusable components
│   │   └── admin/                # Admin components
│   ├── hooks/
│   │   ├── useLiveChatSocket.ts  # WebSocket hook
│   │   └── ...
│   ├── lib/
│   │   └── websocket/            # WebSocket utilities
│   ├── contexts/                 # React contexts
│   ├── types/                    # TypeScript types
│   └── package.json
│
├── .agent/                       # Agent Collaboration Hub
│   ├── INDEX.md                  # Skills & workflows index
│   ├── PROJECT_STATUS.md         # Current project status
│   ├── QUICK_START_CARD.md       # Quick reference
│   ├── skills/                   # Development standards
│   │   ├── cross_platform_collaboration/SKILL.md
│   │   ├── fastapi_enterprise/SKILL.md
│   │   ├── nextjs_enterprise/SKILL.md
│   │   ├── line_integration/SKILL.md
│   │   └── ...
│   ├── workflows/                # Step-by-step procedures
│   │   ├── start-here.md         # Entry workflow
│   │   ├── handoff-to-any.md     # Universal handoff
│   │   ├── pickup-from-any.md    # Universal pickup
│   │   └── ...
│   └── state/                    # Session state tracking
│       ├── current-session.json  # Machine-readable state
│       ├── task.md               # Current task
│       ├── TASK_LOG.md           # Append-only task history
│       ├── SESSION_INDEX.md      # Cross-platform index
│       └── checkpoints/          # Handoff checkpoints
│
├── project-log-md/               # Session summaries by platform
│   ├── claude_code/
│   ├── codeX/
│   ├── kimi_code/
│   ├── antigravity/
│   └── ...
│
├── PRPs/                         # Project proposals & plans
├── research/                     # Research documents
├── scripts/                      # Utility scripts
├── docs/                         # Documentation
├── examples/                     # Example code
├── secrets/                      # Secrets (git-ignored)
│
├── docker-compose.yml            # PostgreSQL + Redis
├── AGENT_PROMPT_TEMPLATE.md      # Universal agent entry
├── START_HERE.md                 # Friendly welcome guide
├── AGENTS.md                     # Technical project guide
└── QWEN.md                       # This file
```

---

## 🚀 Getting Started

### Prerequisites

**Required:**
- Python 3.13+
- Node.js 22+
- Docker Desktop (for PostgreSQL + Redis)
- WSL2 (Windows Subsystem for Linux)

**⚠️ CRITICAL**: This project **requires WSL2** for all development:
- Backend must run in WSL using `backend/venv_linux`
- Frontend must run in WSL
- Windows is the host OS, but execution happens in WSL

### Quick Start

#### 1. Start Infrastructure (Docker)
```bash
docker-compose up -d db redis
```

#### 2. Backend Setup (WSL)
```bash
# Navigate to backend
cd backend

# Create/activate virtual environment in WSL
python3.13 -m venv venv_linux
source venv_linux/bin/activate

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp app/.env.example app/.env
# Edit app/.env with your credentials

# Run database migrations
alembic upgrade head

# Start development server
uvicorn app.main:app --reload
```

**Backend runs at**: `http://localhost:8000`  
**API docs at**: `http://localhost:8000/api/v1/docs`

#### 3. Frontend Setup (WSL)
```bash
# Navigate to frontend
cd frontend

# Install dependencies
npm install

# Configure environment
cp .env.local.example .env.local

# Start development server
npm run dev
```

**Frontend runs at**: `http://localhost:3000`

---

## 🔧 Build & Test Commands

### Backend
```bash
cd backend
source venv_linux/bin/activate

# Run all tests
python -m pytest

# Run specific test file
python -m pytest tests/test_websocket.py -v

# Database migrations
alembic current                              # Check current version
alembic revision --autogenerate -m "desc"    # Generate migration
alembic upgrade head                         # Apply all migrations
alembic downgrade -1                         # Rollback one step

# Start server (production)
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

### Frontend
```bash
cd frontend

# Development
npm run dev                    # Start dev server (Turbopack)

# Build
npm run build                  # Production build
npm run start                  # Start production server

# Linting
npm run lint                   # ESLint checks
```

---

## 🌐 API Routes

All API routes are prefixed with `/api/v1`:

| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/line/webhook` | LINE webhook (signature validation) |
| GET/POST | `/liff/*` | LIFF app data endpoints |
| GET/POST/PUT/DELETE | `/admin/requests` | Service request CRUD |
| GET/POST | `/admin/live-chat` | Live chat REST endpoints |
| WS | `/ws/live-chat` | WebSocket for real-time chat |
| GET/POST/PUT/DELETE | `/admin/intents` | Chatbot intent management |
| GET/POST/PUT/DELETE | `/admin/rich-menus` | Rich menu management |
| GET/POST | `/admin/settings` | System configuration |
| GET/POST/PUT/DELETE | `/admin/users` | User management |

### WebSocket Events

**Client → Server:**
- `auth`: Authenticate connection
- `join_room`: Select conversation
- `send_message`: Send message to LINE user
- `typing_start` / `typing_stop`: Typing indicators
- `claim_session`: Operator claims waiting session
- `close_session`: End session

**Server → Client:**
- `new_message`: Incoming LINE message
- `message_sent`: Confirmation of sent message
- `message_ack`: Message delivery acknowledgment
- `typing_indicator`: Typing status update
- `session_claimed` / `session_closed`: Session state changes
- `presence_update`: Online operators list

---

## 💾 Database Design

### Key Models

**User Model:**
- `line_user_id`: For LINE users
- `username`: For admin login
- `role`: SUPER_ADMIN, ADMIN, AGENT, USER
- `chat_mode`: BOT or HUMAN (for live chat handoff)
- `friend_status`: LINE friend status tracking

**ServiceRequest Model:**
- Status: PENDING, IN_PROGRESS, AWAITING_APPROVAL, COMPLETED, REJECTED
- Priority: LOW, MEDIUM, HIGH, URGENT
- Thai address fields: province, district, sub_district
- Attachments stored as JSONB

**ChatSession Model:**
- Status: WAITING, ACTIVE, CLOSED
- Links operator to LINE user
- Tracks session duration

### Enums
```python
class UserRole(str, enum.Enum):
    SUPER_ADMIN = "SUPER_ADMIN"
    ADMIN = "ADMIN"
    AGENT = "AGENT"
    USER = "USER"

class ChatMode(str, enum.Enum):
    BOT = "BOT"
    HUMAN = "HUMAN"

class RequestStatus(str, enum.Enum):
    PENDING = "PENDING"
    IN_PROGRESS = "IN_PROGRESS"
    AWAITING_APPROVAL = "AWAITING_APPROVAL"
    COMPLETED = "COMPLETED"
    REJECTED = "REJECTED"
```

---

## 📝 Code Style Guidelines

### Backend (Python)

**Key Patterns:**

1. **Async by Default**: Use `async def` for all path operations and DB interactions
2. **Type Hints**: Use strict typing with Pydantic V2 models
3. **Never Return ORM Models**: Convert to Pydantic schemas using `model_validate`
4. **Dependency Injection**: Use `Depends()` for DB sessions and services

```python
# ✅ GOOD
@router.get("/users/{id}", response_model=UserResponse)
async def get_user(id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.id == id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user

# ❌ BAD - sync operation
@router.get("/users/{id}")
def get_user(id: int):  # Missing async
    return db.query(User).get(id)  # Sync ORM call
```

**LINE SDK Lazy Initialization:**
```python
class LineService:
    _api = None
    
    @property
    def api(self) -> AsyncMessagingApi:
        if self._api is None:
            self._api = get_line_bot_api()
        return self._api
```

### Frontend (TypeScript/React)

**Key Patterns:**

1. **Default to Server Components**: Fetch data in `page.tsx` or `layout.tsx`
2. **Use `"use client"` only for interactive leaves**: Buttons, forms, hooks
3. **Tailwind CSS v4**: Use `@import "tailwindcss"` in globals.css
4. **Zustand for State**: Prefer Zustand over Context for complex state

```typescript
// ✅ Server Component (default)
export default async function Page() {
  const data = await fetchData();
  return <Component data={data} />;
}

// ✅ Client Component (only when needed)
'use client';
export default function InteractiveComponent() {
  const [state, setState] = useState();
  return <button onClick={...}>Click</button>;
}
```

---

## 🔐 Security Considerations

1. **LINE Webhook Security**: All webhooks validate `x-line-signature` header
2. **LIFF Token Verification**: Always verify LIFF ID tokens on backend
3. **CORS**: Configured in `backend/app/core/config.py`
4. **Environment Variables**: Never commit secrets to git

### Required Environment Variables

**Backend (`backend/app/.env`):**
```env
DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/skn_app_db
SECRET_KEY=<jwt-secret>
LINE_CHANNEL_ACCESS_TOKEN=<messaging-api-token>
LINE_CHANNEL_SECRET=<messaging-api-secret>
LINE_LOGIN_CHANNEL_ID=<login-channel-id>
SERVER_BASE_URL=https://your-domain.com
```

**Frontend (`frontend/.env.local`):**
```env
NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1
```

---

## 🤖 Agent Collaboration System

This project includes a comprehensive **cross-platform agent collaboration system** in `.agent/`:

### Core Principles

**"State in Files, Not in Memory"**
- All state is stored in files (JSON/Markdown)
- Files are both machine-readable and human-readable
- All platforms read/write the same files

### Mandatory Handoff Artifacts

A handoff is **invalid** unless all 5 artifacts are updated:

1. **`.agent/PROJECT_STATUS.md`** - Project dashboard
2. **`.agent/state/current-session.json`** - Session state
3. **`.agent/state/task.md`** - Current task
4. **`.agent/state/checkpoints/handover-[platform]-[timestamp].json`** - Checkpoint
5. **`project-log-md/[platform]/session-summary-[timestamp].md`** - Summary

### Supported Platforms

| Platform | Code | Strengths |
|----------|------|-----------|
| Claude Code | `claude-code` | File ops, terminal commands |
| Kimi Code | `kimi_code` | Long-context, analysis |
| CodeX | `codex` | Code generation, translation |
| Antigravity | `antigravity` | Task management, context |
| Qwen | `qwen` | Bilingual (CN/EN), multi-language |
| Gemini | `gemini` | Multi-modal understanding |
| Kilo Code | `kilo_code` | Internal workflows |
| Open Code | `open_code` | Simple markdown workflows |

### Quick Reference

**Starting Work:**
```bash
# Read these in order:
cat .agent/PROJECT_STATUS.md
cat .agent/workflows/pickup-from-any.md
cat .agent/state/current-session.json
cat .agent/state/task.md
```

**Ending Work:**
```bash
# Follow handoff workflow:
cat .agent/workflows/handoff-to-any.md
# Create all 5 artifacts before leaving
```

**Finding Session Summaries:**
```bash
# Read SESSION_INDEX.md to find summaries from ALL platforms
cat .agent/state/SESSION_INDEX.md
```

---

## 📚 Additional Resources

### Documentation
- **`START_HERE.md`** - Friendly welcome guide for new agents
- **`AGENT_PROMPT_TEMPLATE.md`** - Universal agent entry prompt
- **`AGENTS.md`** - Comprehensive technical guide
- **`.agent/INDEX.md`** - Skills and workflows index
- **`.agent/QUICK_START_CARD.md`** - Quick reference card

### Skills (`.agent/skills/`)
- `fastapi_enterprise/SKILL.md` - FastAPI development standards
- `nextjs_enterprise/SKILL.md` - Next.js 16 + React 19 standards
- `line_integration/SKILL.md` - LINE webhook and LIFF guidelines
- `database_postgresql_standard/SKILL.md` - Database design patterns
- `api_development_standard/SKILL.md` - API design conventions
- `auth_rbac_security/SKILL.md` - Authentication and RBAC
- `testing_standards/SKILL.md` - Testing patterns
- `cross_platform_collaboration/SKILL.md` - Agent handoff protocols

### Workflows (`.agent/workflows/`)
- `start-here.md` - Universal entry workflow
- `pickup-from-any.md` - Resume work from any agent
- `handoff-to-any.md` - Hand off to any agent
- `run-app.md` - Start development servers
- `db-migration.md` - Database migration procedures
- `deploy-application.md` - Production deployment

---

## 🎯 Current Project Status

**As of 2026-02-15 23:00:**

- **Version**: v1.6.0
- **Branch**: `fix/live-chat-redesign-issues`
- **Status**: Phase 7 Implementation COMPLETE (27/27 steps, 100%)
- **Recent Work**: Live Chat UI Migration with Zustand state management

### Active Milestones

**Phase 7: Live Chat Refactoring** - COMPLETE
- Migrated from `slate-*` to `gray-*` color scheme
- Full component restyle with Zustand state
- Dark mode support implemented

**Next Steps:**
- Implement real JWT auth (replace DEV_MODE mock)
- Build operator list API for transfer dropdown
- Create PR from `fix/live-chat-redesign-issues` to `main`
- Test mobile viewports for MessageInput pickers

---

## 📞 Troubleshooting

### Common Issues

**Backend won't start:**
```bash
# Check WSL virtual environment
cd backend
source venv_linux/bin/activate
pip install -r requirements.txt
```

**Database connection errors:**
```bash
# Ensure Docker containers are running
docker-compose ps
docker-compose up -d db redis
```

**Frontend build errors:**
```bash
# Clear cache and rebuild
cd frontend
rm -rf node_modules .next
npm install
npm run dev
```

**Agent state inconsistencies:**
```bash
# Check latest checkpoint
ls -lt .agent/state/checkpoints/
# Read session index
cat .agent/state/SESSION_INDEX.md
```

---

## 📝 Notes

- **Language**: Thai (primary UI), English (secondary)
- **Font**: Noto Sans Thai for Thai text, Inter for English
- **Timezone**: Asia/Bangkok (UTC+7)
- **License**: Private - All Rights Reserved

---

*Last Updated: 2026-02-18 | Generated for Qwen Code Agents*
