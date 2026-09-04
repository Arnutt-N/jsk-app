# Implementation Plan: Thai Date and Calendar Review Fixes (Rev 3)

> Source Findings: `D:/genAI/jsk-app/.claude/PRPs/findings/thai-date-and-calendar-review-findings.md`
> Branch: `fix/thai-date-and-calendar-review-fixes`
> Base: `feat/thai-date-format-and-calendar-standardization` (`c1bece2`)
> Priority: P2 · Complexity: Medium · Review Mode: Dual Adversarial

---

## Codebase Context & Dependencies

### Existing Patterns Captured from Codebase
- **Date Conversion**: `frontend/lib/utils.ts:L8-L17` (`toBE`), `L22-L24` (`daysInMonth(year, month)` where `month` is **1-based**: `1=Jan`, `2=Feb`, ..., `12=Dec`), `isoToYMD` for deterministic local `YYYY-MM-DD` strings.
- **Central Formatter**: `frontend/lib/format-date.ts:L26-L34` (`BANGKOK_FORMATTER` using `Intl.DateTimeFormat` with `timeZone: 'Asia/Bangkok'` and `hourCycle: 'h23'`).
- **Backend Timezone Filtering**: `backend/app/services/business_hours_service.py:L13` (`BANGKOK_TZ = pytz.timezone('Asia/Bangkok')`).
- **Backend Test Fixtures**: `backend/tests/test_admin_requests_endpoints.py:L22-L45` (`_FakeDB`, `_patch_admin_overrides`).
- **Frontend API Client**: `frontend/lib/api-error.ts:L117-L156` (`apiFetch<T>(url)` returning `Promise<ApiFetchResult<T>>` where result has `ok: boolean`, `data: T`, `message: string`).
- **Logging Patterns**:
  - Backend: `backend/app/services/business_hours_service.py:L10` (`logger = logging.getLogger(__name__)`).
  - Frontend: `frontend/lib/logger.ts:L1-L15` (`import { logger } from '@/lib/logger'; logger.error('message', error);`).

### Dependencies
- Frontend: `next` 16.1.1, `react` 19.2.0, `lucide-react`, `motion/react`, `vitest` 2.1.9, `@testing-library/react` 16.2.0.
- Backend: `fastapi` 0.109+, `pytz` 2024.1+, `sqlalchemy` 2.0+, `pytest` 9.1+.

---

## Files to Change

1. `frontend/lib/format-date.ts:L50-L75` — Validate `day <= daysInMonth(y, m)` in `parseDateParts`.
2. `frontend/lib/__tests__/format-date.test.ts:L40-L105` — Add test cases for impossible dates and midnight UTC year rollover.
3. `frontend/lib/booking.ts:L1-L25, L85-L100` — Move re-export import to top of file per `import/first`.
4. `frontend/components/ui/CalendarPickerTH.tsx:L8-L25, L78-L125, L265-L315, L450-L465, L565, L600` — Refactor `partsFrom`, `formatDisplayDate`, `viewMonth`, `dayCells`, month view, and year view to use `parseDateParts`; add `ariaLabel`; fix dark mode contrast; add `Escape` listener; position popover.
5. `backend/app/api/v1/endpoints/admin_requests.py:L295-L310` — Half-open interval `[start_date, next_day)` with `<`.
6. `backend/tests/test_admin_requests_endpoints.py:L22-L45, L1255-L1295` — `_FakeListResult` stubs (`scalars`, `scalar_one_or_none`), assert compiled UTC parameters.
7. `frontend/app/admin/requests/page.tsx:L1-L25, L115-L130, L255-L290` — Dynamic import `{ ssr: false }`, client-side date order validation in Thai, pass `ariaLabel`.
8. `frontend/app/admin/requests/__tests__/page.test.tsx` [NEW] — Full unit test suite for requests filter, date range, clear, and error alerts.
9. `frontend/app/admin/requests/kanban/page.tsx:L1-L25, L105-L115` — Guarded `isOverdue` using `isoToYMD` comparison without false alerts for tasks due today.
10. `frontend/app/admin/bookings/page.tsx:L15-L30` — Add `{ ssr: false }` to dynamic import.
11. `frontend/app/admin/bookings/__tests__/page.test.tsx:L10-L35, L120-L140` — Standardized `MockCalendarPicker` adapter and test for 'ล้างวันที่'.
12. `frontend/app/admin/requests/[id]/page.tsx:L50-L75, L395-L410` — Import `isoToYMD` and use in `handleDueDateChange`.
13. `frontend/components/admin/AuditTimelineEntry.tsx:L40-L60` — Format `due_date` changes with `formatThaiDate`.

---

## Structured Before & After UI States

