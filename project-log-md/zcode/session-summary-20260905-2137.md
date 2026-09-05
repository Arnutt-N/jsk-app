# Session Summary — zcode — 2026-09-05T21:37:00+07:00

**Branch**: `main`  **HEAD**: `218b824`
**Checkpoint**: `.agents/state/checkpoints/handover-zcode-20260905-2137.json`

## Objective

แก้ P1 บั๊กล็อกอินกระพริบ (ล็อกอินสำเร็จแล้วถูกเด้งกลับ /login ต้องกดซ้ำ) — ทำตาม mandatory workflow ครบ: branch → PRD → PRP plan → repro-first implementation → review → PR #224 → merge → CD deploy

## Completed (in this session, chronological)

1. **Housekeeping carried over from intake**: committed the previously-untracked `project-log-md/zcode/session-summary-20260902-1758.md` (`1085462`); deleted 3 leftover `backend/pytest-full-run*.log` (content verified: pure test output, zero secrets).
2. **graft privacy audit** (user-requested): static source review of `@nanonets/graft` 0.10.1 + live netstat sampling during `graft ask` → **no external transmission** (only opt-in paths: `graft version/upgrade` npm metadata check, and `build --deep` which requires a user-supplied API key — none configured on this machine).
3. **T1 repro** (`ef08f6f`): local stack up (Docker was running; local test DB had NO admin user → seeded via `seed_admin.py --apply` with `ADMIN_DEFAULT_PASSWORD`). Single-tab loop 10/10 no bounce on dev; **two-tab test reproduced the bounce deterministically** — a `logout` broadcast on the `jsk:auth` channel evicts a freshly-logged-in tab. Also captured live: every stale `/login` mount fires 401 → failed silent refresh → `jsk:auth-expired` → `logout()` → broadcast, 2–3× per mount.
4. **T2 shared auth store** (`99043b9`): new `frontend/lib/authStore.ts` (module-level snapshot + `useSyncExternalStore`); `/login` and `/admin` provider trees now share ONE auth state — a tree mounting after login skips the `/auth/me` re-verification entirely. Dead `isLoading` state removed (it was never read; consumers derive loading from `status`). Public `useAuth()` contract unchanged. Unit tests +5 → 13/13.
5. **T3 verified cross-tab logout + sender guard** (`6b8050a`): broadcast receivers now confirm via `GET /auth/me` before clearing (200 → ignore broadcast; definitive 401 → clear; transient/network error → keep session). Sender side: `onAuthExpired` no-ops unless local status is `authenticated` — a tab that was never logged in no longer broadcasts logout (kills the observed noise at the source). Unit tests +3 → 13/13 incl. both new paths.
6. **T4 permanent regression spec** (`468e10d`): `frontend/e2e/login-stability.spec.ts` — 10× login→/admin zero-bounce + cross-tab eviction guard. Temporary repro specs deleted. Post-fix two-tab test passes in a real browser (admin tab survives the broadcast).
7. **T5 validation**: `tsc --noEmit` clean · lint 0 errors · production build pass · E2E **9/9 auth specs pass against a production build** (`npm start`) incl. cookie-auth logout test. Full E2E on dev server: 20 passed / 2 failed — both diagnosed as local-env-only (below). **PR #224 CI 4/4 green** (Backend Pytest 1m07s · Frontend Lint+Build · Playwright Smoke · Encoding) · **CD deployed successfully** (13:02 ICT) · merged squash `218b824`.
8. **Handoff artifacts**: this checkpoint + generated views (validator FAIL = known Windows-python PATH issue, data written normally).

## Known local-environment flakes (proven pre-existing, do NOT chase in sessions)

- Frontend unit suite: `app/liff/debt-mediation` + `app/liff/booking` tests time out under full-suite load **on pristine `origin/main` too** (verified via detached worktree run) — passes in isolation; CI green. Local machine resource contention.
- Backend pytest hangs on Windows teardown after ~40 min locally (documented since 2026-09-02 session); CI runs it in ~1 min — treat CI as the backend gate.
- E2E `cookie-auth` logout test fails on a DEV server only: Next.js dev-tools overlay button is the first `aria-haspopup="menu"` match, so the spec opens the wrong menu. CI (and local `npm start`) pass — selector limitation, not an app bug.

## Next Steps

- **User smoke test on prod** (218b824 deployed): login on phone/real browser → dashboard must open on the first try; try two tabs: logging out in one tab must not evict a just-logged-in tab.
- P2 leftover scope (recorded, not scheduled): CalendarPickerTH not yet adopted by any LIFF page; `admin/settings/booking` still uses raw `type="date"` input.
- Follow-up Medium pair from PR #222 still open: `webhook.py` finally-block lock deletion (loser deletes winner's lock); `admin_users.py` update_user target-role check only when `role` is sent.

## Blockers

- _none_

## Environment

- Docker `skn-app-db-1` + `skn-app-redis-1` running; local test DB admin seeded (`admin` / `ADMIN_DEFAULT_PASSWORD` from `backend/app/.env`) — E2E needs `E2E_ADMIN_PASSWORD` env.
- Local servers stopped after validation; prod deployed via CD (Koyeb + Vercel).
- Untracked files intentionally left: `.claude/helpers/`, `.github/copilot-instructions.md`, `.ignore`, `.qwen/`, `project-log-md/claude_code/session-summary-20260807-0737.md`, `research/kilo_code/codebase-walkthrough-20260717.md`.
