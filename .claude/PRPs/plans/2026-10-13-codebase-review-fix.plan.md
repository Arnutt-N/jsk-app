# Plan — Codebase review fix batch (REV 4, self-contained)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Metadata**
- **Complexity**: large (3 sequential phases, 17 tasks: 5+6+6, backend + frontend)
- **Source PRD**: `.claude/PRPs/prds/2026-10-13-codebase-review-fix.prd.md`
- **Binding spec**: `.claude/PRPs/findings/2026-10-13-codebase-review-findings.md` (74 unique: 5C/21H/34M/14L; B7 table below maps all 70 accepted + 4 deferred, zero orphans)
- **Branch**: `fix/codebase-review-20261013`
- **Revision**: REV 4 — applies the 6 round-3 escalation fixes (C3 scoped grep, A5 escaped grep, serialization rules, B1 behavior-change wording, per-item pairs everywhere, expanded B7 rows).

**Goal:** Zero unresolved Critical/High (G3) plus the 44-item trivial-safe M/L fix-list, shipped as one PR per phase (A→PR1, B→PR2, C→PR3). Four deferred items stay documented in the PRD.

**Architecture:** Fixes cluster by layer — outbox/atomicity in services, guards at API boundaries, tests beside subjects. Batch tasks group same-file micro-fixes; phases run strictly A→B→C with gates between; WITHIN a phase, tasks sharing a file run sequentially in listed order (auth.py B4→B5, broadcast_service.py B1→B6, admin_requests.py B3→B6, config.py B2→B5); C6 hook-merge runs AFTER C5 and carries over C5's NEW retry tests. `drain_outbox` int-return is backward-compatible for ignorers (13 call sites enumerated in A2, only 1 consumes).

**Tech stack:** FastAPI/SQLAlchemy-async/Pydantic-v2/Alembic; Next.js/React-19/Tailwind-v4; pytest + Vitest + Playwright. No new dependencies (lockfile pins existing ones).

**Files to Change:** Phase A — `backend/app/api/v1/endpoints/admin_live_chat.py`, `backend/app/services/outbox.py`, `backend/app/api/v1/endpoints/webhook.py`, `backend/app/main.py`, `backend/requirements.txt` (+ lock), `frontend/e2e/admin-requests-supervisor.spec.ts`. Phase B — `backend/app/services/broadcast_service.py`, `backend/app/api/v1/endpoints/media.py`, `backend/app/api/v1/endpoints/liff.py`, `backend/app/core/line_client.py`, `backend/app/core/config.py`, `backend/app/services/telegram_service.py`, `backend/app/core/pubsub_manager.py`, `backend/app/core/permissions.py`, `backend/app/api/v1/endpoints/admin_requests.py`, `backend/app/services/settings_service.py`, `backend/app/api/v1/endpoints/settings.py`, `backend/app/services/booking_settings.py`, `backend/app/api/v1/endpoints/auth.py`, `backend/app/core/security.py`, `backend/app/api/v1/endpoints/ws_live_chat.py`, `backend/app/db/session.py`, `backend/tests/test_ws_security.py`. Phase C — `frontend/app/admin/live-chat/_components/MessageBubble.tsx`, `frontend/app/admin/live-chat/_components/CustomerPanel.tsx`, `frontend/app/admin/auto-replies/[id]/page.tsx`, `frontend/app/liff/service-request/page.tsx`, `frontend/app/liff/service-request-single/page.tsx`, `backend/app/api/v1/api.py`, `backend/app/services/audit_service.py` (NEW thin), `docker-compose.yml` (comment), `frontend/e2e/admin-requests-supervisor.spec.ts`, `frontend/e2e/admin-requests-polish.spec.ts`, `frontend/e2e/live-chat-layout.spec.ts`, `frontend/e2e/utils/*`, `backend/tests/test_image_resize_security.py`, `frontend/app/admin/chatbot/broadcast/__tests__/dryrun-button.test.tsx`, `backend/tests/test_booking_create_concurrency.py`, `.github/workflows/ci.yml`, `frontend/app/admin/live-chat/_components/*.tsx`, `frontend/app/admin/live-chat/_hooks/*.ts`, `frontend/hooks/useWebSocket.ts`, `frontend/hooks/useLiveChatSocket.ts`, `frontend/hooks/__tests__/useLiveChatSocket.retry.test.ts` (NEW), `frontend/components/ui/Toast.tsx`, `frontend/components/ui/ErrorBoundary.tsx`, `frontend/lib/constants/api.ts`, `backend/tests/test_prd_e_drug_reporting_standalone.py`, `backend/tests/test_jwt_token_types.py` (NEW), `backend/app/core/line_client.py`, `backend/app/main.py` (import only).