| Surface | State Before | State After |
|---|---|---|
| `CalendarPickerTH` Day Grid | `text-gray-700 hover:bg-gray-100` (low contrast in dark mode) | `text-text-primary hover:bg-bg dark:text-slate-200 dark:hover:bg-slate-800` |
| `CalendarPickerTH` Popover | `right-0` (overflows left boundary in 192px filter box) | `left-0 sm:left-auto sm:right-0` (anchored safely to container) |
| `/admin/requests` Date Filter | Raw English backend message on reversed dates (`start_date must not be after end_date`) | Localized Thai alert: `วันที่เริ่มต้นต้องไม่มากกว่าวันที่สิ้นสุด` before network call |
| `/admin/requests/kanban` | Task due today highlighted in red with warning icon after 07:00 AM | Normal styling throughout due date; red warning only when date is strictly in the past |
| `/admin/bookings` Date Filter | Generic mock ignoring accessible labels | Standardized mock adapter with clear button test coverage |
| Backend Date Query | Inclusive `<= 23:59:59.999999` susceptible to microsecond rounding | Half-open `< next_day 00:00:00` UTC |

---

## NOT Building (Out of Scope)
- Database schema changes and Alembic migrations (F-19: B-tree index on `service_requests.created_at` deferred to dedicated database optimization ticket).
- General `skip` / `limit` query param refactoring across unrelated endpoints (F-20: deferred).
- LIFF citizen booking mini-app endpoints or booking slot reservation algorithms.

---

## Step-by-Step Implementation Tasks

### Task 1 — Core Date Utilities & Calendar Day Validation (F-12, F-09)

**FINDING COVERAGE**:
- `F-12` (Root cause: `parseDateParts` only checked `day <= 31` without verifying calendar month bounds. Regression risk: Low).
- `F-09` (Root cause: `import` statement in `booking.ts` placed on line 89 instead of top of file. Regression risk: None).

**ACTION**:
Update `frontend/lib/format-date.ts`, `frontend/lib/__tests__/format-date.test.ts`, and `frontend/lib/booking.ts`.

**IMPLEMENT**:
1. In `frontend/lib/format-date.ts`:
   - Import `daysInMonth` from `@/lib/utils`:
     ```typescript
     import { daysInMonth } from '@/lib/utils';
     ```
   - In `parseDateParts(input)`:
     Note that `m` from `split('-')` is already 1-based (`1=Jan`, `2=Feb`, ..., `12=Dec`). `daysInMonth(year, month)` in `frontend/lib/utils.ts:22-24` expects a 1-based month. Therefore pass `daysInMonth(y, m)`:
     ```typescript
     if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
       const [y, m, day] = trimmed.split('-').map(Number);
       if (m < 1 || m > 12 || day < 1) return null;
       const maxDays = daysInMonth(y, m);
       if (day > maxDays) return null;
       return { year: y, month: m - 1, day, hours: 0, minutes: 0 };
     }
     ```
2. In `frontend/lib/__tests__/format-date.test.ts`:
   - Add tests for invalid calendar dates and midnight boundary rollover:
     ```typescript
     it('rejects impossible calendar dates', () => {
       expect(parseDateParts('2023-02-29')).toBeNull(); // Non-leap year Feb 29
       expect(parseDateParts('2024-04-31')).toBeNull(); // April only has 30 days
       expect(parseDateParts('2025-02-30')).toBeNull();
       expect(formatThaiDate('2023-02-29')).toBe('—');
       expect(formatThaiDate('2024-04-31')).toBe('—');
     });

     it('accepts valid leap year Feb 29', () => {
       expect(parseDateParts('2024-02-29')).toEqual({
         year: 2024,
         month: 1, // 0-indexed February
         day: 29,
         hours: 0,
         minutes: 0,
       });
     });

     it('correctly shifts UTC timestamp crossing midnight into Bangkok date', () => {
       // 2025-12-31 18:00:00 UTC = 2026-01-01 01:00:00 Bangkok
       expect(formatThaiDate('2025-12-31T18:00:00.000Z')).toBe('01 ม.ค. 2569');
     });
     ```
3. In `frontend/lib/booking.ts`:
   - Move `import { formatThaiDate as baseFormatThaiDate, type FormatThaiDateOptions } from '@/lib/format-date';` from line 89 to the top of the file alongside line 1.

**GOTCHA**:
- `daysInMonth(y, m)` in `utils.ts` uses `new Date(year, month, 0).getDate()` where passing `month=1` yields January 31, and `month=2` yields February 28/29. Do NOT pass `m - 1`.

**SOURCE REFS**:
- `frontend/lib/utils.ts:L22-L24`
- `frontend/lib/format-date.ts:L50-L65`
- `frontend/lib/booking.ts:L1-L15` and `L89-L96`

**VALIDATE**:
```bash
# from frontend/
npm run test:unit -- format-date
npm run test:unit -- booking
npm run lint
```

---

### Task 2 — `CalendarPickerTH` Component Robustness (F-01, F-06, F-07, F-13, F-14)

