# Round-3 Codebase Findings (2026-09-28)

- **Method:** 6 parallel read-only reviewers (backend, frontend, security,
  architecture, tests, performance) + critic + synthesis; every finding below
  re-verified firsthand by the merge author against current sources on
  `fix/transfer-audit-m8` @ `a502e32` (tree includes unmerged PR #239; none
  of these findings touch its lines).
- **Counts (post-dedup, post-verification): 0 Critical, 8 High, 30 Medium,
  2 Low.** 1 reported half-finding dropped as false (see Rejected).
- **Batching:** Batch A (this run) = all 8 Highs + 10 quick Mediums (G3 gate).
  Batch B (follow-up, same pipeline) = remaining 20 Mediums + 2 Lows.
  Deferral reason for every Batch-B item: batch-size cap for reviewability;
  scheduled, not dropped (each keeps its entry below).
- **Prior rounds:** 2026-09-27 H-1..M-8 and PR-218 fixes re-verified intact
  via targeted reads; no regressions found.

## High severity

### R3-H1 — booking confirmations always fail: raw dicts passed to push_messages
- **Location:** `backend/app/services/booking_notifications.py:39-42`
- **Category:** bug (framework-issue)
- **Severity:** High — citizens never receive booking confirmations/reminders.
- **Evidence:** `_push_flex` calls `line_service.push_messages(raw_line_id,
  [{"type": "flex", "altText": ..., "contents": ...}])`, but `push_messages`
  (`line_service.py:189-210`) documents "List of LINE message objects
  (TextMessage, FlexMessage, etc.)" and passes them straight into
  `PushMessageRequest(messages=...)`. Sibling `reply_flex` (`line_service.py:155-162`)
  converts dict→`FlexMessage(alt_text=..., contents=...)` first — the pattern
  `_push_flex` skips. The resulting exception is caught by callers
  (`notify_booking_confirmed` L55-57) → logged ERROR, returns False. Always.
- **Suggestion:** build a `FlexMessage` from the dict (mirror `reply_flex`)
  before pushing; add a unit test asserting an SDK object reaches `push_messages`.
- **Batch:** A. **Reporters:** review-sweep.

### R3-H2 — requests table pagination permanently disabled; rows past 100 unreachable
- **Location:** `frontend/app/admin/requests/page.tsx:106-128,461-471`
- **Category:** bug
- **Severity:** High — admins cannot see rows beyond the first page.
- **Evidence:** the query builder (L116-128) appends status/category/search/
  dates but never `skip`/`limit`, while backend `list_requests`
  (`admin_requests.py:271-272`) defaults `limit=100`. The pagination footer
  (L460-471) is a placeholder with both buttons hard-`disabled`.
- **Suggestion:** page state + `skip`/`limit` params with prev/next enabled
  from a has-more heuristic (backend returns a bare array — no total);
  component test for page navigation.
- **Batch:** A. **Reporters:** review-sweep.

### R3-H3 — dashboard swallows fulfilled-but-not-ok API failures, renders zeros silently
- **Location:** `frontend/app/admin/page.tsx:57-65,130-135`
- **Category:** logic-error
- **Severity:** High — 401/403/500 shows a plausible all-zero dashboard.
- **Evidence:** `getRequestData` sets an error only on `rejected` (L63) or
  JSON-parse failure; `fulfilled` + `!ok` falls through both branches, and
  `error` stays null unless BOTH requests reject (L80-83). Render shows
  `requestStats?.total || 0` cards with no error banner (L130-168).
- **Suggestion:** treat `!ok` as an error branch with status-aware message;
  test for 403 → visible error, not zeros.
- **Batch:** A. **Reporters:** review-sweep.

### R3-H4 — file download uses detached anchor + immediate revoke; breaks Firefox
- **Location:** `frontend/app/admin/files/page.tsx:228-233`
- **Category:** bug (framework-issue)
- **Severity:** High — downloads fail on Firefox; large files at risk everywhere.
- **Evidence:** `document.createElement('a')` is clicked without ever being
  appended to the DOM, then `URL.revokeObjectURL(url)` runs synchronously in
  the same tick — before the browser has necessarily started the download.
