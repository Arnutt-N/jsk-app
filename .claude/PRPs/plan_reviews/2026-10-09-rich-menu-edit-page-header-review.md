# Plan Review: rich-menu-edit-page-header

**Plan**: design-plans/2026-10-09-rich-menu-edit-page-header.md
**Reviewed**: 2026-10-09
**Source PRD**: none
**Verdict**: NOT READY
**Confidence Score**: 1/10 — single-pass implementation

## Reviewer Verdicts

| Reviewer | Diversity | Verdict | Critical issues |
|---|---|---|---|
| A | general-purpose | FAIL | 5 |
| B | general-purpose ("context isolation only") | FAIL | 4 |

## Rubric Results

| # | Criterion | A | B | Evidence |
|---|---|---|---|---|
| A1 | Context Completeness | FAIL | FAIL | Test guidance is only "Follow existing fixture patterns; do not restructure the file" with no quoted example, though the suite has concrete helpers (verified edit/__tests__/page.test.tsx:35-93 editMenuFixture/routeFetch/renderPage); no naming/error-handling/logging/test pattern examples anywhere |
| A2 | Implementation Readiness | FAIL | FAIL | "not a PRP-format plan" — no Metadata or Step-by-Step Tasks with ACTION/IMPLEMENT/MIRROR/VALIDATE |
| A3 | Pattern Faithfulness | PASS | PASS | A spot-checked 4 refs, B 5 refs, all live — e.g. verified edit/page.tsx:368-379 (boxed header), PageHeader.tsx:13-42 (props/slots), new/page.tsx:439-446 (exemplar back-Link verbatim), new/page.tsx:5,7 + list page.tsx:7 (imports) |
| A4 | Validation Coverage | FAIL | FAIL | Only "npx vitest run app/admin/rich-menus" and "npm run lint" specified; existing "build": "next build" (verified frontend/package.json:7) never invoked |
| A5 | UX Clarity | PASS | PASS | Before: white boxed card with raw "← กลับ" link; After: shared PageHeader mirroring the new page's back-navigation header; Verify: "no white card remains above the form" |
| A6 | No Prior Knowledge Test | FAIL | FAIL | Test step forces discovery: "Update only assertions that target the removed markup (if asserted — grep first)" + "Follow existing fixture patterns" with no quoted fixture/assertion code |
| B1 | Spec Coverage | SKIPPED | SKIPPED | Source PRD: none |
| B2 | Internal Consistency | PASS | PASS | Title/subtitle/destination identical at plan L16/L31; mb-8 matches verified new/page.tsx:439; '../../../components/PageHeader' depth correct; scope matches change list |
| B3 | Technical Soundness | PASS | PASS | PageHeader props verified (PageHeader.tsx:6-11); ArrowLeft/lucide-react verified (new/page.tsx:5, package.json:29); back-Link classes match new/page.tsx:442-444; nothing invented |
| B4 | Scope Discipline | PASS | PASS | Explicit Exclude (form-card styling, body max-width convergence, badge, save buttons, backend); changes confined to header block + test |
| B5 | Risk Coverage | PASS | PASS | Three stop conditions with mitigation/escalation (props drift → re-resolve; extra actions → new decision; load-bearing assertions → report, don't delete) |
| B6 | Testability | FAIL | PASS | A: assertion described only ("Add/keep one assertion ... query by aria-label") with no literal expect(input).toBe(expected) code; edge cases as prose, not a checklist / B: target + query + expected href plus desktop/mobile widths and 60+ char truncation check suffice |

## 🔴 Critical (must fix before implementing)
- A2 — Plan is not in PRP format (improve-ui design-plan template; no ACTION/IMPLEMENT/MIRROR/VALIDATE task blocks).
- A4 — No build command in Validation/Repository gate (only vitest + lint).

## 🟡 Important (should fix)
- A1 (both reviewers) — Test-file fixture patterns referenced by name only; quote editMenuFixture/renderPage helpers (page.test.tsx:35-93) as the pattern example.
- A6 (both reviewers) — Test task forces grep/search; pre-resolve the grep (state exactly which current assertions, if any, reference the old header markup) and give the exact new assertion code.
- B6 (reviewer A only — see disagreement) — No literal assertion code and no checkbox-style edge-case checklist.

## 🟢 Minor / Suggestions
- Add "npm run build" to the Repository validation gate (closes A4).
- Reformat edge cases (mobile stacking, 60+ char Thai truncation, missing-menu subtitle) as a checkbox checklist.

## Reviewer Disagreements
- B6: A FAIL (no literal expect() code, prose-not-checklist edges) vs B PASS (target + query + href + concrete width/truncation criteria suffice). Both verified the same plan lines; split is strictness of "input/expected pairs".

## Recommended Next Step
re-plan — per Phase 4 (score 1 < 6). Concretely: transpose into PRP Metadata/Tasks format if /prp-implement execution is required (closes A2), add the build gate (A4), pre-resolve the test grep with literal assertions (A6/B6), then re-run this skill.

Score: 10 − 2×4 (A1,A2,A4,A6) − 1×1 (B6) − 1×3 (🟡 A1,A6,B6) = −2 → floored at 1; NOT READY caps at 7 (not binding).
