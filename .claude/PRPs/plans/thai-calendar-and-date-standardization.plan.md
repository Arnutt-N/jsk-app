# Plan — thai-calendar-and-date-standardization: unified Thai Buddhist date display + CalendarPickerTH filters

> PRD: none · branch: `feat/thai-date-format-and-calendar-standardization` · base: `9fd4582` (main)
> Complexity: Medium · Priority: P2

## Summary
Standardize Thai Buddhist Era (พ.ศ.) date formatting and calendar picker usage across the Admin portal.
Currently, `/admin/requests` renders dates inconsistently across 4 different ad-hoc formats (2-digit BE year `69`, slash format `3/9/2569`, 4-digit BE year `2569`, with/without time) and lacks any date range filtering. Additionally, `/admin/bookings` still uses a raw browser `<input type="date">` that exposes Gregorian dates rather than the system's `CalendarPickerTH`.

This plan establishes a central Thai date formatting utility (`frontend/lib/format-date.ts`) using deterministic Bangkok timezone formatting (`Asia/Bangkok`), adds date-range filtering to `/admin/requests` (frontend + backend with Bangkok timezone safety via `pytz`), and standardizes date pickers and displays across the request management and booking flows without breaking existing test suites.

---

## Files to Change & Scope

### Files to Change
- `frontend/lib/format-date.ts` [NEW] — Single source of truth for Thai Buddhist Era date formatting with Bangkok timezone safety (`Asia/Bangkok`, `hourCycle: 'h23'`) and self-contained month arrays.
- `frontend/lib/__tests__/format-date.test.ts` [NEW] — Unit tests for the formatter with full edge-case matrix.
- `frontend/lib/booking.ts:L89-L95` [MODIFY] — Re-export `formatThaiDate` wrapping `baseFormatThaiDate` with backwards-compatible defaults (`dayFormat: 'numeric'`, `fallback: '-'`) and optional `options?: FormatThaiDateOptions` passthrough.
- `frontend/components/ui/CalendarPickerTH.tsx:L8-L15, L325-L388` [MODIFY] — Add `className?: string` to `CalendarPickerTHProps`, support `className` on root container `className={cn("w-full relative", className)}` without hardcoding `max-w-[220px]` globally (preserving full-width forms intact), and tune inner inputs (day/month/year) to be snug and proportional.
- `backend/app/api/v1/endpoints/admin_requests.py:L266-L310` [MODIFY] — Add `start_date` and `end_date` query filters to `list_requests` using `BANGKOK_TZ` from `app.services.business_hours_service`, with validation that `start_date <= end_date` (HTTPException 400).
- `backend/tests/test_admin_requests_endpoints.py:L15-L45, L155-L176, L1240-L1250` [MODIFY] — Add `_FakeListResult` and `test_list_requests_date_filter_bounds` using existing `_patch_admin_overrides(fake_db)`.
- `frontend/app/admin/requests/page.tsx:L91-L130, L218-L248, L313-L324, L436` [MODIFY] — Integrate `formatThaiDate` and `CalendarPickerTH` date range filter in an appended second row inside CardContent with compact wrapper `<div className="w-48">`, wired to `filter` state and `useCallback` dependency array with `query.append`.
- `frontend/app/admin/requests/kanban/page.tsx:L175, L180` [MODIFY] — Replace slash dates with `formatThaiDate`.
- `frontend/app/admin/requests/[id]/page.tsx:L265, L712, L717, L722` [MODIFY] — Standardize `CommentDate`, `formattedCreatedAt`, `formattedDueDate` (preserving null check), and `formattedFooterDate` with `formatThaiDate`.
- `frontend/components/admin/AuditTimelineEntry.tsx:L15-L19` [MODIFY] — Standardize audit timeline entry dates to `formatThaiDate(audit.created_at, { includeTime: true })`.
- `frontend/app/admin/bookings/page.tsx:L8-L18, L95-L122` [MODIFY] — Import `formatThaiDate` from `@/lib/format-date` and `Select` from `@/components/ui/Select`, replace `<label>` with `<div>`, replace raw date input with `CalendarPickerTH` wrapped in `<div className="w-48">`, preserve `{!date && <span>ทุกวัน</span>}`, replace raw select with `<Select>`, and format footer date with `formatThaiDate(date, { yearFormat: 'numeric' })`.
- `frontend/app/admin/bookings/__tests__/page.test.tsx:L1-L20, L80-L120` [MODIFY] — Mock `CalendarPickerTH` using `<input type="date">` and `isoToYMD(value)` to keep existing keystroke interactions 100% green without RangeErrors or timezone shifts.

