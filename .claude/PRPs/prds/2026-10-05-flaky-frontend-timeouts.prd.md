# PRD: Stabilize Flaky Frontend Timeout Tests (debt-mediation + requests)

Date: 2026-10-05 · Branch: `fix/flaky-frontend-timeouts-20261005` · Owner: Muse Code
Skills invoked: `bundled:plan`, `blueprint`, `debugging-and-error-recovery`,
`diagnosing-bugs`, `karpathy-guidelines` (baseline); skill map:
`.claude/docs/skill-collections-20260712.md`.

## 1. Background

The full frontend unit suite (`npm run test:unit`, 90 files / 751 tests) shows
4–6 failing tests on this machine, always confined to two files and always with
the same signature — `Test timed out` (never an assertion failure):

- `frontend/app/liff/debt-mediation/__tests__/page.test.tsx` — up to 5 wizard
  tests time out at the 5s default budget.
- `frontend/app/admin/requests/__tests__/page.test.tsx` — the pagination test
  times out even with its raised `{ timeout: 15000 }` budget.

Proven pre-existing and unrelated to any recent feature work: the identical
signature reproduces on a clean `main` worktree, the failing set varies
run-to-run (4 → 5 → 1 → 2 → 6 across runs), and neither file imports anything
from recent diffs (evidence: `session-summary-20261004-2340.md`).

## 2. Problem statement (root causes, evidence-backed)

1. **debt-mediation: interaction volume vs 5s budget.** 15 tests drive long
   multi-step wizard flows with `userEvent` (default `setup()`). Every
   `user.type`/`user.click` awaits dozens of dispatched events; long Thai
   strings are typed char-by-char. Measured in isolation on a loaded machine:
   file total 49s/15 tests; a *passing* test took 4515ms against the 5000ms
   budget (~10% headroom — any load tips it over).
2. **requests pagination: 100-row renders vs 15s budget.** The `fullPage`
   fixture (100 rows) is load-bearing: `hasMore = data.length >= PAGE_LIMIT`
   (`page.tsx:91,138`) enables the Next button. Measured in isolation:
   39.5s for 8 tests (~5s average per test); the 3-render Next→Prev flow
   exceeds even the raised 15s budget under load.
3. **Contributing noise:** `window.scrollTo(0, 0)` is called unguarded in 4
   places in the debt-mediation page; jsdom logs `Not implemented:
   window.scrollTo` errors on every step transition.
4. **Config:** `vitest.config.ts` sets no `testTimeout` (5s default), no pool
   tuning; `vitest.setup.ts` only auto-cleans React trees.

## 3. Goals

- G1: Both files pass reliably — 3 consecutive green runs of the two files
  together on this machine, plus CI green on the PR.
- G2: No assertion or coverage weakened — every existing `expect` stays;
  behavior under test is unchanged.
- G3: Test-only change — zero production-code edits.

## 4. Non-goals

- Fixing any other flaky/skipped test, the pre-existing
  `upload-security.test.ts` tsc errors, or the live-chat E2E seed gap.
- Changing global vitest pool/workers (slows all of CI for a 2-file problem).
- Adding retry config (hides flakes) or fake timers (brittle with real-promise
  fetch mocks — see §7).
- Guarding `window.scrollTo` in production components (follow-up candidate).

## 5. Scope (files)

| # | File | Change |
|---|------|--------|
| 1 | `frontend/vitest.setup.ts` | Global `window.scrollTo` stub (noise removal) |
| 2 | `frontend/app/liff/debt-mediation/__tests__/page.test.tsx` | Fast text fills + file-level 15s budget |
| 3 | `frontend/app/admin/requests/__tests__/page.test.tsx` | 15s → 30s on the two heavy tests |

## 6. Requirements

- R1: debt-mediation text inputs (name, phone, amount, counterparty names,
  interest rate) must fill via a single-event method instead of
  char-by-char typing, wherever no assertion depends on intermediate
  keystroke state (verified: none do — normalization/validation happen at
  submit; `normalizePhone`/`isValidPhone` are unit-tested in
  `lib/liff/__tests__/submit-debt-mediation.test.ts`).
- R2: Clicks, option selects, and confirm-modal flows keep `user-event`
  (interaction fidelity where it matters).
- R3: debt-mediation file gets a realistic budget: 15s (matches the existing
  requests per-test precedent; ~3× the worst measured isolated pass).
- R4: requests keeps its 100-row fixture (load-bearing) and fireEvent style;
  the two heavy tests get 30s (~2× the observed failure threshold).
- R5: The global `scrollTo` stub must not break any of the 5
  scrollTo-adjacent suites (verified by repo-wide grep):
  `useVirtualScroll.test.tsx` (stubs `Element.prototype.scrollTo` — a
  different function) plus 4 suites that set their own
  `window.scrollTo = vi.fn()` (overwrite-compatible): request-v2
  `validation.test.tsx:64`, service-request `upload-retry.test.tsx:48`,
  service-request `validation.test.tsx:61`, service-request-single
  `validation.test.tsx:67`. All 5 must run green in Task 1 validation.
- R6: Every touched file keeps all existing assertions green; per-unit
  validation before commit; scoped `eslint` + CI green before merge.

## 7. Rejected alternatives

- **Fake timers + `advanceTimers`:** deterministic but brittle with the real
  async fetch mocks and the 500ms debounce; high rewrite risk for 23 tests.
- **`userEvent.setup({ delay: null })`:** insufficient — installed
  user-event 14.6.1 defaults to `delay: 0` (verified in dist `setup.js`;
  non-number `null` skips the timer yield per `utils/misc/wait.js`), so
  `null` would skip waits but each keystroke still dispatches the full
  keydown/keypress/keyup + React update cycle. `fireEvent.change` wins on
  dispatch volume (one event per input vs dozens per string).
- **Global pool/worker reduction or `retry`:** slows/hides rather than fixes.
- **Shrinking the 100-row fixture:** breaks `hasMore` (load-bearing);
  exporting `PAGE_LIMIT` from prod code violates G3.

## 8. Success criteria (measurable)

- S1: `npx vitest run <both files>` green 3 consecutive times on this machine.
- S2: No per-test duration within 20% of its budget in the final runs.
- S3: Full `npm run test:unit` shows no *new* failures vs the pre-change
  baseline (pre-existing flakes in these two files gone).
- S4: `eslint` clean on touched files; CI green on the PR.
