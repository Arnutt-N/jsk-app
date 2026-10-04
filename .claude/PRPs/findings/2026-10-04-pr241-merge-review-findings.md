# PR #241 Merge-Readiness Review — Findings (2026-10-04)

- **Scope:** branch `fix/codebase-review-r3b-20261003` vs `main` (66 files,
  +5405/−362; PRD+plan docs excluded from code review, used as spec).
- **Method:** 4 parallel read-only reviewers (backend, frontend, security,
  spec-conformance) with structured-findings contract; every finding below
  re-verified firsthand by the merge author against branch sources.
- **Raw counts:** 27 (C0/H1/M13/L13). **Post-dedup: 24** (C0/H1/M12/L11).
- **Post-verification: 0 Critical, 0 High, 8 Medium accepted + 9 Low accepted,
  4 deferred, 1 downgraded (H→M, still fixed).**
- **Spec conformance:** 22/22 R3b items implemented, root cause/fix match plan,
  no scope creep outside NOT-Building.
- **CI on PR #241:** all green (Backend Pytest, Frontend Lint+Build,
  Playwright Smoke, Encoding, Vercel).

## Stack (detected once, reused for validation)

| Layer | Stack | Validation commands |
|-------|-------|---------------------|
| Backend | FastAPI + Python 3.13 + SQLAlchemy 2 async + Pydantic V2, pytest | `cd backend && python -m pytest <scoped files>` (full suite: CI is the gate — local Windows run hangs on teardown, known issue) |
| Frontend | Next.js 16 + React 19 + TS + Tailwind v4, Vitest + Playwright | `cd frontend && npx vitest run <scoped>`, `npx tsc --noEmit`, `npm run lint` |
| Infra | PostgreSQL 16 + Redis 7, LINE SDK | — |

## Accepted findings (fix on this branch before merge)

### F1 — MEDIUM — KPI cache flips Decimal averages to strings on round-trip
- **Locations:** `backend/app/services/analytics_service.py:143-144`
  (+ test gap `backend/tests/test_live_kpis_cache.py:37`)
- **Reporters:** backend ×2 (merged: same root cause).
- **Evidence:** `"avg_first_response_seconds": round(avg_frt, 1),` where
  `avg_frt` comes from `func.avg` (Numeric → Decimal). Fresh responses pass
  through FastAPI's encoder (Decimal→number) but the Redis copy is written
  with `json.dumps(payload, default=str)`, so `cache_hit=true` responses
  serve `"12.3"` (string) where fresh serves `12.3` (number).
- **Verification note (downgraded H→M):** the reported `round(None)` crash
  does NOT exist — `_kpi_avg_frt`/`_kpi_avg_resolution` return
  `result.scalar() or 0`. Remaining defect is the type flip only.
- **Fix:** coerce `float(...)` at payload build (mirror `get_dashboard`);
  test: Decimal canned scalars + assert JSON round-trip preserves numbers.

### F2 — MEDIUM — 10-way KPI gather can hog the whole DB pool
- **Location:** `backend/app/services/analytics_service.py:125-138`
- **Reporters:** backend.
- **Evidence:** 10 concurrent `_use()` sessions via `asyncio.gather` against
  engine `pool_size=5, max_overflow=3` (`backend/app/db/session.py:14-15`) —
  one dashboard refresh can hold all 8 connections, starving the webhook path
  sharing the engine.
- **Fix:** module-level `asyncio.Semaphore` (4) around `_use`.

### F3 — MEDIUM — double-cancel can interrupt the FAILED-mark commit
- **Location:** `backend/app/services/broadcast_service.py:249`
- **Reporters:** backend.
- **Evidence:** `await db.commit()` runs inside `except CancelledError`; a
  second cancel (e.g. worker shutdown during deploy) raises inside the
  handler, which `except Exception` cannot catch — the row strands in
  SENDING, re-opening R3-L1.
- **Fix:** `await asyncio.shield(db.commit())`; inner `except Exception`
  stays for real commit failures.

### F4 — MEDIUM — Telegram fire-and-forget task shares the webhook DB session
- **Location:** `backend/app/services/live_chat_service/handoff.py:142-160`
- **Reporters:** backend.
- **Evidence:** spawned `_send_telegram` calls
  `send_handoff_notification(..., db)` → `load_credentials(db)`
  (`telegram_service.py:49`), querying on the shared session concurrently
  with the webhook loop (AsyncSession is not concurrency-safe). The
  "never concurrent" comment (L155-156) covers only the serial read, not the
  spawned task. ORM `recent_msgs` may also be touched after session close.