### Dependencies, Logging & Error Handling
- **Dependencies**: Uses `pytz` (backend, existing) and standard `Intl.DateTimeFormat` (frontend, Web/Node standard). No new npm or pip packages needed.
- **Logging**: Pure UI formatting utilities and GET read endpoints do not emit server audit logs (N/A). Standard client-side logger from `@/lib/logger` remains available.
- **Error Handling Pattern**: In `backend/app/api/v1/endpoints/admin_requests.py:list_requests`, if both `start_date` and `end_date` are provided and `start_date > end_date`, raise:
  ```python
  if start_date and end_date and start_date > end_date:
      raise HTTPException(status_code=400, detail="start_date must not be after end_date")
  ```

### NOT Building (Out of Scope)
- Modifying LIFF form submission payloads or database schema migrations (dates in DB remain standard UTC/ISO timestamps).
- Overhauling the booking scheduling engine (only replacing the admin datepicker UI).
- Adding complex recurring date rules or export-to-calendar features.
- Styling or height adjustments for general form inputs in `/admin/reply-objects` (tracked separately in a dedicated UI polish task).

---

## Structured Before & After UI States

| Screen | Location | Before | After |
|---|---|---|---|
| `/admin/requests` | Table "วันที่ยื่น" cell | `03 ก.ย. 69 07:44` (2-digit BE year, no "น.") | `03 ก.ย. 2569 07:44 น.` (4-digit BE year, uniform) |
| `/admin/requests` | View Modal | `3/9/2569` (slash numeric format) | `03 ก.ย. 2569 07:44 น.` |
| `/admin/requests` | Filter Bar | Search, Status, Category (No date filter) | Search, Status, Category + Second row with `จากวันที่` & `ถึงวันที่` (`CalendarPickerTH` in `w-48`) + `ล้างวันที่` |
| `/admin/requests/kanban` | Request Card dates | `3/9/2569` (slash numeric format) | `03 ก.ย. 2569` (readable short Thai BE) |
| `/admin/requests/[id]` | Header & Detail dates | Mixed: `3 ก.ย. 69`, `3 ก.ย. 2569`, `3 ก.ย. 2569 07:44` | Uniform: `formatThaiDate` with consistent 4-digit BE and "น." suffix |
| `/admin/bookings` | Date Filter Input | Raw `<input type="date">` inside `<label>` (Gregorian English calendar) | `CalendarPickerTH` inside `<div className="w-48">` (Thai BE calendar) + `ทุกวัน` badge + integrated reset |
| `/admin/bookings` | Status Dropdown | Raw `<select>` with native browser arrow glued 0px against edge | `<Select>` with custom chevron and comfortable 12px breathing room |
| `/admin/bookings` | Footer Date | Legacy format `{formatThaiDate(date)}` | Uniform 4-digit BE year `{formatThaiDate(date, { yearFormat: 'numeric' })}` |
| Component | `CalendarPickerTH` input box | Year input takes `flex-1 min-w-[80px]` causing bloated empty space in wide forms | Responsive with `className` support; inner inputs snug (`w-9` day, `w-9` month, `min-w-[50px]` year) |

---

## Step-by-Step Tasks (TDD)

### Task 1 — Frontend: Centralized Thai Date Formatter Utility, CalendarPickerTH Styling & Booking Re-export

**ACTION**: Create `frontend/lib/format-date.ts`, unit test `frontend/lib/__tests__/format-date.test.ts`, update `frontend/lib/booking.ts`, and update `frontend/components/ui/CalendarPickerTH.tsx`.

