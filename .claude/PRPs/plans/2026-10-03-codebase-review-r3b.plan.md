# PRP: Codebase Review Round 3, Batch B (2026-10-03)

## Metadata
- **PRD:** `.claude/PRPs/prds/2026-10-03-codebase-review-r3b.prd.md`
- **Findings (binding):** `.claude/PRPs/findings/2026-09-28-codebase-review-r3-findings.md`
- **Branch:** `fix/codebase-review-r3b-20261003` (from `main` @ `8464b71`)
- **Coverage map (execution order):** T1→R3-M1 · T2→R3-M3 · T3→R3-M5 ·
  T4→R3-M7 · T5→R3-M8 · T6→R3-M12 · T7→R3-M18 · T8→R3-M17 · T9→R3-M19 ·
  T10→R3-M20 · T11→R3-M21 · T12→R3-M22 · T13→R3-M23 · T14→R3-M24 ·
  T15→R3-L1 · T16→R3-M15 · T17→R3-M16 · T18→R3-M25 · T19→R3-M28 ·
  T20→R3-M29 · T21→R3-M30 · T22→R3-L2. Zero orphan findings.
- **Order note:** T7 (M18) runs BEFORE T8 (M17) so the shared
  `test_session_claim.py` stays green after every task (T7's message-return
  update lands first; T8's identity update second — either order would
  strand the other half red). All other shared files have disjoint edit
  ranges, noted per task.
- **Working directory for backend commands:** `backend/` via
  `backend\venv_win\Scripts\python.exe` from PowerShell.
- **Local DB (NEW vs Batch A):** WSL Postgres 16 on **port 5434**
  (`~/pgdata_test`, role/db `postgres`/`skn_app_db`, password `password`)
  + WSL redis on 6379, both reachable from Windows. One-time setup per
  session: start services (pg_ctl + redis-server, see Validation
  Commands) and `alembic upgrade head` with the 5434 URL. Run pytest
  with `$env:DATABASE_URL='postgresql+asyncpg://postgres:password@127.0.0.1:5434/skn_app_db'`.
  DB-backed tests (T9/T12) run locally AND in CI (CI uses 5432 —
  conftest default; no code difference).
- **Skills:** `codebase-review-fix` (G1/G2/G3 gates),
  `prp-validate-plan` (G2 gate engine), `writing-plans` discipline
  (exact files/code, no placeholders), `liff_development` (T19/T20:
  input-shape/validation only, no submit-flow change), `frontend-a11y`
  (T21 error-linking pattern).

## Files to Change
1. `backend/app/services/live_chat_service/messaging.py` + NEW
   `backend/tests/test_toggle_mode_atomicity.py` (T1)
2. NEW `backend/app/services/outbox.py` +
   `backend/app/services/message_intake/message_handler.py` +
   `backend/app/services/message_intake/commands.py` +
   `backend/app/services/handoff_service.py` +
   `backend/app/services/live_chat_service/handoff.py` +
   `backend/app/api/v1/endpoints/webhook.py` + NEW
   `backend/tests/test_webhook_outbox.py` (T2)
3. `backend/app/services/friend_service.py` + NEW
   `backend/tests/test_get_or_create_user_race.py` (T3)
4. `backend/app/api/v1/endpoints/admin_users.py` +
   `backend/app/api/v1/endpoints/admin_export.py` + extend
   `backend/tests/test_admin_users.py` + extend
   `backend/tests/test_admin_analytics_export_endpoints.py` (T4)
5. `backend/app/services/line_service.py` + NEW
   `backend/tests/test_line_media_size_cap.py` (T5)
6. `backend/app/api/v1/endpoints/liff_bookings.py` + NEW
   `backend/tests/test_liff_bookings_ratelimit.py` (T6)
7. `backend/app/services/live_chat_service/messaging.py` +
   `backend/app/api/v1/endpoints/admin_live_chat.py` +
   `backend/app/services/ws_session/handlers.py` + update
   `backend/tests/test_session_claim.py` (send half) + NEW
   `backend/tests/test_send_message_payload.py` (T7)
8. `backend/app/services/live_chat_service/conversations.py` +
   `backend/app/api/v1/endpoints/admin_live_chat.py` + update
   `backend/tests/test_session_claim.py` (identity half) + NEW
   `backend/tests/test_conversation_identity.py` (T8)
9. `backend/app/services/live_chat_service/conversations.py` + NEW
   `backend/tests/test_inbox_distinct_on.py` (SQL-shape local + DB
   equivalence) (T9)
10. `backend/app/services/analytics_service.py` + NEW
    `backend/tests/test_live_kpis_cache.py` (T10)
11. `backend/app/services/analytics_service.py` (delete dead code; no new
    tests — grep + suite green) (T11)
12. `backend/app/services/message_intake/intent_matching.py` + NEW
    `backend/tests/test_intent_combine.py` (call-count local + DB
    equivalence matrix) (T12)
13. NEW `backend/app/core/http_timeouts.py` +
    `backend/app/services/telegram_service.py` +
    `backend/app/services/credential_service.py` +
    `backend/app/services/rich_menu_service.py` +
    `backend/app/api/v1/endpoints/settings.py` + NEW
    `backend/tests/test_http_timeouts.py` (T13)
14. `backend/app/core/rate_limiter.py` +
    `backend/app/api/v1/endpoints/ws_live_chat.py` +
    `backend/app/core/websocket_manager.py` + extend
    `backend/tests/test_ws_security.py` (T14)
15. `backend/app/services/broadcast_service.py` + extend
    `backend/tests/test_broadcast_service.py` (T15)
16. `frontend/app/admin/live-chat/_hooks/useConversationSync.ts` + extend
    `_hooks/__tests__/useConversationSync.test.tsx` (T16)
17. `frontend/lib/api-error.ts` + extend
    `frontend/lib/__tests__/api-error.test.ts` (T17)
18. `frontend/lib/authFetch.ts` + extend
    `frontend/lib/__tests__/authFetch.cookie.test.ts` (T18)
19. `frontend/app/liff/service-request/page.tsx` +
    `frontend/app/liff/service-request-single/page.tsx` + NEW
    `service-request/__tests__/validation.test.tsx` + NEW
    `service-request-single/__tests__/validation.test.tsx` (T19)
20. `frontend/app/liff/service-request/page.tsx` +
    `frontend/app/liff/request-v2/page.tsx` +
    `frontend/app/liff/service-request-single/page.tsx` + extend the two
    T19 validation files + NEW
    `request-v2/__tests__/phone-input.test.tsx` (T20)
21. `frontend/app/login/page.tsx` + NEW
    `frontend/app/login/__tests__/page.test.tsx` (T21)
22. `frontend/app/admin/live-chat/_hooks/useMessageFlow.ts` + extend
    `_hooks/__tests__/useMessageFlow.test.tsx` (T22)
- **UX before/after (user-visible only):** T16 false offline banner gone
  on auth expiry; T19 whitespace names/descriptions get inline guidance
  (was late server error); T20 dashed phone input works + placeholder
  matches; T21 login errors render text + screen-reader wiring (was
  color-only); T4 non-admin roles see masked IDs in user detail +
  exports (was raw); T6 over-limit booking reads get 429 (was
  unlimited). All other tasks: no client-visible change.

## NOT Building
- Postback-event phase-split (T2 covers message events only).
- `request-v2` client-side validation (no validator exists; PRD F3).
- Broadcast startup reclaim after process death (PRD F4).
- Recency-window half of M19 (behavior-changing).
- Migrating `liff.py` / `admin_integrations.py` timeouts to shared
  constants (already safe).
- `save_message(commit=True)` default change (PRD F1 — needs its own
  finding, not a silent fix).
- FK `ondelete` policy, response-shape redesigns (T7's additive
  `message` key follows the media-twin precedent), backfills, data
  migrations, new API routes.

## Step-by-Step Tasks

### T1 — set_chat_mode: drop the internal commit (R3-M1)
- **ACTION:** Make `toggle_mode` a single atomic unit: service sets the
  field, the endpoint commits once.
- **Root cause:** service commits mid-flow; caller commits again after
  session ops — crash between = HUMAN with no session.
- **Regression risk:** LOW — sole caller verified by grep
  (`admin_live_chat.py:346`); endpoint already commits at L361.
