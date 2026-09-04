# Codebase Review Findings: thai-date-and-calendar-review-fixes

**Target**: Branch `feat/thai-date-format-and-calendar-standardization`
**Scope**: Date standardization, CalendarPickerTH component, Backend date range filtering, Requests & Bookings admin pages
**Review Mode**: Parallel Multi-Agent Read-Only Review (Frontend Specialist, Backend/Security Specialist, QA/Test Specialist)
**Date**: 2026-09-03
**Working Branch**: `fix/thai-date-and-calendar-review-fixes`

## Summary of Findings

| Severity | Total Found | Accepted | Deferred / Rejected |
|---|---|---|---|
| Critical | 0 | 0 | 0 |
| High | 4 | 4 | 0 |
| Medium | 8 | 8 | 0 |
| Low | 8 | 6 | 2 (deferred) |
| **Total** | **20** | **18** | **2** |

---

## 🔴 Critical Issues
*None identified.*

---

## 🟠 High Severity Issues

### F-01: `CalendarPickerTH` Uses Local Time Getters on UTC Date Strings, Causing Timezone Rollback
- **Area**: frontend
- **Severity**: High
- **Location**: `frontend/components/ui/CalendarPickerTH.tsx:60-77`
- **Reporters**: 2 (Frontend Specialist, QA Specialist)
- **Category**: logic-error
- **Evidence**: `partsFrom`, `formatDisplayDate`, `viewMonth`, and `dayCells` parse values using `const d = new Date(value);` followed by local getters (`d.getDate()`, `d.getMonth()`, `d.getFullYear()`). When a standard ISO date string (or UTC midnight string like `'2026-08-19'`) is passed in an environment with negative UTC offset (or UTC test runner), `d.getDate()` shifts backward to the 18th, highlighting and displaying the incorrect day/month.
- **Disposition**: Accepted
- **Fix Strategy**: Refactor `partsFrom` and `formatDisplayDate` in `CalendarPickerTH.tsx` to utilize `parseDateParts` from `@/lib/format-date` which safely extracts calendar components without timezone shift, and reuse canonical `THAI_MONTHS_SHORT` / `THAI_MONTHS_LONG`.

### F-02: Backend Date Filter Test Only Checks Substring Presence, Leaving Timezone Parameter Accuracy Unverified
- **Area**: backend / tests
- **Severity**: High
- **Location**: `backend/tests/test_admin_requests_endpoints.py:1258-1275`
- **Reporters**: 2 (Backend Specialist, QA Specialist)
- **Category**: missing-test
- **Evidence**: `test_list_requests_date_filter_bounds` only asserts that substrings `'created_at >='` and `'created_at <='` appear in `str(fake_db.last_stmt)`. It does not verify the compiled UTC parameter values (e.g. `2026-08-31 17:00:00 UTC` for Bangkok `2026-09-01`). An error in `BANGKOK_TZ` localization would still pass the test.
- **Disposition**: Accepted
- **Fix Strategy**: Compile `fake_db.last_stmt` and assert exact UTC datetime parameter bounds. Add tests for open-ended queries (start-only, end-only) and same-day bounds (`start_date == end_date`).

### F-03: Missing Frontend Unit Tests for Admin Requests Page Date Range Filtering
- **Area**: tests
- **Severity**: High
- **Location**: `frontend/app/admin/requests/page.tsx:90`
- **Reporters**: 1 (QA Specialist)
- **Category**: missing-test
- **Evidence**: `frontend/app/admin/requests/page.tsx` integrates start_date and end_date query filters with `CalendarPickerTH`, search param serialization, and a 'ล้างวันที่' reset button, but no test file exists (`frontend/app/admin/requests/__tests__/page.test.tsx`).
- **Disposition**: Accepted
- **Fix Strategy**: Create `frontend/app/admin/requests/__tests__/page.test.tsx` verifying filter parameter construction, date range selection, clearing via 'ล้างวันที่', and error handling.

