# PRP — Codebase Review Fix, implementation plan (2026-09-27)

> PRD: `PRPs/2026-09-27-codebase-review-fix.prd.md`
> Branch: `fix/codebase-review-fix-20260927` | G2 gate: `prp-validate-plan` READY ≥ 8/10

## Phase 0 — Baseline (no code)

1. Confirm clean tree on `fix/codebase-review-fix-20260927`.
2. Backend baseline: `docker-compose up -d db redis` (needs local
   Postgres/Redis), then `cd backend && python -m pytest -q` (needs venv
   python; else record the blocker and run affected test files).
3. Frontend baseline: `cd frontend && npm run lint` (quick).

## Phase 1 — Backend fixes (each = code + test, validate per change)

### T1 · F1 — escape LIKE wildcards in auto-reply search [Medium]
- File: `backend/app/api/v1/endpoints/admin_auto_replies.py:34`
- Change: import `escape_ilike` from `app.core.query_utils`; wrap `keyword` and
  pass `escape="\\"`:
  `AutoReply.keyword.ilike(f"%{escape_ilike(keyword)}%", escape="\\")`
- Test: create `backend/tests/test_auto_reply_search_escape.py` using the
  DB-backed recipe (`_fresh_engine()` + NullPool — copy the pattern from
  `test_liff_token.py:37-44`; the `_FakeDB` idiom cannot evaluate ilike
  semantics and would make the test vacuous): fixture rows `100%` + decoy
  `100X` (percent case) and `a_b` + decoy `aXb` (underscore case); asserts
  literal match only.
- Validate: run the new test file.

### T2 · F2 — clamp skip/limit on 5 list endpoints [Medium]
- Files (`Query` bounds REJECT out-of-range input with 422 — this is
  validation rejection, not silent clamping; do not copy the manual clamp
  pattern at `admin_live_chat.py:135`. The service-side clamps at
  `admin_live_chat.py:135` and `conversations.py:66,264` remain as-is —
  accepted inconsistency, changing them is out of scope):
  - `admin_auto_replies.py:24-25` — `skip: int = Query(0, ge=0)`,
    `limit: int = Query(100, ge=1, le=100)` + import Query from fastapi.
  - `admin_intents.py:23-24` — same pattern.
  - `admin_reply_objects.py:24-25` — same pattern.
  - `admin_requests.py:274-275` — `skip: int = Query(0, ge=0)`,
    `limit: int = Query(100, ge=1, le=200)` — ceiling 200, NOT 100: the
    Kanban frontend calls `/admin/requests?limit=200`
    (`frontend/app/admin/requests/kanban/page.tsx:67`, verified); `le=100`
    would 422 the Kanban board silently. (Audit-log `limit=200` calls go to
    `/admin/audit/logs`, which already allows le=500 — unaffected.)
  - `admin_friends.py:26` — `skip: int = Query(0, ge=0)` (limit already capped
    via `Query(100, ge=1, le=100)` at :27).
  - `admin_live_chat.py:407` — `GET /messages/search` (`search_messages`,
    :403-419): currently bare `limit: int = 20`, passed straight to the
    service at :416 — missed in the original F2 list (the service already
    clamps later at `conversations.py:264` — `safe_limit = max(1, min(limit,
    100))` used at :276 — so this is consistency hardening: reject with 422
    instead of silently clamping, matching AC2).
    Change to `limit: int = Query(20, ge=1, le=100)` (Query already
    imported at :3 — no import change needed).
- Tests: create `backend/tests/test_admin_pagination_guards.py` —
  parametrized cases (TestClient + `app.dependency_overrides`; override the
  exact references each endpoint resolves — override matrix):
  - auto_replies: `app.api.v1.endpoints.admin_auto_replies.get_db` /
    `.get_current_admin`; intents: `...admin_intents.get_db` /
    `.get_current_admin`; reply_objects: `...admin_reply_objects.get_db` /
    `.get_current_admin`; requests: `...admin_requests.get_db` (imported
    from `app.db.session` at :11) / `.get_current_manager` (list gate :277);
    friends: `app.api.deps.get_db` (attribute form `Depends(deps.get_db)`
    at :28) BUT its gate is a direct import — `Depends(get_current_admin)`
    at :29 (imported from `app.api.deps` at :6) → override
    `app.api.v1.endpoints.admin_friends.get_current_admin`; live-chat search
    uses `Depends(deps.get_db)` / `Depends(deps.get_current_staff)` →
    override `app.api.deps.get_db` / `app.api.deps.get_current_staff`.
  - Assertions: `skip=-1` → 422 on the 5 list endpoints ONLY (search has no
    `skip` param — FastAPI ignores unknown query params, `?skip=-1` there
    returns 200; do not test it); `limit=999999` → 422 on the 5 newly-capped
    endpoints (friends `limit` is already capped at :27 — a limit test there
    passes before the fix; its `skip=-1` case suffices); for
    `GET /messages/search` always send `q=...` (`q` is required; a missing
    `q` would 422 for the wrong reason).
  - Kanban contract lock: `GET /admin/requests?limit=200` → 200 OK (guards
    against a future "tighten to le=100" regression that would silently
    break the Kanban board).
