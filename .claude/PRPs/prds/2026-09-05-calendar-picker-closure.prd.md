# PRD — CalendarPickerTH adoption: settings/booking blackout, rich-menu schedule (P2 closure)

> **Status**: READY (self-reviewed) · **Date**: 2026-09-05 · **Branch**: `feat/calendar-picker-liff-settings`
> **Source**: P2 leftover scope from the 2026-09-02 intake (`session-summary-20260902-1808.md`) —
> PR #223 covered 7 admin pages; this PR closes the remainder after a full inventory.

## Problem Statement

Three places still enter dates through native browser controls that render a **Gregorian (ค.ศ.)**
calendar, inconsistent with the Thai (พ.ศ.) standard the app adopted in PR #223:

1. Booking settings — "วันหยุดพิเศษ" adder uses `type="date"`.
2. Rich menu create page — display period start/end use `type="datetime-local"` (2 controls).
3. Rich menu edit page — same, 2 more controls.

Meanwhile the LIFF booking page uses a purpose-built date **chip strip** (only the bookable
window, per-day open/full status, Thai weekday/month labels, "วันนี้" marker) — which is already
fully Thai and is the intended UX for a constrained booking flow.

## Solution

Every remaining native date entry control is replaced by the shared Thai picker; the LIFF chip
strip is deliberately kept and documented as the correct pattern for that screen. After this PR
there are **no native date-entry controls left anywhere in the app** (sweep verified:
`type="date"`, `type="datetime-local"`).

## User Stories

1. As an admin, I want to pick blackout dates on a Buddhist-Era Thai calendar, so that the whole console speaks one date language.
2. As an admin, I want rich menu display start/end times on the Thai calendar with a separate time field, so that I never misread ค.ศ. vs พ.ศ. when scheduling.
3. As a citizen booking in LINE, I want the fast day-strip with open/full status, so that I can book in two taps (unchanged, by design).
4. As a maintainer, I want zero native date inputs left, so that the P2 "one datepicker everywhere" goal is verifiable by a sweep.

## Implementation Decisions

1. **Settings/booking blackout adder**: swap the native input for `CalendarPickerTH` (ISO in/out —
   drop-in for the existing `newBlackout` state; the saved payload and BE display list are
   unchanged). Keep the "already added" duplicate guard and sorted insert.
2. **Rich menu display period**: adopt the pattern proven on the broadcast page — `CalendarPickerTH`
   for the date part + a separate `<input type="time">` for the time part. Split state into
   date/time parts; derive the existing combined local string (`YYYY-MM-DDTHH:mm`) so all
   downstream save/validate logic is untouched. The edit page's loader splits the
   `toLocalDatetimeInputValue()` result into the two parts (timezone conversion stays in the
   existing helper).
3. **LIFF booking chip strip: kept** (documented decision — the 2026-09-02 intake anticipated
   this). It is already Thai-formatted, and a free calendar would conflict with the constrained
   booking window (`advance_days`, blackouts, per-day availability). No other LIFF page has any
   date-entry field (inventory verified).
4. **Broadcast page stays as-is** (already Thai). Extracting a shared `DateTimePickerTH` from the
   duplicated composition is noted as future cleanup, not done here (avoid touching a working page).

## Testing Decisions

- Tests assert behavior: "adding a blackout through the Thai picker adds the ISO date to the
  payload", "rich menu save derives the same datetime strings as before from date+time parts",
  "edit page splits a loaded datetime back into the two parts". Component interaction follows the
  established `CalendarPickerTH` test patterns (typed DD/MM/BBBB inputs).
- Prior art: `admin/settings/booking/__tests__/page.test.tsx` (blackout payload tests),
  `rich-menus/new` + `[id]/edit` page tests, `CalendarPickerTH.test.tsx`.

## Out of Scope

- Shared `DateTimePickerTH` component extraction (future cleanup).
- LIFF chip strip redesign; booking-window policy changes; time-picker styling beyond a plain
  `type="time"` field.

## Further Notes

Inventory sweep (2026-09-05): the only remaining `type="date"` is settings/booking:233; the only
`type="datetime-local"` are rich-menus new (699, 707) and [id]/edit (465, 473). The LIFF pages
(service-request, service-request-single, request-v2, debt-mediation, booking) have no date-entry
inputs.
