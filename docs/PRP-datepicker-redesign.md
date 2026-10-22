# PRP — DatePicker Redesign implementation plan

> PRD: `docs/PRD-datepicker-redesign.md` · Branch: `feat/datepicker-redesign`
> Enforces AGENTS.md: async backend N/A (frontend-only), `cn()`, CVA not needed, Thai UI strings stay Thai,
> comments = why-only, no `as any`, tests colocated `__tests__/`.

## Phase 1 — Reproduce & lock baselines (no UI change)

1. Read `frontend/components/ui/CalendarPickerTH.tsx` popup span + `frontend/app/admin/requests/page.tsx:278-320`.
2. Add/extend `frontend/components/ui/__tests__/CalendarPickerTH.test.tsx`:
   - filled value renders NO `Check` icon;
   - clear button hidden until hover/focus-within (assert via class / `data-state`), visible slot swaps with calendar icon;
   - popup content renders inside a Portal (assert `document.body` contains dialog, not clipped container).
3. Run: `cd frontend && npm run test:unit -- CalendarPickerTH` (expect new tests RED).

## Phase 2 — Slim input (R2/R3/R4)

File: `frontend/components/ui/CalendarPickerTH.tsx` (action-buttons span only).

- Delete the ✓ `span` block.
- Wrap ✕ + 📅 in a single relative slot (`w-8` grid-stack): 📅 default; ✕ overlaid, `opacity-0
  group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100`, same cell → zero width change.
- Add `group` class to the input container; keep `aria-label="ล้างวันที่"`, `title`, focus ring.
- Touch: tapping the slot when filled clears (✕ is the top layer when visible); when empty 📅 opens.
- Validation: `npm run test:unit -- CalendarPickerTH` GREEN; `npm run lint`.

## Phase 3 — Portal popup (R1)

File: same, popup span only. Reuse `Popover`, `PopoverContent` from `./Popover` (Radix Portal +
`z-[var(--z-dropdown)]`), controlled by existing `isOpen` state (mirror `open/onOpenChange` like
`DateRangePicker`). Keep `AnimatePresence` motion INSIDE `PopoverContent` or drop in favour of
`data-[state=open]:animate-scale-in` to match system tokens. Props: `align="start"`, `side="bottom"`,
`avoidCollisions` (default true), `collisionPadding={8}`, `sticky="always"`.

- Remove `absolute z-50 … left-0 sm:left-auto sm:right-0` positioning classes (Radix positions it).
- Keep `role="dialog"`, Esc handling (Radix handles Esc natively — delete the manual listener, why: avoid double handling).
- Mobile width: `w-[calc(100vw-32px)] max-w-[340px]`.
- Validation: Storybook-less check via requests page locally; unit tests GREEN; E2E `request-list.spec.ts` still passes.

## Phase 4 — Filter-row layout (R5 + criterion 4)

File: `frontend/app/admin/requests/page.tsx:278-320`.

- Replace fixed `w-48` wrappers with `w-full sm:w-52` so fields wrap full-width on phones.
- Keep external "ล้างวันที่" ghost button as-is (already conditional); ensure parent has `flex-wrap` (already) —
  no absolute positioning.
- Validation: manual 360px-viewport check + `request-list.spec.ts`.

## Phase 5 — Regression sweep + review

1. `cd frontend && npm run lint && npm run test:unit` (full) + `npx playwright test request-list` (if browsers installed).
2. Grep all `CalendarPickerTH` callers (create page, `[id]` page, booking) — visual check each popup opens.
3. Self-review via `review` skill axes (Standards + Spec) or reviewer triage; `no-comments` pass on the diff.
4. Commit → push → PR → merge per `git_workflow` skill (PR title in English, description Thai summary for user).

## Phase ordering & gates

- Each phase ends GREEN (tests + lint) before the next starts.
- If Phase 3 fights existing motion code, fallback: keep motion but render motion.div through `createPortal` —
  still satisfies "popup escapes overflow-hidden ancestors".
- Effort estimate: S (2 files, ~60 lines net negative).

## Review verdict (pre-implementation, self-review)

- Standards: reuses existing `Popover` primitive (no new dep, no new pattern) ✓; Thai strings unchanged ✓.
- Spec: covers all 3 reported symptoms + shared-component requirement ✓.
- Risks: Radix Popover + framer-motion interplay (mitigated by fallback); touch-hover absence (mitigated by
  external clear button + tap-slot layering). → **READY, pending user's A/B/C choice.**
