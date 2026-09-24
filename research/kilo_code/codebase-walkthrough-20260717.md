# Codebase Walkthrough Report

- **Agent**: kilo/longCat-2.0
- **Timestamp**: 2026-07-17T11:28:39+07:00
- **Scope**: Full project analysis (skill collections + codebase)
- **Mode**: General

---

## 1. Project Overview

**JskApp (SknApp)** — LINE Official Account system with LIFF integration for Community Justice Services. Features: webhook processing, live chat handoff, chatbot intent matching, rich menu management, service request tracking (Kanban), and RBAC.

### Technology Stack

| Layer | Stack |
|-------|-------|
| Backend | FastAPI 0.109+, Python 3.13+, SQLAlchemy 2.0+ (async), Pydantic V2, Alembic 1.13+ |
| Database | PostgreSQL 16+, Redis 7+ (Docker) |
| Frontend | Next.js 16.1+, React 19.2+, TypeScript 5.x, Tailwind CSS v4 |
| LINE SDK | line-bot-sdk 3.0+ (backend), @line/liff 2.27+ (frontend) |
| Testing | pytest + pytest-asyncio (backend), Vitest (unit), Playwright (E2E) |

---

## 2. Skill Collections Analysis

### 7 Collections Compared

| Collection | Count | Role | Installed |
|------------|-------|------|-----------|
| **ECC** | Hundreds | Full SDLC + domain packs + orchestration | Yes (76+ skills) |
| **karpathy** | 1 | Behavioral baseline (think/simple/surgical/verify) | Yes (global) |
| **superpowers** | ~14 | Process discipline (debug/TDD/plan/review) | Yes (global) |
| **mattpocock** | ~35 | Engineering thinking tools (grilling/design) | Yes (global) |
| **addyosmani** | 24 | Full-SDLC playbook (spec→ship) | No (overlaps ECC) |
| **maestro** | 25 | Agent-workflow engineering toolkit | Yes (global) |
| **taste-skill** | 13 | Frontend design taste (anti-slop) | Yes (global) |

### Key Findings

- **ECC** is the primary collection — provides domain-specific skills for this project (LINE, FastAPI, Next.js, deployment, security)
- **karpathy** is the behavioral baseline — always-on for all coding tasks
- **maestro** is the meta-layer — tunes the AI agent's own workflow (prompt/context/tool)
- **taste-skill** is the vertical — handles landing/portfolio/redesign with premium design taste
- **addyosmani** is NOT installed — overlaps with ECC (~20 duplicate skills)

---

## 3. Codebase Architecture

### 3.1 High-Level Architecture

```
LINE Users → LINE App → Webhook/ LIFF/ Rich Menu → FastAPI Backend → PostgreSQL + Redis
Admin Users → Next.js Frontend → REST API / WebSocket → FastAPI Backend
```

### 3.2 Backend Structure (`backend/app/`)

| Layer | Path | Files | Purpose |
|-------|------|-------|---------|
| Core | `core/` | 12 files | Config, security, JWT, permissions, audit, Redis, WebSocket manager |
| API | `api/v1/` | 2 files | Root router, dependency injection |
| Endpoints | `api/v1/endpoints/` | 25 files | Route handlers (webhook, auth, admin_*, liff, media, health) |
| Services | `services/` | 19 files | Business logic layer |
| Models | `models/` | 20 files | SQLAlchemy ORM models |
| Schemas | `schemas/` | 14 files | Pydantic request/response schemas |
| Tasks | `tasks/` | 2 files | Background jobs (broadcast scheduler, session cleanup) |

### 3.3 Frontend Structure (`frontend/`)

| Layer | Path | Count | Purpose |
|-------|------|-------|---------|
| App routes | `app/` | 50+ pages | Admin dashboard, LIFF forms, login, analytics |
| UI Components | `components/ui/` | 50+ primitives | Button, Card, Modal, Form, etc. (CVA-based) |
| Admin Components | `components/admin/` | 25+ | Admin-specific (StatsCard, PageHeader, etc.) |
| Hooks | `hooks/` | 8 | useWebSocket, useLiveChatSocket, useSessionTimeout, etc. |
| Contexts | `contexts/` | 1 | AuthContext (JWT + DEV_MODE) |
| Lib | `lib/` | 15+ modules | utils, authFetch, permissions, constants, WebSocket client |

---

## 4. Database (30 Tables)

| Group | Tables | Count |
|-------|--------|-------|
| Users | users, organizations, auth_sessions, ws_tickets | 4 |
| Service Requests | service_requests, request_comments | 2 |
| Chat | chat_sessions, messages | 2 |
| Chatbot | intent_categories, intent_keywords, intent_responses, auto_replies, reply_objects | 5 |
| LINE | rich_menus, rich_menu_aliases, user_rich_menu_links, friend_events, broadcasts | 5 |
| Files | media_files | 1 |
| Analytics | audit_logs, csat_responses, chat_analytics, business_hours | 4 |
| Tools | canned_responses, tags, user_tags, credentials, permission_settings, system_settings | 6 |
| Geography | provinces, districts, sub_districts | 3 |
| Other | bookings | 1 |

---

## 5. Core Systems Deep Dive

### 5.1 Authentication & Authorization

- **6 RBAC roles**: SUPER_ADMIN > ADMIN > DIRECTOR > HEAD > AGENT > USER
- **Dual auth modes**: JWT bearer + cookie-based refresh rotation
- **Token family tracking**: auth_sessions table with rotation/reuse detection
- **DEV_MODE bypass**: For local development

### 5.2 LINE Webhook (31KB)