- **Suggestion:** append → click → remove → revoke in a `setTimeout(…, 1000)`;
  component test asserting append/click/revoke order.
- **Batch:** A. **Reporters:** review-sweep.

### R3-H5 — LIFF upload never resets the file input; retry with same file is dead
- **Location:** `frontend/app/liff/service-request/page.tsx:230-263`
- **Category:** bug
- **Severity:** High — citizen-facing retry flow silently broken after any failure.
- **Evidence:** `handleFileUpload` reads `e.target.files[0]` and handles
  success/failure, but no path ever clears `e.target.value`, so selecting
  the same file again fires no `change` event.
- **Suggestion:** reset `e.target.value = ''` in a `finally`; component test
  selecting the same file twice.
- **Batch:** A. **Reporters:** review-sweep.

### R3-H6 — supervisor E2E suite skips all 7 tests on the unseeded CI database
- **Location:** `frontend/e2e/admin-requests-supervisor.spec.ts:77,107,136,169,203,228,282`
- **Category:** missing-test (regression-risk)
- **Severity:** High — suite passes in CI with zero assertions on this file.
- **Evidence:** every test gates on `test.skip(!detailUrl, 'no … requests in
  test DB')`, and `e2e.yml:114-119` seeds ONLY the admin user — no service
  requests ever exist, so all 7 skip every run.
- **Suggestion:** seed PENDING + COMPLETED requests in the E2E job (new seed
  script `--apply` step) so the guards never trigger; keep skips as safety.
- **Batch:** A. **Reporters:** review-sweep.

### R3-H7 — revert E2E test fulfills PATCH with fake payload, asserts nothing real
- **Location:** `frontend/e2e/admin-requests-supervisor.spec.ts:226-270`
- **Category:** missing-test (bad-practice)
- **Severity:** High — the revert flow is covered in name only.
- **Evidence:** the route fulfills PATCH with fabricated
  `{ok: true, ...body}` (L238-242); the test then asserts only
  `payload?.status == 'AWAITING_APPROVAL'` (L269). The comment (L230-233)
  promises a navigation-wait observing the reload — no such wait or UI
  assertion exists in the test body.
- **Suggestion:** await the reload/navigation (or the post-reload status UI)
  after confirm; assert the UI reflects the revert, not just the echo.
- **Batch:** A. **Reporters:** review-sweep.

### R3-H8 — real TelegramService paths never execute in tests; silent-False unproven
- **Location:** `backend/app/services/telegram_service.py:50-52,71-85`
  × `backend/tests/test_health_watchdog.py:96-97`,
  `backend/tests/test_sla_service.py:79-81`
- **Category:** missing-test
- **Severity:** High — staff alerting path is test-blind.
- **Evidence:** every test reference replaces `send_alert_message` /
  `send_handoff_notification` with `AsyncMock(return_value=True)`. The real
  credential-load → `return False` branches (L50-52, L90-92), non-200
  handling, and exception paths never run.
- **Suggestion:** unit tests for the real methods with mocked
  `credential_service` + `httpx` transport: unconfigured→False,
  non-200→False, exception→False, 200→True.
- **Batch:** A. **Reporters:** review-sweep.

## Medium severity (Batch A)

### R3-M2 — LIFF upload trusts spoofable Content-Type; no magic-byte sniff [2 reporters]
- **Location:** `backend/app/api/v1/endpoints/liff.py:103-109`
- **Category:** vulnerability
- **Severity:** Medium — citizen-authenticated stored-XSS vector.
- **Evidence:** `mime = file.content_type` is allowlist-checked and stored
  as-is (`mime_type=mime`, L124). The admin path (`media.py:54-82`)
  explicitly sniffs magic bytes because "the client Content-Type is spoofable
  and these bytes are served publicly (M10)" — same `MediaFile` table, same
  public serving, LIFF skips the sniff.
- **Suggestion:** reuse `_sniff_mime` semantics in the LIFF upload (422 on
  mismatch); test with a spoofed-header payload.
- **Batch:** A.

