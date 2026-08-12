# Session Summary — claude_code — 2026-08-12T21:03:00+07:00

**Branch**: `feat/booking-appointments`  **HEAD**: `72a3fc4`
**Checkpoint**: `.agents/state/checkpoints/handover-claude_code-20260812-2103.json`
**Model**: Claude Opus 5 (Anthropic)

## Objective

Build **การจองคิวนัดหมาย + แจ้งเตือนนัดหมาย** (appointment slot booking with
reminders) for the LINE Official Account, via the gated `orch-add-feature`
pipeline (tier: large).

## Status: complete and green — paused at GATE 2

All ten planned slices are implemented, tested, and passing. The feature diff is
**deliberately uncommitted**: the pipeline's Gate 2 requires the user to approve
before committing, and that approval had not arrived when the session ended.
Only the handoff artifacts in this commit are checked in.

> **Do not discard the dirty working tree.** `git status` shows 32 entries —
> 9 modified, 23 new — and that is the entire feature.

## Test results (actually run, not estimated)

| Suite | Result |
|-------|--------|
| Backend — all booking tests + startup wiring | **129 passed, 4 skipped** |
| Backend — full suite | **761 passed, 60 errors** — every error is "PostgreSQL not reachable", matching the pre-existing baseline exactly |
| Frontend — full suite | **482 passed (57 files)** |
| Frontend — booking (3 files, added after the full run) | **38 passed** |
| `tsc --noEmit`, `eslint` | clean |

The 4 skips are the DB-backed concurrency tests; they skip by design (rather
than erroring) when Postgres is absent, and run on CI.

## What was built

| Slice | Delivered |
|-------|-----------|
| T1 | `bookings` table extended + migration `e6f7g8h9i0j1` |
| T2 | Slot availability engine — pure, no I/O |
| T3 | Booking creation with capacity + queue-number allocation |
| T4 | LIFF endpoints: options, availability, create, me, cancel |
| T5 | LINE Flex confirmation + Telegram staff alert |
| T6 | Advance-reminder scheduler wired into the app lifespan |
| T7 | `คิว` / `นัดหมาย` text command replying with a Flex list |
| T8 | Admin endpoints: list, status change, read/write settings |
| T9 | LIFF booking page (`/liff/booking`) |
| T10 | Admin queue screen + settings screen, registered in nav |

The reminder is **admin-configurable** — on/off, a lead value, and a `DAY`/`HOUR`
unit — which the user explicitly asked for instead of a hardcoded 1-day reminder.

## The two hazards the design exists to close

**Oversell.** Count-then-insert cannot be made safe with `SELECT ... FOR UPDATE`,
because the racing row does not exist yet (a phantom). `create_booking` takes
`pg_advisory_xact_lock(hashtext('booking:<date>'))` *first*, then counts, checks
capacity and allocates the queue number inside it. The lock is scoped to the
**day**, not the slot, because the per-day queue-number sequence needs covering
too.

**Duplicate reminders.** Production runs two uvicorn workers, each with its own
scheduler loop. The guard is `claim_reminder()` — a conditional
`UPDATE ... WHERE reminder_sent_at IS NULL`, acted on only when `rowcount == 1`.
The claim is committed *before* the push, making reminders deliberately
at-most-once: a duplicate message to a member of the public cannot be taken
back, whereas a missed one is recoverable by staff.

## Bug found during self-review — worth remembering

`Session.rollback()` expires **every** instance in the session, and does so even
under `expire_on_commit=False` (that flag governs commit only).

The reminder loop originally held ORM objects across iterations. So the first
lost claim expired the rest, and the next `booking.id` access — which sat
*outside* the try block — would raise `MissingGreenlet` under async SQLAlchemy
and abandon the whole batch. Under real two-worker contention, every remaining
reminder in that pass would silently fail to send.

Fixed by snapshotting ids as plain ints before the loop, re-reading each booking
via `load_booking_for_reminder()` after its claim commits, and using
commit-instead-of-rollback on the lost-claim path. Three regression tests added.

**Mocks hid this completely** — `SimpleNamespace` has no expiry behaviour.

## Verification gap — close this first

Docker was down for the whole session, so:

- the migration was **never executed** — no upgrade/downgrade round-trip against
  a real Postgres;
- **`alembic check --target remote` was never run**, contrary to the plan's own
  checklist.

`tests/test_booking_migration.py` compensates by comparing index names between
the migration and the model directly (the PR #183 failure mode), but that is not
a substitute for running it.

## Judgement calls flagged to the user at Gate 2

- `/admin/bookings` uses `get_current_staff`, which gates on the
  `access_staff_endpoints` permission key that originally meant live-chat.
  Restricting AGENT from live-chat would therefore also remove their access to
  the queue screen. A dedicated permission key would decouple them.
- An admin cannot set a booking back to `CONFIRMED` — this prevents
  un-cancelling into a seat someone else now holds.
- `GET /liff/bookings/options` was added beyond the plan: the LIFF page needs to
  know which services are bookable.
- `ix_bookings_slot` is intentionally **not** unique — capacity is greater than
  one per slot, and the guard is the advisory lock.

## Proposed commits (awaiting Gate 2)

```
feat(booking): extend the bookings table for appointments and reminders
feat(booking): add slot availability engine and admin-editable settings
feat(booking): confirm bookings under an advisory lock to prevent oversell
feat(booking): notify citizens and staff when a booking is confirmed
feat(booking): send admin-configurable advance reminders
feat(booking): expose LIFF and admin booking endpoints
feat(booking): add LIFF booking flow and admin management screens
```

## Next Steps

1. Obtain **Gate 2** approval, then land the seven commits above.
2. Start Docker (`com.docker.service`, elevated) and run the migration for real,
   then confirm `alembic check --target remote` prints *"No new upgrade
   operations detected"*.
3. Run the 4 skipped concurrency tests — they are the only real proof the
   advisory lock stops oversell.
4. Manual LINE test needs a LIFF ID from the LINE console; the rich-menu entry
   pointing at `/liff/booking` is deliberately not built yet.

## Blockers

- Waiting on the user's Gate 2 decision.
- Docker daemon down, which blocks the migration and concurrency verification.
