# AGENTS.md - JskApp (SknApp)

> **For AI Coding Agents**: Essential project guide. Read this first before making changes.

---

## Project Overview

**JskApp** (SknApp) — LINE Official Account system with LIFF integration for Community Justice Services. Features: webhook processing, live chat handoff, chatbot intent matching, rich menu management, service request tracking (Kanban), and RBAC.

---

## Mandatory Workflow for New Tasks / Phases

> **RULE**: Every new task or new phase MUST follow this sequence. No direct implementation without a plan.

1. **Reference skills** — `cat` / read `.claude/docs/skill-collections-20260712.md` and invoke the appropriate skill(s) for the work type (e.g., `superpowers:writing-plans`, `mattpocock:to-prd`, `addyosmani:spec-driven-development`, `ecc:prp-prd`, review skills, etc.)
2. **Create PRD** — write a Product Requirements Document for the task
3. **Create PRP plan** — write an implementation plan (PRP: Prompt-Ready Plan) with phases, files, and validation steps
4. **Review PRD + PRP plan** — review both documents (self-review via review skill or user approval) before writing any code
5. **Implement** — code per approved plan, run tests after each phase
6. **Review implementation** — code review (skill-assisted or user)
7. **Commit → Push → PR → Merge** — follow git workflow standards (see `git_workflow` skill)

**Branch rule**: ALWAYS create a new branch before starting any new task/phase. Never implement directly on `main`.

```bash
git checkout -b feat/<descriptive-name>   # or fix/, chore/, refactor/
```

---

## Technology Stack

| Layer | Stack |
|-------|-------|
| Backend | FastAPI 0.109+, Python 3.13+, SQLAlchemy 2.0+ (async), Pydantic V2, Alembic 1.13+ |
| Database | PostgreSQL 16+, Redis 7+ (Docker) |
| Frontend | Next.js 16.1+, React 19.2+, TypeScript 5.x, Tailwind CSS v4 |
| LINE SDK | line-bot-sdk 3.0+ (backend), @line/liff 2.27+ (frontend) |
| Testing | pytest + pytest-asyncio (backend), Vitest (unit), Playwright (E2E) |

---

## Build / Lint / Test Commands

### Backend (run from `backend/`)

```bash
python run.py --target local                       # Start dev server (localhost:8000)
python -m pytest                                   # Run all tests
python -m pytest tests/test_websocket.py           # Single test file
python -m pytest tests/test_websocket.py::test_websocket_connect_and_auth  # Single test
python -m pytest -v                                # Verbose output

# Database migrations
python scripts/db_target.py alembic --target local upgrade head
python scripts/db_target.py alembic --target local revision --autogenerate -m "description"
python scripts/db_target.py alembic --target local downgrade -1
python run.py --target remote --no-reload --host 0.0.0.0 --port 8000  # Production
```

### Frontend (run from `frontend/`)

```bash
npm run dev                 # Dev server (localhost:3000)
npm run build               # Production build
npm run lint                # ESLint
npm run test:unit           # Vitest unit tests
npm run test:unit:watch     # Vitest watch mode
npm run test:e2e            # Playwright E2E
npm run test:e2e:install    # Install Playwright browsers
```

### Infrastructure

```bash
docker-compose up -d db redis    # Start PostgreSQL + Redis
```

---

## Code Style — Backend (Python)

- **Async by default**: all path operations and DB interactions use `async def`
- **Never return ORM models**: convert to Pydantic schemas via `model_validate`
- **Dependency injection**: `Depends(get_db)` for sessions, `Depends(get_current_admin)` for auth
- **Type hints**: strict typing with Pydantic V2; `Optional[]` for nullable fields
- **Enums**: inherit `(str, enum.Enum)` with UPPERCASE values
- **Imports**: stdlib -> third-party -> local (`from app.xxx import yyy`)
- **Error handling**: `HTTPException` with status codes (400/401/403/404/409/413/422/429/500/502/503 — 402 unused today; 413 upload-too-large, 429 rate-limited, 502 upstream LINE failure, 503 config/service unavailable, per codebase precedent in `media.py`, `liff.py`, `admin_broadcast.py`)
- **Logging**: `logger = logging.getLogger(__name__)` at module level
- **Naming**: `snake_case` functions/variables, `PascalCase` classes/enums, `UPPER_SNAKE` constants
- **Schemas**: `Create`/`Update`/`Response` suffix; `ConfigDict(from_attributes=True, use_enum_values=True)`
- **SQLAlchemy**: `select()` style (not `session.query`); `func.now()` for timestamps
- **Formatting**: 4-space indent, UTF-8, LF line endings (`.editorconfig`)