**IMPLEMENT**:
1. In `frontend/lib/format-date.ts`:
   - Export self-contained Thai month arrays:
     ```typescript
     export const THAI_MONTHS_SHORT = [
       'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
       'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
     ] as const;

     export const THAI_MONTHS_LONG = [
       'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
       'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
     ] as const;

     // Module-scoped formatter to prevent repeated instantiation overhead; hourCycle 'h23' avoids 24:00 midnight edge cases
     const BANGKOK_FORMATTER = new Intl.DateTimeFormat('en-US', {
       timeZone: 'Asia/Bangkok',
       year: 'numeric',
       month: 'numeric',
       day: 'numeric',
       hour: 'numeric',
       minute: 'numeric',
       hourCycle: 'h23',
     });
     ```
   - Define options:
     ```typescript
     export interface FormatThaiDateOptions {
       includeTime?: boolean;
       dayFormat?: 'numeric' | '2-digit'; // '3' vs '03' (default '2-digit' for table consistency)
       yearFormat?: 'numeric' | '2-digit'; // '2569' vs '69' (default 'numeric')
       monthFormat?: 'short' | 'long';     // 'ก.ย.' vs 'กันยายน' (default 'short')
       fallback?: string;                 // default '—'
     }
     ```
   - Implement date parts extraction with explicit null/undefined safety:
     ```typescript
     export function parseDateParts(input: string | Date | null | undefined): {
       year: number;
       month: number; // 0-11
       day: number;
       hours: number;
       minutes: number;
     } | null {
       if (!input) return null;
       let d: Date;
       if (input instanceof Date) {
         d = input;
       } else if (typeof input === 'string') {
         const trimmed = input.trim();
         if (!trimmed) return null;
         if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
           const [y, m, day] = trimmed.split('-').map(Number);
           if (m < 1 || m > 12 || day < 1 || day > 31) return null;
           return { year: y, month: m - 1, day, hours: 0, minutes: 0 };
         }
         d = new Date(trimmed);
       } else {
         return null;
       }
       if (isNaN(d.getTime())) return null;

       const parts = BANGKOK_FORMATTER.formatToParts(d);
       const partMap: Record<string, number> = {};
       for (const p of parts) {
         if (p.type !== 'literal') partMap[p.type] = parseInt(p.value, 10);
       }
       return {
         year: partMap.year,
         month: (partMap.month || 1) - 1,
         day: partMap.day,
         hours: partMap.hour === 24 ? 0 : (partMap.hour ?? 0),
         minutes: partMap.minute ?? 0,
       };
     }
     ```
   - Export `formatThaiDate(isoDate: string | Date | null | undefined, options?: FormatThaiDateOptions): string`:
     - If input is null/undefined/empty string, return `options?.fallback ?? '—'`.
     - Extract parts via `parseDateParts(isoDate)`. If null, return `options?.fallback ?? '—'`.
     - Day formatting: `parts.day.toString().padStart(options?.dayFormat === 'numeric' ? 1 : 2, '0')`.
     - Month formatting: `options?.monthFormat === 'long' ? THAI_MONTHS_LONG[parts.month] : THAI_MONTHS_SHORT[parts.month]`.
     - Buddhist Year: `(parts.year + 543).toString()`. If `options?.yearFormat === '2-digit'`, slice `(-2)`.
     - Assemble date string: `${day} ${month} ${year}`.
     - If `options?.includeTime: true`: append ` ${parts.hours.toString().padStart(2, '0')}:${parts.minutes.toString().padStart(2, '0')} น.`.
   - Export convenience helpers:
     ```typescript
     export const formatThaiDateOnly = (iso: string | Date | null | undefined, opts?: FormatThaiDateOptions): string =>
       formatThaiDate(iso, { ...opts, includeTime: false });

     export const formatThaiDateTime = (iso: string | Date | null | undefined, opts?: FormatThaiDateOptions): string =>
       formatThaiDate(iso, { ...opts, includeTime: true });
     ```
2. In `frontend/lib/booking.ts`:
   - Replace the legacy `formatThaiDate` definition with a backwards-compatible delegate that accepts optional options:
     ```typescript
     import { formatThaiDate as baseFormatThaiDate, type FormatThaiDateOptions } from '@/lib/format-date';

     /**
      * Re-exports central Thai date formatter preserving legacy booking formatting
      * (unpadded single-digit days like '1 ก.พ. 2569' and '-' fallback) with optional overrides.
      */
     export const formatThaiDate = (
       isoDate: string | Date | null | undefined,
       options?: FormatThaiDateOptions,
     ): string =>
       baseFormatThaiDate(isoDate, { dayFormat: 'numeric', fallback: '-', ...options });
     ```
   - Retain existing `formatThaiWeekday` and `formatTime` unchanged.
