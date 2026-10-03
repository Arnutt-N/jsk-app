# PRD: Codebase Review Round 3, Batch B (2026-10-03)

- **Source spec (binding):** `.claude/PRPs/findings/2026-09-28-codebase-review-r3-findings.md`
  (0 Critical, 8 High, 30 Medium, 2 Low — all firsthand-verified)
- **Branch:** `fix/codebase-review-r3b-20261003` (from `main` @ `8464b71`)
- **Scope:** Batch B = remaining 20 Mediums + 2 Lows. Batch A (8 Highs +
  10 Mediums) shipped as PR #240; transfer-audit M-8 shipped as PR #239.
  All Batch-B items re-verified firsthand against current `main` on
  2026-10-03 (line numbers below are current; several shifted vs the
  findings file because Batch A landed).
- **Gates:** codebase-review-fix G1 (findings bound) → G2
  (prp-validate-plan READY ≥ 8 before any code change) → staged
  implementation with per-task validation → final review → G3 (zero
  unresolved Critical/High — this batch has none, so G3 = no regressions).

## Product decisions (locked here, not deferred)

### D1 — M7 export half: mask by role inside exports
The finding asked for a product call (mask in exports vs gate by role).
Decision: **mask by role** using the existing `mask_line_id(v, role)`
helper (`app/core/pii_masking.py`) — SUPER_ADMIN/ADMIN see full IDs,
other roles see masked IDs — applied to the CSV `line_user_id` column,
the PDF `LINE User ID:` line, and the display-name fallback (which feeds
both the PDF header and the export filename). Rationale: exports are
downloaded files that get forwarded/shared, so the file contents must
not exceed what the downloader's role may see on screen; the list
endpoint already encodes exactly this policy, and masking stays correct
even if an operator later grants `export_chat` to a non-admin role via
the permission matrix (the gate alone would silently leak).

### D2 — M8 cap value: 50 MB
The finding asked for a product call (LINE video can be large; a wrong
cap breaks legit media). Decision: **`MAX_LINE_MEDIA_BYTES = 50 MB`**
as a named constant in `line_service.py`. Rationale: generous enough
that no legitimate LINE message (image/video/audio/file) hits it, while
an unbounded/malicious payload can no longer fill the disk. Honest
limit, documented in the plan: the LINE SDK buffers the whole response
in memory before returning, so the cap is enforced post-download (disk +
downstream guard); the in-RAM bound remains LINE's own per-message
limits. Oversized media is skipped (message still saved, payload
records size + skip reason) — never a crash, never a silent drop.

## Problems (one per accepted finding)

### R3-M1 — set_chat_mode commits internally, splitting toggle atomicity
- **Root cause:** `set_chat_mode` (`messaging.py:186-193`) flips
  `chat_mode` + `db.commit()`; its sole caller `toggle_mode`
  (`admin_live_chat.py:346-361`) then runs ensure/release session + a
  second commit. A failure between the two leaves HUMAN mode with no
  ACTIVE session — the exact broken state the endpoint docstring warns
  about. (Sole caller verified by repo-wide grep.)
- **Impact:** operator toggles to HUMAN and every send is rejected.
- **Why now:** one-line fix (drop the internal commit); atomicity twin of
  the Batch-A/PR-239 fixes.

### R3-M3 — bot reply hits LINE before persist; broadcasts precede commit
- **Root cause:** `reply_messages` (`message_handler.py:184`) runs BEFORE
  the `save_message` loop (L186-198); WS broadcasts (L98, L222) and the
  `notify_admins_conversation_update` calls (L112, L237) all run before
  the webhook's single per-event commit (`webhook.py:99`). The same
  reply-before-commit shape exists in the command helpers
  (`commands.py`: status/booking/bind — bind even writes + flushes, then
  replies pre-commit) and in handoff (`handoff.py`: after-hours reply
  L91 runs BEFORE the session write; greeting L126 / queue flex L131 /
  telegram task L149 run pre-commit).