### Endpoint Pattern

```python
@router.get("/items/{id}", response_model=ItemResponse)
async def get_item(id: int, db: AsyncSession = Depends(get_db), admin: User = Depends(get_current_admin)):
    result = await db.execute(select(Item).where(Item.id == id))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    return item
```

---

## Code Style — Frontend (TypeScript/React)

- **Server Components by default**: fetch data in `page.tsx` / `layout.tsx`
- **`"use client"` only for interactive leaves**: buttons, forms, hooks, event handlers
- **Styling**: Tailwind CSS v4 + `cn()` from `@/lib/utils` (clsx + tailwind-merge)
- **Component variants**: CVA (`class-variance-authority`) — see `Button.tsx`, `Badge.tsx`, `Card.tsx`
- **State**: Zustand for complex state; `useState`/`useCallback` for local
- **Path alias**: `@/*` maps to project root
- **Imports**: React -> third-party -> `@/components` -> `@/lib` -> relative
- **Naming**: `PascalCase` components, `camelCase` functions/hooks, `useXxx` hooks
- **Error handling**: `getErrorMessage(error: unknown)` pattern; ErrorBoundary for components
- **Types**: `interface` for props, `type` for unions; prefer `as const` for constants
- **Forms**: `react-hook-form` + `zod` validation
- **Icons**: `lucide-react`
- **Formatting**: 2-space indent, UTF-8, LF line endings

---

## Testing Patterns

### Backend (pytest)

- Fixtures in `conftest.py` — `test_client` session-scoped fixture
- Mock auth with `@pytest.fixture(autouse=True)` + `AsyncMock`
- WebSocket helpers: `drain_auth_responses(websocket)`, `auth_websocket(websocket)`
- Async tests: `@pytest.mark.asyncio` + `async def test_xxx()`
- Test files: `tests/test_*.py`

### Frontend

- **Unit (Vitest)**: `__tests__/*.test.tsx` next to source; uses `@testing-library/react`
- **E2E (Playwright)**: `e2e/*.spec.ts`; chromium-only; sequential locally, parallel in CI
- Setup: `vitest.setup.ts` auto-cleans React trees between tests

---

## Key Patterns

- **LINE SDK lazy init**: `@property` with `if self._api is None` guard (needs async event loop)
- **DB sessions**: `AsyncSessionLocal` factory; always `async with` or `Depends(get_db)`
- **Auth**: JWT tokens; `DEV_AUTH_BYPASS=true` for local dev; `get_current_admin` dependency
- **Auth gates (P1.2a)**: `get_current_admin`/`manager`/`staff` are DB-configurable via `access_admin/manager/staff_endpoints` permission keys (`/admin/settings/permissions`); matrix endpoints (`GET/PATCH /permissions`, `GET /permissions/me`) stay on hardcoded `get_current_admin` to prevent SUPER_ADMIN lockout
- **Live-chat WS gate (NEW-3)**: `_load_and_authorize_ws_user` + `transfer_session` are DB-configurable via `access_live_chat` permission key (DEFAULT_POLICY = SUPER_ADMIN + ADMIN + AGENT); the HTTP gate `get_current_staff` stays permissive (two-gate design — load page vs open socket)
- **WebSocket**: `ws_manager` singleton; auth -> join_room -> message flow
- **Circuit breaker**: LINE API calls wrapped in `_call_with_circuit()` for fault tolerance

---

## Project Structure (Key Paths)

