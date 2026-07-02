# Session Summary — claude_code — 2026-07-02T23:55:00+07:00

**Branch**: `main`  **HEAD**: `5c4a7f1`
**Checkpoint**: `.agents/state/checkpoints/handover-claude_code-20260702-2355.json`

## Objective
Continue CodeX's session (`project-log-md/codeX/session-summary-20260702-1423-codex.md`):
finish its pending items — install Playwright in WSL, rerun the live-chat smoke +
2-client acceptance specs, review the 19-file dirty worktree, then commit + handoff.

## Completed
- **Stacked the WSL dev env from cold** (machine had rebooted): backend `:8000` +
  frontend `:3000` in WSL Ubuntu, docker db/redis on the Windows host, warmed
  routes (first-hit `/` compile took 337s on 9p), reseeded users + WAITING session.
- **Playwright already installed** — CodeX had run `test:e2e:install` after writing
  its summary (chromium-1217 present, `DEPENDENCIES_VALIDATED`, Chrome 147 launches).
- **3-agent parallel review** (ecc:fastapi-reviewer / ecc:react-reviewer /
  ecc:security-reviewer) of the uncommitted diff. Key catches:
  - **CRITICAL ×2 in `frontend/hooks/useWebSocket.ts` + `lib/websocket/client.ts`**
    (a middle-layer file CodeX never modified): the hook's `send` wrapper dropped the
    3rd `options` param, so `{queue:false}` never reached `WebSocketClient` — messages
    still silently queued and replayed on reconnect **after** the HTTP fallback had
    already delivered them (deterministic double-send); and `sendRaw()` swallowed
    its own errors + unconditionally enqueued, making `send()`'s new try/catch dead
    code and its `true` return a lie. TypeScript can't catch either (structural
    typing; runtime wiring), and the new unit tests mocked past the layer.
  - **HIGH (fastapi + security independently)**: `initiate_handoff` had no
    IntegrityError guard for the new unique index — a lost webhook race would poison
    the caller's transaction and silently drop the customer's INCOMING message.
- **Fixed 9 findings** (all CRITICAL/HIGH + 4 MEDIUM):
  1. `useWebSocket.ts` forwards `options` to `WebSocketClient.send`.
  2. `client.ts` `send()` writes the frame directly (honest boolean, honors
     `{queue:false}`); shared `buildFrame()` helper.
  3. `live_chat_service.initiate_handoff` → new `_add_open_session()` inserts under a
     SAVEPOINT (`begin_nested`); on IntegrityError only the savepoint rolls back and
     the concurrent winner's session is adopted (+ unit test, mirrors reuse branch).
  4. `CreateSessionRequest.initial_message` now sanitized via shared
     `sanitize_message_text()` + max_length 5000 (parity across WS/REST/create).
  5. WS send handler: post-commit failures no longer claim `retryable=true`
     (message already reached LINE — prevents operator-driven duplicate sends).
  6. `retryMessage` returns a real boolean and only consumes retry quota when the
     frame actually left the socket.
  7. Rate-limit WS errors are log-only (typing_start fires per keystroke → toast
     spam loop otherwise).
  8. `useMessageFlow` keeps the pending spinner during the HTTP fallback.
  9. 2-client e2e selectors assert the real Thai aria-labels
     (`การจัดการสาย` / `รับสาย` / `โอนสาย` / `กำลังรับเรื่อง`) instead of position/count.
- **Validation (all in WSL, final code)**: backend pytest **517 passed** (516 + new
  race test); frontend **tsc 0 / eslint 0 / vitest 289/289**; smoke spec **3 passed,
  1 skipped-by-design** (first cold run failed only on a 45s login timeout during
  first-hit compile — infra, not app); **2-client acceptance 2/2 GREEN in a single
  run (5.0m)** against the restarted backend with all fixes.

## Review artifacts / deferred (LOW or out-of-scope)
- Migration `v2w3x4y5z6a7` guard refuses to create the index over existing duplicate
  open sessions (good) but no cleanup script ships with it → see Next Steps.
- Deferred: debounce `typing_start` (fires per keystroke); map raw English WS error
  text to Thai in toasts; have the frontend consume `message_failed.retryable`;
  debug-log for the silent session-reuse branch.

## Next Steps
- Apply migration v2w3x4y5z6a7 to Supabase PROD via
  `python scripts/db_target.py alembic --target remote upgrade head` — FIRST close
  duplicate open sessions (all but newest per line_user_id, closed_by=SYSTEM);
  the migration guard raises RuntimeError on dirty data by design.
- Push to main auto-deploys frontend (Vercel) + backend (Koyeb). Code is safe to
  deploy before the PROD migration (without the index there is simply no
  IntegrityError and behavior matches today's check-then-insert).
- Deferred follow-ups above.
- WSL dev servers left running (stop: `wsl -d Ubuntu pkill -f run.py` /
  `pkill -f "next dev"`).

## Blockers
- _none_

> Fill in detail above, then commit. TASK_LOG.md + SESSION_INDEX.md are generated.
