# Enterprise Audit — Frontend Gates

Branch: `feat/enterprise-audit-sweep` (verified via `git branch --show-current`, no branch switch performed).
Working dir for all gates: `D:\genAI\jsk-app\frontend`.
Mode: read-only investigation. No code edited. Only this file written.

throughput checkpoint: n/a, read-only investigation.

## Commands run

(Ordered; each with long bash timeout ~1500s.)

- [x] Gate 1: `npm run lint` — FAIL (exit 1; 185 errors, 2839 warnings)
- [x] Gate 2: `npx tsc --noEmit` — PASS (exit 0, zero errors)
- [x] Gate 3: `npm run test:unit` — PASS (91 files / 785 tests, all passed)
- [x] Gate 4: `npm run build` — PASS (exit 0, 50/50 pages)

## Gate 1 — `npm run lint`

_STATUS: FAIL (exit code 1). Ran from `D:\genAI\jsk-app\frontend` via `cd frontend && npm run lint`._

(Note: a first attempt from the repo root failed with `ENOENT ... open 'D:\genAI\jsk-app\package.json'` exit 127 — wrong directory, not a gate result. Re-ran from `frontend/`.)

Summary line (verbatim):

```text
✖ 3024 problems (185 errors, 2839 warnings)
```

Exact tail (last 15 lines of output, verbatim):

```text
  5:2568   warning  Expected an assignment or function call and instead saw an expression  @typescript-eslint/no-unused-expressions
  5:3136   warning  Expected an assignment or function call and instead saw an expression  @typescript-eslint/no-unused-expressions
  5:3180   warning  Expected an assignment or function call and instead saw an expression  @typescript-eslint/no-unused-expressions
  5:3510   warning  Expected an assignment or function call and instead saw an expression  @typescript-eslint/no-unused-expressions
  5:3687   warning  Expected an assignment or function call and instead saw an expression  @typescript-eslint/no-unused-expressions
  5:4008   warning  Expected an assignment or function call and instead saw an expression  @typescript-eslint/no-unused-expressions
  5:4115   warning  Expected an assignment or function call and instead saw an expression  @typescript-eslint/no-unused-expressions
  5:4212   warning  Expected an assignment or function call and instead saw an expression  @typescript-eslint/no-unused-expressions
  5:5516   warning  Expected an assignment or function call and instead saw an expression  @typescript-eslint/no-unused-expressions
  5:7691   warning  Expected an assignment or function call and instead saw an expression  @typescript-eslint/no-unused-expressions
  6:79     warning  Expected an assignment or function call and instead saw an expression  @typescript-eslint/no-unused-expressions

✖ 3024 problems (185 errors, 2839 warnings)
```

Error attribution (measured, not inferred): all 185 `error` lines sit under `frontend/playwright-report-2client/trace/*` (generated Playwright trace bundles: `no-this-alias`, `no-unused-expressions`, `rules-of-hooks` on minified `_e` functions). Zero `error` lines in first-party source. First-party files report warnings only (verbatim, complete list):

```text
app\admin\chat-histories\[lineUserId]\page.tsx — 179:8 warning react-hooks/exhaustive-deps (unnecessary dep 'lineUserId')
app\admin\files\page.tsx — 538:29, 832:19 warning @next/next/no-img-element
app\admin\friends\history\page.tsx — 151:8 warning react-hooks/exhaustive-deps (unnecessary dep 'perPage')
app\admin\image-resize\__tests__\upload-security.test.ts — 14:31, 14:57 warning no-unused-vars ('input', 'init')
app\admin\rich-menus\page.tsx — 64:8 warning react-hooks/exhaustive-deps (missing dep 'toast')
app\admin\settings\custom\page.tsx — 83:8 warning react-hooks/exhaustive-deps (missing dep 'toast')
app\admin\settings\line\page.tsx — 73:8 warning react-hooks/exhaustive-deps (missing dep 'toast')
components\admin\CommandPalette.tsx — 244:6 warning react-hooks/exhaustive-deps (unnecessary dep 'logout')
contexts\AuthContext.tsx — 195:31 warning no-unused-vars ('_csrf' assigned, never used)
```

