# PRD: Fix `upload-security.test.ts` Type Errors (tsc-only failure)

Date: 2026-10-05 · Branch: `fix/upload-security-tests-20261005` · Owner: Muse Code
Skills invoked: `bundled:plan`, `debugging-and-error-recovery` (baseline);
skill map: `.claude/docs/skill-collections-20260712.md`.

## 1. Background

`npx tsc --noEmit` (whole-project; `frontend/tsconfig.json` includes
`**/*.ts(x)`, excludes only `node_modules`, `strict: true`) fails ONLY in
`frontend/app/admin/image-resize/__tests__/upload-security.test.ts` with 9
errors. The file passes at runtime (vitest green locally and on CI) and
`next build` passes (Next type-checks only the build graph, not
`__tests__`) — so this is a pure type-level failure, but it keeps the
repo-wide `tsc` gate red.

## 2. Problem statement (single root cause, verified)

Line 14 declares the fetch mock without parameters:

```ts
const native = vi.fn(async () => new Response('{}', { status: 200 }))
```

Vitest infers a zero-argument mock, so `native.mock.calls` is typed `[]`.
Destructuring `calls[0]`/`calls[1]` (lines 25–26) then raises TS2493
(tuple length 0) ×4, and every downstream property access collapses to
`never` → TS2339 ×5 (lines 28, 30, 31, 32, 34). Full error list captured
2026-10-05 via `npx tsc --noEmit` filtered to this file.

Notably, test 2 in the SAME file (line 51) already types its mock
correctly — `(input: RequestInfo | URL, init?: RequestInit)` — and
produces zero errors. The fix mirrors it.

## 3. Goals

- G1: `npx tsc --noEmit` fully clean (zero errors repo-wide).
- G2: Both tests keep passing with byte-identical assertions and runtime
  behavior (type-only change).
- G3: No production-code edits; no changes to any other file.

## 4. Non-goals

- Any runtime behavior change to the tests or the code under test.
- `next build` / lint changes (both already green).
- Other suites, E2E, or the `upload-security` feature itself.

## 5. Scope (files)

| # | File | Change |
|---|------|--------|
| 1 | `frontend/app/admin/image-resize/__tests__/upload-security.test.ts` | Type `native` mock params (line 14) |

## 6. Requirements

- R1: Test 1's `native` mock must declare explicit fetch-signature
  parameters, mirroring test 2's line 51, so `mock.calls[n]`
  destructures to `[RequestInfo | URL, RequestInit | undefined]`.
- R2: No `expect`, assertion value, mock runtime behavior, or test flow
  may change — the edit is parameter annotations only (plus keeping the
  same response body).
- R3: Whole-project `npx tsc --noEmit` must exit 0 with empty output.
- R4: The file's vitest suite must stay green; `eslint` clean on the file;
  CI green on the PR.

## 7. Rejected alternatives

- **`vi.fn<typeof fetch>(…)` generic instead of inline params:** equivalent
  typing but diverges from the in-file precedent (line 51); inline params
  keep both mocks visually identical.
- **Casting `calls` (`as [string, RequestInit][]`):** hides the type hole
  instead of declaring the true signature; leaks `any`-ish looseness.
- **Excluding `__tests__` from tsconfig:** makes the gate green by
  shrinking coverage — the opposite of the goal (G1 wants the suite
  type-safe).

## 8. Success criteria (measurable)

- S1: `npx tsc --noEmit` → exit 0, no output.
- S2: `npx vitest run app/admin/image-resize/__tests__/upload-security.test.ts`
  → 2/2 passed.
- S3: `git diff -U0` on the file shows zero added/removed `expect(` lines
  and zero changed string literals outside the mock declaration line.
- S4: `npx eslint` clean on the file; CI green on the PR.
