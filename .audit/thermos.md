# Thermos: unified verdict

Two thermo passes, deduplicated. Overlaps are weighted; disagreements are resolved below.

## Verdict

Not ready to leave as-is. Four real defects and one inaccurate PR claim. None are security issues and none block the upgrade, but three are user-visible and all are cheap to fix.

## Findings, merged and ranked

| # | Finding | Bug pass | Quality pass | Severity | Evidence |
|---|---|---|---|---|---|
| 1 | Telegram error banner never clears after a successful save | ✔ | — | **Medium** | `setError` clear moved from `fetchConfig` into the mount effect; proven by reading all three call sites |
| 2 | ~31 of 40 `cancelled` guards protect nothing; ~120 lines of unnecessary boilerplate | — | ✔ | **Medium** | Probed: `void run()` with no guard passes lint; guard sits after the last write |
| 3 | Three parallel fetches serialised in `requests/[id]` | ✔ | ✔ | **Low** | diff: `void a(); void b(); void c()` became `await a(); await b(); await c()` |
| 4 | Stale search results shown for a new query | ✔ | ✔ | **Low** | `searchResultList` never cleared on query change |
| 5 | Render-phase `dispatch` writes sessionStorage outside commit | ✔ | ✔ | **Low** | Ran it: storage went null to populated with no commit |
| 6 | Blob URL not revoked on the image-resize error path | ✔ | — | **Low** | Pre-existing, not introduced by this change |

Finding 2 is the one the quality pass weight most heavily, and it is correct on the evidence. Findings 3, 4 and 5 were found independently by both passes.

## Disagreement resolved: the `loading` flips

Both adversaries and the bug pass assert the five `useState(false)` to `useState(true)` flips are missing. They are right that the flips are absent, and they are wrong that this is a defect in the code. Verified by grep: all five files still read `useState(false)`, and the base-to-head diff contains no loading initialiser change at all. The claim in the PR body that five pages now start with `loading=true` describes work that was never done. Behaviour is unchanged, so nothing is broken, but the description is untrue and should be corrected.

## Quality-pass claims I am not acting on

- **"Zero of the raw exports are read"** for `outputBlob` / `outputUrl` / `error` in `use-image-resize`. False: `downloadOutput` (`:189`) and `uploadToMedia` (`:202`) read `outputBlob` in their guards. That is exactly why finding 6 exists.
- **`hooks/useApiFetch.ts` already exists as the canonical layer.** It does, with one internal reader. Migrating 30 admin pages onto it is a much larger change than a lint conformance sweep and would obscure this diff.
- **`files/page.tsx` crossed 1000 lines.** True (995 to 1025), but the file was already at 995 and finding 2 is what pushed it over. Fixing finding 2 restores it below the limit without a split.

## What the passes cleared

No security regression, no removed guards on auth or data paths, no feature-flag leaks, no environment or secret change. `package.json` changes only `next` and `eslint-config-next`. `ThaiAddressCascade`, `CalendarPickerTH`, `WalkinBookingDialog` and `store.ts`'s removal of `setRangeStatus('loading')` were all checked and are behaviour-preserving.
