# Session Summary — claude_code — 2026-08-13T07:02:00+07:00

**Branch**: `feat/booking-appointments`  **HEAD**: `5164928`
**Checkpoint**: `.agents/state/checkpoints/handover-claude_code-20260813-0702.json`
**Model**: Claude Opus 5 (Anthropic)

> Supersedes the `20260812-2103` checkpoint, which described the feature diff as
> uncommitted. The user approved Gate 2 and all seven commits landed. The tree
> is clean; **nothing has been pushed**.

## Objective

Build **การจองคิวนัดหมาย + แจ้งเตือนนัดหมาย** (appointment slot booking with
reminders) for the LINE Official Account, via the gated `orch-add-feature`
pipeline (tier: large).

## Outcome — shipped to the branch

Seven conventional commits, `172a21e..5164928`:

```
172a21e feat(booking): extend the bookings table for appointments and reminders
8106b54 feat(booking): add the slot engine and confirm bookings under an advisory lock
cddffe2 feat(booking): notify citizens and staff, and answer queue questions
684c90e feat(booking): send admin-configurable advance reminders
6c6d1dd feat(booking): expose LIFF and admin booking endpoints
da600e5 feat(booking): add the LIFF booking flow
5164928 feat(booking): add admin queue and settings screens
```

Both gates were honoured: no implementation before the plan was approved, no
commit before the diff summary was approved.

## Test results (actually run)

| Suite | Result |
|-------|--------|
| Backend — all booking tests + startup wiring | **129 passed, 4 skipped** |
| Backend — full suite | **761 passed, 60 errors** — every error is "PostgreSQL not reachable", matching the pre-existing baseline exactly |
| Frontend — full suite | **482 passed (57 files)** |
| Frontend — booking (3 files, added after the full run) | **38 passed** |
| `tsc --noEmit`, `eslint` | clean |

The 4 skips are the DB-backed concurrency tests, which skip by design rather
than erroring when Postgres is absent.

## Design decisions locked with the user

| # | Decision |
|---|----------|
| 1 | Standalone service booking — **not** linked to `service_requests` |
| 2 | Time slots with a **per-slot quota**, derived from `business_hours` |
| 3 | Immediate LINE confirmation · Telegram staff alert · Flex reply to a queue question |
| 4 | Advance reminder is **admin-configurable** — on/off, lead value, `DAY`/`HOUR` unit |
| 5 | **Auto-confirm** — no staff approval step |

Decision 4 is the notable one: the user was offered fixed 1-day and 1-hour
reminders and rejected both in favour of making it configurable from the admin
screen.

## The two hazards the design exists to close

**Oversell.** Count-then-insert cannot be made safe with `SELECT ... FOR UPDATE`
because the racing row does not exist yet (a phantom). `create_booking` takes
`pg_advisory_xact_lock(hashtext('booking:<date>'))` *first*, then counts, checks
capacity and allocates the queue number inside it. Day-scoped rather than
slot-scoped, because the per-day queue-number sequence needs covering too.

**Duplicate reminders.** Production runs two uvicorn workers, each with its own
scheduler loop. `claim_reminder()` is a conditional
`UPDATE ... WHERE reminder_sent_at IS NULL`, acted on only when `rowcount == 1`.
The claim commits *before* the push, making reminders deliberately at-most-once:
a duplicate message to a member of the public cannot be taken back, whereas a
missed one is recoverable by staff.

## Bug found during self-review (fixed in `684c90e`)

`Session.rollback()` expires **every** instance in the session, and does so even
under `expire_on_commit=False` — that flag governs commit only.

The reminder loop originally held ORM objects across iterations. The first lost
claim therefore expired the rest, and the next `booking.id` access — which sat
*outside* the try block — would raise `MissingGreenlet` under async SQLAlchemy
and abandon the whole batch. Under real two-worker contention, every remaining
reminder in that pass would silently fail to send.

Fixed by snapshotting ids as plain ints before the loop, re-reading each booking
via `load_booking_for_reminder()` after its claim commits, and using
commit-instead-of-rollback on the lost-claim path. Three regression tests added.

**Mocks hid this completely** — `SimpleNamespace` has no expiry behaviour.

## Verification gap — close before opening a PR

Docker was down for the whole session, so:

- the migration was **never executed** — no upgrade/downgrade round-trip;
- **`alembic check --target remote` was never run**, contrary to the plan's own
  checklist.

`tests/test_booking_migration.py` compensates by comparing index names between
the migration and the model directly (the PR #183 failure mode), but that is not
a substitute for running it.

## Judgement calls shown to the user and accepted

- `/admin/bookings` uses `get_current_staff`, which gates on the
  `access_staff_endpoints` permission key that originally meant live-chat.
  Restricting AGENT from live-chat would therefore also remove their access to
  the queue screen; a dedicated key would decouple them.
- An admin cannot set a booking back to `CONFIRMED` — this prevents
  un-cancelling into a seat someone else now holds.
- `GET /liff/bookings/options` was added beyond the plan: the LIFF page needs to
  know which services are bookable.
- `ix_bookings_slot` is intentionally **not** unique — capacity is greater than
  one per slot, and the guard is the advisory lock.

## Next Steps

1. Start Docker (`com.docker.service`, elevated), run the migration for real,
   and confirm `alembic check --target remote` prints *"No new upgrade
   operations detected"*.
2. Run `tests/test_booking_create_concurrency.py` with Postgres up — the only
   real proof the advisory lock stops oversell.
3. Open a PR to `main`; nothing has been pushed yet.
4. Manual LINE test needs a LIFF ID from the LINE console. The rich-menu entry
   pointing at `/liff/booking` is deliberately not built yet.

## Blockers

- Docker daemon down, which blocks the migration and concurrency verification.
