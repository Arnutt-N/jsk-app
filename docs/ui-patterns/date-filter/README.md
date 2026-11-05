# Date filter UI patterns

Five designs for an admin date-range filter, extracted from the `jsk-app` work
of 2026-11-04/05 so another project can start from a proven shape instead of
re-deriving it. Every file here was shipped and reviewed; none is a sketch.

Read the comparison table first, pick one, then copy its file.

## The five patterns

| # | Pattern | Files here | When it fits |
|---|---|---|---|
| 1 | Trigger + popover panel | `DatePresetFilter-popover-trigger.tsx` | The list or report is the whole page and the filter is secondary. Smallest footprint. |
| 2 | Inline buttons + typed boxes + range-calendar button | `DatePresetFilter-trigger-panel.tsx`, `DateRangeCalendarTH.tsx` | Presets are used constantly and must be one click. Costs a second row below ~1024px. |
| 3 | Inline buttons + typed boxes, no calendar | Simplest reduction of #2 | The typed boxes already contain a calendar each, so a third range calendar duplicates them. |
| 4 | Typed boxes only | `CalendarPickerTH.tsx` from the same repo | The filter is rarely changed and the page can spare width. |
| 5 | Component-library range picker (HeroUI / React Aria) | Not included; see notes | You already depend on the library, or you need per-segment editing and free a11y. |

## What number 3 is, and why it usually wins

The typed box component in this repo, `CalendarPickerTH`, is not a plain input.
It renders three numeric fields and a calendar button, and the button opens a
single-month พ.ศ. picker. So two of them already give the user **typing and
clicking** for both ends of the range.

Adding a separate two-month range calendar on top gives a third input path for
the same value. It looks like an improvement and costs a file, a test suite, and
a second state representation. Pattern 3 keeps the reachable set of actions
identical while removing the duplication.

## The one thing every pattern must get right

`preset` and `customStart`/`customEnd` are two representations of one filter.
Three bugs found in production here came from treating them as independent:

1. A reversed range was silently discarded. On list pages it became "no filter"
   and the user saw every row; on report pages it fell back to 30 days and the
   table showed a window nobody chose.
2. An untouched custom range flashed an error before the user typed anything.
   An empty pair is a resting state, not a mistake.
3. A stale response overwrote the current query because the guard compared
   against a value captured in the same closure.

The fixes are in `lib/date-range.ts` style helpers: one function decides whether
a range is usable, one returns a message per problem, and every consumer calls
those instead of comparing dates inline.

## Pattern 1 in detail

```
┌──────────────────────────────────┐
│ 📅 1 ก.ย. – 30 ก.ย. 2569     ▾  │  trigger names the active range
└──────────────────────────────────┘
        ↓
┌──────────────────────┐
│ ✓ 7 วัน              │
│ ✓ 30 วัน   ← active  │
│ ✓ 90 วัน             │
│ ✓ ปีนี้              │
│ ✓ กำหนดเอง           │
│ ──────────────────── │
│ [วว/ดด/ปปปป]         │  only when custom
│ [วว/ดด/ปปปป]         │
└──────────────────────┘
```

Strengths: one control, about 200px, shows the current range without opening.
Weaknesses: presets cost two clicks; the trigger text must handle every state
including the unusable ones.

## Pattern 2 in detail

```
[7 วัน][30 วัน][90 วัน][ปีนี้]
[วว/ดด/ปปปป 📅] - [วว/ดด/ปปปป 📅]  [ล้างตัวกรอง]
```

Strengths: presets are one click; both ends are always visible.
Weaknesses: about 810px at default text size, so it wraps below ~1024px of
content width; the preset row duplicates the independent-custom state.

## Pattern 5 notes, measured

`react-aria-components` and HeroUI's `DateRangePicker` were both probed by
running code, not read from docs.

- `@internationalized/date`'s `BuddhistCalendar` **does** convert correctly. The
  constructor is `new CalendarDate(calendar, year, month, day)`; calling it as
  `(year, month, day, calendar)` silently keeps the Gregorian calendar and
  produces a date 543 years in the future. Its `toString()` prints the CE year
  by ISO 8601 rule, so do not read it as evidence of a failed conversion.
- With `I18nProvider locale="th-TH-u-ca-buddhist"`, `react-aria-components`'
  `DateRangePicker` renders `3/9/2569–10/9/2569` with Arabic digits. `th-TH`
  alone already defaults to the Buddhist calendar on Node 22.
- Its `DateInput`/`DateSegment` edit **per segment** (day, month, year
  separately), not as one typed string like `15012569`. That is a different
  interaction, not a drop-in replacement.
- HeroUI's composition API (`DateField.Group`, `DateRangePicker.RangeSeparator`)
  is HeroUI's own wrapper; `react-aria-components` exposes `Group`, `DateInput`,
  `DateSegment`, `Popover`, `Dialog` instead.
- Its popover does not open in jsdom (`cannot read properties of undefined
  (reading 'escape')`), so its tests need a real browser.

## Files

`DateRangeCalendarTH.tsx` is the two-month พ.ศ. range calendar built on
`react-day-picker/buddhist`. Reusable as-is if that dependency is present. Its
`min={1}` is load-bearing: without it the first click returns
`{from: d, to: d}`, which reads as a complete one-day range.

`DatePresetFilter-popover-trigger.tsx` is pattern 1 at its final shipped state.

`DatePresetFilter-trigger-panel.tsx` is pattern 2 at its final shipped state,
including the range-calendar button.

Both import `CalendarPickerTH`, `Button`, `Popover`, and `lib/date-range`
helpers from the source repo. Adapt those four paths when copying.

## What was removed and when

`jsk-app` shipped pattern 1 (PR #314), then pattern 2 (PR #315). Pattern 2 was
then reduced to pattern 3, because the typed boxes already contain a calendar
each. These files are kept so the removed shapes are recoverable without reading
old commits.