**FINDING COVERAGE**:
- `F-01` (Root cause: `partsFrom`, `formatDisplayDate`, `viewMonth`, `dayCells`, and month/year pickers used `new Date(value)` with local getters, shifting dates in negative UTC timezones. Regression risk: Medium).
- `F-06` (Root cause: Day buttons used `text-gray-700 hover:bg-gray-100`, low contrast in dark mode. Regression risk: Low).
- `F-07` (Root cause: `useEffect` guarded by `!isEditing` blocked external clear when `value` became null. Regression risk: Low).
- `F-13` (Root cause: Calendar popup lacked `Escape` key listener. Regression risk: None).
- `F-14` (Root cause: `right-0` caused popover to clip when mounted in narrow containers. Regression risk: Low).

**ACTION**:
Update `frontend/components/ui/CalendarPickerTH.tsx`.

**IMPLEMENT**:
1. In `frontend/components/ui/CalendarPickerTH.tsx`:
   - Update `CalendarPickerTHProps` interface (lines 8-16):
     ```typescript
     export interface CalendarPickerTHProps {
       label?: string;
       ariaLabel?: string;
       value: string | null;
       onChange: (isoDate: string | null) => void;
       error?: string;
       helper?: string;
       required?: boolean;
       className?: string;
     }
     ```
   - Destructure `ariaLabel` in component signature (lines 78-87):
     ```typescript
     export default function CalendarPickerTH({
       label,
       ariaLabel,
       value,
       onChange,
       error,
       helper,
       required,
       className,
     }: CalendarPickerTHProps) {
     ```
   - Import canonical date helpers and constants from `@/lib/format-date`:
     ```typescript
     import {
       parseDateParts,
       formatThaiDate,
       THAI_MONTHS_LONG,
       THAI_MONTHS_SHORT,
     } from '@/lib/format-date';
     ```
   - Remove duplicate local declarations of `THAI_MONTHS_LONG` and `THAI_MONTHS_SHORT`.
   - Refactor `partsFrom` using `parseDateParts`:
     ```typescript
     function partsFrom(value: string | null): { day: string; month: string; beYear: string } {
       if (!value) return { day: "", month: "", beYear: "" };
       const parts = parseDateParts(value);
       if (!parts) return { day: "", month: "", beYear: "" };
       return {
         day: parts.day.toString().padStart(2, "0"),
         month: (parts.month + 1).toString().padStart(2, "0"),
         beYear: toBE(parts.year).toString(),
       };
     }
     ```
   - Refactor `formatDisplayDate`:
     ```typescript
     function formatDisplayDate(value: string | null): string {
       if (!value) return "";
       return formatThaiDate(value, { dayFormat: 'numeric', fallback: '' });
     }
     ```
   - Refactor `viewMonth` to eliminate `new Date(value)` timezone shift (lines 98-106):
     ```typescript
     const viewMonth = useMemo<Date>(() => {
       if (viewMonthOverride) return viewMonthOverride;
       if (value) {
         const parts = parseDateParts(value);
         if (parts) return firstOfMonth(parts.year, parts.month);
       }
       const now = new Date();
       return firstOfMonth(now.getFullYear(), now.getMonth());
     }, [viewMonthOverride, value]);
     ```
   - Lift `selectedParts` to component level (above `dayCells`):
     ```typescript
     const selectedParts = useMemo(() => parseDateParts(value), [value]);
     ```
   - Refactor `dayCells` (around line 266) to use `selectedParts` without calling `useMemo` inside the callback:
     ```typescript
     const isSelectedDay = (d: number) =>
       !!selectedParts &&
       selectedParts.year === year &&
       selectedParts.month === month &&
       selectedParts.day === d;
     ```
     Keep existing `const sel = isSelectedDay(d);` so all subsequent `sel ? ...` references work properly.
   - Refactor month view (around line 565):
     Replace `const selectedDate = value ? new Date(value) : null;`
     with `const selectedMonth = selectedParts ? selectedParts.month : null;`
     and update the month selection check to compare `index === selectedMonth`.
   - Refactor year view (around line 600):
     Replace `const selectedBE = value ? toBE(new Date(value).getFullYear()) : null;`
     with `const selectedBE = selectedParts ? toBE(selectedParts.year) : null;`.
   - In `useEffect([value, isEditing])`, ensure clearing resets `isEditing`:
     ```typescript
     useEffect(() => {
       if (!value) {
         setIsEditing(false);
         if (dayRef.current) dayRef.current.value = "";
         if (monthRef.current) monthRef.current.value = "";
         if (yearRef.current) yearRef.current.value = "";
         return;
       }
       if (!isEditing) {
         const parts = partsFrom(value);
         if (dayRef.current && dayRef.current.value !== parts.day) {
           dayRef.current.value = parts.day;
         }
         if (monthRef.current && monthRef.current.value !== parts.month) {
           monthRef.current.value = parts.month;
         }
         if (yearRef.current && yearRef.current.value !== parts.beYear) {
           yearRef.current.value = parts.beYear;
         }
       }
     }, [value, isEditing]);
     ```
   - In internal clear button click handler (lines 400-410):
     ```typescript
     onChange(null);
     setIsEditing(false);
     setLocalError("");
     ```
   - Add `Escape` keydown listener when `isOpen`:
     ```typescript
     useEffect(() => {
       if (!isOpen) return;
       const handleKeyDown = (e: KeyboardEvent) => {
         if (e.key === "Escape") {
           setIsOpen(false);
           setCalendarView("date");
         }
       };
       window.addEventListener("keydown", handleKeyDown);
       return () => window.removeEventListener("keydown", handleKeyDown);
     }, [isOpen]);
     ```
   - Update unselected day button style:
     Replace `className={cn("... text-gray-700 hover:bg-gray-100 ...")}` with:
     `text-text-primary hover:bg-bg dark:text-slate-200 dark:hover:bg-slate-800`
   - Update popover container positioning (line 453):
     Replace `right-0` with `left-0 sm:left-auto sm:right-0`.
   - Use `ariaLabel` on day input (line 350):
     `aria-label={ariaLabel || "วันที่"}`

