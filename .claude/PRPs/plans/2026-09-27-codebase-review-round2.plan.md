# PRP: Codebase Review Round 2 Fixes (2026-09-27)

## Metadata
- **PRD:** `.claude/PRPs/prds/2026-09-27-codebase-review-round2.prd.md`
- **Findings (binding):** `.claude/PRPs/findings/2026-09-27-full-codebase-findings.md`
- **Branch:** `fix/codebase-review-round2-20260927` (from `main` @ `9edcc25`)
- **Coverage map (B7):** T1→H-1,H-2 · T2→M-1,M-2 · T3→M-3 · T4→M-4 · T5→M-5 ·
  T6→M-6 (after T5) · T7→M-7 · M-8→DEFERRED with documented reason (PRD +
  findings; skill-compliant for Medium — shared-decorator design decision,
  not batch material). Zero orphan findings.
- **Working directory for backend commands:** `backend/`
- **Revision:** 6 (2026-09-27 — T4 Detail-phantom fix: lowercase stub + pinned
  413 detail + VALIDATE assert; see review file rev6 note) + 6a (round-6 A6/B6 touch-ups, all repo-verified)

## Files to Change
1. `backend/app/api/v1/endpoints/admin_live_chat.py` (T1)
2. `backend/app/api/v1/endpoints/rich_menus.py` (T2)
3. `backend/app/services/message_intake/commands.py` (T3)
4. `backend/app/api/v1/endpoints/admin_export.py` (T4)
5. `backend/app/services/user_identity_service.py` (T5 — new helper)
6. `backend/app/tasks/session_cleanup.py` (T5, T6)
7. `backend/app/services/live_chat_service/sessions.py` (T7 — delete 1 line)
8. Tests: `backend/tests/test_session_claim.py` (T1),
   `backend/tests/test_rich_menu_list_user_count.py` + `test_rich_menu_alias_endpoints.py` (T2),
   NEW `backend/tests/test_phone_bind_bounds.py` (T3),
   `backend/tests/test_admin_analytics_export_endpoints.py` + `test_histories_export.py` (T4),
   `backend/tests/test_session_cleanup.py` (T5, T6),
   `backend/tests/test_live_chat_service.py` + `test_transfer_race.py` +
   `test_transfer_session_errors.py` (T7)
9. Frontend (T4 subtask only):
   `frontend/app/admin/live-chat/_components/CustomerPanel.tsx` (toast on
   export failure) + NEW `__tests__/CustomerPanel.export.test.tsx`
- **UX (per-surface before/after — NOT blanket N/A):**
  - claim/close body reshape (T1): BEFORE full ORM JSON / AFTER small dict.
    Consumers (`frontend/app/admin/live-chat/_hooks/useChatRoom.ts:151-187`) check `res.ok` only + refresh —
    verified, no UI impact. No frontend change.
  - Rich-menu/alias lists capped at 100 (T2): BEFORE full arrays / AFTER
    first-100 arrays. Four consumers render via `.map` with `!res.ok` guards
    (verified `rich-menus/page.tsx:50-57`, `aliases/page.tsx:61-62`,
    `new/page.tsx:280`, `[id]/edit/page.tsx:120`) — short arrays render
    fine, just incomplete past 100 rows. No frontend change.
  - PDF export 413 past 20k messages (T4): BEFORE slow success / OOM risk /
    AFTER fast 413 + error toast with the server detail. The toast is ADDED
    by this task (verified the current `CustomerPanel.tsx:38-55` only
    `logger.error`s and swallows the detail; the chat-histories page has CSV
    only, so live-chat is the sole PDF surface). Minimal frontend change
    (this task's subtask).
  - Phone bind cap (T3): BEFORE all bindable rows bound / AFTER newest 50
    bound; user-visible reply texts IDENTICAL (limit only logged
    server-side). No frontend change (LINE chat replies, not web UI).
  - CSV export, cleanup, transfer: no client-visible change.

## NOT Building (frontend: ONLY the T4 CustomerPanel toast + its test — no other
frontend change; every other surface needs none per the UX section above)
- New Pydantic response schemas for claim/close (dict return chosen on
  closest-sibling convention — matches `transfer_conversation`. Note: a
  `ChatSessionResponse` schema DOES exist at
  `backend/app/schemas/chat_session.py:20`; it is deliberately not adopted
  here to keep the fix minimal and sibling-consistent).
