# Plan Review: feature-line-audit-fix-map (Round 4, 2026-09-21)

**Plan**: `docs/superpowers/plans/2026-09-12-feature-line-audit-fix-map.md`  
**Reviewed**: 2026-09-21  
**Source PRD**: `docs/superpowers/specs/2026-09-12-feature-line-audit-fix-map.md`  
**Review Mode**: dual, context isolation only (same inherited model; no model override)  
**Verdict**: NOT READY  
**Confidence Score**: 1/10 — single-pass implementation

This dated report preserves the existing tracked historical `...review-round4.md` and the dirty `...review.md`; neither was overwritten. No `--findings` input was supplied, so B7 is skipped.

## Reviewer Verdicts

| Reviewer | Diversity | Verdict | Critical issues |
|---|---|---|---:|
| A | isolated context | FAIL | 2 |
| B | isolated context | FAIL | 3 |

Both reviewers read the plan and source PRD independently. Verified source references include `backend/app/api/v1/endpoints/media.py:39-50,243-283`, `backend/app/api/v1/endpoints/health.py:54-64`, `backend/app/services/credential_service.py:74-82`, and the repo's test/build scripts in `frontend/package.json:5-14`.

## Rubric Results

| # | Criterion | A | B | Aggregate evidence |
|---|---|---|---|---|
| A1 | Context Completeness | FAIL | FAIL | D7 fixture setup remains a recipe, not an executable source pattern (`plan:3015-3031,3082`). |
| A2 | Implementation Readiness | FAIL | FAIL | D7 tests reference undefined fixtures (`plan:3038-3079`). |
| A3 | Pattern Faithfulness | PASS | FAIL | D7 MIRROR still names nonexistent `authFetch` (`plan:2915`), while `frontend/lib/authFetch.ts:156-179` exports `installAdminAuthFetchInterceptor`. |
| A4 | Validation Coverage | PASS | PASS | Backend test, frontend unit/type/lint/build commands stated; npm scripts verified in `frontend/package.json:5-14`. |
| A5 | UX Clarity | PASS | PASS | Before/after section at `plan:3289-3296`. |
| A6 | No Prior Knowledge | FAIL | FAIL | Plan itself labels D7 tests a contract sketch requiring fixture code (`plan:3322`). |
| B1 | Spec Coverage | PASS | FAIL | PRD story 25 (`PRD:~65`) is not implemented; D3 says no current LIFF GET/PATCH and uses an inventory test instead (`plan:2495-2496,2539-2553`). The spec decision needs explicit reconciliation. |
| B2 | Internal Consistency | FAIL | FAIL | D7 MIRROR says `authFetch` (`plan:2915`), but frontend contract says no such export (`plan:2938`); test snippet uses 8-byte PNG while recipe demands a fully valid image (`plan:3027-3031,3067-3078`). |
| B3 | Technical Soundness | FAIL | FAIL | Resize ticket uses `create_access_token` without overriding `type` (`plan:3178-3185`); `security.py:88-93` defaults to `type=access` and `deps.py:78-92` accepts that type as an auth cookie. A ticket could therefore authenticate as its subject if copied into the access cookie during its lifetime. |
| B4 | Scope Discipline | PASS | PASS | NOT Building at `plan:3265-3277` matches PRD out-of-scope. |
| B5 | Risk Coverage | PASS | PASS | Concrete mitigations at `plan:3279-3287`; tasks carry GOTCHA fields. |
| B6 | Testability | FAIL | FAIL | D7 Step 1b has missing fixtures and several asserted expected outcomes exist only in prose (`plan:3015-3082`). |
| B7 | Finding Coverage | SKIPPED | SKIPPED | No `--findings` input. |

## 🔴 Critical (must fix before implementing)

1. **Ticket can serve as a login token.** D7 issues a regular access token with a resize purpose but does not set a distinct token type; the cookie-auth path checks only `type=access`, not purpose (`plan:3178-3185`; `backend/app/core/security.py:88-93`; `backend/app/api/deps.py:78-92`). Use a dedicated ticket type and test that placing the ticket in the access cookie is rejected; require that type again on upload.
2. **D7 is not executable from the plan.** `authenticated_admin_client`, `agent_client`, and `resize_tickets` are used but never defined, despite the plan's own rule that fixtures must be included (`plan:36,3015-3082,3322`). Provide complete fixture code, real cookie/CSRF setup, isolation/teardown, and input/expected pairs. Resolve the contradictory PNG sample: current `media.py:41-50` only checks magic bytes, but the D7 recipe says Pillow-valid image while the example provides only a signature.
3. **Dead frontend symbol remains.** D7 MIRROR still instructs `authFetch` (`plan:2915`), contradicting its own later correction (`plan:2938`). Use the actual interceptor path and a transport-level CSRF test.
4. **PRD story 25 needs an explicit scope decision.** The PRD requests LIFF GET rate limiting and PATCH-None validation; D3 finds no such routes and asserts inventory equality (`plan:2495-2553`). Clarify whether the requirement is conditional/inapplicable, revise the PRD or add an applicable task, and keep the mapping consistent.

## 🟡 Important (should fix)

- D7 permits PDF through the shared `_sniff_mime` rule (`media.py:39-50`) unless the resize route adds a JPEG/PNG-only check; make the upload contract explicit (`plan:3163-3169,3203`). This is an additional domain-specific guard, not a further score deduction because B3 already fails.
- Ensure failure-audit instructions (`plan:3220-3221`) are reflected in the actual Step 3 snippet rather than only prose; specify which failures happen before FastAPI enters the handler. Already covered by A2/B6, so not deducted again.

## 🟢 Minor / Suggestions

- Reviewer A flagged `httpx.Timeout(connect=3.0, read=5.0)` at `plan:2497`; this is only a summary. The actual Step 3 constructor at `plan:2570` supplies `write` and `pool`, so this is **not** counted as a defect.
- The older historical round-4 report is about a different plan snapshot and should not be read as this review's result.

## Reviewer Disagreements

- **A3:** A passed three sampled repository references; B found the remaining invented `authFetch` symbol. The rubric says one invented API is an instant FAIL, so aggregate FAIL.
- **B1:** A accepted the LIFF inventory rationale; B held the explicit PRD story to its written requirement. Because there is no documented spec change, aggregate FAIL.
- **B3:** Both failed, but A's timeout rationale is not supported by the actual code snippet. The independently verified ticket-as-login risk is the retained B3 failure.

## Scoring

Failed Group A criteria: A1, A2, A3, A6 (4). Failed Group B criteria: B1, B2, B3, B6 (4). No additional Important finding is double-counted. `max(1, 10 - 2×4 - 1×4) = 1`; consensus FAIL also caps at 7. Result: **NOT READY, 1/10**. The low score reflects the rubric's additive deductions, not a measured decline in implementation quality from the previous historical round.

## Recommended Next Step

Revise the plan to remove the access-token ticket risk and complete D7's executable contract, reconcile story 25 and the stale frontend reference, then re-run `prp-validate-plan`.