**GOTCHA**:
- `selectedParts` must be evaluated at component scope (using `useMemo(() => parseDateParts(value), [value])`), NOT nested inside `dayCells`.

**SOURCE REFS**:
- `frontend/components/ui/CalendarPickerTH.tsx:L8-L15`
- `frontend/components/ui/CalendarPickerTH.tsx:L78-L87`
- `frontend/components/ui/CalendarPickerTH.tsx:L98-L125`
- `frontend/components/ui/CalendarPickerTH.tsx:L265-L315`
- `frontend/components/ui/CalendarPickerTH.tsx:L565`
- `frontend/components/ui/CalendarPickerTH.tsx:L600`

**VALIDATE**:
```bash
# from frontend/
npm run test:unit -- CalendarPickerTH
npm run lint
```

---

### Task 3 — Backend Date Filtering Precision & Comprehensive Tests (F-02, F-10, F-18)

**FINDING COVERAGE**:
- `F-10` (Root cause: Backend used inclusive `time.max` (23:59:59.999999) and `<=`, vulnerable to microsecond rounding in PostgreSQL. Regression risk: Low).
- `F-02` (Root cause: `test_admin_requests_endpoints.py` only checked SQL query string presence, not compiled UTC timestamp values. Regression risk: None).
- `F-18` (Root cause: `_FakeListResult` lacked `.scalars()` and `.scalar_one_or_none()`. Regression risk: None).

**ACTION**:
Update `backend/app/api/v1/endpoints/admin_requests.py` and `backend/tests/test_admin_requests_endpoints.py`.

**IMPLEMENT**:
1. In `backend/app/api/v1/endpoints/admin_requests.py`:
   - Import `timedelta`:
     ```python
     from datetime import datetime, date, time, timezone, timedelta
     ```
   - Replace inclusive `time.max` with half-open interval `[start_date, next_day)` using `<`:
     ```python
     if start_date:
         start_naive = datetime.combine(start_date, time.min)
         start_dt = BANGKOK_TZ.localize(start_naive).astimezone(timezone.utc)
         query = query.where(ServiceRequest.created_at >= start_dt)
     if end_date:
         next_day = end_date + timedelta(days=1)
         next_naive = datetime.combine(next_day, time.min)
         end_dt = BANGKOK_TZ.localize(next_naive).astimezone(timezone.utc)
         query = query.where(ServiceRequest.created_at < end_dt)
     ```