**NOT Building**: PRD §Deferred (WS-ticket-header, jose swap, policy Redis, export sessions); anything outside the findings file; product changes; debt/service token migration.

**Validation Commands**
```bash
cd backend && python -m pytest tests/<file> -q        # Windows: backend/venv/Scripts/python.exe -m pytest
cd backend && python -m pytest -q                      # full suite (DB tests need local PG; CI is the gate)
cd backend && python scripts/db_target.py alembic --target local upgrade head   # + `downgrade -1` round-trip for A3
cd frontend && npx tsc --noEmit
cd frontend && npx eslint <files>                      # 0 errors
cd frontend && npx vitest run <paths>
cd frontend && npm run build                           # IS the test for C2 suspense/prerender
cd frontend && npx playwright test e2e/<spec>          # only with staging env; otherwise CI gate
```

**Context**
- Outbox precedent: `new_outbox()` + `drain_outbox(box)` after commit (SOURCE `backend/app/api/v1/endpoints/webhook.py:99-107`); mutate-commit-announce is the house pattern.
- Endpoint guards return 404/422 with Thai detail; services raise, endpoints map (SOURCE `backend/app/api/v1/endpoints/liff_bookings.py` guard pairs).
- Tests: `backend/tests/test_<area>.py` (AsyncMock db); frontend colocated `__tests__`; e2e seeded helpers in `frontend/e2e/`. Ordering tests assert `mock_calls` sequences, never sleeps.
- Secrets rule: presence/counts only, never values. Changed assertions cite the intended behavior change.

**Risks**: R1 live-flow refactors → red-first ordering tests, suites green before/after. R2 lockfile transitives → fresh-install + full suite + build pre-commit. R3 fresh installs → empty-DB upgrade path exercised. R4 throttle changes → limits identical, key composition only, login e2e green. R5 batch size → per-task gates, per-phase PRs, one file per worker.

**UX states**: N/A — internal change for every task except (1) Suspense crash — before: direct auto-reply edit URL crashes prerender; after: renders (C2). (2) service-request-single base — before: absolute backend URL bypasses proxy; after: relative `/api/v1` (C2). (3) No other user-visible copy/flow changes in this batch.

---

### Phase A — Critical (5 tasks, sequential)

**Task A1: C-BE-01 outbox the live-chat initial message**
- **ACTION:** Move the LINE push after the session/message commit via the house outbox.
- **IMPLEMENT:** In `backend/app/api/v1/endpoints/admin_live_chat.py` (~:502-525): `from app.services.outbox import Outbox, drain_outbox, new_outbox`; `box = new_outbox()`, append the `push_messages` closure instead of awaiting at :506; keep `save_message` (:512); `failures = await drain_outbox(box)` after `db.commit()` (:525), log if nonzero.
- **MIRROR:** `backend/app/api/v1/endpoints/webhook.py:99-107`.
- **VALIDATE:** Run `cd backend && python -m pytest tests/test_live_chat_outbox.py -q` (NEW file) — input: forced commit failure ⇒ expected: `push_messages` never called + row absent; input: success ⇒ expected: exactly 1 push + row present.
- **GOTCHA:** (R1) run the new test BEFORE the fix and quote the red diff.

