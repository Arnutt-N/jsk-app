# Plan Review: flaky-frontend-timeouts (round 1)

**Plan**: `.claude/PRPs/plans/2026-10-05-flaky-frontend-timeouts.plan.md`
**Reviewed**: 2026-10-05
**Source PRD**: `.claude/PRPs/prds/2026-10-05-flaky-frontend-timeouts.prd.md`
**Verdict**: NOT READY
**Confidence Score**: 1/10 — single-pass implementation

## Reviewer Verdicts

| Reviewer | Diversity | Verdict | Critical issues |
|---|---|---|---|
| A | general-purpose | FAIL | 5 |
| B | general-purpose ("context isolation only" — no per-dispatch model choice on this platform) | FAIL | 5 |

## Rubric Results

| # | Criterion | A | B | Evidence |
|---|---|---|---|---|
| A1 | Context Completeness | FAIL | FAIL | "Convert every `user.type(placeholder, value)` … plus 11 inline sites" — zero file:line refs, zero pattern examples, no dependency list |
| A2 | Implementation Readiness | FAIL | FAIL | Units use File/Validate/Commit bullets; tokens ACTION/IMPLEMENT/MIRROR/VALIDATE appear zero times — "not a PRP-format plan" |
| A3 | Pattern Faithfulness | PASS | FAIL | A: 8/8 prose refs verified live. B: snippets (`fireEvent.change(el, …)`, `vi.setConfig`) carry no SOURCE refs; `el` undefined; `vi.setConfig` has zero repo precedent |
| A4 | Validation Coverage | FAIL | FAIL | Only `npx vitest run` + `npx eslint` specified; `next build` exists in package.json but no build gate in plan |
| A5 | UX Clarity | FAIL | PASS | A: literal "N/A — internal change" marker absent. B: before states + after thresholds (<12s/<24s) documented |
| A6 | No Prior Knowledge | FAIL | FAIL | No line numbers, no complete replacement snippet, no cwd (`cd frontend`), no baseline-capture procedure |
| B1 | Spec Coverage | PASS | PASS | R1/R2/R3→Unit 2, R4→Unit 3, R5→Unit 1, R6→Validation Plan |
| B2 | Internal Consistency | PASS | FAIL | B (gate-verified): "11 inline sites" vs 26 real `user.type(` calls — literal implementation leaves sites unconverted. Counts/margin math check out |
| B3 | Technical Soundness | PASS | FAIL | B (gate-verified): "v14 default delay is already null" is FALSE — installed user-event 14.6.1 `setup.js` has `delay: 0`. FireEvent approach itself verified sound by both |
| B4 | Scope Discipline | PASS | FAIL | Rejections inline only ("Rejected: fake timers…"); no explicit NOT Building section |
| B5 | Risk Coverage | FAIL | FAIL | Single risk listed; zero GOTCHA fields; misses unused-`user`-param pitfall in `fillStep2` after conversion |
| B6 | Testability | PASS | FAIL | A: repetition/margin checks + named edge variants suffice. B: no baseline-capture step, no edge-case verification checklist |

Gate-verified repo facts (read-only): `user.type(` count = 26 in debt-mediation test;
`delay: 0` default in installed user-event dist.

## 🔴 Critical (must fix before implementing)

- Not a PRP-format plan: no ACTION/IMPLEMENT/MIRROR/VALIDATE per task (A2; both reviewers).
- Conversion-site miscount: "fillStep2 plus 11 inline sites" vs 26 real `user.type(` calls — Unit 2 as written leaves sites unconverted (B2/A6; verified).
- False version claim: v14 default delay is `0`, not null — the `delay: null` rejection rationale is invalid and must be corrected/re-justified (B3; verified).
- No file:line refs for any edit site; replacement snippet `fireEvent.change(el, …)` never defines `el` (A1/A6; both).
- No working directory on commands; no baseline-capture procedure for the "vs pre-change baseline" comparison (A6; both).
- No build command specified though `next build` exists (A4; both).

## 🟡 Important (should fix)

- No GOTCHA fields; misses the unused-`user`-param lint/TS pitfall in `fillStep2` post-conversion — plan must say keep vs remove the param (B5; both).
- No explicit NOT Building / Non-goals section in the plan (B4; reviewer B).
- No edge-case verification checklist (F02/F03/F06/F11 variants as checks, not just conversion sites) (B6; reviewer B).
- No explicit "N/A — internal change" UX marker (A5; reviewer A).
- `vi.setConfig` has zero repo precedent and placement sensitivity is undocumented (A3/B5; reviewer B).

## 🟢 Minor / Suggestions

- Give one complete transform snippet: `fireEvent.change(screen.getByPlaceholderText('…'), { target: { value: '…' } })` with per-site line numbers.
- Note the `vi` import requirement for the `vitest.setup.ts` stub.
- Justify fireEvent on dispatch-volume grounds (evidence supports this) instead of the delay rationale.
- Record exact slowest-test durations in the baseline step for the before/after comparison.

## Reviewer Disagreements

- A3: A PASS (8/8 prose refs live) vs B FAIL (snippets lack SOURCE refs, `el` undefined). Both true — prose refs verified, code snippets unsourced.
- A5: A FAIL (no literal marker) vs B PASS (before/after thresholds documented). Trivially resolved by adding the marker line.
- B2: A PASS (counts/math consistent) vs B FAIL (site-count contradiction). B correct — gate-verified 26 calls.
- B3: A PASS vs B FAIL (delay default). B correct — gate-verified `delay: 0`.
- B4: A PASS (inline rejections suffice) vs B FAIL (no explicit section). Resolve by adding the section.
- B6: A PASS vs B FAIL (checklist). Resolve by adding the checklist.

## Recommended Next Step

re-plan — the approach itself is sound (both reviewers confirm: fireEvent conversion valid, budgets arithmetic-correct, all PRD requirements mapped, all prose refs verified), but the document is not a PRP-format plan and contains two verified factual errors (site count, delay default). Rewrite as a PRP-format plan (ACTION/IMPLEMENT/MIRROR/VALIDATE per unit, SOURCE refs, GOTCHAs, NOT Building, build gate, baseline procedure, corrected counts/rationale), then re-run prp-validate-plan.
