# Live Chat Hardening - Handoff Document
**From**: CodeX (Codex GPT-5)
**Date**: 2026-03-18 21:42

**Branch**: `feat/ui-workflow-audit`
**Status**: Ready for handoff

## What Was Done
Hardened the live-chat subsystem so REST and WebSocket flows stay aligned under normal use and fallback conditions.

- WS auth now requires access tokens and staff-role validation.
- Session ownership is enforced for outbound send/close paths.
- Room membership is tracked per websocket connection.
- Redis pub/sub now preserves sender exclusion across instances.
- REST transfer fallback is available and wired to the frontend.
- `conversation_update` is merged into existing state instead of clobbering richer REST-loaded chat state.
- REST claim/close/send now broadcast the same session and message events as WS where practical.

## Verification
- `python -m pytest tests/test_ws_security.py tests/test_live_chat_service.py tests/test_websocket_manager_redis.py tests/test_websocket.py tests/test_reconnection.py tests/test_session_claim.py tests/test_multi_operator.py -q`
- `npm run build`

## Key Files
- `backend/app/api/v1/endpoints/ws_live_chat.py`
- `backend/app/api/v1/endpoints/admin_live_chat.py`
- `backend/app/services/live_chat_service.py`
- `backend/app/core/websocket_manager.py`
- `frontend/app/admin/live-chat/_context/LiveChatContext.tsx`
- `frontend/hooks/useLiveChatSocket.ts`

## Next Steps
1. Run WSL manual QA for `claim -> send -> transfer -> close`.
2. Validate one reconnect and one same-admin multi-tab pass.
3. Decide commit scope before staging the dirty tree.
4. Validate the live-chat flow in a multi-instance/Redis staging setup if available.
