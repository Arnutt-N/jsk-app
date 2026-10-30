# [Codebase Review 2026-10-26] Implementation Plan (rev.4 — loop-3 gate feedback applied)

> **For agentic workers:** use superpowers:subagent-driven-development or superpowers:executing-plans,
> task by task. Steps use checkbox syntax. Validate immediately after every change; never accumulate
> broken state.

**Goal:** Fix all 34 accepted findings F-001–F-034, High first, with a test or CI proof per fix.

**Source PRD**: `.claude/PRPs/prds/codebase-review-20261026.prd.md`
**Findings spec**: `.claude/PRPs/findings/codebase-review-20261026-findings.md` (binding; every F-xxx below maps to it)
**Branch**: `fix/codebase-review-20261026` (already created from `main`-line work)
**Tech Stack:** FastAPI + SQLAlchemy 2 async + Pydantic V2 · Next.js 16 + React 19 + TS 5 · pytest / Vitest / Playwright · GitHub Actions
**Revision note:** rev.1 failed the `prp-validate-plan` gate (missing patterns, undecided options,
no build step, no risks, no edge-case list, partial site lists). Everything below is new in rev.2.

## Execution order (binding)

Work proceeds in phases regardless of task numbers. Do not start a later phase until the earlier
phase is green on this branch:

- **Phase 0 — trustworthy signals:** Tasks 13, 14, 18, 22, 24 (CI/E2E/lockfile/lint/coverage gates).
- **Phase 1 — High findings:** Tasks 1, 2, 8, 9, 15, 27, 28 (F-001, F-002, F-012, F-013, F-019, F-031, F-032)
  plus Tasks 13, 14, 18 already done in Phase 0 (F-017, F-018, F-022 are High findings whose fix
  is the Phase 0 work itself).
- **Phase 2 — Medium findings:** Tasks 3, 4, 5, 6, 10, 11, 16, 17, 19, 20, 21, 29, 30 (F-005+F-011 share
  Task 5; F-006+F-007 share Task 6; F-003, F-004, F-014, F-015, F-020, F-021, F-023–F-026, F-033, F-034 map 1:1).
- **Phase 3 — Low findings:** Tasks 7 (F-008–F-011), 12 (F-016), 23 (F-027), 25 (F-029), 26 (F-030).
  (Task 24 is Phase 0 infrastructure despite F-028 being Low; Task 22 is Phase 0 despite gating new code.)

Backend tasks need a running DB and the project venv: `backend/venv/Scripts/python.exe` on Windows,
or `python` inside the activated venv on WSL (repo rule: WSL for development). Frontend e2e tasks need dev
servers plus `createRequestFixture` rows and the 60s `gotoAdmin` budget.
Fixture rule (propagated to every e2e-writing task): specs create the rows they operate on via
`createRequestFixture` (after `captureCsrf`) and never rely on seeded rows; navigations use `gotoAdmin`.

## Reusable patterns (copy these, do not invent variants)

**Backend gate:** `from app.api.deps import require_permission` then
`Depends(require_permission(KEY_ACCESS_LIVE_CHAT))` (keys live in `app.core.permissions`;
see `deps.py:260`).
**Audit row:** `from app.core.audit import create_audit_log` then
`await create_audit_log(db, admin_id=..., action="...", resource_type="...", resource_id=str(...),
details={...})` (shape at `app/core/audit.py:110`, used at `media.py:358`).
**Password check:** `from app.core.security import verify_password_async`;
`await verify_password_async(plain, hashed)` (see `security.py:52`, used at `auth.py:194`).
**Date window:** `from app.core.date_windows import bangkok_today_start_utc` (helper at
`date_windows.py:24`).
**Pytest:** `python -m pytest -q tests/test_x.py -k "name"`; async tests use `@pytest.mark.asyncio`;
auth overrides go through dependency_overrides, never substring tricks.
**Vitest:** `npm run test:unit -- <path>`; existing examples at
`frontend/components/ui/__tests__/pending-dismiss.test.tsx`.
**E2E nav/fixture:**
`import { gotoAdmin } from '../utils/nav'; await gotoAdmin(page, '/admin/requests')`
`import { captureCsrf, createRequestFixture } from '../utils/request-fixture';`
`captureCsrf(page); await loginAsAdmin(page); await createRequestFixture(page, 'Name');`

## UX contract (applies to the five UI-affecting tasks; everything else is N/A — internal change)

- Task 12 (F-016): before, an HTML error page body renders verbatim in the toast; after, the toast
  shows the Thai status message and the raw body stays in the server logs only.
- Task 27 (F-031): before, the sidebar shows hardcoded menus that disagree with the DB matrix; after,
  the same menus appear/disappear from the served capability map with identical styling and order.
- Task 29 (F-033): before, three declarations can disagree; after, routing behaviour is identical,
  only the source is single.
- Task 8 (F-012): before, a wrong password hangs the UI in a refresh loop before surfacing; after, the login error surfaces immediately while an expired session still refreshes once.
- Task 11 (F-015): before, a cancelled or timed-out fetch can flash an error toast and clear another request's loading state; after, aborted requests are silent and loading belongs to the latest request only.
Loading, error, and empty states do not change in any other task.

