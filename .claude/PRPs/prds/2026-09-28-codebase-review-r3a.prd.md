# PRD: Codebase Review Round 3, Batch A (2026-09-28)

- **Source spec (binding):** `.claude/PRPs/findings/2026-09-28-codebase-review-r3-findings.md`
  (0 Critical, 8 High, 30 Medium, 2 Low — all firsthand-verified by merge author)
- **Branch:** `fix/codebase-review-r3a-20260928` (from `main` @ `9706fa7`)
- **Scope:** Batch A = all 8 Highs (G3 gate) + 10 quick Mediums with exact
  mirrors. Batch B (20 Mediums + 2 Lows) deferred with per-item reasons in
  the findings file — scheduled, not dropped.
- **Prior batches:** PR #236 (F1–F7), PR #238 (H-1/H-2, M-1..M-7), PR #239
  open (M-8 transfer audit — untouched by this batch, no shared files).

## Problems (one per accepted finding)

### R3-H1 — booking confirmations always fail (raw dicts to push_messages)
- **Root cause:** `_push_flex` (`booking_notifications.py:39-42`) passes raw
  dicts to `push_messages`, which documents SDK objects and feeds them
  straight into `PushMessageRequest`. Sibling `reply_flex` converts
  dict→`FlexMessage` first — the skipped step.
- **Impact:** citizens never receive booking confirmations/reminders via this
  path (exception caught → ERROR log → `False`).
- **Why now:** High severity, user-facing, fix is a 3-line mirror of `reply_flex`.

### R3-H2 — requests table pagination dead; rows past 100 unreachable
- **Root cause:** query builder sends no `skip`/`limit` (`requests/page.tsx:116-128`)
  while backend defaults `limit=100`; footer buttons hard-`disabled` (L464-469).
- **Impact:** admins cannot reach rows beyond the first 100.
- **Why now:** High severity; backend already paginates (no backend change needed).

### R3-H3 — dashboard renders zeros instead of errors on fulfilled-not-ok
- **Root cause:** `getRequestData` (`admin/page.tsx:57-65`) only errors on
  `rejected`/parse-failure; fulfilled `!ok` falls through, `error` stays null.
- **Impact:** 401/403/500 shows a plausible all-zero dashboard — silent mislead.
- **Why now:** High severity; fix is one `!ok` branch + status-aware message.

### R3-H4 — file download breaks on Firefox (detached anchor + instant revoke)
- **Root cause:** anchor clicked without DOM attach + `revokeObjectURL` in the
  same tick (`files/page.tsx:228-233`).
- **Impact:** downloads fail on Firefox; large files at risk everywhere.
- **Why now:** High severity; standard fix pattern (append→click→remove→deferred revoke).

### R3-H5 — LIFF upload retry with the same file is dead (input never reset)
- **Root cause:** `handleFileUpload` (`liff/service-request/page.tsx:230-263`)
  never clears `e.target.value` — same-file reselect fires no `change`.
- **Impact:** citizen retry flow silently broken after any upload failure.
- **Why now:** High severity, citizen-facing; 1-line fix in `finally`.

### R3-H6 — supervisor E2E suite skips all 7 tests (DB never seeded)
- **Root cause:** every test gates on `test.skip(!detailUrl)` while `e2e.yml`
  seeds only the admin user — no requests ever exist.
- **Impact:** the revert/supervisor flows are CI-green with zero assertions.
- **Why now:** High severity test-integrity hole; fix by seeding PENDING +
  COMPLETED requests in the E2E job.

### R3-H7 — revert E2E test asserts nothing real (fake fulfill, no reload check)
- **Root cause:** PATCH fulfilled with fabricated `{ok:true}`; only the echoed
  payload asserted; the promised navigation-wait is missing (`…spec.ts:226-270`).
- **Impact:** revert flow covered in name only; regressions slip through.
- **Why now:** High severity; fix asserts the reload/UI the comment promises.