### R3-M4 — RequestUpdate.priority free string hits Enum column; assignees unverified
- **Location:** `backend/app/api/v1/endpoints/admin_requests.py:338,466-467,484-490`
  × `backend/app/models/service_request.py:81`
- **Category:** bug (edge-case)
- **Severity:** Medium — invalid input 500s instead of 422/404.
- **Evidence:** schema declares `priority: Optional[str]` (L338), applied
  raw at L467 onto `Column(Enum(RequestPriority))` (model L81) — any other
  string dies at flush with a 500. `assigned_agent_id`/`assigned_by_id`
  (L484-490) are applied with no existence check — unknown ids die on the
  `users.id` FK with a 500.
- **Suggestion:** type `priority` as the `RequestPriority` enum (422 on
  invalid) + `db.get(User, …)` existence checks → 404; endpoint tests.
- **Batch:** A.

### R3-M6 — hard user delete 500s on any referenced history (no IntegrityError path)
- **Location:** `backend/app/api/v1/endpoints/admin_users.py:562-576`
  × `backend/app/models/*.py` (~20 `ForeignKey("users.id")` without `ondelete`)
- **Category:** bug (edge-case)
- **Severity:** Medium — hard delete of a real user always 500s.
- **Evidence:** `await db.delete(user)` + `create_audit_log` + `commit` with
  no `try/except IntegrityError`. Only 3 of ~23 child FKs declare `ondelete`
  (`audit_log` SET NULL, `debt_mediation` SET NULL, `permission_setting`
  SET NULL, `tag` CASCADE); sessions/messages/requests/etc. all block.
- **Suggestion:** catch `IntegrityError` → 409 with a clear "user has history,
  use deactivate" message; test with a referenced user. (NOT changing FK
  ondelete policy — that is a data-model decision for Batch B if wanted.)
- **Batch:** A.

### R3-M9 — CSV export writes raw content: formula injection on open
- **Location:** `backend/app/api/v1/endpoints/admin_export.py:112-119`
- **Category:** vulnerability
- **Severity:** Medium — malicious citizen message → admin opens CSV in Excel.
- **Evidence:** `csv.writer(buf).writerow([…, m.content or ""])` — `csv.writer`
  quotes but never defuses leading `= + - @`, which Excel/Sheets execute as
  formulas on open.
- **Suggestion:** prefix-defuse (`'` + cell) any cell starting with
  `=+-@` (plus tab/CR variants); unit test over `_iter_csv_rows`.
- **Batch:** A.

### R3-M10 — LIFF ServiceRequestCreate has zero length caps; attachments unvalidated
- **Location:** `backend/app/schemas/service_request_liff.py:10-33`
- **Category:** bad-practice (edge-case)
- **Severity:** Medium — unbounded citizen input into DB columns.
- **Evidence:** all 16 string fields are bare `Optional[str]`; `attachments:
  Optional[list]` accepts any shape. Round-1 F5/F6 capped the admin-side
  `AdminRequestCreate` (12 fields) — this LIFF twin was missed.
- **Suggestion:** mirror F5/F6 caps (per-field `max_length` + typed
  attachment items with count cap); 422 tests.
- **Batch:** A.

### R3-M11 — password fields lack max_length; >72-byte input crashes raw bcrypt
- **Location:** `backend/app/api/v1/endpoints/admin_users.py:61,72,76`,
  `backend/app/schemas/auth.py:7-9` × `backend/app/core/security.py:51-56`
- **Category:** bug (edge-case)
- **Severity:** Medium — 500 on create/update/reset with a long password.
- **Evidence:** `get_password_hash` calls raw `bcrypt.hashpw` with no
  try/except; bcrypt raises `ValueError` past 72 bytes. All three password
  fields carry only `min_length=8`, and `LoginRequest` is fully uncapped
  (login path is crash-safe via caught `verify_password`, but inconsistent).
- **Suggestion:** `max_length=72` on all password fields incl. login (422,
  not 500); tests for 73-byte input on each route.
- **Batch:** A.