```
backend/app/
  api/v1/endpoints/   # Route handlers
  api/deps.py         # DI: get_db, get_current_admin
  core/config.py      # Pydantic Settings (env vars)
  core/security.py    # JWT, password hashing
  models/             # SQLAlchemy models
  schemas/            # Pydantic request/response schemas
  services/           # Business logic layer

frontend/
  app/admin/          # Admin dashboard pages
  app/liff/           # LIFF mini-apps
  components/ui/      # Reusable UI (Button, Card, Badge, Modal, ...)
  components/admin/   # Admin-specific components
  hooks/              # Custom hooks (useTheme, useLiveChatSocket, ...)
  lib/utils.ts        # cn() utility
  lib/constants/      # Status enums, config constants
  contexts/           # React contexts (AuthContext)
```

---

## Environment

- **WSL required** for all development on Windows
- Backend: `backend/.env` or `backend/app/.env` (local override)
- Frontend: `frontend/.env.local`
- Required: `DATABASE_URL`, `SECRET_KEY`, `LINE_CHANNEL_ACCESS_TOKEN`, `LINE_CHANNEL_SECRET`

---

## Language

UI is in **Thai** (primary). Database fields include Thai names. Code comments and docs use English.

## Communication With The User

- **The user is NOT an IT person** — no programming jargon unless it is explained in plain everyday Thai. Use real-life analogies instead of tech terms (e.g. "ระบบหลังบ้าน" not "backend API", "ทางเข้าหน้าเว็บ" not "endpoint").
- **Explain every technical term on first use in a session, every session.** Do NOT assume the user remembers terms explained in earlier conversations — the agent has no memory between sessions, so if it matters once it must be re-explained once more.
- Summaries of finished work should lead with **what changed from the user's point of view** (what works differently, what to test on the phone), and keep technical detail in a clearly separated section below.
- Work notes and agent-facing docs stay in English per the rule above; but anything addressed TO the user (summaries, answers, status updates) is written in Thai, plainly.

<!-- graft:start -->
## Graft — repo context graph

This repo is indexed in `graft/`: small linked markdown nodes that explain each
system and carry exact file:line spans, kept in sync with the code through git.

For ANY task here — understanding how something works, finding where code lives,
or scoping a change — get context from the graph before grepping or opening
source files. Re-ask freely (it's cheap) and reuse literal identifiers you
already have (symbol, error string, file name) as the query. New to this repo?
Run `graft map` first — a token-budgeted orientation (dir clusters, hubs,
hotspots), no LLM, no key.

- Run `graft ask "<your question>" --source` → ranked nodes with the relevant
  code spans inlined (each hit's ≤8-line crux by default; `--full` for whole
  definitions when the crux isn't enough). Match the tool to the task shape:
  for understanding or editing, the top node IS the answer — cite its
  `covers:` file:line spans and edit straight from `--source`. For
  exhaustive tasks ("every occurrence / every caller of this pattern"), ranked
  results are top-N, not complete — run `graft grep "<literal>"` instead
  (exhaustive over indexed files, grouped by enclosing symbol), falling back
  to raw `grep -rn` only for unindexed files.
- `graft skeleton <file>` → every definition's signature + span, ~10× cheaper
  than reading the file; use it to skim an API surface.
- `graft callers <symbol>` gives precomputed, exact edges — who calls this.
  Add `--direction out` for what it calls, or `--depth N` to walk
  transitively for the full blast radius. For structural questions, skip
  ranking and use this directly.
- Or browse: `graft/INDEX.md` lists every node; follow the links.
- Monorepos and folders of multiple repos rank fairly across sub-projects —
  hits carry `[scope/]` labels naming which one they're from. Narrow with
  `graft ask "<task>" --in <scope>/` once you know where you're working.

If a returned span is truncated ("+N more lines"), open the file at that exact
range before finalizing. Only open source files when a node genuinely lacks a
needed detail, and then at the exact file:line the node points to — never
re-read whole files.

After big code changes, refresh the graph with `graft build` (deterministic,
no API key, $0).
<!-- graft:end -->
