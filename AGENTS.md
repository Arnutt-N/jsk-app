# AGENTS.md - JskApp (SknApp) Project Guide

> **For AI Coding Agents**: This document contains essential information about the JskApp project structure, technology stack, and development conventions. Read this first before making any changes.

---

## Project Overview

**JskApp** (also known as **SknApp**) is a LINE Official Account system with LIFF (LINE Frontend Framework) integration, designed for Community Justice Services. It provides a comprehensive chatbot solution with service request management, live chat operator handoff, and rich menu configuration.

### Key Features
- LINE Messaging API integration with webhook processing
- LIFF mini-apps for service request forms
- Real-time live chat with WebSocket support
- Chatbot with intent matching and auto-replies
- Rich menu management and synchronization
- Service request tracking with Kanban view
- Role-based access control (RBAC)

---

## Technology Stack

### Backend
| Component | Technology | Version |
|-----------|------------|---------|
| Framework | FastAPI | 0.109+ |
| Language | Python | 3.13+ |
| Database | PostgreSQL | 16+ |
| Cache | Redis | 7+ |
| ORM | SQLAlchemy | 2.0+ (async) |
| Migrations | Alembic | 1.13+ |
| Validation | Pydantic | V2 |
| LINE SDK | line-bot-sdk | 3.0+ |

### Frontend
| Component | Technology | Version |
|-----------|------------|---------|
| Framework | Next.js | 16.1+ |
| UI Library | React | 19.2+ |
| Language | TypeScript | 5.x |
| Styling | Tailwind CSS | v4 |
| Icons | Lucide React | Latest |
| Charts | Recharts | 2.15+ |
| LINE SDK | @line/liff | 2.27+ |

---

## Project Structure

```
sk-app/
├── backend/                    # FastAPI Backend
│   ├── app/
│   │   ├── api/
│   │   │   ├── deps.py         # Dependency injection (DB sessions, auth)
│   │   │   └── v1/
│   │   │       ├── api.py      # Router aggregation
│   │   │       └── endpoints/
│   │   │           ├── webhook.py         # LINE webhook handler
│   │   │           ├── liff.py            # LIFF endpoints
│   │   │           ├── admin_requests.py  # Service request CRUD
│   │   │           ├── admin_live_chat.py # Live chat REST endpoints
│   │   │           ├── ws_live_chat.py    # WebSocket endpoint
│   │   │           ├── admin_intents.py   # Chatbot intent management
│   │   │           ├── admin_auto_replies.py
│   │   │           ├── admin_reply_objects.py
│   │   │           ├── rich_menus.py      # Rich menu management
│   │   │           ├── admin_users.py
│   │   │           ├── settings.py
│   │   │           ├── media.py
│   │   │           └── locations.py       # Geography data
│   │   ├── core/
│   │   │   ├── config.py       # Pydantic Settings
│   │   │   ├── line_client.py  # LINE SDK singleton
│   │   │   ├── websocket_manager.py  # WebSocket connection manager
│   │   │   └── rate_limiter.py # Rate limiting
│   │   ├── db/
│   │   │   ├── base.py         # SQLAlchemy Base
│   │   │   └── session.py      # Async Session factory
│   │   ├── models/             # SQLAlchemy models
│   │   │   ├── user.py         # User with roles, chat_mode
│   │   │   ├── service_request.py
│   │   │   ├── message.py
│   │   │   ├── chat_session.py
│   │   │   ├── intent.py
│   │   │   ├── rich_menu.py
│   │   │   ├── credential.py
│   │   │   └── ...
│   │   ├── schemas/            # Pydantic schemas
│   │   │   └── ...
│   │   └── services/           # Business logic
│   │       ├── line_service.py
│   │       ├── live_chat_service.py
│   │       ├── rich_menu_service.py
│   │       └── ...
│   ├── alembic/                # Database migrations
│   ├── tests/                  # pytest tests
│   ├── requirements.txt
│   └── alembic.ini
│
├── frontend/                   # Next.js Frontend
│   ├── app/
│   │   ├── admin/              # Admin dashboard
│   │   │   ├── layout.tsx      # Admin sidebar layout
│   │   │   ├── page.tsx        # Dashboard
│   │   │   ├── live-chat/      # Real-time chat interface
│   │   │   ├── requests/       # Service request management
│   │   │   ├── chatbot/        # Chatbot configuration
│   │   │   ├── auto-replies/   # Auto-reply management
│   │   │   ├── reply-objects/  # Reply object library
│   │   │   ├── rich-menus/     # Rich menu editor
│   │   │   ├── users/          # User management
│   │   │   └── settings/       # System settings
│   │   ├── liff/               # LIFF mini-apps
│   │   │   ├── service-request/     # Service request form
│   │   │   └── service-request-single/  # Single-page version
│   │   ├── layout.tsx          # Root layout with Thai font
│   │   ├── page.tsx            # Landing page
│   │   └── globals.css         # Tailwind CSS entry
│   ├── components/
│   │   ├── ui/                 # Reusable UI components
│   │   └── admin/              # Admin-specific components
│   ├── hooks/
│   │   ├── useLiveChatSocket.ts    # WebSocket hook for live chat
│   │   ├── useWebSocket.ts         # Generic WebSocket hook
│   │   └── useTheme.ts
│   ├── lib/
│   │   └── websocket/          # WebSocket client utilities
│   ├── next.config.js
│   └── package.json
│
├── docker-compose.yml          # PostgreSQL + Redis
└── .agent/                     # Agent collaboration system
    ├── INDEX.md                # Skills & workflows index
    ├── PROJECT_STATUS.md       # Current project status
    ├── skills/                 # Development standards (16 skills)
    └── workflows/              # Step-by-step procedures
```