- **8 event types**: message, postback, follow, unfollow, account link, member join/leave, beacon
- **Deduplication**: Redis TTL (300s)
- **Intent matching**: keyword → category → response (4 match types, 9 response types)
- **Circuit breaker**: `_call_with_circuit()` for LINE API fault tolerance
- **Bot↔human handoff**: keyword-triggered live chat session

### 5.3 Live Chat (WebSocket)

- **WebSocket manager**: 34KB — ConnectionManager, auth, join_room, message dispatch, pub/sub
- **Service layer**: 43KB — session lifecycle, message routing, transfer
- **Features**: real-time chat, session transfer, typing indicator, auto-close, CSAT, SLA monitoring, cross-server pub/sub

### 5.4 Service Request Workflow

- **7 statuses**: PENDING → IN_PROGRESS → WAITING_INFO → RESOLVED → CLOSED (+ REJECTED)
- **LIFF 4-step form**: Mobile form inside LINE App
- **Features**: file upload, Thai address cascade, assignment, comments, SLA tracking, Kanban view, Flex status messages

### 5.5 Chatbot Intent System

- **3-layer structure**: Category → Keyword → Response
- **4 match types**: exact, contains, regex, starts_with
- **9 response types**: text, image, video, audio, sticker, location, flex, imagemap, template

### 5.6 Rich Menu

- **Full lifecycle**: Create → Sync → Publish → Set Default
- **Alias support**: richmenu switch action
- **Per-user assignment**: user_rich_menu_links table

### 5.7 Analytics & Reports

- **KPIs**: FRT, CSAT, FCR, Resolution Time, Operator Performance, Hourly Stats
- **Export**: CSV + PDF generation
- **Audit logging**: @audit_action decorator tracks all admin actions

---

## 6. API Endpoints (25+ routes under `/api/v1/`)

| Prefix | Description |
|--------|-------------|
| `/line` | LINE webhook events |
| `/auth` | Login/refresh/me, LINE Login |
| `/liff` | LIFF data endpoints, service request |
| `/locations` | Province/district/subdistrict |
| `/admin/*` | Admin CRUD (requests, users, rich-menus, settings, live-chat, analytics, etc.) |
| `/ws` | WebSocket live chat |
| `/health` | Health checks, WS metrics |

---

## 7. Key Files by Size (Largest = Most Complex)

| File | Size | Purpose |
|------|------|---------|
| `live_chat_service.py` | 43KB | Session lifecycle, message routing, transfer |
| `websocket_manager.py` | 34KB | ConnectionManager, auth, dispatch, pub/sub |
| `admin_reports.py` | 28KB | Analytics reports, CSV/PDF export |
| `analytics_service.py` | 28KB | FRT, CSAT, resolution, hourly stats |
| `webhook.py` | 31KB | LINE message/postback/follow event handling |
| `admin_requests.py` | 26KB | Service request CRUD, assignment, status |
| `rich_menus.py` | 24KB | Rich menu CRUD, sync to LINE |
| `admin_live_chat.py` | 23KB | Live chat sessions, operator management |
| `admin_integrations.py` | 23KB | Credential management, N8N/Telegram/Sheets |
| `admin_users.py` | 21KB | Admin user CRUD, role management |

---

## 8. Deployment

### Docker Compose

```yaml
services:
  db:        # PostgreSQL 16-alpine, port 5432
  redis:     # Redis 7-alpine, port 6379
```

### Key Environment Variables

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string |
| `SECRET_KEY` | JWT signing key (min 32 chars in production) |
| `ENCRYPTION_KEY` | Fernet key for credential encryption |
| `LINE_CHANNEL_ACCESS_TOKEN` | LINE Messaging API token |
| `LINE_CHANNEL_SECRET` | LINE webhook signature secret |
| `LINE_LOGIN_CHANNEL_ID` | LINE Login channel ID (LIFF verification) |
| `DEV_AUTH_BYPASS` | Enable dev endpoint bypass |
| `ENVIRONMENT` | development/test/production |

### Production Guards

- Rejects production with `DEV_AUTH_BYPASS=true`
- Rejects short/placeholder SECRET_KEY
- Requires `LINE_LOGIN_CHANNEL_ID` in production
- Requires `ENCRYPTION_KEY` in production

---

## 9. Recommendations Summary

| Priority | Issue | Impact | Effort |
|----------|-------|--------|--------|
| 1 | Split large files into modules | Reduce complexity | Medium |
| 2 | Add rate limiting to APIs | Security | Easy |
| 3 | Add integration tests | Reduce production bugs | Medium |
| 4 | Add monitoring & alerting | Faster incident response | Medium |
| 5 | WebSocket horizontal scaling | Support more users | Hard |
| 6 | Prune duplicate UI components | Reduce context + bugs | Easy |
| 7 | API versioning plan | Future-proofing | Easy |

---

## 10. User-Friendly Summary

### Who Does What

| User | Capabilities |
|------|-------------|
| **Citizen** (via LINE) | Ask bot, chat with staff, submit service requests, check status |
| **Agent** (staff) | Reply chats, process requests, use canned responses |
| **Head/Director** | View stats, assign tasks, view audit logs |
| **Admin** | System config, chatbot management, broadcast, rich menu |
| **Super Admin** | Everything + user management + permission settings |

### 3 Core Systems to Remember

1. **LINE Webhook** — Receives messages from LINE → replies/forwards
2. **Live Chat** — Real-time chat between citizens and staff
3. **Service Request** — Submit → Process → Close workflow

---

*Report generated by Kilo agent on 2026-07-17T11:26:23+07:00*
