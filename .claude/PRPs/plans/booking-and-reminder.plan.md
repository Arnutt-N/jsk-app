# Plan — การจองคิวนัดหมาย + แจ้งเตือนนัดหมาย (Booking & Reminders)

**Operation:** `orch-add-feature` · **Tier:** large · **Branch target:** `feat/booking-appointments`

## Locked decisions (from user, Gate-0 intake)

| # | Decision | Value |
|---|----------|-------|
| 1 | Booking scope | **Standalone service booking** — not linked to `service_requests` (no FK) |
| 2 | Slot model | **Time slot + per-slot quota** — derived from `business_hours`, capacity configurable |
| 3 | Notifications | Immediate LINE confirmation on booking · Telegram alert to staff · Flex reply when citizen asks about their queue |
| 4 | Advance reminder | **Admin-configurable**: on/off toggle + lead time value with unit (DAY or HOUR) |
| 5 | Approval flow | **Auto-confirm** — booking is `CONFIRMED` immediately if the slot has room |

## Non-goals (explicitly out of scope)

- Linking bookings to `service_requests`
- Rescheduling (citizen cancels + rebooks instead)
- Per-officer / per-room assignment
- Recurring appointments

---

## Data model

### `bookings` — extend the existing table (it is already live in production)

Existing columns kept as-is: `id`, `user_id`, `service_type`, `booking_date`,
`booking_time`, `queue_number`, `status`, `created_at`.

New columns:

| Column | Type | Why |
|--------|------|-----|
| `contact_name` | `String(120)`, nullable | Staff need a name to call out at the counter |
| `phone_number` | `String(20)`, nullable | Contact fallback if LINE push fails |
| `note` | `Text`, nullable | Free-text detail from the citizen |
| `reminder_sent_at` | `DateTime(tz)`, nullable | Claim marker — the multi-worker double-send guard |
| `cancelled_at` | `DateTime(tz)`, nullable | Audit trail for cancellations |
| `updated_at` | `DateTime(tz)`, nullable | Mirrors the repo convention |

**No `line_user_id` column.** The push target is resolved through the existing
`user` relationship via `resolve_raw_for_push(db, user)`. Adding a plaintext LINE
ID column now would cut against the in-flight LINE-ID pseudonymisation work.

**Indexes** (declared in `__table_args__` under explicit names, per the rule
established by PR #183 — never `index=True`, which autogenerate would then
propose to drop/recreate):

- `ix_bookings_slot` on `(service_type, booking_date, booking_time)` — availability lookups
- `ix_bookings_reminder_due` on `(status, reminder_sent_at, booking_date)` — scheduler poll

### Configuration — `system_settings` keys (no new table)