- **Impact:** crash between send and commit = ghost message (seen on
  LINE, never stored) or staff notified of a handoff with no session.
- **Why now:** correctness on the hottest path; fix = persist-then-reply
  + a small outbox (mutate → commit → announce). Postback handler
  explicitly out of scope (separate surface, no evidence in this
  finding).

### R3-M5 — get_or_create_user rolls back the whole session on create-race
- **Root cause:** `except IntegrityError: await db.rollback()`
  (`friend_service.py:53-54`) discards ALL pending work in the caller's
  transaction (e.g. earlier webhook saves), then re-resolves.
- **Impact:** a concurrent follow/message race silently drops the
  transaction's prior writes.
- **Why now:** exact in-repo mirror exists (`_add_open_session`,
  `handoff.py:25-53` — savepoint + re-resolve, no full rollback).

### R3-M7 — get/create/update user + exports bypass role-based LINE-ID masking
- **Root cause:** list masks via `mask_line_id`
  (`admin_users.py:237-240`); get (L352) / create (L417) / update (L534)
  return raw decrypted IDs; conversation CSV exports a raw
  `line_user_id` column (`admin_export.py:124`); PDF prints
  `LINE User ID: {raw}` (`admin_export.py:226`); `_display_name`
  falls back to the raw ID (feeds PDF header + filename).
- **Impact:** PII (raw LINE IDs) leaks to roles the list endpoint
  deliberately masks, and into downloaded files.
- **Why now:** one coherent masking pass per D1; helper + policy already
  exist.

### R3-M8 — LINE media download/persist has no size cap
- **Root cause:** `download_message_content` buffers unbounded bytes;
  `persist_line_media` writes them with no `len(data)` check
  (`line_service.py:302-381`). (Filename half of the original report
  stays dropped — verified handled.)
- **Impact:** disk-fill DoS via a huge LINE payload on the webhook path.
- **Why now:** cap + skip path per D2; callers (`media_extraction.py`)
  already tolerate `url: None`.

### R3-M12 — LIFF booking GETs unthrottled while each hit fires sync LINE verify
- **Root cause:** `_submit_rate_limit` exists
  (`liff_bookings.py:53-59`) and POST/PATCH routes attach it via
  `dependencies=[...]`, but the 4 GETs (`/options` L76, `/availability`
  L94, `/availability/range` L129, `/me` L224) don't; every GET runs
  `verify_liff_token`, a live HTTPS POST to LINE.
- **Impact:** unauthenticated-cost abuse burns LINE verify quota + CPU.
- **Why now:** 4 one-line attachments on a SEPARATE read bucket
  (`liff-booking-read`, 60/60 — decorator deps run before
  `require_line_user_id`, so limited requests skip the LINE call).
  Sharing the 5/300 submit bucket would 429 legitimate submits after
  normal browsing — the separate scope is the design (G2 round-3).

### R3-M15 — any non-ok list response flips live-chat console to backend-offline
- **Root cause:** `else { setBackendOnline(false) }`
  (`useConversationSync.ts:58-60`) on any `!res.ok` — 401/403 (auth)
  misreported as backend-down.
- **Impact:** operators see a false offline banner during auth expiry.
- **Why now:** small status-aware branch; the global interceptor already
  owns the 401/403 auth flow (`jsk:auth-expired`), so the hook only
  needs to stop crying offline.

### R3-M16 — isNetworkError exact-match defeated by the Thai rewrap
- **Root cause:** `isNetworkError` requires `message === 'Failed to
  fetch'` (`api-error.ts:87-91`), but the global fetch patch rethrows
  `new TypeError('ไม่สามารถเชื่อมต่อ Backend ได้ …', { cause: error })`
  (`authFetch.ts:168-172`) — message never matches.
