# PRD — LIFF booking visual unity + B.E. date picker

> **Status**: DRAFT (awaiting user approval) · **Date**: 2026-10-13
> **Branch**: `feat/liff-booking-unity-debt-service`
> **Source**: user order 2026-10-13 — redesign LIFF booking for theme consistency/unity,
> aligned with LIFF debt-mediation + service-request, plus a B.E. (พ.ศ.) date picker
> identical to the system-wide one.
> **Skills invoked**: `liff_development`, `frontend_architecture`, `tailwind-design-system`,
> `senior-frontend`, `testing_standards` (per skill-collections map), plus
> `pstack:principle-redesign-from-first-principles` (user-invoked).

## Problem statement

The three citizen-facing LIFF form pages do not look like one family:

| Chrome | booking (`liff/booking`) | debt-mediation / service-request |
|---|---|---|
| Top header | plain title block, no sticky bar | sticky blurred bar: title + platform subtitle + status badge |
| Stepper | thin progress bars (`StepRail`) + tiny labels | numbered circles with icons + connecting line + Thai step titles |
| Card | local `Section` (rounded-xl, token classes) | shared `Card` glass + `CardHeader` (title + clear button) + `CardContent` |
| Option buttons | token classes + `aria-pressed` | `border-primary bg-primary/5` + radio dot, hardcoded gray |
| Inputs | shared `Input`/`Textarea` primitives | raw `<input>`/`<select>`, hardcoded `bg-white`/`text-gray-900` |
| Date entry | chip strip only (no calendar) | no date entry at all |

Booking is already on theme-core tokens with dark-mode support (PR #207); the other two
pages still use hardcoded gray/white + `bg-primary` with no dark mode. Copying their raw
classes into booking would be a regression.

## Goal

Booking joins the shared LIFF form family **in shape**, while staying on **tokens**
in implementation. A citizen switching between the three pages sees the same header,
the same stepper language, the same card rhythm — and booking gains the system-wide
B.E. calendar as a second way to pick the date.

## First-principles decision

If the three pages had been designed together from day one with a unity requirement,
there would be one LIFF form shell (sticky header, numbered stepper, card container,
option-button pattern, label/input pattern) on semantic tokens. That shell is what
booking adopts here. The debt/service pages themselves are **read-only references** in
this task — their own token migration is recorded as follow-up, out of scope, so this
diff stays booking-only (plus one backward-compatible prop on the shared picker).

## User stories

1. As a citizen, I see the same sticky header (title + subtitle + status) on booking as
   on the other two pages, so I trust I am still inside the same government service.
2. As a citizen, I follow the same numbered steps (บริการ → วันที่ → เวลา → ยืนยัน)
   with the same circle-and-line stepper as the other pages.
3. As a citizen, I can pick my date either by tapping the fast day strip (unchanged)
   or by opening the familiar B.E. calendar; both always show the same selected date.
4. As a citizen, the B.E. calendar never lets me pick a day I cannot book (outside the
   booking window, blackout day, closed/full day) — unbookable days are visibly disabled.
5. As a citizen on dark mode, everything still reads correctly (no white hardcoded
   surfaces leaking in through the new chrome).

## Scope

**In scope** (frontend only, no API change):
- `frontend/app/liff/booking/page.tsx` — header, stepper, card/option/label chrome.
- `frontend/components/ui/CalendarPickerTH.tsx` — three optional additive props:
  `isDateDisabled?: (isoDate: string) => boolean` (disabled day cells get
  `aria-disabled` + non-interactive styling), `minDate?`/`maxDate?` (ISO
  `YYYY-MM-DD`; month navigation clamps to this window). Fully backward compatible
  (absent props = byte-identical behavior).
- `frontend/app/liff/booking/page.tsx` date step — embed the picker bound to the
  same selected-date state as the strip.
- Tests: `frontend/app/liff/booking/__tests__/page.test.tsx`,
  `frontend/components/ui/__tests__/CalendarPickerTH.test.tsx` (or colocated suite).

**Out of scope**:
- Any change to debt-mediation / service-request pages (reference only).
- Debt/service token (dark-mode) migration — follow-up task, not this PR.
- Booking-window policy (`advance_days`, blackouts, availability semantics) — unchanged.
- Backend changes — none needed; `dateOptions`, `blackout_dates`, `rangeInfo` already
  carry every constraint the picker needs.

## Acceptance criteria

1. Booking renders a sticky blurred header with title `จองคิวนัดหมาย`, a service
   subtitle, and a status badge (open/connecting semantics matching the reference pages).
2. The thin-bar `StepRail` is replaced by the numbered circle-and-line stepper with the
   four Thai labels; current/past/future states match the reference look on tokens.
3. Service/date/time/contact sections use the shared `Card` container + header/content
   rhythm; option buttons keep `aria-pressed` and the DESIGN.md rule (brand-500 never
   as text on white — selected text stays `text-brand-text` on `bg-brand-50`).
4. Date step offers strip + B.E. picker; selecting in either updates the other
   immediately (single selected-date state, asserted by test).
5. Picker disables every non-bookable day (out-of-window, blackout, `!is_open`,
   `remaining === 0` once range data arrives); disabled days are not clickable via
   mouse, keyboard, or typed input.
6. No behavior regression: slot loading, submit/edit/cancel flows, Thai copy,
   skeleton, dark-mode tokens all intact; existing booking tests updated, still green.
7. Gates: `npx tsc --noEmit` clean, eslint clean on touched files,
   `npx vitest run app/liff/booking` + picker suite green, `npm run build` passes.

## Risks

- Month-navigation clamping must not trap the user when the whole visible month is
  unbookable — clamp range is the full `dateOptions` window, never a single day.
- Range data (`rangeInfo`) arrives async — days with unknown status stay enabled
  (fail-open, same rule the strip already uses), then disable when data lands.
