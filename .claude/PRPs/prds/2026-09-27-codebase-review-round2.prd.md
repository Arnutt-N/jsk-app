# PRD: Codebase Review Round 2 Fixes (2026-09-27)

- **Source spec (binding):** `.claude/PRPs/findings/2026-09-27-full-codebase-findings.md`
  (2 High + 7 Medium, all backend, all evidence-verified by reviewer + re-verified
  by plan author against current sources)
- **Branch:** `fix/codebase-review-round2-20260927`
- **Scope:** backend + ONE minimal frontend change (error toast for the new PDF
  413 in `CustomerPanel.tsx` — verified the current UI swallows export errors,
  so surfacing is part of T4, not scope creep). All other surfaces need no
  frontend change (verified per-surface — see plan UX section).
- **Prior batch:** PR #236 fixed F1–F7; this round fixes the remaining 9 findings.

## Problems (one per accepted finding)

### H-1 / H-2 — claim/close return raw ChatSession ORM
- **Root cause:** `claim_conversation` / `close_conversation`
  (`backend/app/api/v1/endpoints/admin_live_chat.py:219-265`) have no
  `response_model` and `return session` (SQLAlchemy object). FastAPI serializes
  whatever ORM attributes happen to be loaded — unbounded shape, lazy-load
  hazards, and a PII-leak footgun (violates "Never return ORM models").
- **Impact:** API contract is accidental; any new column (incl. encrypted PII
  fields) is silently exposed; detached-instance errors possible.
- **Why now:** High severity, same file already shows the correct pattern
  (`transfer_conversation` returns an explicit dict, L312-319). A dict return
  is the smallest consistent fix on closest-sibling-convention grounds (a
  `ChatSessionResponse` schema does exist at
  `backend/app/schemas/chat_session.py:20`, but adopting `response_model`
  would still require shaping decisions the sibling already settled).

### M-1 / M-2 — rich-menu list endpoints unbounded
- **Root cause:** `list_rich_menus` / `list_rich_menu_aliases`
  (`backend/app/api/v1/endpoints/rich_menus.py:98-130`) run full-table
  `select().all()` with no pagination params.
- **Impact:** memory grows with table size on every admin page load; inconsistent
  with every sibling list endpoint (`skip`/`limit`, `le=100`).
- **Accepted UI impact:** default `limit=100` truncates collections past 100
  for four unpaginated frontend fetches — all render arrays safely (verified,
  see plan UX section); same tradeoff as every sibling list UI.
- **Why now:** trivial, mechanical consistency fix with bounded, disclosed risk.

### M-3 — phone bind loads + mutates unbounded ORM rows
- **Root cause:** `handle_bind_phone`
  (`backend/app/services/message_intake/commands.py:87-108`) loads ALL
  `ServiceRequest` rows for a phone number as ORM objects and mutates them in a
  Python loop. A shared/reused number fans out unboundedly.
- **Impact:** webhook handler memory/CPU spike; slow LINE replies; timeout risk.
- **Why now:** user-facing webhook path; no test coverage today (verified: zero
  matches for bind coverage in `backend/tests/`).

### M-4 — CSV export loads the conversation twice
- **Root cause:** `export_conversation_csv`
  (`backend/app/api/v1/endpoints/admin_export.py:106`) calls `_load_conversation`
  (full unbounded `.all()`) just for the filename + empty-check, then
  `_iter_csv_rows` re-streams the same conversation in `_EXPORT_CHUNK` pages.
- **Impact:** every CSV export buffers all messages in memory pointlessly; the
  PDF path buffers by construction with no size guard at all.
- **Accepted UI impact:** new 413 past 20k messages on the PDF path only —
  the sole PDF UI (`CustomerPanel.tsx`) currently swallows export errors
  (console-only log), so this plan ADDS the missing error toast there (T4
  subtask). CSV behavior unchanged.
- **Why now:** export endpoints are admin-triggered on arbitrarily long histories.

### M-5 — cleanup decrypt N+1
- **Root cause:** `_close_inactive_session` calls `decrypt_line_id_for_user`
  (one `select(User)` each) per inactive session
  (`backend/app/tasks/session_cleanup.py:108`,
  `backend/app/services/user_identity_service.py:150`).
- **Impact:** one extra SELECT per session per cleanup tick; linear DB spam.
- **Why now:** a batch helper already exists
  (`decrypt_line_ids_for_users`, same file L157) — but it is fail-loud while
  the cleanup path is fail-soft (try/except → `raw=None` → skip push, still
  close + broadcast). The fix must preserve fail-soft semantics.

### M-6 — cleanup commits after external I/O + uncapped scans
- **Root cause:** `_process_inactive_sessions`
  (`backend/app/tasks/session_cleanup.py:45-77`) holds one open transaction
  across `line_service.push_messages` + `ws_manager.broadcast_to_all` per
  session, committing once at the end; the two `.all()` scans are uncapped.
- **Impact:** long-held DB transaction under slow/failing external I/O;
  unbounded tick workload; lock contention.
- **Why now:** inverts the codebase's own commit-then-announce rule (cf.
  `test_booking_reminder.py:193` "the claim is committed before the push").

### M-7 — transfer_session splits the caller's transaction
- **Root cause:** `transfer_session`
  (`backend/app/services/live_chat_service/sessions.py:302`) commits internally,
  but BOTH callers (HTTP `transfer_conversation`, WS `handle_transfer_session`)
  then call `publish_session_event`, whose documented job is "commit the pending
  session mutation, then announce it" (`choreography.py:91-102`). The mutation
  is durable before the caller's commit, breaking the single-unit-of-work
  choreography (and the announce-vs-durable ordering it promises).
- **Impact:** split atomicity on the transfer path; sibling methods
  `claim_session`/`close_session` do NOT commit internally (verified: no other
  `db.commit` in `sessions.py`), so transfer is the odd one out.
- **Correction (plan review):** the original draft claimed the `audit_action`
  row lands in the second commit — WRONG. Firsthand verification shows the
  decorator never fires for `transfer_session` at all (param-name mismatch;
  see M-8). The fix is unchanged.
- **Why now:** High-value correctness fix; blast radius is exactly 2 call sites
  (verified by search) + direct-call tests that must be adapted consciously.

### M-8 — transfer audit never fires (DEFERRED with reason)
- **Root cause:** `@audit_action("transfer_session", ...)` decorates a
  function whose signature has no `operator_id`/`admin_id`/`closed_by`
  parameter, so the decorator resolves `operator_id=None` and skips every
  transfer audit row (verified `audit.py:31-52,58,89`,
  `sessions.py:248-256`, both call sites).
- **Impact:** audit-trail gap for operator transfers (observability only —
  transfers succeed; state reconstructible from `operator_id`/`transfer_count`).
- **Disposition: DEFERRED.** The fix touches the shared audit decorator (all
  audited actions) and starts emitting new audit rows (volume/behavior
  change) — a deliberate design/product decision, not review-fix-batch
  material. Medium severity → G3 unaffected. Full evidence in findings M-8.