## Risks and mitigations

| Risk | Tasks | Mitigation / rollback |
|---|---|---|
| Locking admins out via matrix/nav refactor | 2, 27, 29 | Verify the AGENT/VIEWER/ADMIN matrix in e2e before merge; revert is one commit per task |
| Redis outage on fail-closed boot | 28 | Gate applies to production-like boot only; local dev keeps the localhost default; document the env var in the commit message |
| Lockfile drift breaks installs | 18 | Pin first, run full CI; if a transitive pin conflicts, unpin that single package with a comment and re-run |
| E2E flake masks regressions | 13, 16, 17, 21, 25, 26, 30 | `retries: 0` in the touched specs (already the rule for `admin-audit-verify`); `gotoAdmin` everywhere; fixtures owned per spec |
| Coverage floor blocks unrelated work | 24 | Measure current coverage first, set the floor at the measured value, raise later |
| Two-worker divergence during rollout | 2 | TTL re-read bounds staleness even mid-deploy; verify with a two-process test |

## Edge-case checklist (assert these, not just the happy path)

- Auth: HEAD/DIRECTOR/AGENT/ADMIN/SUPER_ADMIN × each live-chat write (403 vs 200); malformed and
  non-ASCII CSRF headers; colliding username/email; unknown-user timing within noise of known-user.
- Policy: exception during load denies; revocation visible from a second worker within the TTL.
- Webhook: 2 MiB body → 413 (over the 1 MiB cap); non-UTF-8 body → 400; valid signature still 200.
- Frontend: login 401 never refreshes; double expiry probes once; retry after room switch sends
  nowhere; aborted fetch sets no error and clears no newer loading state; unmount cancels in-flight.
- E2E: empty DB (fixture path), seeded DB (no interference), cold compile (gotoAdmin budget),
  `test.only` committed (CI must fail).
- Dates: boundary start/end days match across requests/audit/reports windows.

Thresholds: webhook cap **1 MiB** (the 2 MiB probe is the over-cap case); request timeout default per
call site (`timeoutMs: 15_000` for DELETE, matching the existing pattern); coverage floors
measured-then-pinned in Task 24.

## Global Constraints

- Fix root causes, not symptoms. No unrelated refactoring. No new features.
- Never print secret material; verify by counts/presence only.
- Backend changes: scoped pytest proof + `python -m compileall -q app` + `ruff check app/... tests/...` from `backend/` (all backend paths in Run steps are relative to `backend/`; `compileall`/`pytest`/`ruff` targets likewise).
- Frontend changes: `npm run lint` + scoped unit or e2e proof + `npm run build` for any task touching
  `frontend/app`, `frontend/components`, or `frontend/lib`.
- Workflow (`.github/`, config) changes: link the green CI run for this branch's exact SHA as proof;
  "dry-read the workflow" is not proof.
- If a task must deviate, log WHAT + WHY as a deviation entry; if new scope appears, append an F-xxx
  and re-run the gate before implementing it.

## NOT Building

Nothing is deferred: every accepted finding F-001–F-034 has a task below. Out of scope: new features,
performance work, and the named follow-ups in `.audit/review-record-admin-p1-fixes.md`.

---

### Task 1: Gate live-chat HTTP writes on the permission key (F-001)

**Files:** Modify `backend/app/api/v1/endpoints/admin_live_chat.py` (send :149, claim :228, close :259, transfer :286, mode :340, archive :568, delete :661)
**Consumes:** `require_permission(KEY_ACCESS_LIVE_CHAT)` from `app.api.deps` (see Reusable patterns).

- [ ] **Step 1: Failing check** — as HEAD/DIRECTOR, POST a live-chat write; assert it currently succeeds at HTTP while the WS gate rejects.
- [ ] **Step 2: Implement** — replace `get_current_staff` with the permission-key gate on state-changing routes only; keep the permissive gate on read/page-load routes.
- [ ] **Step 3: Verify** — HEAD/DIRECTOR writes now 403; AGENT/SUPER_ADMIN/ADMIN writes still work; reads unchanged.
- [ ] **Step 4: Run** — `python -m pytest -q tests/ -k live_chat` + new test asserting the 403 + `python -m compileall -q app` + `ruff check app/api/v1/endpoints/admin_live_chat.py`.
- [ ] **Step 5: Commit** — `git commit -m "fix(security): gate live-chat HTTP writes on KEY_ACCESS_LIVE_CHAT"`

### Task 2: Cross-worker policy invalidation (F-002) — DECIDED: short-TTL re-read

**Files:** Modify `backend/app/core/permissions.py` (`_policy_cache`, `_check`), `backend/app/api/v1/endpoints/settings.py` (PATCH path)
**Consumes:** existing Redis client (`app.core.redis_client`); no new infrastructure.
**Decision:** short-TTL re-read (not pub/sub): simpler, no new channels. State: module-level
`_policy_loaded_at: float | None` set on every successful `load_policy`; `_check` re-reads when older
than 30s; a re-read exception denies the request (fail closed, consistent with Task 4) instead of
serving stale.