3. In `frontend/components/ui/CalendarPickerTH.tsx`:
   - Add `className?: string;` to `CalendarPickerTHProps`.
   - Update outer container: `<div className={cn("w-full relative", className)} ref={containerRef}>` (preserving full-width forms in multi-column layouts like create request, reports, and analytics).
   - Tune day/month/year inputs and icon spacing to be snug and proportional:
     - Day input: `w-9 px-1 py-1.5 text-center text-sm font-medium`
     - Month input: `w-9 px-1 py-1.5 text-center text-sm font-medium`
     - Year input: `flex-1 min-w-[50px] px-1 py-1.5 text-center text-sm font-medium`
     - Action icons container: `flex items-center gap-1 ml-1.5 shrink-0`
   - Callers requiring compact sizing (e.g. filter bars in `/admin/requests` or `/admin/bookings`) wrap the picker in `<div className="w-48">` or pass `className="max-w-[220px]"`.

**GOTCHA**:
- Using `Intl.DateTimeFormat` with `timeZone: 'Asia/Bangkok'` guarantees that full ISO strings (e.g. `'2026-09-03T07:44:00+07:00'`) produce identical Bangkok times (`07:44 น.`) on both local developer machines (GMT+7) and GitHub Actions CI runners (UTC).

**SOURCE REFS**:
- `frontend/lib/utils.ts:L8-L17` (`BE_OFFSET = 543`, `toBE`)
- `frontend/lib/booking.ts:L89-L95` (Legacy `formatThaiDate` to wrap)
- `frontend/components/ui/CalendarPickerTH.tsx:L8-L15, L325-L390`

**VALIDATE**:
```bash
npm run test:unit -- format-date
npm run test:unit -- booking
npm run test:unit -- CalendarPickerTH
```

---

### Task 2 — Backend: Add `start_date` and `end_date` Query Filters to Requests List

**ACTION**: Update `backend/app/api/v1/endpoints/admin_requests.py` and test in `backend/tests/test_admin_requests_endpoints.py`.

**IMPLEMENT**:
1. In `admin_requests.py` at `list_requests` (around line 267):
   - Import `BANGKOK_TZ` from existing service:
     ```python
     import pytz
     from datetime import datetime, date, time, timezone
     from app.services.business_hours_service import BANGKOK_TZ  # pytz.timezone('Asia/Bangkok')
     ```
   - Add query parameters to `list_requests`:
     ```python
     start_date: Optional[date] = Query(None, description="Filter requests created on or after this date (YYYY-MM-DD)"),
     end_date: Optional[date] = Query(None, description="Filter requests created on or before this date (YYYY-MM-DD)"),
     ```
   - In query construction, validate bounds and convert Bangkok calendar days to UTC intervals:
     ```python
     if start_date and end_date and start_date > end_date:
         raise HTTPException(status_code=400, detail="start_date must not be after end_date")

     if start_date:
         start_naive = datetime.combine(start_date, time.min)
         start_dt = BANGKOK_TZ.localize(start_naive).astimezone(timezone.utc)
         query = query.where(ServiceRequest.created_at >= start_dt)
     if end_date:
         end_naive = datetime.combine(end_date, time.max)
         end_dt = BANGKOK_TZ.localize(end_naive).astimezone(timezone.utc)
         query = query.where(ServiceRequest.created_at <= end_dt)
     ```
2. In `backend/tests/test_admin_requests_endpoints.py`:
   - Add a mock result class supporting `.all()` and capturing query statements:
     ```python
     class _FakeListResult:
         def __init__(self, rows):
             self._rows = rows
         def all(self):
             return self._rows

     class _FakeListDB(_FakeDB):
         def __init__(self, rows=None):
             super().__init__()
             self._rows = rows or []
             self.executed_stmts = []
         async def execute(self, stmt):
             self.executed_stmts.append(stmt)
             return _FakeListResult(self._rows)
     ```
   - Add test `test_list_requests_date_filter_bounds` using the established `_patch_admin_overrides(fake_db)` helper:
     ```python
     def test_list_requests_date_filter_bounds():
         fake_req = SimpleNamespace(
             id=101, source="ADMIN", prefix="นาย", firstname="ทดสอบ", lastname="ระบบ",
             requester_name="นาย ทดสอบ ระบบ", phone_number="0812345678", email=None,
             agency=None, province="กรุงเทพมหานคร", district="ดุสิต", sub_district="วชิรพยาบาล",
             topic_category="ทั่วไป", topic_subcategory=None, description="ทดสอบกรองวันที่",
             attachments=None, status=RequestStatus.PENDING, priority="MEDIUM",
             assigned_agent_id=None, assigned_by_id=None, created_at=datetime(2026, 9, 3, 3, 0, tzinfo=timezone.utc),
             updated_at=None, due_date=None, completed_at=None
         )
         fake_db = _FakeListDB([(fake_req, "Agent 1")])
         teardown = _patch_admin_overrides(fake_db)
         try:
             client = TestClient(app)
             res = client.get("/api/v1/admin/requests?start_date=2026-09-03&end_date=2026-09-03")
             assert res.status_code == 200
             data = res.json()
             assert len(data) == 1
             assert data[0]["id"] == 101
             assert len(fake_db.executed_stmts) > 0
             compiled_sql = str(fake_db.executed_stmts[0])
             assert "created_at >=" in compiled_sql
             assert "created_at <=" in compiled_sql
         finally:
             client.close()
             teardown()
     ```

