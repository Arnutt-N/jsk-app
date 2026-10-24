# PRD — DatePicker Redesign (shared component)

> Branch: `feat/datepicker-redesign` · Page: `/admin/requests` · Scope: system-wide via shared components
> Skills invoked: `frontend-design`, `frontend_architecture` (+ project rule: AGENTS.md workflow)
> References: shadcn Date Picker (button + Popover Portal + Calendar),
> Ant Design DatePicker `allowClear` (clear icon on hover/focus only), Radix Popover collision handling.

## 1. Problem (what the user sees, plain words)

On `https://jsk-app.vercel.app/admin/requests`, the "จากวันที่ / ถึงวันที่" filter row misbehaves:

1. **Calendar popup gets cut off (ถูกบัง).** The popup cannot be seen fully / is hidden behind other parts.
2. **The date box overflows onto neighbours.** After picking or typing a date, a green ✓ and an ✕ appear
   *inside* the box; the box is only 192px wide (`w-48`) so content spills over other elements.
3. **The "ล้างวันที่" (clear) button overlaps other elements** in some widths.

## 2. Root causes (technical)

| # | Cause | File:line |
|---|-------|------------|
| R1 | `CalendarPickerTH` renders its popup as `absolute` inside a `relative` container — no Portal. Any ancestor with `overflow-hidden` (e.g. the requests table `Card … overflow-hidden`, motion/stagger ancestors creating containing blocks) clips it. No flip/shift collision handling, fixed `w-[340px]` with only a `max-w` guard. | `frontend/components/ui/CalendarPickerTH.tsx` (~line 330 popup) |
| R2 | The input row permanently reserves space for THREE trailing controls: ✓ status + ✕ clear + 📅 open-calendar, inside a `w-48` box next to three sub-inputs (วว/ดด/ปปปป). When a value exists all three show → overflow. | `CalendarPickerTH.tsx` (~line 250 action buttons) |
| R3 | The ✓ is redundant confirmation: the chosen date is already visible as text AND highlighted in the calendar. It buys nothing but costs ~24px. | same |
| R4 | The ✕ is always visible when dirty. Popular libraries (AntD `allowClear`, MUI, shadcn) show clear **only on hover/focus**, overlaid in the SAME slot as the calendar icon (swap, not append) → zero extra width. | research: ant.design DatePicker `allowClear`; shadcn date-picker |
| R5 | `DateRangePicker` (used elsewhere) already does it right: Radix `Popover` + `Portal` (`PopoverContent` → `PopoverPrimitive.Portal`), so it never clips. The fix is to bring `CalendarPickerTH` onto the same mechanism instead of inventing a third one. | `frontend/components/ui/Popover.tsx`, `DateRangePicker.tsx` |

## 3. Design decision (recommended)

**Option A — Slim input + Portal popup (recommended, smallest change, system-wide):**

- **Remove the ✓ entirely.** Confirmation = the date text itself + highlighted day in the calendar.
- **✕ appears only on hover / keyboard focus, and only when a value exists** — overlaid in the calendar-icon
  slot (icon swap, no layout shift, no extra width). Touch devices: tap the 📅 area toggles; plus the
  existing external "ล้างวันที่" text-button for the pair stays as the discoverable clear affordance.
- **Popup renders in a Portal** (reuse existing `Popover`/`PopoverContent`: Radix Portal + `z-[var(--z-dropdown)]`
  + `avoidCollisions`/`collisionPadding`), `align="start"`, `side` flips automatically near viewport edges.
- **Mobile:** popup `w-[calc(100vw-32px)] max-w-[340px]`; keep day/month/year sub-inputs (familiar Thai พ.ศ. typing),
  but allow the two filter fields to wrap full-width under `sm:` instead of fixed `w-48`.
- **Clear affordance (no overlap):** keep ONE external "ล้างวันที่" ghost button for the pair (already exists),
  shown only when dirty, in normal flow with `flex-wrap` — never absolutely positioned over neighbours.
- **States to keep:** error text under the field (already), `disabled` dates, keyboard Esc close, focus-visible rings.
- **Accessibility:** clear button keeps `aria-label="ล้างวันที่"`, appears on `:focus-visible` too (not hover-only),
  matching AntD's a11y fix (ant-design#58132).

**Option B — shadcn-style single range button for the filter row:**
One button "จากวันที่ – ถึงวันที่" opening a 2-month range calendar with presets (7/30/90 วัน) — exactly what
`DateRangePicker` already implements. Nicer for filters, but changes a familiar UI and touches page logic
(validation message, query params stay the same shape). Defer unless user prefers.

**Option C — A now, B later.** (Default if user picks A: build A so B can reuse the Portal popup.)

## 4. Acceptance criteria (user-testable on phone + desktop)

1. Open `/admin/requests`, tap 📅 on "จากวันที่" → full calendar visible, never cut off, on desktop AND phone.
2. Pick a date → box shows only `วว/ดด/ปปปป` + ONE 📅 icon; no ✓, no permanent ✕; nothing spills onto neighbours.
3. Hover/focus a filled box → ✕ fades in over the 📅 slot; clicking it empties the box.
4. "ล้างวันที่" appears only when at least one date set; clears both; never overlaps anything at 360px width.
5. No other page using `CalendarPickerTH` regresses (create page, detail page, booking forms): popup opens,
   typing วว/ดด/ปปปป still commits, errors still show.
6. `npm run lint` + related Vitest suites pass.

## 5. Out of scope

- Changing date format / พ.ศ. logic, backend query params, or validation rules.
- Rewriting `DateRangePicker` (already Portal-based).
- Bottom-sheet calendar on mobile (consider only if Portal popup still feels cramped in testing).

## 6. Iron rule reminder (user-mandated 2026-10-13)

No secret/key material is printed in any handoff, summary, or log for this task. Verification by counts only.
