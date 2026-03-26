<!-- Generated: 2026-03-26 | Files scanned: ~120 | Token estimate: ~950 -->
# Backend Codemap

## Entry Points

```
backend/run.py (79L)         CLI runner: --target local|remote → uvicorn
backend/app/main.py (113L)   FastAPI app + lifespan (Redis, WS, business hours)
```

## API Routes (prefix: /api/v1)

### Webhook & Auth
```
POST /line/webhook           → webhook.py (653L)     Signature verify → event routing
POST /auth/login             → auth.py (125L)        JWT token issuance
POST /auth/refresh           → auth.py               Token refresh
GET  /health                 → health.py (130L)      Service health check
```

### LIFF (LINE mini-app)
```
GET  /liff/profile           → liff.py (100L)        User profile via LIFF token
GET  /liff/requests          → liff.py               User's service requests
GET  /locations/*            → locations.py (97L)     Province/district/subdistrict
```

### Admin CRUD
```
GET|POST      /admin/users           → admin_users.py (489L)
PUT|DELETE    /admin/users/{id}      → admin_users.py
GET|POST      /admin/requests        → admin_requests.py (288L)
PUT           /admin/requests/{id}   → admin_requests.py
GET|POST      /admin/intents         → admin_intents.py (167L)
PUT|DELETE    /admin/intents/{id}    → admin_intents.py
GET|POST      /admin/broadcasts      → admin_broadcast.py (219L)
GET|POST      /admin/credentials     → admin_credentials.py (140L)
GET|POST      /admin/tags            → admin_tags.py (73L)
GET|POST      /admin/canned-responses → admin_canned_responses.py (111L)
GET|POST      /admin/auto-replies    → admin_auto_replies.py (128L)
GET|POST      /admin/reply-objects   → admin_reply_objects.py (131L)
GET|POST      /admin/rich-menus      → rich_menus.py (204L)
GET|POST      /admin/settings        → settings.py (55L)
GET|POST|PUT  /admin/settings/integrations → admin_integrations.py (530L)
```

### Live Chat
```
GET  /admin/live-chat/sessions   → admin_live_chat.py (414L)
POST /admin/live-chat/claim      → admin_live_chat.py
POST /admin/live-chat/end        → admin_live_chat.py
POST /admin/live-chat/transfer   → admin_live_chat.py
WS   /ws/live-chat/{session_id}  → ws_live_chat.py (667L)
```

### Analytics & Export
```
GET  /admin/analytics/kpis       → admin_analytics.py (73L)
GET  /admin/reports/*            → admin_reports.py (643L)
GET  /admin/audit/logs           → admin_audit.py (133L)
GET  /admin/export/*             → admin_export.py (153L)
GET  /admin/friends/*            → admin_friends.py (99L)
```

### Media
```
POST /media/upload               → media.py (387L)
GET  /media/files                → media.py
GET  /public/files/{token}       → media.py
```

## Service Layer (17 services)

| Service | Lines | Responsibility |
|---------|-------|----------------|
| live_chat_service | 856 | Session lifecycle, handoff, message routing |
| analytics_service | 735 | KPIs, FCR, SLA, abandonment metrics |
| line_service | 365 | LINE API wrapper + circuit breaker |
| friend_service | 333 | Follow/unfollow/block state machine |
| broadcast_service | 262 | Broadcast scheduling & delivery |
| credential_service | 228 | Credential encryption & validation |
| rich_menu_service | 205 | Rich menu CRUD + LINE sync |
| handoff_service | 181 | Agent routing & queue |
| flex_messages | 162 | Flex message template builders |
| response_parser | 161 | Auto-reply template resolution |
| business_hours_service | 130 | Schedule checking |
| csat_service | 129 | CSAT surveys & scoring |
| canned_response_service | 129 | Quick response templates |
| sla_service | 123 | SLA breach detection |
| telegram_service | 112 | Telegram notification relay |
| tag_service | 75 | User tagging system |
| settings_service | 35 | Key-value settings |

## Core Modules

```
core/config.py (57L)            Pydantic Settings (env vars)
core/security.py (181L)         JWT + bcrypt
core/line_client.py (32L)       LINE SDK lazy init
core/redis_client.py (92L)      Redis async singleton
core/pubsub_manager.py (181L)   Redis pub/sub for multi-instance WS
core/websocket_manager.py (651L) WS connection pool, heartbeat, rate limit
core/websocket_health.py (187L) WS stale connection detection
core/rate_limiter.py (89L)      In-memory rate limiting
core/audit.py (122L)            Audit logging decorator
core/env.py (23L)               Env file resolution
```

## Dependency Injection (api/deps.py)

```
get_db()            → AsyncSession from pool
get_current_user()  → JWT decode (dev bypass supported)
get_current_admin() → ADMIN | SUPER_ADMIN role check
get_current_staff() → ADMIN | SUPER_ADMIN | AGENT role check
```

## Stats

| Category | Files | Lines |
|----------|-------|-------|
| Endpoints | 25 | ~5,800 |
| Services | 17 | ~4,175 |
| Models | 24 | ~1,035 |
| Core | 10 | ~1,515 |
| Migrations | 26 | ~1,645 |
| Tests | 35 | — |
| **Total** | **~137** | **~14,170** |
