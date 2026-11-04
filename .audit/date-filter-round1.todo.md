# Todo: admin date-filter round 1 (subtraction + range validation)

Playbook: Refactoring (poteto-mode). The validation half is split out per its
step-7 rule ("if the cleanup reveals a real bug, ship the structural change
first against the pinned contract") and shipped as unit 2.

## 1. Pin the behavior contract first.
- [x] Run `npm run test:unit` on unmodified trunk and record file/test counts.
  -> 125 files / 1063 tests passed, exit 0.
- [x] Run `npx tsc --noEmit`; record exit code. -> exit 0.

## 2. Name the structure the code is missing.
- [x] Domain fact: a date filter has four states (unfiltered, preset-fixed,
  custom-complete, custom-unusable) and the current types collapse the last two
  into `null`, which is why an unusable range is indistinguishable from no
  filter. Unit 2 adds the missing discriminator.

## 3. Name the target shape.
- [x] `lib/date-range.ts` owns every decision about a range. No page re-derives
  one.

## 4. Subtract before you add.
- [x] Delete `components/ui/DateRangePicker.tsx` (0 consumers).
- [x] Delete `components/ui/Calendar.tsx` (only DateRangePicker consumed it).
- [x] Remove the `Calendar` re-export from `components/ui/index.ts`.
- [x] Remove `defaultDateRange` + `isDefaultRange` and the `DateRange` type
  import from `lib/date-range.ts`.
- [x] Keep the `no-restricted-imports` block in `eslint.config.mjs`; a ban on a
  deleted path still stops the file being re-created. Reworded its message
  to record why the picker was removed.
- [x] Remove `'Calendar'` and `'DateRangePicker'` from the design-system
  inventory array.

## 5. Move in small behavior-preserving steps, keeping the pin green.
- [x] Unit 1 commit: the six deletions above. `3c42387`.
- [x] Unit 2: `customRangeProblem()` + `CUSTOM_RANGE_MESSAGES` in
  `lib/date-range.ts`; `resolveDateRange` returns null when custom is unusable;
  `DatePresetFilter` renders the message. `354ce7d`.

## 6. Prove behavior is unchanged on the real artifact.
- [x] Unit 1: `npm run test:unit` + `npx tsc --noEmit` match the pin exactly.
  -> 125 / 1063, tsc 0.
- [x] Unit 2: new `lib/__tests__/date-range.test.ts` fails before, passes after.
  -> 12 tests pass; against the old resolver the reversed and fallback cases
  failed with the reversed pair echoed back.

## 7. Confirm the change is worth keeping.
- [x] Reader-load delta: one fewer date-picker family, six fewer exported
  symbols, one place that decides whether a range is usable.

## 8. Rebase into small ordered commits. Run Opening a PR.
- [x] Two commits, subtraction then fix.

## Declared skips

- [x] skip: `npm uninstall react-day-picker` — the entry is now unused but the
  lockfile rewrite risks the npm `allow-remote = "none"` policy. Harmless as is;
  remove it on the next install that touches the lockfile.
- [x] skip: Requests page (`app/admin/requests/page.tsx`) keeps `DatePresetButtons`
  and its own start<=end guard. It is already correct; converting it is round 2.
- [x] skip: `resolveDateRangeWithFallback` still falls back to 30 days when a
  custom range is unusable. Making that return null needs nullable plumbing in
  three pages, which is round 2's trigger rework.
- [x] skip: `onValidityChange` callback — no consumer needs it yet.

## Correction found during review

- [x] My own spec made `customRangeProblem('', '')` return `'incomplete'`, so
  opening the "กำหนดเอง" panel would flash a red error before the user touched
  anything. Fixed before commit: an empty pair is the resting state and returns
  null. Test added.