- **IMPLEMENT:** in `backend/app/services/live_chat_service/messaging.py`,
  replace L186-193 with exactly:
  ```python
      async def set_chat_mode(self, line_user_id: str, mode: ChatMode, db: AsyncSession):
          """Set chat mode. Caller commits — single atomic unit with the session op."""
          user = await resolve_by_line_id(db, line_user_id)
          if user:
              user.chat_mode = mode
              return True
          return False
  ```
  (Delete the `await db.commit()` line + reword the docstring. No flush
  needed — the caller's commit persists the attribute change.)
- **MIRROR:** PR #239 transfer-audit (explicit single commit at endpoint).
- **VALIDATE:** NEW `backend/tests/test_toggle_mode_atomicity.py` (pure
  mocks, local):
  ```python
  """set_chat_mode must not commit (R3-M1): toggle_mode commits once."""
  from types import SimpleNamespace
  from unittest.mock import AsyncMock, patch

  import pytest

  from app.models.user import ChatMode
  from app.services.live_chat_service import LiveChatService


  @pytest.mark.asyncio
  async def test_set_chat_mode_sets_field_without_committing():
      svc = LiveChatService()
      user = SimpleNamespace(chat_mode=ChatMode.BOT)
      db = AsyncMock()
      with patch(
          "app.services.live_chat_service.messaging.resolve_by_line_id",
          new=AsyncMock(return_value=user),
      ):
          assert await svc.set_chat_mode("U1", ChatMode.HUMAN, db) is True
      assert user.chat_mode == ChatMode.HUMAN
      db.commit.assert_not_awaited()


  @pytest.mark.asyncio
  async def test_set_chat_mode_unknown_user_returns_false_without_committing():
      svc = LiveChatService()
      db = AsyncMock()
      with patch(
          "app.services.live_chat_service.messaging.resolve_by_line_id",
          new=AsyncMock(return_value=None),
      ):
          assert await svc.set_chat_mode("U1", ChatMode.HUMAN, db) is False
      db.commit.assert_not_awaited()
  ```
  (Patch target verified: `resolve_by_line_id` imported into
  `messaging.py` at L16.) Run `python -m pytest
  tests/test_toggle_mode_atomicity.py -v` + `tests/test_operator_takeover.py`
  (endpoint still commits once — must stay green).

### T2 — webhook outbox: mutate → commit → announce (R3-M3)
- **ACTION:** Defer every LINE reply + WS broadcast on the message path
  until after the per-event commit, via a small outbox.
- **Root cause:** replies/broadcasts fire pre-commit; crash between =
  ghost messages + staff notified of uncommitted handoffs.
- **Regression risk:** HIGH (webhook hot path) — mitigated by:
  build-logic untouched (payload bytes identical, only send deferred);
  helpers keep backward-compatible signatures (existing direct-call
  tests pass unchanged via immediate-drain); new order tests pin
  commit-before-announce; full CI suite.
- **IMPLEMENT:**
  1. NEW `backend/app/services/outbox.py`, exact content:
     ```python
     """Deferred-announce outbox for the webhook path (R3-M3).

     Mutate → commit → announce: handlers append async send closures while
     processing; the webhook drains them after the per-event commit. A crash
     between mutate and commit therefore announces nothing (no ghosts).
     Leaf module — imports nothing from app (no cycle risk).
     """
     import logging
     from typing import Awaitable, Callable

     logger = logging.getLogger(__name__)

     Outbox = list[Callable[[], Awaitable[None]]]


     def new_outbox() -> Outbox:
         return []


     async def drain_outbox(box: Outbox) -> None:
         """Send every deferred announcement; one failure never blocks the rest."""
         for send in box:
             try:
                 await send()
             except Exception as exc:
                 logger.error("Outbox announce failed: %s", exc)
     ```
  2. `message_handler.py`: add imports `from functools import partial`
     (top, stdlib group) and `from app.services.outbox import Outbox,
     drain_outbox, new_outbox`. Rename the existing L44
     `handle_message_event(event, db)` to
     `_handle_message_event_inner(event, db, box: Outbox)` and add this
     wrapper in its place:
     ```python
     async def handle_message_event(
         event: MessageEvent, db: AsyncSession, outbox: Outbox | None = None
     ):
         """Process an incoming LINE MessageEvent: persist, broadcast, and reply.

         When `outbox` is given (webhook path), announces are collected for
         the caller to drain after commit. When None (direct calls), the
         handler drains immediately — same sends, backward compatible.
         """
         if outbox is None:
             box = new_outbox()
             try:
                 await _handle_message_event_inner(event, db, box)
             except Exception:
                 box.clear()  # mutate failed: announce nothing
                 raise
             await drain_outbox(box)
         else:
             await _handle_message_event_inner(event, db, outbox)
     ```
     Inside `_handle_message_event_inner`, replace the send sites (body
     otherwise byte-identical):
     - L98-110 incoming WS broadcast → build the same dict as
       `incoming_payload`, then `box.append(partial(ws.broadcast_to_room,
       room_id, incoming_payload))`.
     - L112 → `box.append(partial(notify_admins_conversation_update,
       line_user_id, user, saved_message, text, db))`.
     - L118 `await line_svc.show_loading_animation(line_user_id)` →
       `box.append(partial(line_svc.show_loading_animation, line_user_id))`.
     - L120-127 handoff call: add `outbox=box` kwarg.
     - L130/L134/L139 command calls: add `outbox=box` kwarg.
     - L182-201 bot path → persist-then-collect:
       ```python
         if all_messages:
             for sent_message in all_messages:
                 m_type, m_content, m_payload = describe_line_message(sent_message)
                 await line_svc.save_message(
                     db=db,
                     line_user_id=line_user_id,
                     direction=MessageDirection.OUTGOING,
                     message_type=m_type,
                     content=m_content,
                     payload=m_payload,
                     sender_role="BOT",
                     commit=False,
                     user_id=user.id,
                 )

             async def _reply_all():
                 try:
                     await line_svc.reply_messages(event.reply_token, all_messages)
                 except Exception as e:
                     logger.error(f"Failed to send all messages: {e}")
                     await line_svc.reply_text(event.reply_token, "ขออภัย เกิดข้อผิดพลาดในการส่งข้อมูล")

             box.append(_reply_all)
       ```
       (`_reply_all` closes over `all_messages`/`event`/`line_svc`
       only — no loop variable. Save kwargs copied verbatim from
       L188-198.)
     - Non-text L222-235 broadcast + L237 notify: same dict-build +
       `box.append` treatment as the text branch.
  3. `commands.py`: add the same two imports. Each helper gains
     `outbox: Outbox | None = None` + `box = outbox if outbox is not
     None else []` as first line; every `await line_svc.reply_*`
     becomes `box.append(partial(line_svc.reply_*, ...))` with
     identical args (booking 2 sites L38/L41; status 3 sites
     L68/L72/L76; bind 5 sites L90/L110/L123/L153/L157 — including the
     `except` error-path replies); before each `return` that follows an
     append (status L69; bind L91/L111/L128) and at each function end,
     insert:
     ```python
         if outbox is None:
             await drain_outbox(box)
     ```
     (Booking has no early return — end-drain only.)
  4. `handoff_service.py` `check_handoff_keywords`: add imports + gain
     `outbox: Outbox | None = None` (+ `box = ...` first line); L129
     `initiate_handoff(...)` gains `outbox=box`; L136 error reply →
     `box.append(partial(line_service.reply_text, reply_token,
     "ขออภัย ไม่สามารถเชื่อมต่อเจ้าหน้าที่ได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง"))`
     (keep the local import of line_service; keep the surrounding
     try/except-pass); insert the drain-if-None block before
     `return True` (L130) and before `return False` (L139).
     (Type note: `line_service` is imported inside the method at L135 —
     `partial` captures the object at append time; fine.)
  5. `handoff.py` `initiate_handoff`: add imports + gain
     `outbox: Outbox | None = None` (+ `box = ...` as the very first
     statement for uniformity); L91 after-hours reply → append; L126
     greeting → append; L131 `await self._send_queue_flex_message(
     raw_line_id, queue_info)` → `box.append(partial(
     self._send_queue_flex_message, raw_line_id, queue_info))`;
     L134-151 telegram block → keep the `recent_msgs` read OUT of the
     fire-and-forget task (a task-side read would race the webhook
     loop's shared session and could run after close — G2 finding):
     read serially in `_spawn_telegram` (runs at drain time,
     post-commit, session open) and pass the loaded rows in:
     ```python
         async def _send_telegram(recent_msgs):
             try:
                 await telegram_service.send_handoff_notification(
                     user.display_name or "Unknown",
                     user.picture_url,
                     recent_msgs,
                     admin_url,
                     db
                 )
             except Exception as e:
                 logger.error(f"Failed to send Telegram handoff notification: {e}")

         async def _spawn_telegram():
             # Serial read at drain time (post-commit, session open):
             # never concurrent with the webhook loop's session use.
             recent_msgs = await self.get_recent_messages(raw_line_id, 3, db)
             task = asyncio.create_task(_send_telegram(recent_msgs))
             _background_tasks.add(task)
             task.add_done_callback(_background_tasks.discard)

         box.append(_spawn_telegram)
     ```
     (`admin_url` L135 stays where it is. Residual, pre-existing and
     NOT worsened: `send_handoff_notification` itself loads Telegram
     creds via `db` inside the task — same concurrency shape as
     before this change; hoisting it is out of scope.)
     Insert the drain-if-None block before `return session` at L106
     (after-hours path) and at L157 (main path). The L78/L122 returns
     have no prior appends — leave bare.
  6. `webhook.py`: add `from app.services.outbox import drain_outbox,
     new_outbox` (top imports). In `process_webhook_events`, replace
     L90-91 with:
     ```python
                 box = None
                 if isinstance(event, MessageEvent):
                     box = new_outbox()
                     await handle_message_event(event, db, box)
                 elif isinstance(event, PostbackEvent):
     ```
     and after L99 `await db.commit()` insert:
     ```python
                 if box is not None:
                     await drain_outbox(box)
     ```
     (On exception → rollback → box discarded, nothing announced. The
     existing error log covers the skip.) Update the L130 wrapper:
     ```python
     async def handle_message_event(event: MessageEvent, db: AsyncSession, outbox=None):
         """Thin wrapper — real logic in message_intake.message_handler."""
         await _handle_message_event_impl(event, db, outbox)
     ```
- **MIRROR:** `create_booking` commit-first comment
  (`liff_bookings.py:212-215`) — same principle, now on the webhook.
- **VALIDATE:** NEW `backend/tests/test_webhook_outbox.py` (pure mocks,
  local):
  1. `test_drain_sends_all_and_isolates_failures`: box of 3 AsyncMocks,
     middle raises → all awaited, no raise.
  2. `test_box_mode_collects_without_sending`: `box = []`;
     `handle_check_status("U1", "tok", db, outbox=box)` with resolve →
     None (no requests → the L68 "ไม่พบประวัติ" reply path); assert
     `reply_text` NOT awaited + `len(box) == 1`; then
     `await drain_outbox(box)` → awaited once.
     (Mocks: patch `app.services.message_intake.commands.resolve_by_line_id`
     — imported INSIDE the function (L48) → patch at source
     `app.services.user_identity_service.resolve_by_line_id`;
     `get_line_service` → patch
     `app.services.message_intake.commands.get_line_service`
     (imported into commands at L10) returning mock svc;
     `db.execute` → empty scalars.)
  3. `test_webhook_drains_after_commit_in_order`: patch
     `app.api.v1.endpoints.webhook.handle_message_event` (AsyncMock),
     `drain_outbox` (AsyncMock), Redis bits (mirror
     `test_webhook_deduplication.py` — `redis_client.exists` False,
     `set` True, `setex` ok), run `process_webhook_events([MessageEvent
     stub])` with AsyncSessionLocal patched to yield AsyncMock db;
     assert order: `handle_message_event` → `db.commit` →
     `drain_outbox` via a shared `mock_calls` record list.
     (MessageEvent stub: `SimpleNamespace(webhook_event_id="e1")` is
     NOT a MessageEvent — `isinstance` fails. Build a real
     `MessageEvent`: `MessageEvent(type="message",
     reply_token="t", source=UserSource(type="user", user_id="U1"),
     timestamp=1, mode="active", webhook_event_id="e1",
     delivery_context=DeliveryContext(is_redelivery=False),
     message=TextMessageContent(type="text", id="m1", text="hi"))` —
     verify constructor names against linebot v3 types at implement
     (mirror any existing webhook test that builds one, else read the
     SDK types). If construction proves brittle, patch
     `app.api.v1.endpoints.webhook.MessageEvent` with a stub class and
     pass an instance of it.)
  4. `test_webhook_skips_drain_when_handler_raises`: same harness as
     test 3 but `handle_message_event` raises → assert `db.rollback`
     awaited + `drain_outbox` NOT awaited. (Documents the intended
     save-failure semantics: a failed mutate rolls back AND announces
     nothing — previously the reply was already sent (ghost).)
  5. `test_wrapper_clears_box_on_inner_failure`: patch
     `app.services.message_intake.message_handler._handle_message_event_inner`
     (AsyncMock raising `RuntimeError("boom")`) + patch
     `app.services.message_intake.message_handler.drain_outbox`
     (AsyncMock) → `await handle_message_event(event_stub,
     AsyncMock())` raises `RuntimeError` + `drain_outbox` NOT awaited.
     (`event_stub` anything — inner never runs; `db` AsyncMock. Pins
     the wrapper's `except: box.clear(); raise` for direct callers —
     G2 round-2 finding.)
  - Update `tests/test_handoff_service.py:53` (REQUIRED — the new
    kwarg breaks the pin): `initiate_handoff.assert_awaited_once_with(
    user, "reply-token", ANY, commit=True)` →
    `initiate_handoff.assert_awaited_once_with(user, "reply-token",
    ANY, commit=True, outbox=ANY)`.
  Run the new file + `tests/test_booking_flex.py` +
  `tests/test_phone_bind_bounds.py` + `tests/test_handoff_service.py`
  + `tests/test_live_chat_service.py` (exercises `initiate_handoff`
  directly) + `tests/test_webhook_deduplication.py` +
  `tests/test_webhook_signature.py` (all green; only the L53 assertion
  changes).

### T3 — get_or_create_user: savepoint the insert, never roll back the caller (R3-M5)
- **ACTION:** Scope the create-race guard to a nested transaction so the
  caller's prior writes survive.
- **Root cause:** `except IntegrityError: await db.rollback()` discards
  the whole transaction incl. other callers' pending work.
- **Regression risk:** LOW — race path only; happy path byte-identical
  (flush → optional commit → refresh).
- **IMPLEMENT:** in `backend/app/services/friend_service.py`, replace
  L45-62 (`populate_surrogate(user, ...)` … `return user`) with exactly:
  ```python
      populate_surrogate(user, line_user_id)
      try:
          async with db.begin_nested():
              # add INSIDE the savepoint (mirror _add_open_session):
              # after a savepoint rollback the object is expunged, so the
              # re-resolve below cannot re-emit the INSERT via autoflush.
              # (add-outside would re-raise inside the handler and poison
              # the caller's session — G2 finding, empirically probed.)
              db.add(user)
              await db.flush()
      except IntegrityError:
          # Lost the create race: only the savepoint rolled back — the
          # caller's prior writes are untouched. Re-resolve the winner.
          user = await resolve_by_line_id(db, line_user_id)
          if user is None:
              raise RuntimeError(
                  f"Race condition: user creation for {line_user_id} conflicted "
                  "but re-resolution found no user. Retry the request."
              ) from None
          return user
      if commit:
          await db.commit()
          await db.refresh(user)
      return user
  ```
  (No new imports: `IntegrityError` L3, `resolve_by_line_id` L21
  already present. `begin_nested` auto-begins an outer transaction when
  none is active — safe for both `commit=True/False` callers.)
- **MIRROR:** `_add_open_session` (`live_chat_service/handoff.py:25-53`)
  — same savepoint + re-resolve shape, incl. the re-raise/return discipline.
- **VALIDATE:** NEW `backend/tests/test_get_or_create_user_race.py` (pure
  mocks, local). `resolve_by_line_id`, `populate_surrogate`, and
  `get_line_bot_api` are all imported INSIDE the method → patch at
  source (`app.services.user_identity_service.*`,
  `app.core.line_client.get_line_bot_api`):
  ```python
  """Create-race must not roll back the caller's transaction (R3-M5)."""
  from types import SimpleNamespace
  from unittest.mock import AsyncMock, MagicMock, Mock, patch

  import pytest
  from sqlalchemy.exc import IntegrityError

  from app.services.friend_service import friend_service


  def _db_with_nested(flush_effect=None):
      db = AsyncMock()
      db.add = MagicMock()  # real Session.add is sync (avoids un-awaited warnings)
      nested = AsyncMock()
      nested.__aenter__ = AsyncMock(return_value=None)
      nested.__aexit__ = AsyncMock(return_value=False)
      db.begin_nested = Mock(return_value=nested)
      if flush_effect is not None:
          db.flush = AsyncMock(side_effect=flush_effect)
      return db, nested


  @pytest.mark.asyncio
  async def test_race_re_resolves_without_full_rollback():
      db, nested = _db_with_nested()
      order: list[str] = []
      nested.__aenter__.side_effect = lambda *a, **k: order.append("enter")
      db.add.side_effect = lambda *a, **k: order.append("add")

      async def _flush(*a, **k):
          order.append("flush")
          raise IntegrityError("stmt", {}, Exception("dup"))

      db.flush = _flush
      winner = SimpleNamespace(id=9)
      profile = SimpleNamespace(display_name="N", picture_url=None)
      api = SimpleNamespace(get_profile=AsyncMock(return_value=profile))
      with patch("app.services.user_identity_service.resolve_by_line_id",
                 new=AsyncMock(side_effect=[None, winner])), patch(
                     "app.services.user_identity_service.populate_surrogate"), patch(
                         "app.core.line_client.get_line_bot_api", return_value=api):
          assert await friend_service.get_or_create_user("U1", db) is winner
      db.begin_nested.assert_called_once()
      db.rollback.assert_not_awaited()
      db.commit.assert_not_awaited()
      # add-inside-savepoint ordering (G2 finding): with add-outside the
      # order would be ["add", "enter", "flush"] and the re-resolve would
      # re-emit the INSERT via autoflush.
      assert order == ["enter", "add", "flush"]


  @pytest.mark.asyncio
  async def test_happy_path_still_commits_and_refreshes():
      db, _nested = _db_with_nested()
      profile = SimpleNamespace(display_name="N", picture_url=None)
      api = SimpleNamespace(get_profile=AsyncMock(return_value=profile))
      with patch("app.services.user_identity_service.resolve_by_line_id",
                 new=AsyncMock(return_value=None)), patch(
                     "app.services.user_identity_service.populate_surrogate"), patch(
                         "app.core.line_client.get_line_bot_api", return_value=api):
          user = await friend_service.get_or_create_user("U1", db)
      assert user.display_name == "N"
      db.commit.assert_awaited_once()
      db.refresh.assert_awaited_once()
  ```
  - DB race test (runs local 5434 + CI 5432; `test_client` fixture
    for fail-fast; forces a REAL IntegrityError at flush with REAL
    pending prior work — the only test that pins the session
    semantics):
    ```python
    @pytest.mark.asyncio
    async def test_race_keeps_prior_pending_work_db(test_client):
        from sqlalchemy import delete

        from app.db.session import AsyncSessionLocal
        from app.models.user import User
        from app.services import user_identity_service as ident
        from tests.identity_helpers import create_line_user

        raw = f"UT3RACE{uuid4().hex[:12]}"
        async with AsyncSessionLocal() as seed_db:
            winner = await create_line_user(seed_db, raw, display_name="Winner")
            await seed_db.commit()
            winner_id = winner.id

        profile = SimpleNamespace(display_name="Racer", picture_url=None)
        api = SimpleNamespace(get_profile=AsyncMock(return_value=profile))
        real_resolve = ident.resolve_by_line_id
        calls = []

        async def _flaky_resolve(db, raw_id):
            calls.append(1)
            if len(calls) == 1:
                return None  # force the race path: miss, then flush conflicts
            return await real_resolve(db, raw_id)

        async with AsyncSessionLocal() as db:
            prior = User(display_name="prior-uncommitted")
            db.add(prior)
            with patch.object(ident, "resolve_by_line_id", new=_flaky_resolve), patch(
                "app.core.line_client.get_line_bot_api", return_value=api
            ):
                # commit=False: caller still owns the transaction.
                user = await friend_service.get_or_create_user(raw, db, commit=False)
            assert user.id == winner_id
            # prior in db (NOT db.new): the savepoint-entry flush moves
            # prior to persistent — `in db.new` is False in BOTH shapes
            # (G2 round-2 probe). `in db` discriminates: True=fixed,
            # False=old (rollback evicts).
            assert prior in db  # prior work NOT rolled back (the fix)
            await db.commit()  # session healthy: commit succeeds
            prior_id = prior.id
            assert prior_id is not None

        async with AsyncSessionLocal() as db:
            await db.execute(delete(User).where(User.id.in_([winner_id, prior_id])))
            await db.commit()
    ```
    (Needs `from uuid import uuid4` at top; `SimpleNamespace` +
    `AsyncMock` imports.
    `populate_surrogate` runs REAL (conftest sets a test
    ENCRYPTION_KEY — verified) producing the duplicate hash that
    conflicts with the seeded winner at flush. With the old
    add-outside shape this test ERRORS (IntegrityError re-raised
    inside the handler); with full-rollback it FAILS (`prior`
    evicted). Cleanup deletes in `finally`-equivalent trailing
    block — on assertion failure rows leak; acceptable on the
    dedicated test DB, and ids are nonce-unique so leaks never
    collide with other tests.)
  - Rewrite `tests/test_user_identity.py::test_concurrent_create_race_integrity_error`
    (L183-226) to the savepoint contract (REQUIRED — it pins the old
    commit-then-rollback shape): `mock_db.flush` raises IntegrityError
    (instead of `commit`); add the `begin_nested` CM stub (copy
    `_db_with_nested`'s nested setup); assert `user is existing_user`
    + `mock_db.rollback.assert_not_awaited()`. Keep the surrounding
    MonkeyPatch/line_id_hash/encrypt scaffolding byte-identical.
  Run the new file + `tests/test_user_identity.py`.

### T4 — mask LINE IDs on get/create/update + CSV/PDF exports (R3-M7)
- **ACTION:** Apply the list endpoint's role-based masking rule to the
  three single-user endpoints and both export formats (PRD decision D1).
- **Root cause:** get/create/update return raw decrypted IDs; CSV/PDF +
  display-name fallback leak raw IDs into downloads.
- **Regression risk:** LOW — SUPER_ADMIN/ADMIN (the only roles holding
  these permissions by default) see byte-identical output; other roles
  see masked values (intended).
- **IMPLEMENT:**
  1. `admin_users.py` (mask helper already imported, L13; `current_admin`
     in scope at all three sites — L337/L362/L428): wrap the three
     return lines (L352, L417, L534 — identical text) with:
     ```python
             line_user_id=mask_line_id(
                 decrypt_user_line_id(user) if user.line_user_id_encrypted else None,
                 current_admin.role,
             ),
     ```
     (`mask_line_id(None, role)` returns None — L18-19 of pii_masking —
     so the guard expression stays valid inside.)
  2. `admin_export.py`: add `from app.core.pii_masking import
     mask_line_id` after L26 (no name clash — verified no other mask
     import in this file).
     - `_display_name(user, line_user_id)` (L89) gains `role`:
       ```python
       def _display_name(user: Optional[User], line_user_id: str, role) -> str:
           if user and user.display_name:
               return user.display_name
           return mask_line_id(line_user_id, role)
       ```
     - `_iter_csv_rows(line_user_id, db)` (L105) gains `role`; L124 cell
       `line_user_id,` → `mask_line_id(line_user_id, role),`.
     - CSV endpoint (L134-152): rename `_current_user` → `current_user`;
       L145 → `_display_name(user, line_user_id, current_user.role)`;
       L149 → `_iter_csv_rows(line_user_id, db, current_user.role)`.
     - `_build_conversation_pdf` (L210): gains `role` param (4th,
       keyword); L226 → `f"LINE User ID:
       {mask_line_id(line_user_id, role)}"`. PDF endpoint (L155-189):
       rename `_current_user` → `current_user`; L180 →
       `_display_name(user, line_user_id, current_user.role)`; L184-186
       `to_thread` call gains `role=current_user.role`.
- **MIRROR:** `list_users` masking (`admin_users.py:237-240`) — same
  helper, same policy.
- **VALIDATE:**
  - Extend `backend/tests/test_admin_users.py` (direct endpoint calls,
    local, no TestClient): patch
    `app.api.v1.endpoints.admin_users.decrypt_user_line_id` →
    `"U1234567890abcdef1234567890abcdef"`; user row namespace needs
    `id/username/email/display_name/picture_url/role/is_active/
    line_user_id_encrypted/created_at/updated_at` (mirror UserOut
    construction L344-355; role=USER so an AGENT caller passes
    `_check_role_permission` on update — verified helper semantics).
    `get_user(9, db, agent_admin)` → `line_user_id == "U12***ef"`;
    same with ADMIN caller → full raw ID. `update_user(9,
    UserUpdateRequest(display_name="N"), db, agent_admin)` →
    masked (mock `create_audit_log` in module + commit/refresh).
    `create_user(UserCreateRequest(...), db, admin)` → full (new staff
    users have no encrypted ID → None; assert None — documents the
    no-op) with `db.add = MagicMock(side_effect=lambda u: setattr(u,
    "id", 7))` — REQUIRED: the endpoint builds `User(...)` internally
    (L384) and mocked flush/refresh never assign `id`, so `UserOut`
    (required `id: int`, L36) would raise ValidationError without the
    stub (G2 round-3 finding). Import request schemas from
    `app.api.v1.endpoints.admin_users`.
  - Extend `backend/tests/test_admin_analytics_export_endpoints.py`
    (TestClient streaming style of the CSV test, L56-110): ADMIN CSV →
    raw `U...` cell present; AGENT CSV → masked cell + no raw ID
    anywhere in the body (override `deps.get_current_user` → AGENT
    namespace AND patch `app.core.permissions.can` → True so the
    export gate passes — `can` is imported inside the dep at
    `deps.py:249`, so patch at source). PDF endpoint (AGENT): patch
    `app.api.v1.endpoints.admin_export._build_conversation_pdf` with
    `Mock(return_value=b"%PDF-fake")` capturing args (it runs via
    `to_thread` — module attr lookup at call time, patchable; the
    bytes return keeps `Response` from 500ing — G2 finding) →
    assert the captured `role` kwarg equals the AGENT role (the
    builder masks inside — asserting a masked positional id would
    contradict the specified implementation — G2 finding). Carry
    the file's reportlab skipif (copy L141-144 verbatim) like the
    existing PDF tests. (reportlab 4.4.10 verified installed in
    venv_win — the test runs locally.)
  - PDF builder unit test (direct call, no TestClient):
    `_build_conversation_pdf("U1234567890abcdef", "Ann", [msg],
    role=UserRole.AGENT)` with `msg` namespace
    (`created_at=datetime`, `direction="INCOMING"`,
    `sender_role="USER"`, `message_type="text"`, `content="hi"` —
    all fields the loop reads, verified L236-242) + patch
    `reportlab.pdfgen.canvas.Canvas.drawString` (plain Mock
    capturing strings) → assert a captured string equals
    `"LINE User ID: U12***ef"`; same call with `role=ADMIN` → raw
    id drawn. (Proves builder-side masking without parsing PDF
    bytes.) Carry the same skipif. `UserRole` import from
    `app.models.user`.
  - Also add `_display_name` unit asserts (fallback masked for AGENT,
    full for ADMIN, display name preferred regardless of role).

### T5 — cap LINE media persist at 50 MB with a skip path (R3-M8)
- **ACTION:** Enforce PRD decision D2: named constant + oversize skip
  that records size + reason (message still saved, never a crash).
- **Root cause:** unbounded download buffered and written to disk on the
  webhook path.
- **Regression risk:** LOW — cap is 5× the largest in-repo upload cap
  and only triggers on payloads no legitimate LINE message produces;
  callers already tolerate `url: None`.
- **IMPLEMENT:** in `backend/app/services/line_service.py`:
  1. After `logger = ...` (L33), add:
     ```python
     MAX_LINE_MEDIA_BYTES = 50 * 1024 * 1024  # 50 MB (R3-M8 decision D2: generous; LINE video can be large)
     ```
  2. In `persist_line_media`, after the empty-data early return
     (L332-334), insert:
     ```python
         if len(data) > MAX_LINE_MEDIA_BYTES:
             logger.warning(
                 "LINE media %s too large (%d bytes) — skipping persist",
                 message_id, len(data),
             )
             return {
                 "url": None,
                 "preview_url": None,
                 "content_type": content_type,
                 "size": len(data),
                 "file_name": None,
                 "skipped": "too_large",
             }
     ```
     (Shape mirrors the success dict L375-381 + a `skipped` marker;
     callers use `.get()` — verified `media_extraction.py`.)
  3. Cap the image-preview download too (same function, same class —
     G2 finding): in the preview block (L366-373), after
     `preview_data, preview_ct = ...`, insert:
     ```python
             if preview_data and len(preview_data) > MAX_LINE_MEDIA_BYTES:
                 logger.warning(
                     "LINE media %s preview too large (%d bytes) — skipping preview",
                     message_id, len(preview_data),
                 )
                 preview_data = None
     ```
     (Preview skipped independently — the main payload still
     persists. Indent: inside `if media_type == "image":`.)
  4. Propagate the marker into persisted payloads (PRD D2 requires
     "payload records size + skip reason" — without this the
     `skipped` key is dropped by the builders — G2 finding): in
     `media_extraction.py`, add `"skipped": media.get("skipped"),`
     to the image (L19-25), file (L45-51), and video/audio (L58-63)
     payload dicts. (The no-id fallback dicts lack the key —
     `.get()` yields None; leave them.)
- **MIRROR:** `MAX_UPLOAD_BYTES` + `len(content)` check
  (`media.py:42,265`).
- **VALIDATE:** NEW `backend/tests/test_line_media_size_cap.py` (pure
  mocks, local):
  ```python
  """LINE media persist enforces MAX_LINE_MEDIA_BYTES with a skip path (R3-M8)."""
  from unittest.mock import AsyncMock, patch

  import pytest

  from app.services import line_service as line_service_mod
  from app.services.line_service import LineService


  def test_cap_is_the_documented_product_decision():
      assert line_service_mod.MAX_LINE_MEDIA_BYTES == 50 * 1024 * 1024


  @pytest.mark.asyncio
  async def test_oversized_media_skips_persist_but_records_size(monkeypatch):
      monkeypatch.setattr(line_service_mod, "MAX_LINE_MEDIA_BYTES", 10)
      svc = LineService()
      with patch.object(LineService, "download_message_content",
                         new=AsyncMock(return_value=(b"x" * 11, "video/mp4"))), patch(
                             "asyncio.to_thread", new=AsyncMock()) as mock_write:
          result = await svc.persist_line_media(message_id="m1", media_type="video")
      assert result["url"] is None
      assert result["size"] == 11
      assert result["skipped"] == "too_large"
      assert result["content_type"] == "video/mp4"
      mock_write.assert_not_called()


  @pytest.mark.asyncio
  async def test_empty_download_keeps_existing_shape():
      svc = LineService()
      with patch.object(LineService, "download_message_content",
                         new=AsyncMock(return_value=(b"", None))):
          result = await svc.persist_line_media(message_id="m1", media_type="image")
      assert result["url"] is None and result["size"] is None


  @pytest.mark.asyncio
  async def test_oversized_preview_skipped_independently(monkeypatch):
      monkeypatch.setattr(line_service_mod, "MAX_LINE_MEDIA_BYTES", 10)
      svc = LineService()
      with patch.object(LineService, "download_message_content",
                         new=AsyncMock(side_effect=[
                             (b"a" * 5, "image/jpeg"),
                             (b"b" * 11, "image/jpeg"),
                         ])), patch("asyncio.to_thread", new=AsyncMock()):
          result = await svc.persist_line_media(message_id="m1", media_type="image")
      assert result["url"] is not None  # main payload persists
      assert result["preview_url"] is None  # oversized preview skipped
      assert "skipped" not in result  # main-path marker untouched


  @pytest.mark.asyncio
  async def test_skipped_marker_propagates_to_image_payload():
      from types import SimpleNamespace

      from app.services.message_intake import media_extraction as me_mod

      line_svc = SimpleNamespace(persist_line_media=AsyncMock(return_value={
          "url": None, "preview_url": None, "content_type": "video/mp4",
          "size": 999, "file_name": None, "skipped": "too_large",
      }))
      with patch.object(me_mod, "get_line_service", return_value=line_svc):
          mtype, content, payload = await me_mod.extract_non_text_message(
              SimpleNamespace(type="image", id="m1")
          )
      assert mtype == "image" and content == "[Image]"
      assert payload["url"] is None
      assert payload["size"] == 999
      assert payload["skipped"] == "too_large"
  ```
  (`patch.object` on the class works — verified `class LineService`
  at L79. `asyncio.to_thread` is the only write path — L359/L371.
  `get_line_service` imported into `media_extraction` at L2 — patch
  at `app.services.message_intake.media_extraction.get_line_service`.
  The file/video builders get the identical one-line `.get()` —
  review-verified, pinned by mechanism via the image test.)
  Run the new file.

### T6 — throttle the 4 LIFF booking GETs with a SEPARATE read bucket (R3-M12)
- **ACTION:** Attach a read-scoped limiter to the GETs so limited
  requests 429 before the per-hit LINE verify — WITHOUT consuming the
  tight submit budget.
- **Root cause:** GETs skip the limiter; every hit burns a live LINE
  verify call.
- **Regression risk:** LOW — with the separate bucket: clean browsing
  (5–6 hits/session) fits the 60/60 read budget 10× over; submits
  keep their dedicated 5/300 bucket untouched. (Sharing the submit
  bucket — the round-3-and-earlier shape — would 429 legitimate
  submits after normal browsing: 6 hits > 5 budget. G2 round-3
  finding.)
- **IMPLEMENT:**
  1. `backend/app/core/config.py`: after L101, add:
     ```python
     LIFF_BOOKING_READ_RATE_LIMIT: int = 60     # Booking read (options/availability) hits per window
     LIFF_BOOKING_READ_RATE_WINDOW: int = 60    # seconds
     ```
     (60/60: generous for browsing (5–6 hits/session), tight enough
     to bound LINE-verify burn — each read still costs a live LINE
     call. Sits between WS 30/60 and PUBLIC_FILE 120/60 — verified
     L92-93/L104-105. Env-overridable like all settings.)
  2. `liff_bookings.py`: after `_submit_rate_limit` (L53-59), add:
     ```python
     _read_rate_limit = Depends(
         http_rate_limit(
             "liff-booking-read",
             max_events=settings.LIFF_BOOKING_READ_RATE_LIMIT,
             window_seconds=settings.LIFF_BOOKING_READ_RATE_WINDOW,
         )
     )
     ```
     Add `dependencies=[_read_rate_limit],` inside each of the 4 GET
     decorators, after the `summary=` line: `/options` (L76-80),
     `/availability` (L94-98), `/availability/range` (L129-133),
     `/me` (L224-228). (Decorator deps run before parameter deps, so
     the 429 fires before `require_line_user_id`'s LINE call — same
     ordering the POST routes already rely on. Writes keep
     `_submit_rate_limit` untouched.)
- **MIRROR:** `media.py:62-71` (one bucket per scope across routes —
  `media-upload` vs `public-file`) + POST/PATCH attach style
  (L174, L247, L278).
- **VALIDATE:** NEW `backend/tests/test_liff_bookings_ratelimit.py`
  (TestClient direct — no `test_client` fixture, so no DB probe;
  mirror `test_auth_login_ratelimit.py`):
  - 429 test, parametrized over the 4 GET paths
    (`/api/v1/liff/bookings/options`,
    `/api/v1/liff/bookings/availability?service_type=x&date=2026-01-15`,
    `/api/v1/liff/bookings/availability/range?service_type=x&from=2026-01-15&to=2026-01-16`,
    `/api/v1/liff/bookings/me`): patch
    `app.core.http_rate_limit.redis_client.fixed_window_allow` →
    False + patch
    `app.api.v1.endpoints.liff_bookings.verify_liff_token`
    (AsyncMock) → assert 429 + `Retry-After` header +
    `verify_liff_token` NOT awaited + bucket key startswith
    `ratelimit:liff-booking-read:`.
    (`fixed_window_allow` is looked up on the `redis_client` object
    imported into `http_rate_limit` — patch
    `app.core.http_rate_limit.redis_client.fixed_window_allow` via
    `patch.object`. Note: `/availability/range` 422-vs-429 order —
    decorator deps precede the handler body, so 429 wins; the test
    pins that.)
  - Bucket-separation test (no HTTP): assert the read and write
    limiters carry different scopes —
    `liff_bookings._read_rate_limit.dependency.__rate_limit_scope__
    == "liff-booking-read"` and `!=
    liff_bookings._submit_rate_limit.dependency.__rate_limit_scope__`
    (`__rate_limit_scope__` set by the factory — verified
    `http_rate_limit.py:95`). Pins the G2 round-3 fix structurally:
    reads can never consume the submit budget.
  - Allow-path test: `fixed_window_allow` → True, `verify_liff_token`
    → `"U1"`, override `app.db.session.get_db` (verified import at
    liff_bookings L18) with a stub yield, patch
    `app.api.v1.endpoints.liff_bookings.load_booking_config` →
    namespace `(enabled=True, service_types=("ปรึกษากฎหมาย",),
    advance_days=3, blackout_dates=[])` → GET `/options` WITH
    `headers={"x-liff-id-token": "t"}` (the header is REQUIRED —
    `require_line_user_id` 401s without it, verified L62-66; the
    patched `verify_liff_token` accepts any value — G2 round-2
    finding) → 200 with `service_types` list (proves clean traffic
    unblocked).
  Run the new file.

### T7 — send_message returns the persisted payload; callers drop re-fetch (R3-M18)
- **ACTION:** Return the row instead of discarding it; HTTP + WS callers
  use it (WS preserves its `temp_id` stamping).
- **Root cause:** service returns `{"success": True}`, forcing both
  callers to re-read the row they just wrote.
- **Regression risk:** MEDIUM — return-shape change across HTTP+WS.
  Mitigated by: media-twin precedent (same key, same builder); HTTP
  fallback only checks `res.ok` (verified `useMessageFlow.ts:215`);
  existing `test_session_claim.py` send test updated in this task;
  WS payload asserted byte-equal incl. `temp_id`.
- **IMPLEMENT:**
  1. `messaging.py` L87 `return {"success": True}` →
     ```python
         return {
             "success": True,
             "message": message_payload_dict(saved, line_user_id=line_user_id),
         }
     ```
     (`message_payload_dict` imported L14; `saved` is refreshed on
     both `save_message` branches — verified `line_service.py:294-299`;
     the `delivery_status` payload mutation is included.)
  2. `admin_live_chat.py` send endpoint L163-174 → replace the re-fetch
     block with:
     ```python
     result = await live_chat_service.send_message(
         line_user_id, request.text, current_user.id, db
     )
     await db.commit()
     sent_message = result.get("message") or {}
     if sent_message:
         await _broadcast_conversation_update(
             line_user_id=line_user_id,
             db=db,
             message_payload=sent_message,
         )
     return result
     ```
     (Response gains the additive `message` key — same contract as the
     media endpoint L217. `_message_payload_from_record` (L56-57) has
     exactly one caller (L172 — verified by repo-wide grep) → DELETE
     the helper with this change.)
  3. `ws_session/handlers.py` L149-156 →
     ```python
             result = await svc.send_message(line_user_id, text, admin_id_int, db)
             await db.commit()
             committed = True
             sent_message = result.get("message") or {}
             if sent_message:
                 msg_data = dict(sent_message)
                 msg_data["temp_id"] = temp_id
     ```
     (Rest of the block L157+ unchanged. `message_payload_dict` has no
     other use in this file (L154 was the only call — verified by
     repo-wide grep) → REMOVE the now-unused import at L22.)
- **MIRROR:** `send_media_message` return (`messaging.py:181-184`) —
  same dict, same builder, same callers pattern.
- **VALIDATE:**
  - NEW `backend/tests/test_send_message_payload.py` (pure mocks,
    local): `LiveChatService()` + patch.object
    `_require_active_session_owner` (AsyncMock session namespace:
    `id/user_id/message_count/last_activity_at/first_response_at`
    — needs `session.user_id`, `message_count += 1` → int,
    `first_response_at` None → triggers `get_sla_service()` — patch
    `app.services.live_chat_service.messaging.get_sla_service`
    (imported into messaging at L19) with a mock whose
    `check_frt_on_first_response` is AsyncMock); operator select:
    `db.execute` side_effect list — [operator-result, guard-result]
    where operator-result `.scalar_one_or_none()` → namespace
    display_name; guard-result `.rowcount` → 1; patch
    `app.services.live_chat_service.messaging.line_service` (imported
    into messaging at L15) with a Mock: `save_message` AsyncMock →
    saved namespace (must validate as MessageResponse — verified
    schema `message.py:15-27`: `id/direction/message_type/content/
    payload/created_at(datetime)/sender_role/operator_name`; plain
    "OUTGOING"/"ADMIN" strings validate for the str-enums),
    `push_messages` AsyncMock; patch
    `app.services.live_chat_service.messaging.resolve_by_line_id` →
    user namespace (last_message_at settable). Assert:
    `result["success"] is True`,
    `result["message"]["content"] == "hi"`,
    `result["message"]["line_user_id"] == "U1"`,
    `result["message"]["payload"] == {"delivery_status": "sent"}`
    (mode="json" dump preserves the dict).
  - WS caller test in the same file: patch
    `app.services.ws_session.handlers.get_live_chat_service` →
    mock svc (`send_message` → `{"success": True, "message":
    {"id": 5, "content": "hi", "created_at": "2026-01-01T00:00:00",
    ...}}`; `get_recent_messages` AsyncMock — assert NOT awaited);
    patch `get_ws_manager` (AsyncMocks), `get_ws_health_monitor`
    (record noop), `get_resolve_by_line_id` → factory Mock returning
    `AsyncMock(return_value=None)` (i.e. `get_resolve_by_line_id`
    itself patched with `Mock(return_value=AsyncMock(
    return_value=None))` — the handler CALLS the returned function;
    patching the factory with bare None would throw TypeError — G2
    finding; unknown-user path is still safe via the `if chat_user`
    guard at L175-177);
    `get_notify_admins_message_sent` AsyncMock; patch
    `app.services.ws_session.handlers.AsyncSessionLocal` to yield
    AsyncMock db; websocket AsyncMock.
    `await handle_send_message(websocket, 7, {"text": "hi",
    "temp_id": "t1"}, "conversation:U1", "ts", 0.0)` →
    `svc.get_recent_messages` NOT awaited; `ws.send_personal`
    payload `msg_data["temp_id"] == "t1"` and `content == "hi"`.
    (`SendMessagePayload` requires text 1..5000 — verified schema.)
  - Update `test_session_claim.py::test_send_message_rest_broadcasts_message_and_conversation_update`
    (L205-284) in THIS task (message half): import
    `message_payload_dict` from `app.schemas.message` at top;
    mock_send return → `{"success": True, "message":
    message_payload_dict(message,
    line_user_id="Uabcdef0123456789abcdef0123456789")}` (the `message`
    namespace L208-218 validates — id/direction-string/content/
    message_type/payload/sender_role-string/operator_name/created_at
    all present ✓); L268 → `assert response.json()["success"] is
    True` + `assert response.json()["message"]["content"] == "hello"`;
    L270 → `mock_recent.assert_not_awaited()`. (mock_detail stays
    until T8.)
  - Run the new file + `tests/test_session_claim.py` +
    `tests/test_live_chat_service.py` + `tests/test_websocket.py`.

### T8 — lightweight conversation identity for broadcast/read/media paths (R3-M17)
- **ACTION:** One-query identity lookup replaces full-detail loads where
  only 3 fields (or existence) are needed.
- **Root cause:** broadcast/read/media paths pay ~6 queries + 50
  messages for display_name/picture_url/chat_mode.
- **Regression risk:** LOW — read-only shape change internal to 3 call
  sites; None semantics preserved (identity None ⟺ detail None, both
  keyed on `resolve_by_line_id`).
- **IMPLEMENT:**
  1. `conversations.py`: add before `get_conversation_detail` (L295):
     ```python
         async def get_conversation_identity(self, line_user_id: str, db: AsyncSession):
             """Display identity for broadcast/sidebar paths (1 query, no messages).

             Lightweight alternative to get_conversation_detail for callers
             needing only display_name/picture_url/chat_mode (or a None
             existence check). Mirrors the WS send path.
             """
             user = await resolve_by_line_id(db, line_user_id)
             if not user:
                 return None
             return {
                 "display_name": user.display_name,
                 "picture_url": user.picture_url,
                 "chat_mode": user.chat_mode or "BOT",
             }
     ```
     (`resolve_by_line_id` already imported — used at L297.)
  2. `admin_live_chat.py`:
     - `_broadcast_conversation_update` L65: `detail = await
       live_chat_service.get_conversation_detail(line_user_id, db)` →
       `identity = await
       live_chat_service.get_conversation_identity(line_user_id, db)`;
       L68-70 `detail[...]` → `identity[...]` (fallback logic
       byte-identical).
     - `mark_conversation_read` L111-113: `detail = ...detail...` →
       `identity = ...Identity...`; `if not detail:` → `if not
       identity:`.
     - `send_media` L204-209: same swap as `_broadcast` (L204 fetch +
       L207-209 refs).
- **MIRROR:** WS send path identity lookup
  (`ws_session/handlers.py:170-177`) — single resolve + direct fields.
- **VALIDATE:**
  - NEW `backend/tests/test_conversation_identity.py` (pure mocks,
    local):
    - service: patch
      `app.services.live_chat_service.conversations.resolve_by_line_id`
      → user namespace / None → assert dict fields / None.
    - `_broadcast_conversation_update` wiring: patch
      `app.api.v1.endpoints.admin_live_chat.live_chat_service.get_conversation_identity`
      (AsyncMock → identity dict) +
      `...get_conversation_detail` (AsyncMock — assert NOT awaited) +
      `app.api.v1.endpoints.admin_live_chat.notify_admins_message_sent`
      (AsyncMock) → `await _broadcast_conversation_update("U1",
      AsyncMock(), {"content": "hi", "created_at": "ts"})` → notify
      awaited with display fields; detail NOT awaited.
      (Patch targets verified: `live_chat_service` L10-15,
      `notify_admins_message_sent` L38, both imported into the
      endpoint module.)
    - mark_read: direct call `mark_conversation_read("U1",
      ReadConversationRequest(), db, user)` (import
      `ReadConversationRequest` from `app.schemas.live_chat`) with
      identity → None → 404; identity → dict + patched
      `app.api.v1.endpoints.admin_live_chat.ws_manager.mark_conversation_read`
      → 200. (Covers the existence-check swap.)
  - Update `test_session_claim.py` in THIS task (identity half):
    L205-test: replace the `get_conversation_detail` patch (L236-242)
    with `get_conversation_identity` returning the SAME dict
    (assert awaited once) + keep a `get_conversation_detail`
    AsyncMock patch asserting NOT awaited; L287-test + L327-test:
    swap patch target `...get_conversation_detail` →
    `...get_conversation_identity` (return value unchanged —
    truthiness only).
  - Run the new file + `tests/test_session_claim.py` +
    `tests/test_conversation_detail_last_message.py` (detail method
    itself untouched — must stay green).

### T9 — inbox message windows become index-driven DISTINCT ON (R3-M19)
- **ACTION:** Replace the two full-table `row_number()` windows with
  `DISTINCT ON (user_id)` over the existing composite index.
- **Root cause:** unfiltered windows sort the whole Message table per
  inbox load.
- **Regression risk:** MEDIUM — SQL rewrite on the inbox query.
  Mitigated by: same winner per user (newest by created_at; ties now
  deterministically newest-id — documented micro-change mirroring the
  M14 tiebreak philosophy); session window untouched; NULL-user rows
  still never join (equality join, unchanged); DB equivalence test.
- **IMPLEMENT:** in `conversations.py`:
  1. Replace L112-124 (latest-message window — keep L125's aliased
     line; dropping it would NameError at the joins — G2 finding) with:
     ```python
         # 2. Latest message per user — DISTINCT ON over
         # ix_messages_user_created(user_id, created_at DESC): same winner
         # per user as the row_number() window, index-driven instead of a
         # full-table sort. (NULL-user_id rows form their own group exactly
         # as before and still never join.)
         latest_message_subquery = (
             select(Message)
             .distinct(Message.user_id)
             .order_by(Message.user_id, desc(Message.created_at), desc(Message.id))
             .subquery()
         )
     ```
     (L125 `latest_message = aliased(Message, latest_message_subquery)`
     stays verbatim. Step 2's replacement likewise keeps L143.)
  2. Replace L130-142 (latest-incoming window) with:
     ```python
         latest_incoming_subquery = (
             select(Message)
             .distinct(Message.user_id)
             .where(Message.direction == MessageDirection.INCOMING)
             .order_by(Message.user_id, desc(Message.created_at), desc(Message.id))
             .subquery()
         )
     ```
  3. L155-168 joins: drop the two `latest_*_subquery.c.rn == 1`
     conjuncts (keep the `child_join_condition`s; keep the session
     join + its `rn == 1` untouched).
  (`desc`, `MessageDirection`, `Message` all imported — used at
  L319/L322/region already.)
- **MIRROR:** `ix_messages_user_created` purpose comment
  (`message.py:38-41`) — this rewrite finally uses the index for the
  inbox path.
- **VALIDATE:** NEW `backend/tests/test_inbox_distinct_on.py`:
  - Local SQL-shape test (AsyncMock db): `db.execute` returns
    result-stubs per call (`result.all()` → [] for main + tags;
    `db.scalar` → 0/None); call
    `live_chat_service.get_conversations(None, db)` → compile the
    captured statement with the PG dialect BEFORE asserting —
    default-dialect `str()` renders plain `SELECT DISTINCT` (count
    0) plus a deprecation warning (G2 round-2 probe):
    ```python
    from sqlalchemy.dialects import postgresql

    stmt = db.execute.call_args_list[0].args[0]
    sql = str(stmt.compile(dialect=postgresql.dialect()))
    assert sql.count("DISTINCT ON") == 2
    assert sql.count("row_number") == 1  # session window only
    ```
    (First execute is the main query — verified method order L181
    before tags L190. `decrypt_line_ids_for_users` short-circuits on
    empty user_ids — verified L161-162, no patch needed.
    `get_unread_counts`/`get_preferences_map` only run when
    `admin_id`/`user_ids` are non-empty — pass `admin_id=None` +
    empty rows → skipped. Verified L202-212.)
  - DB equivalence test (runs locally on 5434 AND in CI on 5432 —
    uses the `test_client` fixture for fail-fast + `AsyncSessionLocal`
    for seeding; requires `alembic upgrade head` once per DB):
    seed with NONCE ids (`f"UT9{uuid4().hex[:12]}"`, `from uuid import
    uuid4`): 2 LINE users, 1 staff user (no hash), messages: U1 × 3
    (mixed directions, distinct created_at), U2 × 1 incoming,
    1 orphan (user_id None), 1 staff message; GET
    `/api/v1/admin/live-chat/conversations` (override
    `deps.get_current_staff` → staff namespace) → look up OUR rows
    by nonce id in the response (never assert global `total` — a
    shared/dev DB holds other rows — G2 finding): U1 row
    `last_message.content` == newest, `last_user_activity_at` ==
    newest incoming; U2 row correct; our staff user + orphan absent
    from OUR rows. Cleanup in `finally`: delete messages first, then
    users (FK order), filtered by the nonce ids.
    (Seed users via `create_line_user(db, raw_id, ...)` from
    `backend/tests/identity_helpers.py` — real surrogate (hash +
    Fernet token), so `decrypt_line_ids_for_users` (L186) works;
    conftest sets a test ENCRYPTION_KEY. Messages via
    `Message(user_id=..., direction=MessageDirection.INCOMING/...,
    message_type="text", content=...)` + explicit `created_at`
    datetimes (NOT NULL: `direction`, `message_type` — verified
    `message.py:26-27`; `content` nullable); orphan via
    `user_id=None`. Caller commits.)
  Run the new file (both tests).

### T10 — live KPIs: cache-aside + parallel queries (R3-M20)
- **ACTION:** Cache the KPI payload 120s (fail-open) and gather the 10
  scalar groups over session-per-query coroutines.
- **Root cause:** ~12 sequential round trips per poll, no cache.
- **Regression risk:** MEDIUM — concurrency + caching semantics.
  Mitigated by: session-per-query (never concurrent on one session);
  cache fail-open both directions (get + setex wrapped); `cache_hit`
  flag mirrors `get_dashboard` so staleness is visible; response shape
  unchanged apart from the additive flag. (`get_kpi_trends` calls
  `get_live_kpis` internally and inherits ≤120s staleness —
  immaterial for day-window deltas — G2 round-3 finding.)
- **IMPLEMENT:** in `backend/app/services/analytics_service.py`:
  1. Add `import asyncio` (top imports — verified absent).
  2. Extract the 10 query blocks from `get_live_kpis` (L36-96) into
     module-level async functions (pure moves — SQL identical):
     `_kpi_waiting_count(s)`, `_kpi_active_count(s)`,
     `_kpi_avg_frt(s, hour_ago)`, `_kpi_avg_resolution(s, today_start)`,
     `_kpi_csat_avg(s, day_ago)`, `_kpi_sessions_today(s, today_start)`,
     `_kpi_human_mode_users(s)` + reuse the existing methods
     `calculate_fcr_rate(s, 7)`, `calculate_abandonment_rate(s, 7)`,
     `calculate_sla_breach_events(s, 24)` (already session-param'd —
     verified signatures). Each scalar helper returns the SAME
     intermediate the inline code produced (e.g. `_kpi_avg_frt`
     returns `avg_frt_result.scalar() or 0`).
  3. Rewrite `get_live_kpis` body (keep signature + docstring, note the
     `db` param is kept for caller compatibility while queries run on
     short-lived sessions — PRD F2):
     ```python
         key = "analytics:live_kpis"
         try:
             cached = await redis_client.get(key)
         except Exception:
             cached = None  # Redis-down -> compute without cache (fail-open)

         if cached:
             data = json.loads(cached)
             data["cache_hit"] = True
             return data

         now = datetime.now(timezone.utc)
         hour_ago = now - timedelta(hours=1)
         today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
         day_ago = now - timedelta(days=1)

         async def _use(factory, *args):
             async with AsyncSessionLocal() as session:
                 return await factory(session, *args)

         (waiting, active, avg_frt, avg_resolution, csat_avg, fcr_rate,
          abandonment_rate, sla_breach_events_24h, sessions_today,
          human_mode_users) = await asyncio.gather(
             _use(_kpi_waiting_count),
             _use(_kpi_active_count),
             _use(_kpi_avg_frt, hour_ago),
             _use(_kpi_avg_resolution, today_start),
             _use(_kpi_csat_avg, day_ago),
             _use(self.calculate_fcr_rate, 7),
             _use(self.calculate_abandonment_rate, 7),
             _use(self.calculate_sla_breach_events, 24),
             _use(_kpi_sessions_today, today_start),
             _use(_kpi_human_mode_users),
         )

         payload = {
             ... L98-110 identical ...,
             "timestamp": now.isoformat(),
             "cache_hit": False,
         }
         try:
             await redis_client.setex(key, CACHE_TTL_SECONDS, json.dumps(payload, default=str))
         except Exception:
             pass  # Redis-down -> do not fail the request
         return payload
     ```
     (Cutoff computation unified to one `now` — previously three
     separate `datetime.now()` calls; identical semantics, one clock
     read. `AsyncSessionLocal` + `redis_client` + `CACHE_TTL_SECONDS`
     + `json` all already imported — L5/L15/L17/L24.)
- **MIRROR:** `get_dashboard` cache-aside (L440-532) — same key style,
  TTL constant, fail-open, `cache_hit` flag.
- **VALIDATE:** NEW `backend/tests/test_live_kpis_cache.py` (pure mocks,
  local):
  - hit: patch `app.services.analytics_service.redis_client`
    (`get` AsyncMock → `'{"waiting": 1}'`) + patch
    `app.services.analytics_service.AsyncSessionLocal` (Mock) →
    result `cache_hit is True`, `waiting == 1`,
    `AsyncSessionLocal` NOT called.
  - miss: `get` → None; `AsyncSessionLocal` → mock session CM
    (scalar → canned per-call via side_effect list; execute →
    MagicMock scalar → canned); patch the 3 `calculate_*` methods on
    the service (AsyncMock 1.0/2.0/3); `setex` AsyncMock → assert
    payload values flow through, `setex` awaited once with
    `("analytics:live_kpis", 120, ...)` (TTL from the real constant —
    import and compare, don't hardcode), `cache_hit is False`,
    `AsyncSessionLocal` called 10 times.
    (Order-independent by design: gather makes cross-query call order
    nondeterministic, so the shared mock session returns the SAME
    canned scalar for every call and the test asserts AGGREGATE shape
    (all waiting/active/etc. equal the canned value) + `setex` called
    + 10 session opens. Per-query correctness: the SQL moved verbatim
    (review-verified) and CI runs the dashboard suite against real
    data. Pool note: engine pool is 5 + 3 overflow = 8 conns
    (`session.py:14-15`); 10 concurrent sessions briefly queue 2
    checkouts — no failure, ms-scale queries — G2 finding.)
  - redis-down: `get` raises → compute path runs (same mocks as miss).
  Run the new file + `tests/test_analytics_service.py` +
  `tests/test_analytics_perf.py` +
  `tests/test_admin_analytics_export_endpoints.py`.

### T11 — delete dead get_percentiles + _percentile (R3-M21)
- **ACTION:** Delete the unreachable Python-side percentile code (the
  SQL-side live path already serves the dashboard).
- **Root cause:** dead method loads all rows; deletion removes the load
  by construction.
- **Regression risk:** NONE — zero callers repo-wide (verified grep).
- **IMPLEMENT:** in `backend/app/services/analytics_service.py`, delete
  `get_percentiles` (L340-373, incl. preceding blank line handling to
  keep ONE blank line between methods in this class — delete exactly
  L340-373 + one trailing blank line) and `_percentile` (L1035
  `@staticmethod` + L1036-1048 def + trailing blanks L1049-1050,
  keeping the `# Global analytics service instance` comment attached
  correctly).
- **MIRROR:** `get_dashboard` percentiles (the live SQL path,
  L513-524 + L762-815).
- **VALIDATE:** `rg -n "get_percentiles|def _percentile" backend/app
  backend/tests` → zero matches (ripgrep — the `|` alternation is
  BRE-vacuous under plain GNU grep — G2 round-3 finding; the narrower
  pattern excludes the unrelated test NAME
  `test_dashboard_empty_percentiles_are_zero` at
  `test_analytics_perf.py:63` — G2 round-2 finding); `python -c "import
  app.services.analytics_service"` (import sanity); run
  `tests/test_analytics_service.py` + `tests/test_analytics_perf.py`
  (DB-backed — local 5434) +
  `tests/test_admin_analytics_export_endpoints.py`.

### T12 — combine intent SQL branches: 6 round trips → 3 (R3-M22)
- **ACTION:** One CASE-prioritized statement for intent branches, one
  for autoreply; REGEX-all stays (needs all rows for Python eval).
- **Root cause:** worst path runs 6 sequential queries per message.
- **Regression risk:** MEDIUM (hottest path) — mitigated by identical
  predicates (copy-paste, not rewrite); tiebreak preserved/extended;
  call-count test pins 3; DB matrix test pins winners.
- **IMPLEMENT:** in `backend/app/services/message_intake/intent_matching.py`:
  1. Imports: `from sqlalchemy import select, func, literal` (L9) →
     `from sqlalchemy import case, or_, select, func, literal`.
  2. Extract the eager-load options (L54-58) into a helper used by both
     statements:
     ```python
     def _intent_eager_options():
         return selectinload(IntentKeyword.category).selectinload(
             IntentCategory.responses.and_(IntentResponse.is_active == True)
         )
     ```
     and `_intent_keyword_stmt` (L51-63) becomes:
     ```python
     def _intent_keyword_stmt(*filters):
         return (
             select(IntentKeyword)
             .options(_intent_eager_options())
             .filter(*filters)
             # Deterministic tiebreak: oldest rule (lowest id) wins when several
             # keywords match the same branch (R3-M14).
             .order_by(IntentKeyword.id.asc())
         )
     ```
  3. `find_intent_keyword`: replace the three sequential branches
     (L74-100) with one combined statement (predicates copied verbatim
     from L74-97; the match_type guard is conjoined into BOTH the CASE
     arms and the WHERE disjuncts — without the CASE guards a
     STARTS_WITH/CONTAINS keyword equal to the full text would score
     prio 0 and beat the EXACT-typed row on id order, diverging from
     sequential semantics — G2 finding):
     ```python
         _exact = (func.lower(IntentKeyword.keyword) == text.lower()) & (
             IntentKeyword.match_type == MatchType.EXACT
         )
         _starts = (
             literal(text).ilike(
                 func.concat(_like_safe(IntentKeyword.keyword), '%'), escape="\\"
             )
             & (IntentKeyword.match_type == MatchType.STARTS_WITH)
         )
         _contains = (
             literal(text).ilike(
                 func.concat('%', _like_safe(IntentKeyword.keyword), '%'), escape="\\"
             )
             & (IntentKeyword.match_type == MatchType.CONTAINS)
         )
         prio = case((_exact, 0), (_starts, 1), (_contains, 2), else_=3)
         stmt = (
             select(IntentKeyword)
             .options(_intent_eager_options())
             .where(or_(_exact, _starts, _contains))
             .order_by(prio, IntentKeyword.id.asc())
             .limit(1)
         )
         match = (await db.execute(stmt)).scalars().first()
         if match:
             return match
     ```
     (Every WHERE disjunct equals its CASE arm exactly, so each
     returned row scores its branch rank — winners identical to
     sequential in all cases. REGEX branch L102-125 unchanged. `case`
     with `else_` + tuple whens is SQLAlchemy 2.0 style — verified
     version 2.0+ in stack.)
  4. `_find_autoreply_rule` (L128-140) → combined (expressions copied
     verbatim — note the contains branch has NO escape/`_like_safe`:
     preserved exactly):
     ```python
         _exact = AutoReply.keyword == text
         _contains = literal(text).ilike(func.concat('%', AutoReply.keyword, '%'))
         prio = case((_exact, 0), else_=1)
         stmt = (
             select(AutoReply)
             .where(
                 or_(
                     _exact & (AutoReply.is_active == True),
                     _contains & (AutoReply.is_active == True),
                 )
             )
             .order_by(prio, AutoReply.id.asc())
             .limit(1)
         )
         return (await db.execute(stmt)).scalars().first()
     ```
     (Adds deterministic id tiebreak — the old exact branch was
     unordered; documented micro-improvement. `AutoReply.id` verified
     — `auto_reply.py:27`.)
- **MIRROR:** R3-M14 tiebreak (`order_by(id)`) + `_intent_keyword_stmt`
  builder it extends.
- **VALIDATE:** NEW `backend/tests/test_intent_combine.py`:
  - Local call-count tests (AsyncMock db, mirror Batch-A T16 stub):
    no-match-anywhere (combined → None, regex-all → [], autoreply →
    None) → `db.execute.await_count == 3` (was 6 — the finding's
    headline number, pinned); EXACT-winner (combined → row) →
    count == 1 + row returned; `"CASE" in
    str(first_stmt)` + `"ORDER BY" in str(first_stmt)`.
    (Result stub: `res = MagicMock()`;
    `res.scalars.return_value.first.return_value = ...`;
    `res.scalars.return_value.all.return_value = ...`;
    `db.execute = AsyncMock(side_effect=[res_combined, res_regex,
    res_autoreply])`.)
  - DB equivalence matrix (runs local 5434 + CI 5432; `test_client`
    fixture for fail-fast + `AsyncSessionLocal` seed; table-seed via
    real models `IntentCategory/IntentKeyword/IntentResponse` +
    `AutoReply`): ALL keywords/names nonce-suffixed
    (`f"เวลาเปิด{uuid4().hex[:8]}"` — realistic bare keywords risk
    winner-shadowing on a shared DB; `intent_categories.name` is
    unique-constrained — G2 finding); capture assigned ids, never
    hardcode (PK collision on shared DB — G2 finding):
    exact + contains + starts (overlapping nonce stems) + regex +
    autoreply exact → `resolve_reply_responses` picks the intent
    exact (priority over autoreply); tie case (two contains) →
    `min(ids)` wins; B9 corner: STARTS_WITH keyword exactly equal to
    the full text with LOWER id + EXACT keyword equal to the text
    with HIGHER id → the EXACT-typed row wins (guards in CASE arms);
    inactive-category intent → falls through to autoreply; no-match
    → `([], "", None)`. Cleanup seeded rows in `finally`
    (responses → keywords → categories → autoreplies).
    (Seed via `db.add` + commit; NOT NULL columns spelled out:
    `IntentCategory(name=nonce, is_active=True)`,
    `IntentKeyword(category_id=..., keyword=nonce, match_type=...)`
    (`keyword`/`match_type` NOT NULL — verified `intent.py:51-52`),
    `IntentResponse(category_id=..., reply_type=ReplyType.TEXT,
    text_content="...", is_active=True)` (`reply_type` NOT NULL —
    verified `intent.py:64`; ≥1 active response required for the
    serviceable path — verified `resolve_reply_responses` L157-161),
    `AutoReply(keyword=nonce, reply_type=ReplyType.TEXT,
    text_content="...", is_active=True)` (`keyword`/`reply_type`
    NOT NULL — verified `auto_reply.py:28-30`; enums are per-model:
    `MatchType`/`ReplyType` from `app.models.intent` for
    keyword/response rows, `ReplyType` from `app.models.auto_reply`
    for autoreply rows — verified both defs.)
  - Rewrite `tests/test_webhook_intent_matching.py` to the combined
    contract (REQUIRED — it pins the 4-stage sequential counts; 3
    tests fail outright on count/match asserts and the rest carry
    stale 4-stage side_effects (G2 round-2/3: exact fail-lines
    depend on mock interplay — the rewrite spec below is what
    matters) — rewrite all): exact/starts/contains
    winners each resolve in ONE execute (`side_effect =
    [_result(first=match)]`, count == 1); the 4 regex tests use
    `[combined-None, regex-all]` (count == 2); no-match uses the same
    pair (count == 2, returns None). Keep the ReDoS bodies
    (pattern/probe caps, invalid-skip) byte-identical — the REGEX
    branch is untouched. Keep the module docstring's stage
    description accurate (edit "try EXACT > STARTS_WITH > CONTAINS
    via SQL" → "one CASE-prioritized SQL statement (EXACT >
    STARTS_WITH > CONTAINS), then REGEX in Python").
  Run the new file + `tests/test_webhook_intent_matching.py` +
  `tests/test_intent_tiebreak.py` (M14 — must stay green).

### T13 — shared httpx timeouts, retarget 24 bare clients (R3-M23)
- **ACTION:** One constants module + mechanical retarget; upload site
  gets the longer budget.
- **Root cause:** bare `AsyncClient()` on request paths hangs workers
  when an upstream stalls.
- **Regression risk:** LOW — timeouts only convert hangs into fast
  failures that existing handlers already cover (telegram/credential
  catch-or-propagate like any `ConnectError`; rich-menu upload's
  `except HTTPStatusError` lets `TimeoutException` fail fast past it —
  verified L197; settings validate maps to the same 500 as any network
  error). Budgets are generous (5/15/15, upload 5/30/60).
- **IMPLEMENT:**
  1. NEW `backend/app/core/http_timeouts.py`, exact content:
     ```python
     """Shared httpx timeout budgets: single enforcement point (R3-M23)."""
     import httpx

     DEFAULT_TIMEOUT = httpx.Timeout(connect=5.0, read=15.0, write=15.0, pool=5.0)
     UPLOAD_TIMEOUT = httpx.Timeout(connect=5.0, read=30.0, write=60.0, pool=5.0)
     ```
  2. `telegram_service.py` (L2 `import httpx`): add `from
     app.core.http_timeouts import DEFAULT_TIMEOUT` (after L4, local
     group); L71 + L96 `httpx.AsyncClient()` →
     `httpx.AsyncClient(timeout=DEFAULT_TIMEOUT)`.
  3. `settings.py`: add the same import at top (after L27); L284
     `httpx.AsyncClient()` → with `timeout=DEFAULT_TIMEOUT`. (Leave
     the local `import httpx` at L267 as-is.)
  4. `credential_service.py` (L6 `import httpx`): add the import (after
     L12); L220 + L231 → with `timeout=DEFAULT_TIMEOUT`.
  5. `rich_menu_service.py` (L4 `import httpx`): add `from
     app.core.http_timeouts import DEFAULT_TIMEOUT, UPLOAD_TIMEOUT`
     (after L14); all 19 `httpx.AsyncClient()` sites gain a timeout —
     18 × `DEFAULT_TIMEOUT` (L165/214/228/243/255/269/281/299/318/331/
     344/363/379/394/413/429/788/815) and 1 × `UPLOAD_TIMEOUT` at L189
     (the `content=image_bytes` upload — verified the only binary
     upload among the sites).
- **MIRROR:** `liff.py:38-41` (`httpx.Timeout(connect/read/write/pool)`
  object pattern).
- **VALIDATE:** NEW `backend/tests/test_http_timeouts.py` (pure mocks,
  local) — one representative pin per file + the upload budget:
  - telegram: replicate the `test_telegram_service.py` harness
    (self-contained copy — no private cross-module imports):
    `from app.services import telegram_service as tg_mod`,
    `TelegramService`, `CRED = SimpleNamespace(credentials="enc",
    metadata_json={"admin_chat_id": "42"})`, and the `_FakeCM`
    class (copy `test_telegram_service.py:19-36` verbatim); creds
    via `patch.object(tg_mod.credential_service,
    "get_default_credential", new=AsyncMock(return_value=CRED))` +
    `patch.object(tg_mod.credential_service, "decrypt_credentials",
    return_value={"bot_token": "tok"})` (the real loader is
    `load_credentials → credential_service`, NOT a
    `get_telegram_config` function — G2 finding). Fresh
    `TelegramService()` per test (config bleeds across instances —
    file docstring). `await TelegramService().send_alert_message(
    "hi", db)` (`text: str` — verified L87, not a dict — G2
    finding) with `patch("httpx.AsyncClient",
    return_value=_FakeCM(200, "ok"))` → assert True +
    `AsyncClient.call_args.kwargs["timeout"] == DEFAULT_TIMEOUT`.
  - credential: the two verify sites are pinned by the no-bare-client
    sweep below, not by a dedicated unit test (their decrypt+db setup
    outweighs the one-kwarg pin — documented gap, flagged for G2).
  - rich_menu JSON + upload + settings pins use a dedicated
    GET-capable fake (the verbatim telegram `_FakeCM` is post-only
    with no `.json()`/`raise_for_status` — all three pins would
    ERROR with it — G2 round-2 finding):
    ```python
    class _FakeResp:
        def __init__(self, payload, status_code=200):
            self._payload = payload
            self.status_code = status_code
            self.text = "ok"

        def raise_for_status(self):
            if self.status_code >= 400:
                raise httpx.HTTPStatusError(
                    "err", request=MagicMock(), response=MagicMock()
                )

        def json(self):
            return self._payload


    class _FakeCM2:
        def __init__(self, payload, status_code=200):
            self._resp = _FakeResp(payload, status_code)

        async def __aenter__(self):
            return self

        async def __aexit__(self, *exc_info):
            return False

        async def get(self, url, **kwargs):
            return self._resp

        async def post(self, url, **kwargs):
            return self._resp
    ```
    (Needs `import httpx` + `MagicMock` in the test file.)
    rich_menu JSON: patch
    `app.services.rich_menu_service.RichMenuService.get_client_headers`
    (AsyncMock → `{}`) + `patch("httpx.AsyncClient",
    return_value=_FakeCM2({"richmenus": []}))` (NOT bare `[]` —
    `list_from_line` does `response.json().get("richmenus", [])`,
    verified L275) → `await RichMenuService.list_from_line(
    AsyncMock())` → `[]` + timeout == DEFAULT_TIMEOUT. Upload: same
    headers patch + `_FakeCM2({})` (POST → `raise_for_status()` no-op
    + `.json()` → `{}`, verified L189-196) → `await
    RichMenuService.upload_image_to_line(AsyncMock(), "menu1", b"img",
    "image/jpeg")` (signature verified L175) → `{}` + timeout ==
    UPLOAD_TIMEOUT.
  - settings: direct call `validate_line_token(
    ValidateLineTokenRequest(channel_access_token="t"), db, admin)`
    (both imported from `app.api.v1.endpoints.settings`; signature
    verified L257-265) with AsyncMock db + admin namespace +
    `patch("httpx.AsyncClient", return_value=_FakeCM2({"userId":
    "U"}))` (the endpoint does `client.get` + `status_code` check +
    `response.json()` — verified L284-293; the local `import httpx`
    at L267 resolves to the same global — patchable) → returns
    `{"status": "valid", ...}` + timeout kwarg == DEFAULT_TIMEOUT +
    `create_audit_log` awaited (patch
    `app.api.v1.endpoints.settings.create_audit_log` — imported at
    L6, verified).
  - Sweep: `rg -n "httpx\.AsyncClient\(\)" backend/app/services/
    backend/app/api/v1/endpoints/settings.py` → zero matches (pins
    all 24 sites incl. credential's two).
  Run the new file + `tests/test_telegram_service.py` (Batch-A T8 —
    wholesale-patch style must stay green).

### T14 — Redis-backed WS limiter with in-process fallback (R3-M24)
- **ACTION:** Async Redis methods mirroring the HTTP limiter; 3 call
  sites await them; sync methods stay as fallback.
- **Root cause:** per-process buckets under-count N× across workers.
- **Regression risk:** LOW — Redis-down behaves exactly like today
  (sync fallback); sync unit tests untouched.
- **IMPLEMENT:**
  1. `rate_limiter.py`: add `from app.core.redis_client import
     redis_client` after L15 (`from app.core.config import settings`
     — L1-10 is the module docstring, so "after L8" would land
     inside it — G2 finding). Add to `WebSocketRateLimiter`:
     ```python
         _REDIS_KEY_PREFIX = "ratelimit:ws:"

         def _redis_key(self, client_id: str) -> str:
             return f"{self._REDIS_KEY_PREFIX}{client_id}"

         async def is_allowed_async(self, client_id: str) -> bool:
             """Cross-worker check: Redis fixed window, in-process fallback."""
             allowed = await redis_client.fixed_window_allow(
                 self._redis_key(client_id),
                 max_events=self.max_events,
                 window_seconds=self.window_seconds,
             )
             if allowed is None:
                 return self.is_allowed(client_id)
             return allowed

         async def get_remaining_async(self, client_id: str) -> int:
             raw = await redis_client.get(self._redis_key(client_id))
             if raw is None:
                 # Fresh key (full budget) or Redis down (in-process
                 # state) — the sync buckets answer both correctly.
                 return self.get_remaining(client_id)
             try:
                 used = int(raw)
             except (TypeError, ValueError):
                 return self.get_remaining(client_id)
             return max(0, self.max_events - used)

         async def reset_async(self, client_id: str) -> None:
             await redis_client.delete(self._redis_key(client_id))
             self.reset(client_id)
     ```
     (`redis_client.get/delete/fixed_window_allow` are all
     exception-safe (→ None/void) — verified `redis_client.py`.)
  2. `ws_live_chat.py` L158-159 →
     `if not await ws_rate_limiter.is_allowed_async(admin_id):` +
     `remaining = await ws_rate_limiter.get_remaining_async(admin_id)`;
     L286 `finally:` → `await ws_rate_limiter.reset_async(admin_id)`
     (async context ✓).
  3. `websocket_manager.py` L172 → `await
     ws_rate_limiter.reset_async(admin_id)` (`disconnect` is async —
     verified L153).
- **MIRROR:** `http_rate_limit.py:79-91` (same call, same None-fallback).
- **VALIDATE:** extend `backend/tests/test_ws_security.py` (NEW test
  class, pure mocks, local; `limiter.max_messages = N` via the
  verified alias setter):
  - allow: patch `app.core.rate_limiter.redis_client`
    (`fixed_window_allow` AsyncMock → True) → True + sync buckets
    empty (`limiter.buckets == {}`).
  - deny: → False → False.
  - fallback: → None + `limiter.max_messages = 2` → True, True, False
    (sync sliding takes over).
  - remaining: `get` → `"7"`, max 10 → 3; `get` → None → sync value
    (fresh limiter → 10).
  - reset_async: `delete` AsyncMock → called with `ratelimit:ws:A` +
    bucket cleared.
  Run the file + `tests/test_websocket.py` (WS integration must stay
  green).

### T15 — broadcast CancelledError marks FAILED instead of stranding SENDING (R3-L1)
- **ACTION:** Close the in-process strand path (PRD-narrowed scope).
- **Root cause:** `except Exception` doesn't catch `CancelledError`
  (BaseException) — disconnect between the two commits strands SENDING.
- **Regression risk:** LOW — only the cancellation path changes;
  cancellation still propagates (re-raise).
- **IMPLEMENT:** in `backend/app/services/broadcast_service.py`, insert
  before `except Exception as exc:` (L243):
  ```python
        except asyncio.CancelledError:
            # Client disconnect / task cancel between the SENDING commit
            # and the final commit must not strand the row (R3-L1):
            # record FAILED, then re-raise so cancellation propagates.
            broadcast.status = BroadcastStatus.FAILED
            try:
                await db.commit()
            except Exception as commit_exc:
                logger.error(
                    "Broadcast %s: FAILED-mark commit failed on cancel: %s",
                    broadcast.id, commit_exc,
                )
            raise
  ```
  (`asyncio` imported L1 ✓; `BroadcastStatus` used at L181+ ✓.)
- **MIRROR:** the existing `except Exception → FAILED` (L243-246) —
  same terminal-state principle, extended to cancellation.
- **VALIDATE:** extend `backend/tests/test_broadcast_service.py`
  (file's own `_broadcast()` builder + `svc._api = mock_api` pattern,
  L60-64; note the signature is `send_broadcast(db, bc)` — db first):
  ```python
  @pytest.mark.asyncio
  async def test_cancel_marks_failed_then_reraises():
      svc = BroadcastService()
      bc = _broadcast()
      db = AsyncMock()
      mock_api = AsyncMock()
      mock_api.broadcast = AsyncMock(side_effect=asyncio.CancelledError())
      svc._api = mock_api

      with pytest.raises(asyncio.CancelledError):
          await svc.send_broadcast(db, bc)

      assert bc.status == BroadcastStatus.FAILED
      assert db.commit.await_count >= 2  # SENDING commit + FAILED-mark commit
  ```
  (Add `import asyncio` to the test file's imports;
  `BroadcastService`, `_broadcast`, `BroadcastStatus` already present —
  verified head. Default `_broadcast()` target uses the `broadcast`
  (non-multicast) path — verified L70.)
  Run the file + `tests/test_broadcast_scheduler.py`.

### T16 — live-chat console: offline only on network error / 5xx (R3-M15)
- **ACTION:** Status-aware offline flag; 4xx (backend answered) never
  reports an outage.
- **Root cause:** any `!res.ok` → `setBackendOnline(false)`,
  misreporting auth expiry as backend-down.
- **Regression risk:** LOW — the global interceptor still owns
  401/403 (dispatches `jsk:auth-expired` before the hook sees the
  response).
- **IMPLEMENT:** in
  `frontend/app/admin/live-chat/_hooks/useConversationSync.ts`, replace
  the `else` block (L58-60 —
  `} else { getStore().setBackendOnline(false); }`) with:
  ```ts
      } else if (res.status >= 500) {
        getStore().setBackendOnline(false);
      } else {
        // 4xx (incl. 401/403): the backend answered — it is reachable.
        // Auth failures are owned by the global fetch interceptor
        // (jsk:auth-expired → logout); never report them as an outage.
        getStore().setBackendOnline(true);
      }
  ```
  (Keep the `catch` → `setBackendOnline(false)` — real network
  failure. Existing tests stub `{ ok: false }` without `status` →
  `undefined >= 500` is false → online(true); they assert nothing
  about the flag — verified safe.)
- **MIRROR:** finding text ("offline only on network error / 5xx").
- **VALIDATE:** extend
  `_hooks/__tests__/useConversationSync.test.tsx` (mirror `setup()` +
  `conv()` + the inline `vi.stubGlobal('fetch', ...)` stub style —
  there is NO `fetchResponse` helper in this file, only `setup`/`conv`
  — G2 finding; define a tiny local `stubList(resp)` in the new
  describe block wrapping `vi.stubGlobal`): 403 →
  `backendOnline` stays `true`; 500 → `false`; network throw →
  `false`; 200 → `true` + conversations set. Assert via
  `useLiveChatStore.getState().backendOnline` (field verified
  `liveChatStore.ts:33`, default `true` L139). Run
  `npx vitest run app/admin/live-chat/_hooks/__tests__/useConversationSync.test.tsx`.

### T17 — isNetworkError walks the cause chain (R3-M16)
- **ACTION:** Match network errors through the interceptor's Thai
  rewrap without changing any existing verdict.
- **Root cause:** exact-match on `message` fails on the rewrapped
  `TypeError('ไม่สามารถ…', { cause })`.
- **Regression risk:** LOW — every existing test vector keeps its
  verdict (verified below by construction).
- **IMPLEMENT:** in `frontend/lib/api-error.ts`, replace L86-91 with:
  ```ts
  const NETWORK_MESSAGES = new Set(['Failed to fetch', 'Load failed']);

  export function isNetworkError(error: unknown): boolean {
    // Walk the `cause` chain (bounded + cycle-safe): the global fetch
    // interceptor rethrows network failures as a Thai TypeError with the
    // original as `cause` (R3-M16). Every level must be a TypeError —
    // preserving the pinned rule that non-TypeErrors never match.
    let current: unknown = error;
    const seen = new Set<unknown>();
    for (let depth = 0; depth < 5 && current instanceof TypeError && !seen.has(current); depth++) {
      if (NETWORK_MESSAGES.has(current.message)) return true;
      seen.add(current);
      current = current.cause;
    }
    return false;
  }
  ```
  (Verdict check vs existing tests: TypeError direct hits → true;
  TypeError other → false; `Error('Failed to fetch')` → false (root
  not TypeError); string/null → false. All preserved.)
- **MIRROR:** the rewrap site (`authFetch.ts:168-172`) — paired context.
- **VALIDATE:** extend `lib/__tests__/api-error.test.ts`
  `isNetworkError` describe: rewrapped Thai TypeError with
  `cause: TypeError('Failed to fetch')` → true; 2-deep chain → true;
  cause-cycle (a↔b, non-network messages) → false + terminates;
  `Error` root with TypeError network cause → false (pins the
  conservative rule). Run `npx vitest run lib/__tests__/api-error.test.ts`.

### T18 — global fetch patch bypasses non-API traffic (R3-M25)
- **ACTION:** Non-API fetches skip credentials, refresh-retry, and the
  Backend rewrap entirely.
- **Root cause:** the interceptor treats every request as an API call.
- **Regression risk:** LOW — API paths byte-identical (existing suite
  pins them); non-API callers get the native behavior they already
  expected (`isNetworkError` still matches their raw errors).
- **IMPLEMENT:** in `frontend/lib/authFetch.ts`:
  1. Top of `handleCookieModeFetch` (before `const canRetry`, L105):
     ```ts
       // Non-API traffic (CDN, _next static, …) bypasses the interceptor
       // entirely: no cookies, no refresh, no rewrap (R3-M25).
       if (!isApiRequest(input)) {
         return nativeFetch(input, init);
       }
     ```
  2. In the `installAdminAuthFetchInterceptor` catch (L165-172), gate
     the rewrap (bypassed requests still flow through this catch):
     ```ts
     } catch (error: unknown) {
       if (!isApiRequest(input)) throw error;
       const url = ...
     ```
- **MIRROR:** `isApiRequest` (L73-75) — the same predicate the CSRF
  header already uses.
- **VALIDATE:** extend `lib/__tests__/authFetch.cookie.test.ts`:
  non-API GET (`https://cdn.example.com/lib.js`, no init) →
  `nativeFetch` called with `(url, undefined)` (no credentials
  injected); non-API 401 with a refresh handler set → refresh NOT
  called + 401 returned + no `jsk:auth-expired` dispatched (spy via
  `window.addEventListener`); non-API `TypeError('Failed to fetch')`
  throw → rejects with the ORIGINAL error (message unchanged, no
  Thai rewrap). Existing API tests (incl. the pinned
  credentials-on-API test) must stay green. (Note: that test's
  "credentials: include on all requests" NAME goes stale — it still
  passes; leave the name (renaming = churn) — G2 finding.) Run the
  file.

### T19 — LIFF validators reject whitespace-only input (R3-M28 + registered R3-M28-twin)
- **ACTION:** `.trim()` checks in both existing validators, mirroring
  backend `_blank()`. (The single-wizard validator is a DIFFERENT
  file with zero finding lines — fixed here ONLY under the
  explicitly registered R3-M28-twin deviation (PRD) — G2 finding.)
- **Root cause:** truthiness passes `"   "`; backend 422s late with a
  server error instead of inline guidance.
- **Regression risk:** LOW — strictly more guidance, same valid
  submissions (trimmed values were always the intent).
- **IMPLEMENT:**
  1. `service-request/page.tsx` `validateStep`: L280
     `if (!formData.prefix?.trim())` — fields are non-optional strings
     (verified init L81-86), so use direct `.trim()`:
     `if (!formData.prefix.trim())` + same for `firstname` (L281),
     `lastname` (L282), `description` (L295). (Phone L283-284 left to
     T20's digit-strip — stored value becomes digits-only. Selects are
     value-based, can't be whitespace.)
  2. `service-request-single/page.tsx` `validateForm`: same treatment
     for `prefix`/`firstname`/`lastname` (L241-243) and `description`
     (L252). (Phone L244-245 → T20.)
- **MIRROR:** backend `_blank()` (`service_request_liff.py:6-8`).
- **VALIDATE:** NEW `service-request/__tests__/validation.test.tsx` +
  NEW `service-request-single/__tests__/validation.test.tsx` (mirror
  the T5 `upload-retry.test.tsx` mock block: `useLiffInit`
  initDone-true, `useAutoCloseCountdown`, `location-cascade`,
  `upload-media`, `next/head`, `logger`, `@line/liff` (imported by
  the pages — T5 mocks it — G2 finding); `useToast` only where the
  page imports it — service-request does, the twins don't (verified
  heads)):
  - service-request: fill prefix 'นาย', lastname 'ใจดี', phone
    '0812345679', firstname '   ' → click ถัดไป → assert
    'กรุณาระบุชื่อ' visible + still step 0 (negative control: fails
    pre-fix). Description: valid step 0 → next → step 1
    agency/province/district/sub (T5 option-picking) → next → step 2
    category valid + description '   ' → next → assert
    'กรุณาระบุรายละเอียด' visible. (Error strings verified L273-308.)
  - single: fill firstname '   ' only → submit ('ยืนยันข้อมูล') →
    assert 'กรุณาระบุชื่อ' + NO `role="dialog"` confirm +
    `submitServiceRequest` (mocked `@/lib/liff/submit-service-request`)
    NOT called. Valid full-fill (mirror T5 picking incl. province
    fetch mocks) → dialog 'ยืนยันการส่งข้อมูล' appears.
  Run both files.

### T20 — phone inputs strip non-digits; placeholder matches (R3-M29)
- **ACTION:** Digit-strip on input in all 3 wizards + digits placeholder.
- **Root cause:** `maxLength={10}` vs 12-char dashed placeholder — the
  suggested format can't be typed.
- **Regression risk:** LOW — input-shape only, no submit-path change
  (per `liff_development`); backend gets clean digits; `length >= 9`
  validation keeps working.
- **IMPLEMENT:** in each wizard's `handleChange`, after
  `const { name, value } = e.target;` (service-request L138,
  request-v2 L99, single L114 — same line text), insert the phone
  branch and use it in `setFormData`:
  - service-request (field `phone_number`, verified): `const next =
    name === 'phone_number' ? value.replace(/\D/g, '') : value;`
  - request-v2 (field `phone`, verified L57/L376): `name === 'phone'`.
  - single (field `phone`, verified L446): `name === 'phone'`.
  Replace `... [name]: value ...` with `[name]: next` in that
  handler's `setFormData`. Change the three placeholders
  (`0xx-xxx-xxxx` → `08xxxxxxxx`): service-request L644, request-v2
  L380, single L450. Change the three `maxLength={10}` to
  `maxLength={12}` (same lines): real browsers truncate a dashed
  paste to 10 chars BEFORE `onChange`, so `maxLength={10}` + strip
  would turn a pasted `081-234-5678` into 8 digits → a confusing
  "too short" error; 12 chars admit the dashed form, the strip
  normalizes to 10 digits, and `length >= 9` validation keeps
  working (G2 round-2 finding). Stored values stay digits-only ≤ 12
  chars (backend `phone_number` cap is 20 — verified
  `service_request_liff.py` bounds).
- **MIRROR:** finding suggestion (strip dashes on input).
- **VALIDATE:** extend the two T19 validation files: use
  `fireEvent.change` explicitly (repo convention; avoids
  maxLength/user-event ambiguity — G2 round-2 finding) to set
  '081-234-5678' into the phone field → input value '0812345678';
  placeholder is '08xxxxxxxx'; `maxLength` attr is 12. NEW
  `request-v2/__tests__/phone-input.test.tsx` (same T5-style mocks
  incl. `@line/liff` — request-v2 shares the hook surface, verified
  L11-30): same strip + placeholder asserts. (request-v2 has no
  validator, so no validation test — PRD F3.) Run the three files.

### T21 — login errors render text + ARIA wiring (R3-M30)
- **ACTION:** Visible error text + `aria-invalid` + describedby +
  `role="alert"`; required asterisks hidden from AT.
- **Root cause:** `errors.*` only switch tint classes — no text, no
  ARIA.
- **Regression risk:** LOW — additive attributes + rendered text that
  was previously invisible.
- **IMPLEMENT:** in `frontend/app/login/page.tsx`:
  1. Username `Input` (L303-321): add
     `aria-invalid={!!errors.username}` +
     `aria-describedby={errors.username ? 'username-error' : undefined}`
     (Input spreads extra props — verified `Input.tsx:97`).
     After the input wrapper close (L330 `</div>`), insert:
     ```tsx
     {errors.username && (
       <p id="username-error" role="alert" className="text-danger text-xs mt-1 ml-1">
         {errors.username}
       </p>
     )}
     ```
     (Indent to match the surrounding motion.div children.)
  2. Password `Input` (L344-362; wrapper closes at L386): same with
     `password-error`. (Insert likewise after the L386 `</div>`.)
  3. Asterisks L300 + L341: `<span className="text-danger">*</span>` →
     `<span className="text-danger" aria-hidden="true">*</span>`.
- **MIRROR:** `frontend-a11y` skill error pattern (invalid + describedby
  + alert + aria-hidden asterisk).
- **VALIDATE:** NEW `frontend/app/login/__tests__/page.test.tsx`
  (jsdom): mock `@/contexts/AuthContext` (`useAuth` → `{ login:
  vi.fn(), isAuthenticated: false, isLoading: false }`, `AuthProvider`
  passthrough), `next/navigation` (`useRouter` → `{ replace: vi.fn(),
  push: vi.fn() }` — the code calls `router.replace` (L107/197),
  never `push`; a push-only mock throws → error Alert → breaks the
  "no alerts" assert — G2 finding),
  `@/components/ui/Toast` (`useToast` → `{ toast: vi.fn() }`,
  T5-style), `motion/react` (div passthroughs incl. AnimatePresence).
  Render the default export (verified L469-475 wraps AuthProvider +
  LoginForm): submit empty ('เข้าสู่ระบบ' button, verified L422) →
  2 `role="alert"` with 'กรุณากรอกชื่อผู้ใช้'/'กรุณากรอกรหัสผ่าน'
  (verified L152-164) + both inputs `aria-invalid="true"` +
  `aria-describedby` pointing at the alert ids; fill both + submit →
  `login` called, no alerts. Run the file.

### T22 — tempId gains a random suffix (R3-L2)
- **ACTION:** Collision-proof optimistic ids under a frozen clock.
- **Root cause:** `Date.now()` alone can theoretically collide.
- **Regression risk:** NONE — id format additive (`temp-<ms>-<rand>`).
- **IMPLEMENT:** in
  `frontend/app/admin/live-chat/_hooks/useMessageFlow.ts` L164:
  ```ts
  const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  ```
- **MIRROR:** finding suggestion (counter/random suffix).
- **VALIDATE:** extend `_hooks/__tests__/useMessageFlow.test.tsx`:
  send → `useLiveChatStore.setState({ sending: false })` (release the
  guard) → send again → the two `temp_id`s differ and both start
  with `temp-`. (Fake timers are active in this file's `beforeEach`,
  freezing `Date.now` — the test FAILS pre-fix (identical ids) and
  passes post-fix: a built-in negative control. No manual clock mock
  needed.) Run the file.

## Strategy & Validation Commands
- **Per-task:** implement → run the task's listed tests → all green
  before the next task. Never accumulate red.
- **Shared-file pairs are sequential by construction** (single
  implementer, disjoint ranges): `messaging.py` (T1+T7),
  `admin_live_chat.py` (T7+T8), `conversations.py` (T8+T9),
  `analytics_service.py` (T10+T11), wizards + validation files
  (T19→T20), `test_session_claim.py` (T7→T8 halves).
- **Line cites drift across sequential same-file tasks** (T7's
  deletion shifts T8's cites; T10's helpers shift T11's) — always
  locate edit points by symbol/function name, using the cited lines
  only as a neighborhood hint (G2 round-3 finding).
- **New/updated test files:** 10 new backend + 3 new frontend + 6
  extended backend + 5 extended frontend (listed per task).
- **Local backend (PowerShell, from repo root):**
  ```powershell
  $env:DATABASE_URL='postgresql+asyncpg://postgres:password@127.0.0.1:5434/skn_app_db'
  # one-time per DB (local 5434 AND whenever migrations change):
  cd backend; ..\backend\venv_win\Scripts\python.exe -m alembic upgrade head; cd ..
  # per-task scoped runs, e.g.:
  cd backend; ..\backend\venv_win\Scripts\python.exe -m pytest tests/test_toggle_mode_atomicity.py -v
  ```
  (WSL services must be up: `pg_ctl -D ~/pgdata_test -l
  ~/pgdata_test/logfile -o -p5434 -o -k/tmp start` +
  `redis-server --daemonize yes`. If the full suite hangs on Windows
  teardown (known flake — zcode handoff), scoped suites + CI are the
  gate; do NOT narrow a failing run to pass.)
- **Local frontend (from `frontend/`):** `npx vitest run <file>` per
  task; at the end `npm run test:unit`, `npx eslint <touched>`,
  `npm run build`.
- **CI is the final gate:** backend `pytest -q` (PG16 + redis
  services), frontend unit + build, E2E (no E2E changes in this batch
  — none of the tasks touch `e2e/`).

## Deviation Log (implementer fills — no silent deviations)
- 2026-10-03 T3-DB-test: plan specified `AsyncSessionLocal` + `test_client`
  fail-fast for `test_race_keeps_prior_pending_work_db`. As written it
  fails at seed flush with `asyncpg InternalClientError: got result for
  unknown protocol state 3` — the shared pool holds connections created
  inside the session-scoped TestClient's ASGI portal loop (documented in
  `test_rich_menu_display_scheduler_db._test_session`). Rewrote to the
  codebase's proven idiom: private NullPool engine + module-level
  `skipif(not _db_reachable())` (no `test_client`). Same assertions,
  same session semantics pinned; green on 5434.
- 2026-10-03 T9-DB-test: same foreign-loop hazard — plan specified
  `AsyncSessionLocal` for seeding. Seeding/cleanup use a private
  NullPool engine (test loop); the HTTP GET still goes through the
  `test_client` fixture (portal loop, safe). Module-level skipif added
  for DB-down runs. Assertions nonce-scoped per plan; instant-based
  datetime comparison (aware seeds) instead of raw ISO strings so the
  test is timezone-independent.
- 2026-10-03 T12-DB-test: same foreign-loop hazard — plan specified
  `test_client` + `AsyncSessionLocal` seed. No HTTP here, so the test
  uses a private NullPool engine + module-level skipif (T3 shape, no
  `test_client`). Matrix assertions per plan; green on 5434.
- 2026-10-03 T16-test-harness: the plan's 200-path test livelocked
  (fetch → setConversations → re-render → refetch, forever). Root
  cause is the test harness, not the fix: `setup()` built
  `wsStatusRef`/`selectedIdRef` INSIDE the render callback (fresh
  object per render) while the hook's mount effect depends on
  `wsStatusRef`. Pre-existing tests never noticed (their ok:false
  stubs touch only unsubscribed flags). Fixed `setup()` to hoist
  stable ref objects (mirrors the production provider's useRef);
  also dropped my describe's redundant afterEach (file-level one
  already unmounts + unstubs). Production code untouched beyond the
  pinned T16 diff. 14/14 green.
- 2026-10-03 T12-missed-file: plan/G2 validation listed only
  test_webhook_intent_matching + test_intent_tiebreak; the full suite
  caught test_webhook_intent_fallthrough.py::test_no_keyword_uses_
  autoreply_contains_fallback pinning the OLD staged autoreply
  contract (2 queries, await_count == 2). Updated to the combined
  contract (1 query, await_count == 1) + module docstring reword.
  Full-file inventory confirms no other test pins staged counts.

## Acceptance Criteria
- [ ] All 22 tasks implemented per spec; D1 + D2 decisions as locked in
  the PRD.
- [ ] New/updated tests listed per task pass locally (DB tests on
  5434) and in CI (5432).
- [ ] `test_session_claim.py` updated halves (T7+T8) green — pins the
  intended assertion changes (message key, no re-fetch, identity).
- [ ] Full backend + frontend suites green; CI green incl. build.
- [ ] PRD deviations honored: M21 deleted (not rewritten), L1 narrowed
  (no architecture), M19 without recency window, request-v2
  validation untouched (F3), `save_message` default untouched (F1).
- [ ] G3: zero unresolved Critical/High (none in batch) + no
  regressions in Batch-A behavior.

## Review Notes (self-review before G2)
- **Traceability:** every task cites PRD problem + finding ID; every
  finding 1:1 covered (map in Metadata).
- **Mirrors:** T1→PR#239 · T2→create_booking commit-first · T3→
  _add_open_session · T4→list_users masking · T5→MAX_UPLOAD_BYTES ·
  T6→POST limiter deps · T7→send_media return · T8→WS identity lookup
  · T9→ix_messages_user_created comment · T10→get_dashboard cache ·
  T11→get_dashboard percentiles (live path) · T12→R3-M14 tiebreak ·
  T13→liff.py Timeout · T14→http_rate_limit · T15→except→FAILED ·
  T16→finding text · T17→rewrap site · T18→isApiRequest · T19→_blank
  · T20→finding suggestion · T21→frontend-a11y · T22→finding suggestion.
- **Behavior changes (intended, all documented):** additive `message`
  key on send response (T7); AGENT-masked IDs (T6? no — T4); 429 on
  abusive booking GETs (T6); offline flag semantics (T16); non-API
  fetch bypass (T18); whitespace guidance (T19); digit-strip phone
  (T20); login error text (T21); tie-breaks deterministic on exact
  ties (T9/T12); KPI 120s cache + `cache_hit` (T10); timeouts fail
  fast (T13); WS limits cross-worker (T14); cancel→FAILED (T15);
  replies/broadcasts post-commit (T2); atomic toggle (T1); no full
  rollback on race (T3); media skip on oversize (T5); dead code gone
  (T11); unique tempIds (T22).
- **G2 round 1 (2026-10-03):** dual NEEDS-REWORK (A: 7 issues,
  conf 9; B: 13 issues, conf 9). All remediated in this revision:
  T2 telegram read serial in `_spawn` + handoff assert update +
  save-failure test; T3 add-inside + ordering assert + race-test
  rewrite + PG DB test; T4 role-assert + builder unit test + skipifs;
  T5 `skipped` propagation + preview cap; T7 resolve-factory mock;
  T9 aliased kept + nonce/row-scoped DB asserts; T10 10-everywhere +
  pool note + pinned runs; T11 pinned runs; T12 CASE guards + intent
  test rewrite + nonce matrix + B9 corner; T13 telegram harness
  rewrite + file-ref fixes; T14 anchor; T16 stub style; T18 stale-name
  note; T19 R3-M28-twin registration + `@line/liff` mocks; T20
  `@line/liff`; T21 replace-mock + range. PRD: M20 10-awaits +
  R3-M28-twin deviation.
- **G2 round 2 (2026-10-03):** dual NEEDS-REWORK again (A: 3 new,
  conf 9; B: 4 new, conf 9; all round-1 remediations verified pass
  by both). All remediated in this revision: T3 `MagicMock` import
  + `prior in db` discriminator; T9 PG-dialect compile + NOT NULL
  seed cols; T13 `_FakeResp`/`_FakeCM2` GET-capable fakes; T6
  `x-liff-id-token` header; T2 numbering cleanup + wrapper-clear
  test 5; T11 narrow grep + def-line note; T12 "3 fail outright"
  correction + NOT NULL seed cols + per-model enums; T20
  `maxLength={12}` + `fireEvent.change` + paste-truncation rationale.
- **G2 round 3 (2026-10-03):** dual NEEDS-REWORK again (A: 1 new —
  T6 shared-bucket 429s legit submits, conf 8; B: 1 new — T4
  create_user id stub, conf 9; all round-2 remediations verified
  pass by both, incl. live-PG + compile probes). All remediated:
  T6 separate `liff-booking-read` 60/60 scope + config keys +
  bucket-separation test (PRD M12 updated); T4 `db.add` id stub;
  T11/T13 `rg` patterns; Strategy symbol-anchoring note; T12
  fail-line wording; T10 trends-staleness note; T16 L58-60 cite.
- **Risks still open for G2 round-4 reviewers to attack:** T6 read
  budget sizing (60/60 judgment call); T3 PG DB-test (`_flaky_resolve`
  interplay — the test itself is the probe at implement time); T13
  credential still grep-pinned (accepted gap, flagged honestly); T4
  AGENT-matrix patch (`can` at source).