- Any frontend change beyond the T4 CustomerPanel toast + its test (the ONLY
  frontend work in this plan — see Files #9 and T4).
- Changing `_EXPORT_CHUNK`, LINE push text, WS payload shapes, or audit schema.
- Touching the internal commits in `handoff.py` / `messaging.py` /
  `preferences.py` (different flows, out of scope — findings don't cover them).
- Cursor/keyset pagination (offset `skip`/`limit` matches sibling convention).
- A shared paginator helper (2 call sites don't justify the abstraction).

## Step-by-Step Tasks

### T1 — claim/close return explicit dicts (H-1, H-2)
- **ACTION:** Replace `return session` in `claim_conversation` (L242) and
  `close_conversation` (L265) with explicit dicts. Keep `-> Any` and no
  `response_model` (file convention — `transfer_conversation` does the same).
- **IMPLEMENT:**
  - claim → `{"success": True, "line_user_id": line_user_id,
    "session_id": session.id, "status": session_status_value(session),
    "operator_id": current_user.id}` (keys mirror the SESSION_CLAIMED payload
    already built at L234-239; `session_status_value` is already imported/used
    in this file).
  - close → `{"success": True, "line_user_id": line_user_id,
    "session_id": session.id}` (mirrors the SESSION_CLOSED payload at L259-262).
- **MIRROR:** `transfer_conversation` return dict, same file L312-319
  (`success`/`line_user_id`/`session_id` + operation-specific ids).
- **VALIDATE:** `python -m pytest tests/test_session_claim.py -v`.
- **RISK (explicit):** `test_session_claim.py:473` and `:518` assert
  `response.json()["id"] == 42` — they WILL fail under the new id-less dict
  and must be REPLACED (not extended) with exact-dict-equality assertions
  (no ORM attrs). This is the T7-style exception: these assertions encode the
  buggy contract. Follow the existing mock style at L443-520 — read first.
  Frontend safety already proven (only `res.ok` consumed).

### T2 — paginate rich-menu lists (M-1, M-2)
- **ACTION:** Add `skip`/`limit` params + `.offset().limit()` to
  `list_rich_menus` (L98-101) and `list_rich_menu_aliases` (L124-130).
- **IMPLEMENT:** params `skip: int = Query(0, ge=0), limit: int = Query(100,
  ge=1, le=100)` on both signatures. NO import change: `Query` is already
  imported at `rich_menus.py:1` — reuse it.
  - Menu query (L100) becomes exactly:
    `select(RichMenu).order_by(RichMenu.created_at.desc()).offset(skip).limit(limit)`.
  - Alias query (L129) becomes exactly:
    `select(RichMenuAlias).order_by(RichMenuAlias.created_at.desc()).offset(skip).limit(limit)`.
  - Leave the link-count batch aggregate (L106-111) untouched BY DESIGN
    (single GROUP BY still scans the full table per page; enrichment only
    reads the page's ids) — do NOT "fix" it by scoping counts to the page.
- **REGRESSION RISK (explicit, B7 fourth element for M-1/M-2):** default
  `limit=100` silently truncates collections over 100 rows for the four
  unpaginated frontend fetches (`rich-menus/page.tsx:50`,
  `aliases/page.tsx:61-62`, `new/page.tsx:280`, `[id]/edit/page.tsx:120`).
  All four render the array via `.map` with `!res.ok` guards — short arrays
  are SAFE (no crash), just incomplete. Accepted tradeoff: identical to every
  sibling list endpoint/UI in this codebase, and realistic collections are
  far below 100. No frontend change.
- **MIRROR:** `admin_auto_replies.py:25-26` (identical signature), also
  `admin_friends.py:26-27`, `admin_intents.py:23-24`.
- **VALIDATE:** `python -m pytest tests/test_rich_menu_list_user_count.py
  tests/test_rich_menu_alias_endpoints.py -v` (extend: limit respected; default
  returns all when < 100; `limit=101` → 422; `skip` offsets. Read both files
  first for fixture style).

### T3 — bound phone bind by id-set + single UPDATE (M-3)
- **ACTION:** Replace the unbounded ORM load + Python mutate loop
  (`commands.py:87-108`) with a bounded id-set scan + single UPDATE.
- **IMPLEMENT:**
  - New module constants near the top of `commands.py`:
    `_PHONE_BIND_SCAN_LIMIT = 1000` (tuple-scan window — 20x the bind limit
    so counts stay exact in every realistic case),
    `_PHONE_BIND_LIMIT = 50` (max rows bound per command).
  - Add `update` to the sqlalchemy import at `commands.py:4` (today only
    `select` is imported): `from sqlalchemy import select, update`.
  - Replace L87-89 with exactly:
    `select(ServiceRequest.id, ServiceRequest.user_id, ServiceRequest.created_at)`
    `.where(ServiceRequest.phone_number == phone_number)`
    `.order_by(ServiceRequest.created_at.desc(), ServiceRequest.id.desc())`
    `.limit(_PHONE_BIND_SCAN_LIMIT + 1)` → `.all()` tuples (no ORM objects).
    (The `.id.desc()` tiebreak makes newest-50 selection deterministic when
    bulk inserts share a timestamp.)
    If 1001 rows arrive: `logger.warning` (pathological shared number,
    proceeding with newest 1000) and drop the 1001st. Zero rows → the
    existing L92 not-found reply copied VERBATIM from source (exactly correct — an empty window cannot be
    truncated).
  - Recompute the counts over the tuple window (REPLACES the L91-96
    computation; the names change: `requests` → `rows` (tuples),
    `bindable` → `bindable_ids` (int list) — every later use of the old
    names MUST be renamed, there is no aliasing):
    `already_bound_to_others = sum(1 for _, uid, _ in rows if uid is not
    None and uid != user_id)`; `bindable_ids = [rid for rid, uid, _ in rows
    if uid is None or uid == user_id][:_PHONE_BIND_LIMIT]` (rows are already
    newest-first); leftover bindable beyond 50 → `logger.warning` with count.
    - Rename the L98 guard to `if not bindable_ids:` and keep the L99-104
      reply + `return` body VERBATIM (the all-bound-to-others reply must
      survive the rename — this is the case the guard exists for).
    RISK NOTE: rows beyond 50 stay unbound with only a server-side log —
    the user-visible reply is silent about the partial bind (accepted: 50
    newest covers every realistic case; the log preserves operability).
  - Bind via ONE statement:
    `update(ServiceRequest).where(ServiceRequest.id.in_(bindable_ids))`
    `.values(user_id=user_id)` + `await db.flush()` (only when non-empty).
    Keep reply TEXTS + L110-114 log shape unchanged (same texts; the backing
    variables are the renamed tuple-derived ones above). Do NOT touch the L116-123 latest-5 query + L125-126 flex reply.
- **MIRROR:** conditional-UPDATE style used in `sessions.py:281-294`
  (set-based write, no ORM loop).
- **VALIDATE:** NEW `backend/tests/test_phone_bind_bounds.py` (no bind coverage
  exists today), 5 cases: (1) bind succeeds + sets user_id; (2) shared number
  binds newest 50 and logs leftover; (3) all-bound-to-others still replies
  correctly; (4) zero rows still replies not-found; (5) 1001-row scan warns
  and proceeds with 1000. Run `python -m pytest tests/test_phone_bind_bounds.py -v`.
  (Mock `db.execute` result chains + `line_svc` reply methods; follow the
  AsyncMock style of `test_live_chat_service.py`.)

### T4 — CSV preflight without full load + PDF size guard (M-4)
- **ACTION:** Give the CSV path a lightweight preflight; cap the PDF path.
- **IMPLEMENT:**
  - Add `func` to the sqlalchemy import at `admin_export.py:20` (today only
    `select` is imported): `from sqlalchemy import func, select`.
    (`child_filter` + `resolve_by_line_id` are already imported at L28 —
    reuse them, add nothing.)
  - New `_conversation_bounds(line_user_id, db) -> tuple[user|None,
    first|None, last|None]`: resolve user (existing `resolve_by_line_id`),
    first = `select(Message).where(child_filter(Message, line_user_id,
    user.id if user else None)).order_by(Message.created_at.asc(),
    Message.id.asc()).limit(1)` scalar, last = same with
    `.desc()`/`.desc()`. (Ordering matches `_load_conversation` exactly —
    verified L56-60 — so filename dates can't shift on non-monotonic
    histories.)
  - `export_conversation_csv` (L99-117): replace L106
    (`user, messages = await _load_conversation(...)`) with the literal line
    `user, first, last = await _conversation_bounds(line_user_id, db)`; empty
    (`first is None`) → same 404 + same detail string (`Conversation not found or has no messages`); filename via existing
    `_build_export_filename(display_name, [first, last], "csv")` (it only
    reads `[0]`/`[-1]` — verified L40-41); stream via `_iter_csv_rows`
    unchanged. Delete the now-unused `messages` variable (do NOT leave a
    dangling name).
  - PDF path (`export_conversation_pdf`, L120-147): after the reportlab probe
    (L127-130) and BEFORE the `_load_conversation` call (L132), insert:
    resolve user via `resolve_by_line_id`, then
    `count = await db.scalar(select(func.count()).select_from(Message).where(
    child_filter(Message, line_user_id, user.id if user else None)))` →
    `HTTPException(status_code=413, detail="Conversation too large")` when `count > _EXPORT_MAX_MESSAGES = 20000`
    (constant at module top next to `_EXPORT_CHUNK`; 413 = content-too-large
    per repo convention). The predicate MUST reuse `child_filter` or the gate
    counts the wrong population. NOTE: `_load_conversation` (L132) re-resolves
    the user — accept that one duplicate indexed lookup; do NOT refactor its
    signature. RISK NOTE: 413 is a NEW client-visible error for very large
    histories (previously: slow success / OOM risk).
- **MIRROR:** `_iter_csv_rows` chunk pattern (L70-96) for bounded reads;
  `db.scalar(select(func.count(...)).where(...))` at
  `live_chat_service/conversations.py:237-238` for the count precheck;
  `useToast` + `readErrorMessage` error-toast pattern at
  `frontend/app/admin/rich-menus/page.tsx:12,39,57`
  (`import { useToast } from '@/components/ui/Toast'`,
  `import { readErrorMessage } from '@/lib/api-error'`,
  `const { toast } = useToast()`,
  `toast({ title, description: msg, variant: 'error' })`).
- **FRONTEND SUBTASK (new 413 must surface — verified the current UI swallows
  it: `CustomerPanel.tsx:38-55` throws on `!res.ok` and the catch only
  `logger.error`s): in
  `frontend/app/admin/live-chat/_components/CustomerPanel.tsx`, add the two
  imports above, add `const { toast } = useToast();` next to the other hooks
  (before the early return at L26 — hooks must stay unconditional), and
  change `downloadExport` (L35-56) to: (1) in the `!response.ok` branch,
  `const msg = await readErrorMessage(response, \`Export failed:
  ${response.status}\`); throw new Error(msg);` (2) in the catch, keep
  `logger.error(error);` and add `toast({ title: 'Export ล้มเหลว',
  description: error instanceof Error ? error.message : 'เกิดข้อผิดพลาด
  กรุณาลองใหม่', variant: 'error' });`. Nothing else in the file changes.
- **MIRROR (test):** `frontend/app/admin/live-chat/_components/__tests__/ChatArea.connection.test.tsx` (vi.mock context + hooks,
  render, fireEvent, assert) for the NEW test file
  `frontend/app/admin/live-chat/_components/__tests__/CustomerPanel.export.test.tsx`:
  mock `../../_context/LiveChatContext` (`useLiveChatContext: () =>
  ({ fetchChatDetail: vi.fn(), fetchConversations: vi.fn() })`),
  `@/hooks/useCustomerNotes` (`() => ({ notes: '', setNotes: vi.fn(),
  saved: false })`), `@/components/ui/Toast` (`useToast: () => ({ toast:
  mockToast })`); stub `global.fetch` resolving a REAL Response object (NOT
  a hand stub — `readErrorMessage` needs `headers.get('content-type')`,
  `clone().json()` and `text()`, verified `frontend/lib/api-error.ts:26-50`):
  `new Response(JSON.stringify({ detail: 'Conversation too large' }),
  { status: 413, headers: { 'content-type': 'application/json' } })`
  (lowercase `detail` = real FastAPI shape; hits the `api-error.ts:34` branch deterministically);
  render `<CustomerPanel currentChat={{ line_user_id: 'U1',
  display_name: 'T', picture_url: '', friend_status: 'active', chat_mode:
  'HUMAN', unread_count: 0 }} onClose={() => {}} />` (exact required fields
  per `_types.ts:26-43`; `session` optional — omit); click the PDF button;
  `await waitFor(() => expect(mockToast).toHaveBeenCalledTimes(1))`
  (`waitFor` from '@testing-library/react' — the handler is async);
  assert fetch called with the `/pdf` URL AND `mockToast` called with
  `variant: 'error'` and description EXACTLY 'Conversation too large'.
- **VALIDATE:** `python -m pytest tests/test_admin_analytics_export_endpoints.py
  tests/test_histories_export.py -v` (extend: CSV streams + filename correct +
  404-on-empty preserved; PDF 413 on oversized via mocked count, asserting status and `detail == 'Conversation too large'`. Read both
  files first). Frontend: `cd frontend && npx vitest run
  app/admin/live-chat/_components/__tests__/CustomerPanel.export.test.tsx`
  (`test:unit` = `vitest run` per package.json).

### T5 — batch decrypt in cleanup, fail-soft preserved (M-5)
- **ACTION:** One batched identity query per tick instead of one SELECT per
  session; per-row failures still degrade to `raw=None` exactly as today.
- **IMPLEMENT:**
  - New helper in `user_identity_service.py` after `decrypt_line_ids_for_users`
    (L157-175):
    `decrypt_line_ids_for_users_tolerant(db, user_ids) -> dict[int, str]` —
    same single `select(User.id, User.line_user_id_encrypted).where(in_(...))`
    (verified L164-165), but the row loop is rewritten (NOT copied): for each
    `(uid, token)`: `if not token: logger.warning(...); continue` (this
    REPLACES the twin's `if not token: raise RuntimeError` at L169-173 —
    do not keep the raise in any form), then try/except around
    `_decrypt_line_id(token)`: on exception `logger.warning` + skip the row.
    Absent key ≡ today's `raw=None` path (push skipped, session still closed
    + WS broadcast with None) for BOTH missing-token AND corrupt-token rows.
    Docstring MUST contrast with the fail-loud twin: "tolerant variant for
    cleanup ticks — skips undecryptable rows; do NOT use where the
    fail-loud contract is required". Leave the original helper untouched
    (its current callers rely on fail-loud).
  - **REGRESSION RISK (explicit, B7 fourth element for M-5):** the tolerant
    helper masks corrupt/missing tokens as warning-only skips — misuse where
    the fail-loud contract is required would hide a backfill gap. Guarded by
    the docstring contrast + the helper is called ONLY from
    `_process_inactive_sessions` in this plan (grep-verify no other caller
    is added).
  - `session_cleanup.py`: replace the L16 import
    `from app.services.user_identity_service import decrypt_line_id_for_user`
    with `from app.services.user_identity_service import
    decrypt_line_ids_for_users_tolerant` (the single helper has no other use
    in this file after this task — verified: only L107-111 and L163-167 —
    so REPLACE, don't leave a dead import).
  - In `_process_inactive_sessions`, collect distinct non-None `user_id`s
    from BOTH `inactive_sessions` AND `abandoned_sessions` with EXACTLY
    `list(dict.fromkeys(uid for s in inactive_sessions + abandoned_sessions
    if (uid := s.user_id) is not None))` (inactive first, then abandoned,
    first-seen order — pinned so the call assertion below is deterministic),
    build the mapping once (this also fixes the twin per-row N+1 in
    `_mark_abandoned_waiting_session`, L163-167 — same root cause as M-5).
  - Re-signature BOTH `_close_inactive_session(session, db)` and
    `_mark_abandoned_waiting_session(session, db)` to
    `(session, db, *, raw_line_id=None)`; call sites become
    `_close_inactive_session(session, db,
    raw_line_id=mapping.get(session.user_id))` (same for abandoned); replace
    the L107-111 AND L163-167 `decrypt_line_id_for_user` blocks with the
    passed-through value (keep the surrounding push/broadcast try/excepts
    untouched).
- **MIRROR:** `decrypt_line_ids_for_users` query shape (L163-166); single-query
  batch pattern.
- **VALIDATE:** `python -m pytest tests/test_session_cleanup.py -v`.
  REPAIR the existing test (it WILL break — same T1/T7 exception, assertions
  encode the old structure): patch
  `app.tasks.session_cleanup.decrypt_line_ids_for_users_tolerant` with
  `AsyncMock(return_value={123: "Uxxx"})` (avoids a 3rd `db.execute` beyond
  the 2-entry `side_effect` at L30-33; 123 = the waiting session's user_id
  at test L27), and update L42 to
  `mark_abandoned.assert_awaited_once_with(waiting_session, mock_db,
  raw_line_id="Uxxx")`. (Patches live at L35-39 — read the 46-line file first.)
  ADD: N sessions → exactly 1 identity SELECT (assert the tolerant mock
  awaited once with `(mock_db, [3, 7])` given inactive user_ids [3,3] and
  abandoned user_ids [7,None] — pinned order per the dict.fromkeys line
  above); missing-token AND corrupt-token rows skipped while others still
  notify (unit-test the helper directly with a mocked `db.execute` returning
  mixed rows `[(1, "tok-ok"), (2, ""), (3, None)]` + a `_decrypt_line_id`
  mock raising on sentinel input — patch
  `app.services.user_identity_service._decrypt_line_id`).

### T6 — commit-then-announce + capped scans in cleanup (M-6, AFTER T5)
- **ACTION:** Split mutate vs announce phases; cap the tick scans.
- **IMPLEMENT:** (ONE structure — no alternatives, no wrappers. Verified:
  `_close_inactive_session` pushes at L115 + broadcasts at L123;
  `_mark_abandoned_waiting_session` pushes at L171 + broadcasts at L179.)
  - DELETE `_close_inactive_session` and `_mark_abandoned_waiting_session`
    entirely (no thin wrappers — the old names disappear; the test file is
    rewritten below, so no patch can dangle).
  - New `_mutate_close_inactive(session, db)` and
    `_mutate_mark_abandoned(session, db)`: the DB-mutation prefix of each
    old body verbatim (status/closed_at/closed_by + User chat_mode reset +
    `create_audit_log`) — DB-only, no I/O, no decrypt.
  - New `_announce_close(session, raw_line_id)` and
    `_announce_abandoned(session, raw_line_id)`: the announce suffix of each
    old body verbatim (LINE push + WS broadcast, per-call try/excepts + log
    messages UNCHANGED) — no DB writes; `raw_line_id` is positional-or-keyword
    with NO default (caller must pass it; fail-loud on omission).
  - Restructure `_process_inactive_sessions` into exactly: phase 0 = build
    the T5 mapping (unchanged position: right after the two scans, before
    any mutation); phase 1 = mutate all inactive + all abandoned → single
    `await db.commit()`; phase 2 = announce all (both sets, T5 mapping);
    phase 3 = `emit_live_kpis_update` LAST. Order pinned:
    map → mutate → commit → announce → emit (preserves today's "emit is
    last" relative order; KPI reads committed state either way). PRESERVE
    the `if not inactive_sessions and not abandoned_sessions: return`
    early-exit and the tick `logger.info` line above the phases VERBATIM.
  - Cap scans: add `_CLEANUP_BATCH = 500`; inactive scan (L45-51) gets
    `.order_by(ChatSession.last_activity_at.asc()).limit(_CLEANUP_BATCH +
    1)`; abandoned scan (L53-60) gets
    `.order_by(ChatSession.started_at.asc()).limit(_CLEANUP_BATCH + 1)`; if
    501 rows arrive, process the first 500 + `logger.warning` ("more remain,
    next tick").
- **MIRROR:** commit-before-push precedent
  `test_the_claim_is_committed_before_the_push`
  (`test_booking_reminder.py:193`); chunk-scan style of `_iter_csv_rows`.
- **VALIDATE:** `python -m pytest tests/test_session_cleanup.py -v`.
  REWRITE the existing test (the T5-repaired version WILL break again —
  patched names no longer exist; same T1/T7 exception): patch the four new
  helpers + `decrypt_line_ids_for_users_tolerant`
  (`AsyncMock(return_value={123: "Uxxx"})` — the mapping build still issues
  a `db.execute`, which would otherwise break the 2-entry `side_effect`) + `emit_live_kpis_update` (patch as `app.tasks.session_cleanup.analytics_service.emit_live_kpis_update`); assert `mock_db.commit.assert_awaited_once()`;
  assert commit-before-announce ORDER with this exact pattern (no attach
  API — plain side-effect event log, works on AsyncMock children):
  `events: list[str] = []; mock_db.commit.side_effect = lambda *a, **k:
  events.append("commit"); announce_close.side_effect = lambda *a, **k:
  events.append("announce"); announce_abandoned.side_effect = lambda *a,
  **k: events.append("announce")` then after awaiting `_process...`:
  `assert events[0] == "commit" and set(events[1:]) == {"announce"}`;
  501-row case: inactive scan returns 501 mock sessions (user_ids None to
  skip mapping noise) → assert `mutate_close.await_count == 500`,
  `announce_close.await_count == 500`, and `assert any("more remain" in
  r.message for r in caplog.records)` (caplog is a pytest builtin fixture —
  no import needed). (Read the 46-line file first.)
- **RISK NOTE (explicit):** crash between commit and announce leaves a
  committed-but-unnotified close (at-most-once notification) — accepted,
  matches the `booking_reminder` precedent; previously a crash left nothing
  durable but retried the whole tick.
- **DEPENDENCY:** strictly after T5 (builds on its mapping; T5's repaired
  test is then rewritten here — stated churn, not surprise).

### T7 — remove internal commit in transfer_session (M-7)
- **ACTION:** Delete `await db.commit()` at `sessions.py:302` so the mutation commits atomically in the caller's `publish_session_event`.
- **IMPLEMENT:** delete the single line; keep `refreshed = await db.get(...)`.
  JUSTIFICATION (no-commit re-read is sound): the UPDATE at L281-294 passes
  no `synchronize_session`, so the SQLAlchemy 2.0 default `'auto'` applies
  (resolves to `'evaluate'` for these `==` predicates); the
  expression-assigned `transfer_count + 1` may expire, causing at most one
  lazy refresh SELECT on access — correctness unaffected either way, and
  `db.get` in the same session returns the pending state. No caller changes: HTTP
  (`transfer_conversation` L299) and WS (`handle_transfer_session` L313) both
  already commit via `publish_session_event` (verified — the only 2 call
  sites; no other callers exist).
- **MIRROR:** `claim_session` / `close_session` in the same file (mutate only,
  caller commits — verified: no other `db.commit` in `sessions.py`).
- **VALIDATE:** `python -m pytest tests/test_live_chat_service.py
  tests/test_transfer_race.py tests/test_transfer_session_errors.py
  tests/test_session_claim.py -v`.
  **RISK (explicit):** tests calling `transfer_session` directly assume the
  internal commit — apply these EXACT edits (verified line refs):
  (1) `test_live_chat_service.py:284` AND `:391`: DELETE both
  `mock_db.commit.assert_awaited_once()` lines in the transfer tests
  (verified: both assert commit after transfer; commit is now the caller's
  job); (2) `test_transfer_race.py:56-64`: restructure `attempt()` to commit
  on success (the `async with Session()` exit would otherwise roll back the
  winner's now-uncommitted mutation and L71-74 would fail):
  `result = await live_chat_service.transfer_session(...same args...);
  await db.commit()  # production callers commit via publish_session_event;
  return result` (on ValueError the exception propagates before commit —
  mirroring production, where the caller never reaches publish on error);
  (3) ADD `test_transfer_audit_atomic_with_mutation` in the same file:
  transfer → `await db.rollback()` → new session reads the row and asserts
  `operator_id` still the original operator AND `transfer_count == 0`
  (mutation-atomicity; NOTE: no audit-row assertion — the decorator never
  fires for transfer, see M-8 deferred); (4) `test_transfer_session_errors.py`:
  NO EDITS — verified it mocks `transfer_session` to raise before touching
  the DB (L39-59) and only asserts endpoint error mapping, so the removed
  commit cannot affect it; it stays in VALIDATE as a regression run only.

## Validation Commands (stack-detected; backend + one frontend file)
- Scoped (after EVERY task): `cd backend && python -m pytest tests/<file>.py -v`
- Full backend (after all tasks): `cd backend && python -m pytest`
- Frontend (T4 only): `cd frontend && npx vitest run
  app/admin/live-chat/_components/__tests__/CustomerPanel.export.test.tsx`
  (+ `npm run test:unit` full unit suite at the end; `npx eslint` on the two
  touched frontend files — `lint` script = bare `eslint` per package.json)
- No ruff/mypy config exists in `backend/` (verified: only `pytest.ini`,
  `alembic.ini`, `requirements.txt`) → pytest is the gate; no backend
  lint/typecheck step.

## Testing Strategy
- Extend existing mock-style tests in place (AsyncMock `db.execute` chains per
  `test_live_chat_service.py`); one NEW file only (T3 — zero coverage today).
- Every fix asserts the NEW behavior (dict shape, limit applied, single query,
  commit order, atomicity) — not just "doesn't crash".
- Never weaken existing assertions to fit the fix; adapt only tests that
  encoded the old structure — T1's `response.json()["id"]` assertions
  (`test_session_claim.py:473,518`), T5/T6's `test_session_cleanup.py`
  (side_effect arity, call kwargs, then full rewrite for the phase split),
  and T7's commit assumptions — and say so in the commit.

## Acceptance Criteria
- [ ] All 9 findings fixed at root cause; no orphan finding (B7 map above).
- [ ] Scoped pytest green after each task; full `python -m pytest` green at end.
- [ ] Claim/close/transfer REST + WS flows covered by updated tests.
- [ ] No response-shape regression for frontend on claim/close (only `res.ok`
  consumed — verified) and lists (arrays stay arrays); the T4 toast is the
  only frontend delta and is covered by its own test.
- [ ] No new warnings/errors in test output attributable to these changes.
