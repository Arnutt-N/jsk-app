# Plan: Project Continuity + Rich Menu + Chat UI — Phased Implementation

## Summary
Three interconnected features: (1) unified agent handoff/pickup skills, (2) rich menu sync persistence, (3) chat UI message status indicators. 13/15 tasks already completed.

## Metadata
- **Complexity**: Medium
- **Source PRD**: `project-continuity-rich-menu-chat-ui.plan.md`
- **Estimated Files**: 11 files
- **Phases**: 3
- **Status**: 13/15 COMPLETE, 2 optional skipped

---

## Phase 1: Project Continuity System
**Status**: ✅ COMPLETE (5/5 tasks)

| Task | Status | File |
|------|--------|------|
| Create agent_handover skill | ✅ | `.agents/skills/agent_handover/SKILL.md` |
| Create agent_pickup skill | ✅ | `.agents/skills/agent_pickup/SKILL.md` |
| Update handoff-to-any.md | ✅ | `.agents/workflows/handoff-to-any.md` |
| Update pickup-from-any.md | ✅ | `.agents/workflows/pickup-from-any.md` |
| Update PROJECT_STATUS.md | ✅ | `.agents/PROJECT_STATUS.md` |

---

## Phase 2: Rich Menu Persistence
**Status**: ✅ COMPLETE (5/5 tasks)

| Task | Status | File |
|------|--------|------|
| Add sync tracking fields to model | ✅ | `backend/app/models/rich_menu.py` |
| Create rich menu schemas | ✅ | `backend/app/schemas/rich_menu.py` |
| Add idempotent sync to service | ✅ | `backend/app/services/rich_menu_service.py` |
| Enhance sync endpoint | ✅ | `backend/app/api/v1/endpoints/rich_menus.py` |
| Create database migration | ✅ | `backend/alembic/versions/` |

---

## Phase 3: Chat UI Refinement
**Status**: ✅ COMPLETE (3/3 core tasks) + 2 optional skipped

| Task | Status | File |
|------|--------|------|
| Add ACK/FAILED message types | ✅ | `frontend/lib/websocket/types.ts` |
| Add ACK handling + retry hook | ✅ | `frontend/hooks/useLiveChatSocket.ts` |
| Add status indicators + retry UI | ✅ | `frontend/app/admin/live-chat/page.tsx` |
| Offline mode enhancements | ⏸️ SKIPPED | (optional) |
| Unit tests | ⏸️ SKIPPED | (optional) |

---

## Remaining Optional Tasks

### Task 14: Offline Mode Enhancements
- Auto-retry failed messages on reconnect
- "Retry All Failed" button
- Persist failed messages to localStorage

### Task 15: Chat UI Unit Tests
- Message rendering tests
- Status indicator tests
- Retry button tests

---

## Success Criteria
- [x] `/agent_handoff` and `/agent_pickup` skills created
- [x] Rich menu sync is idempotent
- [x] sync_status persists in database
- [x] WebSocket MESSAGE_ACK and MESSAGE_FAILED types defined
- [x] Chat UI shows sending/sent/failed indicators
- [x] Failed messages can be retried
- [ ] Offline mode auto-retry (optional)
- [ ] Unit tests (optional)