Likely fix direction (not applied — read-only lane): exclude generated `playwright-report-2client/` from `eslint` (flat-config `ignores`) so the gate measures source only.

## Gate 2 — `npx tsc --noEmit`

_STATUS: PASS (exit code 0, no output — zero errors)._ Raw output was empty; `EXIT_CODE=0`.

Known `upload-security.test.ts` breakage: NOT REPRODUCED. There is no error text to quote because `tsc` emits nothing. The file IS covered by type-checking (`tsconfig.json` `include` has `**/*.ts`, `exclude` is only `node_modules`), and `git log` shows the fix already landed: `ceed1ff test(image-resize): type fetch mock in upload-security test (#244)`. So the previously known breakage is fixed on this branch.

## Gate 3 — `npm run test:unit`

_STATUS: PASS (exit code 0). Ran from `D:\genAI\jsk-app\frontend`._

Exact tail (last 20 lines, ANSI stripped, verbatim content):

```text
✓ app/admin/live-chat/_components/__tests__/TransferDialog.a11y.test.tsx (3 tests) 529ms
  ✓ TransferDialog a11y > exposes role="dialog" on the panel (not the backdrop) with modal semantics 449ms
✓ lib/__tests__/mask.test.ts (12 tests) 21ms
✓ lib/__tests__/download-blob.test.ts (1 test) 35ms
✓ app/liff/request-v2/__tests__/phone-input.test.tsx (2 tests) 530ms
  ✓ LIFF request-v2 phone input (R3-M29) > strips non-digits and shows the digits placeholder 377ms
✓ lib/__tests__/csrfStore.test.ts (6 tests) 16ms
✓ app/admin/live-chat/_components/__tests__/MobileDrawer.test.tsx (4 tests) 506ms
  ✓ MobileDrawer > renders dialog semantics 435ms
✓ lib/constants/__tests__/live-chat-avatar.test.ts (4 tests) 16ms
✓ lib/__tests__/chatbot-readiness.test.ts (4 tests) 13ms
✓ components/ui/__tests__/button.test.tsx (2 tests) 365ms
  ✓ default renders primary variant 325ms

 Test Files  91 passed (91)
      Tests  785 passed (785)
   Start at  18:26:15
   Duration  430.37s (transform 11.47s, setup 168.34s, collect 368.72s, tests 163.64s, environment 448.57s, prepare 52.44s)
```

Counts: 91 test files passed, 0 failed; 785 tests passed, 0 failed. No failing suites. (stderr noise about expected error-path logging — `Cookie auth bootstrap fetch error`, `[logger] Submit Error`, `act(...)` warnings — is intentional negative-path coverage; every suite still reports ✓.)

## Gate 4 — `npm run build`

_STATUS: PASS (exit code 0). Ran from `D:\genAI\jsk-app\frontend`._

Key lines (verbatim):

```text
✓ Compiled successfully in 102s
  Running TypeScript ...
✓ Generating static pages using 3 workers (50/50) in 7.6s
```

Full route table emitted (50 routes: static ○ + dynamic ƒ for `[id]`/`[lineUserId]` params); no failing step, no error output. Production build succeeds end to end: compile → type-check → collect page data → generate static pages → finalize.

## Pass/fail table

| Gate | Command | Result |
|------|---------|--------|
| 1 | `npm run lint` | FAIL — exit 1, 185 errors / 2839 warnings (all 185 errors in generated `playwright-report-2client/` bundles; 0 errors in source) |
| 2 | `npx tsc --noEmit` | PASS — exit 0, zero errors (known `upload-security.test.ts` breakage already fixed by `ceed1ff` #244) |
| 3 | `npm run test:unit` | PASS — exit 0, 91/91 files, 785/785 tests |
| 4 | `npm run build` | PASS — exit 0, compiled in 102s, 50/50 static pages |

## One-line verdicts per gate

- Gate 1 (lint): FAIL — gate exits 1, but every error is in generated Playwright trace bundles, so source itself is error-free; excluding `playwright-report-2client/` from eslint would turn this green.
- Gate 2 (tsc): PASS — clean type-check, no errors anywhere including the previously broken test file.
- Gate 3 (unit): PASS — full suite green, 785 of 785, no failing suites.
- Gate 4 (build): PASS — production build completes with all 50 routes.
