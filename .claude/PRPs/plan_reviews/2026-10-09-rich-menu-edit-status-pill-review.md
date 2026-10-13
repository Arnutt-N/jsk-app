# Plan Review: rich-menu-edit-status-pill

**Plan**: design-plans/2026-10-09-rich-menu-edit-status-pill.md
**Reviewed**: 2026-10-09
**Source PRD**: none
**Verdict**: NOT READY
**Confidence Score**: 3/10 — single-pass implementation

## Reviewer Verdicts

| Reviewer | Diversity | Verdict | Critical issues |
|---|---|---|---|
| A | general-purpose | FAIL | 3 |
| B | general-purpose ("context isolation only") | FAIL | 2 |

## Rubric Results

| # | Criterion | A | B | Evidence |
|---|---|---|---|---|
| A1 | Context Completeness | FAIL | PASS | A: "Test file named without file:lines ... zero mentions of naming, error-handling, or logging patterns" / B: "cites edit/page.tsx:407-435, rich-menu.ts:75-106, page.tsx:211-215 and :218-227 ... test pattern 'editMenuFixture + routeFetch' verified ... dependency 'menuStatusPill from @/lib/rich-menu' listed" |
| A2 | Implementation Readiness | FAIL | FAIL | "not a PRP-format plan" — headings are Design decision/Reuse/Changes/Scope/Validation; no Metadata or Step-by-Step Tasks with ACTION/IMPLEMENT/MIRROR/VALIDATE |
| A3 | Pattern Faithfulness | PASS | PASS | A spot-checked 5 refs, B 4 refs, all live — e.g. verified rich-menu.ts:75 (menuStatusPill), :87-98 (SCHEDULED), :99-101 (MANUAL); verified page.tsx:211-215 (ONE-resolver comment), :218-227 (pillTone map); verified edit/page.tsx:411-434 (badge ternaries), :35-51 (interface fields) |
| A4 | Validation Coverage | FAIL | FAIL | Plan Validation lists only "npx vitest run app/admin/rich-menus" and "npm run lint"; no build command specified though "build": "next build" exists (verified frontend/package.json:7) |
| A5 | UX Clarity | PASS | PASS | Before: "a scheduled menu reads ตามเวลา on /admin/rich-menus but SYNCED on its own edit page"; After: "every status the list can show renders identically on the edit page" |
| A6 | No Prior Knowledge Test | PASS | PASS | Exact delete span 411-434, keep wrapper 406-407, verbatim-copy source page.tsx:218-227, import instruction, "menu &&" guard rationale, test assertions getByText('ตามเวลา')/getByText('ซ่อน') |
| B1 | Spec Coverage | SKIPPED | SKIPPED | Source PRD: none |
| B2 | Internal Consistency | PASS | PASS | Resolver signature '{ label, tone, title? }' matches verified rich-menu.ts:69-77; all listed interface fields verified present at edit/page.tsx:35-51; "Do NOT touch frontend/lib/rich-menu.ts" honored |
| B3 | Technical Soundness | PASS | PASS | Single-resolver consolidation matches the codebase's documented decision (verified page.tsx:211-215); all imports verified real at edit/page.tsx:13; nothing invented |
| B4 | Scope Discipline | PASS | PASS | Explicit Exclude list (header, save buttons, action bar, English titles, backend); changes touch only badge block + test |
| B5 | Risk Coverage | PASS | PASS | Three stop conditions each with mitigation/escalation (signature drift → re-resolve; missing fields → scope widened; dot preference → new decision) |
| B6 | Testability | PASS | PASS | SCHEDULED → getByText('ตามเวลา'), MANUAL → getByText('ซ่อน'), รอซิงค์ regression, 5-case edge checklist (a)-(e) with tooltip |

## 🔴 Critical (must fix before implementing)
- A2 — Plan is not in PRP format (improve-ui design-plan template; no ACTION/IMPLEMENT/MIRROR/VALIDATE task blocks); evidence: section headings quoted above.
- A4 — No build command in Validation/Repository gate (only vitest + lint); evidence: "Plan Validation lists only 'npx vitest run app/admin/rich-menus' and 'npm run lint' (plan line 48)".

## 🟡 Important (should fix)
- A1 (reviewer A only — see disagreement) — Test file cited without file:lines; no naming/error-handling/logging pattern examples; test pattern named but not quoted.

## 🟢 Minor / Suggestions
- Correct/note the state count: plan says "7 states" but the resolver has 8 outcomes (ACTIVE, SYNC FAILED, รอซิงค์, ตามเวลา, หมดเวลา, ซ่อน, SYNCED, DRAFT per rich-menu.ts:78-105).
- Add "npm run build" to the Repository validation step (closes A4).
- Add file:lines for the test file plus a short fixture-code example (closes A1).
- Paste the 8-entry pillTone map inline or confirm tone-key parity mechanically so a stale copy is caught if the list page drifts.
- State explicitly that no new naming/error-handling/logging conventions apply (presentation-only change).

## Reviewer Disagreements
- A1: A FAIL (missing test-file lines + pattern examples) vs B PASS (spans + named fixtures + listed dependency suffice). Both sides verified against the repo; the split is strictness of the "real examples" conjunction, not factual.

## Recommended Next Step
re-plan — per Phase 4 (score 3 < 6). Concretely: transpose into PRP Metadata/Tasks format if /prp-implement execution is required (closes A2), add the build gate (closes A4), then re-run this skill.

Score: 10 − 2×3 (A1,A2,A4) − 1×0 − 1×1 (🟡 A1) = 3; NOT READY caps at 7 (not binding).
