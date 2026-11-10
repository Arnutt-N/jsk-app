# Session Summary — claude_code — 2026-11-09 (update)

## What shipped
PR #330 opened (`3592535`, branch `fix/mock-routing-and-r-cjs-shell`):
closes handoff items 1-3 from checkpoint 20261109-0712.

1. `shell: true` in `scripts/r.cjs` — branched by platform. Windows needs
   shell for npm/npx .cmd shims (proved: `shell:false` → ENOENT on npm,
   `node` still runs); POSIX execs directly. Allowlist rejected as theater
   on a human-invoked dev tool with no untrusted input. Guards unchanged:
   no-cmd / wrong-cwd / bad-target all exit 2; happy path exit 0.
2. OTHER-bucket mock branch — `resolve_by_line_id` route added to
   `_db_with_events` in `test_friend_history_date_range.py`, with a
   characterization test pinning that a hash miss returns None, not a
   MagicMock (the old mock would have returned a MagicMock from
   `scalar_one_or_none()`).
3. Statement-routing sweep over 7 test files: SELECT-vs-UPDATE
   (`test_send_message_failure`, `test_send_message_payload`),
   BusinessHours-vs-bookings (`test_booking_availability_range`),
   inbox-join vs batch-decrypt vs tag-fetch
   (`test_conversations_quarantine`), model-class routing on `db.get`
   (`test_admin_bookings_assign`), stale 3-result queue collapsed to one
   count query (`test_phone_bind_claim`).

Item 4 closed with no code change: interrogate adversaries 1+3 findings
from PR325 round 2 were already applied from verified interim outputs in
#325/#326.

## Proof (ran, not read)
- 54 tests across the 7 files pass, executed through
  `node scripts/r.cjs backend python -m pytest ...` from repo root
- `node --check scripts/r.cjs` passes
- Full backend suite: 1495 passed; 148 failed + 126 errors are all
  DB-integration tests (PostgreSQL port 5432 closed in this environment,
  Docker daemon not running) — not caused by this diff
- Skipped by design: `test_intent_combine.py` + analytics export streaming
  mock — their call order IS the contract they assert (query count,
  chunk/terminator)

## Handoff pointer
Checkpoint: `.agents/state/checkpoints/handover-claude_code-20261109-2311.json`
