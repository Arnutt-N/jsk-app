# PRP Plan: Stabilize Flaky Frontend Timeout Tests (round 2)

## Metadata

- Complexity: Small (3 test-only files, zero production edits)
- Source PRD: `.claude/PRPs/prds/2026-10-05-flaky-frontend-timeouts.prd.md`
- Branch: `fix/flaky-frontend-timeouts-20261005` (created, based on `main@6e81cfa`)
- Working directory: ALL shell commands run from `frontend/` unless stated.
  (`cd frontend` first; every validation command below assumes it.)
- Installed versions (verified): vitest `^2.1.9`, `@testing-library/user-event`
  `^14.6.1` (dist default `delay: 0`), jsdom `^25.0.1` (SOURCE:
  `frontend/package.json`).

## Summary

Two frontend suites fail intermittently with `Test timed out` (never assertion
failures; failing set varies run-to-run; identical signature on clean `main`):
debt-mediation (15 tests, 5s default budget, file measured 49s in isolation
with a passing test at 4515ms) and requests pagination (8 tests, 100-row
renders, file measured 39.5s, exceeds even its raised 15s budget). Fix is
test-only in 3 units: silence `window.scrollTo` globally, convert 26
`user.type` calls to single-event `fireEvent.change` + file-level 15s budget,
raise the two heavy requests tests to 30s.

## UX Clarity

N/A — internal change (test-only; no user-visible behavior changes).
Before/after evidence is slowest-test durations per file (before: debt ~4.5s+
pass / 5s timeouts; requests 15s timeout; after-thresholds: <12s / <24s).

## Files to Change

| # | File | Lines touched | What |
|---|------|---------------|------|
| 1 | `frontend/vitest.setup.ts` | 2 (add `vi` import), append 2 lines | Global `window.scrollTo` stub |
| 2 | `frontend/app/liff/debt-mediation/__tests__/page.test.tsx` | 2 (import), ~8 (setConfig), 26 `user.type` sites (see site table) | Fast fills + 15s budget |
| 3 | `frontend/app/admin/requests/__tests__/page.test.tsx` | 149, 175 (`{ timeout: … }` args) | 15s → 30s budgets |

## NOT Building

- No production-code edits of any kind (no component, lib, or config changes
  outside the 3 test files above).
- No vitest pool/worker/parallelism changes; no `retry` config; no fake timers.
- No fixture shrinking (the 100-row page stays — load-bearing for `hasMore`).
- No other test files; no `upload-security.test.ts` fix; no E2E seed work.
- No `window.scrollTo` guards in production components (follow-up candidate).

## Step-by-Step Tasks

### Task 0 — Capture the pre-change baseline (evidence, no commit)

- ACTION: Run both suites once with the basic reporter; save output; record
  slowest-test duration per file for the before/after comparison.
- IMPLEMENT: from `frontend/`:
  `npx vitest run --reporter=basic app/liff/debt-mediation/__tests__/page.test.tsx app/admin/requests/__tests__/page.test.tsx > $env:TEMP\flake-baseline.log 2>&1`
  then extract per-test `✓/FAIL … Nms` lines.
- MIRROR: the committed evidence doc records the same timeout signature and
  main-worktree reproduction this baseline re-captures (SOURCE:
  `project-log-md/muse_code/session-summary-20261004-2340.md`, Findings).
- VALIDATE: log file exists with a `Test Files` / `Tests` summary; slowest
  durations noted (expect debt ≥4s or timeouts; requests slow/15s timeout).
- GOTCHA: A single run is evidence, not a gate — the flake is
  load-dependent; the gate is 3 consecutive greens AFTER the change.

### Task 1 — Silence `window.scrollTo` globally (Unit 1)

- ACTION: Stub `window.scrollTo` in the shared vitest setup so the 4
  unguarded calls in the debt-mediation page stop emitting jsdom errors.
- IMPLEMENT in `frontend/vitest.setup.ts` (current lines 1–10: jest-dom
  import, `afterEach(cleanup)`):
  1. Extend line 2 to `import { afterEach, vi } from 'vitest'`.
  2. Append after the `afterEach` block:
     `// jsdom does not implement window.scrollTo (step-transition effects`
     `// call it); stub globally — a file may overwrite with its own mock.`
     `window.scrollTo = vi.fn()`
- MIRROR: request-v2 suite already stubs it file-locally (SOURCE:
  `frontend/app/liff/request-v2/__tests__/validation.test.tsx:64`
  `window.scrollTo = vi.fn();`); virtual-scroll suite stubs the
  element-level sibling (SOURCE:
  `frontend/app/admin/live-chat/_hooks/__tests__/useVirtualScroll.test.tsx:104`
  `Element.prototype.scrollTo = vi.fn() …`).
- VALIDATE (from `frontend/`): all five scrollTo-adjacent suites green:
  `npx vitest run app/admin/live-chat/_hooks/__tests__/useVirtualScroll.test.tsx app/liff/request-v2/__tests__/validation.test.tsx app/liff/service-request/__tests__/upload-retry.test.tsx app/liff/service-request/__tests__/validation.test.tsx app/liff/service-request-single/__tests__/validation.test.tsx`
