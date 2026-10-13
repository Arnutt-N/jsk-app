# Plan — LIFF booking visual unity + B.E. date picker (REV 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Metadata**
- **Complexity**: medium (1 page reskin + 1 shared-component additive prop + tests, no backend)
- **Source PRD**: `.claude/PRPs/prds/2026-10-13-liff-booking-unity.prd.md`
- **Phase**: single phase, 4 implementation tasks + ship task
- **Revision**: REV 1 (2026-10-13) — closed all 7 round-1 findings. REV 2 (2026-10-13) — closes all 4 round-2 findings (`review-r2.md`): normalized picker→booking handoff, Task 5 headers, PRD prop-count wording, STEPS type extension.

**Goal:** Booking adopts the shared LIFF form chrome (sticky header, numbered stepper,
card rhythm) on theme-core tokens, and gains the system-wide B.E. picker as a second
view of the same selected date, with non-bookable days disabled.

**Architecture:** Chrome swap inside `frontend/app/liff/booking/page.tsx` only (no new
files except test edits); three optional additive props on `CalendarPickerTH`
(`isDateDisabled`, `minDate`, `maxDate`); single selected-date state shared by strip +
picker. Reference pages are read-only.

**Tech stack:** Next.js client components, React 19, Tailwind v4 tokens, Vitest +
Testing Library. No new dependencies, no API change.

---

## Files to Change

| File | Span | Change |
|---|---|---|
| `frontend/app/liff/booking/page.tsx` | `StepRail` :60-88, `Section` :98-115, header :460-468, date section :619-660 | Sticky header, numbered stepper, Card-based sections, picker wiring |
| `frontend/components/ui/CalendarPickerTH.tsx` | props :14-23, `dayCells` :261-315, `viewMonth` :75-83, nav :218-259 | Optional `isDateDisabled`/`minDate`/`maxDate`; disabled cells; clamped nav |
| `frontend/app/liff/booking/__tests__/page.test.tsx` | whole file (extend) | Header/stepper/chrome/picker-sync tests |
| `frontend/components/ui/__tests__/CalendarPickerTH.test.tsx` | whole file (extend) | Disabled-date + clamp tests |

**NOT Building** (explicit out-of-scope — do not touch):
- `frontend/app/liff/debt-mediation/page.tsx` and `frontend/app/liff/service-request/page.tsx` — READ-ONLY references. Their hardcoded-gray/dark-mode migration is a separate follow-up.
- Shared `Card`, `Badge`, `Button`, `Input`, `Textarea`, `Alert` components — consume as-is.
- Booking-window policy (`advance_days`, blackouts, availability semantics), backend, migrations, API payloads.
- No new "clear section" buttons (the reference clear-button slot is not copied — booking sections have no clear action today and none is invented).
- No `DateTimePickerTH` extraction, no time-field changes.

---

## Before / After (UX states)

| Surface | BEFORE (booking today) | AFTER (this plan) |
|---|---|---|
| Top bar | Plain block: `h1 จองคิวนัดหมาย` + helper sentence, scrolls away (`page.tsx:460-464`) | Sticky blurred bar: icon + `จองคิวนัดหมาย` + subtitle `จองคิวนัดหมายล่วงหน้า • JSK 4.0 Platform` + status `Badge`; helper sentence kept as body text under the bar |
| Stepper | Thin progress bars (`StepRail`, :60-88) | Numbered circles with icons + connecting line, labels บริการ/วันที่/เวลา/ยืนยัน, `aria-current="step"` on current |
| Sections | Local `Section` card (:98-115) | Shared `Card` + `CardHeader`/`CardTitle` + `CardContent` rhythm; same titles, same order |
| Option buttons | Unchanged (already token-compliant + `aria-pressed`) | Unchanged |
| Date step | Day-strip chips only | B.E. `CalendarPickerTH` above the strip; both bound to one date; non-bookable days disabled in the picker |
| Dark mode | Works (tokens) | Still works — every new class is a token, zero hardcoded gray/white |

Explicitly N/A: no user-flow, copy (beyond the one subtitle line), or API change.

---

## Context (codebase patterns with SOURCE refs)

