# Live-chat presence, unread, and connection-state implementation plan

## Phase 1 — Contract and shared types

- [x] Add `last_user_activity_at` to backend conversation schemas and frontend
      conversation/update types.
- [x] Add `ReadConversationRequest` with optional timezone-aware `read_at`.
- [x] Extend `ConnectionState` with terminal `failed` and make the WebSocket
      client emit it when retry attempts are exhausted.
- [x] Extend the shared presence helper with a five-minute user-activity
      mapping and keep token-based colors/labels.

Validation: type-check the changed modules and run focused helper/client tests.

## Phase 2 — Backend activity and read boundary

- [x] Select the latest incoming message per user for list/detail activity data.
- [x] Add `POST /admin/live-chat/conversations/{line_user_id}/read` using the
      current staff dependency and the existing per-admin Redis marker.
- [x] Remove implicit read mutations from GET detail, `JOIN_ROOM`, and incoming
      broadcast handling. Do not clear another unread message as a side effect
      of an outgoing broadcast.

Validation: targeted pytest coverage for endpoint authorization/parameters,
detail/join non-mutation, and per-admin unread payloads.

## Phase 3 — Frontend read lifecycle and sidebar UI

- [x] Keep the captured unread count when selecting a room; clear the local
      badge only after a successful read acknowledgement.
- [x] Acknowledge after the first message page loads while visible/focused,
      after visible incoming messages, and on focus/visibility restoration.
- [x] Wire the menu's “ทำเครื่องหมายว่าอ่านแล้ว” action to the REST endpoint.
- [x] Render customer activity presence in `ConversationItem` and improve the
      unread badge's accessible name/title and `99+` cap.

Validation: Vitest for selection/read timing, visibility behavior, presence,
and unread rendering; run existing live-chat tests for regressions.

## Phase 4 — Connection messaging and recovery

- [x] Refresh list/detail after a successful reconnect.
- [x] Render the hard connection error only for `failed`, with a retry button;
      keep progress states quiet in the chat body.

Validation: ChatArea and WebSocket client tests, then frontend lint/build.

## Phase 5 — Review and handoff

- [x] Review the diff for API/auth, race conditions, and preservation of the
      untracked research file.
- [x] Run focused backend/frontend tests and report any environment-limited
      checks explicitly.
- [ ] Commit using a conventional `fix:` message, push the branch, and open a
      PR for human review; do not merge without approval.
