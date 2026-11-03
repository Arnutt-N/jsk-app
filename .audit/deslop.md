# Deslop: removal pass over the sweep

Diff base: `main` (`0fe03f0`). 9 files touched, +20 / -36 lines net.

## What was removed

**Formatting drift.** `app/admin/audit/page.tsx` had a blank line between every line of the cancellation block, producing 27 lines where 9 belong. No other file in the sweep did this. Restored to the surrounding style.

**Speculative condition.** `lib/booking/store.ts:239` guarded the slot response with `if (!idToken || latestSlotKeyRef.current !== key) return`. `idToken` is already required by the effect's first line and cannot change mid-flight, so that term could never be true at that point. Removed; the key guard stays.

**Narration comments.** Nine comments described what the code below them plainly does ("Reset the form when the dialog opens", "Derived: no parent selected means no children"). Six were rewritten to name the constraint a reader cannot infer, which is that these blocks are render-phase specifically to satisfy `react-hooks/set-state-in-effect`. Comment count is unchanged; only their content changed from restating the code to naming the reason.

## What was deliberately kept

- The `svc` / `day` aliases in `store.ts`. They look redundant next to `service` / `draft.date`, but they are what narrows `string | null` to `string` for the async closure. Removing them reintroduces the `tsc` error the earlier review round caught.
- The `cancelled` guard in all 40 effects. Measured as unabstractable: 39 distinct bodies across 40 effects, so a helper would need a component-scoped callback, which is the pattern the lint rule rejects.
- The derived-twin comment pairs on `visibleBlob` / `visibleUrl`. They explain which of two similarly named values a caller wants, which is not inferable.

## Verification

- `npx eslint` on all nine touched files: clean.
- `npx tsc --noEmit`: exit 0.
- `vitest run` across the eight touched surfaces: **338 tests, 44 files, all pass**.
- `app/admin/bookings/__tests__/walkin.test.tsx` was run four times in isolation after two failures under load. It passes in 2.2s, 3.1s and 5.0s isolated, and timed out at 20s+ only while `tsc` and a full-project `eslint` were running concurrently. Recorded as environmental, not a regression.