- **Imports.** `@/` maps to `frontend/` (SOURCE: every LIFF page). Card: `import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'` (SOURCE: `debt-mediation/page.tsx:8`). Badge: `import { Badge } from '@/components/ui/Badge'` (SOURCE: `debt-mediation/page.tsx:8`); variants `primary|success|warning|danger|info|gray` (SOURCE: `Badge.tsx:15-70`). Picker default import: `import CalendarPickerTH from '@/components/ui/CalendarPickerTH'` (default export, SOURCE: `CalendarPickerTH.tsx:51`). Date helpers `toISODate`/`parseISODate`/`buildDateOptions` from `@/lib/booking` (SOURCE: `lib/booking.ts:82-133`); both are local-timezone safe by construction (`new Date(year, month-1, day)`).
- **Error handling.** Async failure → `logger.error('<context>:', err)` + `setError(err instanceof Error ? err.message : '<Thai fallback>')`, rendered as `<Alert variant="danger">` (SOURCE: `booking/page.tsx:377-400` `handleSubmit`; `logger` from `@/lib/logger`, already imported). Success notices use `<Alert variant="success">`. No new error paths are added by this plan.
- **State model (corrected — review finding).** Single state `selectedDate` (`page.tsx:203`). ONE interactive writer: `chooseDate` (`:344-351`, sets date + clears slot + loads slots). TWO flow resetters that null it directly: `chooseService` (`:367-375`, null at `:370`) and `resetFlow` (`:402-414`, null at `:407`). Rule: strip and picker both call `chooseDate`; resetters are untouched.
- **Test pattern.** Colocated `__tests__/` suites, `// @vitest-environment jsdom`, `stubLiff()` + `stubFetch()` helpers with `advanceDays`/`blackouts`/`rangeDay` overrides, `userEvent` for clicks, `fireEvent.input` + `fireEvent.blur` for picker typing (SOURCE: `booking/__tests__/page.test.tsx:1-60`, `CalendarPickerTH.test.tsx:1-60`). New tests extend these files following the same helpers.
- **Emission contract (round-2 fix).** `CalendarPickerTH.onChange` emits FULL ISO datetimes via `toISOString()` at three points: `validateAndUpdate` (:173), day-cell click (:292), `วันนี้` button (:625) — all SOURCE-verified by grep. Booking state is date-only `YYYY-MM-DD`. The Task 4 boundary MUST normalize via `toISODate(new Date(emitted))`, which reads LOCAL calendar parts (SOURCE `lib/booking.ts:87-91`) — NEVER `slice(0, 10)`, which takes the UTC calendar day (a day behind in +07:00).
- **DESIGN.md rule.** Brand-500 never as text on white — selected text stays `text-brand-text` on `bg-brand-50` (already the case; preserved).

---

## Risks (with mitigations)

| # | Risk | Mitigation (where it lands) |
|---|---|---|
| R1 | Whole visible month unbookable → clamp traps user with nowhere to go | Clamp range = the full `dateOptions` span (`[0]`..`[last]`, even if it is exactly one day); never an arbitrary narrower clamp; strip remains fully usable regardless (Task 4 GOTCHA) |
| R2 | `rangeInfo` arrives async → picker disables days on stale/partial data | Fail-open: unknown range = enabled, identical to the strip rule; predicate re-memoised when `rangeInfo` lands (Task 4 GOTCHA) |
| R3 | Typed-input bypass of disabled days | `validateAndUpdate` consults the predicate and routes to the existing `localError` path; never calls `onChange` for disabled dates (Task 3 GOTCHA) |
| R4 | Dark-mode regression via hardcoded surfaces | Token-only classes for all new chrome; Task 5 asserts no `bg-white`/`text-gray-*` in the new header/stepper/section markup |
| R5 | Month/year drill-down lands on a disabled month view | Clamp applies to `viewMonth` derivation + prev/next/go-decade handlers; month/year grids themselves stay unfiltered (selection still validates per-day) (Task 3 GOTCHA) |

---

### Task 1: Sticky header + numbered stepper on booking

**ACTION:** Replace the plain header block and thin-bar `StepRail` with the shared LIFF
form chrome, rendered in theme-core tokens.