- GOTCHA:
  - G1.1: The `vi` import is REQUIRED in setup (it currently imports only
    `afterEach`) — without it the stub throws at load and breaks ALL suites.
  - G1.2: Blast radius is global by design; five scrollTo-adjacent suites
    exist (verified by repo-wide grep excluding node_modules) and all are
    overwrite-compatible: four set their own `window.scrollTo = vi.fn()`
    (request-v2 validation:64, service-request upload-retry:48,
    service-request validation:61, service-request-single validation:67)
    and one stubs `Element.prototype.scrollTo` (useVirtualScroll:104 — a
    different function). All five run in VALIDATE above.
- Commit: `test(setup): stub window.scrollTo for jsdom`.

### Task 2 — Fast fills + 15s budget for debt-mediation (Unit 2)

- ACTION: Convert all 26 `user.type` text fills to single-event
  `fireEvent.change`; add a file-level 15s budget. Keep every `expect`
  byte-identical; keep clicks/selects on `user-event`.
- IMPLEMENT in
  `frontend/app/liff/debt-mediation/__tests__/page.test.tsx` (432 lines):
  1. Line 2: extend to
     `import { render, screen, waitFor, fireEvent } from '@testing-library/react'`.
  2. After imports (~line 8, before `jsonResponse`): add
     `vi.setConfig({ testTimeout: 15_000 })` + comment
     `// Long wizard flows exceed the 5s default under load (worst measured
     // isolated pass 4.5s); per-file budget, ~3x headroom.`
     (`vi` is already imported — SOURCE: line 4.)
  3. Replace each `user.type` site below with
     `fireEvent.change(<same element lookup>, { target: { value: '<same string>' } })`
     e.g. line 55
     `await user.type(screen.getByPlaceholderText('ระบุชื่อ-นามสกุล'), 'สมชาย ใจดี')`
     becomes
     `fireEvent.change(screen.getByPlaceholderText('ระบุชื่อ-นามสกุล'), { target: { value: 'สมชาย ใจดี' } })`
     (drop `await` — `fireEvent` is sync).
- Site table (all 26 `user.type(` calls — verified by grep):

| Test / helper | Lines | Inputs converted |
|---|---|---|
| `fillStep2` (51–59) | 55, 56, 57 | name, phone, amount (line 58 `selectOptions` KEEP) |
| full debtor path | 114, 115 | creditor name, interest |
| creditor path | 161 | debtor name |
| `อื่น ๆ` rejection | 186, 187 | creditor name, interest |
| server error | 209, 210 | creditor name, interest |
| phone-no-digits | 229, 230, 231 | name, phone `abcdefghij`, amount (232 `selectOptions` KEEP) |
| 422-array fallback | 256, 257 | creditor name, interest |
| F02 submitter switch | 281, 282 | creditor name, interest |
| F03 dashed phone | 324, 325 | creditor name, interest |
| F03 +66 phone | 349, 350 | creditor name, interest |
| F06 session-expired | 392, 393 | creditor name, interest |
| F11 whitespace name | 422, 423, 424 | name `'   '`, phone, amount (425 `selectOptions` KEEP) |

- MIRROR: the requests suite already fills inputs this way (SOURCE:
  `frontend/app/admin/requests/__tests__/page.test.tsx:86`
  `fireEvent.change(screen.getByLabelText('จากวันที่'), { target: { value: '2026-09-01' } });`).
  Behavior equivalence: the form stores raw input and normalizes/validates
  at submit (SOURCE: `frontend/app/liff/debt-mediation/page.tsx:171-172`
  validation, `:219` `normalizePhone` at submit); no test asserts
  intermediate keystroke state; `normalizePhone`/`isValidPhone` are
  unit-tested (SOURCE:
  `frontend/lib/liff/__tests__/submit-debt-mediation.test.ts`).
- VALIDATE (from `frontend/`):
  `npx vitest run app/liff/debt-mediation/__tests__/page.test.tsx` green ×3
  consecutive; record slowest-test duration each run (must be <12s — the
  20% margin under the 15s budget).
