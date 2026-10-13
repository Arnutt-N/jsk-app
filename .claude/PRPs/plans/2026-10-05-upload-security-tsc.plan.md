# PRP Plan: Fix `upload-security.test.ts` Type Errors (tsc-only failure)

## Metadata

- Complexity: Trivial (1 file, 1 declaration line, type-only)
- Source PRD: `.claude/PRPs/prds/2026-10-05-upload-security-tsc.prd.md`
- Branch: `fix/upload-security-tests-20261005` (created, based on `main@cccb17b`)
- Working directory: shell commands run from `frontend/`; `git` commands
  from the repo root.
- Toolchain (verified): `typescript` via `npx tsc` (repo script: none —
  direct `npx` invocation, same as prior sessions), vitest `^2.1.9`.

## Summary

Test 1's `vi.fn(async () => …)` (line 14) infers a zero-arg mock, so
`mock.calls` types as `[]` → 4× TS2493 + 5× TS2339 downstream. Fix:
declare explicit fetch-signature params, mirroring test 2's line 51 in
the same file. One commit, then tsc + vitest + eslint + CI.

## UX Clarity

N/A — internal change (test-only type fix; no runtime or user-visible
behavior change). Before: 9 tsc errors in this file; after: `tsc --noEmit`
exit 0 repo-wide.

## Files to Change

| # | File | Lines touched | What |
|---|------|---------------|------|
| 1 | `frontend/app/admin/image-resize/__tests__/upload-security.test.ts` | 14 (mock declaration) | Add explicit `(input, init?)` param types |

## NOT Building

- No production-code edits; no other test files.
- No assertion, string-literal, mock-behavior, or flow changes.
- No tsconfig changes (no new excludes).
- No changes to build/lint configs (`npm run build` IS still a
  validation gate — see Validation Commands; nothing about the build
  itself changes).

## Step-by-Step Tasks

### Task 0 — Capture the pre-fix tsc baseline (evidence, no commit)

- ACTION: Record current `tsc` errors; proceed only if they are confined
  to this file (expected: exactly the 9 known errors here).
- IMPLEMENT (from `frontend/`):
  `npx tsc --noEmit > $env:TEMP\usec-baseline.log 2>&1`
  then confirm every `error TS` line cites
  `app/admin/image-resize/__tests__/upload-security.test.ts`.
  If errors appear in any OTHER file → STOP and report (out of scope;
  do not start Task 1 on a dirty baseline).
- MIRROR: baseline-first pattern per the flaky-timeouts plan Task 0
  (SOURCE: `.claude/PRPs/plans/2026-10-05-flaky-frontend-timeouts.plan.md`,
  Task 0).
- VALIDATE: log shows the 9 known errors (TS2493 ×4 on lines 25–26,
  TS2339 ×5 on lines 28/30/31/32/34), zero elsewhere.
- GOTCHA:
  - G0.1: `tsc` exit code is 1 on ANY error — read the log, don't judge
    by exit code alone.
- Commit: none (evidence task).

### Task 1 — Type the `native` mock (single unit, single commit)

- ACTION: Give test 1's fetch mock explicit parameters so
  `mock.calls[n]` types as `[RequestInfo | URL, RequestInit?]`.
- IMPLEMENT in
  `frontend/app/admin/image-resize/__tests__/upload-security.test.ts`,
  line 14 — replace exactly:
  `const native = vi.fn(async () => new Response('{}', { status: 200 }))`
  with:
  `const native = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => new Response('{}', { status: 200 }))`
  (`input`/`init` intentionally unused in the body — same as today;
  params exist only to type `mock.calls`. No other line changes.)
- MIRROR: test 2's mock in the same file (SOURCE:
  `frontend/app/admin/image-resize/__tests__/upload-security.test.ts:51`
  `const native = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {`).
  After the fix both declarations share the identical signature shape.
- VALIDATE (from `frontend/`):
  1. `npx tsc --noEmit` → exit 0, empty output (S1; previously 9 errors).
  2. `npx vitest run app/admin/image-resize/__tests__/upload-security.test.ts`
     → 2/2 passed (S2).
  3. `npx eslint app/admin/image-resize/__tests__/upload-security.test.ts`
     → exit 0 (S4).
  4. `npm run build` → green (S4; proves the type-only change keeps the
     production build green).