| Key | Example | Meaning |
|-----|---------|---------|
| `booking_enabled` | `true` | Master switch for the whole feature |
| `booking_service_types` | `["ปรึกษากฎหมาย","ไกล่เกลี่ยข้อพิพาท"]` | JSON list of bookable services |
| `booking_slot_minutes` | `30` | Slot length, sliced across `business_hours` |
| `booking_slot_capacity` | `3` | Seats per slot |
| `booking_advance_days` | `14` | How far ahead a citizen may book |
| `booking_blackout_dates` | `["2026-12-05"]` | Holidays / closures (day-of-week alone is not enough) |
| `booking_reminder_enabled` | `true` | Advance-reminder toggle (decision #4) |
| `booking_reminder_lead_value` | `1` | Lead time amount |
| `booking_reminder_lead_unit` | `DAY` | `DAY` or `HOUR` |

Values are validated by a Pydantic schema on write so a bad JSON blob cannot be
persisted through the admin API.

---

## Two correctness hazards this plan must close

### H1 — Slot oversell under concurrent booking

Count-then-insert is **not** safe: `SELECT ... FOR UPDATE` locks existing rows and
cannot block a concurrent INSERT into the same slot (phantom row), so two
citizens can both pass the capacity check for the last seat.

**Fix:** take `pg_advisory_xact_lock(hashtext(:slot_key))` at the top of the
booking transaction, where `slot_key = f"{service_type}|{date}|{time}"`. Count,
capacity-check, allocate the queue number, and insert — all inside that lock.
The lock releases on commit.

### H2 — Duplicate reminders across uvicorn workers

Production runs **2 uvicorn workers**; each starts its own scheduler loop from
the app lifespan. `SELECT ... FOR UPDATE SKIP LOCKED` narrows the window but the
real guarantee must be a claim:

```
UPDATE bookings SET reminder_sent_at = now()
WHERE id = :id AND reminder_sent_at IS NULL
```

Send the push only when `rowcount == 1`. A worker that loses the race sends
nothing. (The existing `broadcast_scheduler` relies on the same idea via its
`SCHEDULED -> SENDING` status transition.)

---

## Task list — thin vertical slices

Each slice is TDD: failing test first, then implementation, then refactor.

### Core

**T1 — Model + migration**
Extend `models/booking.py` with the new columns and named indexes; add an Alembic
revision. Verify `alembic check --target remote` reports no drift afterwards.
*Tests:* model shape / index names; migration upgrade-then-downgrade round-trip.

**T2 — Slot availability engine** (`services/booking_service.py`)
Pure function: given `business_hours`, config, blackout dates and existing
bookings, return each slot with its remaining capacity. Excludes closed days,
blackout dates, past slots, and dates beyond `booking_advance_days`.
*Tests:* closed day → empty; blackout date → empty; full slot → `remaining == 0`;
today → past slots filtered out; boundary at `booking_advance_days`.

**T3 — Create booking with capacity + queue-number allocation**
Implements **H1**. Emits `queue_number` as a per-day running code.
*Tests:* happy path; slot full → 409; duplicate active booking by same user for
the same slot → rejected; **concurrency test** — two overlapping transactions
compete for the last seat, exactly one wins.

**T4 — LIFF endpoints** (`api/v1/endpoints/liff_bookings.py`)
`GET /liff/bookings/availability`, `POST /liff/bookings`,
`GET /liff/bookings/me`, `POST /liff/bookings/{id}/cancel`.
All routes verify the LIFF ID token server-side via the existing
`verify_liff_token`; cancel enforces ownership.
*Tests:* missing/invalid token → 401; cancelling another user's booking → 403;
input validation (unknown `service_type`, malformed date, past date).

**T5 — Confirmation notifications**
On successful booking: LINE Flex confirmation to the citizen (new builder in
`flex_messages.py`) + `telegram_service.send_alert_message()` to staff. Both are
best-effort — a notification failure must never roll back a confirmed booking,
but it must be logged (no silent swallow).
*Tests:* flex payload shape; booking still persists when LINE push raises;
Telegram called with the expected summary.

**T6 — Advance-reminder scheduler** (`tasks/booking_reminder.py`)
Mirrors `broadcast_scheduler`: asyncio loop started from lifespan, polls every
60s, reads config fresh each pass so the admin toggle applies without a restart.
Implements **H2**.
*Tests:* due-selection respects `DAY` vs `HOUR` lead unit; disabled toggle sends
nothing; already-reminded booking skipped; cancelled booking skipped; past
booking skipped; **claim-guard test** — a second concurrent pass sends nothing.

**T7 — Flex reply for "สอบถามคิวจอง"**
`handle_check_booking` in `message_intake/commands.py`, routed from
`message_handler.py` on keywords (`คิว`, `นัดหมาย`, `จองคิว`). Mirrors
`handle_check_status`, resolving the user via `resolve_by_line_id`.
*Tests:* no bookings → friendly text; with bookings → flex; keyword routing.

**T8 — Admin endpoints** (`api/v1/endpoints/admin_bookings.py`)
`GET /admin/bookings` (filter by date / status / service, paginated),
`PATCH /admin/bookings/{id}` (COMPLETED / NOSHOW / CANCELLED, audit-logged),
`GET|PUT /admin/bookings/settings`.
*Tests:* authz — a `USER` role is rejected; invalid status transition rejected;
settings validation rejects a bad reminder unit; audit row written.

**T9 — Frontend: LIFF booking page** (`app/liff/booking/page.tsx`)
Pick service → pick date → pick slot (showing remaining seats) → contact details
→ confirm. Follows the existing LIFF page conventions.
*Tests (vitest):* slot list renders remaining capacity; full slots disabled;
form validation blocks submit.

**T10 — Frontend: admin pages**
`app/admin/bookings/page.tsx` (day view + status actions) and
`app/admin/settings/booking/page.tsx` (config incl. the reminder toggle, lead
value and unit). Register in the sidebar and the settings hub.
*Tests (vitest):* reminder-unit selector maps to the right payload; status action
calls the right endpoint.

### Deferred (proposed, not in this PR)

- Rich menu entry pointing at the LIFF booking page — needs a LIFF ID from the
  LINE console, so it is a config step rather than code.
- Booking metrics in `/admin/reports`.
- CSV export of bookings.

---

## Review gate

Security triggers touched: LIFF/admin **authentication & authorization**,
**user-input handling**, **database queries**, **external API calls** (LINE,
Telegram). Per `rules/common/security.md` the `security-reviewer` pass is
**mandatory** before Gate 2, alongside `code-reviewer` and the language reviewers
(`python-reviewer`, `typescript-reviewer`).

## Commits

One conventional commit per slice, e.g.:

```
feat(booking): add slot availability engine with capacity accounting
feat(booking): confirm bookings under an advisory lock to prevent oversell
feat(booking): send admin-configurable advance reminders
```

## Verification before Gate 2

- `python -m pytest` green; new behaviour covered (target >= 80%)
- `npx tsc --noEmit`, `npm run lint`, `npx vitest run` green
- `alembic check --target remote` reports no new operations
- migration upgrade + downgrade exercised locally against Docker Postgres