**Task A2: C-BE-02 truthful webhook accounting**
- **ACTION:** Report drain failures; skip the dedup marker on failure. No new model.
- **IMPLEMENT:** (1) `backend/app/services/outbox.py:20`: `-> None` becomes `-> int` failure count (increment in existing `except`, still log-and-continue). (2) Consume at `backend/app/api/v1/endpoints/webhook.py:107` (`failures = await drain_outbox(box)`; `setex` only when 0, else `delivery_failed` log). (3) Other 12 call sites IGNORE the return (backward-compatible, zero edits): `backend/app/services/handoff_service.py:197,206`, `backend/app/services/live_chat_service/handoff.py:113,178`, `backend/app/services/message_intake/commands.py:41,73,83,107,135`, `backend/app/services/message_intake/message_handler.py:62`, `backend/app/services/message_intake/postback_handler.py:34,68`.
- **MIRROR:** Task A1's ordering-test shape.
- **VALIDATE:** Run `cd backend && python -m pytest tests/test_webhook_outbox_accounting.py -q` (NEW) — input: one send raises ⇒ expected: marker absent + error logged; input: all succeed ⇒ expected: marker present. Plus `cd backend && python -m pytest tests/test_handoff_service.py tests/test_webhook_deduplication.py -q -k "handoff or webhook or intake or postback or follow"` green (covers the 12 ignorers).
- **GOTCHA:** Happy-path SQL order unchanged — additive branches only.

**Task A3: C-ARCH-01 remove lifespan DDL**
- **ACTION:** Delete raw DDL; prove the migration owns the table.
- **IMPLEMENT:** Remove the `system_settings` DDL in `backend/app/main.py` (`_initialize_database`, ~:55-80); column-diff against `backend/alembic/versions/add_system_settings.py` — identical ⇒ delete only; drifted ⇒ amend migration (backfill, never drop).
- **MIRROR:** Standard additive migration flow.
- **VALIDATE:** From an EMPTY database run `cd backend && python scripts/db_target.py alembic --target local upgrade head` — input: empty DB ⇒ expected: `system_settings` exists with identical columns; then `downgrade -1` + re-upgrade clean; then `python -m pytest -q` green.
- **GOTCHA:** (R3) exercise the empty-DB path, not the dev DB.