### R3-H8 — real TelegramService paths never execute in tests
- **Root cause:** all tests substitute `AsyncMock(return_value=True)` for
  `send_alert_message`/`send_handoff_notification`; credential-load,
  non-200, and exception branches never run.
- **Impact:** staff alerting path is test-blind; silent-False regressions invisible.
- **Why now:** High severity; pure test addition, zero production-code risk.

### R3-M2 — LIFF upload trusts spoofable Content-Type (no magic sniff)
- **Root cause:** `liff.py:103-109` stores `file.content_type` as-is; admin
  path sniffs magic bytes for the same table/public serving (`media.py:54-82`).
- **Impact:** citizen-authenticated stored-XSS vector via polyglot upload.
- **Why now:** exact mirror exists (`_sniff_mime`); small, testable.

### R3-M4 — priority free string → Enum column; assignee ids unverified (500s)
- **Root cause:** `RequestUpdate.priority: Optional[str]` applied raw onto
  `Enum(RequestPriority)`; assignee ids applied with no `User` existence check.
- **Impact:** invalid input 500s instead of 422/404.
- **Why now:** mechanical validation fix with clear error mapping.

### R3-M6 — hard user delete 500s on referenced history (no IntegrityError path)
- **Root cause:** `db.delete` + commit with no FK-failure handling; ~20 child
  FKs lack `ondelete`.
- **Impact:** hard delete of any real user 500s with an opaque error.
- **Why now:** catch → 409 with guidance; no data-model change (deliberately).

### R3-M9 — CSV export formula injection (raw content cells)
- **Root cause:** `_iter_csv_rows` writes `m.content` raw; `csv.writer` quotes
  but never defuses `=+-@` leading cells.
- **Impact:** malicious citizen message executes as formula when admin opens CSV.
- **Why now:** 1-helper fix + unit test; classic, known-bad.

### R3-M10 — LIFF create schema has zero length caps; attachments unvalidated
- **Root cause:** all 16 fields bare `Optional[str]`; `attachments: Optional[list]`.
- **Impact:** unbounded citizen input into DB columns; junk attachment shapes.
- **Why now:** round-1 F5/F6 capped the admin twin — this LIFF twin was missed;
  direct mirror.

### R3-M11 — password fields lack max_length; >72 bytes crashes raw bcrypt
- **Root cause:** raw `bcrypt.hashpw` (no try/except) + `min_length=8`-only
  fields on create/update/reset; `LoginRequest` fully uncapped.
- **Impact:** 500 on long passwords instead of 422.
- **Why now:** `max_length=72` on 4 fields + tests; mechanical.

### R3-M13 — security headers absent (no headers() hook, no middleware)
- **Root cause:** `next.config.js` defines no `headers()`; no `middleware.ts`
  exists anywhere under `frontend/`.
- **Impact:** missing CSP/HSTS/frame-ancestors/Referrer-Policy/nosniff.
- **Why now:** config-only change; report-only CSP first to avoid breakage.

### R3-M14 — same-priority intent winner nondeterministic (limit(1), no ORDER BY)
- **Root cause:** three `.limit(1)` branches over an unordered shared stmt builder.
- **Impact:** which rule answers can flip between identical messages.
- **Why now:** deterministic tiebreak + test; small, webhook-relevant.

### R3-M26 — get_db duplicated with a wrong annotation
- **Root cause:** identical generators in `db/session.py:20` (`-> AsyncSession`,
  wrong) and `api/deps.py:25` (`-> AsyncGenerator`); endpoints import both.
- **Impact:** maintainability + typing lie; behavior identical today.
- **Why now:** zero-behavior cleanup; grep-verify no caller breaks.

### R3-M27 — CD pipes unpinned koyeb master install.sh to sh
- **Root cause:** `cd.yml:300` curl-pipes a moving target (known transient-404
  flake source from round-1 log).
- **Impact:** supply-chain risk + flaky deploys.
- **Why now:** pin release + retry; workflow-only, no app risk.
