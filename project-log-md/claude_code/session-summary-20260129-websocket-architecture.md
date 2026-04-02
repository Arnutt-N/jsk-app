# Session Summary: WebSocket Architecture Planning

**Date**: 2026-01-29
**Session Type**: Architecture Planning
**Branch**: `fix/live-chat-redesign-issues`

---

## Objective

Design a comprehensive WebSocket architecture for the live chat feature to replace HTTP polling with real-time communication.

---

## Work Completed

### 1. Codebase Exploration

Used Task agent with `subagent_type=Explore` to thoroughly analyze the existing live chat implementation:

**Backend Patterns Discovered**:
- `backend/app/services/live_chat_service.py` - Service layer with async methods
- `backend/app/api/v1/endpoints/admin_live_chat.py` - REST endpoints (8 routes)
- `backend/app/api/deps.py` - AsyncSession dependency injection
- `backend/app/db/session.py` - AsyncSessionLocal for DB connections
- Mock authentication: `operator_id=1` hardcoded

**Frontend Patterns Discovered**:
- `frontend/app/admin/live-chat/page.tsx` - 649 lines, uses polling
- 5-second interval for conversation list
- 3-second interval for message updates
- State: `conversations`, `selectedId`, `messages`, `backendOnline`

**Current Pain Points**:
- 3-5 second latency on messages
- ~720 API requests/hour per idle operator
- No typing indicators
- No presence awareness
- No real-time session updates

### 2. External Research

