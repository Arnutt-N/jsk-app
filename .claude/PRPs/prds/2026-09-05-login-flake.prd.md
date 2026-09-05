# PRD — P1 Login Flake: Successful login bounces back to /login

> **Status**: READY (self-reviewed; awaiting owner nod before implementation)
> **Date**: 2026-09-05 · **Branch**: `fix/login-flake` · **Priority**: P1 (user-facing, frequent)
> **Source intake**: `project-log-md/zcode/session-summary-20260902-1808.md` (P1) · carried through `project-log-md/antigravity/session-summary-20260904-0900.md`

## Problem Statement

An admin user enters their username and password on the login page. The system shows
"เข้าสู่ระบบสำเร็จ" (login successful) — but the screen flashes and returns to the login
page, or stays stuck. They must press login again, sometimes several times, before the
admin dashboard actually opens.

This happens often in real use (real browser, real network) but never in the automated
tests, which is why it survived the previous review pipeline. It erodes trust: the system
says "success" and then behaves like failure.

## Solution

From the user's point of view: after a successful login, the admin dashboard opens on the
first try, every time. Logging out (or being timed out) in one tab no longer kicks the
user out of other tabs that hold a different, still-valid session.

Technically this means: one shared login state that both the login page and the admin
console read, so no re-verification round-trip happens in the gap between "logged in" and
"dashboard shown"; and logout messages between tabs are verified against the server
before a valid session is thrown away.

## User Stories

1. As an admin user, I want the dashboard to open immediately after the "login successful" toast, so that I don't have to guess whether I am logged in.
2. As an admin user, I want to log in successfully on the first attempt, so that I don't waste time re-entering my password.
3. As an admin user, I want a clear error message when login truly fails, so that "success then bounce" confusion disappears.
4. As an admin user working in two tabs, I want a logout in one tab to not affect a tab where I just logged in again, so that my fresh session survives.
5. As a supervisor (DIRECTOR/HEAD), I want the same reliable login behaviour as admins, so that my role doesn't change my experience.
6. As an agent, I want to reach the live-chat console without a login bounce loop, so that I can answer customers without delay.
7. As a user on a slow connection, I want the dashboard to wait for the auth check instead of bouncing me to login, so that slowness never looks like a logout.
8. As a user whose backend check fails transiently, I want a "retry" screen instead of being thrown to login, so that I don't lose my valid session.
9. As a maintainer, I want login state to live in one place, so that future auth changes have a single point of truth.
10. As a maintainer, I want the bounce paths covered by automated tests that can catch timing flakes, so that this class of bug cannot silently return.
11. As a maintainer, I want the fix to not require any database or API contract change, so that deployment risk stays low.
12. As the system owner, I want login reliability on real phones/browsers, so that staff trust the console during service hours.

## Implementation Decisions

1. **Single shared auth state (primary defect).** The login screen and the admin console
   each currently mount their own authentication provider — two disconnected copies of
   the login state. After a successful login, crossing into the admin console always
   boots a fresh provider that re-verifies the session over the network; any stumble in
   that window (definitive 401, or a cross-tab logout broadcast) redirects the user back
   to /login. Decision: back the provider with a module-level store (React
   `useSyncExternalStore`), so both trees read the same state and a freshly mounted
   admin tree sees "authenticated" immediately without a network round-trip. The public
   auth hook contract stays unchanged for all consumers.
2. **Remove the dead loading flag.** The login action sets a loading flag that the
   exposed state never reads (the exposed value derives loading from the status
   machine). Decision: delete the unused flag; loading is derived from the status
   machine only.
3. **Verify cross-tab logout before acting.** A logout/expiry broadcast from another tab
   currently clears the local session unconditionally. Decision: on receiving a
   broadcast, re-verify the local session with one cheap authenticated request; only
   clear the session when the server says it is really gone. Transient errors keep the
   session (retry-UI semantics already exist for bootstrap).
4. **No backend change.** Verified that the login endpoint persists the session and
   commits before the response is sent, so "the session row wasn't saved yet" is ruled
   out as a cause. No schema, no API contract change.
5. **Keep the existing safety semantics.** Cookie-only auth, `bootstrap_error` → retry
   screen (never redirect), single-flight silent refresh, and the CSRF interceptor stay
   as they are.
6. **Mechanism confirmation comes first.** The exact bounce path (definitive 401 during
   re-verification, cross-tab broadcast, or refresh-rotation reuse burning the session
   family) is proven by a reproduction run before fixes 1–3 are treated as the complete
   remedy; the repro result is recorded and may adjust the plan.

## Testing Decisions

- Good tests assert external behaviour only: "submitting valid credentials lands on the
  dashboard", "a second tab's logout does not clear a valid session in the first tab" —
  never internal state names.
- **Real-browser E2E (existing seam)**: extend the Playwright suite with a stability
  spec that repeats the login→dashboard transition 10 consecutive times with zero
  retries, so timing flakes surface locally, not only in production. Prior art:
  the existing cookie-auth flow spec and its shared login helper.
- **Unit tests (existing seam)**: extend the auth-context cookie test file — a freshly
  mounted provider must report authenticated without any network call when the shared
  store already holds a session; a logout broadcast must not clear a session the server
  still recognises. Prior art: the existing auth-context cookie tests.
- Backend suite: unaffected (no backend change); run only to prove no accidental coupling.

## Out of Scope

- Server-side route protection for /admin (a server gate / middleware) — valuable but a
  separate decision with its own PRD; the client-side guard remains the gate for now.
- LIFF-side authentication flows.
- Login rate-limiter UX (429 copy/behaviour) — tracked separately from the flake.
- Session-timeout warning redesign and refresh-token rotation policy changes.

## Further Notes

- Static evidence, hypothesis ranking, and exact code locations live in the
  implementation plan for this PRD (same date, `plans/` folder).
- The reproduction task is deliberately the first plan task: it either confirms the
  ranked hypotheses or rewrites them, before any production-path code changes.
