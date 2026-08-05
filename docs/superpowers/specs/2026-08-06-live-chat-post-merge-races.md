# Live Chat Post-Merge Race Hardening PRD

## Problem

Post-merge review of PR #185 found three reliability gaps:

1. Operator read markers can move backwards when acknowledgements complete out of order.
2. One WebSocket failure can schedule reconnect twice when `error` is followed by `close`.
3. Repeated ticket-mint failures can remain `disconnected` instead of exhausting retries and showing the terminal retry UI.

## Requirements

- Persist the maximum read boundary per operator and LINE user atomically in Redis.
- Return the authoritative stored read boundary from the read endpoint.
- Reject read acknowledgement with HTTP 503 when Redis cannot persist it.
- Schedule at most one reconnect timer per socket lifecycle failure.
- Ignore callbacks and ticket-mint results from obsolete connection generations.
- Treat both query-ticket and first-frame ticket mint failures as retryable connection failures.
- Transition to `failed` only after the configured retry budget is exhausted.
- Preserve intentional disconnect and authentication-rejection behavior.

## Acceptance Criteria

- An older acknowledgement cannot replace a newer Redis marker, including after a transaction conflict.
- Redis absence or transaction failure does not report a successful read acknowledgement.
- An `error` then `close` sequence consumes one reconnect attempt and creates one replacement socket.
- A delayed close from an old socket cannot alter a replacement connection.
- Disconnecting during ticket mint cannot open a socket after disconnect.
- Repeated `null` ticket results reach `failed` and do not create a WebSocket.
- Existing backend WebSocket/session tests and frontend WebSocket tests pass.

## Out of Scope

- Changing unread-count product rules.
- Changing reconnect delay policy or maximum-attempt defaults.
- Changing WebSocket authentication protocols.