### R3-M13 — security headers absent: no headers() hook, no middleware
- **Location:** `frontend/next.config.js:1-36` (whole file) + no `middleware.ts`
- **Category:** bad-practice (vulnerability)
- **Severity:** Medium — missing CSP/HSTS/frame-ancestors/Referrer-Policy.
- **Evidence:** config defines only strictMode/images/turbopack/env/rewrites;
  `Test-Path` for `middleware.ts`/`middleware.js` under `frontend/`,
  `frontend/src/`, `frontend/app/` all False.
- **Suggestion:** `headers()` in `next.config.js` (frame-ancestors,
  nosniff, referrer-policy, HSTS; report-only CSP first); header test or
  documented manual check.
- **Batch:** A.

### R3-M14 — same-priority intent match nondeterministic: limit(1) with no ORDER BY
- **Location:** `backend/app/services/message_intake/intent_matching.py:71-97`
  × `_intent_keyword_stmt` (`:51-60`, no `order_by`)
- **Category:** logic-error
- **Severity:** Medium — which rule answers can flip between identical messages.
- **Evidence:** EXACT / STARTS_WITH / CONTAINS branches each end `.limit(1)`
  with no ordering; the shared stmt builder selects + filters only.
- **Suggestion:** deterministic tiebreak (e.g. `order_by(priority.desc(),
  id.asc)` — verify `priority` column exists on `IntentKeyword` at plan
  time); test with two matching rules asserting the stable winner.
- **Batch:** A.

### R3-M26 — get_db duplicated with a wrong annotation; imports split
- **Location:** `backend/app/db/session.py:20` × `backend/app/api/deps.py:25`
- **Category:** maintainability
- **Severity:** Medium — two identical generators; `db/session` annotates
  `-> AsyncSession` on a generator function (wrong; `deps` correctly says
  `AsyncGenerator`).
- **Evidence:** both bodies are `async with AsyncSessionLocal() as session:
  yield session`; endpoints import from both modules.
- **Suggestion:** single canonical `get_db` (keep `deps.get_db`, correct
  annotation), re-export or redirect the other; grep-verify no caller breaks.
- **Batch:** A.

### R3-M27 — CD pipes unpinned koyeb master install.sh to sh
- **Location:** `.github/workflows/cd.yml:300`
- **Category:** dependency-risk
- **Severity:** Medium — supply-chain + the known transient-404 flake source.
- **Evidence:** `curl -fsSL
  https://raw.githubusercontent.com/koyeb/koyeb-cli/master/install.sh | sh`
  (round-1 session log already flagged this as optional hardening after one
  transient 404 failed a CD run).
- **Suggestion:** pin a release artifact + retry loop; no test (workflow-only).
- **Batch:** A.

## Medium severity (Batch B — deferred, scheduled)

> Every item below was verified TRUE firsthand. Shared deferral reason:
> batch-size cap for reviewability — Batch A already carries 18 findings.
> Each keeps its evidence here so round-3b starts from facts, not re-review.

### R3-M1 — set_chat_mode commits internally, splitting toggle_mode atomicity
- **Location:** `backend/app/services/live_chat_service/messaging.py:186-193`
  × caller `backend/app/api/v1/endpoints/admin_live_chat.py:331-362`
- **Category:** logic-error. **Severity:** Medium.
- **Evidence:** `set_chat_mode` flips `chat_mode` + `db.commit()` (L191);
  the sole caller `toggle_mode` then runs `ensure/release_operator_session`
  + a second commit (L352-361). A failure between the two leaves HUMAN mode
  with no ACTIVE session — the exact broken state the endpoint docstring
  (L338-345) describes. (Synthesis doubted the caller; merge author located it.)
- **Suggestion:** drop the internal commit (M-7 twin); caller commits once.
- **Batch:** B.

### R3-M3 — bot reply hits LINE before persist; broadcasts precede webhook commit
- **Location:** `backend/app/services/message_intake/message_handler.py:182-201,98,222`
  × `backend/app/api/v1/endpoints/webhook.py:99`
- **Category:** logic-error. **Severity:** Medium.
- **Evidence:** `reply_messages` (L184) runs BEFORE the `save_message` loop
  (L186-198) — a crash between = ghost message (seen, never stored). WS
  broadcasts (L98, L222) and the LINE reply all precede the webhook's single
  per-event commit (`webhook.py:99`). Deferral reason: needs a
  commit-then-announce refactor of the webhook handler (M-6 pattern, larger
  surface) — too big to fold into Batch A safely.