- [ ] **Step 1: Failing check** — change a permission via PATCH, then read the matrix from a second worker/process; assert staleness.
- [ ] **Step 2: Implement** — re-read the DB-backed matrix when the cached entry is older than 30s; keep the in-process fast path otherwise.
- [ ] **Step 3: Verify** — revocation propagates within 30s; single-process behaviour unchanged.
- [ ] **Step 4: Run** — `python -m pytest -q tests/ -k permission` + new propagation test + `python -m compileall -q app` + `ruff check app/core/permissions.py`.
- [ ] **Step 5: Commit** — `git commit -m "fix(security): bound permission policy staleness with TTL re-read"`

### Task 3: ENVIRONMENT fail-safe default (F-003)

**Files:** Modify `backend/app/core/config.py:46`
**Consumes:** `is_production_like` at `config.py:160`; guards at `config.py:200-224`.

- [ ] **Step 1: Failing check** — boot with empty ENVIRONMENT; assert `is_production_like` is False today.
- [ ] **Step 2: Implement** — default to `"production"` (explicit value still wins).
- [ ] **Step 3: Verify** — empty value boots production-like; guards enforced.
- [ ] **Step 4: Run** — `python -m pytest -q tests/test_config*.py` (or new unit test) + `python -m compileall -q app` + `ruff check app/core/config.py`.
- [ ] **Step 5: Commit** — `git commit -m "fix(security): fail-safe ENVIRONMENT default"`

### Task 4: Fail closed on policy load failure (F-004)

**Files:** Modify `backend/app/core/permissions.py:208`
**Consumes:** alert path = `logger.error` (stdlib logging, same as `api-error.ts` logging pattern on the frontend).

- [ ] **Step 1: Failing check** — simulate a read exception; assert customised rules are replaced today.
- [ ] **Step 2: Implement** — deny the requested key (empty set) plus a logged alert.
- [ ] **Step 3: Verify** — exception path denies; healthy path unchanged.
- [ ] **Step 4: Run** — `python -m pytest -q tests/ -k permission` + new test + `python -m compileall -q app` + `ruff check app/core/permissions.py`.
- [ ] **Step 5: Commit** — `git commit -m "fix(security): fail closed on permission policy load failure"`

### Task 5: Webhook body cap and decode order (F-005, F-011)

**Files:** Modify `backend/app/api/v1/endpoints/webhook.py:39-43`
**Consumes:** `request.headers.get("content-length")`; stream read with limit.

- [ ] **Step 1: Failing check** — POST a 2 MiB body and a non-UTF-8 body; assert unbounded buffering and a 500 today.
- [ ] **Step 2: Implement** — reject above 1 MiB before buffering; catch UnicodeDecodeError → 400.
- [ ] **Step 3: Verify** — both rejected cleanly; valid signed payloads still verify.
- [ ] **Step 4: Run** — `python -m pytest -q tests/ -k webhook` + new tests + `python -m compileall -q app` + `ruff check app/api/v1/endpoints/webhook.py`.
- [ ] **Step 5: Commit** — `git commit -m "fix(security): cap webhook bodies and decode safely"`

### Task 6: Audit rows for visibility and conversation lifecycle (F-006, F-007)

**Files:** Modify `backend/app/api/v1/endpoints/media.py:540,563,629`, `backend/app/api/v1/endpoints/admin_live_chat.py:686`
**Consumes:** `create_audit_log` from `app.core.audit` (see Reusable patterns).

- [ ] **Step 1: Failing check** — exercise each path; assert no audit row exists today.
- [ ] **Step 2: Implement** — `create_audit_log` on all three link paths; gate `delete_conversation` on the
  same `require_permission(KEY_ACCESS_LIVE_CHAT)` key used in Task 1 AND require ownership
  (`session.assigned_agent_id == current_admin.id`) or role in (SUPER_ADMIN, ADMIN); unclaimed sessions
  (assignee null) require SUPER_ADMIN/ADMIN. Record the actor as `details={"actor_id": current_admin.id,
  "force_close": True}` in the audit row; `closed_by` stays the `ClosedBy` enum (a String(20) enum
  column per `app/models/chat_session.py:12-35`, it cannot hold an id).
- [ ] **Step 3: Verify** — rows exist with actor, resource, action for each path; non-owner, non-admin
  force-close returns 403.
- [ ] **Step 4: Run** — `python -m pytest -q tests/ -k "media or live_chat"` + new tests + `python -m compileall -q app` + `ruff check app/api/v1/endpoints/media.py app/api/v1/endpoints/admin_live_chat.py`.
- [ ] **Step 5: Commit** — `git commit -m "fix(audit): log public-link changes and conversation force-close"`

### Task 7: CSRF compare, login disambiguation, login timing (F-008, F-009, F-010)

**Files:** Modify `backend/app/api/deps.py:135`, `backend/app/api/v1/endpoints/auth.py:144,188`
**Consumes:** `verify_password_async` from `app.core.security` (see Reusable patterns).