- GOTCHA:
  - G2.1: KEEP the `user` param of `fillStep2(user, …)` — line 58 still
    calls `user.selectOptions`, so the param stays used; all 9 call sites
    (107,153,182,206,253,277,320,345,389) untouched. (Removing it would
    force 9 call-site edits for zero gain.)
  - G2.2: KEEP `userEvent.setup()` + all `user.click` (40+ sites) and the 3
    `user.selectOptions` (58, 232, 425) — only `user.type` converts.
  - G2.3: `fireEvent` is sync — drop `await` on converted lines (leftover
    `await` on a non-promise passes lint but misleads readers).
  - G2.4: F11's `'   '` and F03's `+66`/dashed strings go through
    `fireEvent.change` VERBATIM — the component does no per-keystroke
    transform, so submit-time behavior is identical.
  - G2.5: `vi.setConfig` must sit at module top level (it is per-file
    under vitest's default `isolate: true` — no cross-file effect).
- Commit: `test(liff): fast text fills + 15s budget for debt-mediation suite`.

### Task 3 — 30s budget for requests pagination (Unit 3)

- ACTION: Raise the timeout on the two heavy 100-row tests 15s → 30s.
  No other edits (file is already `fireEvent`-based).
- IMPLEMENT in `frontend/app/admin/requests/__tests__/page.test.tsx`
  (191 lines): line 149 and line 175, change `{ timeout: 15000 }` to
  `{ timeout: 30000 }` (tests `next page sends skip=100…` and
  `resets to page one when filters change`).
- MIRROR: per-test timeout is this file's own established pattern (SOURCE:
  lines 149, 175 as they exist today); the 100-row fixture is load-bearing
  (SOURCE: `frontend/app/admin/requests/page.tsx:91`
  `const PAGE_LIMIT = 100;`, `:138`
  `setHasMore(result.data.length >= PAGE_LIMIT);`).
- VALIDATE (from `frontend/`):
  `npx vitest run app/admin/requests/__tests__/page.test.tsx` green ×3
  consecutive; slowest test must be <24s.
- GOTCHA:
  - G3.1: Do NOT shrink `fullPage` — fewer than 100 rows disables Next via
    `hasMore` and silently voids what these tests prove.
  - G3.2: Only the two `{ timeout: … }` args change — a wider diff means
    scope creep; verify BEFORE committing with `git diff --stat` from the
    repo root (expect 1 file, 2 lines changed).
- Commit: `test(admin): 30s budget for 100-row pagination tests`.

Publish order: Task 1 → Task 2 → Task 3 (one commit each; no file spans
tasks; setup first so the suites benefit immediately).

## Validation Commands (all exist — verified in `frontend/package.json`)

| Purpose | Command (from `frontend/`) |
|---|---|
| Focused suites | `npx vitest run <file…>` (vitest `^2.1.9` installed) |
| Full unit suite | `npm run test:unit` (= `vitest run`, no shard/worker flags in CI) |
| Lint touched files | `npx eslint <3 files>` (flat config in repo) |
| Production build gate | `npm run build` (= `next build`, package.json scripts) — run once at the end; test-only change must keep it green |
| Assertion-untouched proof (from REPO ROOT — overrides the `frontend/` default) | `git diff main...HEAD -U0 -- frontend/app/liff/debt-mediation/__tests__/page.test.tsx frontend/app/admin/requests/__tests__/page.test.tsx` piped to `Select-String -Pattern '^[+-].*expect\('` → must return NOTHING. Triple-dot anchors at the merge-base so the plan's own per-task commits don't void the check. |

## Testing Strategy + Edge-Case Checklist

Repetition is the gate (load-dependent flake): every focused command green
×3 consecutive; final both-files-together ×3. No test is added/removed;
each existing edge test must still pass with its exact original `expect`:

- [ ] F03 dashed → `payload.phone_number === '0812345678'`
- [ ] F03 +66 → `payload.phone_number === '+66812345678'`
- [ ] F06 401 → `SESSION_EXPIRED_MESSAGE` shown, no success screen
- [ ] F11 whitespace → `กรุณาระบุชื่อ-สกุล` shown, stays on step
- [ ] F02 switch → debtor issue `aria-pressed=false`, CREDITOR payload, null rate
- [ ] server-error 422 → backend message shown, no success screen
- [ ] 422-array → Thai fallback shown, `Value error` absent
- [ ] F04 provinces-500 → Thai load error + retry refetches (≥2 calls)
- [ ] full debtor → full `toMatchObject` payload + auto-close text
- [ ] creditor path → debtor-info header, no interest field, null rate
- [ ] requests Next→Prev → `skip=100` then `skip=0` URLs
- [ ] requests filter-reset → back to `skip=0`

## Acceptance Criteria

- S1: Both files together green ×3 consecutive on this machine.
- S2: Slowest test <80% of its budget (<12s debt, <24s requests).
- S3: Full `npm run test:unit` vs Task-0 baseline: these two files' flakes
  gone, zero new failures.
- S4: `eslint` clean on the 3 touched files; `npm run build` green; CI
  green on the PR.
- S5: Assertion-untouched proof passes (no `expect(` line added/removed).

## Risks

- RISK-1: If 30s still proves tight for requests on a saturated machine,
  fallback is splitting the Next→Prev flow into two tests reusing one
  render (adds state-leak risk — budget-first is the correct order).
  Mitigation: ×3 repetition locally + CI gate before merge.
- RISK-2: Machine-load variance makes any single local green meaningless.
  Mitigation: ×3 streaks everywhere; CI (clean Linux runners) is the
  final gate, not local runs.
- RISK-3: Global setup stub affects all 90 suites. Mitigation: five
  scrollTo-adjacent suites exist (verified by repo-wide grep), all
  overwrite-compatible, and all five run green in Task 1 VALIDATE; the
  stub mirrors existing file-local precedents (request-v2 validation:64
  et al.).
