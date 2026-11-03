# PRD: Next.js 16.4.3 security upgrade + `react-hooks/set-state-in-effect` conformance

**Date:** 2026-11-01 · **Status:** APPROVED (2026-11-01) · **Branch:** `chore/next-16-4-3-cve`

Sources: `npm audit` on this branch, Vercel build logs for `dpl_5mKScGPDpEPNw6CLxGXWGudThLdM`, and the probe results recorded in this session (see "Evidence" below). No secrets appear in this document; all figures are counts and file names.

## Problem Statement

### 1. Production dependency tree carries 3 critical advisories

`npm audit --omit=dev` on `main` (`e6769f5`) reports **4 critical / 16 high** in production dependencies. Three critical are Next.js 16.1.1 itself:

| Advisory | Class |
|---|---|
| `GHSA-9g9p-9gw9-jx7f` | DoS via Image Optimizer `remotePatterns` |
| `GHSA-h25m-26qc-wcjf` | DoS via RSC deserialization |
| `GHSA-ggv3-7p47-pfv8` | HTTP request smuggling in `rewrites` |

The fourth critical (`tinypool`) is dev-only. The app exposes `/api/v1` rewrites through `next.config.js`, so the smuggling class is directly relevant rather than theoretical.

Fix is available: `next@16.4.1+`. The advisory range is `9.3.4-canary.0 - 16.4.0`.

### 2. Upgrading breaks lint on 54 pre-existing call sites

Upgrading to `next@16.4.3` pulls `eslint-plugin-react-hooks@7.1.1` (via `eslint-config-next@16.4.3`, which declares `^7.1.0`; the previous `eslint-config-next@16.1.1` declared `^7.0.0` and resolved 7.0.1). 7.1.1 ships `react-hooks/set-state-in-effect` at the **recommended** preset, which is applied as an error:

```
✖ 61 problems (54 errors, 7 warnings)
  53  react-hooks/set-state-in-effect
   1  react-hooks/immutability
```

54 errors across **42 files**. None of them are new defects — they are the existing "fetch on mount" shape used consistently across the admin app:

```tsx
const fetchLogs = useCallback(async () => {
  setLoading(true)          // ← synchronous setState
  try { … } finally { setLoading(false) }
}, [deps])

useEffect(() => { fetchLogs() }, [fetchLogs])   // ← flagged here
```

### 3. The rule cannot be satisfied by a local edit

Probed against the real plugin with a throwaway ESLint flat config (results below). The rule resolves the callee transitively, so every arrangement that keeps the fetcher callable *and* calls it from an effect is flagged:

| Probe | Shape | Result |
|---|---|---|
| C | `setState` directly in effect | ❌ error |
| E | `useCallback` fetcher, setState after `await` | ❌ error |
| H | plain `async function` fetcher in component body | ❌ error |
| I | fetcher that wraps the work but still starts with sync `setLoading` | ❌ error |
| K | `useEffectEvent` wrapper | ❌ error |
| L / M | fetcher with no sync setState, `setLoading` moved to the click handler | ❌ error |
| A / B | setState only inside a nested `async`/`Promise.then` in the effect body | ✅ pass |
| G | async function **declared inside** the effect body | ✅ pass |
| J | `await Promise.resolve()` as the fetcher's first statement | ✅ pass |
| N | effect-local async fn + `reloadKey` for refetch | ✅ pass |

J passes by exploiting the rule's sync-analysis, not by fixing anything. It is excluded on principle.

**The consequence matters for scoping:** for files whose fetcher is also called from a button, pagination, or a post-save refresh, satisfying the rule means changing the fetch lifecycle (reload key, or moving loading state into the event handler), not moving a line.

### 4. Test coverage of the affected surface is thin

Of the 42 files, only 7 have a colocated unit test:

`admin/bookings`, `admin/requests`, `admin/rich-menus` (list/new/edit), `liff/debt-mediation`, `components/ui/CalendarPickerTH`.

The remaining 35 — including every settings page, `users`, `files`, `chat-histories`, `friends`, `analytics`, `audit`, `reports`, and `lib/booking/store.ts` — are covered only by `tsc`, lint, `next build`, and Playwright smoke, which does not exercise admin CRUD flows.

## Solution

Ship the security upgrade, and bring the flagged call sites into conformance **in phases ordered by risk**, so the CVE fix is not held hostage to a 42-file refactor.

**Phase 1 — upgrade + 40 files, 48 errors.** Land `next@16.4.3` and `eslint-config-next@16.4.3`, then fix every flagged effect that is not part of the LIFF booking flow: fetchers shared with handlers (S1/S2), derived/reset effects (S3–S7), the rendered browser value (S8), the declaration reorder (S9), and the two effects whose sync write moves across an existing async boundary (S10) — `image-resize` and `analytics`.