- **Suggestion:** persist-then-reply for the bot path; phase-split the
  handler (mutate → commit → announce) per the M-6 precedent.
- **Batch:** B.

### R3-M5 — get_or_create_user rolls back the whole session on create-race
- **Location:** `backend/app/services/friend_service.py:47-60`
- **Category:** logic-error. **Severity:** Medium.
- **Evidence:** `except IntegrityError: await db.rollback()` discards ALL
  pending work in the caller's transaction (e.g. earlier webhook saves),
  then re-resolves. A concurrent follow/message race silently drops the
  transaction's prior writes.
- **Suggestion:** nested transaction (savepoint) around the insert; DB race test.
- **Batch:** B (twin of Batch-A atomicity fixes; kept out only by batch cap).

### R3-M7 — get/create/update user + CSV export bypass role-based LINE-ID masking
- **Location:** `backend/app/api/v1/endpoints/admin_users.py:331,396,513`
  + `backend/app/api/v1/endpoints/admin_export.py:114`
  vs list masking at `admin_users.py:216-219`
- **Category:** vulnerability (PII). **Severity:** Medium.
- **Evidence:** list masks via `mask_line_id(..., current_admin.role.value)`;
  get/create/update return raw decrypted IDs; conversation CSV exports a raw
  `line_user_id` column. Deferral reason: the export half changes the export
  contract and needs a product decision (mask in exports vs gate by role);
  kept together with the endpoint half for one coherent masking pass.
- **Suggestion:** apply `mask_line_id` on the three endpoints; decide +
  implement export masking in the same pass.
- **Batch:** B.

### R3-M8 — LINE media download/persist has no size cap (narrowed from M9)
- **Location:** `backend/app/services/line_service.py:302-317,332-359`
- **Category:** edge-case (DoS). **Severity:** Medium.
- **Evidence:** `download_message_content` buffers unbounded bytes; persist
  writes them to disk with no `len(data)` check on the webhook path.
  (Filename half of the original report DROPPED — basename/`..` strip +
  resolve-guard verified at L347-357; see Rejected.)
- **Suggestion:** cap with 413/skip + test with mocked oversized download.
  Deferral reason: cap value needs a product call (LINE video can be large;
  wrong cap breaks legit media) — batch-cap casualty otherwise.
- **Batch:** B.

### R3-M12 — LIFF booking GETs unthrottled while each hit fires sync LINE verify
- **Location:** `backend/app/api/v1/endpoints/liff_bookings.py:53-59,76-103`
  × `backend/app/api/v1/endpoints/liff.py:31-52`
- **Category:** performance (edge-case). **Severity:** Medium.
- **Evidence:** `_submit_rate_limit` exists but GET `/options` + `/availability`
  don't use it; both depend on `require_line_user_id` →
  `verify_liff_token`, a live HTTPS POST to LINE per hit (no cache).
- **Suggestion:** attach the existing limiter to the GETs; test 429 + no-verify-on-limited.
- **Batch:** B (batch-cap casualty; 10-line fix).

### R3-M15 — any non-ok list response flips live-chat console to backend-offline
- **Location:** `frontend/app/admin/live-chat/_hooks/useConversationSync.ts:52-60`
- **Category:** logic-error. **Severity:** Medium.
- **Evidence:** `else { setBackendOnline(false) }` on any `!res.ok` —
  401/403 (auth) misreported as backend-down.
- **Suggestion:** offline only on network error / 5xx; 401/403 → auth flow.
- **Batch:** B (batch-cap casualty).

### R3-M16 — isNetworkError exact-match defeated by the Thai rewrap
- **Location:** `frontend/lib/api-error.ts:87-91` × `frontend/lib/authFetch.ts:168-171`
- **Category:** logic-error. **Severity:** Medium.
- **Evidence:** `isNetworkError` requires `message === 'Failed to fetch'`,
  but the global fetch patch rethrows `new TypeError('ไม่สามารถเชื่อมต่อ
  Backend ได้ …', { cause: error })` — message never matches, so real
  outages misclassify wherever both are used.