- [ ] **Step 1: Failing check** — non-ASCII CSRF header (500 today); colliding username/email fixture; timing delta between known/unknown users.
- [ ] **Step 2: Implement** — encode both compare sides; username-first-then-email resolution; dummy `verify_password_async` on the not-found path.
- [ ] **Step 3: Verify** — 403 / deterministic user / timing equalised.
- [ ] **Step 4: Run** — `python -m pytest -q tests/ -k "auth or csrf or login"` + `python -m compileall -q app` + `ruff check app/api/v1/endpoints/auth.py app/api/deps.py`.
- [ ] **Step 5: Commit** — `git commit -m "fix(auth): harden CSRF compare, login resolution, and timing"`

### Task 8: Auth-entry endpoints are not refreshable (F-012)

**Files:** Modify `frontend/lib/authFetch.ts:89,126,146`
**Consumes:** existing `isRefreshRequest` predicate; extend it.

- [ ] **Step 1: Failing check** — unit-test the retry predicate with a login 401; assert it retries today.
- [ ] **Step 2: Implement** — extend the non-retryable set to login, migrate-session, ws-ticket.
- [ ] **Step 3: Verify** — login 401 surfaces; expired-session 401 still refreshes once.
- [ ] **Step 4: Run** — `npm run test:unit -- authFetch` (new cases) + `npm run lint` + `npm run build`.
- [ ] **Step 5: Commit** — `git commit -m "fix(auth): stop refreshing auth-entry 401s"`

### Task 9: Remote-logout re-entrancy guard (F-013)

