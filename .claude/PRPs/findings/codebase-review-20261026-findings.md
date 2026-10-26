# Codebase Review Findings: JskApp full codebase

**Skill**: `codebase-review-fix` v2.0.0 (2026-10-26)
**Reviewed**: 2026-10-26
**Scope**: full codebase
**Summary**: 10 High · 15 Medium · 9 Low (after deduplication, 34 unique from 35 raw)

Reviewers ran read-only in parallel: backend security, frontend correctness, tests + CI, architecture +
dependencies. Every finding below was returned with a file:line and a concrete failure path; six
high-risk claims were re-verified against the tree during triage (gate usage, policy cache, refresh
retry predicate, CD trigger, hardcoded nav roles, abort-error handling).

F-022 merges two reports of one root cause (unpinned production installs in `cd.yml` and `e2e.yml`).
No finding was rejected: none was disproven on re-check.

## Accepted Findings (Binding Spec for PRP)

| ID | Severity | Category | Location | Reporters | Root Cause & Evidence | Fix Direction |
|---|---|---|---|---|---|---|
| F-001 | High | vulnerability | `backend/app/api/v1/endpoints/admin_live_chat.py:149` | 1 (backend) | Live-chat HTTP writes (send :149, claim :228, close :259, transfer :286, mode :340, archive :568, delete :661) gate on `get_current_staff` only, while the WS gate enforces `KEY_ACCESS_LIVE_CHAT`; HEAD/DIRECTOR pass HTTP but are rejected at the socket | Gate every state-changing live-chat HTTP route on `require_permission(KEY_ACCESS_LIVE_CHAT)`; keep the permissive gate for read/page-load routes only |
| F-002 | High | vulnerability | `backend/app/core/permissions.py:173` | 1 (backend) | `_policy_cache` is per-process; only the PATCH worker refreshes, no TTL or cross-worker invalidation, so revocations do not reach other gunicorn/Koyeb workers | Invalidate across workers (Redis pub/sub or short-TTL re-read) before relying on the matrix for revocations |
| F-003 | Medium | vulnerability | `backend/app/core/config.py:46` | 1 (backend) | `ENVIRONMENT` defaults to `development` with `env_ignore_empty`, so an empty prod value disables SECRET_KEY guards, the `secure` cookie flag, and permits `DEV_AUTH_BYPASS` (any request as user id 1) | Default ENVIRONMENT to `production` or require it explicitly |
| F-004 | Medium | vulnerability | `backend/app/core/permissions.py:208` | 1 (backend) | Any exception while reading `permission_settings` replaces every customised rule with permissive `DEFAULT_POLICY` for the life of the process | Fail closed on failed policy load (deny + alert) instead of substituting the default |
| F-005 | Medium | vulnerability | `backend/app/api/v1/endpoints/webhook.py:39` | 1 (backend) | Public unauthenticated POST buffers the full body before signature verification, with no size cap | Reject above a small Content-Length cap and stream-with-limit before verifying |
| F-006 | Medium | missing-audit | `backend/app/api/v1/endpoints/media.py:540` | 1 (backend) | Public-link create/revoke/bulk paths change world-readability of citizen uploads with no audit row (unlike delete paths) | Emit `create_audit_log` rows on all three paths |
| F-007 | Medium | missing-audit | `backend/app/api/v1/endpoints/admin_live_chat.py:686` | 1 (backend) | `delete_conversation` force-closes any session via the permissive gate, stamps `ClosedBy.OPERATOR` instead of the actor, writes no audit row | Require the live-chat permission key plus ownership check, record the actor, emit an audit row |
| F-008 | Low | bug | `backend/app/api/deps.py:135` | 1 (backend) | `secrets.compare_digest` raises TypeError on non-ASCII header values, turning a bad CSRF header into a 500 instead of 403 | Encode both sides or wrap so malformed input yields 403 |
| F-009 | Low | edge-case | `backend/app/api/v1/endpoints/auth.py:144` | 1 (backend) | `or_(username ==, email ==)` can match two different rows, raising MultipleResultsFound → 500 on login | Disambiguate deterministically (username first, email fallback) |
| F-010 | Low | vulnerability | `backend/app/api/v1/endpoints/auth.py:188` | 1 (backend) | Unknown identifiers skip bcrypt, so timing distinguishes valid from invalid usernames | Run a dummy `verify_password_async` on the not-found path |
| F-011 | Low | edge-case | `backend/app/api/v1/endpoints/webhook.py:40` | 1 (backend) | `body.decode('utf-8')` runs before verification; non-UTF-8 input 500s with traceback | Catch UnicodeDecodeError and return 400 |
| F-012 | High | logic-error | `frontend/lib/authFetch.ts:126` | 1 (frontend) | Only `/auth/refresh` is exempt from refresh-then-replay, so a 401 from `/auth/login` (wrong credentials) triggers a refresh cycle instead of surfacing the answer | Treat auth-entry endpoints (login, migrate-session, ws-ticket) as non-retryable |
| F-013 | High | bug | `frontend/contexts/AuthContext.tsx:218` | 1 (frontend) | `verifyThenApplyRemoteLogout` has no re-entrancy guard; its own 401 re-enters `notifyAuthExpired` and starts a second copy before the first resolves | Add an in-flight/once-only flag or clear the store before awaiting |
| F-014 | Medium | logic-error | `frontend/hooks/useLiveChatSocket.ts:202` | 1 (frontend) | `retryMessage` sends with no room guard or `line_user_id` while siblings early-return on null room; `leaveRoom` clears the room but not pending messages | Guard retries on the originating room and prune pending on room switch |
| F-015 | Medium | edge-case | `frontend/lib/api-error.ts:159` | 1 (frontend) | `AbortSignal.timeout` aborts with `TimeoutError`, which the catch does not recognise, so deliberate timeouts surface as unexpected errors | Also treat `TimeoutError` as the abort result |
| F-016 | Low | bad-practice | `frontend/lib/api-error.ts:43` | 1 (frontend) | Non-JSON error bodies are returned verbatim into caller UI | Return the caller fallback/Thai status message; keep raw text for the logger |
| F-017 | High | missing-test | `frontend/playwright.config.ts:26` | 1 (tests) | `live-chat-2client.spec.ts` runs only via a manual npm script; no workflow references `2client`, so the multi-operator suite never runs in CI | Add a CI job for `test:e2e:2client` or delete the config if intentionally manual |
| F-018 | High | regression-risk | `.github/workflows/cd.yml:5` | 1 (tests) | CD triggers on `CI` only; the Playwright suite lives in `e2e.yml`, so a merge can deploy while E2E is red or running | Gate CD on both CI and E2E conclusions for the same head SHA |
| F-019 | High | bad-practice | `backend/tests/test_gate_test_coverage.py:40` | 1 (tests) | Substring match over raw test text counts docstrings/comments as coverage, so an unwired new gate still passes its own guard | Match concrete usage (overrides key, monkeypatch target, decorator argument) |
| F-020 | Medium | bad-practice | `frontend/e2e/login-stability.spec.ts:22` | 1 (tests) | Asserts only `not.toHaveURL(/\/login/)` after a fixed sleep; any non-login URL passes, including error pages | Assert the positive landing state and await it |
| F-021 | Medium | missing-test | `frontend/e2e/admin-requests-polish.spec.ts:200` | 1 (tests) | Nine data-dependent `test.skip` guards let the suite report green while asserting nothing when seeded rows are absent | Create rows with `createRequestFixture` and fail when a fixture the spec created has no trigger |
| F-022 | High | dependency-risk | `.github/workflows/cd.yml:232`, `.github/workflows/e2e.yml:95` | 2 (tests, architecture) | Production deploy installs unpinned `requirements.txt` (`>=` ranges) while CI validates the lock file; the artifact that ships is never the set CI verified | Install `requirements-lock.txt` in `cd.yml` and `e2e.yml` |
| F-023 | Medium | regression-risk | `backend/tests/test_image_resize_security.py:92` | 1 (tests) | RED-phase `pytest.skip` on a now-existing attribute turns the upload-ticket security suite into silent skips on any rename | Drop the skip guard and let AttributeError fail loudly |
| F-024 | Medium | bad-practice | `.github/workflows/cd.yml:393` | 1 (tests) | Smoke jobs exit 0 with only a warning when healthcheck vars/secrets are unset, so green CD can mean "never checked" | Fail (or explicitly mark skipped) when the healthcheck URL is unconfigured |
| F-025 | Medium | bad-practice | `frontend/e2e/admin-requests-polish.spec.ts:68` | 1 (tests) | Seventeen bare `page.goto('/admin/...')` calls remain outside `audit-verify` while the repo rule requires `gotoAdmin` (15s nav timeout vs cold compile) | Replace the remaining bare admin navigations with `gotoAdmin` |
| F-026 | Medium | maintainability | `.github/workflows/ci.yml:124` | 1 (tests) | Backend verification is pytest only; no ruff/mypy anywhere, so Python lint/type regressions land unfenced | Add a ruff (optionally mypy) step for `backend/` to ci.yml |
| F-027 | Low | bad-practice | `frontend/playwright.config.ts:33` | 1 (tests) | No `forbidOnly`, so a committed `test.only` silently shrinks the suite while CI stays green | Set `forbidOnly: !!process.env.CI` in both Playwright configs |
| F-028 | Low | missing-test | `frontend/vitest.config.ts:31` | 1 (tests) | No coverage block in Vitest and no `--cov` in pytest, so no enforceable floor on destructive/broadcast paths | Enable coverage with a threshold gate in ci.yml |
| F-029 | Low | bad-practice | `frontend/e2e/admin-requests-polish.spec.ts:216` | 1 (tests) | Screenshot-baseline test is permanently skipped (env var never set) while appearing as a suite member | Move baseline capture to a manual script or scheduled job |
| F-030 | Low | missing-test | `frontend/e2e/live-chat-smoke.spec.ts:122` | 1 (tests) | A11y guard skips when no conversation exists, so the accessible-name assertion never runs on empty seeds | Seed a conversation in the spec and assert unconditionally |
| F-031 | High | architecture | `frontend/app/admin/layout.tsx:255` | 1 (architecture) | Sidebar hardcodes per-item role arrays while the real gates are DB-configurable permission keys; no frontend consumer reads `GET /permissions/me` | Drive nav visibility and page guards from the served capability map |
| F-032 | High | configuration | `backend/app/core/config.py:118` | 1 (architecture) | `REDIS_URL` silently defaults to localhost with no production guard; every redis failure degrades to per-process limits | Require a non-localhost REDIS_URL in production and fail startup when Redis is unreachable |
| F-033 | Medium | logic-error | `frontend/app/admin/layout.tsx:83` | 1 (architecture) | Path authorization is declared three times (layout, per-page `PageAccessGuard`, backend deps) with no single source | Collapse into one route→permission-key manifest consumed by layout and page guards |
| F-034 | Medium | maintainability | `backend/app/api/v1/endpoints/admin_requests.py:308` | 1 (architecture) | `list_requests` builds its Bangkok window inline although `app/core/date_windows.py` is imported in the same file and mandated by the repo rule | Replace with the shared half-open UTC helper |

## Deferred / Rejected Findings

| ID | Severity | Disposition | Location | Reason |
|---|---|---|---|---|
| — | — | — | — | None. Every accepted finding above is in scope for the PRP plan. |