- **Fix:** open a fresh `AsyncSessionLocal()` inside `_send_telegram` for
  credentials; pre-touch message contents at drain time (serial, open
  session) and pass plain data.

### F5 — MEDIUM — raw LINE ID in user-creation race error reaches logs
- **Location:** `backend/app/services/friend_service.py:61`
- **Reporters:** backend + security (merged).
- **Evidence:** `f"Race condition: user creation for {line_user_id} ..."`
  inside RuntimeError, propagated to logs via webhook `exc_info` logging.
  Same function already masks at L38 (`mask_line_id`) — pattern exists
  in-file.
- **Fix:** `mask_line_id(line_user_id)` (logging_utils) in the message.

### F6 — MEDIUM — non-race IntegrityError misread as create-race, original masked
- **Location:** `backend/app/services/friend_service.py:55-63`
- **Reporters:** backend.
- **Evidence:** bare `except IntegrityError:` re-resolves on ANY integrity
  failure (NOT NULL bug, FK violation, …); when re-resolve finds nothing it
  raises RuntimeError, destroying the original constraint diagnostics.
- **Fix:** keep the re-resolve attempt (backend-agnostic, no pgcode
  sniffing) but bare-`raise` the ORIGINAL IntegrityError when no winner is
  found, instead of RuntimeError.

### F7 — MEDIUM — LIFF phone validation has no upper bound (11–12 digits stored)
- **Locations:** `frontend/app/liff/service-request/page.tsx:285`,
  `frontend/app/liff/service-request-single/page.tsx:246`
  (+ test gap `.../service-request/__tests__/validation.test.tsx:136`)
- **Reporters:** frontend ×3 (merged: same root cause).
- **Evidence:** `else if (formData.phone_number.length < 9)` with
  `maxLength={12}` on the input; backend schema
  (`service_request_liff.py:22`) caps only at 20 chars with no digit check,
  so over-long numbers persist.
- **Fix:** reject `< 9 || > 10` on both pages (+ request-v2 gets the same
  constant if/when D4 lands); add over-long rejection tests.

### F8 — MEDIUM — login a11y test never submits, never asserts login called
- **Location:** `frontend/app/login/__tests__/login-error-a11y.test.tsx:51`
- **Reporters:** spec-conformance.
- **Evidence:** test fills both fields and asserts errors clear, but never
  re-submits; `login: vi.fn()` mock (L12) exposes no assertable handle,
  while plan T21 requires "fill both + submit → login called, no alerts".
- **Fix:** hoist the mock fn, submit with valid fields, assert called once
  with no alerts.

### F9 — LOW — handoff-failure path queues a reply then falls through to a second
- **Location:** `backend/app/services/handoff_service.py:140-147`
- **Reporters:** backend.
- **Evidence:** `except` queues the apology into the shared box but returns
  `False`, so `message_handler.py:143-151` falls through to intent matching
  which can append a SECOND `reply_text` on the same single-use token
  (second reply fails, error-log noise). Effective user-visible behavior
  today ≈ apology only, since the second reply dies on token reuse.
- **Fix:** return `True` after queueing (same user-visible behavior, no
  token-reuse error); only caller with shared outbox is message_handler;
  update `test_handoff_service.py` if it pins `False`.

### F10 — LOW — corrupt KPI cache value crashes instead of fail-open miss
- **Location:** `backend/app/services/analytics_service.py:111-114`
- **Reporters:** backend.
- **Evidence:** `data = json.loads(cached)` unwrapped — a corrupt value
  raises (500) despite the documented fail-open design.
- **Fix:** try/except `json.JSONDecodeError` → log + best-effort delete +
  fall through to recompute.

### F11 — LOW — new `role` params untyped
- **Locations:** `backend/app/api/v1/endpoints/admin_export.py:90,106`
  (+ `role=None` default in `_build_conversation_pdf`)
- **Reporters:** backend.
- **Evidence:** `def _display_name(user, line_user_id, role) -> str` —
  violates repo strict-typing rule; callee
  `pii_masking.mask_line_id(v, role: UserRole | str)` defines the type.
- **Fix:** annotate `role: UserRole | str` (`| None` where defaulted);
  import UserRole. (Safe default verified: `None` → masked.)

### F12 — LOW — digit-strip silently corrupts pasted +66 numbers into valid-looking wrong numbers
- **Location:** `frontend/app/liff/service-request/page.tsx:139`
  (same pattern on all 3 LIFF forms)
- **Reporters:** frontend.
- **Evidence:** `value.replace(/\D/g, '')` turns `+6681234567` into
  `6681234567` — 10 digits, PASSES validation, but is the wrong number.
- **Fix:** normalize `^\+66` → `0` before stripping, on all 3 forms + tests.