**IMPLEMENT:**
- Header (`page.tsx:460-468` → sticky bar mirroring `debt-mediation/page.tsx:378-403`):
  `sticky top-0 z-50 bg-surface/70 backdrop-blur-md border-b border-border-default px-4 py-4 mb-6`,
  inner `max-w-lg mx-auto flex items-center justify-between`; left: `CalendarDays` icon
  (`text-brand-500`, already imported) + `h1 จองคิวนัดหมาย` (`text-lg font-bold text-text-primary`)
  + subtitle `จองคิวนัดหมายล่วงหน้า • JSK 4.0 Platform` (`text-[10px] font-medium uppercase tracking-wider text-text-tertiary`);
  right: `<Badge variant={options ? 'success' : 'warning'} className="h-6">{options ? 'เปิดรับจอง' : 'กำลังเชื่อมต่อ…'}</Badge>`
  (variants `primary|success|warning|danger|info|gray`, SOURCE `Badge.tsx:15-70`). Keep the existing helper sentence
  (`เลือกบริการ วันที่ และช่วงเวลาที่สะดวก`) as a `text-sm text-text-secondary` paragraph below the bar.
- Stepper (replace `StepRail` body `:60-88`): numbered circles with per-step icons — extend the `STEPS` array type from `{ key: Step; label: string }` to `{ key: Step; label: string; icon: React.ReactNode }` and add `icon` per step (`service: Users`, `date: CalendarDays`,
  `slot: Clock`, `details: CheckCircle2`, all already imported), markup mirrors
  `debt-mediation/page.tsx:406-429` with token swap (`bg-primary→bg-brand-500`,
  `text-primary→text-brand-text`, `bg-gray-200→bg-border-default`, `text-gray-400/500→text-text-tertiary`);
  past steps render `CheckCircle2`, current keeps `aria-current="step"` (already used at `:79` — carry over).
- Imports to add: `Card` line above, `Badge` line above, `CalendarPickerTH` in Task 4.

**MIRROR:** `debt-mediation/page.tsx:378-403` (sticky bar + badge) and `:406-429` (stepper);
badge semantics mirror `service-request/page.tsx:525-527` (loaded→success, else→warning).

**VALIDATE:** `npx vitest run app/liff/booking/__tests__/page.test.tsx` (new header/stepper
assertions below) → PASS; `npx tsc --noEmit` clean.

**GOTCHA:** (R4) every new class must be a token — `bg-white`, `text-gray-900`,
`bg-gray-200`, `text-gray-400/500`, `bg-primary` are BANNED in the new markup; the
reference's `bg-primary` becomes `bg-brand-500`, its `text-primary` becomes
`text-brand-text`. Task 5 greps for leaks.

- [ ] **Step 1: Failing tests** — sticky bar (`banner` role or `sticky` class) shows
  `จองคิวนัดหมาย` + `Badge` (`เปิดรับจอง` when options load, `กำลังเชื่อมต่อ…` while
  booting); stepper shows บริการ/วันที่/เวลา/ยืนยัน as numbered circles with a
  connecting line and `aria-current="step"` on the current step. Run suite → FAIL.
- [ ] **Step 2: Implement** — per IMPLEMENT above.
- [ ] **Step 3:** suite + `tsc` green.
- [ ] **Step 4: Commit** — `feat(liff-booking): shared header + numbered stepper`

### Task 2: Card / label chrome alignment (tokens, no behavior change)

**ACTION:** Re-skin the local `Section` onto shared `Card` primitives; converge labels
on the reference label pattern rendered in tokens.

**IMPLEMENT:**
- `Section` (`page.tsx:98-115`) becomes:
  `<Card glass className="overflow-hidden"><CardHeader className="bg-bg/50 border-b border-border-subtle"><CardTitle className="text-base flex items-center gap-2"><span icon/>{title}</CardTitle></CardHeader><CardContent className="pt-6">…` —
  token translation of `debt-mediation/page.tsx:434` (`bg-gray-50/50→bg-bg/50`,
  `border-gray-100→border-border-subtle`). `glass` internals render `bg-white/70` inside the shared component — accepted as-is per NOT Building (never edit shared primitives); the token rule governs `page.tsx` markup only. No clear button (NOT Building).
- Section titles, order, option-button markup/classes, `ContactFieldsForm` fields and
  `Input`/`Textarea` primitives: UNCHANGED except label spans:
  `text-xs font-medium text-text-secondary` → `text-xs font-bold uppercase tracking-wide text-text-secondary`
  (reference shape `debt-mediation/page.tsx:508`, gray→token).
- Success/done card (`rounded-xl border … bg-surface p-6`) → same `Card` rhythm (header
  `จองคิวสำเร็จ`, content unchanged).

