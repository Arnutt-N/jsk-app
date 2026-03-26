<!-- Generated: 2026-03-26 | Files scanned: ~250 | Token estimate: ~900 -->
# Architecture Overview

## System Diagram

```
LINE Platform                    Telegram
     │                               │
     ▼                               ▼
┌──────────────────────────────────────────┐
│  FastAPI Backend  (port 8000)            │
│  ├─ /api/v1/line/webhook (LINE events)   │
│  ├─ /api/v1/ws/live-chat (WebSocket)     │
│  ├─ /api/v1/admin/*     (REST CRUD)      │
│  ├─ /api/v1/liff/*      (LIFF data)      │
│  └─ /api/v1/media/*     (file I/O)       │
│                                          │
│  Services (17)  →  Models (24)           │
│       ↕                ↕                 │
│     Redis          PostgreSQL            │
│  (pub/sub,cache)   (async SQLAlchemy)    │
└──────────────────────────────────────────┘
          ▲
          │  /api/v1/* proxy
          ▼
┌──────────────────────────────────────────┐
│  Next.js 16 Frontend  (port 3000)        │
│  ├─ /admin/*   (dashboard SPA)           │
│  ├─ /liff/*    (LINE mini-app)           │
│  └─ /login     (auth)                    │
│                                          │
│  Zustand (state) + WebSocket (real-time) │
│  shadcn/ui + Tailwind v4 + Recharts      │
└──────────────────────────────────────────┘
```

## Data Flow

```
LINE User Message:
  LINE → POST /line/webhook → signature verify → BackgroundTasks
       → intent matching → auto-reply OR queue for live-chat

Live Chat:
  Operator connects WS → auth → join_room → send_message → LINE push
  LINE incoming → webhook → Redis pub/sub → WS broadcast to operators

Service Requests:
  LIFF form → POST /liff/requests → PostgreSQL → admin list/kanban
```

## Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| DB driver | asyncpg (async) | Non-blocking I/O for all DB ops |
| Real-time | WebSocket + Redis pub/sub | Multi-instance coordination |
| Auth | JWT (HS256) | Stateless, LINE token verify on LIFF |
| LINE resilience | Circuit breaker | Graceful degradation on API outage |
| Frontend state | Zustand (live-chat) + Context (auth) | Zustand for complex state, Context for simple auth |
| Styling | Tailwind v4 + shadcn/ui | Utility-first with design system |

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Backend | FastAPI + Uvicorn | 0.115+ |
| ORM | SQLAlchemy (async) | 2.0 |
| Database | PostgreSQL | 15+ |
| Cache/PubSub | Redis | 7+ |
| Frontend | Next.js (App Router) | 16.1.1 |
| UI | React | 19.2.3 |
| State | Zustand | 5.0.11 |
| CSS | Tailwind CSS | v4 |
| Components | shadcn/ui + Radix | latest |
| LINE SDK | linebot v3 / @line/liff | 2.27.3 |