**Task A4: C-ARCH-02 lockfile**
- **ACTION:** Pin reproducible production builds.
- **IMPLEMENT:** Generate `backend/requirements-lock.txt` (pip-tools `pip-compile` if present, else `pip freeze` from the CI-green env); point the CI install step (`.github/workflows/ci.yml`) and Docker at the lockfile; `backend/requirements.txt` stays the ranged source.
- **MIRROR:** Existing CI install step (extend, don't replace).
- **VALIDATE:** Fresh venv `pip install -r backend/requirements-lock.txt` — input: clean env ⇒ expected: `python -m pytest -q` green + frontend build green (R2 gate).
- **GOTCHA:** (R2) forced resolution bumps get their own green suite run.

**Task A5: C-TEST-01 seed the supervisor journey**
- **ACTION:** Make the skipped escape-hatch journeys execute; keep the by-design skip.
- **IMPLEMENT:** In `frontend/e2e/admin-requests-supervisor.spec.ts`: API-seed one normal + one COMPLETED request with unique per-run topic markers (mirror sibling specs); delete the 7 data-dependent skips (:94,:124,:153,:195,:229,:254,:306); KEEP :132 (terminal-state kebab hidden by design) with its reason intact; cleanup in `afterEach`.
- **MIRROR:** Sibling spec seed helpers in `frontend/e2e/`.
- **VALIDATE:** Run `cd frontend && grep -c "test\\.skip\\(" e2e/admin-requests-supervisor.spec.ts` — input: seeded CI run ⇒ expected: count is 1 (only by-design :132; the :188 comment says "test skips" without call syntax and is intentionally retained); journey tests green in CI.
- **GOTCHA:** Markers unique per run (parallel CI shards); no leakage into other specs.

- [ ] Phase A gate: 5 tasks green + `python -m pytest -q` + `npx tsc --noEmit` + `npx eslint` touched + PR #1.

### Phase B — High backend/security (6 tasks)

**Task B1: perf trio (H-BE-01 + H-BE-06 + M/liff.py:182)**
- **ACTION:** Counts, deferred blob, bulk attachments — response envelopes unchanged, count VALUES fixed (behavior change per H-BE-01).
- **IMPLEMENT:** `backend/app/services/broadcast_service.py:220` — fill total/success/failure from the module's multicast accumulator; `backend/app/api/v1/endpoints/media.py:151` — metadata select, authz, then blob fetch; `backend/app/api/v1/endpoints/liff.py:182` — one bulk IN query + deferred blob column.
- **MIRROR:** Multicast-path counting (same file).
- **VALIDATE:** Run `cd backend && python -m pytest tests/test_broadcast_service.py tests/test_media_endpoints.py tests/test_liff_attachments_resolve.py -q` — input: broadcast-all ⇒ expected: counts populated (were 0/None); input: unauthenticated media GET ⇒ expected: 403 with blob untouched; input: 3 attachments ⇒ expected: 1 query.
- **GOTCHA:** Snapshots asserting empty counts are UPDATED citing the H-BE-01 behavior change; all other snapshots pass unmodified.

**Task B2: credential + Redis hygiene (H-BE-02 + H-ARCH-02/03)**
- **ACTION:** Per-request token, declared Telegram settings, one Redis factory.
- **IMPLEMENT:** `backend/app/core/line_client.py:9` — resolve token per-request from `credential_service` (mirror `backend/app/api/v1/endpoints/admin_integrations.py`); declare `TELEGRAM_BOT_TOKEN` on `Settings` (`backend/app/core/config.py`), replacing getattr in `backend/app/services/telegram_service.py:36`; route `backend/app/core/pubsub_manager.py:44` through existing `backend/app/core/redis_client.py`.
- **MIRROR:** `credential_service` + `redis_client` consumers (`auth/health/media/webhook`).
- **VALIDATE:** Run `cd backend && python -m pytest tests/test_credential_service.py tests/test_pubsub_manager.py tests/test_line_service_circuit_breaker.py -q` — input: rotated credential ⇒ expected: next request uses it without restart; input: static credentials ⇒ expected: behavior unchanged; input: unset TELEGRAM_BOT_TOKEN ⇒ expected: startup validation error (not silent None); input: pubsub round-trip ⇒ expected: delivered via the shared client.
- **GOTCHA:** No behavior change under static credentials.

**Task B3: guard trio (H-BE-03/04/05)**
- **ACTION:** Fail-closed roles, validated agents, atomic settings+audit.
- **IMPLEMENT:** `backend/app/core/permissions.py:324` — try/except `UserRole(role)` ⇒ False (403); `backend/app/api/v1/endpoints/admin_requests.py:140` — agent existence/staff check mirroring the file's PATCH path; `backend/app/services/settings_service.py:30-50` flush-only while BOTH callers (`backend/app/api/v1/endpoints/settings.py:353`, `backend/app/services/booking_settings.py:201`) commit setting + audit row in one endpoint-owned transaction.
- **MIRROR:** PATCH-path agent check; `liff_bookings.py` guard pairs.
- **VALIDATE:** Run `cd backend && python -m pytest tests/test_permissions.py tests/test_admin_requests_endpoints.py tests/test_booking_settings.py -q` — input: garbage role ⇒ expected: 403 (was 500); input: unknown agent ⇒ expected: 404; input: setting save ⇒ expected: audit row present, failure ⇒ both absent.
- **GOTCHA:** Both `set_setting` callers move together — grep-gate no direct commits remain.

**Task B4: login throttle keys (H-SEC-AUTH-01)**
- **ACTION:** Fix both key dimensions; limits untouched.
- **IMPLEMENT:** In `backend/app/api/v1/endpoints/auth.py` (~:59-90, key at :150): `from app.core.http_rate_limit import _client_key` (verified at `backend/app/core/http_rate_limit.py:34`, proxy-aware) and build `f"login:{_client_key(request)}:{normalized_username}"` (lower/strip username).
- **MIRROR:** Existing login-limiter tests (extend `tests/test_auth_login_ratelimit.py`).
- **VALIDATE:** Run `cd backend && python -m pytest tests/test_auth_login_ratelimit.py tests/test_auth_rate_limit.py -q` — input: 10 usernames/1 IP ⇒ expected: throttled; input: distinct clients behind one proxy ⇒ expected: unaffected; legit-login path green (R4).
- **GOTCHA:** (R4) 5/min limits untouched — key composition only.

**Task B5: security small batch (M-SEC-01..04)**
- **ACTION:** One-spot fixes with per-item tests in `backend/tests/test_security_smalls.py` (NEW).
- **IMPLEMENT:** `backend/app/core/security.py:105` — drop reserved claims (exp/sub/iat/type); `backend/app/api/v1/endpoints/ws_live_chat.py:51` — empty allowlist/missing Origin ⇒ reject; `backend/app/api/v1/endpoints/auth.py:203` — reuse login limiter helper for refresh; `backend/app/core/config.py:77` — ALGORITHM allowlist enforced at startup.
- **MIRROR:** Adjacent guards in the same files.
- **VALIDATE:** Run the NEW file — input: override claims ⇒ expected: dropped; input: empty allowlist ⇒ expected: WS rejected; input: refresh flood ⇒ expected: 429; input: `ALGORITHM=none` ⇒ expected: startup error. Plus `tests/test_ws_security.py` green (LIFF client tripwire).
- **GOTCHA:** Allowed-origins suite is the tripwire — run it, don't eyeball.

**Task B6: backend hygiene batch (M-BE-02/03/04 + M-TEST-07)**
- **ACTION:** Allowlist, additive total, rollback safety, deterministic clock.
- **IMPLEMENT:** `backend/app/services/broadcast_service.py:112` — explicit mutable-field allowlist; `backend/app/api/v1/endpoints/admin_requests.py:272` — additive `total`; `backend/app/db/session.py:24` — try/except rollback around yield; `backend/tests/test_ws_security.py:67` — injected limiter clock replacing `time.sleep(0.15)`.
- **MIRROR:** Existing totals-bearing paginated responses.
- **VALIDATE:** Run `cd backend && python -m pytest tests/test_broadcast_service.py tests/test_admin_requests_endpoints.py tests/test_ws_security.py -q` — input: disallowed field ⇒ expected: ignored; input: mid-request error ⇒ expected: no partial commit; `total` present; clock test has zero sleeps.
- **GOTCHA:** `total` additive — old clients keep working.

- [ ] Phase B gate: tasks green + `python -m pytest -q` + PR #2.

### Phase C — High frontend/arch/tests + fix-list (6 tasks)

**Task C1: chat image safety (H-FE-01 + M-FE-04/07)**
- **ACTION:** Gate URLs, coerce payloads, bound image hosts.
- **IMPLEMENT:** `frontend/app/admin/live-chat/_components/MessageBubble.tsx:42` — href/src through `isSafeImageUrl` (SOURCE `frontend/lib/line/url.ts`); `:26` — `String(payload ?? message.content)`; `frontend/app/admin/live-chat/_components/CustomerPanel.tsx:99` — allowlisted host else plain `img`.
- **MIRROR:** Existing `isSafeImageUrl` call sites.
- **VALIDATE:** Run `npx vitest run app/admin/live-chat/_components/__tests__/MessageBubble.render.test.tsx app/admin/live-chat/_components/__tests__/customer-panel-masking.test.tsx` — input: `javascript:`/`data:` URL ⇒ expected: never rendered; input: object payload ⇒ expected: text; input: off-allowlist host ⇒ expected: plain `img` fallback renders; bubble suite green.
- **GOTCHA:** Match the guard's exact allow/deny contract — never invert it.

**Task C2: suspense + head + proxy base (H-FE-02/03 + M-FE-03)**
- **ACTION:** Fix prerender crash, App Router metadata, LIFF base URL.
- **IMPLEMENT:** `frontend/app/admin/auto-replies/[id]/page.tsx:46` — Suspense boundary around the `useSearchParams` consumer; `frontend/app/liff/service-request/page.tsx:4` — `generateMetadata` replacing `next/head`; `frontend/app/liff/service-request-single/page.tsx:99` — relative `/api/v1`.
- **MIRROR:** Sibling LIFF pages' proxy usage.
- **VALIDATE:** Run `npm run build` — input: direct auto-reply edit URL prerender ⇒ expected: renders (build IS the test; tsc insufficient). Plus `npx vitest run app/liff/service-request` green — input: single submit ⇒ expected: request URL starts with relative `/api/v1` (no absolute host).
- **GOTCHA:** Build is mandatory — tsc alone cannot catch this.

**Task C3: architecture structural batch (H-ARCH-01/04/05/06 + M-ARCH-01/02)**
- **ACTION:** Config strictness, router merge, audit layer, docs, migration hygiene.
- **IMPLEMENT:** `backend/app/core/config.py:135` extra forbid (or startup unknown-key check); merge the two `/admin/settings` routers (`backend/app/api/v1/api.py:61`) preserving every path verbatim; move `backend/app/api/v1/endpoints/admin_audit.py:10` queries to new thin `backend/app/services/audit_service.py`; infra-only header in `docker-compose.yml`; reversibility note on the merge migration; remote-env schema check in `cd.yml`.
- **MIRROR:** Existing service modules for the audit move.
- **VALIDATE:** Run `grep -rn "AuditLog" backend/app/api/v1/endpoints/admin_audit.py | wc -l` — input: post-move file ⇒ expected: 0 (`User` import at :11 retained by design for types/lookups); input: misspelled env key ⇒ expected: startup error; input: merged router ⇒ expected: NEW `backend/tests/test_admin_route_snapshot.py` route list identical; input: compose file ⇒ expected: infra-only header present; input: merge migration ⇒ expected: reversibility note + downgrade test; input: remote env with unknown key ⇒ expected: cd check fails pre-migrate; `python -m pytest tests/test_admin_audit_endpoints.py -q` green; build green.
- **GOTCHA:** Forbid may surface hidden typos — full backend suite mandatory.

**Task C4: e2e + backend-test work (H-TEST-01..05 + M-TEST-02/03/04/05 + L-TEST-02)**
- **ACTION:** Journeys execute, skips removed; only CI YAML changes outside tests.
- **IMPLEMENT:** NEW LIFF booking create→cancel e2e spec; unskip resize-ticket test (route EXISTS at `backend/app/api/v1/endpoints/media.py:402` — test-only); CI Postgres service guarantee (`.github/workflows/ci.yml`); dry-run companion test; `vi.unstubAllGlobals` teardown in `frontend/app/admin/chatbot/broadcast/__tests__/dryrun-button.test.tsx`; extract e2e helper to `frontend/e2e/utils`; 3 fixed sleeps (`admin-requests-supervisor.spec.ts:81`, `admin-requests-supervisor.spec.ts:311`, `live-chat-layout.spec.ts:79`) → response/locator waits; screenshot gate → semantic assertions.
- **MIRROR:** Existing seeded e2e helpers.
- **VALIDATE:** CI run — input: each touched spec ⇒ expected: skip counts recorded down with the cancel journey green; input: cancel journey ⇒ expected: booking CONFIRMED→CANCELLED visible; input: resize suite ⇒ expected: previously-skipped ticket test executes; input: dry-run off ⇒ expected: navigation with payload asserted; input: concurrency suite in CI ⇒ expected: Postgres present, race test executes (no skip); input: broadcast suite order ⇒ expected: green with globals restored (no stub leakage); input: helper consumers ⇒ expected: single shared helper, no drifted copies; input: each replaced sleep ⇒ expected: wait asserts on the named response/locator; input: narrow viewport ⇒ expected: semantic assertions green; locally `npx playwright test e2e/admin-requests-supervisor.spec.ts e2e/admin-requests-polish.spec.ts e2e/live-chat-layout.spec.ts` only with staging env.
- **GOTCHA:** Only CI YAML changes in production-adjacent files.

**Task C5: live-chat frontend batch (M-FE-01/02/05/06/08/09/10 + L-FE-01/02 + L-TEST-01)**
- **ACTION:** One-spot fixes with colocated hook tests incl. NEW `frontend/hooks/__tests__/useLiveChatSocket.retry.test.ts`.
- **IMPLEMENT:** `frontend/components/ui/ErrorBoundary.tsx:28` (preserve retryCount); `frontend/app/admin/live-chat/_hooks/useConversationSync.ts:109` (encodeURIComponent) + `:219` (router replace); `frontend/hooks/useSessionTimeout.ts:75` (reset on activity); `frontend/app/admin/live-chat/_components/MessageInput.tsx:105` (effect); `frontend/app/admin/live-chat/_components/ConversationItem.tsx:99` (list-level shared timer); `frontend/hooks/useWebSocket.ts:57` (forward token); `frontend/hooks/useLiveChatSocket.ts:204` (retry tests); `frontend/components/ui/Toast.tsx:35` (per-toast timers); `MessageBubble.render.test.tsx:61` (`toBeVisible`).
- **MIRROR:** Existing hook test patterns (`frontend/hooks/__tests__/`).
- **VALIDATE:** Run `npx vitest run app/admin/live-chat hooks components/ui` — input: retryCount at max ⇒ expected: fallback renders; input: id with `/` ⇒ expected: encoded fetch; input: 3 retries ⇒ expected: no 4th attempt (NEW test); input: user activity during warning ⇒ expected: warning dismisses; input: claiming render ⇒ expected: no render-phase setState warning; input: 30-row list ⇒ expected: 1 shared timer; input: caller token ⇒ expected: forwarded to client; input: manual toast dismiss ⇒ expected: timer cleared; input: chat select ⇒ expected: router state updates; old timing assertions byte-identical.
- **GOTCHA:** Keep existing timing assertions unmodified.

**Task C6: shared-lib + SEC-L + unit-test smalls (M-ARCH-03/04/05/06 + M-TEST-01/06 + L-SEC-01..08 + L-ARCH-01)**
- **ACTION:** Dedupe libs/configs; harden JWT-adjacent smalls; drop dead import.
- **IMPLEMENT:** Merge WS hooks (single reconnect/ticket strategy; keep old names as re-exports only if imported elsewhere — grep-gate importers FIRST); `frontend/lib/constants/api.ts` single origin contract; single postcss config; dev-script flags aligned; `backend/tests/test_prd_e_drug_reporting_standalone.py:19` imports production schema; `toBeDefined` → `toBeVisible`; `backend/app/api/v1/endpoints/liff.py:60` log status-only; `backend/app/api/v1/endpoints/auth.py:471` CSRF echo scope; `backend/app/main.py:201` drop `authorization` CORS header; `backend/app/core/security.py:21` bcrypt bump; `backend/app/api/v1/endpoints/liff.py:72` STIRCT branch-or-remove; `backend/app/core/security.py:178` token-type enforcement + NEW `backend/tests/test_jwt_token_types.py`; `backend/app/api/v1/endpoints/auth.py:314` logout CSRF; lazy LINE parser (`backend/app/core/line_client.py:12`); drop `StaticFiles` import (`backend/app/main.py:8`).
- **MIRROR:** Adjacent helper/test code.
- **VALIDATE:** Run `cd backend && python -m pytest tests/test_jwt_token_types.py tests/test_liff_token.py tests/test_cookie_auth.py -q` + `npx vitest run hooks components/ui app/admin/live-chat` for touched areas — input: old-cost hash login ⇒ expected: passes (cost lives in hash); input: refresh-token into access-only helper ⇒ expected: rejected; input: WS connect ⇒ expected: same origin as REST; input: old hook import ⇒ expected: re-export works (or zero importers before delete); input: single postcss config build ⇒ expected: green; input: `npm run dev` ⇒ expected: starts with one bundler, no flag conflict; input: standalone suite ⇒ expected: green on the production schema import; input: preview text ⇒ expected: `toBeVisible` assertion; input: raw LIFF body in logs ⇒ expected: status code only; input: CSRF json ⇒ expected: no readable token echo; input: CORS preflight ⇒ expected: no authorization header; input: strict-mode off ⇒ expected: documented branch or removed flag; input: lazy parser with empty secret ⇒ expected: explicit error, never silent accept; input: logout cross-site POST ⇒ expected: 403 without token.
- **GOTCHA:** Hook merge: grep importers BEFORE deleting either hook module.

- [ ] Phase C gate: tasks green + full `python -m pytest -q` + `npx tsc --noEmit` + `npx eslint` + `npx vitest run` + `npm run build` + PR #3.

---

## Testing Strategy

Red-first per fix with the literal input/expected pairs in each VALIDATE; existing suites pinned green before/after; changed assertions cite the intended behavior change; edge checklist: rollback paths, empty allowlists, rotated creds, unknown env keys, single-day windows, offline Redis, zero new skips.

## B7 coverage (finding → task; deferred* per PRD with reasons)

Critical: C-BE-01→A1, C-BE-02→A2, C-ARCH-01→A3, C-ARCH-02→A4, C-TEST-01→A5.
High (21): H-BE-01→B1, H-BE-06→B1, H-BE-02→B2, H-BE-03→B3, H-BE-04→B3, H-BE-05→B3, H-SEC-AUTH-01→B4, H-FE-01→C1, H-FE-02→C2, H-FE-03→C2, H-ARCH-01→C3, H-ARCH-02→B2, H-ARCH-03→B2, H-ARCH-04→C3, H-ARCH-05→C3, H-ARCH-06→C3, H-TEST-01→C4, H-TEST-02→C4, H-TEST-03→C4, H-TEST-04→C4, H-TEST-05→C4.
Medium fix (31): `liff.py:182`→B1; `broadcast_service.py:112`→B6; `db/session.py:24`→B6; `admin_requests.py:272`→B6; `test_ws_security.py:67`→B6; `security.py:105`→B5; `ws_live_chat.py:51`→B5; `auth.py:203`→B5; `config.py:77`→B5; `ErrorBoundary.tsx:28`→C5; `useConversationSync.ts:109`→C5; `service-request/page.tsx:4`→C2; `CustomerPanel.tsx:99`→C1; `useSessionTimeout.ts:75`→C5; `MessageInput.tsx:105`→C5; `MessageBubble.tsx:26`→C1; `ConversationItem.tsx:99`→C5; `useWebSocket.ts:57`→C5; `useLiveChatSocket.ts:204`→C5; merge-migration note→C3; `cd.yml`→C3; postcss→C6; dev-flags→C6; `api.ts`→C6; hooks-merge→C6; local-schema→C6; `toBeDefined`→C6; e2e-helper→C4; sleep300→C4; sleep1500→C4; layout-sleep→C4.
Low fix (13): `Toast.tsx:35`→C5; history-replace→C5; `toBeTruthy`→C5; liff-redact→C6; CSRF-echo→C6; CORS-header→C6; bcrypt→C6; STIRCT→C6; token-type→C6; logout-CSRF→C6; lazy-parser→C6; StaticFiles→C6; screenshot→C4.
Deferred*: WS-ticket-header (client contract), jose swap (token-compat risk), policy-Redis (needs design), export-sessions (no failing test).
Total: 5 + 21 + 31 + 13 + 4 = 74 = findings file header. Zero orphans.

## Self-review (REV 3)

1. **Counts**: 17 tasks (5+6+6); B7 traces 5 Critical + 21 High + 44 M/L + 4 deferred = 74.
2. **Round-2 closures**: A5 scoped to 7 skips with :132 named by-design; executable VALIDATE per task with verified test paths; per-item literal pairs on every batched task; countable 44-row B7 above.
3. **Blast radius**: one file per worker; phases strictly ordered with gates.