**MIRROR:** `debt-mediation/page.tsx:434-447` (Card + header + content nesting).

**VALIDATE:** booking suite (extend: sections render `Card` container with title in
header; option buttons keep `aria-pressed`; labels keep Thai copy) → PASS; `tsc` clean.

**GOTCHA:** (R4) `bg-gray-50`/`border-gray-100` must not be copied literally — use the
token mapping above. Do NOT add clear/reset buttons to headers.

- [ ] **Step 1: Failing tests** — per VALIDATE. Run suite → FAIL.
- [ ] **Step 2: Implement** — per IMPLEMENT above.
- [ ] **Step 3:** suite + `tsc` green.
- [ ] **Step 4: Commit** — `feat(liff-booking): shared card rhythm on tokens`

### Task 3: `CalendarPickerTH` gains optional disabled-date + window props

**ACTION:** Add three optional additive props; disabled cells are non-interactive;
month navigation clamps to the window. Zero behavior change when props are absent.

**IMPLEMENT** (`CalendarPickerTH.tsx`):
- Props (`:14-23` interface): `isDateDisabled?: (isoDate: string) => boolean`,
  `minDate?: string | null`, `maxDate?: string | null` (ISO `YYYY-MM-DD`). All optional.
- Day cells (`dayCells` `:261-315`): per cell compute `cellISO = toISODate(new Date(year, month, d))`
  (local-safe helper; do NOT use `toISOString`). `const disabled = isDateDisabled?.(cellISO) ?? false`.
  Disabled cell: `aria-disabled="true"`, `tabIndex={-1}`, no `onClick` side effect
  (guard the existing handler: `if (disabled) return;`), classes add `opacity-40 cursor-not-allowed`
  and skip the hover scale. Keyframes/`motion.button` stay.
- Typed path (`validateAndUpdate` `:132-179`): after `parseThaiDate` succeeds, derive the
  ISO day and if `isDateDisabled?.(iso)` → `setLocalError('วันที่เลือกไม่สามารถจองได้')` and
  return WITHOUT calling `onChange` (R3). Out-of-`[minDate, maxDate]` typed dates get
  `setLocalError('วันที่อยู่นอกช่วงที่เปิดให้จอง')`, same no-emit rule.
- Clamp (picker owns it — R1/R5): `viewMonth` memo (`:75-83`) clamps the derived month into
  `[minDate, maxDate]` when both are set (compare year/month only); `goPrevMonth/goNextMonth`
  (`:218-226`) and decade handlers (`:243-244`) refuse to leave the window; the `วันนี้` button
  (`:~621`) falls back to `minDate` when today is outside the window instead of emitting an
  unbookable date. `setViewMonthOverride(null)` reset points stay as-is. Emission format is UNCHANGED (`toISOString` at :173/:292/:625) — existing consumers are unaffected; normalization happens once at the caller (Task 4).
- Import `toISODate` from `@/lib/booking` (SOURCE `lib/booking.ts:87-91`).

**MIRROR:** Existing `localError` display path (`:640+`, `text-red-500` error paragraph) for
the two new rejection messages; existing picker tests for interaction selectors.

**VALIDATE:** `npx vitest run components/ui/__tests__/CalendarPickerTH.test.tsx` (new cases
in Testing Strategy rows P1-P6) → PASS; full existing picker suite untouched and green; `tsc` clean.

**GOTCHA:** (R3) keyboard activation (Enter/Space on a focused cell) must hit the same
`disabled` guard — with `tabIndex={-1}` + handler guard both are covered; assert both.
(R5) month/year grids are NOT filtered — only the day grid and typed entry enforce.
`toISOString()` is BANNED for cell keys (UTC shift); `toISODate` local parts only.

- [ ] **Step 1: Failing tests** — Testing Strategy rows P1-P6. Run picker suite → FAIL.
- [ ] **Step 2: Implement** — per IMPLEMENT above.
- [ ] **Step 3:** picker suite + `tsc` green.
- [ ] **Step 4: Commit** — `feat(CalendarPickerTH): optional isDateDisabled + window clamp`

### Task 4: Wire the B.E. picker into the booking date step

**ACTION:** Render `CalendarPickerTH` above the strip in the date section, bound to the
same selected date; predicate disables every non-bookable day.

