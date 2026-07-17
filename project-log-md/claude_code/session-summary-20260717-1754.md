# Session Summary — claude_code (Fable 5) — 2026-07-17T17:54:00+07:00

**Branch**: `main`  **HEAD**: `dba1beb`
**Checkpoint**: `.agents/state/checkpoints/handover-claude_code-20260717-1754.json`

> **Platform Meta**
> | Field | Value |
> |-------|-------|
> | AI CLI IDE | Claude Code |
> | Provider | Anthropic |
> | Model | Fable 5 |
>

## Objective

Implement the top-3 recommendations from the Kilo codebase walkthrough
(`research/kilo_code/codebase-walkthrough-20260717.md`) — extend rate
limiting, add monitoring/alerting, split the oversized live-chat service —
then get CI on main back to green.

## Completed

### PR #137 — backend hardening (merge commit `c84ca1b`, 4 commits preserved)

1. **`feat(security)` HTTP rate limiting** (`3ee0450`) — new
   `app/core/http_rate_limit.py`: dependency factory over the existing
   `SlidingWindowLimiter`, returns 429 + `Retry-After`. Wired to LIFF
   service-request submission (5/5 min), media uploads ×3 routes (20/min),
   public file serving ×2 routes (120/min). `X-Forwarded-For` honoured only
   when `TRUST_PROXY_HEADERS=true` (anti-spoof). All limits env-tunable;
   conftest autouse fixture resets buckets between tests. 14 new tests.
2. **`feat(monitoring)` health watchdog** (`88a6231`) — new
   `app/tasks/health_watchdog.py`: background task probing DB/Redis every
   60s (same components as `/health`), Telegram alerts on DOWN/RECOVERED
   transitions with 15-min cooldown, reusing the SLA-alert channel. Gated
   by `HEALTH_ALERT_TELEGRAM_ENABLED` (default off; always logs). Wired
   into app lifespan. 8 new tests.
3. **`refactor(live-chat)` package split** (`0d09a9e`) — 981-line
   `live_chat_service.py` → package of 6 per-concern mixins (handoff /
   sessions / messaging / conversations / unread / analytics) composed by
   the same `LiveChatService` facade. Import path and public surface
   unchanged; **zero test edits**. Gotcha for future work: tests patch
   singletons through the package namespace
   (`patch('app.services.live_chat_service.sla_service')`), so `_deps.py`
   late-binds `sla_service` inside mixins — a direct import there would
   bypass the patch.
4. **`fix(tests)` pytest hang** (`0efb8b3`) — pre-existing on main (verified
   by stashing all changes and reproducing on clean tree):
   `test_websocket.py` then `test_websocket_manager_redis.py` in one
   session hangs at session teardown. Cause: the session-scoped TestClient
   connects `redis_client` on its portal-thread event loop; the
   redis-manager unit tests (own pytest-asyncio loops) touched that live
   connection via `manager.register()`, leaving pending overlapped reads —
   Windows proactor `close()` then spins forever in `_poll`. Fix: autouse
   fixture nulls `redis_client._redis` for that file (tests needing Redis
   already patch in `FakeRedis`). This would also have hung CI.

Verification: full backend suite **657 passed** (78s) with no exclusions;
Backend Pytest green on CI (Linux) too.

### PR #138 — frontend lint fix (merge commit `dba1beb`)

CI on main had been red for 5+ pushes (predating this session) on 6 ESLint
errors, all in `frontend/contexts/__tests__/AuthContext.cookie.test.tsx`:

- `react-hooks/immutability`: `TestConsumer` assigned `snapshot.current`
  during render → capture moved into `useEffect` with param renamed
  `snapshotRef` (the rule's sanctioned mutable-ref naming).
- `@typescript-eslint/no-explicit-any` ×5: `null as any` → typed
  `makeSnapshot()` helper on `ReturnType<typeof useAuth>`.
- The effect-based capture exposed a latent race: the two "unauthenticated"
  tests waited on `isAuthenticated === false`, which is already true in the
  initial state before `/auth/me` resolves. They now wait
  `isLoading === false` first, then assert.

Verification: eslint 0 errors (12 pre-existing warnings remain), `tsc
--noEmit` clean, vitest **415/415**. Waited for all PR checks green before
merging. **First successful CI run on main in 5+ pushes.**

### Docs

- `CLAUDE.md` services tree updated (`live_chat_service/` package).

## Environment notes

- Local test runs used a throwaway Postgres container `skn-test-db` on port
  55432 (project's compose DB was occupied by another stack) + project
  Redis on 6379. `docker rm -f skn-test-db` when no longer needed.
- Backend venv recreated at `backend/venv` (was missing on this machine).

## Next Steps

- Enable `HEALTH_ALERT_TELEGRAM_ENABLED=true` in production once deployed
  (reuses SLA-alert Telegram channel).
- Set `TRUST_PROXY_HEADERS=true` when deploying behind a reverse proxy or
  all clients share one rate-limit bucket.
- Consider Redis-backed rate-limit buckets if backend moves to multiple
  workers (current limiters are in-process, like the auth/WS ones).
- Consider branch protection with required checks on main — auto-merge
  merged PR #137 instantly before CI finished (no required checks set).
- Update `.claude/skills` (skn-live-chat-ops, skn-performance-audit, etc.)
  still referencing single-file `live_chat_service.py` paths.
- Carry-over from previous handoff: production rollout per PRD
  (`COOKIE_AUTH_MODE=dual`), PR 2C cookie-only hardening, NEW-3
  DIRECTOR/HEAD ws role decision.

## Blockers

- _none_
