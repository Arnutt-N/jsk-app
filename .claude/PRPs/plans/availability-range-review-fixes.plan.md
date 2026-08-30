# PRP Plan: Availability Range — Review Remediation

> Follow-up to PR #208 (squash `e3b853b`): fixes the findings of the /review
> audit of diff `2a93688...a11ca31` (standards + spec axes). No separate PRD —
> the review output is the requirements list; each task cites its finding.
> Branch: `fix/booking-availability-range-review` (off `main` @ `a11ca31`)

## Context (verified against source 2026-08-30)

- The shipped clip `dateOptions[Math.min(dateOptions.length, 63) - 1]` in
  `frontend/app/liff/booking/page.tsx` counts entries; `buildDateOptions`
  excludes blackout dates, so entry 62 can sit >62 calendar days out → backend
  422 → the whole range fetch fails → fail-open silently disables the feature
  (fires only when `advance_days` > 62, admin-editable to 365, plus blackouts)
- `DayAvailabilityOut` is hand-mapped field-by-field in `liff_bookings.py`
  while every other Out schema validates via `model_validate` (AGENTS.md)
- `DayAvailability.day_hours` (`booking_service.py`) is set at construction and
  read nowhere
- Import-order violations: `test_booking_availability_range.py` (stdlib import
  placed after third-party), `page.test.tsx` (relative import above `@/lib`)

## Tasks

### Task 1 — Frontend: clip by calendar span (spec finding: the real bug)

- `lib/booking.ts`: `MAX_AVAILABILITY_RANGE_DAYS = 62` (mirrors the backend
  constant) + private `addDaysISO()` + `clipRangeWindow(dateOptions)` filtering
  by ISO distance from the first entry (ISO strings sort chronologically)
- `page.tsx`: the effect uses `clipRangeWindow`; chips beyond the clip carry no
  day info and stay enabled (fail-open — their single-day grid still loads)
- `lib/__tests__/booking.test.ts`: helper tests (span fits → unchanged; blackout
  thinning clips to 2026-10-02 at 53 entries vs the old 63-entry/72-day-span bug)
- `page.test.tsx`: regression test asserting the range request `to` = first
  day + 62 even when blackouts thin a 100-day window

### Task 2 — Backend: schema validation + dead field (standards finding)

- `schemas/booking.py`: `DayAvailabilityOut.model_config =
  ConfigDict(from_attributes=True)` (sibling `BookingOut` precedent)
- `liff_bookings.py`: replace the hand-map with
  `DayAvailabilityOut.model_validate(day)` — endpoint tests stub days as
  `SimpleNamespace`, which `from_attributes` validates
- `booking_service.py`: drop `DayAvailability.day_hours` (Speculative
  Generality — stored, never read; `compute_slots` still receives the row)

### Task 3 — Import order + doc alignment (standards finding)

- `backend/tests/test_booking_availability_range.py`: `from types import
  SimpleNamespace` moves into the stdlib block (stdlib → third-party → local)
- `page.test.tsx`: `@/lib/booking` import above the relative `../page`;
  duplicated per-test `iso(offset)` helper hoisted to one `isoFromToday()`
- `AGENTS.md`: status-code list gains 409/422 (slot-full/duplicate and
  range-span validation are both in shipped code; precedent `rich_menus.py`)

## Left as-is (reviewed, rationale)

- `Out` suffix on the new schemas: matches file-wide sibling convention
  (SlotOut / AvailabilityOut / BookingOptionsOut); renaming churns the file
- `rangeInfo`/`rangeReady` as two states: semantically distinct (map vs
  readiness); a one-object refactor churns shipped code for no behavior gain
- a11y additions (`aria-disabled`, `opacity-40`): accessibility-positive, keep
- UnknownServiceTypeError → 404 guard duplicated across the endpoint pair:
  same shape as every guard pair in this file

## Validation

- Backend venv: `python -m pytest tests/test_booking_availability_range.py
  tests/test_booking_slots.py tests/test_liff_bookings_endpoints.py -v`
- `npx tsc --noEmit` · `npx eslint <touched files>` · `npx vitest run
  lib/__tests__/booking.test.ts app/liff/booking` · `npm run build`
- Full gates (CI + encoding check) re-run on the PR

## Ship

- Branch → conventional commits → PR citing the review findings → CI green →
  squash merge → checkpoint update