Searched and synthesized best practices from:
- [FastAPI WebSocket Docs](https://fastapi.tiangolo.com/advanced/websockets/)
- [Better Stack - Connection Manager Pattern](https://betterstack.com/community/guides/scaling-python/fastapi-websockets/)
- [WebSocket JWT Authentication](https://hexshift.medium.com/authenticating-websocket-clients-in-fastapi-with-jwt-and-dependency-injection-d636d48fdf48)
- [react-use-websocket npm](https://www.npmjs.com/package/react-use-websocket)

### 3. Created PRP Plan

**File**: `.claude/PRPs/plans/websocket-live-chat-architecture.plan.md`

12-task implementation plan with:
- WebSocket schemas (Pydantic)
- Connection Manager (room-based)
- WebSocket endpoint
- Frontend hooks (useWebSocket, useLiveChatSocket)
- Webhook integration for LINE messages
- REST fallback strategy

### 4. Compared with Existing Kilo Code Plan

**Kilo Code Plan** (`PRPs/kilo_code/websocket/`):
- 2 files: architecture overview + implementation details
- Thai + English mixed
- Mermaid diagrams
- MessageQueue for offline messages
- Explicit auth handshake
- Separate ReconnectStrategy class

**Key Differences**:
| Aspect | PRP Plan | Kilo Code |
|--------|----------|-----------|
| Auth flow | Auto-connect | Requires `auth` message first |
| Room naming | Direct ID | Prefixed `conversation:{id}` |
| Typing events | Single toggle | Separate start/stop |
| Message queue | Not included | Full implementation |
| Webhook integration | Included | Not mentioned |
| REST fallback | Explicit | Not mentioned |

### 5. Created Merged Plan

**File**: `D:\genAI\jsk-app\PRPs\claude_code\websocket-live-chat-architecture.plan.md`

Combined the best of both plans:

**From PRP Plan**:
- Task-based structure with validation commands
- Codebase pattern references (file:line)
- Webhook integration (LINE → WS broadcast)
- REST fallback strategy
- Session claim/close events

**From Kilo Code Plan**:
- Mermaid architecture diagrams
- MessageQueue class for offline reliability
- Explicit auth handshake flow
- ReconnectStrategy class
- WebSocketClient class
- Room naming with prefix
- Separate typing_start/typing_stop events

---

## Files Created

| File | Purpose |
|------|---------|
| `.claude/PRPs/plans/websocket-live-chat-architecture.plan.md` | Initial PRP plan |
| `PRPs/claude_code/websocket-live-chat-architecture.plan.md` | **Final merged plan** |

---

## Merged Plan Summary

### Architecture Overview

```
Frontend                          Backend
─────────────────────────────────────────────────
LiveChatPage                      WebSocket Endpoint
    ↓                                 ↓
useLiveChatSocket                 ConnectionManager
    ↓                                 ↓
useWebSocket                      Room Manager
    ↓                                 ↓
WebSocketClient ←── WS ──→        LiveChatService
    ↓                                 ↓
MessageQueue                      Database + LINE API
```

### Event Types

**Client → Server**:
- `auth`, `join_room`, `leave_room`
- `send_message`, `typing_start`, `typing_stop`
- `claim_session`, `close_session`, `ping`

**Server → Client**:
- `auth_success`, `auth_error`
- `new_message`, `message_sent`
- `typing_indicator`, `session_claimed`, `session_closed`
- `presence_update`, `conversation_update`
- `operator_joined`, `operator_left`
- `error`, `pong`

### Files to Create/Modify

**Backend (5 files)**:
1. CREATE `backend/app/schemas/ws_events.py`
2. CREATE `backend/app/core/websocket_manager.py`
3. CREATE `backend/app/api/v1/endpoints/ws_live_chat.py`
4. UPDATE `backend/app/api/v1/api.py`
5. UPDATE `backend/app/api/v1/endpoints/webhook.py`

**Frontend (7 files)**:
1. CREATE `frontend/lib/websocket/types.ts`
2. CREATE `frontend/lib/websocket/reconnectStrategy.ts`
3. CREATE `frontend/lib/websocket/messageQueue.ts`
4. CREATE `frontend/lib/websocket/client.ts`
5. CREATE `frontend/hooks/useWebSocket.ts`
6. CREATE `frontend/hooks/useLiveChatSocket.ts`
7. UPDATE `frontend/app/admin/live-chat/page.tsx`

**Tests & Docs (2 files)**:
1. CREATE `backend/tests/test_websocket.py`
2. UPDATE `CLAUDE.md`

### Key Features

| Feature | Description |
|---------|-------------|
| Room-based architecture | `conversation:{line_user_id}` per chat |
| Explicit auth handshake | `auth` → `auth_success` before operations |
| Offline message queue | Queue when disconnected, process on reconnect |
| Exponential backoff | 1s → 30s max with jitter |
| Heartbeat | 25s ping/pong interval |
| REST fallback | Polling at 30s (WS) or 5s (no WS) |
| Webhook integration | LINE messages broadcast via WS |

---

## Validation Commands

```bash
# Level 1: Static Analysis
cd backend && python -c "from app.api.v1.endpoints.ws_live_chat import router; print('OK')"
cd frontend && npm run lint && npx tsc --noEmit

# Level 2: Unit Tests
cd backend && python -m pytest tests/test_websocket.py -v

# Level 3: Full Suite
cd backend && python -m pytest
cd frontend && npm run build

# Level 4: Manual Testing
# 1. Start servers
# 2. Open DevTools Network (WS filter)
# 3. Verify connection, auth, messages
```

---

## Next Steps

1. **Implement**: Run `/prp-implement PRPs/claude_code/websocket-live-chat-architecture.plan.md`
2. **Test**: Follow validation commands after each task
3. **Deploy**: Test in staging environment
4. **Monitor**: Check WebSocket connection stability

---

## Technical Decisions

| Decision | Rationale |
|----------|-----------|
| No Redis for MVP | Single-server sufficient; add later for scaling |
| Mock auth (operator_id=1) | Match existing REST pattern; real JWT later |
| Keep REST endpoints | Fallback + initial data load |
| 25s heartbeat | Under typical 30s proxy timeout |
| MessageQueue max 100 | Prevent memory issues |

---

## Risks Identified

| Risk | Mitigation |
|------|------------|
| Proxy blocks WebSocket | REST polling fallback |
| Connection memory leak | Proper disconnect cleanup |
| Session claim race | Server handles first, broadcasts to all |
| Tab goes inactive | Heartbeat maintains or reconnects on focus |

---

## Session Statistics

- **Duration**: ~30 minutes
- **Tools Used**: Task (Explore), Read, Write, Bash, WebSearch, Glob
- **Files Read**: 6 (live_chat_service.py, admin_live_chat.py, page.tsx, deps.py, session.py, kilo_code plans)
- **Files Created**: 2 (PRP plan, merged plan)
- **Research Sources**: 4 external documentation links

---

## References

- [FastAPI WebSocket Docs](https://fastapi.tiangolo.com/advanced/websockets/)
- [Better Stack WebSocket Guide](https://betterstack.com/community/guides/scaling-python/fastapi-websockets/)
- [JWT WebSocket Auth](https://hexshift.medium.com/authenticating-websocket-clients-in-fastapi-with-jwt-and-dependency-injection-d636d48fdf48)
- [react-use-websocket](https://www.npmjs.com/package/react-use-websocket)
