# P1 Login Flake — Repro Findings (2026-09-05)

Branch `fix/login-flake` · Local stack: Docker (db+redis), backend `run.py --target local`
with `AUTH_LOGIN_RATE_LIMIT=100`, frontend `npm run dev`, Playwright bundled chromium.

## Setup notes

- The local test DB had **no admin user** — seeded via `backend/scripts/seed_admin.py --apply`
  with `ADMIN_DEFAULT_PASSWORD` from `backend/app/.env`. On any fresh local DB, run this
  before E2E or every login 401s (first repro run "failed" on exactly this).

## Single-tab loop (`e2e/login-flake-repro.spec.ts`)

- **10/10 passed** — no bounce on the dev server in a single tab.
- Console evidence per iteration (stale /login mount, no session):
  `GET /auth/me 401` → `POST /auth/refresh 401` →
  `Cookie auth bootstrap fetch error: TypeError: ไม่สามารถเชื่อมต่อ Backend ได้ (/api/v1/auth/me)`
  — **misleading message**: the backend answered (401); the TypeError comes from the
  interceptor chain re-entry while `logout()` runs inside the expired-auth dispatch.
- Backend request counts over the run: `/me` ×43, `/login` ×11, `/refresh` ×14,
  `/logout` ×26 → each stale /login mount fires the auth-expired → `logout()` chain
  **2–3 times** (double dispatch: once from the `/me` 401, once from the refresh 401's
  own `notifyAuthExpired`; StrictMode double-mount adds another chain in dev).
  No infinite loop, but every stale mount broadcasts `logout` to all tabs repeatedly.

## Two-tab receiver link (`e2e/login-flake-twotab.spec.ts`)

- **BOUNCE CONFIRMED, deterministic**: tab A logged in → on `/admin`; tab B posts
  `{type:'logout'}` on the `jsk:auth` channel (exactly what `logout()` emits) →
  tab A's session is cleared **without any server verification** and it ends on
  `/login` (`BOUNCE CONFIRMED: admin tab ended on http://localhost:3000/login`).

## Confirmed mechanism

1. Any tab whose bootstrap/silent-refresh chain 401s (`/login` mount with stale or absent
   cookies, expired session on `/admin`) calls `logout()` → broadcasts `logout`.
2. Every other tab obeys the broadcast unconditionally → fresh session evicted →
   user sees success toast then the bounce; retrying works once the stale tab settles.
- E7 (refresh-rotation reuse revoking a family) remains a real multi-tab risk but was
  **not** the reproduced trigger. E8 (commit-before-response) eliminated.

## Impact on the plan

- **Task 3 (verify broadcast before clearing) is the critical fix** — it makes every
  receiver immune regardless of who shouts.
- Task 2 (shared store) still valuable (no re-verification round-trip after login),
  but does not stop the chain by itself.
- **Task 3 addition (sender-side guard, new):** `onAuthExpired` should call `logout()`
  only when the local status is `authenticated` — a tab that was never logged in (e.g.
  the /login bootstrap chain) has nothing to log out and must not broadcast. This kills
  the noise at the source (the 2–3 broadcasts per stale mount) and also stops the
  redundant `POST /auth/logout` calls.
- Cosmetic follow-up (same seam, cheap): the interceptor's `Failed to fetch` re-wrap
  mislabels interceptor-internal 401 handling as a network outage in the console —
  investigate during Task 3; do not expand scope beyond a correct message.