**IMPLEMENT** (date `Section`, `page.tsx:619-660`):
- `<CalendarPickerTH ariaLabel="เลือกวันที่จอง" value={selectedDate} onChange={(iso) => { if (iso) chooseDate(toISODate(new Date(iso))) }} isDateDisabled={isDateDisabled} minDate={dateOptions[0] ?? null} maxDate={dateOptions[dateOptions.length - 1] ?? null} />`
  (normalization is REQUIRED: the picker emits full `toISOString()` datetimes — SOURCE `CalendarPickerTH.tsx:173/:292/:625` — while `selectedDate` is `YYYY-MM-DD`; `toISODate` reads local parts per the Emission contract above; NEVER `slice(0, 10)`). Add `toISODate` to the existing `@/lib/booking` import in `page.tsx` (currently imports `parseISODate` but not `toISODate`).
  with a Thai label line above (`เลือกจากปฏิทิน` + helper `ปี พ.ศ.` is inherent to the picker).
  `chooseDate` (`:344-351`) is the ONLY interactive writer — the picker never calls
  `setSelectedDate` directly; `chooseService`/`resetFlow` null-resets stay untouched (corrected model).
- Predicate (memoised on `dateOptions`, `blackout_dates` from `options`, `rangeInfo`):
  `disabled(iso) = !inWindow.has(iso) || rangeInfo?.get(iso) satisfies (!is_open || remaining === 0)`.
  `inWindow` = `new Set(dateOptions)` (already excludes blackouts via `buildDateOptions`,
  SOURCE `lib/booking.ts:120-133`). Unknown range (`rangeInfo` null or entry absent) → enabled (R2 fail-open,
  same rule as the strip's `chipDisabled`, `:630-636`).
- Placement: picker above the strip inside the same date `Card`; strip markup/behavior unchanged.

**MIRROR:** Strip's fail-open rule (`:630-636`: absent entry keeps chip enabled); preselect
effect (`:356-365`) which already skips closed/full days — picker inherits it for free.

**VALIDATE:** booking suite (Testing Strategy rows B1-B6) → PASS; `tsc` clean.

**GOTCHA:** (R1) if `dateOptions` is empty, render the picker WITHOUT `minDate`/`maxDate`
(unclamped) rather than an inverted window. (R2) predicate must re-memoise on `rangeInfo`
so chips that disable late also disable in the picker. Do NOT duplicate `buildDateOptions`
logic — `inWindow` derives from the existing `dateOptions` memo.

- [ ] **Step 1: Failing tests** — rows B1-B5. Run suite → FAIL.
- [ ] **Step 2: Implement** — per IMPLEMENT above.
- [ ] **Step 3:** suite + `tsc` green.
- [ ] **Step 4: Commit** — `feat(liff-booking): B.E. picker synced with day strip`

### Task 5: Validation + PR

**ACTION:** Run the full gate set, open the PR, land it, and hand off.

**IMPLEMENT:** From `frontend/`: `npx tsc --noEmit`; `npx eslint` on the four touched files; `npx vitest run app/liff/booking components/ui/__tests__/CalendarPickerTH.test.tsx`; `npm run build`; token-leak grep per the GOTCHA below — then the ship sequence in Step 2.

**MIRROR:** Standard repo ship loop — push branch → PR → CI 4/4 → squash-merge → watch CD (per the `git_workflow` skill and repo practice).

**VALIDATE:** CI 4/4 green on the PR, CD deploys cleanly, handoff checkpoint accepted by the validator.

**GOTCHA:** Whole-batch LIFF unit suites flake under load on pristine `main` too — targeted files are the gate; record incidental failures by file name, do not chase.

- [ ] **Step 1:** from `frontend/`: `npx tsc --noEmit` → clean; `npx eslint
  app/liff/booking/page.tsx components/ui/CalendarPickerTH.tsx
  app/liff/booking/__tests__/page.test.tsx components/ui/__tests__/CalendarPickerTH.test.tsx`
  → 0 errors; `npx vitest run app/liff/booking components/ui/__tests__/CalendarPickerTH.test.tsx`
  → green; `npm run build` → `/liff/booking` prerenders. Token-leak grep on the new
  markup: `bg-white|text-gray-|bg-gray-|bg-primary |text-primary(?!-)` → zero hits in
  `page.tsx` header/stepper/section hunks (R4). (Known whole-batch LIFF flakes —
  targeted files are the gate; record incidental failures by file name, do not chase.)
- [ ] **Step 2:** push branch `feat/liff-booking-unity-debt-service`, open PR, CI 4/4,
  squash-merge, watch CD.
- [ ] **Step 3:** handoff checkpoint (`agent_handover`).

---

## Testing Strategy

| ID | Input | Expected |
|---|---|---|
| P1 | Picker with `isDateDisabled={(iso) => iso === '2026-10-20'}`; open calendar, that day cell | `aria-disabled="true"`, `tabIndex -1`, `opacity-40`; click + Enter do NOT call `onChange` |
| P2 | Same setup; type 20/10/2569 + blur | Thai error `วันที่เลือกไม่สามารถจองได้`; `onChange` NOT called |
| P3 | Type 15/01/2567 (allowed) + blur | `onChange` called once; `toISODate(new Date(emitted))` === `2024-01-15` (the picker emits a full `toISOString` string — the day is asserted in LOCAL parts, matching how the existing suite reads it) |
| P4 | No new props (existing suite) | Byte-identical behavior; all existing picker tests green unmodified |
| P5 | `minDate`/`maxDate` set; click prev at min month / next at max month | View does not leave the window; `วันนี้` button with today outside window selects `minDate` |
| P6 | `isDateDisabled` set; drill year→month→day, pick allowed day | Selects normally; month/year grids show no disabled styling |
| B1 | Booking: tap strip chip for an open day | Matching picker value updates (picker shows the date) |
| B2 | Booking: pick a bookable day in the picker | Matching strip chip becomes `aria-pressed`, slots load (same as chip tap) |
| B3 | Booking with blackout + `rangeDay` closed/full overrides | Those days disabled in picker; unknown-range days stay enabled (fail-open) |
| B4 | Booking with `rangeStatus` error | Strip + picker both fully enabled (fail-open both layers) |
| B5 | Empty `dateOptions` (no services) | Picker renders unclamped, no crash; empty-state copy unchanged |
| B6 | Pick a bookable day in the picker, then submit | Outgoing request body `booking_date` matches `YYYY-MM-DD` exactly (no time component) |

**Edge-case checklist:** blackout day · closed day (`!is_open`) · full day (`remaining===0`) ·
out-of-window day · unknown range (fail-open) · range request fails (fail-open) ·
strip→picker sync · picker→strip sync · keyboard activation on disabled cell ·
typed disabled date · typed out-of-window date · empty window · dark-mode classes
(token grep) · `aria-pressed` preserved on options · `aria-current="step"` on stepper ·
existing submit/edit/cancel flows green.

## Validation Commands (all exist — verified against `frontend/package.json`)

```bash
cd frontend && npx tsc --noEmit
cd frontend && npx eslint <touched files>          # 0 errors
cd frontend && npx vitest run app/liff/booking components/ui/__tests__/CalendarPickerTH.test.tsx
cd frontend && npm run build                        # /liff/booking prerenders
```

## Self-review (REV 1)

1. **Spec coverage:** PRD AC1→Task 1, AC2→Task 1, AC3→Task 2, AC4→Task 4, AC5→Tasks 3+4, AC6→every task Step 3 + Task 5, AC7→Task 5.
2. **Review findings closed:** PRP format (ACTION/IMPLEMENT/MIRROR/VALIDATE + import paths) ✓; state model corrected (`chooseDate` :344-351 + resetters :370/:407; E5 span fixed) ✓; clamp owned by picker via generic `minDate`/`maxDate`, caller passes `dateOptions` ends ✓; Risks R1-R5 + per-task GOTCHA ✓; NOT Building ✓; Before/After + N/A ✓; Testing Strategy table + edge checklist ✓; Context patterns with SOURCE refs ✓.
3. **Type consistency:** `isDateDisabled?: (isoDate: string) => boolean`, `minDate?: string \| null`, `maxDate?: string \| null` — identical in Tasks 3+4 and Testing Strategy.
4. **Blast radius:** one page + three optional props + tests; reference pages untouched; no backend, no migration, no API change.
5. **REV 2 closures (round-2):** Task 4 handoff normalizes via `toISODate(new Date(iso))` (never `slice`); picker emission disclosed with SOURCE refs; P3 rewritten + B6 payload row added; Task 5 carries full PRP headers; STEPS type extension spelled out.
