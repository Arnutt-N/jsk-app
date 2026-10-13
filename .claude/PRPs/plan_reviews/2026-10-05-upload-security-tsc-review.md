# Plan Review: upload-security-tsc (round 1)

**Plan**: `.claude/PRPs/plans/2026-10-05-upload-security-tsc.plan.md`
**Reviewed**: 2026-10-05
**Source PRD**: `.claude/PRPs/prds/2026-10-05-upload-security-tsc.prd.md`
**Verdict**: NOT READY
**Confidence Score**: 6/10 — single-pass implementation

Union semantics: failed Group A = 1 (A4) → −2; failed Group B = 0;
🟡 = 2 → −2. Band 6–7 → REVISE.

## Reviewer Verdicts

| Reviewer | Diversity | Verdict | Critical issues |
|---|---|---|---|
| A | general-purpose | PASS | 0 |
| B | general-purpose ("context isolation only") | FAIL | 4 (filed; 1 adjudicated 🔴, 2 🟡, 1 🟢 — see below) |

Note: B's first dispatch failed at the infra layer (no verdict
returned); re-dispatched once per failure handling. The retry's verdict
above is the one counted.

## Rubric Results

| # | Criterion | A | B | Evidence |
|---|---|---|---|---|
| A1 | Context Completeness | PASS | PASS | 1-file table + verbatim line-14/51 strings; deps match package.json |
| A2 | Implementation Readiness | PASS | PASS | Both tasks carry ACTION/IMPLEMENT/MIRROR/VALIDATE + exact strings |
| A3 | Pattern Faithfulness | PASS | PASS | Line-14/51 strings byte-verified; 5+ SOURCE refs spot-checked live |
| A4 | Validation Coverage | PASS | FAIL | No build command row; NOT Building disclaims `next build` while package.json defines it and CI runs it |
| A5 | UX Clarity | PASS | PASS | Literal "N/A — internal change" + before/after states |
| A6 | No Prior Knowledge | PASS | PASS | Exact strings, cwds, commands inline |
| B1 | Spec Coverage | PASS | PASS | R1–R4 all mapped to tasks |
| B2 | Internal Consistency | PASS | PASS | Line-14/51 strings, counts (4×TS2493+5×TS2339=9), branch all verified |
| B3 | Technical Soundness | PASS | PASS | Root cause empirically confirmed (A ran tsc: exactly 9 errors, all here); tsconfig covers the file; real APIs only |
| B4 | Scope Discipline | PASS | PASS | Explicit NOT Building; push+PR required by R4, not creep |
| B5 | Risk Coverage | PASS | PASS | RISK-1/RISK-2 + GOTCHAs proportionate to a 1-line change |
| B6 | Testability | PASS | PASS | Per-test assertion checklist + tsc primary gate |

## 🔴 Critical (must fix before implementing)

- A4: no build command specified — Validation Commands table has
  tsc/vitest/eslint/diff/gh rows and zero build rows, while
  `package.json` defines `"build": "next build"` and CI runs a
  "Run frontend build" step (B; A counted CI as coverage → split,
  finding stands). Fix: add an `npm run build` validation row (cheap,
  green today) rather than disclaiming it.

## 🟡 Important (should fix)

- S3 half dropped: PRD S3 requires "zero added/removed `expect(` lines
  AND zero changed string literals outside the mock declaration line"
  but plan S3 + Task 2 proof grep only `expect\(` (B). Fix: extend the
  proof (e.g. assert the diff touches only line 14).
- No pre-fix baseline tsc step: "previously 9 errors" and "fails ONLY
  in this file" are asserted without a capture step, so unrelated
  pre-existing errors elsewhere would fail S1 with no guidance (B).
  Fix: add a baseline command + "proceed only if errors are confined
  to this file" gate (A empirically confirmed 9-in-this-file today,
  so the baseline is expected green-elsewhere).

## 🟢 Minor / Suggestions

- RISK-1/G1.2 justification is wrong though harmless (B's 4th
  critical, downgraded by the gate): line 51 DOES use both params
  (file lines 52, 57), so the precedent proves nothing about unused
  params, and the underscore fallback assumes an `argsIgnorePattern`
  the repo never sets (verified: repo config has none; dist default
  has none). Downgraded because the gate verified the rule
  `@typescript-eslint/no-unused-vars` is `'warn'`-level in
  `eslint-config-next/typescript` (dist) with repo overrides absent —
  worst case is a warning, exit stays 0, S4 unaffected either way.
  Fix: restate G1.2/RISK-1 with this verified fact and drop the
  underscore fallback (or keep as optional hygiene).
- (A) Same S3 string-literal point as above; resolve `<n>` in
  `gh pr checks <n> --watch` via the no-arg form (defaults to current
  branch's PR).

## Reviewer Disagreements

- A4: A PASS (CI's "Frontend Lint and Build" covers build) vs B FAIL
  (no build command specified as a plan step). B correct per the
  rubric's letter ("specified AND exist") — the plan must name the
  command; fix by adding the row.

## Recommended Next Step

revise and re-validate — 1 🔴 + 2 🟡, all narrow doc fixes on a
unanimously sound one-line approach (11/12 criteria pass on both
sides). Apply the fixes, then re-run prp-validate-plan.
