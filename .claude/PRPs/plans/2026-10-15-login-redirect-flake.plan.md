# Plan — Login redirect flake fix (2026-10-15)

## Phase 1 — Repro (failing test first)
1. Add test `stale bootstrap does not clobber a mid-flight login` to
   `frontend/contexts/__tests__/AuthContext.cookie.test.tsx`:
   - `/auth/me` attempt 1 → 503 (forces backoff retry window).
   - During backoff, `login()` POST → 200 with user.
   - `/auth/me` retry → stale 401.
   - Assert: still `authenticated`, user intact, no redirect to `/login`.
2. Run the single test file, confirm it FAILS on current code (red).

## Phase 2 — Fix (minimal, root-cause)
3. In `AuthContext.tsx` `initCookieAuth`, before every terminal `setAuthState`
   (bootstrap_error ×2, authenticated/unauthenticated), add:
   `if (cancelled) return;` (already) + `if (getAuthSnapshot().status !== 'loading') return;`
   so a stale bootstrap never overwrites a fresher explicit state (login/logout/retry).
4. Keep the mount-time early return as is. No new state, no new API, no router changes.

## Phase 3 — Verify
5. Re-run the repro test → passes (green).
6. Run full frontend auth suites: `AuthContext.cookie.test.tsx` + `authFetch` tests.
7. Run `tsc --noEmit` and `eslint` on touched files.
8. Review diff (`git diff`), stage test-before-fix ordering in history if split.

## Validation commands (from frontend/)
- `npx vitest run contexts/__tests__/AuthContext.cookie.test.tsx`
- `npx tsc --noEmit`
- `npm run lint -- contexts/AuthContext.tsx` (or repo lint script)