**GOTCHA**:
- In `test_admin_requests_endpoints.py`, always use `teardown = _patch_admin_overrides(fake_db)`. Manually overriding `deps.get_db` directly will omit `session_get_db` and `deps.get_current_manager`, causing `list_requests` to return 401 Unauthorized.

**SOURCE REFS**:
- `backend/app/models/service_request.py:L95` (`created_at = Column(DateTime(timezone=True)...)`)
- `backend/app/api/v1/endpoints/admin_requests.py:L266-L310` (`list_requests`)
- `backend/app/services/business_hours_service.py:L13` (`BANGKOK_TZ = pytz.timezone('Asia/Bangkok')`)
- `backend/tests/test_admin_requests_endpoints.py:L155-L176` (`_patch_admin_overrides`)

**VALIDATE**:
```bash
python -m pytest tests/test_admin_requests_endpoints.py
```

---

### Task 3 — Frontend: Integrate Date Filter & `formatThaiDate` in `/admin/requests`

**ACTION**: Update `frontend/app/admin/requests/page.tsx`.

**IMPLEMENT**:
1. Import `formatThaiDate` from `@/lib/format-date`.
2. Import `isoToYMD` from `@/lib/utils`.
3. Import `CalendarPickerTH`:
   ```tsx
   import dynamic from 'next/dynamic';
   const CalendarPickerTH = dynamic(() => import('@/components/ui/CalendarPickerTH'));
   ```
4. Update `filter` state to include `startDate` and `endDate`:
   ```tsx
   const [filter, setFilter] = useState({
     status: "",
     category: "",
     startDate: null as string | null,
     endDate: null as string | null,
   });
   ```
5. In `fetchRequests` (around lines 100-125):
   - Local variable is `const query = new URLSearchParams()`:
     ```tsx
     if (filter.startDate) query.append("start_date", isoToYMD(filter.startDate));
     if (filter.endDate) query.append("end_date", isoToYMD(filter.endDate));
     ```
   - Add `filter.startDate` and `filter.endDate` to the dependency array of `useCallback` (line 125):
     ```tsx
     [debouncedSearch, filter.category, filter.status, filter.startDate, filter.endDate]
     ```
6. In Filter Bar CardContent (`requests/page.tsx:L218-L248`):
   Insert a dedicated second row immediately below the 4-column search/select grid (after line 245):
   ```tsx
   {/* Date Range Filter Row */}
   <div className="mt-4 pt-4 border-t border-border-default flex flex-wrap items-end gap-3">
     <div className="w-44 sm:w-48">
       <CalendarPickerTH
         label="จากวันที่"
         value={filter.startDate}
         onChange={(val) => setFilter(prev => ({ ...prev, startDate: val }))}
       />
     </div>
     <div className="w-44 sm:w-48">
       <CalendarPickerTH
         label="ถึงวันที่"
         value={filter.endDate}
         onChange={(val) => setFilter(prev => ({ ...prev, endDate: val }))}
       />
     </div>
     {(filter.startDate || filter.endDate) && (
       <Button
         type="button"
         variant="ghost"
         size="sm"
         onClick={() => setFilter(prev => ({ ...prev, startDate: null, endDate: null }))}
         className="text-xs text-text-tertiary hover:text-text-primary mb-1"
       >
         ล้างวันที่
       </Button>
     )}
   </div>
   ```
