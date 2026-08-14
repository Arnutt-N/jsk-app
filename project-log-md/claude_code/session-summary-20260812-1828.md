# Session Summary — claude_code — 2026-08-12T18:28:00+07:00

**Branch**: `main`  **HEAD**: `34c8ea8`
**Checkpoint**: `.agents/state/checkpoints/handover-claude_code-20260812-1828.json`
**Model**: Claude Opus 5 (Anthropic)

## Objective

Run the `orch-add-feature` pipeline for a new capability: **การจองคิวนัดหมาย
(appointment slot booking) + แจ้งเตือนนัดหมาย (appointment reminders)** on the
LINE Official Account.

## Status: paused at GATE 1 — no implementation code was written

The pipeline is gated by design. Phases 0–2 (intake, research, plan) are done;
Phase 4 (TDD implementation) must not start until the user approves the plan.
The only file added this session is the plan document itself.

## Completed

- **Phase 0 — size classification**: `large` (new endpoints, new background
  task, LIFF + admin UI, cross-cutting).
- **Intake**: five design decisions locked with the user (see below).
- **Phase 1 — research & reuse**: mapped every piece of this feature onto an
  existing pattern in the repo; concluded **no new pip dependency** is needed.
- **Phase 2 — plan**: wrote `.claude/PRPs/plans/booking-and-reminder.plan.md`
  with a 10-slice task list, the data model, two named correctness hazards, and
  the verification checklist.

## Decisions locked with the user

| # | Decision |
|---|----------|
| 1 | Standalone service booking — **not** linked to `service_requests` |
| 2 | Time slots with a **per-slot quota**, derived from `business_hours` |
| 3 | Notifications: immediate LINE confirmation · Telegram alert to staff · Flex reply when a citizen asks about their queue |
| 4 | Advance reminder is **admin-configurable** — on/off toggle + lead value with unit `DAY` or `HOUR` |
| 5 | **Auto-confirm** — no staff approval step |

Decision 4 is worth noting: the user was offered fixed 1-day / 1-hour reminder
options and rejected both in favour of making it configurable from the admin UI.

## Key discovery — this is not greenfield

`app/models/booking.py` and the `bookings` table **already exist and are live in
production**, created by the initial migration `1349087a4a24`
(`id`, `user_id`, `service_type`, `booking_date`, `booking_time`, `queue_number`,
`status`, `created_at`), plus `User.bookings` at `models/user.py:75`.

Nothing else in the codebase references it — no service, no endpoint, no UI. So
task T1 **extends an existing production table**; it does not create one.

## Reuse map

| Need | Existing pattern to reuse |
|------|---------------------------|
| Scheduled background job | `tasks/broadcast_scheduler.py` — asyncio loop started from the `main.py` lifespan |
| Admin-editable config | `SettingsService.get_setting` / `set_setting` over `system_settings` |
| Staff alert | `telegram_service.send_alert_message(text, db)` |
| Flex reply to a citizen query | `message_intake/commands.py::handle_check_status`, routed from `message_handler.py:123` |
| Operating hours | `models/business_hours.py` |
| LINE push | `line_service.push_messages()` + `resolve_raw_for_push()` |

APScheduler was considered and rejected: it would add a second scheduling
mechanism alongside `app/tasks/` and would not solve the multi-worker problem
either.

## Two correctness hazards the plan exists to close

**H1 — slot oversell.** Count-then-insert is not safe: `SELECT ... FOR UPDATE`
locks existing rows and cannot block a concurrent INSERT into the same slot
(phantom row), so two citizens can both pass the capacity check for the last
seat. Fix: `pg_advisory_xact_lock(hashtext('service|date|time'))` at the top of
the booking transaction, with count, capacity check, queue-number allocation and
insert all inside it.

**H2 — duplicate reminders.** Production runs **2 uvicorn workers**, so each has
its own scheduler loop. `SKIP LOCKED` narrows the window but does not close it.
The real guard must be a claim — `UPDATE bookings SET reminder_sent_at = now()
WHERE id = :id AND reminder_sent_at IS NULL` — sending only when `rowcount == 1`.

## Design calls made on the user's behalf (flagged at Gate 1, open to override)

- **No `line_user_id` column on `bookings`** — resolve the push target through
  the `user` relationship instead, because adding a plaintext LINE ID column now
  would cut against the in-flight pseudonymisation work.
- **Config in `system_settings` keys**, not new tables.
- **`booking_blackout_dates` added** — `business_hours` only models day-of-week,
  so without it citizens could book public holidays.
- **Cancel-and-rebook instead of reschedule** — materially simpler.
- **A notification failure must never roll back a confirmed booking**, but must
  still be logged (no silent swallow).

## Next Steps

1. Obtain **GATE 1** approval on the plan document.
2. Branch `feat/booking-appointments` off `main`, then start **T1** (extend the
   `bookings` model + Alembic revision) TDD-first.
3. `security-reviewer` is **mandatory** before GATE 2 — the diff touches
   authentication/authorization, user-input handling, database queries and
   external API calls.

## Blockers

- Waiting on the user's Gate 1 decision. Nothing technical is blocked.

## Constraints carried forward

- **Migration rule (from PR #183)**: declare indexes in `__table_args__` under
  the names production actually uses, never `index=True`; verify with
  `python scripts/db_target.py alembic --target remote check` printing
  *"No new upgrade operations detected"*.
- **Testing gotcha**: locally ~739 tests pass because the 60 DB-backed tests
  silently error out without Postgres + Redis; CI runs the full set.