### F13 — LOW — auth interceptor matches API URLs by substring
- **Location:** `frontend/lib/authFetch.ts:74` (same shape L79 pre-existing)
- **Reporters:** frontend + security (merged).
- **Evidence:** `getRequestUrl(input).includes('/api/v1/')` — any non-API URL
  merely containing that substring gets cookies/CSRF/refresh treatment.
- **Fix:** match parsed pathname prefix (`startsWith('/api/v1/')`),
  absolute-or-relative safe, WITHOUT same-origin gating (prod API is
  cross-origin by design: Vercel → Koyeb).

### F14 — LOW — redundant isApiRequest in needsCsrf
- **Location:** `frontend/lib/authFetch.ts:117`
- **Reporters:** frontend.
- **Evidence:** early return at L112 guarantees `isApiRequest(input)` is
  true here.
- **Fix:** drop the redundant check.

### F15 — LOW — AutoReply CONTAINS branch misses LIKE-wildcard escaping
- **Location:** `backend/app/services/message_intake/intent_matching.py:132`
- **Reporters:** security.
- **Evidence:** `_contains = literal(text).ilike(func.concat('%',
  AutoReply.keyword, '%'))` — in branch diff (R3-M22 rewrite) but skips the
  `_like_safe()` + `escape="\\"` the IntentKeyword paths use (L81/L87). A
  keyword containing `%`/`_` acts as a wildcard.
- **Fix:** wrap with `_like_safe()` + `escape="\\"` (zero behavior change
  for normal keywords).

### F16 — LOW — WS disconnect wipes the Redis rate-limit window (reconnect = fresh flood budget)
- **Location:** `backend/app/core/websocket_manager.py:172`
  → `rate_limiter.py:145-147`
- **Reporters:** security.
- **Evidence:** last-disconnect calls `reset_async` = Redis DEL +
  in-process clear. Pre-existing call, but R3-M24's Redis backing gives it
  new cross-worker meaning: spam → disconnect → reconnect restores full
  budget. (WS requires auth, so blast radius = authenticated operators.)
- **Fix:** disconnect clears the in-process bucket only (`reset`), keeping
  the Redis fixed window authoritative.

### F17 — LOW — login a11y test describe mistagged (R3-L2 → R3-M30)
- **Location:** `frontend/app/login/__tests__/login-error-a11y.test.tsx:25`
- **Reporters:** spec-conformance.
- **Evidence:** `describe('Login form error ARIA wiring (R3-L2)'` — R3-L2 is
  the tempId finding; login-a11y is R3-M30.
- **Fix:** retag (one word, with F8).

## Deferred (documented reasons, follow-up PRs — not merge blockers)

- **D1 (Medium, ex-security):** `conversations.py:337` serves raw
  `decrypt_user_line_id` in staff conversation detail. PRE-EXISTING (not in
  branch diff — hunks are L109/128/156/292). Needs product decision (do
  agents need the raw ID for LINE contact?) + frontend impact review.
- **D2 (Medium, ex-backend):** outbox not threaded through
  `postback_handler.py:18`. PRE-EXISTING file (not in diff); CSAT flow
  risk; `show_loading_animation` is ephemeral by design, not a persisted
  ghost. Follow-up PR with its own plan.
- **D3 (Low, ex-backend+security):** 50MB media cap checked after full
  download (RAM, not just disk). LINE SDK returns the whole body — no cheap
  Content-Length pre-check; would need raw-httpx streaming rewrite.
  Branch strictly improves on pre-existing behavior (disk cap + skip path).
- **D4 (Medium, ex-frontend):** `request-v2/page.tsx:227` submits with no
  JS validation gate (HTML `required` only; whitespace-only passes). NEW
  scope beyond the R3b plan (spec review confirms 22/22 without it);
  backend `ServiceRequestCreate` model_validator guards data integrity.
  Follow-up with UX design (error UI + tests).

## Rejected

- **None fully rejected.** 1 severity correction: backend "High"
  (`round(None)` crash) disproven — `result.scalar() or 0` guards (L51/L65);
  kept as F1 (Medium) for the real Decimal→string cache flip. 3 merges on
  identical root cause (F5, F7, F13).

## Gate note (why no separate prp-validate-plan run)

This review is the Step-10 scoped fix loop over an already-planned branch
(R3b PRD+plan in-commit, spec review 22/22 READY-equivalent), not a new
feature plan: 17 small follow-ups, each validated individually
(type-check + lint + scoped tests), then a final re-review of the fix diff
only. A dual-adversarial gate on one-word fixes (F17) adds no signal.
Deviations, if any, are logged below.

## Deviations

- _(none yet)_
