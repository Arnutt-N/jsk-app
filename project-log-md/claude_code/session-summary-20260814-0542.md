# Session Summary — claude_code — 2026-08-14T05:42:00+07:00

**Branch**: `feat/booking-appointments`  **HEAD**: `de9314f`
**Checkpoint**: `.agents/state/checkpoints/handover-claude_code-20260814-0542.json`
**Model**: Claude Opus 5 (Anthropic)

> Continues `20260813-0702`, whose single blocker was "Docker daemon down, which
> blocks the migration and concurrency verification". That blocker is now closed
> — by a different route, and the verification it unlocked found two real defects.

## Objective

Execute priority actions 1 and 2 of the previous checkpoint: run the booking
migration for real, and run the concurrency tests that only a live Postgres can
exercise.

## Docker stayed down — the route around it

`com.docker.service` is Stopped and starting it needs an elevated UAC click. The
user was on a phone and could not click it, and UAC is not something to work
around. Docker was therefore a hard blocker for the whole session.

It turned out not to matter: what the work needed was **Postgres on
localhost:5432**, not Docker. WSL Ubuntu already ships PostgreSQL 16 at
`/usr/lib/postgresql/16/bin`. `sudo` there wants a password, so `systemctl start
postgresql` was unavailable — but PostgreSQL needs no root. A cluster owned by
the normal user, on a WSL-native data dir with an overridden socket dir, gives
exactly the `postgres:password@localhost:5432/skn_app_db` that `docker-compose.yml`
would have. Recipe recorded in agent memory.

## Priority action 1 — migration, executed for real

Against a genuinely empty database, so the whole ~55-revision chain ran, not just
the new one.

| Check | Result |
|-------|--------|
| `upgrade head` from empty | clean, ends at `e6f7g8h9i0j1` |
| `alembic check --target local` | **No new upgrade operations detected** |
| `downgrade -1` | drops exactly its own 6 columns + `ix_bookings_slot`, `ix_bookings_reminder_due` |
| indexes surviving downgrade | `bookings_pkey`, `ix_bookings_id`, `ix_bookings_queue_number` — all three pre-existing ones intact |
| `upgrade head` again | everything restored |
| `alembic check` after round-trip | still clean |

The surviving-index row is the one worth keeping: an over-broad `drop_index` in a
downgrade would have destroyed indexes migration `1349087a4a24` owns. It does not.

The clean `alembic check` is the direct, executed proof of what
`test_booking_migration.py` could only assert indirectly — that the index names in
the migration match the names declared in the model's `__table_args__`, the PR #183
failure mode.

## Priority action 2 — the concurrency tests had never run

The previous checkpoint recorded these as "4 skipped by design". They were not
skipping by design; **they had never executed once**, and two separate defects
were hiding behind the skip.

**Defect 1 — the fixture could not be adopted.** `pytest.ini` sets only
`testpaths`, so pytest-asyncio runs **strict**, where `@pytest.mark.asyncio`
covers test functions but an async *fixture* must be `@pytest_asyncio.fixture`.
`sessions` was a plain `@pytest.fixture` and errored at setup under pytest 9. This
is the first async fixture in the entire backend suite, which is why nothing had
hit the rule before. Fixed at the fixture rather than by setting
`asyncio_mode = auto`, which would change collection for ~930 tests to fix one file.

**Defect 2 — the race was not a race.** With the fixture working, both racers were
handed the same `user_id` from `_any_user_id()`. `create_booking` checks the
duplicate guard before capacity, so the loser returned `DuplicateBookingError` and
**the oversell path was never entered**. Fixed per the user's choice: the fixture
now creates the two bookers it races (`booking-race-a`/`-b`) and deletes them
again, which also removes the "no users seeded" skip entirely — the file now runs
on an empty CI database with no preconditions.

Result: **4 passed, 0 skipped.**

## The negative control — proof the tests have teeth

A green concurrency test proves nothing on its own; it looks identical whether it
caught a race or the two tasks simply never overlapped. So the advisory lock was
temporarily disabled and the suite re-run:

```
FAILED test_only_one_of_two_racing_bookings_takes_the_last_seat
FAILED test_racing_bookings_receive_distinct_queue_numbers
  AssertionError: duplicate queue number issued: ['260817-001', '260817-001']
```

Both invariants the day-scoped lock exists to protect — per-slot capacity and the
per-day queue sequence — broke together, exactly as designed. The other two tests
stayed green correctly: one takes the lock through raw SQL rather than the service,
and one is sequential. `booking_service.py` was then restored via
`git checkout --`, verified by an empty `git diff HEAD`.

## Test results (actually run)

| Suite | Result |
|-------|--------|
| Backend — full, with live Postgres | **870 passed, 0 failed, 60 errors** |
| Backend — `-k booking` | **131 passed, 0 skipped** |
| Backend — concurrency file alone | **4 passed** |

Passing count rose 761 → 870. The 60 errors did not disappear but **changed
cause**: they now read "Redis at 127.0.0.1:6379 not reachable" rather than
"PostgreSQL not reachable". Those tests need both; they were dying at the first
gate and now die at the second. All 8 affected files are live-chat / websocket /
auth (`test_websocket`, `test_session_claim`, `test_reconnection`,
`test_cookie_auth`, `test_liff_token`, `test_multi_operator`,
`test_operator_takeover`, `test_conversation_preferences`) — **no booking file is
among them**. Redis is not installed in WSL and `apt` needs the sudo password, so
this gap could not be closed by the same route.

## Correction to the previous checkpoint's checklist

It instructed: confirm `alembic check --target remote` prints "No new upgrade
operations detected" **before** opening the PR. That is not achievable.
`alembic check` refuses to compare unless the database is already at head; PROD
sits at `d5e6f7g8h9i0` with the booking migration unapplied, so it returns
*"Target database is not up to date. FAILED"* — a statement about revision lag,
not about drift. It is a **post-deploy** check. The pre-PR equivalent is
`--target local` after `upgrade head`, which is clean.

PROD was read only, never written.

## Files changed

- `backend/tests/test_booking_create_concurrency.py` — the only source change.

## Next Steps

1. Decide whether to open the PR to `main`; nothing on this branch has been pushed.
2. Redis remains unavailable locally, leaving those 60 tests to CI.
3. Run `alembic check --target remote` only after the migration is deployed.
4. Manual LINE test still needs a LIFF ID from the LINE console; the rich-menu
   entry pointing at `/liff/booking` is deliberately not built yet.

## Blockers

- None for the booking work. Docker/UAC and the WSL sudo password both remain
  closed doors, but neither blocks this feature any longer.
