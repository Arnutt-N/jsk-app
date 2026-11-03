# Blast radius: next 16.4.3 + react-hooks conformance (e6769f5..0fe03f0)

## What it does

`next` 16.1.1 to 16.4.3, `eslint-config-next` to 16.4.3, which forces `eslint-plugin-react-hooks` 7.1.1 and turns on `react-hooks/set-state-in-effect`. 41 source files were rewritten to clear the 54 sites it flagged. The non-obvious part: four of those rewrites moved **state writes out of effects and into render**, because that is what the rule rewards. Two of them call a component-scoped `dispatch`, not a bare `setState`.

## The one fact it is safe because of

> No effect's `cancelled` guard discards a response the original code applied.

**Certainty: level 4 (ran it).** Two mounts in `.audit-probe/__tests__/safety-fact.test.tsx`:
`lib/booking/store.ts` reaches `availability !== null` with the spinner cleared, and `image-resize` settles its `processing` flag. A companion static scan (`.audit/deadlock-scan.cjs`) checked all 43 changed files for the inverse shape (an effect whose body writes a state that is in its own deps) and found **0**.

## Risks

### 1. Render-phase `dispatch` writes sessionStorage outside a commit boundary (confirmed, level 4)

`lib/booking/store.ts:219` calls `dispatch({ type: 'date/set' })` during render, to preselect the nearest bookable day. `dispatch` reaches `store.dispatch`, which calls `saveDraft(state, storage)` at `lib/booking/draft.ts:267`, a synchronous `sessionStorage.setItem`.

Proof (`.audit-probe/__tests__/discarded-render.test.tsx`): calling the same path with no committed render moves `liff-booking-draft` from `null` to `{"draft":{"date":"2026-11-10"}}`.

Measured blast: a single StrictMode mount writes the draft **2 times** and finishes consistent with the live draft (`.audit-probe/__tests__/storage-write.test.tsx`, output `{"storageWrites":2,"persistedDate":"2026-11-10","liveDraftDate":"2026-11-10"}`).

**Likelihood**: certain to write during render; moderate that a discarded render persists a draft the user never saw (needs an interrupted or thrown render at that point).
**Cost**: low. The preselected date is the one the citizen would have been shown next anyway, and the next committed render overwrites it.
**How to check**: `discarded-render.test.tsx` reproduces the impurity deterministically.

**This is new.** Before the change every `dispatch` call was inside an effect (`git show e6769f5:frontend/lib/booking/store.ts`, line 214). The sweep moved it into render to satisfy the lint rule.

### 2. `token` and `setSlots` ordering changed (checked, benign)

`store.setSlots(key, loaded)` now runs **after** the key guard, where it used to run before it (`store.ts:118-119` before, `store.ts:241-242` now). A superseded response no longer warms the slot cache, so an A to B to A date switch refetches once where it previously hit cache. Extra request, no wrong data.

## Cleared

- **The deadlock class.** 43 files scanned for an effect that writes a state in its own deps while holding a `cancelled` guard: 0 found. Two mounts confirm the guards do not fire on their own writes.
- **`loadSlots` callers.** The public signature is unchanged and the UI's two call sites (`app/liff/booking/page.tsx:394,448`) still compile and pass.
- **`rangeInfo`.** Still returned from `rangeByDate`, which the sweep did not delete.
- **`BookingStore` interface.** Untouched; `tsc --noEmit` exit 0.
- **`WalkinBookingDialog` `handleSave`.** Reads `service`/`date`/`slotTime`, never the raw `slots` array, so deriving `visibleSlots` does not affect submission.
- **`image-resize` catch path.** `setBlobKey(currentKey)` in the catch makes a failed resize settle instead of spinning forever. Verified by mount.

## Before you merge

Already merged. The follow-up that closes risk 1 is: move the preselect back behind a commit boundary, or make `dispatch` non-persisting during render, and add `.audit-probe/__tests__/discarded-render.test.tsx` as a regression test.
