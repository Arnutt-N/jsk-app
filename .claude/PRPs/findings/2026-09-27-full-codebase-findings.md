# Full-Codebase Findings — 2026-09-27

Synthesized from sibling reviewer reports. Every finding below was re-verified
against the current codebase bodies by the synthesizer; unverified candidates
were dropped (see Rejected). Counts: **2 High, 8 Medium, 0 Critical, 0 Low**
(M-8 added during plan review with firsthand verification; M-7 mechanism
corrected during plan review — see notes).

## High severity

### H-1 — claim_conversation returns raw ChatSession ORM, no response_model

- **Location:** `backend/app/api/v1/endpoints/admin_live_chat.py:219-242`
- **Category:** FastAPI response-model leak
- **Evidence:**
  ```python
  @router.post("/conversations/{line_user_id}/claim")
  async def claim_conversation(
      line_user_id: str,
      db: AsyncSession = Depends(deps.get_db),
      current_user: User = Depends(deps.get_current_staff),
  ) -> Any:
      ...
      return session
  ```
  No `response_model` on the decorator; returns the `ChatSession` SQLAlchemy
  object directly, so FastAPI serializes whatever ORM attributes are loaded.
- **Suggestion:** Return an explicit shape — either a dict like
  `transfer_conversation` does (same file, L312-319), or add
  `response_model=ChatSessionResponse` (the schema exists at
  `backend/app/schemas/chat_session.py:20`). The dict return is the smallest
  fix on closest-sibling-convention grounds.
- **Correction (2026-09-27, plan review):** an earlier draft of this suggestion
  wrongly claimed no `ChatSessionResponse` exists. It does; the dict
  recommendation stands on convention grounds, not on schema absence.
- **Reporters:** backend-framework

### H-2 — close_conversation returns raw ChatSession ORM, no response_model

- **Location:** `backend/app/api/v1/endpoints/admin_live_chat.py:244-265`
- **Category:** FastAPI response-model leak
- **Evidence:**
  ```python
  @router.post("/conversations/{line_user_id}/close")
  async def close_conversation(
      ...
  ) -> Any:
      ...
      return session
  ```
  Same pattern as H-1: no `response_model`, raw ORM return.
- **Suggestion:** Same fix as H-1: return an explicit dict (mirroring
  `transfer_conversation`) or add a response schema + `response_model`.
- **Reporters:** backend-framework

## Medium severity

### M-1 — list_rich_menus has no pagination

- **Location:** `backend/app/api/v1/endpoints/rich_menus.py:98-101`
- **Category:** SQLAlchemy unbounded query
- **Evidence:**
  ```python
  @router.get("", response_model=List[RichMenuResponse])
  async def list_rich_menus(db: AsyncSession = Depends(get_db), current_admin: User = Depends(get_current_admin)):
      result = await db.execute(select(RichMenu).order_by(RichMenu.created_at.desc()))
      menus = result.scalars().all()
  ```
  Full-table load with no `skip`/`limit`. (The per-menu link counts are
  already batched in one query — no N+1 here — but the menu list itself is
  unbounded.)
- **Suggestion:** Add `skip`/`limit` query params (`le=100`, matching the
  auto-replies list convention) with `.offset().limit()`.
- **Reporters:** backend-framework

### M-2 — list_rich_menu_aliases has no pagination

- **Location:** `backend/app/api/v1/endpoints/rich_menus.py:124-130`
- **Category:** SQLAlchemy unbounded query
- **Evidence:**
  ```python
  @router.get("/aliases", response_model=List[RichMenuAliasResponse])
  async def list_rich_menu_aliases(...):
      result = await db.execute(select(RichMenuAlias).order_by(RichMenuAlias.created_at.desc()))
      return result.scalars().all()
  ```
- **Suggestion:** Add `skip`/`limit` pagination params matching M-1.
- **Reporters:** backend-framework

### M-3 — handle_bind_phone loads and mutates every ServiceRequest for a phone number

- **Location:** `backend/app/services/message_intake/commands.py:87-108`
- **Category:** SQLAlchemy unbounded query
- **Evidence:**
  ```python
  stmt = select(ServiceRequest).where(ServiceRequest.phone_number == phone_number)
  result = await db.execute(stmt)
  requests = result.scalars().all()
  ...
  for req in bindable:
      req.user_id = user_id
  await db.flush()
  ```
  A shared/reused phone number fans out to an unbounded bind loop with no
  ordering or cap.
- **Suggestion:** Add `.order_by(ServiceRequest.created_at.desc()).limit(N)`
  and only bind the bounded set (log when rows are left over).
- **Reporters:** backend-framework

### M-4 — export CSV path full-loads the conversation before chunked streaming

- **Location:** `backend/app/api/v1/endpoints/admin_export.py:51-61` (caller at L106)
- **Category:** SQLAlchemy unbounded query
- **Evidence:**
  ```python
  async def _load_conversation(
      line_user_id: str, db: AsyncSession
  ) -> tuple[Optional[User], List[Message]]:
      """Resolve identity + messages once per export (not twice)."""
      user = await resolve_by_line_id(db, line_user_id)
      result = await db.execute(
          select(Message)
          .where(child_filter(Message, line_user_id, user.id if user else None))
          .order_by(Message.created_at.asc(), Message.id.asc())
      )
      return user, list(result.scalars().all())
  ```
  `export_conversation_csv` (L106) calls this full-load for the
  filename/empty-check even though `_iter_csv_rows` (L70-96) already streams
  the same conversation in `_EXPORT_CHUNK` pages — so the CSV path loads every
  message twice, once unbounded into memory. The PDF path buffers everything
  by construction.
