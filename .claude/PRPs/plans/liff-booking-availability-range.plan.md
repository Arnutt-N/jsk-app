# PRP Plan: LIFF Booking Availability Range

> PRD: `.claude/PRPs/prds/liff-booking-availability-range.prd.md`
> Branch: `feat/booking-availability-range` (off `main` @ `8ddbda3`)

## Context (verified against source 2026-08-29)

- `backend/app/services/booking_service.py` — `compute_slots` (L120-175, pure), `get_availability` (L337), `get_booked_counts` (L321, `ACTIVE_STATUSES` filter), `load_day_hours` (L313), `BookingConfig` (L64, frozen dataclass), `SlotAvailability.remaining` (L95, clamped ≥0), `local_now()` (L105, BANGKOK_TZ naive)
- `backend/app/api/v1/endpoints/liff_bookings.py` — router mounted at `/liff/bookings` (`api.py:40`); pattern: `_require_booking_enabled` → service → `HTTPException(404, "ไม่พบบริการที่เลือก")`; `require_line_user_id` header dep; NO `ResponseBase` envelope in this file — plain JSON models only
- `backend/app/schemas/booking.py` — `AvailabilityOut`, `SlotOut` precedent; `blackout_dates` serialized as `List[date]` in options
- `frontend/lib/booking.ts` — `LIFF_BASE`, `liffHeaders()`, `readError()`, `fetchAvailability()` precedent; `buildDateOptions()` (L101) builds ISO date window
- `frontend/app/liff/booking/page.tsx` — `dateOptions` memo (L256), preselect effect (L301-304, `chooseDate(dateOptions[0])`), chip render loop (L561), `slotCache` ref, `chooseService` reset (L306)
- Tests backend: stub style in `test_booking_create.py` (`_config()`, `_db()`, `patch local_now`); endpoint tests — mirror `test_booking_list.py` fixtures
- Tests frontend: `frontend/app/liff/booking/__tests__/page.test.tsx` (10 tests, `useLiffInit` stub shape post-#207)

## Tasks

### Task 1 — Backend service: `get_availability_range` (TDD)

**RED** — new `backend/tests/test_booking_availability_range.py` (stub db, style of `test_booking_create.py`):
1. `DayAvailability.is_open` = `bool(slots)`; open day with 2 free of 3 slots → `remaining = sum(slot.remaining)`
2. No `BusinessHours` row for weekday → closed
3. `is_open=False` row → closed
4. Blackout date in range → closed
5. Date beyond `advance_days` → closed; date before today → closed
6. Full day (booked == capacity ทุก slot) → `is_open=True, remaining=0`
7. `FULL_DAY_CLOSE` ("24:00") day → slots ถึงเที่ยงคืน
8. Unknown service → `UnknownServiceTypeError`
9. **Batching**: `db.execute` called exactly 2× for a 14-day range (hours + grouped counts)
10. Range query filters: `service_type`, `booking_date BETWEEN`, `ACTIVE_STATUSES`

**GREEN** — in `booking_service.py`:
```python
@dataclass(frozen=True)
class DayAvailability:
    date: date
    day_hours: Optional[BusinessHours]
    slots: list[SlotAvailability]
    # is_open := bool(slots) / remaining := sum(s.remaining ...) as properties
```
`get_availability_range(...)`: unknown-service guard → one `select(BusinessHours)` (dict by `day_of_week`) → one grouped counts query (`booking_date, booking_time`) → loop `compute_slots` per day with `booked_by_date.get(d, {})`, single `local_now()`.

**VALIDATE**: `python -m pytest tests/test_booking_availability_range.py -v`

### Task 2 — Backend schemas + endpoint

- `schemas/booking.py`: `DayAvailabilityOut(date, is_open, remaining)`, `AvailabilityRangeOut(service_type, days: List[DayAvailabilityOut])`
- `liff_bookings.py`: `GET /availability/range` — `Query(alias="from"/"to")`, guards `from > to` → 422, `(to - from).days > MAX_RANGE_DAYS(=62)` → 422, then `_require_booking_enabled` → service → 404 on unknown → map rows. Place directly after `/availability`.
- Endpoint tests (new, mirror `test_booking_list.py` fixtures): 401 no token / 503 disabled / 404 unknown / 422 inverted / 422 >62d / 200 shape (rows sorted, one per day)

**VALIDATE**: `python -m pytest tests/test_booking_availability_range.py tests/test_booking_list.py -v` then full suite via local pattern (`~/bin/run-pytest.sh` — PG16 port 5434; see PROJECT_STATUS 2026-08-23 note)

### Task 3 — Frontend: fetcher + page wiring

- `lib/booking.ts`: `DayAvailability`, `AvailabilityRange`, `fetchAvailabilityRange()` (headers via `liffHeaders`, error via `readError`, fallback "ไม่สามารถโหลดวันที่เปิดให้จองได้")
- `page.tsx`:
  - `rangeInfo: Map<string, DayAvailability> | null` + `rangeReady: boolean`; effect fetch when `idToken && options && serviceType && !confirmed` (from/to = `dateOptions[0]` / last); failure → log + `rangeReady=true` with null map (fail-open)
  - Chip render (L561 area): `const info = rangeInfo?.get(iso)`; `disabled={info ? !info.is_open || info.remaining === 0 : false}` — คง aria/styling ปุ่มเดิม, ปิดด้วย `disabled` attribute
  - Preselect effect: guard `if (!rangeReady) return`; target = first `dateOptions` entry with `info.is_open && info.remaining > 0`, fallback `dateOptions[0]`
  - `chooseService`: reset `rangeInfo`/`rangeReady`
- Update `__tests__/page.test.tsx`: extend fetch stub for range endpoint (route by URL); new cases: closed-day chip disabled; preselect skips closed/full day; range fetch failure keeps chips enabled + preselect falls back

**VALIDATE**: `npx tsc --noEmit`, `npx eslint` touched files, `npx vitest run app/liff/booking`, `npm run build`

### Task 4 — Ship

- Conventional commits on `feat/booking-availability-range` (feat backend → feat frontend, tests inline per repo TDD style)
- Push → PR (body: PRD/PRP links, acceptance mapping, gates evidence) → CI green → squash merge
- Update `PROJECT_STATUS.md` Backlog (tick the range-endpoint item) in the handoff checkpoint (do NOT hand-edit in this PR)

## Gotchas

- `compute_slots` requires `config.enabled` — `_require_booking_enabled` already 503s before service runs; keep service's `enabled` branch untouched (pure-function parity with single-day)
- `blackout_dates` is `frozenset[date]` in config (not strings) — compare with `date` objects
- `FULL_DAY_CLOSE` needs the next-day-00:00 branch — do not reimplement; reuse `compute_slots`
- Timezone: pass ONE `local_now()` into every day's `compute_slots` (per-day `local_now()` could straddle midnight on a 62-day loop edge — cosmetic but wrong)
- Frontend test fetch stub must route `/availability/range` vs `/availability` by URL before JSON shape (both GET, both availability-named)
- `X-Liff-Id-Token` header case: keep `liffHeaders()` helper — do not inline a differently-cased duplicate
- Encoding scan: all new Thai strings must be in files already UTF-8; no BOM