---

## Development Environment

> **⚠️ CRITICAL**: This project requires **WSL (Windows Subsystem for Linux)** for all development.
> - Backend must run in WSL using `backend/venv_linux`
> - Frontend must run in WSL
> - Windows is the host OS, but execution happens in WSL

### Prerequisites
- Python 3.13+
- Node.js 20+
- PostgreSQL 16+ (via Docker)
- Redis 7+ (via Docker)
- WSL2 (for Windows development)

### Environment Setup

#### 1. Start Infrastructure (Docker)
```bash
docker-compose up -d db redis
```

#### 2. Backend Setup
```bash
cd backend

# Create virtual environment in WSL (required)
python3.13 -m venv venv_linux
source venv_linux/bin/activate

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp app/.env.example app/.env
# Optional: copy .env.development.example or .env.production.example to .env
# Edit the env file(s) with your credentials

# Run migrations
python scripts/db_target.py show --target local
python scripts/db_target.py alembic --target local upgrade head

# Start server
python run.py --target local
```
Backend runs at: `http://localhost:8000`
API Docs at: `http://localhost:8000/api/v1/docs`

#### 3. Frontend Setup
```bash
cd frontend

# Install dependencies
npm install

# Configure environment
cp .env.local.example .env.local

# Start dev server
npm run dev
```
Frontend runs at: `http://localhost:3000`

---

## Build and Test Commands

### Backend
```bash
cd backend

# Run tests
python -m pytest

# Run specific test file
python -m pytest tests/test_websocket.py

# Database migrations
python scripts/db_target.py show --target local
python scripts/db_target.py alembic --target local current
python scripts/db_target.py alembic --target local revision --autogenerate -m "description"
python scripts/db_target.py alembic --target local upgrade head
python scripts/db_target.py alembic --target local downgrade -1
python scripts/db_target.py alembic --target remote upgrade head   # Apply to Supabase/remote

# Start server (production)
python run.py --target remote --no-reload --host 0.0.0.0 --port 8000
```

### Frontend
```bash
cd frontend

# Development
npm run dev                        # Start dev server with hot reload

# Build
npm run build                      # Production build
npm run start                      # Start production server

# Linting
npm run lint                       # Run ESLint
```

---

## API Routes

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

## Code Style Guidelines

### Backend (Python)

1. **Async by Default**: Use `async def` for all path operations and DB interactions
2. **Type Hints**: Use strict typing with Pydantic V2 models
3. **Never Return ORM Models**: Convert to Pydantic schemas using `model_validate`
4. **Dependency Injection**: Use `Depends()` for DB sessions and services

```python
# GOOD
@router.get("/users/{id}", response_model=UserResponse)
async def get_user(id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.id == id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user

# BAD - sync operation
@router.get("/users/{id}")
def get_user(id: int):  # Missing async
    return db.query(User).get(id)  # Sync ORM call
```