- **Suggestion:** For CSV, fetch only first/last message + count for the
  filename and empty-check, then stream via `_iter_csv_rows`; cap `_load_conversation`
  (or give the PDF path an explicit size guard).
- **Reporters:** backend-framework

### M-5 — session cleanup decrypts LINE IDs one SELECT per session (N+1)

- **Location:** `backend/app/tasks/session_cleanup.py:71-72,108`
- **Category:** SQLAlchemy N+1 query
- **Evidence:**
  ```python
  for session in inactive_sessions:
      await _close_inactive_session(session, db)
  ...
  raw_line_id = await decrypt_line_id_for_user(db, session.user_id)
  ```
  `decrypt_line_id_for_user` issues one `select(User)` per call
  (`backend/app/services/user_identity_service.py:150`), so each cleanup run
  costs one extra SELECT per inactive session.
- **Suggestion:** Batch once with the existing
  `decrypt_line_ids_for_users(db, [s.user_id ...])`
  (`user_identity_service.py:157`) and pass the mapping into the helper.
- **Reporters:** backend-framework

### M-6 — session cleanup holds an open transaction across LINE push + WS fan-out

- **Location:** `backend/app/tasks/session_cleanup.py:45-77`
- **Category:** SQLAlchemy session lifecycle
- **Evidence:**
  ```python
  for session in inactive_sessions:
      await _close_inactive_session(session, db)

  for session in abandoned_sessions:
      await _mark_abandoned_waiting_session(session, db)

  await db.commit()
  ```
  Each `_close_inactive_session` awaits `line_service.push_messages` (L115)
  and `ws_manager.broadcast_to_all` (L123) — slow external I/O — while the
  state mutations stay uncommitted until the single `db.commit()` at L77.
  The two `.all()` scans at L45-60 are also uncapped.
- **Suggestion:** Commit state changes first, then do LINE push/WS fan-out
  (per the choreography rule: commit, then announce); cap or chunk the L45-60
  scans.
- **Reporters:** backend-framework

### M-7 — transfer_session commits internally, splitting the caller's transaction

- **Location:** `backend/app/services/live_chat_service/sessions.py:302`
- **Category:** SQLAlchemy session lifecycle
- **Evidence:**
  ```python
  if result.rowcount != 1:
      ...
  await db.commit()
  refreshed = await db.get(ChatSession, session.id)
  ```
  The established choreography is that the service layer mutates and the
  endpoint's `publish_session_event` performs the single commit
  (`backend/app/services/live_chat_service/choreography.py:91-102`:
  "Commit the pending session mutation, then announce it", `await db.commit()`
  at L102). The internal commit here splits atomicity: the mutation is durable
  before the caller's commit, so anything the caller adds afterwards (future
  writes, and the announce-vs-durable ordering the choreography promises)
  lands in a separate unit of work.
- **Correction (2026-09-27, plan review):** the original draft claimed the
  `audit_action` decorator's `AuditLog` row lands in the second commit. That
  mechanism is WRONG — firsthand verification shows the decorator NEVER fires
  for `transfer_session` (see M-8): the signature
  (`sessions.py:249-256`) has no `operator_id`/`admin_id`/`closed_by`
  parameter, so `audit.py:31-52` resolves `operator_id=None` and skips the
  row (warning-logged). The FIX (remove the internal commit) is unchanged —
  only the audit-split half of the rationale is void.
- **Suggestion:** Remove the internal `await db.commit()`; let the caller
  commit once via `publish_session_event`, keeping the mutation in the
  caller's atomic unit.
- **Reporters:** backend-framework

### M-8 — transfer_session audit NEVER fires (decorator param-name mismatch) — DEFERRED

- **Location:** `backend/app/core/audit.py:31-52` ×
  `backend/app/services/live_chat_service/sessions.py:248-256`
- **Category:** audit completeness (observability)
- **Severity:** Medium — transfers succeed and are reconstructible from
  session state (`operator_id`, `transfer_count`); no user impact, no data
  loss. Gap is audit-trail completeness only.
- **Evidence:** `transfer_session` is decorated
  `@audit_action("transfer_session", "chat_session")` (`sessions.py:248`),
  but its signature `(self, line_user_id, from_operator_id, to_operator_id,
  reason, db)` contains none of the decorator's operator keys
  (`operator_id`/`admin_id`/`closed_by` — `audit.py:31,45`), and both
  production callers pass keyword args without those keys. So `operator_id`
  resolves `None` and the row is skipped (`audit.py:58,89`). Verified by
  reading both call sites (`admin_live_chat.py:276-281`,
  `ws_session/handlers.py:305`) — neither passes an operator key.
- **Suggestion (NOT in this batch):** make the audit fire — either a
  `from_operator_id` fallback lookup in the decorator, or an explicit
  `create_audit_log` call in `transfer_session` (mirroring
  `session_cleanup.py`'s explicit usage) with the dead decorator removed.
- **Disposition: DEFERRED with reason** (skill-compliant for Medium): the fix
  touches the shared audit decorator (all audited actions) AND starts
  emitting new audit rows (volume/behavior change) — both need a deliberate
  design/product decision that does not belong in a review-fix batch's final
  gate loop. No Critical/High remains unresolved (G3 intact).
- **Reporters:** plan-review (firsthand)

## Rejected (failed verification)

None. All 9 deduped candidates verified against current sources; none dropped.
(M-8 was added (then deferred) during plan review, not rejected.)

## Omitted scope

No findings were omitted for scope reasons in this run. The deduped input set
contained only the 9 backend-framework findings above (sibling refs prior
result 1-8 carried no additional inspectable candidates), so there was no
overflow to defer.
