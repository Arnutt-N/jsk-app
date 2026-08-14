# Live-chat sidebar presence, unread state, and connection messaging

## Problem

The live-chat sidebar currently colors the customer avatar from the operator
session (`ACTIVE`/`WAITING`) rather than from the customer's recent activity.
Unread state is also cleared optimistically when an operator selects a room and
the backend clears it merely because an operator joins the WebSocket room. This
can hide messages that were not actually seen. Finally, the chat area presents
the hard failure message `ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้` during the normal
initial connection/reconnect states.

## Goals

1. Show a green customer avatar dot when the customer has sent a message within
   the recent-activity window, and a gray dot otherwise.
2. Keep an unread count indicator on every sidebar row until the current
   operator explicitly acknowledges the loaded messages while the page is
   visible and focused. Preserve the existing per-operator Redis read-marker
   semantics.
3. Display the server-connection failure copy only after WebSocket retries are
   exhausted; connecting and reconnecting states remain non-error progress
   states.
4. Keep REST polling and WebSocket recovery behavior intact, including a
   manual retry from the terminal failure state.

## Non-goals

- No database migration or change to team-wide unread ownership.
- No change to session/claim semantics or operator-presence indicators in the
  chat header/customer panel.
- No change to the existing message content, notification sound, or sorting
  behavior beyond carrying the activity timestamp needed by the sidebar.

## Decisions

### Customer activity

The backend exposes `last_user_activity_at`, computed from the latest incoming
message. The frontend maps a valid timestamp no older than five minutes to the
shared `online` token; missing, invalid, future, or older timestamps map to the
shared `offline` token. This avoids claiming that a customer is currently
online when the system only has recent-message evidence.

### Read acknowledgement

GET detail and `JOIN_ROOM` no longer mutate the read marker. A new authenticated
REST endpoint accepts an optional `read_at` boundary. The frontend acknowledges
the latest loaded/incoming message only when the selected room has loaded
successfully and `document.visibilityState === 'visible'` with focus. Visibility
and focus events retry the acknowledgement. If the request fails, the local
badge remains visible.

### Connection failure

The WebSocket client gains a terminal `failed` state after the retry strategy
returns false. The chat area renders the hard failure copy and retry action only
for `failed`; `connecting`, `authenticating`, `reconnecting`, and transient
`disconnected` states do not show that copy.

## Acceptance criteria

- A sidebar row with an incoming message timestamp within five minutes has the
  green status dot and an accessible `ออนไลน์` label; older/missing timestamps
  have the gray `ออฟไลน์` label.
- An unread badge is announced as `<count> ข้อความใหม่`, capped visually at
  `99+`, and remains after selecting a room until the read endpoint succeeds.
- Joining a room or polling detail does not clear the backend read marker.
- A visible, focused room marks messages through the loaded boundary; a hidden
  or unfocused room does not.
- A failed WebSocket retry sequence displays
  `ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้` and a retry button. Initial load and normal
  reconnect do not display that sentence.
- Existing unit/backend tests remain green, with focused tests for presence
  boundaries, read endpoint behavior, and terminal connection state.

## Test strategy

- Vitest: presence helper boundary/fallback tests, ConversationItem unread and
  status accessibility, and ChatArea connection-copy tests.
- Pytest: read-marker endpoint, no-read-on-detail/join behavior, and incoming
  broadcast unread calculation.
- TypeScript/lint/build checks for the frontend and the targeted backend test
  module on Windows using the repository's configured Python environment.