7. In Table Row (`requests/page.tsx:L316`):
   Replace inline `toLocaleDateString` with:
   ```tsx
   <div className="flex items-center gap-2 text-xs text-text-secondary font-medium">
       <Calendar className="w-3.5 h-3.5 text-text-tertiary" />
       {formatThaiDate(req.created_at, { includeTime: true, yearFormat: 'numeric' })}
   </div>
   ```
8. In View Modal (`requests/page.tsx:L436`):
   Replace `{new Date(selectedRequest.created_at).toLocaleDateString('th-TH')}` with `{formatThaiDate(selectedRequest.created_at, { includeTime: true })}`.

**GOTCHA**:
- The variable in `fetchRequests` is named `query`, NOT `params`. Using `params.append` causes a `ReferenceError`.
- Inserting the date range pickers in a dedicated second row below the 4-column grid prevents layout collapse and horizontal squishing on tablet viewports.

**SOURCE REFS**:
- `frontend/app/admin/requests/page.tsx:L91-L130` (`fetchRequests` callback with `query = new URLSearchParams()`)
- `frontend/app/admin/requests/page.tsx:L218-L248` (Filter bar)
- `frontend/app/admin/requests/page.tsx:L313-L324` (Date column)

**VALIDATE**:
```bash
npm run test:unit -- request-field-labels
npm run lint
```

---

### Task 4 — Frontend: Standardize Dates in Kanban & Request Detail

**ACTION**: Update `frontend/app/admin/requests/kanban/page.tsx`, `frontend/app/admin/requests/[id]/page.tsx`, and `frontend/components/admin/AuditTimelineEntry.tsx`.

**IMPLEMENT**:
1. In `frontend/app/admin/requests/kanban/page.tsx`:
   - Import `formatThaiDate` from `@/lib/format-date`.
   - Replace line 175:
     `{formatThaiDate(req.created_at, { yearFormat: 'numeric' })}`
   - Replace line 180:
     `{formatThaiDate(req.due_date, { yearFormat: 'numeric' })}`
2. In `frontend/app/admin/requests/[id]/page.tsx`:
   - Import `formatThaiDate` from `@/lib/format-date`.
   - Line 260-268 (`CommentDate` component):
     ```tsx
     function CommentDate({ dateStr }: { dateStr: string }) {
         const formatted = useMemo(() => {
             return formatThaiDate(dateStr, { includeTime: true });
         }, [dateStr]);

         return <span className="text-[10px] font-bold text-text-tertiary">{formatted}</span>;
     }
     ```
   - Line 712 (`formattedCreatedAt`):
     ```tsx
     const formattedCreatedAt = useMemo(() => {
         return formatThaiDate(createdAtStr, { includeTime: true });
     }, [createdAtStr]);
     ```
   - Line 717 (`formattedDueDate`):
     ```tsx
     const formattedDueDate = useMemo(() => {
         if (!dueDateStr) return null;
         return formatThaiDate(dueDateStr, { yearFormat: 'numeric' });
     }, [dueDateStr]);
     ```
   - Line 722 (`formattedFooterDate`):
     ```tsx
     const formattedFooterDate = useMemo(() => {
         return formatThaiDate(createdAtStr, { includeTime: true });
     }, [createdAtStr]);
     ```
3. In `frontend/components/admin/AuditTimelineEntry.tsx`:
   - Import `formatThaiDate` from `@/lib/format-date`.
   - Replace lines 13-19 with:
     ```tsx
     const formatted = useMemo(() => {
         return formatThaiDate(audit.created_at, { includeTime: true });
     }, [audit.created_at]);
     ```

**GOTCHA**:
- In `formattedDueDate`, you must retain the `if (!dueDateStr) return null;` guard. If omitted, `formatThaiDate(null)` returns `"—"`, which causes `{formattedDueDate ?? 'ไม่ได้กำหนด'}` at line 1124 to show `"—"` instead of the intended `'ไม่ได้กำหนด'`.

**SOURCE REFS**:
- `frontend/app/admin/requests/kanban/page.tsx:L175-L180`
- `frontend/app/admin/requests/[id]/page.tsx:L260-L270` (`CommentDate`)
- `frontend/app/admin/requests/[id]/page.tsx:L710-L726` (`formattedCreatedAt`, `formattedDueDate`, `formattedFooterDate`)
- `frontend/components/admin/AuditTimelineEntry.tsx:L13-L20`

