# Todo: admin date-filter round 2 (single text trigger)

Playbook: Feature (poteto-mode). Round 1 (PR #313, merge `c502d09`) deleted the
dead picker family and made an unusable custom range visible. This round changes
how the filter presents itself: one trigger whose text names the active range,
opening a panel that holds the presets and the custom pickers.

## 1. `how` over the affected subsystem.
- [x] Done across this session: read all six consumers, `DatePresetFilter`,
  `CalendarPickerTH`, `lib/date-range.ts`, `lib/format-date.ts`, and the popover
  primitives. Six consumers, one file changes.

## 2. `architect` for parallel design exploration.
- [ ] skip: one component plus one pure function, and the design space is
  already enumerated in this session against Carbon, Atlassian, Polaris, and
  Material. No competing implementation shape survives review. Verified there
  are no second consumers of the internals and no alternative data shape.

## 3. Throughput checkpoint.
- **Blocking first steps.** The label derivation must exist before the component
  can render it, so `describeDateFilter` lands in `lib/date-range.ts` first with
  its test.
- **Independent workstreams.** None. One component file consumes one function.
- **Shared mutable state.** None. The component adds local `open` state only;
  `preset`/`customStart`/`customEnd` stay owned by the page.
- **Smallest safe decomposition.** One worker. Two files change and the second
  reads the first.

## 4. Delegate code-writing.
- [ ] Spawn `pstack:poteto-agent` on branch `feat/admin-date-filter-trigger`.
- [ ] Data shape named before the delegate writes logic: a date filter has five
  presentable states (resting, preset, custom-incomplete, custom-reversed,
  custom-valid). One function maps state to label; the JSX reads it, it does not
  re-derive it.

## 5. Verify on the matching surface.
- [ ] `lib/__tests__/date-range.test.ts` gains label cases.
- [ ] New `components/admin/__tests__/DatePresetFilter.test.tsx` drives the
  real component in jsdom: trigger text, open, pick a preset, pick custom.

## 6. Rebase into small ordered commits.
- [ ] Unit 1 the derivation, unit 2 the component.

## 7. `interrogate` before shipping.
- [ ] skip: the design is not contested. The choice between a text trigger and a
  separate removable chip is settled below with a stated reason.

## 8. Run Opening a PR.
- [ ] After both units are green.

## Design decision, recorded

The trigger's own text is the chip. No second removable chip is added.

- These are single-purpose date filters on a page, not a multi-filter bar, so
  the Carbon and Atlassian shape applies: the trigger names the range.
- The pages already have `ล้างตัวกรอง`, which clears every filter on the page.
  A `×` on the trigger that also clears everything duplicates it; a `×` that
  clears only the date needs new props on five pages, because "cleared" means
  `30d` on the three report pages and `null` on the two list pages.
- If a per-page date-only reset is wanted later, it is one optional prop and one
  handler per page. It is not needed to answer "what range am I looking at".

## Declared skips

- [ ] skip: converting `app/admin/requests/page.tsx` to the shared filter. It
  keeps two always-visible pickers and its own guard. Round 3, if ever.
- [ ] skip: `resolveDateRangeWithFallback` staying non-nullable. Unchanged here.
- [ ] skip: a `×` on the trigger. Reason above.
