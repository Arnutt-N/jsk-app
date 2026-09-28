# PRD: Transfer Audit Fix (M-8) (2026-09-28)

- **Source spec (binding):** `.claude/PRPs/findings/2026-09-27-full-codebase-findings.md`
  section M-8 (firsthand-verified during round-2 plan review)
- **Branch:** `fix/transfer-audit-m8`
- **Scope:** backend (1 source file, 2 test files) + ONE one-line frontend
  addition (badge color for the new audit action on the admin audit page —
  the page has a safe fallback, so this is consistency polish, not a fix).
- **Prior batch:** PR #238 fixed H-1/H-2 + M-1..M-7 and explicitly deferred
  M-8 pending a design decision. This PRD makes that decision.

## Problem

### M-8 — transfer_session audit never fires
- **Root cause:** `transfer_session`
  (`backend/app/services/live_chat_service/sessions.py:248-256`) is decorated
  `@audit_action("transfer_session", "chat_session")`, but its signature
  `(self, line_user_id, from_operator_id, to_operator_id, reason, db)`
  contains none of the decorator's operator keys
  (`operator_id`/`admin_id`/`closed_by` — `backend/app/core/audit.py:31,45`),
  and both production callers (HTTP `transfer_conversation`, WS
  `handle_transfer_session`) pass keyword args without those keys. So
  `operator_id` resolves `None` and every transfer audit row is skipped
  (`audit.py:58,89`, warning-logged on every transfer).
- **Impact:** audit-trail gap for operator transfers (observability only —
  transfers succeed; current state reconstructible from
  `operator_id`/`transfer_count`, but the who-handed-to-whom history is lost).
- **Why now:** last unresolved finding from the reviewed batch; evidence and
  call sites fully mapped; the deferred design decision is small and now made
  (below).

## Design decision (the deferred decision, now made)

**Chosen: explicit `create_audit_log` call inside `transfer_session` + remove
the dead decorator** (mirrors `session_cleanup.py`'s explicit usage).

1. **Surgical blast radius:** touches only `transfer_session` + its tests.
   Zero change to the shared decorator, so the other 4 audited actions
   (`claim_session`, `close_session`, `send_message`, `send_media`) cannot
   regress.
2. **Full control of audit content:** actor, resource, and details are stated
   explicitly instead of inferred by parameter-name sniffing.
3. **Removes a lie:** the decorator today pretends to audit while only
   emitting a skip warning on every transfer; deleting it removes the
   confusion and the log noise.
4. **Atomicity preserved:** `create_audit_log` does `add` + `flush` (no
   commit), so the row lands in the caller's commit atomically with the
   mutation (post-T7/M-7 single unit of work) — including rollback-atomicity,
   which the tests assert both ways.
5. **Precedent:** session-lifecycle closes already audit explicitly via
   `create_audit_log` in `session_cleanup.py`.

**Rejected: `from_operator_id` fallback lookup in the decorator.**
It extends the decorator's already-fragile magic (positional-arg sniffing,
`isinstance` checks) and touches the shared path of every audited action to
fix exactly one caller that has no operator key. More risk, less clarity.

## Audit row contract (exact)

| Field | Value | Source |
|-------|-------|--------|
| `admin_id` | `from_operator_id` | the acting operator: HTTP passes `current_user.id` (`admin_live_chat.py:288`), WS passes `admin_id_int` (`handlers.py:307`) — verified both call sites |
| `action` | `"transfer_session"` | same string the dead decorator declared (no rename) |
| `resource_type` | `"chat_session"` | unchanged |
| `resource_id` | `str(session.id)` | mirrors decorator convention (`result.id`) |
| `details` | `{"from_operator_id": int, "to_operator_id": int, "reason": str\|None}` | mirrors the `SESSION_TRANSFERRED` payload minus ids already on the row; `reason` is operator-authored, capped at 255 chars (`TransferSessionPayload.reason`) |
| `ip_address` / `user_agent` | `None` | service layer has no request context — consistent with claim/close rows |

**Deliberately excluded:** the `line_user_id` VALUE is not stored in
`details` (consistent with the decorator's keys-only habit and the F4
sensitivity posture toward raw LINE IDs in stored/logged data).

## Accepted behavior changes

- One new `audit_logs` row per **successful** transfer (low-volume human
  action — no volume concern).
- Failed transfers (`ValueError` paths) still write no row (the call sits
  after the rowcount check; exceptions raise before it).
- The `audit_action skipped ... transfer_session` warning disappears.
- New rows render on the admin audit page (`/admin/audit`) via the existing
  generic list + stats; a badge color is added for the action.

## NOT in scope

- Any change to `backend/app/core/audit.py` (shared decorator untouched).
- Any change to other actions' audit rows.
- Backfill of historical transfers (reconstructing who→whom history after the
  fact would fabricate data; current state remains readable from the session
  row).
- `ip_address`/`user_agent` capture (no request context at the service layer).
- Any frontend change beyond the one badge-color line (verified: no test
  covers `ACTION_COLORS`; the page falls back safely for unknown actions).
