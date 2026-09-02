# Session Summary — zcode (GLM (Zhipu)) — 2026-09-02T17:47:00+07:00

**Branch**: `main`  **HEAD**: `f97492f`
**Checkpoint**: `.agents/state/checkpoints/handover-zcode-20260902-1747.json`

> **Platform Meta**
> | Field | Value |
> |-------|-------|
> | AI CLI IDE | Zcode |
> | Model | GLM (Zhipu) |
>

## Objective
Codebase-review-fix pipeline CLOSED via PR #222 (squash f97492f): 36 findings (6H/17M/13L) — all 6 High + 14 Medium + 2 Low fixed, 3 Medium + 11 Low deferred w/ reasons in findings file. G3 review SHIP + 4 MINOR fixed (scheduler scenario-4 test, exc[:120], dead const, booking cache-guard). Post-G3 E2E regression root-caused: M1 login limiter 5/60s 429'd shared-IP Playwright logins -> settings-driven AUTH_LOGIN_RATE_LIMIT + e2e.yml=100. CI 4/4 green post-fix. Backend 1203 passed / frontend tsc+lint+vitest+build green.

## Completed

### Pipeline state at pickup (sess_03baa842, ~14:40)
- Resumed from the 09:30 checkpoint. Found the `$codebase-review-fix` pipeline mid-flight: G1 findings (36 unique: 6 High / 17 Medium / 13 Low, evidence-verified) + PRD + PRP (G2 READY 10/10, commit `74a7c56`) and the full Tasks 1–17 implementation sitting UNCOMMITTED in the working tree (written by the parallel session sess_23309486, which summarized its own run in `session-summary-20260902-1605.md`).

### This session's work (14:40–17:47)
1. **Diff-vs-plan audit** — verified all 19 tasks; found 1 residual gap: Task 13's plan required `finally` loading-flags to clear only when the response was accepted. Fixed in all 3 LIFF pages (province + district, 6 sites) so a stale response cannot clear a newer request's spinner (landed inside cf7b945 via the shared tree).
2. **Gate runs** — 73 new/updated backend tests green; DB-gated suites green (session_claim + scheduler_db, Docker PG/Redis up); frontend tsc + eslint + vitest (booking/live-chat-hooks/rich-menus 80/80) + build green; full backend suite run.
3. **Flake root-caused + fixed** — `test_rich_menu_display_scheduler_db` failed once: the session-scoped TestClient boots app lifespan → real 60s display-scheduler loop → a tick landing inside the test's patch window double-awaits the mocked `set_default_on_line`. Fix: module-scoped `_silence_background_scheduler` fixture patching `_process_due_rich_menus` (also landed in cf7b945; the parallel session added the NullPool per-test engine on top for the Windows loop-affinity hang).
4. **Step 10 / G3 final review** (read-only Explore agent over the committed diff): verdict **SHIP**, 0 blockers, 4 MINOR findings — all fixed in `26e2af0`: (a) plan-Task-18 scenario 4 test added (foreign LINE default → INACTIVE, cancel NOT awaited, AC4 pinned against real SQL); (b) `str(exc)[:120]` cap in both integration-test except paths; (c) dead `MEDIA_ALLOWED_MIMES` constant removed; (d) booking `loadSlots` sets `latestSlotKeyRef` BEFORE the cache-hit early return so an older in-flight fetch cannot pass the guard and overwrite just-rendered cached slots.
5. **E2E regression root-caused + fixed** (`ba74027`) — CI round 2 Playwright Smoke FAILED (~10 tests, all timing out at `utils/auth.ts:66` post-login navigation): the new M1 login throttle (hardcoded 5/60s per IP+username) 429'd the E2E suite's ~20 logins sharing one client IP + the seeded admin username. Fix: limiter is now settings-driven (`AUTH_LOGIN_RATE_LIMIT`/`AUTH_LOGIN_RATE_WINDOW`, defaults 5/60 = prod posture unchanged), e2e.yml sets `AUTH_LOGIN_RATE_LIMIT=100`; documented in the findings file M1 entry. Verified locally that the env override propagates.
6. **CI 4/4 green → MERGED** — PR #222 squash to main as `f97492f`, branch deleted. Local main synced.

### Validation summary (Step 9/9bis)
- Backend: 1203/1203 passed (parallel session run 3, Docker PG+Redis) + this session: targeted suites all green (73 / 24 / 18×2 / 6), full-suite run stable; env-override probe OK.
- Frontend: tsc clean, eslint clean on touched files, vitest 80/80 touched areas + 15/15 booking after the guard fix, `next build` exit 0.
- CI (post `ba74027`): Backend Pytest ✅ / Frontend Lint+Build ✅ / Encoding ✅ / Playwright Smoke ✅.

## Next Steps
- CD on main deploys Koyeb + Vercel (no migrations in this PR — constraint honored); watch CD run for `f97492f`.
- DEFERs need owner review (documented in findings): DEFER-M1 CD-gating policy, DEFER-M2 dependency lock file, DEFER-M3 CD←E2E gating, DEFER-L1..L11.
- Prod smoke (user): admin login still works (login throttle now live at 5/60s per IP+username — legitimate users unaffected), webhook messages flow during Redis hiccups, LIFF address cascades under slow network.
- `backend/repro*.txt` are leftover diagnostics from the parallel session — deletable.

## Deviations from the plan (WHAT / WHY)
1. **Task 13 (H3)** — plan's "move finally setLoading(false) to run only when accepted" was not applied by the initial implementation; added guard in all 3 LIFF pages (6 sites) per plan text.
2. **Task 18 (H6)** — shipped 3 of 4 scenarios; scenario 4 (foreign default) added in this session's follow-up; both flake-hardening fixtures (`_silence_background_scheduler`, NullPool session) added beyond plan after real failures.
3. **Task 9 (M9)** — endpoint-level test asserts 200 + `TestResult(success=False)` instead of plan's "returns 400": the endpoints surface failures as TestResult by design; reviewer judged the shipped test the accurate one.
4. **M1** — limiter made settings-driven (new `AUTH_LOGIN_RATE_LIMIT`/`WINDOW` config keys) because the hardcoded constant broke the E2E suite (shared IP + username); prod default unchanged.
5. **M7 (Task 16)** — 4xx surfaces via `addNotification({type:'system', variant:'warning'})` with Thai copy instead of `mapWsErrorToThai` (that mapper only covers exact WS error strings; `setFailed` needs an optimistic tempId).
6. **M8 (Task 17)** — sequence guard added to the catch path too (plan specified success path only): a stale request's network error must not flip the console offline.
7. **Task 7 (M4)** — no admin_reports test existed; accepted-risk recorded in the findings file per plan instruction.

## Blockers
- _none_