### F-04: Bookings Test Calendar Mock Masking Multi-Input Component Contract
- **Area**: tests
- **Severity**: High
- **Location**: `frontend/app/admin/bookings/__tests__/page.test.tsx:10-35`
- **Reporters**: 1 (QA Specialist)
- **Category**: bad-practice
- **Evidence**: `MockCalendarPicker` mocks `CalendarPickerTH` as a plain HTML5 `<input type="date" aria-label="วันที่" />`. Real `CalendarPickerTH` renders 3 text inputs (Day, Month, BE Year). While sufficient for isolating the page, typing full ISO strings into `aria-label="วันที่"` masks component integration bugs.
- **Disposition**: Accepted
- **Fix Strategy**: Standardize the mock adapter in `bookings/__tests__/page.test.tsx` to accept date input while exposing clear contract triggers.

---

## 🟡 Medium Severity Issues

### F-05: Kanban `isOverdue` Evaluates Tasks Due Today as Overdue During Business Hours
- **Area**: frontend
- **Severity**: Medium
- **Location**: `frontend/app/admin/requests/kanban/page.tsx:111`
- **Reporters**: 1 (Frontend Specialist)
- **Category**: logic-error
- **Evidence**: `new Date(date) < new Date()` compares date-only string (UTC midnight `00:00:00Z`) against current timestamp. In Bangkok (+07:00), after 07:00 AM on the due date itself, tasks due today are falsely marked as overdue with red warning styling.
- **Disposition**: Accepted
- **Fix Strategy**: Compare calendar date strings directly using `isoToYMD(new Date().toISOString()) > date` so tasks due today are not overdue until the day has passed.

### F-06: Calendar Day Buttons Inaccessible Contrast in Dark Mode
- **Area**: frontend
- **Severity**: Medium
- **Location**: `frontend/components/ui/CalendarPickerTH.tsx:313`
- **Reporters**: 1 (Frontend Specialist)
- **Category**: framework-issue
- **Evidence**: Unselected day buttons in the day grid are styled with `className='text-gray-700 hover:bg-gray-100'`. In dark mode, `#374151` on `#1e293b` produces poor contrast (~1.3:1) and a harsh hover flash.
- **Disposition**: Accepted
- **Fix Strategy**: Replace with design tokens `text-text-primary hover:bg-bg` consistent with month and year picker buttons.

### F-07: CalendarPickerTH DOM Inputs Fail to Clear When `value` Set to Null by Parent
- **Area**: frontend
- **Severity**: Medium
- **Location**: `frontend/components/ui/CalendarPickerTH.tsx:111`
- **Reporters**: 1 (Frontend Specialist)
- **Category**: bug
- **Evidence**: Synchronization `useEffect` is guarded by `if (!isEditing)`. If a user focuses an input or types partial digits, `isEditing` becomes true. When the parent clears `value` via external 'ล้างวันที่', `isEditing` remains true and DOM inputs fail to clear.
- **Disposition**: Accepted
- **Fix Strategy**: Reset `isEditing` to `false` when `value` becomes null in `useEffect`, and inside the internal clear handler.

### F-08: Dynamic Import of `CalendarPickerTH` Missing `{ ssr: false }`
- **Area**: frontend
- **Severity**: Medium
- **Location**: `frontend/app/admin/bookings/page.tsx:23` & `frontend/app/admin/requests/page.tsx:13`
- **Reporters**: 1 (Frontend Specialist)
- **Category**: framework-issue
- **Evidence**: `dynamic(() => import('@/components/ui/CalendarPickerTH'))` defaults to `ssr: true`. `CalendarPickerTH` evaluates current client time for 'วันนี้' and month defaults, creating a risk of hydration mismatch between server and client.
- **Disposition**: Accepted
- **Fix Strategy**: Add `{ ssr: false }` to the dynamic import options.

### F-09: Misplaced Mid-File Import in `booking.ts`
- **Area**: frontend
- **Severity**: Medium
- **Location**: `frontend/lib/booking.ts:89`
- **Reporters**: 1 (Frontend Specialist)
- **Category**: bad-practice
- **Evidence**: `import { formatThaiDate as baseFormatThaiDate, type FormatThaiDateOptions } from '@/lib/format-date';` is located on line 89 in the middle of functions, violating ESLint `import/first` and code style conventions.
- **Disposition**: Accepted
- **Fix Strategy**: Move the import to the top of `booking.ts`.