- Validate: run the new test file.

### T3 · F7 — reuse shared escape_ilike [Low]
- File: `backend/app/api/v1/endpoints/admin_requests.py:26-28`
- Change: delete local `_escape_ilike`, import from `app.core.query_utils`.
- Test: NO existing test covers `?search=` on list_requests (verified by
  grep — empty result; the old "existing tests stay green" justification was
  wrong). Add a regression test — NOT via the file's `_FakeDB` idiom
  (:37-51), which records `last_stmt` and returns canned rows and therefore
  cannot evaluate ilike semantics (vacuous-pass trap); instead use the
  DB-backed recipe (`_fresh_engine()` + NullPool, `test_liff_token.py:37-44`)
  — the repo already shares cross-test helpers (`tests/identity_helpers.py`),
  so either copy the ~8-line recipe or lift it into a shared helper — or
  assert on the recorded `fake_db.last_stmt` compiled bind param (expect
  escaped `100\%`, not `100%`). Fixture rows `100%` + decoy `100X`, `a_b` +
  decoy `aXb`; search with `%` / `_` returns only the literal matches
  (verifies the shared `escape_ilike` wiring end-to-end).
- Validate: `python -m pytest tests/test_admin_requests_endpoints.py -q`.

### T4 · F4 — mask LINE ID in redelivery-skip log [Low]
- File: `backend/app/services/message_intake/message_handler.py:65-69`
  (log args `line_message_id, line_user_id` at :67-68)
- Change: `mask_line_id` import already present (:15); wrap the logged
  `line_user_id` argument with `mask_line_id(line_user_id)`.
- Test: extend `backend/tests/test_webhook_deduplication.py` (the redelivery
  path is already exercised there at :350,
  `test_redelivered_message_skips_bot_flow_when_message_already_exists`):
  new caplog test (use a realistic 33-char LINE ID, e.g. `U` + 32 hex
  chars, so the raw-absent assertion is meaningful) asserting the logged
  form equals `mask_line_id(raw)`
  (= first 6 chars + `…` for len>6, first 3 + `…` for len≤6, `<empty>` for
  empty — `logging_utils.py:8-18`) and that the full raw ID never appears in
  the captured log text.
- Validate: `python -m pytest tests/test_webhook_deduplication.py -q`.

### T5 · F3 — resolve the user once per broadcast fan-out [Medium]
- Verified root cause: both broadcast loops (`broadcast.py:29-34`, `:82-87`)
  call `get_unread_count` per admin, and every call re-resolves the SAME user
  via `resolve_by_line_id` (`unread.py:36`) — an admin loop of N = N identical
  user lookups per incoming message. NOTE: switching to `get_unread_counts` is
  NOT the fix — that API batches across conversations for ONE admin (wrong
  axis for this fan-out: 1 conversation, N admins) and yields no measurable
  gain (still 1 DB count query per admin, heavier marker path). Cross-admin
  batching needs an admin-axis batch API — explicitly deferred (PRD AC3).
  `ws.get_connected_admin_ids()` is already called once per fan-out (the `for`
  header) — nothing to hoist there.
- Change:
  1. `backend/app/services/live_chat_service/unread.py:23-43` — add optional
     param: `async def get_unread_count(self, line_user_id, admin_id, db,
     user=None) -> int`; inside: `if user is None: user = await
     resolve_by_line_id(db, line_user_id)`. Backward compatible — all other
     callers unchanged (verified: only `broadcast.py` + direct unit tests).
  2. `broadcast.py` — in `notify_admins_conversation_update` the resolved
     `user` is already a parameter (:21): pass `user=user` to
     `get_unread_count` (:30-34) — zero new queries for this fan-out.
     In `notify_admins_message_sent` add ONE resolve before the loop
     (`user = await resolve_by_line_id(db, line_user_id)` — import from
     `app.services.user_identity_service`) and pass `user=user` (:83-87).