2. In `backend/tests/test_admin_requests_endpoints.py`:
   - Add `scalars` and `scalar_one_or_none` to `_FakeListResult`:
     ```python
     class _FakeListResult:
         def __init__(self, rows):
             self._rows = rows

         def all(self):
             return self._rows

         def scalars(self):
             return self

         def scalar_one_or_none(self):
             return self._rows[0] if self._rows else None
     ```
   - Update `test_list_requests_date_filter_bounds` to assert compiled UTC parameter values:
     ```python
     def test_list_requests_date_filter_bounds():
         fake_db = _FakeDB()
         fake_request = _build_editable_request(request_id=1)
         fake_db._fake_list_rows = [(fake_request, "Admin User")]
         teardown = _patch_admin_overrides(fake_db)

         client = TestClient(app)
         try:
             response = client.get("/api/v1/admin/requests?start_date=2026-09-01&end_date=2026-09-03")
         finally:
             client.close()
             teardown()

         assert response.status_code == 200
         assert "created_at >=" in str(fake_db.last_stmt)
         assert "created_at <" in str(fake_db.last_stmt)

         # Verify compiled UTC timestamp parameters
         # Bangkok 2026-09-01 00:00:00 -> 2026-08-31 17:00:00 UTC
         # Bangkok 2026-09-04 00:00:00 (next day) -> 2026-09-03 17:00:00 UTC
         compiled = fake_db.last_stmt.compile()
         params = compiled.params
         param_values = list(params.values())
         assert any(isinstance(v, datetime) and v.year == 2026 and v.month == 8 and v.day == 31 and v.hour == 17 for v in param_values)
         assert any(isinstance(v, datetime) and v.year == 2026 and v.month == 9 and v.day == 3 and v.hour == 17 for v in param_values)
     ```
   - Add tests for open-ended queries (start-only, end-only) and same-day bounds:
     ```python
     def test_list_requests_single_bound_and_same_day():
         fake_db = _FakeDB()
         fake_request = _build_editable_request(request_id=1)
         fake_db._fake_list_rows = [(fake_request, "Admin User")]
         teardown = _patch_admin_overrides(fake_db)

         client = TestClient(app)
         try:
             # Start only
             r1 = client.get("/api/v1/admin/requests?start_date=2026-09-01")
             assert r1.status_code == 200
             assert "created_at >=" in str(fake_db.last_stmt)
             assert "created_at <" not in str(fake_db.last_stmt)

             # End only
             r2 = client.get("/api/v1/admin/requests?end_date=2026-09-03")
             assert r2.status_code == 200
             assert "created_at <" in str(fake_db.last_stmt)
             assert "created_at >=" not in str(fake_db.last_stmt)

             # Same day: start == end
             r3 = client.get("/api/v1/admin/requests?start_date=2026-09-01&end_date=2026-09-01")
             assert r3.status_code == 200
             assert "created_at >=" in str(fake_db.last_stmt)
             assert "created_at <" in str(fake_db.last_stmt)
         finally:
             client.close()
             teardown()
     ```

**GOTCHA**:
- The backend tests run with Windows virtualenv `.\venv\Scripts\python.exe -m pytest tests/test_admin_requests_endpoints.py -v`.
- Because SQLAlchemy compilation may prefix bound parameter keys (e.g. `created_at_1`, `created_at_2`), inspect `list(params.values())` rather than hardcoding parameter key names.

**SOURCE REFS**:
- `backend/app/api/v1/endpoints/admin_requests.py:L266-L310`
- `backend/tests/test_admin_requests_endpoints.py:L22-L45`
- `backend/tests/test_admin_requests_endpoints.py:L1255-L1295`

**VALIDATE**:
```bash
# from backend/
.\venv\Scripts\python.exe -m pytest tests/test_admin_requests_endpoints.py -v
```

---

### Task 4 — Admin Requests Page UX, Dynamic SSR Safety, & Unit Test Suite (F-03, F-08, F-11, F-15)

**FINDING COVERAGE**:
- `F-03` (Root cause: `frontend/app/admin/requests/__tests__/page.test.tsx` did not exist. Regression risk: None).
- `F-08` (Root cause: Dynamic import lacked `{ ssr: false }`. Regression risk: Low).
- `F-11` (Root cause: No client-side date order check; displayed raw backend 400 English message. Regression risk: Low).
- `F-15` (Root cause: Both pickers lacked distinctive accessible labels. Regression risk: Low).

**ACTION**:
Update `frontend/app/admin/requests/page.tsx` and create `frontend/app/admin/requests/__tests__/page.test.tsx`.

**IMPLEMENT**:
1. In `frontend/app/admin/requests/page.tsx`:
   - Move dynamic import below static imports and set `{ ssr: false }`:
     ```typescript
     const CalendarPickerTH = dynamic(() => import('@/components/ui/CalendarPickerTH'), { ssr: false });
     ```
   - Add state for date range validation error:
     ```typescript
     const [dateRangeError, setDateRangeError] = useState<string | null>(null);
     ```
   - In `fetchRequests`:
     ```typescript
     if (filter.startDate && filter.endDate && filter.startDate > filter.endDate) {
       setDateRangeError('วันที่เริ่มต้นต้องไม่มากกว่าวันที่สิ้นสุด');
       setLoading(false);
       return;
     }
     setDateRangeError(null);
     ```
   - In Date Range Filter Row:
     Pass `ariaLabel="จากวันที่"` and `ariaLabel="ถึงวันที่"` to the respective `CalendarPickerTH` instances:
     ```tsx
     <div className="flex items-center gap-2">
       <span className="text-xs font-medium text-text-secondary whitespace-nowrap">จากวันที่:</span>
       <div className="w-48">
         <CalendarPickerTH
           ariaLabel="จากวันที่"
           value={filter.startDate ? new Date(`${filter.startDate}T00:00:00`).toISOString() : null}
           onChange={(iso) => {
             setDateRangeError(null);
             setFilter(prev => ({ ...prev, startDate: iso ? isoToYMD(iso) : '' }));
           }}
         />
       </div>
     </div>
     <div className="flex items-center gap-2">
       <span className="text-xs font-medium text-text-secondary whitespace-nowrap">ถึงวันที่:</span>
       <div className="w-48">
         <CalendarPickerTH
           ariaLabel="ถึงวันที่"
           value={filter.endDate ? new Date(`${filter.endDate}T00:00:00`).toISOString() : null}
           onChange={(iso) => {
             setDateRangeError(null);
             setFilter(prev => ({ ...prev, endDate: iso ? isoToYMD(iso) : '' }));
           }}
         />
       </div>
     </div>
     {(filter.startDate || filter.endDate) && (
       <Button
         variant="ghost"
         size="sm"
         onClick={() => {
           setDateRangeError(null);
           setFilter(prev => ({ ...prev, startDate: '', endDate: '' }));
         }}
         className="text-xs text-text-tertiary hover:text-text-primary"
       >
         ล้างวันที่
       </Button>
     )}
     ```
   - Render `dateRangeError` alert under filter row:
     ```tsx
     {dateRangeError && (
       <div className="mt-3 flex items-center gap-2 text-xs text-danger-text bg-danger/10 p-2.5 rounded-lg">
         <AlertCircle size={14} className="shrink-0" />
         <span>{dateRangeError}</span>
       </div>
     )}
     ```