### F-10: Backend Date Filter Uses Inclusive `time.max` Rather than Half-Open Interval
- **Area**: backend
- **Severity**: Medium
- **Location**: `backend/app/api/v1/endpoints/admin_requests.py:302`
- **Reporters**: 1 (Backend Specialist)
- **Category**: edge-case
- **Evidence**: `end_naive = datetime.combine(end_date, time.max)` with inclusive `<=` is susceptible to microsecond rounding issues in PostgreSQL where `.999999` can round to next-day `00:00:00`.
- **Disposition**: Accepted
- **Fix Strategy**: Use half-open interval `[start, next_day)` with strict `<` comparison: `next_day = end_date + timedelta(days=1)`, localized to Bangkok midnight UTC, and `created_at < end_dt`.

### F-11: Admin Requests Page Missing Client-Side Date Order Validation & Localized Error
- **Area**: frontend
- **Severity**: Medium
- **Location**: `frontend/app/admin/requests/page.tsx:118`
- **Reporters**: 1 (QA Specialist)
- **Category**: logic-error
- **Evidence**: When `startDate > endDate`, frontend makes an invalid query, and when backend returns 400, page renders raw English error "start_date must not be after end_date" instead of localized Thai text.
- **Disposition**: Accepted
- **Fix Strategy**: Prevent query dispatch if `startDate > endDate`, surface Thai error "วันที่เริ่มต้นต้องไม่มากกว่าวันที่สิ้นสุด", and reset error when dates are adjusted.

### F-12: `parseDateParts` Missing Day-in-Month Calendar Validation
- **Area**: frontend
- **Severity**: Medium
- **Location**: `frontend/lib/format-date.ts:58-60`
- **Reporters**: 1 (QA Specialist)
- **Category**: edge-case
- **Evidence**: `parseDateParts` validates `m >= 1 && m <= 12` and `day <= 31`, but doesn't validate day against month length (e.g. `2023-02-29` on non-leap year or `2024-04-31` bypasses check and formats impossible dates).
- **Disposition**: Accepted
- **Fix Strategy**: Validate `day <= daysInMonth(y, m)` in `parseDateParts`, returning `null` for invalid calendar dates.

---

## 🟢 Low Severity Issues

### F-13: `CalendarPickerTH` Dialog Missing Escape Key Listener
- **Area**: frontend
- **Severity**: Low
- **Location**: `frontend/components/ui/CalendarPickerTH.tsx:125`
- **Disposition**: Accepted (Add keydown listener for 'Escape' key).

### F-14: `CalendarPickerTH` Popover Left-Edge Overflow Risk
- **Area**: frontend
- **Severity**: Low
- **Location**: `frontend/components/ui/CalendarPickerTH.tsx:453`
- **Disposition**: Accepted (Change to `left-0 sm:left-auto sm:right-0`).

### F-15: Accessible Labels for Start/End Date Pickers in Requests Filter
- **Area**: frontend
- **Severity**: Low
- **Location**: `frontend/app/admin/requests/page.tsx:260`
- **Disposition**: Accepted (Pass explicit `label` or aria descriptors to differentiate pickers).

### F-16: `handleDueDateChange` Manual String Formatting in Request Detail
- **Area**: frontend
- **Severity**: Low
- **Location**: `frontend/app/admin/requests/[id]/page.tsx:401`
- **Disposition**: Accepted (Use `isoToYMD`).

### F-17: `AuditTimelineEntry` Field Change Value Formatting for Dates
- **Area**: frontend
- **Severity**: Low
- **Location**: `frontend/components/admin/AuditTimelineEntry.tsx:40`
- **Disposition**: Accepted (Format date field changes with `formatThaiDate`).

### F-18: `_FakeListResult` Missing Scalar Stub Methods
- **Area**: backend
- **Severity**: Low
- **Location**: `backend/tests/test_admin_requests_endpoints.py:25`
- **Disposition**: Accepted (Add stub methods for `.scalar_one_or_none()` and `.scalars()`).

### F-19: Database Index on `service_requests.created_at`
- **Area**: backend
- **Severity**: Low (Performance optimization)
- **Location**: `app/models/service_request.py:95`
- **Disposition**: Deferred (Schema change out of current sprint scope, reserved for DB migration task).

### F-20: `skip` and `limit` Query Param Validation in `list_requests`
- **Area**: backend
- **Severity**: Low
- **Location**: `backend/app/api/v1/endpoints/admin_requests.py:274`
- **Disposition**: Deferred (Pre-existing endpoint signature outside date standardization scope).