- Test: extend `backend/tests/test_live_chat_service.py` (direct
  `get_unread_count` tests live at :505,518): new unit test stubbing the WS
  manager with multiple connected admins and monkeypatching a counting
  `resolve_by_line_id` — assert ZERO resolves in
  `notify_admins_conversation_update` (user is already a param) and exactly
  ONE in `notify_admins_message_sent` (guard: snapshot
  `admins = ws.get_connected_admin_ids()` and `if not admins: return`
  BEFORE resolving, so the fan-out costs zero queries when no admin is
  online); `unread_count` values unchanged and WS payload shape
  byte-identical in both. Edge case (accepted): when the user is NOT found
  (resolve → None), fan-out #1 costs 0 resolves (the `user` param already
  arrives None — same as today) but fan-out #2 does 1 pre-loop resolve + N
  per-admin fallback resolves = N+1 vs today's N — one extra query in a
  rare, not-found edge, accepted.
- Validate: `test_live_chat_service.py` (new + existing :505,518),
  `test_session_claim.py` (mocks `get_unread_count` at :244 — must stay
  green). (`test_session_choreography.py` does NOT exercise these paths —
  verified by grep — dropped from this list.)

### T6 · F5+F6 — length caps on admin free-text [Low]
- Files: `admin_requests.py:56-86` (`AdminRequestCreate`, 12 optional text
  fields at :59-74), `admin_live_chat.py:426-429` (`CreateSessionRequest.reason`)
- Change: `admin_requests.py` currently imports only `BaseModel` from pydantic
  (:19) — add `Field`. `admin_live_chat.py` already imports `Field` (:4).
  Caps (DB columns are unbounded `String`/`Text`,
  `models/service_request.py:51-70`, so these are app-level choices; all
  fields stay `Optional` — only oversize input newly 422s):
  `prefix ≤20, firstname ≤100, lastname ≤100, phone_number ≤20, email ≤254,
  agency ≤200, province ≤100, district ≤100, sub_district ≤100,
  topic_category ≤100, topic_subcategory ≤100, description ≤5000` (Text
  column), and `reason ≤255` in `CreateSessionRequest`.
- Tests: extend `backend/tests/test_admin_requests_endpoints.py` (422 on
  oversize `description`). For `reason`, test via POST `/conversations`
  (route :437-440 uses `CreateSessionRequest`) with oversize `reason` → 422 —
  NOT the transfer flow at :280 (that uses `TransferSessionPayload.reason`,
  already capped `max_length=255` at `ws_events.py:126`; a test there would
  pass before the fix and prove nothing). Request-building templates for
  this router exist in `test_session_claim.py` (e.g. :263, :312).
  Note: `CreateSessionRequest.reason` is currently a dead field (no handler
  reads `data.reason`) — the cap is cheap defense-in-depth; Pydantic still
  validates it before the handler runs.
- Validate: both touched test files.

## Phase 2 — Full validation

1. `cd backend && python -m pytest -q` (full).
2. `cd frontend && npm run lint && npm run test:unit && npm run build`.
3. Record results; any failure → fix-forward (max 3 rounds), never weaken tests.
4. Refresh the repo context graph: `graft build` (edits shift line numbers in
   ~8 indexed files).

## Phase 3 — Final re-review (diff only, G3)

1. `code-review` the diff.
2. `security-review` the diff (auth-adjacent files touched: live-chat, requests).
3. Confirm 0 unresolved Critical/High → G3 pass; Medium/Low either fixed or
   documented with reason.

## Validation Commands (exact, from Step-1 detection)

- Backend: `cd backend` → `python -m pytest -q` (full) · single file:
  `python -m pytest tests/test_<name>.py -q`
- Frontend: `cd frontend` → `npm run lint` · `npm run test:unit` · `npm run build`
- E2E: T4/T5 touch webhook-intake hot paths (`message_handler.py`,
  `broadcast.py`) but are behavior-preserving (masked log text; identical
  payloads, asserted by unit tests). Run `npm run test:e2e` only if unit tests
  or full backend validation surface any behavior change — otherwise record
  this exclusion rationale in the PR.

## Rollback

Each T is a small isolated commit; revert per-commit if validation fails.
No migration involved — rollback is `git revert` only.
