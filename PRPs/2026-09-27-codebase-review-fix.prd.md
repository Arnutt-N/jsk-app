# PRD — Codebase Review Fix (2026-09-27)

> Task: `/codebase-review-fix` — full review-and-fix pipeline, G1 findings F1–F7
> Branch: `fix/codebase-review-fix-20260927` | Stack table: see handoff/session notes

## 1. Background

A read-only review of the backend API layer (auth, live-chat, uploads, user mgmt,
webhook intake, search/pagination) found **0 Critical / 0 High** issues. Seven
Medium/Low findings (F1–F7) were collected, merged, and deduplicated (G1 done).
This PRD scopes the fix batch: low-risk consistency/hardening changes only, no
behavior change for valid inputs, no refactoring beyond the findings.

## 2. Goals

- G1: findings collected + deduped (DONE — 7 items, evidence-backed).
- G2: this PRD + PRP plan pass `prp-validate-plan` (READY, ≥ 8/10) before code.
- G3: zero unresolved Critical/High (already 0); fix all Medium, fix Low where
  zero-risk, document any deferral with a reason.
- Every fix ships with/extends a regression test; full validation green.

## 3. Scope — IN

| ID | Fix | Files |
|----|-----|-------|
| F1 | `escape_ilike(keyword)` in list_auto_replies | `backend/app/api/v1/endpoints/admin_auto_replies.py:34` |
| F2 | Clamp `skip`/`limit` with `Query(ge/le)` on 5 list endpoints + the unbounded messages-search `limit` (requests ceiling is `le=200`, NOT 100 — the Kanban frontend sends `limit=200`, `frontend/app/admin/requests/kanban/page.tsx:67`) | `admin_auto_replies.py:24-25`, `admin_intents.py:23-24`, `admin_reply_objects.py:24-25`, `admin_requests.py:274-275`, `admin_friends.py:26` (skip-only), `admin_live_chat.py:407` (search `limit: int = 20` bare) |
| F3 | Resolve the conversation user once per broadcast fan-out (fixes the true N+1: same user re-resolved per admin) | `backend/app/services/message_intake/broadcast.py:29-34,82-87` + optional `user` param on `get_unread_count` (`backend/app/services/live_chat_service/unread.py:23-43`) |
| F4 | `mask_line_id` in redelivery-skip log | `backend/app/services/message_intake/message_handler.py:65-68` |
| F5 | Length caps on all 12 `AdminRequestCreate` text fields (prefix, firstname, lastname, phone_number, email, agency, province, district, sub_district, topic_category, topic_subcategory, description) | `backend/app/api/v1/endpoints/admin_requests.py:56-86` |
| F6 | Length cap on `CreateSessionRequest.reason` | `backend/app/api/v1/endpoints/admin_live_chat.py:426-434` |
| F7 | Reuse shared `escape_ilike` | `backend/app/api/v1/endpoints/admin_requests.py:26-28` → import from `app.core.query_utils` |

## 4. Scope — OUT (explicitly NOT building)

- No auth/RBAC redesign (verified sound: login throttle, cookie flags, CSRF,
  WS two-gate, transfer ghost-push guard all pass).
- No new endpoints, no schema renames, no migration (all changes are code-only;
  F5/F6 only tighten Pydantic validation).
- No frontend changes (admin UI already masks LINE IDs at all 44 call sites;
  no raw-ID leak found in sampled components).
- No unrelated refactoring; no test weakening to make builds pass.

## 5. Acceptance criteria

1. `%`/`_` in auto-reply keyword search matches literally (new test with both
   a `%` decoy and an `_` decoy).
2. `skip=-1` → 422 on the 5 list endpoints (messages-search has no `skip`
   param); `limit=999999` → 422 on the newly-capped endpoints (tests assert
   422, not silent clamping — `Query(ge/le)` rejects out-of-range);
   `GET /admin/requests?limit=200` → 200 OK (Kanban contract lock —
   `frontend/app/admin/requests/kanban/page.tsx:67`; the requests ceiling is
   `le=200` precisely so the Kanban board keeps working).
3. Each broadcast fan-out resolves the user exactly once (not once per admin);
   `get_unread_count` accepts an optional pre-resolved `user` (default None =
   current behavior for all other callers); per-admin Redis read-marker GET and
   count queries remain by design; WS payloads byte-identical to before.
   Cross-admin query batching is an explicit non-goal (needs an admin-axis
   batch API — a redesign, deferred; switching to `get_unread_counts` would be
   churn: wrong axis, no measurable gain).
4. Redelivery-skip log contains masked ID only (`mask_line_id` form = first 6
   chars + `…`, e.g. `U12345…`); test asserts the full raw ID is absent.
5. Oversize `AdminRequestCreate` field → 422 (test); oversize
   `CreateSessionRequest.reason` via POST `/conversations` → 422 (test).
   (The transfer flow's reason is already capped today —
   `TransferSessionPayload.reason`, `ws_events.py:126` — so the test must
   target the create-session schema, not transfer.)
6. No duplicate `escape_ilike` helper remains in `admin_requests.py` (F7
   scope). The inline escape chain at `conversations.py:263` stays —
   documented residual, same follow-up bucket as the LIFF caps.
7. Backend `pytest -q` green; frontend `lint` + `test:unit` + `build` green;
   no new Critical/High in final re-review (G3).

## 6. Risks

- F2 changes invalid input from today's failure modes to a clean 422: a
  negative `skip` today yields a 500 (Postgres rejects negative OFFSET), and
  an oversized `limit` is silently clamped (messages-search) or unbounded
  (the 5 lists) — after the fix both are explicit 422s. Admin-only endpoints;
  frontend caller audit: the ONLY out-of-range caller is the Kanban board
  (`limit=200` → accommodated with `le=200`); audit-log `limit=200` goes to
  `/admin/audit/logs` (already `le=500`) — unaffected. The `limit=200 → 200
  OK` contract is locked by a unit test so a future "tighten to 100" cannot
  silently break Kanban.
- F3 touches a hot path but is behavior-preserving: the mixin signature gains a
  backward-compatible optional `user` param (default None → resolves internally
  exactly as today, so the existing direct tests `test_live_chat_service.py:505,518`
  stay valid); for a given (line_user_id, admin_id) the count semantics are
  unchanged — same Redis GET, same count SQL — only the redundant user lookup is
  collapsed. Covered by a new unit test + existing live-chat suite.
- Pydantic tightening (F5/F6) could 422 previously-accepted junk — intended.
  Verified blast radius: `AdminRequestCreate` is used ONLY by the admin create
  endpoint (:87-89); admin edits go through `RequestUpdate` (PATCH :611,
  partial) and LIFF creates through a separate schema — both untouched, so
  no existing row can become uneditable. LIFF-side caps remain an accepted
  asymmetry (separate follow-up, out of scope). PATCH edits via
  `RequestUpdate` (:338-362, same text fields unbounded) remain a documented
  bypass — capping them is deferred together with the LIFF-side caps
  (same follow-up, out of scope).
- Frontend sends no new validation (scope-OUT): if an admin pastes an over-long
  value after F5/F6 they get a 422 with the FastAPI detail — acceptable for an
  admin-only form; UI-side maxlength is a follow-up, not this batch.

## 7. Validation plan

`cd backend && python -m pytest -q` · `cd frontend && npm run lint`,
`npm run test:unit`, `npm run build` · final stack/code/security re-review of
the diff only (max 3 rounds).