- **Suggestion:** match on `cause` chain too (or a marker property); test
  with the rewrapped error.
- **Batch:** B (batch-cap casualty).

### R3-M17 — send/send_media/mark-read load full conversation detail for 3 fields
- **Location:** `backend/app/api/v1/endpoints/admin_live_chat.py:60-76,111,204`
  × `conversations.py:295-340` (~6 queries + 50 messages)
- **Category:** performance. **Severity:** Medium.
- **Evidence:** `_broadcast_conversation_update` loads full detail for
  display_name/picture_url/chat_mode (send path L169, media path L204);
  `mark_read` loads it (L111) and uses nothing but the None check.
- **Suggestion:** lightweight identity lookup for the broadcast paths;
  existence-check-only for mark_read. Deferral reason: touches hot
  send-path shape — wants its own test + perf before/after, not rushed.
- **Batch:** B.

### R3-M18 — send_message discards the persisted row; both callers re-fetch
- **Location:** `backend/app/services/live_chat_service/messaging.py:87`
  × callers `admin_live_chat.py:167`, `ws_session/handlers.py:152`
- **Category:** performance (maintainability). **Severity:** Medium.
- **Evidence:** returns `{"success": True}`; HTTP caller re-fetches
  `get_recent_messages(…, 1)` (L167), WS caller the same (L152).
- **Suggestion:** return the persisted payload; drop both re-fetches; tests
  assert single-write-single-read. Deferral reason: return-shape change
  across HTTP+WS callers deserves its own validation pass.
- **Batch:** B.

### R3-M19 — inbox loads run 3 window subqueries, message ones unfiltered
- **Location:** `backend/app/services/live_chat_service/conversations.py:90-139`
- **Category:** performance. **Severity:** Medium.
- **Evidence:** latest-session window is status-filtered (L91-102), but the
  latest-message and latest-incoming `row_number()` windows (L113-139) scan
  the full Message table on every inbox load.
- **Suggestion:** filter pushdown (active correspondents / recency window);
  needs EXPLAIN before/after on realistic data — measurement-gated.
- **Batch:** B.

