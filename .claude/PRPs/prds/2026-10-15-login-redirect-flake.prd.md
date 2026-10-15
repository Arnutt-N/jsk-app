# PRD — Login redirect flake (2026-10-15, recurrence of P1 2026-09-05)

## Problem (user-visible)
กดปุ่มล็อกอิน มี toast "สำเร็จ" แต่หน้ายังนิ่งอยู่ที่หน้า login ไม่พาเข้า admin panel
ต้องกดล็อกอินซ้ำอีกครั้งจึงเข้าได้ บางครั้งกดซ้ำก็ยังนิ่ง

## Evidence-ranked hypotheses
1. **H1 — stale bootstrap clobber (prime suspect).** `/login` mounts `AuthProvider`
   whose `initCookieAuth` starts `GET /auth/me` while store status is `loading`.
   The effect guards only at start (`status !== 'loading' → return`). If the user
   logs in mid-bootstrap (transient 5xx backoff window, slow `/auth/me`), `login()`
   sets store to `authenticated`, then the still-running bootstrap loop finishes
   with a stale 401/`bootstrap_error` and unconditionally overwrites the fresh
   session → `AdminAuthGate` bounces straight back to `/login`. Toast already
   queued, so the user sees "success" while staying on the same page. A second
   login works because no bootstrap is in flight anymore. Timing-dependent →
   explains "sometimes works, sometimes stuck".
2. **H2 — cookies not stored (ruled unlikely locally).** Same-origin rewrite
   (`/api/v1` → backend), `Secure` off outside production, `SameSite=Strict`
   is same-site safe. If cookies were rejected, EVERY login would fail, not
   just the first attempt.
3. **H3 — role-guard bounce (not this symptom).** Would leave the URL on `/admin`
   with a spinner, not stuck on `/login`.

## Scope
- `frontend/contexts/AuthContext.tsx` bootstrap writes only. No API, schema, or
  routing changes.
- Regression test in `frontend/contexts/__tests__/AuthContext.cookie.test.tsx`.

## Acceptance criteria
- Login → `/admin` transition sticks on the FIRST attempt even when a bootstrap
  `/auth/me` round-trip is still in flight (repro test fails before fix, passes after).
- Explicit user actions (login/logout/retry) always win over a stale bootstrap;
  a stale bootstrap never overwrites a non-`loading` store.
- Existing auth test suites + lint/typecheck stay green.
- Iron rule: no secret material in logs, docs, or chat output (counts only).
