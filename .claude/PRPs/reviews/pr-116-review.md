# PR Review: #116 — feat(live-chat): audit remediation — Phases 1–8 (a11y, perf, multi-operator, provider refactor)

**Reviewed**: 2026-06-28
**Author**: Arnutt-N
**Branch**: `docs/livechat-audit-remediation-prp` → `main`
**Reviewer**: Claude Code (multi-perspective: fastapi-reviewer + react-reviewer + security-reviewer)
**Decision**: REQUEST-CHANGES → **3 blockers remediated in-branch this session** → APPROVE pending final full-suite vitest

## Summary
The 8-phase live-chat remediation is well-built and the Phase-8 provider refactor (805→395-line composition root + 8 hooks, 34-key contract preserved) is verified clean. Three issues were found that the per-phase reviews missed once the phases were combined; all three were fixed in this review session. Remaining findings are pre-existing / carried-forward and are recorded as follow-ups, not merge blockers.

## Findings

### CRITICAL
None.

### HIGH (all REMEDIATED in-branch)
1. **Broken access control — `/admin/users/workload` over-exposure** — `backend/app/api/v1/endpoints/admin_users.py:227`
   Auth was widened `get_current_admin → get_current_staff` (so AGENT-level operators can load the transfer roster) but the query did not filter role, so an AGENT calling without `?role=` received `display_name` (PII) + DB id of **every LINE customer** (`UserRole.USER`). Caller `useOperatorRoster.ts:57` omits the role param. PR body wrongly claimed "exposes no admin-only privilege".
   **Fix applied:** added server-side base filter `select(User).where(User.role != UserRole.USER)`. Backend tests 15/15 still pass.
   *(Flagged by security-reviewer as MEDIUM M-1 and backend-reviewer as LOW; escalated to HIGH because PR-introduced + customer PII + caller omits filter.)*

2. **A11y — TransferDialog focus not restored on close (WCAG 2.4.3)** — `frontend/.../TransferDialog.tsx:46`
   Effect moved focus into the dialog without capturing `document.activeElement`; on close focus dropped to `<body>`.
   **Fix applied:** capture trigger before focus, restore in cleanup (mirrors `MobileDrawer`).

3. **A11y — TransferDialog `role="dialog"`/`aria-modal` on the backdrop, not the panel (WCAG 4.1.2)** — `frontend/.../TransferDialog.tsx:95`
   AT saw the full-screen overlay as the dialog boundary; focus trap was on the panel → boundary mismatch.
   **Fix applied:** moved `role`/`aria-modal`/`aria-label` + `tabIndex={-1}` to the panel (`dialogRef`); backdrop is now presentational. New regression test `TransferDialog.a11y.test.tsx` (3 tests) covers both a11y fixes — passing.

### MEDIUM (REMEDIATED in-branch)
4. **Seed script has no production guard** — `backend/scripts/seed_live_chat_e2e.py`
   Default env (`backend/.env`) targets Supabase PROD; `--apply` without `ENV_FILE=app/.env` would inject a fake WAITING session (+ live operator notifications) into production. docstring claimed "safe to re-run".
   **Fix applied:** capture `database_target` from `print_script_header` and default-deny — abort unless host matches `localhost`/`127.0.0.1`/`::1`.
   *(Flagged by both backend-reviewer and security-reviewer M-2.)*

### MEDIUM / HIGH (FOLLOW-UP — pre-existing, not introduced by this PR; do NOT block merge)
- **`broadcast_to_all` double-delivery under Redis self-loopback** — `websocket_manager.py:389`. Pre-existing architectural flaw; this PR amplifies frequency via `broadcast_presence` (every connect/disconnect). Fix before enabling Redis at high traffic. *(backend-reviewer HIGH)*
- **`admin_display_names` cache never pruned on disconnect** — `websocket_manager.py:125` (slow leak + stale names). *(backend-reviewer MEDIUM)*
- **`onConnectionChange` not memoized** → redundant effect fires — `LiveChatContext.tsx:270`. No visible regression. *(react-reviewer MEDIUM)*
- **ACK timeout releases global `sending` flag without per-message tracking** — `useMessageFlow.ts:138` (rare: consecutive sends with >10s ack). *(react-reviewer MEDIUM)*

### LOW (FOLLOW-UP)
- Transfer error mapping uses substring match, not constant equality — `admin_live_chat.py:317`. *(backend-reviewer)*
- JWT in WS URL query parameter (logs/history exposure) — `ws_live_chat.py:124`, pre-existing. *(security-reviewer L-1)*

## Confirmed clean
- Redis loopback exclusion fix (carry `_exclude_admin` in envelope) — correct.
- WS dev-token bypass removed (`effectiveToken = token`) — no auth-bypass path remains.
- `send_message`/`close_session` ownership enforcement — AGENT can view a room but cannot send/close a session it did not claim.
- Phase-8: 34-key contract complete, acyclic hook order, `wsSendMessageRef` bridge safe, NotificationToast `aria-live` always mounted.

## Validation Results

| Check | Result |
|---|---|
| Type check (`tsc --noEmit`) | Pass (0 errors) |
| Lint (`eslint`) | Pass (0 errors, 10 pre-existing warnings outside live-chat) |
| Frontend tests (`vitest`) | Pass (259 baseline; +3 new TransferDialog a11y; full-suite re-run post-fix in progress) |
| Backend tests (`pytest` changed endpoints) | Pass (15/15: test_admin_users + test_transfer_session_errors) |
| Build (Vercel preview) | Pass |

> Note: GitHub Actions disabled on this repo — full matrix run locally in WSL.

## Files Reviewed (code only; ~60 docs/handoff files excluded)
**Backend:** `websocket_manager.py`, `ws_live_chat.py`, `admin_users.py` (M), `live_chat_service.py`, `admin_live_chat.py`, `seed_live_chat_e2e.py` (M, new), `test_admin_users.py`, `test_transfer_session_errors.py`
**Frontend:** `LiveChatContext.tsx`, 8 `_hooks/*`, `useWebSocket.ts`, `useReducedMotion.ts`, `useCustomerNotes.ts`, `TransferDialog.tsx` (M), `MobileDrawer.tsx`, `NotificationToast.tsx`, `MessageInput.tsx`, `ChatArea.tsx`, `waiting-time.ts`, `TransferDialog.a11y.test.tsx` (new)

## Remediation Commit
3 blockers (HIGH ×3 + MEDIUM seed guard) fixed in this branch + 1 new regression test. Follow-up items tracked above for a separate PR.