**Phase 2 — the LIFF booking flow (2 files, 6 errors).** `lib/booking/store.ts` and `components/admin/WalkinBookingDialog.tsx` use S10 (range + slots effects) and S11 (the render-phase preselect), and sit under the most heavily tested LIFF flow. They get their own PR. `loadSlots`, `rangeInfo`, `dispatch` and the `BookingStore` interface stay unchanged.

> An earlier draft split on "is the fetcher reused?", claiming 29/33 then 11/15. That premise was **measured false** — every fetcher in the first group is reachable from at least one handler. The split above is by risk surface, which is what the revert story actually needs.

## Non-Goals

- Not fixing the 3 remaining **production** high advisories (`lodash`, `source-map-js`, `zod`) — upstream ranges, tracked separately.
- Not fixing the dev-only `tinypool` / `@vitest/mocker` / `jsdom` chain — it sits behind Vitest 5, a major upgrade with its own scope.
- Not adopting `await Promise.resolve()` or any deferral whose only purpose is to defeat the linter.
- Not changing fetch behaviour: same requests, same loading transitions from the user's perspective, same error handling.
- Not adding a data-fetching library; the shapes stay as they are. The blanket `useSyncExternalStore` ban is narrowed to "not for data fetching" — the one place it would have applied (Toast's hydration guard) is solved instead by gating on `toasts.length` (shape S6).

## User Stories

1. As a system owner, I want the production frontend off Next.js 16.1.1 so the request-smuggling and RSC deserialization advisories no longer apply to an app that ships `/api/v1` rewrites.
2. As a citizen using a LIFF mini-app, I want the platform I submit personal data through to not carry a known DoS class in its framework.
3. As a maintainer, I want `npm run lint` green after the upgrade so a real regression cannot hide behind 54 inherited errors.
4. As an admin using any list page, I want the upgrade to not change how loading, filtering, or pagination behaves.
5. As an admin saving a settings form, I want the page to refresh its data afterwards exactly as it does today.
6. As a developer touching an admin page later, I want the fetch-on-mount pattern to be one shape across the app, so I copy the correct one.
7. As a reviewer, I want each phase to be independently revertable, so a regression in Phase 2 does not force reverting the CVE fix.
8. As an on-call engineer, I want the effect-local cancellation guard that Phase 1 introduces, because it closes a pre-existing unmount-after-await race in several pages.

## Implementation Decisions

**D1. Upgrade both packages together.** `next` and `eslint-config-next` move to `16.4.3` in the same commit. The error count is **unchanged** by the `eslint-config-next` bump (measured: still 54 errors / 42 files before and after) — the rule arrives through a transitive `eslint-plugin-react-hooks` bump, **7.0.1 → 7.1.1**, in the lockfile (`eslint-config-next@16.4.3` declares `^7.1.0`; `16.1.1` declared `^7.0.0`). `eslint-config-next` is bumped for version alignment, not to affect the count.

**D2. Conformance is a per-effect-type shape table, not one universal shape.** Eleven shapes were probed against the installed plugin and pass. **The plan is the normative source for shape definitions and IDs; this table is a summary.** Which one applies depends on what the flagged effect does:

| Effect type | Shape |
|---|---|
| Fetcher shared by an effect and a handler | S1: module-scope loader + effect-local guarded wrapper |
| S1 plus polling / a handler that must reuse the effect's exact path | S2: S1 + `reloadKey` |
| Sync reset in an early return (e.g. `if (!parentId) setX([])`) | S3: derive the empty case during render |
| Mirroring a prop / reset-on-change / filter resets page | S4: adjust state during render with a prev-value state |
| Browser-only read at mount, **not server-rendered** | S5: lazy `useState(() => …)` initializer |
| Hydration mount guard | S6: gate on real data instead of a `mounted` flag |
| Ref write tied to a prop (ref read only in handlers) | S7: the ref write gets its own effect |
| Browser value that **is** rendered | S8: `useSyncExternalStore` — the only permitted use, never for data fetching |
| Use-before-declare (`immutability` rule) | S9: reorder declarations |
| A sync write inside an effect that already has an async boundary | S10: move the write across that boundary (`.then` / `setTimeout` / effect-local `run()`) and derive the emptied case |
| A dispatch that setStates, needed at render time | S11: call it inside a render-phase guard |

`setState` directly in an effect body, a sync `setState` before an `await`, a component-scoped `useCallback` fetcher called from an effect, `void Promise.resolve().then(() => dispatch(...))` from an effect, `useEffectEvent`, a ref-guarded first-run flag, and writing **or reading** `ref.current` during render all **fail**. Do not use them.

**D3. Loading state on mount comes from `useState` initialisation.** Most affected files already initialise `loading` to `true`. Where a file initialises to `false`, change the initial value rather than reintroducing a synchronous `setLoading(true)`.

**D4. Existing tests are the contract.** Test files must pass with no modification. If a behaviour assertion fails, the implementation is wrong, not the test. Coverage is thin — only 7 of the 42 files have a colocated test — so the plan lists the suites to run per phase rather than claiming full coverage.

**D5. No escape hatch.** The `warn` downgrade is removed from this PRD (decision 2026-11-01). The rule stays at `error` throughout.

**D6. Verify against the real toolchain, not inference.** Every claim about the rule's behaviour in this PRD came from running ESLint against the installed plugin, not from reading its docs. No pattern is adopted without a lint run proving it.

## Evidence

**Pre-upgrade audit** (`main` @ `e6769f5`): `npm audit --omit=dev` → 4 critical, including 3 Next.js.

**Post-upgrade audit** (`next@16.4.3`): `npm audit --omit=dev` → 0 critical, 3 high (`lodash`, `source-map-js`, `zod` — all in the production tree).

**Gates on the upgrade branch** (`chore/next-16-4-3-cve`, before the lint work):

| Gate | Result |
|---|---|
| `npx tsc --noEmit` | exit 0, 0 errors |
| `npm run build` | `✓ Compiled successfully in 68s` |
| `npm run lint` | **FAIL** — 54 errors, 42 files |
| `npm audit --omit=dev` | 0 critical, 3 high (production: `lodash`, `source-map-js`, `zod`) |

**Rule attribution:** the count comes from `eslint-plugin-react-hooks` **7.0.1 → 7.1.1** in the lockfile. `eslint-config-next@16.4.3` declares `^7.1.0` where `16.1.1` declared `^7.0.0`, so the bump is what forces 7.1.1. `eslint-config-next` is bumped 16.1.1 → 16.4.3 for version alignment; measured before and after, the error count stays at 54 across 42 files.

**Incidental (unrelated to this PRD):** the Vercel build failures seen earlier in the session were traced to `outputFileTracingRoot` disagreeing with `turbopack.root`, fixed separately in PR #307. They are not caused by this upgrade and do not block it.

## Success Criteria

1. `npm audit --omit=dev` reports 0 critical (3 production high remain, tracked separately).
2. `npm run lint` reports 0 errors on `main` with `next@16.4.3`.
3. `npx tsc --noEmit` and `npm run build` pass.
4. Every test file covering a touched surface passes unmodified (the plan lists them per phase; coverage is 7 colocated suites across 42 files, so this is necessary but not sufficient).
5. Playwright smoke passes on each merge commit.
6. Each phase is a separate PR, revertable without unpicking the others.
7. CD deploys the frontend on the Phase 1 merge commit, and the deployed build shows no `outputFileTracingRoot` warning.

## Risks

| Risk | Mitigation |
|---|---|
| Behaviour change in an untested admin page (35 of 42 files) | Phase split by effect type; Phase 1 keeps the bulk mechanical; every file is lint-verified individually before moving on |
| `lib/booking/store.ts` regression breaks the LIFF booking flow | Own phase and PR; all three Phase 2 shapes probed, including a React 19 mount of the slots effect; `liff/booking` + `walkin.test.tsx` gate it; `loadSlots`, `rangeInfo` and `BookingStore` stay unchanged; revert is one PR |
| Deleting `setRangeStatus('loading')` changes a status transition | `rangeStatus` starts `'idle'` and its only consumer tests `'ready'`/`'failed'` (store.ts:206), so `'idle'` and `'loading'` behave identically — **no derivation is used**; verify `/liff/booking` by hand |
| A `cancelled` flag in an effect that changes its own dependency self-cancels and discards the successful response | Prohibited in the plan (S1 carries the caveat, Phase 2 Step 4 omits the flag); mount-probed both ways |
| Analytics 30 s polling silently stops | Both the interval and the manual refresh bump one `reloadKey`, so a single data effect serves both; manually confirm a second update at 30 s with the socket disconnected |
| `npm run build` dirties `next-env.d.ts` | `git checkout -- frontend/next-env.d.ts` after every build; never stage it |
| PR #1 staging sweeps unrelated work | Stage files individually; never `git add frontend/app` |
| Rule returns on a future upgrade | Rule stays at `error`; no `warn` downgrade exists in this PRD |
| **An effect holds several sync `setState`s** — the rule reports only the first, so fixing it moves the error to the next one | Re-lint the file after every individual fix; gate per **effect**, never per reported line. Observed at `login/page.tsx:94→101` and `image-resize:141→145/146` |
| **First paint changes** on 5 pages that start `loading=false` (`audit:59`, `analytics:94`, `reports:199`, `AssignModal:33`, `useOperatorRoster:47`) | Deliberate and documented in the plan's UX table; those pages show a spinner instead of empty content until the first fetch resolves |

## Open Questions

Resolved 2026-11-01 (revised 2026-11-02):

1. ~~One PR or several?~~ → **Two PRs**: Phase 1 (upgrade + 40 files / 48 errors) and Phase 2 (booking flow, 2 files / 6 errors).
2. ~~Where does `lib/booking/store.ts` go?~~ → **Its own phase (Phase 2)**, with `WalkinBookingDialog.tsx`.
3. ~~Is the temporary `warn` downgrade acceptable?~~ → **No.** The escape hatch is removed; the rule stays at `error`.