### R3-M20 — get_live_kpis runs ~12 sequential uncached queries per call
- **Location:** `backend/app/services/analytics_service.py:29-98`
- **Category:** performance. **Severity:** Medium.
- **Evidence:** 9 top-level awaits (counts, FRT/resolution avgs, CSAT, FCR,
  abandonment, SLA-breach, today's sessions, HUMAN count), several fanning
  into sub-queries — sequential, no cache. (Polling-cadence half of the
  report not independently verified; finding rests on the query shape.)
- **Suggestion:** parallelize independent scalars + short TTL cache;
  measurement-gated.
- **Batch:** B.

### R3-M21 — percentiles computed in Python over all rows, not percentile_cont
- **Location:** `backend/app/services/analytics_service.py:340-373`
- **Category:** performance. **Severity:** Medium.
- **Evidence:** both epoch sets fully loaded (L359-360) and percentiled in
  Python (`_percentile`) instead of SQL `percentile_cont`.
- **Suggestion:** SQL-side percentiles; DB test asserting identical P50/P90/P99.
- **Batch:** B (batch-cap casualty; self-contained SQL change).

### R3-M22 — webhook hot path runs up to 6 sequential intent queries per message
- **Location:** `backend/app/services/message_intake/intent_matching.py:71-100,125-137,154-165`
- **Category:** performance. **Severity:** Medium.
- **Evidence:** worst path = EXACT + STARTS_WITH + CONTAINS + REGEX-all +
  autoreply-exact + autoreply-contains, sequential, per message.
- **Suggestion:** combine/caching strategy for the hot path. Deferral reason:
  highest-risk hot path in the system — design + measurement, not a batch fix.
- **Batch:** B.

### R3-M23 — httpx clients without timeout across services (wider than reported)
- **Location:** `backend/app/services/telegram_service.py:71,96`,
  `backend/app/api/v1/endpoints/settings.py:284`,
  `backend/app/services/credential_service.py:220,231`,
  `backend/app/services/rich_menu_service.py:165,189,214,228+`
  (good mirror with timeout: `liff.py:37`)
- **Category:** bad-practice (edge-case). **Severity:** Medium.
- **Evidence:** bare `httpx.AsyncClient()` on request paths — a hung upstream
  hangs the worker. Synthesis cited telegram + token validation; merge author
  found the same pattern in credential + rich-menu services.
- **Suggestion:** shared timeout constant; note rich-menu image upload needs
  a longer read timeout. Deferral reason: cross-service sprawl — one
  coherent pass, not squeezed into Batch A.
- **Batch:** B.

### R3-M24 — WS limiter is per-process; HTTP limiter is Redis-backed
- **Location:** `backend/app/core/rate_limiter.py:83-117`
  vs `backend/app/core/http_rate_limit.py:66-87`
- **Category:** architecture. **Severity:** Medium.
- **Evidence:** WS limiter = in-process dict buckets singleton; HTTP limiter
  = Redis `fixed_window_allow` with in-process fallback. Multi-worker WS
  abuse is under-counted N×.
- **Suggestion:** Redis-backed WS limiter mirroring the HTTP one.
- **Batch:** B (needs multi-worker reasoning + tests).

### R3-M25 — global fetch patch forces credentials + refresh-retry on non-API traffic
- **Location:** `frontend/lib/authFetch.ts:105-148,156-179`
- **Category:** logic-error. **Severity:** Medium.
- **Evidence:** `installAdminAuthFetchInterceptor` replaces global
  `window.fetch`; only the CSRF header is API-gated (`isApiRequest`, L112)
  while `credentials: 'include'` (L116) + 401-refresh-retry (L126-148) apply
  to every request incl. non-API.
- **Suggestion:** early bypass for non-API URLs. Deferral reason:
  auth-adjacent — wants a dedicated validation pass, not batch company.
- **Batch:** B.

### R3-M28 — LIFF validateStep accepts whitespace-only names/descriptions
- **Location:** `frontend/app/liff/service-request/page.tsx:273-295`
- **Category:** bug (edge-case). **Severity:** Medium.
- **Evidence:** truthiness checks (`if (!formData.firstname)`) pass
  `"   "`. Backend `_blank()` rejects it (422), so the user sees a late
  server error instead of inline guidance.
- **Suggestion:** `.trim()` checks mirroring the backend `_blank` rule.
- **Batch:** B (batch-cap casualty).

### R3-M29 — phone maxLength=10 contradicts the 12-char dashed placeholder (3 wizards)
- **Location:** `frontend/app/liff/service-request/page.tsx:642-643`,
  `frontend/app/liff/request-v2/page.tsx:380-381`,
  `frontend/app/liff/service-request-single/page.tsx:450-451`
- **Category:** bug. **Severity:** Medium.
- **Evidence:** all three: `placeholder="0xx-xxx-xxxx"` + `maxLength={10}` —
  the suggested format cannot be typed.
- **Suggestion:** strip dashes on input (or maxLength 12 + normalize);
  validation (`length >= 9`) already tolerates digits-only.
- **Batch:** B (batch-cap casualty).

### R3-M30 — login field errors tint only; message never rendered, no aria-invalid
- **Location:** `frontend/app/login/page.tsx:291-380` (all 6 `errors.*` uses
  are className ternaries; zero text render, zero aria attributes)
- **Category:** bug (a11y). **Severity:** Medium.
- **Evidence:** `errors.username/password` only switch tint classes; no
  `{errors.x && <p>}`, no `aria-invalid`/`aria-describedby`/`role="alert"`.
- **Suggestion:** render message text + `aria-invalid` + describedby wiring.
- **Batch:** B (batch-cap casualty).

## Low severity (deferred)

### R3-L1 — broadcast can strand in SENDING only via client-disconnect/crash (downgraded)
- **Location:** `backend/app/services/broadcast_service.py:177-250,270-278`
- **Category:** edge-case. **Severity:** Low (downgraded from Medium).
- **Evidence:** per-chunk retries + `except Exception → FAILED` (L243-246)
  handle every in-process failure; only CancelledError (client disconnect)
  or process death strands SENDING — and `cancel_broadcast` accepts SENDING
  (L271), so recovery = cancel + recreate. Original "timeout strands"
  mechanism overstated: chunk timeouts are caught and counted, loop continues.
- **Suggestion:** background-task send with SENDING reclaim. Needs architecture
  work — deferred beyond Batch B scope decision.
- **Batch:** deferred.

### R3-L2 — optimistic tempId from Date.now alone (downgraded; near-impossible)
- **Location:** `frontend/app/admin/live-chat/_hooks/useMessageFlow.ts:162-164`
- **Category:** edge-case. **Severity:** Low (downgraded from Medium).
- **Evidence:** `temp-${Date.now()}` CAN theoretically collide, but the
  `s.sending` guard (L162) serializes sends — a same-millisecond second send
  requires a sub-millisecond ack round-trip (localhost E2E at most).
- **Suggestion:** append a counter/random suffix (1 line). Deferred with the
  batch; pull forward opportunistically if the file is touched.
- **Batch:** deferred.

## Rejected (failed verification)

### M9-filename-half — "attacker filenames stored without uuid prefix": FALSE
- **Location claimed:** `backend/app/services/line_service.py:347-357`
- **Reason:** firsthand read shows basename extraction, `..` stripping,
  empty-name uuid fallback, extension handling, and a resolve-guard with
  uuid fallback on traversal escape. Traversal/overwrite-by-path are
  handled; the size-cap half stands separately as R3-M8.
- **Disposition:** dropped (reported here, not carried forward).

## Omitted scope (synthesis caveats, carried verbatim + author note)

- Critic produced no usable verdict (5 tool calls); completeness judging fell
  back to the merge author's firsthand verification above.
- Synthesizer noted prior results 7/8 contents unavailable + performance tail
  truncated — assessed by author as critic/followup (low content) plus
  possibly 1-3 further perf items. The perf-heavy Batch-B list (R3-M17…
  R3-M25) already captures the class; a targeted perf sweep opens round-3b.
- Partial deep-read areas (services: analytics/csat/credential/response_parser/
  rich_menu/settings/tag/pdf_report/sla; some endpoints; hooks/lib/components
  tails; alembic versions beyond the debt-mediation migration): covered by
  pattern search + cited-file full reads only, not line-by-line.
- No live verification during sweep (read-only rule); no coverage/mutation
  metrics; no EXPLAIN/bundle/load measurement.
- Author note: round-3b should start with the targeted perf sweep + the
  partial areas above before new-feature work.

## Coverage map (Batch A → files, for the PRP)

- R3-H1 → `backend/app/services/booking_notifications.py` + new/updated test
- R3-H2 → `frontend/app/admin/requests/page.tsx` + component test
- R3-H3 → `frontend/app/admin/page.tsx` + test
- R3-H4 → `frontend/app/admin/files/page.tsx` + test
- R3-H5 → `frontend/app/liff/service-request/page.tsx` + test
- R3-H6 → `frontend/e2e/*` + new `backend/scripts/seed_e2e_requests.py` + `e2e.yml`
- R3-H7 → `frontend/e2e/admin-requests-supervisor.spec.ts`
- R3-H8 → `backend/tests/test_telegram_service.py` (new)
- R3-M2 → `backend/app/api/v1/endpoints/liff.py` + media upload tests
- R3-M4 → `backend/app/api/v1/endpoints/admin_requests.py` + tests
- R3-M6 → `backend/app/api/v1/endpoints/admin_users.py` + tests
- R3-M9 → `backend/app/api/v1/endpoints/admin_export.py` + tests
- R3-M10 → `backend/app/schemas/service_request_liff.py` + tests
- R3-M11 → `backend/app/api/v1/endpoints/admin_users.py` + `schemas/auth.py` + tests
- R3-M13 → `frontend/next.config.js`
- R3-M14 → `backend/app/services/message_intake/intent_matching.py` + tests
- R3-M26 → `backend/app/api/deps.py` + `backend/app/db/session.py` (no behavior change)
- R3-M27 → `.github/workflows/cd.yml` (no test; workflow-only)