- GOTCHA:
  - G1.1: Do NOT touch lines 25–34 — they type-check once the mock is
    declared; editing them risks behavior drift.
  - G1.2: Unused `input`/`init` params can at most draw a
    `@typescript-eslint/no-unused-vars` WARNING — verified: the rule is
    `'warn'`-level in `eslint-config-next/typescript` (dist) with no
    repo override and no `argsIgnorePattern` default, so exit stays 0
    either way and step 3 cannot fail on this. (Note: line 51's mock
    uses both params, so it is a signature-shape precedent only, not
    an unused-args precedent.) No action needed; do NOT add
    underscore prefixes or `void` statements.
  - G1.3: `new Headers(uploadInit?.headers)` (line 31) stays valid:
    `init?: RequestInit` ⇒ `headers?: HeadersInit`, and
    `new Headers(undefined)` constructs empty — no edit needed.
- Commit: `test(image-resize): type fetch mock in upload-security test`.

### Task 2 — Final validation + push + PR

- ACTION: Prove S3–S4 and open the PR (CI green required).
- IMPLEMENT:
  1. From repo root, untouched proof (both halves of S3, PowerShell;
     triple-dot anchors at merge-base so the Task 1 commit doesn't void it):
     a. `git diff main...HEAD -U0 -- frontend/app/admin/image-resize/__tests__/upload-security.test.ts | Select-String -Pattern '^[+-].*expect\('`
        → must return NOTHING (zero added/removed `expect(` lines).
     b. `git diff main...HEAD --numstat -- frontend/app/admin/image-resize/__tests__/upload-security.test.ts`
        → must print exactly `1<TAB>1<TAB><path>` (one line replaced, i.e.
        line 14 only — no string-literal drift anywhere else).
  2. `git push -u origin fix/upload-security-tests-20261005`; open PR
     against `main` (repo template: Summary/Changes/Testing).
  3. `gh pr checks --watch` (no arg — defaults to the current branch's
     PR) until all required checks green (Backend Pytest, Frontend Lint
     and Build, Playwright Smoke, Source Encoding Scan).
- MIRROR: PR flow per `.agents/skills/git_workflow/SKILL.md` and prior
  PRs #242/#243 (squash merge only on explicit user approval — NOT in
  this task).
- VALIDATE: all four required checks green on the PR page.
- GOTCHA:
  - G2.1: Do NOT merge — merge needs a separate explicit user command.
  - G2.2: If CI shows the known-transient Turbopack font build failure
    or an unrelated flaky suite (both observed on PR #243 and proven
    independent of test-only diffs), rerun failed jobs ONCE and
    re-watch before concluding anything about this change.
- Commit: none (docs/process task).

Publish order: Task 0 (baseline, no commit) → Task 1 (one commit) →
Task 2 (push + PR, no commit).

## Validation Commands (existence verified)

| Purpose | Command |
|---|---|
| Type gate (from `frontend/`) | `npx tsc --noEmit` (repo has no `typecheck` script; direct `npx`, same as prior sessions) |
| Focused suite (from `frontend/`) | `npx vitest run app/admin/image-resize/__tests__/upload-security.test.ts` (vitest `^2.1.9`) |
| Lint (from `frontend/`) | `npx eslint app/admin/image-resize/__tests__/upload-security.test.ts` (flat config in repo) |
| Production build (from `frontend/`) | `npm run build` (= `next build`, package.json scripts; green today — run once at the end to prove the type-only change keeps it green) |
| Proof (from repo root) | anchored `git diff` + `Select-String` (see Task 2) |
| CI | `gh pr checks --watch` |

## Testing Strategy + Edge-Case Checklist

- No new tests (the file's 2 tests ARE the coverage); the change must
  not alter which lines execute.
- [ ] Test 1 asserts cookie transport: `credentials: include` on both
    calls, `X-CSRF-Token` header present, no `Content-Type` on the
    FormData post, body identity (`toBe(form)`), 2 calls total.
- [ ] Test 2 asserts routing: ticket route hit, resize route hit,
    generic media route never hit.
- [ ] `tsc` clean is the primary gate (the bug is type-only).

## Acceptance Criteria

- S1: `npx tsc --noEmit` → exit 0, empty output.
- S2: focused vitest file → 2/2 passed.
- S3: anchored diff shows zero added/removed `expect(` lines AND the
  numstat `1/1` single-line proof (full PRD S3 wording).
- S4: eslint clean; `npm run build` green locally; all four required CI
  checks green.

## Risks

- RISK-1 (negligible): unused-param lint on `input`/`init` can only warn
  (verified `'warn'`-level, exit stays 0) — no mitigation needed beyond
  the eslint validation step (see G1.2).
- RISK-2 (low): CI transient (font build / unrelated flake, both seen on
  PR #243). Mitigation: G2.2 — one rerun + re-watch; failures must be
  proven related before touching the change.
