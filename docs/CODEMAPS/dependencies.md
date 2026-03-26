<!-- Generated: 2026-03-26 | Files scanned: 10 | Token estimate: ~500 -->
# Dependencies Codemap

## External Services

| Service | Purpose | Integration Point |
|---------|---------|-------------------|
| **LINE Messaging API** | Chat messages, push, Flex, rich menus | `core/line_client.py` → `services/line_service.py` |
| **LINE Login** | LIFF token verification | `api/v1/endpoints/liff.py` |
| **Telegram Bot API** | Operator notifications on handoff | `services/telegram_service.py` |
| **n8n** | Workflow automation integration | `api/v1/endpoints/admin_integrations.py` |
| **PostgreSQL** | Primary data store (async) | `db/session.py` → asyncpg |
| **Redis** | Cache + pub/sub for WS coordination | `core/redis_client.py`, `core/pubsub_manager.py` |

## Backend Python Dependencies (key)

| Package | Purpose |
|---------|---------|
| fastapi | Web framework |
| uvicorn | ASGI server |
| sqlalchemy[asyncio] | Async ORM |
| asyncpg | PostgreSQL async driver |
| redis[hiredis] | Redis async client |
| pydantic | Settings & validation |
| python-jose | JWT encoding/decoding |
| passlib[bcrypt] | Password hashing |
| linebot-sdk | LINE Messaging API v3 |
| httpx | Async HTTP client (Telegram, n8n) |
| python-multipart | File upload handling |
| alembic | Database migrations |
| pytest + pytest-asyncio | Test framework |

## Frontend NPM Dependencies (key)

| Package | Purpose |
|---------|---------|
| next 16.1.1 | App framework (App Router) |
| react 19.2.3 | UI library |
| zustand 5.0.11 | State management (live chat) |
| react-hook-form 7.54 | Form handling |
| zod 3.24 | Schema validation |
| recharts 2.15 | Charts for analytics |
| @radix-ui/* | Headless UI primitives |
| lucide-react | Icon library |
| class-variance-authority | Component variants |
| clsx + tailwind-merge | Classname utilities |
| date-fns 4.1 | Date formatting |
| @line/liff 2.27 | LINE LIFF SDK |
| cmdk 1.1 | Command palette |
| @tailwindcss/postcss 4 | Tailwind CSS v4 |

## Infrastructure

```
docker-compose.yml
├── db:    postgres:15 (port 5432)
├── redis: redis:7     (port 6379)
└── volumes: postgres_data, redis_data
```

## Internal Shared Libraries

| Module | Used By | Purpose |
|--------|---------|---------|
| `lib/websocket/client.ts` | useLiveChatSocket, useWebSocket | WS abstraction |
| `lib/authFetch.ts` | All admin pages | JWT-injected fetch |
| `lib/utils.ts` | All components | `cn()` class merge |
| `core/pubsub_manager.py` | ws_live_chat, websocket_manager | Multi-instance WS sync |
| `core/audit.py` | All admin endpoints | Action logging decorator |

## CI/CD

```
.github/workflows/ci.yml
├── trigger: push to main, PR to main
├── services: postgres, redis
├── steps: pip install → pytest (198 tests, 7 skipped)
└── status: ✅ green as of 2026-03-21
```
