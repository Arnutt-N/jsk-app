# Plan Review R2: followup-d1d4

**Plan**: `.claude/PRPs/plans/2026-10-04-followup-d1d4.plan.md` (rev. 2, after r1)
**Reviewed**: 2026-10-04
**Source PRD**: `.claude/PRPs/prds/2026-10-04-followup-d1d4.prd.md`
**Verdict**: NOT READY
**Confidence Score**: 1/10 — single-pass implementation

> Round-1 design failure (D3 SDK crash) is FIXED and verified sound by both reviewers
> (B3 PASS/PASS). Remaining failures are small enumerated contradictions/gaps with
> reviewer-supplied one-line fixes — the mechanical score overstates them (see note).

## Reviewer Verdicts

| Reviewer | Diversity | Verdict | Critical issues |
|---|---|---|---|
| A | general-purpose | FAIL | 3 |
| B | general-purpose ("context isolation only") | FAIL | 1 |

## Rubric Results

| # | Criterion | A | B | Evidence |
|---|---|---|---|---|
| A1 | Context Completeness | PASS | PASS | Conventions block + 11-file table + deps all verified live |
| A2 | Implementation Readiness | FAIL | PASS | A: CSAT call-site `outbox=box` missing at `handle_postback_event` elif |
| A3 | Pattern Faithfulness | PASS | PASS | 8–12+ refs spot-checked live by each; all accurate |
| A4 | Validation Coverage | PASS | PASS | Build command added; all map to real tooling |
| A5 | UX Clarity | PASS | PASS | Before/after or explicit N/A per task |
| A6 | No Prior Knowledge Test | FAIL | PASS | A: CSAT wiring must be inferred; `useCustomerNotes` mock shape unspecified |
| B1 | Spec Coverage | PASS | PASS | Phone strip + absence assertion now match PRD |
| B2 | Internal Consistency | FAIL | FAIL | Task 3 header "Test: #8 (new)" vs Files "(EXISTS — append)" + omits #11; helper `: string` vs null-unchanged test; acceptance raw-keys claim without step |
| B3 | Technical Soundness | PASS | PASS | Raw-httpx D3 verified sound (pinned host/path/auth, valid httpx API, SDK crash rejected with proof) |
| B4 | Scope Discipline | PASS | PASS | NOT Building mirrors PRD; no overreach |
| B5 | Risk Coverage | PASS | PASS | D3 risk correctly rewritten; GOTCHAs per task |
| B6 | Testability | PASS | PASS | Input/expected pairs + edge checklist |

## 🔴 Critical (must fix before implementing)

- D2 CSAT call-site wiring omitted: IMPLEMENT passes `outbox=box` only to
  `handle_check_status`; `handle_csat_response` called bare would drain its own box
  pre-commit — the ghost survives a literal implementation. Fix: add `outbox=box` at
  the `elif data.startswith("csat|")` call site. — Task 1.
- Task 3 header "Test: #8 (new)" contradicts Files table "#8 (EXISTS — append)" and
  omits #11. Fix: "Test: #8 (extend), #11 (new)". — Task 3 header.
- `maskLineUserIdForRole` typed `: string` but matrix test requires null ids →
  "unchanged" (null) — tsc failure. Fix: null-guard first
  (`if (!id) return maskLineUserId(id)`), keeping `: string`. — Task 3.

## 🟡 Important (should fix)

- `useCustomerNotes` mock return shape unspecified → pin `{ notes, setNotes, saved }`
  (verified `useCustomerNotes.ts:113`).
- Validation Commands vitest summary line: wrong `frontend/` prefix + `<live-chat
  component test>` placeholder → copy the exact runnable command from Task 3 Step 2.
- Files #7 "(audit first)" vs Step 1 "audit COMPLETE" → one wording wins (COMPLETE).
- Acceptance D1 "actions use raw keys (test)" has no implementing step → add assertion
  to the component test (callback receives raw key) or drop "(test)".
- D4 province/district: clarify request-v2 validates `formData` Thai-name fields
  (no `selected*Id` state exists there — aggregator-verified; twin pattern adapted).

## 🟢 Minor / Suggestions

- Edge checklist "ApiException mid-download" is stale → "httpx.ConnectError mid-download".
- "Backstop for the preview path" mislabels the post-hoc branch (it guards full path; preview has its own `:384` check).
- "15 routes" is wrong → 13 routes take `{line_user_id}` (aggregator-recounted; fix plan E13 + PRD decision 1).
- Mirror `CustomerPanel.export.test.tsx:6-23` mock block for the D1 component test;
  place the new test in existing `_components/__tests__/` per convention.

## Reviewer Disagreements

- A2/A6: A FAIL (CSAT wiring + mock shape) vs B PASS. A's reading is correct — fixed as Critical/Important above.
- B2 details: both FAIL; A adds the helper-type contradiction, B adds the acceptance-claim gap. Both fixed.

## Recommended Next Step

revise and re-validate (final round; all fixes enumerated verbatim) — do NOT implement yet.

## Score note

Mechanical union score floors at 1/10 (2 failed A + 1 failed B + 5 Important), same
numeral as r1, but qualitatively r2 resolved the only design-level failure (D3) and
left only small contradictions. The band label misfires; the correct action is the
enumerated revision above, not a foundation re-plan.