**Files:** Modify `frontend/contexts/AuthContext.tsx:218`
**Consumes:** `AuthContext` from `@/contexts/AuthContext`; test via `@testing-library/react` `renderHook` + `waitFor` (already used in this repo's hook tests).

- [ ] **Step 1: Failing check** — unit-test double expiry; assert two probes today.
- [ ] **Step 2: Implement** — in-flight/once-only flag (or clear store before awaiting).
- [ ] **Step 3: Verify** — exactly one probe; store ends logged-out.
- [ ] **Step 4: Run** — `npm run test:unit -- AuthContext` (new cases) + `npm run lint` + `npm run build`.
- [ ] **Step 5: Commit** — `git commit -m "fix(auth): guard remote-logout re-entrancy"`

### Task 10: Socket retry bound to its room (F-014)

**Files:** Modify `frontend/hooks/useLiveChatSocket.ts:183,191,202,256`
**Consumes:** the hook module itself (`@/hooks/useLiveChatSocket`); pending-entry type extended in place.

- [ ] **Step 1: Failing check** — unit-test retry-after-room-switch; assert it routes to the new room today.
- [ ] **Step 2: Implement** — store room id per pending entry; guard `retryMessage`; prune on switch.
- [ ] **Step 3: Verify** — stale retry never sends to the wrong room.
- [ ] **Step 4: Run** — `npm run test:unit -- useLiveChatSocket` (new cases) + `npm run lint` + `npm run build`.
- [ ] **Step 5: Commit** — `git commit -m "fix(live-chat): bind socket retries to their room"`

### Task 11: Recognise timeout aborts (F-015)

**Files:** Modify `frontend/lib/api-error.ts:159`
**Consumes:** existing `aborted: true` discriminator (added on this branch).

- [ ] **Step 1: Failing check** — unit-test a `timeoutMs` abort; assert it surfaces as unexpected-error today.
- [ ] **Step 2: Implement** — treat `TimeoutError` as the abort result (`aborted: true`, no log).
- [ ] **Step 3: Verify** — timeout callers see `aborted`, never an error toast path.
- [ ] **Step 4: Run** — `npm run test:unit -- api-error` (new cases) + `npm run lint` + `npm run build`.
- [ ] **Step 5: Commit** — `git commit -m "fix(api): recognise timeout aborts distinctly"`

### Task 12: Error bodies stay out of the UI (F-016)

**Files:** Modify `frontend/lib/api-error.ts:43`
**Consumes:** existing fallback message parameter.

- [ ] **Step 1: Failing check** — unit-test a text/plain 500; assert the raw body reaches the caller today.
- [ ] **Step 2: Implement** — return fallback message to callers; keep raw text in the log call.
- [ ] **Step 3: Verify** — UI shows the safe message (see UX contract); logs keep the body.
- [ ] **Step 4: Run** — `npm run test:unit -- api-error` + `npm run lint` + `npm run build`.
- [ ] **Step 5: Commit** — `git commit -m "fix(api): keep raw error bodies out of caller UI"`

### Task 13: Run the 2-client suite in CI (F-017)

**Files:** Modify `.github/workflows/e2e.yml` (new job or step running `npm run test:e2e:2client`; the workflow's `name:` field is `E2E (Playwright)`)
**Consumes:** same backend/DB services as the existing smoke job in that file.

- [ ] **Step 1: Failing check** — confirm no workflow references `2client` today (`grep -rn 2client .github/`).
- [ ] **Step 2: Implement** — add the job with the same services as the smoke job.
- [ ] **Step 3: Verify** — a PR run shows the job executing (pass or genuine fail, never absent); link the green run SHA.
- [ ] **Step 4: Run** — green CI SHA on this branch as the proof artifact, plus local YAML validity: `python -c "import yaml; yaml.safe_load(open('.github/workflows/e2e.yml'))"`.
- [ ] **Step 5: Commit** — `git commit -m "ci(e2e): run the 2-client live-chat suite"`

### Task 14: Gate CD on CI and E2E (F-018) — DECIDED: polling gate, not a second trigger

**Files:** Modify `.github/workflows/cd.yml` (trigger block comment; new `Gate on E2E (Playwright)` step in `resolve-scope`; `resolve-scope` timeout 5 → 15 min)
**Decision:** keep `workflows: ["CI"]` and gate on E2E by polling. Adding `"E2E (Playwright)"` to the list (the original plan) breaks two things:
1. `cd.yml` downloads the `cd-scope` artifact with `run-id: ${{ github.event.workflow_run.id }}`. That artifact is produced by `ci.yml` only, so an E2E-triggered CD run would look for an artifact that never existed.
2. CI and E2E run in parallel for one push, so triggering from each deploys the same SHA twice.

The intent — "require both conclusions for the same head SHA" — is met by the gate step: it polls `gh api .../workflows/e2e.yml/runs?head_sha=<sha>` until the E2E run for this exact commit completes, then exits 0 only on `success` (nonzero on any other conclusion or on a 10-minute timeout).

- [ ] **Step 1: Failing check** — confirm CD triggers on `CI` only today.
- [ ] **Step 2: Implement** — `Gate on E2E (Playwright)` step in `resolve-scope`, guarded on `github.event_name == 'workflow_run'`.
- [ ] **Step 3: Verify** — the gate script against both cases on this repo: a SHA whose E2E succeeded (exit 0) and a SHA whose E2E failed (exit 1). A real red-E2E-blocks-deploy CI cycle is only observable on `main`; deferred to the first CD cycle after this branch merges.
- [ ] **Step 4: Run** — green CI SHA on this branch as the proof artifact, plus local YAML validity: `python -c "import yaml; yaml.safe_load(open('.github/workflows/cd.yml'))"`.
- [ ] **Step 5: Commit** — `git commit -m "ci(cd): gate deploys on CI and E2E"`

### Task 15: Make the gate-coverage test concrete (F-019)

**Files:** Modify `backend/tests/test_gate_test_coverage.py:40`
**Consumes:** AST or string match on override keys / decorator arguments.

- [ ] **Step 1: Failing check** — add a comment-only mention of a fake gate; assert the guard passes today.
- [ ] **Step 2: Implement** — match concrete usage (overrides key, monkeypatch target, decorator argument).
- [ ] **Step 3: Verify** — comment-only mention fails; real usage passes.
- [ ] **Step 4: Run** — `python -m pytest -q tests/test_gate_test_coverage.py` + `python -m compileall -q tests` + `ruff check tests/test_gate_test_coverage.py`.
- [ ] **Step 5: Commit** — `git commit -m "test(gates): require concrete usage in gate coverage"`

### Task 16: Assert the positive login landing (F-020)

**Files:** Modify `frontend/e2e/login-stability.spec.ts:21-22`
**Consumes:** `gotoAdmin` + `createRequestFixture` not needed here; plain admin page assertion.

- [ ] **Step 1: Failing check** — fill a wrong password and submit; assert the page stays on `/login`
  with an error today (proving the current form cannot tell success from failure either).
- [ ] **Step 2: Implement** — assert `toHaveURL(/\/admin/)` plus a rendered admin element, awaited instead of slept.
- [ ] **Step 3: Verify** — green on a healthy login; red if navigation lands elsewhere.
- [ ] **Step 4: Run** — `npm run test:e2e -- login-stability` + `npm run lint` + `npm run build`.
- [ ] **Step 5: Commit** — `git commit -m "test(e2e): assert the positive login landing"`

### Task 17: Fixture-owned rows in the polish suite (F-021)

**Files:** Modify `frontend/e2e/admin-requests-polish.spec.ts` skip sites at lines 81, 99, 126, 153, 170, 200, 216, 226 (plus the multiline block at 216)
**Consumes:** `captureCsrf` + `createRequestFixture` from `e2e/utils/request-fixture` (see Reusable patterns).

- [ ] **Step 1: Failing check** — run with an empty table; assert the suite skips instead of failing today.
- [ ] **Step 2: Implement** — `createRequestFixture` (after `captureCsrf`) in each spec; replace every
data-dependent skip with a hard failure so an empty DB fails loudly.
- [ ] **Step 3: Verify** — empty DB run fails loudly; seeded run passes.
- [ ] **Step 4: Run** — `npm run test:e2e -- admin-requests-polish` + `npm run lint` + `npm run build`.
- [ ] **Step 5: Commit** — `git commit -m "test(e2e): polish specs own their fixture rows"`

### Task 18: Pin production and e2e installs (F-022)

**Files:** Modify `.github/workflows/cd.yml:232`, `.github/workflows/e2e.yml:95`
**Consumes:** existing `backend/requirements-lock.txt`.

- [ ] **Step 1: Failing check** — confirm both install `requirements.txt` today.
- [ ] **Step 2: Implement** — install `requirements-lock.txt` in both.
- [ ] **Step 3: Verify** — link the green CI SHA showing the lock file installed in both jobs.
- [ ] **Step 4: Run** — green CI SHA on this branch as the proof artifact, plus the same local YAML validity check as Task 14.
- [ ] **Step 5: Commit** — `git commit -m "ci(deps): install the lock file for deploy and e2e"`

### Task 19: Remove the dead RED skip guard (F-023)

**Files:** Modify `backend/tests/test_image_resize_security.py:92`
**Consumes:** existing `media_module.redis_client` import (already real at `media.py:13`).

- [ ] **Step 1: Failing check** — confirm the skip guard is unreachable-but-present today.
- [ ] **Step 2: Implement** — delete the guard.
- [ ] **Step 3: Verify** — suite still green; `grep -rn "RED:" backend/tests/test_image_resize_security.py`
  returns nothing (the guard text is gone, not just skipped over).
- [ ] **Step 4: Run** — `python -m pytest -q tests/test_image_resize_security.py` + `python -m compileall -q tests` + `ruff check tests/test_image_resize_security.py`.
- [ ] **Step 5: Commit** — `git commit -m "test(security): drop the dead RED skip guard"`

### Task 20: Smoke checks must actually check (F-024)

**Files:** Modify `.github/workflows/cd.yml:393,436`
**Consumes:** the existing healthcheck URL variables.

- [ ] **Step 1: Failing check** — confirm unset vars exit 0 with a warning today.
- [ ] **Step 2: Implement** — fail (or explicitly mark the job skipped) when unconfigured.
- [ ] **Step 3: Verify** — link a CI cycle proving the hard gate.
- [ ] **Step 4: Run** — green CI SHA on this branch as the proof artifact, plus the same local YAML validity check as Task 14.
- [ ] **Step 5: Commit** — `git commit -m "ci(cd): smoke checks fail when unconfigured"`

### Task 21: Migrate bare admin navigations to gotoAdmin (F-025)

**Files:** all 29 bare admin navigations — 17 static (`admin-requests-polish.spec.ts:68,94,121,148,189,221`, `admin-requests-supervisor.spec.ts:137`, `audit-timeline.spec.ts:49`, `auth.spec.ts:6`, `bookings-calendar.spec.ts:7`, `cookie-auth.spec.ts:25,72,76`, `datepicker-touch.spec.ts:20`, `live-chat-layout.spec.ts:64`, `permission-settings.spec.ts:21`, `request-list.spec.ts:19`) plus 12 dynamic detail-URL gotos (`admin-requests-polish.spec.ts:102,129,156`, `admin-requests-supervisor.spec.ts:156,185,213,251,284,313,359`, `audit-timeline.spec.ts:65,88`; `gotoAdmin(page, url)` accepts the dynamic URL string too)
**Consumes:** `gotoAdmin` from `e2e/utils/nav` (see Reusable patterns).

- [ ] **Step 1: Failing check** — `grep -rn "await page.goto('/admin" frontend/e2e/*.spec.ts` plus `grep -rn "page.goto(detailUrl" frontend/e2e/*.spec.ts` list the 29 sites above today.
- [ ] **Step 2: Implement** — replace every one with `gotoAdmin`.
- [ ] **Step 3: Verify** — specs navigate identically under load.
- [ ] **Step 4: Run** — touched specs + `npm run lint` + `npm run build`.
- [ ] **Step 5: Commit** — `git commit -m "test(e2e): route admin navigations through gotoAdmin"`

### Task 22: Backend static gate — DECIDED: ruff only (F-026)

**Files:** Modify `.github/workflows/ci.yml:124`; create `backend/pyproject.toml` (it does not exist); pin `ruff` in `backend/requirements.txt`
**New file content** (`backend/pyproject.toml`): `[tool.ruff] line-length = 120` plus `[tool.ruff.lint] select = ["E", "F", "I"]` (extend only if the first CI run is green).
**Decision:** ruff only. mypy on this tree is unmeasured work that would block the gate on day one; record a mypy follow-up instead.

- [ ] **Step 1: Failing check** — confirm no ruff/mypy step exists today.
- [ ] **Step 2: Implement** — ruff step for `backend/` with the repo's line-length rules.
- [ ] **Step 3: Verify** — introduce a deliberate violation on a scratch run; CI flags it, then remove it.
- [ ] **Step 4: Run** — green CI SHA on this branch as the proof artifact, plus the same local YAML validity check as Task 14.
- [ ] **Step 5: Commit** — `git commit -m "ci(backend): add ruff gate for backend"`

### Task 23: Forbid focused tests in CI (F-027)

**Files:** Modify `frontend/playwright.config.ts:33`, `frontend/e2e-2client.config.ts`
**Consumes:** Playwright `forbidOnly` option.

- [ ] **Step 1: Failing check** — confirm `forbidOnly` is absent today.
- [ ] **Step 2: Implement** — `forbidOnly: !!process.env.CI` in both configs.
- [ ] **Step 3: Verify** — a scratch `test.only` fails under `CI=true`, passes locally.
- [ ] **Step 4: Run** — `npx playwright test --list` AND `npx playwright test -c e2e-2client.config.ts --list` both load (the config-load proof for a config-only change) + green CI SHA on this branch.
- [ ] **Step 5: Commit** — `git commit -m "test(e2e): forbid focused tests in CI"`

### Task 24: Coverage floors (F-028)

**Files:** Modify `frontend/vitest.config.ts`, `backend/pytest.ini`, `.github/workflows/ci.yml`
**Consumes:** `pytest-cov` (add to `backend/requirements.txt` if absent), vitest `@vitest/coverage-v8` provider.

- [ ] **Step 1: Failing check** — confirm no coverage block or `--cov` exists today.
- [ ] **Step 2: Implement** — measure first: `python -m pytest --cov=app --cov-report=term -q tests/` and `npx vitest run --coverage`; then set each floor at the measured value (raise later, never lower without a reason).
- [ ] **Step 3: Verify** — CI reports coverage and fails below the floor (prove with a scratch threshold bump, then set the real one).
- [ ] **Step 4: Run** — green CI SHA on this branch as the proof artifact.
- [ ] **Step 5: Commit** — `git commit -m "ci(tests): enforce coverage floors"`

### Task 25: Retire the dead screenshot baseline — DECIDED: documented manual script (F-029)

**Files:** Modify `frontend/e2e/admin-requests-polish.spec.ts:216`; create `frontend/e2e/MANUAL_BASELINE.md`
**Decision:** documented manual script (not a scheduled job): baselines change with design, not on a clock.

- [ ] **Step 1: Failing check** — confirm the baseline never runs (env var unset everywhere).
- [ ] **Step 2: Implement** — move capture to the manual script doc; delete the dead gate from the spec.
- [ ] **Step 3: Verify** — the spec file contains no dead gate; the doc lists exact commands.
- [ ] **Step 4: Run** — `npm run test:e2e -- admin-requests-polish` + `npm run lint` + `npm run build`.
- [ ] **Step 5: Commit** — `git commit -m "test(e2e): retire the dead screenshot baseline"`

### Task 26: Seed the live-chat smoke conversation (F-030)

**Files:** Modify `frontend/e2e/live-chat-smoke.spec.ts:77,122`
**Consumes:** `createRequestFixture`-style seeding adapted for conversations (create via API in the spec, own the row).

- [ ] **Step 1: Failing check** — run on an empty seed; assert the guard skips today.
- [ ] **Step 2: Implement** — seed a conversation in the spec and assert unconditionally.
- [ ] **Step 3: Verify** — green on empty and seeded DBs, asserting every time.
- [ ] **Step 4: Run** — `npm run test:e2e -- live-chat-smoke` + `npm run lint` + `npm run build`.
- [ ] **Step 5: Commit** — `git commit -m "test(e2e): seed the live-chat smoke conversation"`

### Task 27: Capability-driven navigation (F-031)

**Files:** Create `frontend/hooks/useCapabilities.ts`; modify `frontend/app/admin/layout.tsx:255,291` and `PageAccessGuard` consumers
**Consumes:** `GET /admin/settings/permissions/me` (existing endpoint); permission keys from `app.core.permissions`.

- [ ] **Step 1: Failing check** — change a matrix entry in the DB; assert the nav still shows the old menu today.
- [ ] **Step 2: Implement** — capability map hook; layout and `PageAccessGuard` read keys, not roles.
- [ ] **Step 3: Verify** — matrix change exposes/hides the feature end to end (see UX contract); AGENT/live-chat behaviour from PR #300 preserved.
- [ ] **Step 4: Run** — affected unit + e2e suites + `npm run lint` + `npm run build`.
- [ ] **Step 5: Commit** — `git commit -m "feat(admin): drive nav visibility from the permission matrix"`

### Task 28: Production Redis guard (F-032)

**Files:** Modify `backend/app/core/config.py:118`, startup path
**Consumes:** existing settings + lifespan startup check.

- [ ] **Step 1: Failing check** — boot prod-like with default URL and Redis down; assert silent degradation today.
- [ ] **Step 2: Implement** — require non-localhost URL in production; fail startup when unreachable (dev keeps localhost).
- [ ] **Step 3: Verify** — misconfigured boot fails fast; healthy boot unchanged.
- [ ] **Step 4: Run** — `python -m pytest -q tests/ -k "config or redis"` + `python -m compileall -q app` + `ruff check app/core/config.py`.
- [ ] **Step 5: Commit** — `git commit -m "fix(config): guard production Redis explicitly"`

### Task 29: Single route→permission manifest (F-033)

**Files:** Create `frontend/lib/route-permissions.ts`; modify `frontend/app/admin/layout.tsx:83,134` and per-page `PageAccessGuard` usages
**Consumes:** permission keys from the backend matrix; consumed by layout and page guards.

- [ ] **Step 1: Failing check** — list the three declarations and one route where they can disagree today.
- [ ] **Step 2: Implement** — manifest module mapping route → permission key; layout and guards read it.
- [ ] **Step 3: Verify** — VIEWER/AGENT routing behaviour identical to today (see UX contract), from one source.
- [ ] **Step 4: Run** — nav/access unit + e2e suites + `npm run lint` + `npm run build`.
- [ ] **Step 5: Commit** — `git commit -m "refactor(admin): single route permission manifest"`

### Task 30: Shared date window for the requests list (F-034)

**Files:** Modify `backend/app/api/v1/endpoints/admin_requests.py:307-315`
**Consumes:** `resolve_range(start_date, end_date, days)` from `app.core.date_windows` (verified export at `date_windows.py:31` raising `InvertedRangeError` on start > end; keep surfacing that as the page error).

- [ ] **Step 1: Failing check** — feed `start_date = end_date = 2026-10-26`; assert the inline window can disagree with the helper today.
- [ ] **Step 2: Implement** — pin `resolve_range(start_date, end_date, days)` from `app.core.date_windows` (verified export; `day_bounds_utc` is its single-day primitive). Catch `InvertedRangeError` in the endpoint and return HTTP 400 with the existing invalid-range message shape.
- [ ] **Step 3: Verify** — `resolve_range(2026-10-26, 2026-10-26, days)` equals `day_bounds_utc(2026-10-26)`, i.e. half-open `[2026-10-25T17:00Z, 2026-10-26T17:00Z)`, and the list matches the audit/reports windows on that day.
- [ ] **Step 4: Run** — `python -m pytest -q tests/ -k "request and date"` + `test_date_windows.py` + `python -m compileall -q app` + `ruff check app/api/v1/endpoints/admin_requests.py`.
- [ ] **Step 5: Commit** — `git commit -m "fix(requests): use the shared Bangkok date window"`

---

## Self-Review

- [x] Spec coverage: all 34 accepted findings map to Tasks 1–30 (F-005+F-011→5, F-006+F-007→6, F-008+F-009+F-010→7); Highs are Phase 1, CI gates Phase 0.
- [x] Placeholder scan: no TBD/TODO; imports, file paths for every new module, all 29 gotoAdmin sites (17 static + 12 dynamic detailUrl) and all 8 data-dependent skip sites enumerated, decisions (Task 2 TTL, Task 14 polling gate, Task 22 ruff-only, Task 25 manual script) recorded with reasons; no grep-conditional or read-first hedges remain.
- [x] Type consistency: `F-xxx` IDs match the findings file; `timeoutMs`, `aborted`, CSRF header, `gotoAdmin`/`createRequestFixture` usage match existing code.
- [x] Dependency order: Phase 0 → Phase 1 → Phase 2 → Phase 3; backend security before frontend auth work that assumes it; navigation refactors after the gates.
- [x] Gate feedback addressed (loops 1+2): reusable patterns with snippets, build/compile/ruff in every code task, green-SHA proof for workflow tasks, UX contract + N/A, Risks table, edge-case checklist with thresholds and concrete values, fixture rule propagated, phase lists use real task IDs 1-30, Task 6 covers F-007 gate+ownership.

## Execution Handoff

Subagent-driven, one task per fresh subagent, review between phases. Backend tasks need the venv
(`backend/venv/Scripts/python.exe`) and a running DB; frontend e2e tasks need the dev servers plus
`createRequestFixture` rows and the 60s `gotoAdmin` budget from the repo rule table.

---

## Execution status (2026-10-30)

**All 30 tasks are implemented and green on `54b5adc`.** The per-step `- [ ]` boxes above were
never ticked during execution, so they no longer reflect the tree — treat this section as the
record, not the boxes.

Proof at hand-off (not per-task claims — the code and CI are the evidence):

| Signal | 2026-10-30 result |
|---|---|
| Backend `pytest` | 1764 passed, 0 failed, 0 error |
| Frontend `vitest` | 1049/1050 (one jsdom timeout; 12/12 in isolation) |
| `tsc --noEmit` | clean |
| CI on `54b5adc` | Backend Pytest, Frontend Lint and Build, Playwright Smoke, Encoding Scan, Vercel — all green |

Findings F-001…F-034 are all closed; the mapping lives in the commit messages and PR #301.

A post-implementation review round found eight defects introduced or left by this work (a
fail-open policy refresh, a missing refresh timeout, stale-matrix plain gates, a role-AND-capability
guard that made matrix grants unreachable, a non-retryable ws-ticket, two wrong route role lists,
and a read-gating key skipped for VIEWER). All eight are fixed in `54b5adc`, with three tests
corrected that had asserted the old wrong behaviour.

**Deploy prerequisite:** the remote DB needs `alembic upgrade head` alongside this deploy —
migration `d5e6f7a8b9c0` grants VIEWER the `view_reports` key, and without it a deployed build 403s
VIEWER on every report route.