### Frontend (TypeScript/React)

1. **Default to Server Components**: Fetch data in `page.tsx` or `layout.tsx`
2. **Use `"use client"` only for interactive leaves**: Buttons, forms, hooks
3. **Tailwind CSS v4**: Use `@import "tailwindcss"` in globals.css

```typescript
// Server Component (default)
export default async function Page() {
  const data = await fetchData();
  return <Component data={data} />;
}

// Client Component (only when needed)
'use client';
export default function InteractiveComponent() {
  const [state, setState] = useState();
  return <button onClick={...}>Click</button>;
}
```

---

## Database Design

### Key Models

**User Model:**
- `line_user_id`: For LINE users
- `username`: For admin login
- `role`: SUPER_ADMIN, ADMIN, AGENT, USER
- `chat_mode`: BOT or HUMAN (for live chat handoff)
- `friend_status`: LINE friend status tracking

**ServiceRequest Model:**
- Request tracking with status: PENDING, IN_PROGRESS, AWAITING_APPROVAL, COMPLETED, REJECTED
- Priority levels: LOW, MEDIUM, HIGH, URGENT
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

## Testing Instructions

### Backend Tests
Tests are located in `backend/tests/` using pytest.

```bash
cd backend
python -m pytest                    # Run all tests
python -m pytest -v                 # Verbose output
python -m pytest tests/test_websocket.py  # Specific file
```

Current test coverage includes:
- WebSocket connection and authentication
- WebSocket message handling
- Ping/pong heartbeat
- Error handling

### Frontend Testing
```bash
cd frontend
npm run lint                        # ESLint checks
```

---

## Security Considerations

1. **LINE Webhook Security**: All webhooks validate `x-line-signature` header
2. **LIFF Token Verification**: Always verify LIFF ID tokens on backend
3. **CORS**: Configured in `backend/app/core/config.py`
4. **Environment Variables**: Never commit secrets to git
   - Backend default target: `backend/.env`
   - Backend local override: `backend/app/.env`
   - Frontend: `frontend/.env.local`

### Required Environment Variables

**Backend (`backend/.env` or `backend/app/.env` for local override):**
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

## Deployment

### Docker Compose (Infrastructure)
```bash
docker-compose up -d db redis
```

### Backend Deployment
- Use `uvicorn` with multiple workers for production
- Set `SERVER_BASE_URL` to public HTTPS domain (required for LINE media URLs)
- Configure proper CORS origins

### Frontend Deployment
- Next.js builds to standalone output
- Configure API URL environment variable
- Static files served from `/uploads` (backend-mounted)

---

## Agent Collaboration System

This project includes a comprehensive agent collaboration system in `.agent/`:

### Skills (`.agent/skills/`)
- `fastapi_enterprise/` - FastAPI development standards
- `nextjs_enterprise/` - Next.js 16 + React 19 standards
- `line_integration/` - LINE webhook and LIFF guidelines
- `database_postgresql_standard/` - Database design patterns
- `api_development_standard/` - API design conventions
- `auth_rbac_security/` - Authentication and RBAC
- `testing_standards/` - Testing patterns
- And more...

### Workflows (`.agent/workflows/`)
- `run-app.md` - Start development servers
- `db-migration.md` - Database migration procedures
- `agent-handover.md` - Session handoff to another agent
- `pick-up.md` - Resume work from previous session
- `deploy-application.md` - Production deployment

### Project Status
Check `.agent/PROJECT_STATUS.md` for current project status and recent completions.

---

## Key Patterns

### LINE SDK Lazy Initialization
LINE SDK `AsyncApiClient` requires an async event loop. Use lazy initialization:

```python
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

### Async Database Pattern
```python
async def get_user(db: AsyncSession, user_id: int):
    result = await db.execute(select(User).where(User.id == user_id))
    return result.scalar_one_or_none()
```

---

## Language

The project interface is in **Thai** (primary) and **English** (secondary).
- Database fields often include Thai names (e.g., `province`, `district`)
- UI uses Noto Sans Thai font
- Agent collaboration documents include Thai summaries

---

## License

Private - All Rights Reserved
