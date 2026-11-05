# Todo: admin date-filter round 3 (layout A responsive + range calendar)

Playbook: Feature (poteto-mode). Rounds 1-2 merged (#313 `c502d09`, #314
`8fc01e5`). This round changes the layout shape and adds a range calendar.

## Decisions taken by the operator

- **Layout A**: preset buttons stay on screen, wrapping to a second row when
  narrow. Matches what `/admin/requests` already does.
- **Typing**: keep `CalendarPickerTH` (two boxes, type `15012569` in one go).
  Add a separate button that opens a range calendar.
- **No new dependency**: `react-day-picker/buddhist` is already installed and
  probe-confirmed (`กันยายน 2569`, `"2569-09-03"`, range classes present,
  backward click reorders `{from: 3, to: 10}`).
- **All six pages converge**: `/admin/requests` migrates too.

## What the operator sees

```
1280px                                  640px
[7วัน][30วัน][90วัน][ปีนี้]             [7วัน][30วัน][90วัน][ปีนี้]
[วว/ดด/ปปปป]-[วว/ดด/ปปปป] [📅] [ล้าง]    [วว/ดด/ปปปป]-[วว/ดด/ปปปป]
                                          [📅] [ล้าง]
```

## Design

One component, one state model, no two-way sync.

**The typed boxes stay the source of truth.** The range calendar is an input
method for those same two boxes, not a parallel store. Picking a range in the
calendar calls `onCustomStartChange` / `onCustomEndChange` with YMD strings, so
after the pick the boxes show the dates. Typing in the boxes is unchanged and
needs no calendar write-back, because the calendar is closed when typing.

**Why this avoids the sync bug class**: the calendar never holds lasting state.
It opens seeded from the current boxes, and its only output is two `onChange`
calls. Reopening re-seeds. There is no third value to keep consistent.

**Why `preset` is forced to `custom` on calendar pick**: the calendar produces
an arbitrary range, so the active preset button must not keep claiming `30 วัน`.

## Files

1. `frontend/lib/date-range.ts`: add `describeDateFilter`'s replacement is not
   needed. The trigger is gone.
2. `frontend/components/admin/DateRangeCalendarTH.tsx` (new): the range calendar,
   built on `react-day-picker/buddhist`, `numerals="latn"`, Thai month labels,
   be-year aware. Props: `start`, `end` (YMD strings), `onSelect(start, end)`,
   `onCancel()`.
3. `frontend/components/admin/DatePresetFilter.tsx`: rewrite the body to layout
   A. Keep the exported name and every prop so no page changes.
4. `frontend/app/admin/requests/page.tsx`: migrate to `DatePresetFilter`,
   dropping `DatePresetButtons` + its two inline pickers + `dateRangeError`.
5. `frontend/components/admin/DatePresetFilter.tsx`: delete `DatePresetButtons`
   once requests stops importing it.
6. Tests: `lib/__tests__/date-range.test.ts` (drop `describeDateFilter` cases if
   the function is unused), `components/admin/__tests__/DatePresetFilter.test.tsx`
   (rewrite for layout A), new `components/admin/__tests__/DateRangeCalendarTH.test.tsx`,
   and `app/admin/requests/__tests__/page.test.tsx` (8 cases need the new flow).

## Units

1. `DateRangeCalendarTH` + its test. No page changes yet. -> `023bd17`
2. `DatePresetFilter` rewrite to layout A, keeping props. Its test rewritten.
   -> `b35b138`
3. `requests/page.tsx` migration + test update. Delete `DatePresetButtons`.
   -> `c713053`

Each unit commits separately and stays green.

## Outcome

Landed as three commits on `feat/admin-date-filter-range`, +428 / -354 across
9 files. Verified: 28 tests across the three affected files, 8 on the requests
page, `tsc --noEmit` exit 0, `eslint` on every touched file exit 0. The full
suite was not run locally (killed twice for memory on this machine); CI covers
it.

Two corrections made on top of the delegate's work:

- `describeDateFilter` lost its last consumer when the trigger was removed, so
  it and its eight test cases were deleted rather than left as dead code.
- `min={1}` on the DayPicker was the delegate's find, not the brief's. Without
  it the first click yields `{from: d, to: d}`, which reads as a complete
  one-day range and enables apply immediately.

Behavior lost on purpose: `/admin/requests` no longer has a date-only clear
button. Its `ล้างตัวกรอง` resets dates, status, category, and search together.

## Declared skips

- skip: `react-aria-components`. Probe showed it works with Buddhist dates, but
  it replaces `CalendarPickerTH`'s typing UX and adds 16 packages. The operator
  chose the existing typing surface.
- skip: removing `react-day-picker` from `package.json`. It has a consumer
  again, so the earlier "unused dependency" note is resolved by this PR.
- skip: `npm uninstall`/`npm install`. Nothing to install.
- skip: full local suite and full-project eslint. Both exceed this machine's
  memory or patience; CI runs them.

