# Plan Review R3: followup-d1d4

**Plan**: `.claude/PRPs/plans/2026-10-04-followup-d1d4.plan.md` (rev. 3, after r2)
**Reviewed**: 2026-10-04
**Source PRD**: `.claude/PRPs/prds/2026-10-04-followup-d1d4.prd.md`
**Verdict**: NOT READY
**Confidence Score**: 1/10 — single-pass implementation

> Convergence check: r1 failed on a broken D3 design (fixed, B3 sound since r2);
> r2 failed on contradictions (all fixed, both reviewers PASS B2-adjacent items they
> re-checked); r3 fails on 2 recipe bugs + 1 false verified claim + 1 doc gap, each
> with a reviewer-supplied exact fix. The numeral floors again on union-counting —
> see r2 score note. This is the last auto-loop: fixes below are applied and re-gated
> once (r4); any r4 failure escalates to the human instead of looping.

## Reviewer Verdicts

| Reviewer | Diversity | Verdict | Critical issues |
|---|---|---|---|
| A | general-purpose | FAIL | 1 (B3 only; all else PASS) |
| B | general-purpose ("context isolation only") | FAIL | 4 |

## Rubric Results

| # | Criterion | A | B | Evidence |
|---|---|---|---|---|
| A1 | Context Completeness | PASS | PASS | Conventions + 11 files + deps verified |
| A2 | Implementation Readiness | PASS | PASS | ACTION/IMPLEMENT/MIRROR/VALIDATE + pinned paths throughout |
| A3 | Pattern Faithfulness | PASS | FAIL | B: "request-v2 has NO selected*Id state (verified)" is FALSE — `page.tsx:76-77` declares them (aggregator-confirmed by direct read) |
| A4 | Validation Coverage | PASS | PASS | All commands map to real tooling incl. build |
| A5 | UX Clarity | PASS | PASS | Before/after or N/A per task |
| A6 | No Prior Knowledge Test | PASS | FAIL | B: MockTransport lambda recurses; +66 normalization has no IMPLEMENT step |
| B1 | Spec Coverage | PASS | PASS | All PRD reqs mapped incl. phone strip |
| B2 | Internal Consistency | PASS | FAIL | B: tests/manual demand +66 normalization no IMPLEMENT step builds |
| B3 | Technical Soundness | FAIL | FAIL | onClose raw-key assertion vs `onClose: () => void` invoked bare (`CustomerPanel.tsx:21,88` — aggregator-confirmed); MockTransport lambda self-recursion |
| B4 | Scope Discipline | PASS | PASS | NOT Building holds |
| B5 | Risk Coverage | PASS | PASS | Risks + GOTCHAs adequate |
| B6 | Testability | PASS | PASS | Input/expected pairs + edge checklist |

## 🔴 Critical (must fix before implementing)

- D1 component test asserts `onClose` receives the raw key, but `onClose: () => void`
  (`CustomerPanel.tsx:21`) is invoked bare (`onClick={onClose}`, `:88`). Fix: assert
  `useCustomerNotes` called with the raw id (`:27`) and/or CSV click → fetch URL
  contains the raw id (`:197-201`, mirror export-test fetchMock). — Task 3.
- D3 MockTransport recipe recurses: `line_service.httpx` IS the global httpx module,
  so the patching lambda calls itself. Fix: capture first —
  `real = httpx.AsyncClient; lambda **kw: real(transport=mock, **kw)`. — Task 4.
- False "(verified)" claim: request-v2 HAS `selectedProvinceId/selectedDistrictId`
  (`page.tsx:76-77`, wired `:107-118`). Fix: D4 mirrors the twin's selected-Id
  checks; `sub_district` stays `formData`-direct like the twin. — Task 2.
- D4 "+668 normalizes then submits" has no IMPLEMENT step. Fix: state normalization
  rides existing F12 `handleChange` (`request-v2/page.tsx:100-102`); `validateForm`
  sees normalized state. — Task 2.

## 🟡 Important (should fix)

- D2 CSAT test patch targets unpinned → `postback_handler.get_line_service`,
  `app.services.csat_service.csat_service`, `app.services.user_identity_service.resolve_by_line_id`.
- PRD Testing Decisions D3 still says "mock at the blob_api level" → MockTransport.
- D4 test mirror omits `next/script` mock (request-v2 imports Script `:5`) → mirror
  `phone-input.test.tsx:1-44` mocks (which include it) + add submitServiceRequest mock.
- E7 gate anchor `:267` is the def line → `:267-269` (gate statement).

## 🟢 Minor / Suggestions

- Evidence numbering: E17 listed before E16 — reorder.

## Reviewer Disagreements

- A3/A6/B2: A PASS vs B FAIL. B's evidence is concrete and aggregator-verified
  (direct reads above); A's PASS missed these. Fixed per B.

## Recommended Next Step

revise (apply the 4 Critical + 4 Important + 1 Minor above — all specified verbatim)
and re-validate once (r4, final). Any r4 failure escalates to the human with the
failing items, per the 3-fix-loop cap.