**VALIDATE**:
```bash
npm run test:unit
npm run lint
```

---

### Task 5 — Frontend: Replace Raw Date Input in `/admin/bookings` with `CalendarPickerTH`

**ACTION**: Update `frontend/app/admin/bookings/page.tsx` and adapt `frontend/app/admin/bookings/__tests__/page.test.tsx`.

**IMPLEMENT**:
1. In `frontend/app/admin/bookings/page.tsx`:
   - Add to existing imports:
     ```tsx
     import dynamic from 'next/dynamic';
     import { isoToYMD } from '@/lib/utils';
     import Select from '@/components/ui/Select';
     import { formatThaiDate } from '@/lib/format-date';
     const CalendarPickerTH = dynamic(() => import('@/components/ui/CalendarPickerTH'));
     ```
   - Define status options array:
     ```tsx
     const STATUS_FILTER_OPTIONS = [
       { value: '', label: 'ทุกสถานะ' },
       ...(Object.keys(BOOKING_STATUS_LABELS) as BookingStatus[]).map((status) => ({
         value: status,
         label: BOOKING_STATUS_LABELS[status],
       })),
     ];
     ```
   - Replace lines 95-122:
     Change the outer `<label className="flex items-center gap-2 text-sm">` to `<div className="flex items-center gap-2 text-sm">`, replace raw date input with `CalendarPickerTH` wrapped in `<div className="w-48">`, preserve `{!date && (<span className="text-xs text-slate-400">ทุกวัน</span>)}`, and replace raw `<select>` with `<Select>`:
     ```tsx
     <div className="flex items-center gap-2 text-sm">
       <CalendarDays className="h-4 w-4 text-slate-400" aria-hidden="true" />
       <div className="w-48">
         <CalendarPickerTH
           value={date ? new Date(`${date}T00:00:00`).toISOString() : null}
           onChange={(iso) => setDate(iso ? isoToYMD(iso) : '')}
         />
       </div>
       {!date && (
         <span className="text-xs text-slate-400">ทุกวัน</span>
       )}
       {date && (
         <Button
           type="button"
           variant="ghost"
           size="sm"
           onClick={() => setDate('')}
           className="text-xs text-text-tertiary hover:text-text-primary"
         >
           ล้างวันที่
         </Button>
       )}
       <div className="w-36">
         <Select
           size="sm"
           value={statusFilter}
           onChange={(e) => setStatusFilter(e.target.value as BookingStatus | '')}
           options={STATUS_FILTER_OPTIONS}
         />
       </div>
     </div>
     ```
   - In footer (line 197):
     Replace `{date ? 'ของวันที่ ' + formatThaiDate(date) : 'ทุกวัน'}` with `{date ? 'ของวันที่ ' + formatThaiDate(date, { yearFormat: 'numeric' }) : 'ทุกวัน'}` to standardize 4-digit BE year.
2. In `frontend/app/admin/bookings/__tests__/page.test.tsx`:
   - Mock `@/components/ui/CalendarPickerTH` at the top of the test file using an `<input type="date">` adapter that calls `isoToYMD(value)`:
     ```tsx
     import { isoToYMD } from '@/lib/utils';

     vi.mock('@/components/ui/CalendarPickerTH', () => ({
       default: function MockCalendarPicker({ value, onChange }: { value: string | null; onChange: (val: string | null) => void }) {
         return (
           <input
             type="date"
             aria-label="วันที่"
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
   - This keeps all existing test assertions (`user.type(screen.getByLabelText('วันที่'), '2026-08-19')`) and the `ทุกวัน` badge assertion 100% green without timezone shift on local machines.

**GOTCHA**:
- Using `isoToYMD(value)` inside the mock ensures that when `value` is serialized from local midnight (e.g. `2026-08-18T17:00:00.000Z` in GMT+7), it correctly converts back to local calendar date `2026-08-19` rather than `2026-08-18`.

**SOURCE REFS**:
- `frontend/app/admin/bookings/page.tsx:L95-L107`
- `frontend/app/admin/bookings/__tests__/page.test.tsx:L80-L120`

**VALIDATE**:
```bash
npm run test:unit -- booking
npm run lint
```

---

## Testing Strategy & Validation Matrix

### Concrete Input / Expected Test Pairs

| Input ISO String | Options Passed | Expected Output | Rationale |
|---|---|---|---|
| `"2026-09-03T07:44:00+07:00"` | `{ includeTime: true, yearFormat: 'numeric' }` | `"03 ก.ย. 2569 07:44 น."` | Standard 4-digit BE year with time in Bangkok TZ |
| `"2026-09-03T00:44:00+07:00"` | `{ includeTime: true, yearFormat: '2-digit' }` | `"03 ก.ย. 69 00:44 น."` | 2-digit BE year with leading zero time |
| `"2026-09-03"` | `{ yearFormat: 'numeric' }` | `"03 ก.ย. 2569"` | Date only without time |
| `"2026-09-03"` | `{ dayFormat: 'numeric' }` | `"3 ก.ย. 2569"` | Unpadded day format (booking compatibility) |
| `"2024-02-29T12:00:00+07:00"` | `{ monthFormat: 'long' }` | `"29 กุมภาพันธ์ 2567"` | Leap year handling |
| `null` | `{ fallback: '—' }` | `"—”` | Null safety fallback |
| `undefined` | `{}` | `"—”` | Undefined safety fallback |
| `""` | `{ fallback: 'ไม่ระบุ' }` | `"ไม่ระบุ"` | Empty string fallback |
| `"invalid-date-string"` | `{}` | `"—”` | NaN date protection |