2. Create `frontend/app/admin/requests/__tests__/page.test.tsx`:
   Write the complete test file with mocks for `apiFetch`, `usePermissions`, and `useToast`:
   ```tsx
   // @vitest-environment jsdom
   import { render, screen, waitFor, fireEvent } from '@testing-library/react';
   import userEvent from '@testing-library/user-event';
   import { describe, it, expect, vi, beforeEach } from 'vitest';
   import AdminRequestList from '../page';
   import { isoToYMD } from '@/lib/utils';

   vi.mock('@/components/ui/CalendarPickerTH', () => ({
     default: function MockCalendarPicker({
       value,
       onChange,
       ariaLabel,
     }: {
       value: string | null;
       onChange: (val: string | null) => void;
       ariaLabel?: string;
     }) {
       return (
         <input
           type="date"
           aria-label={ariaLabel || 'วันที่'}
           value={value ? isoToYMD(value) : ''}
           onChange={(e) => {
             const val = e.target.value;
             if (!val) {
               onChange(null);
             } else {
               const d = new Date(`${val}T00:00:00`);
               onChange(!isNaN(d.getTime()) ? d.toISOString() : null);
             }
           }}
         />
       );
     },
   }));

   vi.mock('@/lib/permissions', () => ({
     usePermissions: () => ({
       hasPermission: () => true,
       isAdmin: true,
       userRole: 'SUPER_ADMIN',
     }),
   }));

   vi.mock('@/components/ui/Toast', () => ({
     useToast: () => ({ toast: vi.fn() }),
   }));

   const mockApiFetch = vi.fn();
   vi.mock('@/lib/api-error', () => ({
     apiFetch: (...args: unknown[]) => mockApiFetch(...args),
   }));

   describe('AdminRequestList date filtering', () => {
     beforeEach(() => {
       vi.clearAllMocks();
       mockApiFetch.mockResolvedValue({
         ok: true,
         data: [
           {
             id: '1',
             firstname: 'สมชาย',
             lastname: 'ใจดี',
             topic_category: 'กองทุนยุติธรรม',
             status: 'PENDING',
             agency: 'สบท.',
             province: 'กรุงเทพฯ',
             district: 'ดุสิต',
             created_at: '2026-09-03T07:44:00+07:00',
           },
         ],
       });
     });

     it('renders the requests table and date filter inputs', async () => {
       render(<AdminRequestList />);
       expect(await screen.findByText('สมชาย ใจดี')).toBeInTheDocument();
       expect(screen.getByLabelText('จากวันที่')).toBeInTheDocument();
       expect(screen.getByLabelText('ถึงวันที่')).toBeInTheDocument();
     });

     it('queries backend with start_date and end_date params', async () => {
       render(<AdminRequestList />);
       await screen.findByText('สมชาย ใจดี');

       fireEvent.change(screen.getByLabelText('จากวันที่'), { target: { value: '2026-09-01' } });
       fireEvent.change(screen.getByLabelText('ถึงวันที่'), { target: { value: '2026-09-03' } });

       await waitFor(() => {
         const lastCallUrl = mockApiFetch.mock.calls[mockApiFetch.mock.calls.length - 1][0];
         expect(lastCallUrl).toContain('start_date=2026-09-01');
         expect(lastCallUrl).toContain('end_date=2026-09-03');
       });
     });

     it('displays localized Thai error when start_date > end_date', async () => {
       render(<AdminRequestList />);
       await screen.findByText('สมชาย ใจดี');

       fireEvent.change(screen.getByLabelText('จากวันที่'), { target: { value: '2026-09-05' } });
       fireEvent.change(screen.getByLabelText('ถึงวันที่'), { target: { value: '2026-09-01' } });

       expect(await screen.findByText('วันที่เริ่มต้นต้องไม่มากกว่าวันที่สิ้นสุด')).toBeInTheDocument();
     });

     it('clears date inputs and refetches when "ล้างวันที่" is clicked', async () => {
       const user = userEvent.setup();
       render(<AdminRequestList />);
       await screen.findByText('สมชาย ใจดี');

       fireEvent.change(screen.getByLabelText('จากวันที่'), { target: { value: '2026-09-01' } });
       const clearBtn = await screen.findByRole('button', { name: 'ล้างวันที่' });
       await user.click(clearBtn);

       await waitFor(() => {
         const lastCallUrl = mockApiFetch.mock.calls[mockApiFetch.mock.calls.length - 1][0];
         expect(lastCallUrl).not.toContain('start_date=');
       });
     });
   });
   ```

