# CalendarPickerTH Adoption Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Replace every remaining native Gregorian date-entry control (settings/booking blackout, rich-menu display period ×4) with the shared Thai `CalendarPickerTH`; document the LIFF chip-strip keep decision.

**Architecture:** Drop-in ISO-state swap for the blackout adder; date/time split-state composition for the rich-menu schedule (broadcast-page pattern), leaving all downstream save/validate logic untouched.

**Tech Stack:** Next.js client components, React 19, Vitest + Testing Library. No new dependencies, no API change.

**PRD:** `.claude/PRPs/prds/2026-09-05-calendar-picker-closure.prd.md`

## Global Constraints

- Frontend-only. No API payload changes (`blackout_dates` stays ISO date list; `display.display_start_at/end_at` stay ISO datetimes).
- Thai BE display; all user-facing copy in Thai.
- Existing test suites stay green (`npm run test:unit`, lint 0 errors, build pass).

## Evidence (inventory 2026-09-05)

| # | Finding | Location |
|---|---------|----------|
| E1 | Last `type="date"`: blackout adder, `newBlackout` ISO state, duplicate-guard + sort on add | `frontend/app/admin/settings/booking/page.tsx:233`, `:57-58` |
| E2 | Rich menu schedule: `displayStart/displayEnd` raw datetime-local strings; save does `new Date(displayStart).toISOString()` | `frontend/app/admin/rich-menus/new/page.tsx:245-246,329-340,699-707` |
| E3 | Edit page loads via `toLocalDatetimeInputValue()` into the same state | `frontend/app/admin/rich-menus/[id]/edit/page.tsx:89,465-473` |
| E4 | Broadcast page already composes CalendarPickerTH + `type="time"` (the proven pattern) | `frontend/app/admin/chatbot/broadcast/new/page.tsx:72-95` |
| E5 | LIFF chip strip already Thai (`formatThaiWeekday`, Thai month, "วันนี้") + open/full status; no date inputs anywhere in LIFF | `frontend/app/liff/booking/page.tsx:620-660` |

---

### Task 1: Settings/booking blackout adder → CalendarPickerTH

**Files:**
- Modify: `frontend/app/admin/settings/booking/page.tsx:233` (+ import)
- Test: `frontend/app/admin/settings/booking/__tests__/page.test.tsx`

- [ ] **Step 1: Failing test** — "เพิ่มวันหยุดพิเศษ ผ่านปฏิทินไทย แล้ว payload ได้ ISO": render page, drive the picker inputs (DD/MM/BBBB, selectors per `components/ui/__tests__/CalendarPickerTH.test.tsx`), blur, click add, assert saved payload contains the ISO date. Run file → FAIL (input is native `type="date"`; picker inputs absent).

- [ ] **Step 2: Implement** — replace the native input:

```tsx
<CalendarPickerTH
  ariaLabel="เลือกวันหยุดพิเศษ"
  value={newBlackout || null}
  onChange={(iso) => setNewBlackout(iso ?? '')}
/>
```

plus the import; remove the native input attributes. Keep the add button + duplicate guard.

- [ ] **Step 3:** `npx vitest run app/admin/settings/booking/__tests__/page.test.tsx` → PASS.
- [ ] **Step 4: Commit** — `feat(booking-settings): Thai calendar for blackout dates`

### Task 2: Rich menu display period → Thai date + time

**Files:**
- Modify: `frontend/app/admin/rich-menus/new/page.tsx:245-246,699-707`
- Modify: `frontend/app/admin/rich-menus/[id]/edit/page.tsx:71,89,465-473`
- Test: both pages' `__tests__/page.test.tsx`

- [ ] **Step 1: Regression-guard tests** — per page: "start = picker date + time → payload `display_start_at` ISO equals the old combined-value behavior"; edit page: "loaded datetime splits into date part + time part"; plus an assertion that no `input[type="datetime-local"]` remains (`container.querySelector` → null).

- [ ] **Step 2: Implement (both pages, same shape)**

```tsx
// Thai (พ.ศ.) date + separate time — native datetime-local renders ค.ศ. only
// (same reason as the broadcast page).
const [displayStartDate, setDisplayStartDate] = useState('');
const [displayStartTime, setDisplayStartTime] = useState('');
const displayStart = displayStartDate && displayStartTime
  ? `${displayStartDate}T${displayStartTime}` : '';
```

UI: `<CalendarPickerTH ariaLabel="วันที่เริ่มแสดง" value={displayStartDate || null} onChange={(iso) => setDisplayStartDate(iso ?? '')} />` + `<input type="time" value={displayStartTime} onChange=... />` inside the existing labels; identical for the end field. Edit page loader: split `toLocalDatetimeInputValue(...)` on `'T'` into the two parts.

- [ ] **Step 3:** run both page test files + full `npm run test:unit` → PASS.
- [ ] **Step 4: Commit** — `feat(rich-menus): Thai calendar for display period schedule`

### Task 3: Validation + PR

- [ ] **Step 1:** `npm run test:unit && npm run lint && npm run build` — green; final sweep `grep -rn 'type="date"\|datetime-local' frontend/app frontend/components` (excluding tests) → zero hits.
- [ ] **Step 2:** push, PR, CI 4/4, squash-merge, CD watch (frontend scope → Vercel).
- [ ] **Step 3:** handoff checkpoint.

## Self-Review

1. **Spec coverage:** PRD decisions 1→Task 1, 2→Task 2, 3→documented (no code), 4→final sweep grep in validation.
2. **Placeholder scan:** all steps concrete; test selectors delegated to the existing CalendarPickerTH test file's documented selectors (named prior art, not TBD).
3. **Type consistency:** state names (`displayStartDate/Time`, `displayEnd*`) match across steps.