### Concrete Edge-Case Checklist
- [ ] Leap year (29 Feb 2024 -> 29 ก.พ. 2567)
- [ ] Year boundary rollover (31 Dec 2025 -> 31 ธ.ค. 2568)
- [ ] Single digit day and month padding (`01 ม.ค. 2569` vs `1 ม.ค. 2569` depending on `dayFormat`)
- [ ] Time formatting padding (`09:05 น.`)
- [ ] Empty/null/invalid inputs never throw an exception or return "NaN"
- [ ] Date filtering on 00:00:00 - 06:59:00 Bangkok time correctly included in `start_date`
- [ ] Clearing date filters restores full dataset without page refresh
- [ ] Legacy `booking.test.ts` passes 100% without modification
- [ ] `bookings/__tests__/page.test.tsx` passes 100% with mock

### Automated Validation Commands
```bash
# Frontend Unit Tests
npm run test:unit -- format-date
npm run test:unit -- booking
npm run test:unit

# Frontend Static Analysis & Lint
npm run lint

# Frontend Production Build
npm run build

# Backend Unit Tests
python -m pytest tests/test_admin_requests_endpoints.py -v
```

---

## Risks & Mitigations
1. **Timezone Drift on Date Filter**:
   - *Risk*: UTC conversion of midnight boundaries shifts dates by 7 hours.
   - *Mitigation*: Explicitly bind with `BANGKOK_TZ = pytz.timezone('Asia/Bangkok')` on backend before converting to UTC. Use `isoToYMD` on frontend to query local calendar date strings.
2. **Dynamic Import SSR Hydration Mismatch**:
   - *Risk*: `CalendarPickerTH` uses browser `window`/`document` objects.
   - *Mitigation*: Always dynamically import `CalendarPickerTH`.
3. **Invalid HTML Nesting**:
   - *Risk*: Placing buttons inside `<label>` elements violates HTML specifications.
   - *Mitigation*: Replace outer `<label>` in `admin/bookings/page.tsx` with a `<div>`.
4. **Shared Component Layout Blast Radius**:
   - *Risk*: Hardcoding fixed or maximum width inside `CalendarPickerTH` could clamp full-width multi-column form layouts in `/admin/requests/create`, `/admin/requests/[id]`, `/admin/chatbot/broadcast/new`, `/admin/live-chat/analytics`, and `/admin/reports`.
   - *Mitigation*: Root element of `CalendarPickerTH` retains `w-full relative` with `className` support. Width constraints are applied exclusively at caller level (e.g. `<div className="w-48">` in filter bars).
5. **Cross-module Re-export Signature Synchronization**:
   - *Risk*: Invoking `formatThaiDate` with options across callers expecting the new signature while imported from legacy re-exporting modules.
   - *Mitigation*: Both `@/lib/format-date` and `@/lib/booking` accept optional `options?: FormatThaiDateOptions`, and all updated caller sites (`bookings/page.tsx`, `requests/page.tsx`, `AuditTimelineEntry.tsx`) import directly from `@/lib/format-date`.