**GOTCHA**:
- Using `ariaLabel` on `CalendarPickerTH` avoids rendering duplicate `<label>` blocks while giving test queries `screen.getByLabelText('จากวันที่')` and `screen.getByLabelText('ถึงวันที่')` direct, unambiguous access.

**SOURCE REFS**:
- `frontend/app/admin/requests/page.tsx:L90-L135`
- `frontend/app/admin/requests/page.tsx:L250-L290`
- `frontend/lib/api-error.ts:L117-L156`

**VALIDATE**:
```bash
# from frontend/
npm run test:unit -- requests/page
npm run lint
```

---

### Task 5 — Admin Bookings & Kanban Polish (F-04, F-05, F-08, F-16, F-17)

**FINDING COVERAGE**:
- `F-04` (Root cause: `MockCalendarPicker` lacked `ariaLabel` support. Regression risk: None).
- `F-05` (Root cause: `isOverdue` compared ISO timestamp against current timestamp without normalizing due date string to calendar day. Regression risk: Low).
- `F-08` (Root cause: Dynamic import lacked `{ ssr: false }`. Regression risk: Low).
- `F-16` (Root cause: `handleDueDateChange` manually formatted string without `isoToYMD`. Regression risk: Low).
- `F-17` (Root cause: `AuditTimelineEntry` did not format date fields with `formatThaiDate`. Regression risk: Low).

**ACTION**:
Update `kanban/page.tsx`, `bookings/page.tsx`, `bookings/__tests__/page.test.tsx`, `requests/[id]/page.tsx`, and `AuditTimelineEntry.tsx`.

**IMPLEMENT**:
1. In `frontend/app/admin/requests/kanban/page.tsx`:
   - Refactor `isOverdue` to compare normalized local calendar date strings:
     ```typescript
     import { isoToYMD } from '@/lib/utils';

     const isOverdue = (date?: string | null) => {
       if (!date) return false;
       const target = isoToYMD(date);
       const today = isoToYMD(new Date().toISOString());
       return Boolean(target && target < today);
     };
     ```
2. In `frontend/app/admin/bookings/page.tsx`:
   - Set `{ ssr: false }` on dynamic import:
     ```typescript
     const CalendarPickerTH = dynamic(() => import('@/components/ui/CalendarPickerTH'), { ssr: false });
     ```
3. In `frontend/app/admin/bookings/__tests__/page.test.tsx`:
   - Standardize `MockCalendarPicker` (F-04) with `ariaLabel` support:
     ```tsx
     vi.mock('@/components/ui/CalendarPickerTH', () => ({
       default: function MockCalendarPicker({
         value,
         onChange,
         ariaLabel,
       }: {
         value: string | null;
         onChange: (val: string | null) => void;
         ariaLabel?: string;
       }) {
         return (
           <input
             type="date"
             aria-label={ariaLabel || 'วันที่'}
             value={value ? isoToYMD(value) : ''}
             onChange={(e) => {
               const val = e.target.value;
               if (!val) {
                 onChange(null);
               } else {
                 const d = new Date(`${val}T00:00:00`);
                 onChange(!isNaN(d.getTime()) ? d.toISOString() : null);
               }
             }}
           />
         );
       },
     }));
     ```
   - Add test case verifying clicking 'ล้างวันที่':
     ```tsx
     it('clears date filter and re-fetches all bookings when "ล้างวันที่" is clicked', async () => {
       const user = userEvent.setup();
       await renderLoaded();
       await user.type(screen.getByLabelText('วันที่'), '2026-08-19');
       const clearButton = await screen.findByRole('button', { name: 'ล้างวันที่' });
       await user.click(clearButton);
       await waitFor(() => {
         const lastCall = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
         expect(String(lastCall[0])).not.toContain('date=');
       });
     });
     ```
4. In `frontend/app/admin/requests/[id]/page.tsx`:
   - Add `import { isoToYMD } from '@/lib/utils';` at lines 50-70.
   - In `handleDueDateChange(iso: string | null)`:
     ```typescript
     const ymd = iso ? isoToYMD(iso) : '';
     ```
