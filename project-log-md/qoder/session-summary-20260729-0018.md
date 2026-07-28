# Session Summary — qoder — 2026-07-29T00:18:00+07:00

**Branch**: `main`  **HEAD**: `57f60f7`
**Checkpoint**: `.agents/state/checkpoints/handover-qoder-20260729-0018.json`

## Objective
Fix live-chat sidebar user-list behavior: rows jumped when clicking a user, and did not reorder to the top when an admin sent a message via WebSocket.

## Completed
- **Root-cause analysis**: sidebar sorts by `last_message.created_at` (stable sort); the personal `CONVERSATION_UPDATE` sent on JOIN_ROOM triggered `reorderConversationsToTop` without a new `last_message`, so clicked rows jumped via tie-break. WS SEND_MESSAGE never broadcast `CONVERSATION_UPDATE`, so admin sends didn't reorder until the next refetch. `User.last_message_at` (backend sort key) was only bumped by incoming LINE messages.
- **Frontend** (`frontend/app/admin/live-chat/_hooks/useConversationSync.ts`): `handleConversationUpdate` reorders only when the payload carries `last_message`; otherwise merges in-place.
- **Backend** (`backend/app/api/v1/endpoints/ws_live_chat.py`): SEND_MESSAGE now broadcasts `CONVERSATION_UPDATE` (fresh `last_message` + per-admin `unread_count`, read-marker advance for admins in-room) to all connected admins — mirrors the REST path. Non-fatal try/except so failures never send a misleading send-failed frame after MESSAGE_SENT.
- **Backend** (`backend/app/services/live_chat_service/messaging.py`): `send_message` bumps `User.last_message_at` so backend ordering matches the frontend sort key across refetches.
- **Merged**: PR #168 squash-merged to main as `57f60f7`; branch `fix/live-chat-sidebar-sort` deleted (remote + local). Verified: ESLint clean, 436 frontend unit tests passed, diff matches expected (+55/-1, 3 files).

## Next Steps
- Manual smoke test on deploy: click user (no jump), admin send (list reorders for all admins), incoming message (unread badge + reorder — regression check).
- Note: backend pytest cannot run on this Windows env (Python 3.9.5 vs required 3.13+); use WSL for backend tests.

## Blockers
- _none_

> Fill in detail above, then commit. TASK_LOG.md + SESSION_INDEX.md are generated.
