# Correct: mistake classes in the react-hooks sweep

Audited `e6769f5..0fe03f0`. Two candidate classes surfaced. One is real and already structural. The other only looked like a class.

## Class A: a derived twin that shadows raw state (counts, 6 sites)

**Evidence.** After the sweep six components hold both a raw state and a derived twin with near-identical names:

| File | Raw | Derived |
|---|---|---|
| `app/admin/image-resize/use-image-resize.ts:35-36` | `outputBlob`, `outputUrl` | `visibleBlob`, `visibleUrl` (`:54-55`) |
| `lib/booking/store.ts:74` | `slots` | `visibleSlots` (`WalkinBookingDialog.tsx:74`) |
| `components/forms/ThaiAddressCascade.tsx:55-56` | `districtList`, `subDistrictList` | `districts`, `subDistricts` (`:67-68`) |
| `app/admin/live-chat/_components/ConversationList.tsx:188` | `searchResultList` | `searchResults` (`:190`) |

**Why it happens.** The lint rule forbids writing state in an effect, so the emptied case moved into a render-time derivation. The old state has to stay for the async writer.

**The real hazard.** In `image-resize` the page disables Download/Upload with `!visibleBlob`, but `downloadOutput` (`:189`) and `uploadToMedia` (`:202`) guard on the raw **`outputBlob`**. The derivation table is verified correct (`.audit-probe/__tests__/derivation-table.test.tsx`, 4 assertions), so today the UI guard is what prevents a stale download. That is one guard deep, not two.

**Level chosen: types, not architecture.** The two values have different meanings ("what the async work produced" versus "what may be shown"), so collapsing them into one type would be wrong. A branded type is also too heavy for four files. The level that works is a **test that pins the derivation table**, which now exists. A comment on each raw state naming who reads it would be the cheaper structural fix and is worth doing alongside any future edit to these files.

**Why not higher.** Architecture (one owner per value) already holds: the raw state has exactly one writer, the derived value exactly one reader. The problem is only that the raw value is *reachable* from handlers. Restricting that reach means passing `visibleBlob` into the handlers instead of reading state, which is a behaviour change, not a mistake fix, and belongs in its own change.

## Class B: the repeated `cancelled`-guard block (does NOT count)

**Evidence.** 42 files contain `let cancelled = false`; 40 effects hold the full guard block.

**Why it is not a class.** Measured with `.audit/sweep-shape-audit.cjs`:

```
effects scanned: 65
effects with a cancelled guard: 40
distinct normalised bodies among them: 39
bodies appearing more than once verbatim: 1
```

39 distinct bodies across 40 effects. Only one pair (`friends/[lineUserId]:180` and `rich-menus/aliases:71`) is identical. A shared helper would have to take the body as a callback, and a callback closing over component scope is exactly what `react-hooks/set-state-in-effect` rejects. The duplication is **forced by the constraint**, so extracting it would reintroduce the bug the sweep removed.

One genuine defect inside this class: `app/admin/audit/page.tsx` has a blank line between every line of the block, which no other file does. That is formatting drift from a hand edit, not a class.

## Rule table

| Rule | Enforced by | How to run |
|---|---|---|
| An effect must not write a state that appears in its own dependency array (self-cancelling deadlock) | `.audit/deadlock-scan.cjs`, 0 findings over 43 files | `node .audit/deadlock-scan.cjs $(cat .audit/changed.txt \| tr '\n' ' ')` |
| A derived value must be pinned by a test when a raw twin stays live | `frontend/.audit-probes/__tests__/derivation-table.test.tsx` | `node frontend/node_modules/vitest/vitest.mjs run --root frontend .audit-probes` |
| The sweep's mount-verified behaviour claims must stay true | `frontend/.audit-probes/__tests__/{safety-fact,storage-write,discarded-render}.test.tsx` | same command |

Two corrections to the previous version of this table. The probe path was wrong: `.audit-probe/` was renamed to `.audit/probes/`, then moved again into `frontend/.audit-probes/` once it turned out three of the four probes import `@/lib/...` and cannot resolve from the repo root. A rule whose enforcer nobody can run is not enforced, so the path and the run command are both part of the rule.

The third row used to say `discarded-render` "fails the intent". That was accurate when the render-phase `dispatch` was going to be fixed. It has not been fixed, and the fix was reverted after it regressed `calendar.test.tsx`. The test now documents the known impurity rather than guarding against it, and that is stated here instead of implied.