5. In `frontend/components/admin/AuditTimelineEntry.tsx`:
   - In field change rendering (lines 40-55), format date values:
     ```tsx
     {Object.entries(fields).map(([field, change]) => {
       const isDateField = field === 'due_date' || field.endsWith('_at');
       const oldVal = isDateField && change.old ? formatThaiDate(change.old) : (change.old || '—');
       const newVal = isDateField && change.new ? formatThaiDate(change.new) : (change.new || '—');
       return (
         <div key={field} className="flex flex-wrap items-baseline gap-x-2">
           <span className="font-semibold text-text-primary">{getRequestFieldLabel(field)}:</span>
           <span className="line-through text-text-tertiary thai-no-break">{oldVal}</span>
           <span className="text-text-tertiary">→</span>
           <span className="font-medium text-text-primary thai-no-break">{newVal}</span>
         </div>
       );
     })}
     ```

**GOTCHA**:
- In `isOverdue`, `date` may be an ISO string like `'2026-09-03T00:00:00Z'`. Calling `isoToYMD(date)` ensures it normalizes to `'2026-09-03'` before comparison against `today`.

**SOURCE REFS**:
- `frontend/app/admin/requests/kanban/page.tsx:L105-L115`
- `frontend/app/admin/bookings/page.tsx:L20-L30`
- `frontend/app/admin/bookings/__tests__/page.test.tsx:L10-L35`
- `frontend/app/admin/requests/[id]/page.tsx:L395-L410`
- `frontend/components/admin/AuditTimelineEntry.tsx:L40-L55`

**VALIDATE**:
```bash
# from frontend/
npm run test:unit -- booking
npm run test:unit -- requests/page
npm run test:unit
npm run lint
npm run build
```

---

## Testing Strategy & Validation Matrix

### Concrete Input / Expected Test Pairs

| Scenario | Input | Expected Output |
|---|---|---|
| Non-leap year Feb 29 | `parseDateParts('2023-02-29')` | `null` |
| Leap year Feb 29 | `parseDateParts('2024-02-29')` | `{ year: 2024, month: 1, day: 29, ... }` |
| 31 April (Invalid) | `parseDateParts('2024-04-31')` | `null` |
| Midnight year shift | `formatThaiDate('2025-12-31T18:00:00.000Z')` | `'01 ม.ค. 2569'` |
| End date half-open | `end_date = 2026-09-03` | `created_at < 2026-09-03 17:00:00 UTC` |
| Same-day range | `start_date = 2026-09-03, end_date = 2026-09-03` | `>= 2026-09-02 17:00:00 UTC` AND `< 2026-09-03 17:00:00 UTC` |
| Kanban today task | `due_date = '2026-09-03T00:00:00Z'` on 2026-09-03 | `isOverdue === false` |
| Date order client error | `startDate = 2026-09-05, endDate = 2026-09-01` | Error alert: `'วันที่เริ่มต้นต้องไม่มากกว่าวันที่สิ้นสุด'` |

### Concrete Edge-Case Checklist
- [ ] Leap year rollover (`2024-02-29` valid, `2023-02-29` null)
- [ ] 30-day month boundary (`2024-04-30` valid, `2024-04-31` null)
- [ ] UTC midnight crossing (`2025-12-31T18:00:00.000Z` renders `01 ม.ค. 2569`)
- [ ] Negative UTC client offset (calendar cells and month headers stay on Bangkok date)
- [ ] Kanban task due today is not flagged overdue at 08:00 AM Bangkok time
- [ ] Clearing date via 'ล้างวันที่' button removes `start_date`/`end_date` query params
- [ ] Submitting start date after end date displays Thai error message without network call
- [ ] Pressing `Escape` on open calendar popup closes popup and resets view to 'date'
- [ ] Unselected days in dark mode meet accessible contrast ratio (>= 4.5:1)
- [ ] Backend queries with only `start_date` or only `end_date` compile valid SQL

### Automated Validation Commands
```bash
# Frontend Unit Tests (from frontend/)
npm run test:unit -- format-date
npm run test:unit -- CalendarPickerTH
npm run test:unit -- booking
npm run test:unit -- requests/page
npm run test:unit

# Frontend Lint & Production Build (from frontend/)
npm run lint
npm run build

# Backend Tests (from backend/)
.\venv\Scripts\python.exe -m pytest tests/test_admin_requests_endpoints.py -v
```

---

## Risks & Mitigations
1. **Timezone Conversion Drift**:
   - *Risk*: Converting `next_day` to UTC could drift by 1 day if timezone is not explicitly localized before UTC conversion.
   - *Mitigation*: Always call `BANGKOK_TZ.localize(datetime.combine(next_day, time.min)).astimezone(timezone.utc)`.
2. **SSR Dynamic Import Hydration**:
   - *Risk*: `CalendarPickerTH` accessing client-side DOM objects during server render.
   - *Mitigation*: Explicitly set `{ ssr: false }` across all `dynamic()` calls.
3. **Empty Date Input Clearing**:
   - *Risk*: Clearing `value` in parent state leaves internal input text in the DOM.
   - *Mitigation*: In `useEffect([value, isEditing])`, if `!value`, force-clear all input ref values and set `setIsEditing(false)`.