- **Impact:** real outages misclassify wherever both are used (notably
  `apiFetch`'s catch, which then reports "unexpected error").
- **Why now:** walk the `cause` chain (bounded, cycle-safe); existing
  tests pin non-TypeError → false and must keep passing.

### R3-M17 — send/send_media/mark-read load full conversation detail for 3 fields
- **Root cause:** `_broadcast_conversation_update` loads full detail
  (`admin_live_chat.py:65`) for display_name/picture_url/chat_mode;
  send_media duplicates it (L204); mark_read (L111) loads it for a
  None-check only. Full detail = resolve + tags + session + 50 messages
  + last-incoming (`conversations.py:295-342`).
- **Impact:** every operator send pays ~6 queries + a 50-message load
  for 3 scalar fields.
- **Why now:** exact in-repo mirror exists (the WS send path already
  does a single `resolve_by_line_id` + direct fields,
  `ws_session/handlers.py:170-177`).

### R3-M18 — send_message discards the persisted row; both callers re-fetch
- **Root cause:** service returns `{"success": True}`
  (`messaging.py:87`), discarding `saved`; HTTP caller re-fetches
  (`admin_live_chat.py:167`), WS caller re-fetches
  (`ws_session/handlers.py:152` — actual path is
  `app/services/ws_session/handlers.py`, not under `live_chat_service`
  as the finding cites).
- **Impact:** wasted read on every send; two code paths to keep in sync.
- **Why now:** exact in-repo mirror exists (media twin already returns
  `message_payload_dict`, `messaging.py:181-184`); callers drop their
  re-fetch. WS caller must preserve its `temp_id` stamping.

### R3-M19 — inbox loads run 3 window subqueries, message ones unfiltered
- **Root cause:** latest-message and latest-incoming `row_number()`
  windows (`conversations.py:112-143`) sort the full Message table on
  every inbox load; only the session window is status-filtered.
- **Impact:** inbox latency grows with total message history.
- **Why now:** rewrite the two message windows as `DISTINCT ON (user_id)`
  ordered by the existing `ix_messages_user_created (user_id,
  created_at DESC)` index — same winner per user, index-driven instead
  of a full-table sort. Equivalence proven by a DB test (CI). The
  session window stays (already filtered; sessions table is small).

### R3-M20 — get_live_kpis runs ~12 sequential uncached queries per call
- **Root cause:** 10 sequential top-level awaits (several fanning into
  sub-queries), no cache (`analytics_service.py:29-98`).
- **Impact:** dashboard KPI latency = sum of ~12 query round trips, on
  every poll.
- **Why now:** cache-aside mirroring `get_dashboard` in the same file
  (L440-532: same `CACHE_TTL_SECONDS = 120`, fail-open, `cache_hit`
  flag) + `asyncio.gather` over session-per-query coroutines
  (AsyncSession is not concurrency-safe, so each query gets its own
  short-lived session from the already-imported `AsyncSessionLocal`).

### R3-M21 — percentiles computed in Python over all rows (DEAD CODE)
- **Root cause:** `get_percentiles` loads both epoch sets fully and
  percentiles in Python (`analytics_service.py:340-373`).
- **Deviation from suggestion (verified):** the finding suggests
  SQL-side percentiles, but the SQL-side already exists and is the live
  path — `get_dashboard` computes all six percentiles via
  `percentile_cont` (`analytics_service.py:762-815`) and the frontend
  reads `dashboard.percentiles`. Repo-wide grep proves
  `get_percentiles` + `_percentile` have ZERO callers. The fix is
  deletion (34 + 13 lines), not a rewrite.
- **Impact after fix:** the all-rows load becomes unreachable by
  construction; zero behavior change (dead code).
- **Why now:** cheapest correct resolution; validated by grep + full
  suite green.

### R3-M22 — webhook hot path runs up to 6 sequential intent queries per message
- **Root cause:** worst path = EXACT + STARTS_WITH + CONTAINS +
  REGEX-all + autoreply-exact + autoreply-contains, sequential, per
  message (`intent_matching.py:66-140`).
- **Impact:** up to 6 round trips on the hottest path in the system.
- **Why now:** combine the SQL branches with identical predicates —
  intent EXACT/STARTS_WITH/CONTAINS become ONE statement (`CASE`
  priority + `ORDER BY prio, id LIMIT 1`, preserving the R3-M14
  tiebreak and `selectinload`); autoreply exact/contains become ONE
  (adding the same deterministic id tiebreak — currently unordered).
  REGEX-all stays a separate query (needs all rows for Python eval).
  Worst path 6 → 3 round trips with byte-identical match semantics,
  proven by a DB equivalence matrix (CI) + a local call-count test.

### R3-M23 — httpx clients without timeout across services
- **Root cause:** bare `httpx.AsyncClient()` on request paths — telegram
  (2), settings token-validate (1), credential verify (2), rich-menu
  service (19: 18 JSON + 1 image upload). A hung upstream hangs the
  worker. (`liff.py` and `admin_integrations.py` already set timeouts —
  untouched.)
- **Impact:** worker exhaustion on slow upstreams.
- **Why now:** one shared-constants module + mechanical retarget; every
  site already handles network errors (telegram/credential catch or
  propagate like any `ConnectError`; rich-menu upload's
  `except HTTPStatusError` lets `TimeoutException` fail fast past it).
  Upload site gets a longer read/write budget.

### R3-M24 — WS limiter is per-process; HTTP limiter is Redis-backed
- **Root cause:** `WebSocketRateLimiter` = in-process dict buckets
  singleton (`rate_limiter.py:83-117`); HTTP limiter = Redis
  `fixed_window_allow` with in-process fallback
  (`http_rate_limit.py:79-91`). Multi-worker WS abuse under-counts N×.
- **Impact:** WS rate limits don't hold across workers.
- **Why now:** async Redis-backed methods mirroring the HTTP limiter
  exactly (same `fixed_window_allow`, same None → in-process fallback);
  all 3 call sites are in async context. Sync methods stay (fallback +
  existing `test_ws_security.py` unit tests keep passing unchanged).

### R3-M25 — global fetch patch forces credentials + refresh-retry on non-API traffic
- **Root cause:** `handleCookieModeFetch` applies `credentials: 'include'`
  + 401-refresh-retry to every request; only the CSRF header is
  API-gated (`authFetch.ts:105-154`).
- **Impact:** non-API fetches (CDN, `_next` static) carry cookies and
  can trigger an auth refresh + `jsk:auth-expired` logout on a 401 that
  has nothing to do with the session.
- **Why now:** early bypass for non-API URLs (same `isApiRequest`
  predicate); the network-error rewrap is likewise API-gated so a CDN
  failure no longer claims "Backend" is down. Existing API-path tests
  keep passing (incl. the pinned credentials-on-API test).

### R3-M28 — LIFF validateStep accepts whitespace-only names/descriptions
- **Root cause:** truthiness checks (`if (!formData.firstname)`) pass
  `"   "` (`service-request/page.tsx:275-308`); backend `_blank()`
  rejects it (422), so the citizen sees a late server error instead of
  inline guidance. The twin validator `validateForm` in
  `service-request-single/page.tsx:239-257` has the identical bug
  (verified firsthand — same fix).
- **Registered deviation R3-M28-twin:** the finding cites only
  `service-request/page.tsx`, so the single-wizard twin is registered
  here explicitly (not silently fixed): identical validator, identical
  bug, same task, same tests. Justification: leaving a known-identical
  whitespace hole in the twin flow while fixing the cited one would
  ship a half-fix; splitting it into its own finding/task adds process
  without safety (the change is 4 symmetric lines + shared tests).
- **Impact:** citizens submit, wait, then get a server error for
  whitespace-only fields.
- **Why now:** `.trim()` checks mirroring backend `_blank()`
  (`service_request_liff.py:6-8`). `request-v2` has NO client
  validator at all (verified — backend 422 via `setError` is its only
  guard): out of scope, recorded as follow-up F3.

### R3-M29 — phone maxLength=10 contradicts the 12-char dashed placeholder (3 wizards)
- **Root cause:** all three wizards show `placeholder="0xx-xxx-xxxx"` +
  `maxLength={10}` — the suggested format cannot be typed
  (`service-request/page.tsx:644-645`, `request-v2/page.tsx:380-381`,
  `service-request-single/page.tsx:450-451`, field `phone` there).
- **Impact:** citizens can't type the format the UI suggests.
- **Why now:** strip non-digits in each wizard's `handleChange` (backend
  gets clean digits; `length >= 9` validation keeps working) + change
  the placeholder to the digits example `08xxxxxxxx`. No submit-path
  changes (per `liff_development` skill: validation/input-shape only).

