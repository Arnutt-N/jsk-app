# Live Chat Post-Merge Race Hardening PRP

## Phase 1: Regression Tests

- Extend `backend/tests/test_websocket_manager_redis.py` with out-of-order and retry-on-WATCH-conflict coverage.
- Add Redis-unavailable/transaction-failure endpoint contract coverage.
- Extend `frontend/lib/websocket/__tests__/client.test.ts` with `error` + `close` deduplication, stale-generation, disconnect-during-mint, and repeated ticket-mint failure coverage.
- Validate that the new tests fail against the merged implementation.

## Phase 2: Atomic Read Boundary

- Update `backend/app/core/websocket_manager.py` to use a Redis WATCH/MULTI transaction, compare parsed timestamps, retain the maximum, and refresh TTL.
- Update `backend/app/api/v1/endpoints/admin_live_chat.py` to return the stored authoritative boundary or HTTP 503 when persistence fails.
- Update endpoint test expectations.

Validation:

- `python -m pytest tests/test_websocket_manager_redis.py tests/test_session_claim.py -q`

## Phase 3: Reconnect Lifecycle

- Update `frontend/lib/websocket/client.ts` to keep one pending reconnect timer, bind callbacks to a connection generation, cancel stale mint results, and route ticket-mint failures through the retry budget.
- Keep explicit disconnect and authentication rejection terminal without reconnect.

Validation:

- `npx vitest run lib/websocket/__tests__/client.test.ts --reporter=dot`
- `npx eslint lib/websocket/client.ts lib/websocket/__tests__/client.test.ts`
- `npx tsc --noEmit`

## Phase 4: Review and Delivery

- Run targeted backend/frontend tests, `git diff --check`, and skill-assisted code review.
- Commit, push, open a follow-up PR, wait for required checks, merge, and review the merged range again.