### R3-M30 — login field errors tint only; message never rendered, no aria-invalid
- **Root cause:** `errors.username/password` only switch tint classes
  (`login/page.tsx:291-387`); zero text render, zero aria attributes.
  Error strings exist (`validateForm` L151-164: 'กรุณากรอกชื่อผู้ใช้' /
  'กรุณากรอกรหัสผ่าน').
- **Impact:** screen-reader users get no error information; sighted
  users get color-only feedback.
- **Why now:** render message text + `aria-invalid` + describedby wiring
  + `role="alert"` per the `frontend-a11y` skill (same file also gains
  `aria-hidden` on the two required-field asterisks — the skill's
  required pattern, same elements). `Input` spreads extra props
  (`Input.tsx:97`), so aria attrs pass through.

### R3-L1 — broadcast strands in SENDING on client-disconnect (narrowed)
- **Root cause:** `except Exception` (`broadcast_service.py:243-246`)
  doesn't catch `asyncio.CancelledError` (BaseException), so a client
  disconnect (or any cancellation) between the SENDING commit (L187)
  and the final commit (L248) strands the row in SENDING.
- **Deviation from suggestion (verified):** the finding's "background-task
  send with SENDING reclaim" is architecture work it defers beyond
  Batch B. The in-scope fix closes the only in-process strand path:
  catch `CancelledError` → mark FAILED → best-effort commit →
  re-raise. Process-death strand remains (needs startup reclaim —
  recorded as follow-up F4); recovery via cancel + recreate already
  exists (`cancel_broadcast` accepts SENDING).
- **Why now:** 8 lines + test; removes the strand without architecture.

### R3-L2 — optimistic tempId from Date.now alone
- **Root cause:** `temp-${Date.now()}` (`useMessageFlow.ts:164`) can
  theoretically collide; the `s.sending` guard makes it near-impossible
  (verified L162).
- **Impact:** a collision would confuse optimistic reconciliation.
- **Why now:** append a random suffix (1 line) + test pinning uniqueness
  under a frozen clock.

## NOT in scope (this batch)

- Postback-event phase-split (M3 covers message events only).
- `request-v2` client-side validation (no validator exists; F3).
- Broadcast startup reclaim after process death (F4).
- Recency-window half of M19 (behavior-changing; only the
  behavior-preserving `DISTINCT ON` rewrite ships).
- Migrating `liff.py` / `admin_integrations.py` timeouts to the shared
  constants (already safe; don't touch working code).
- FK `ondelete` policy, response-shape changes, backfills, new routes,
  data migrations (same standing exclusions as Batch A).

## Observed follow-ups (found during verification, NOT findings)

- **F1:** `line_service.save_message` defaults `commit=True`, so
  `MessagingMixin.send_message` (M18 area) commits internally mid-flow.
  Same split-atomicity class as M1 — needs its own finding + plan, not
  a silent fix.
- **F2:** `get_live_kpis` keeps its `db` param for caller compatibility
  but M20 runs queries on fresh sessions (documented in plan).
- **F3:** `request-v2` has zero client-side validation (M28 area).
- **F4:** broadcast SENDING reclaim after process death (L1 remainder).

## Acceptance (product-level)

- [ ] All 20 Mediums + 2 Lows fixed at root cause per this PRD (incl.
  the M21-deletion and L1-narrowing deviations documented above).
- [ ] D1 + D2 decisions implemented as locked.
- [ ] No Batch-A behavior regressed; full backend + frontend suites
  green; CI green.
- [ ] No unresolved Critical/High (G3 — none in this batch).
