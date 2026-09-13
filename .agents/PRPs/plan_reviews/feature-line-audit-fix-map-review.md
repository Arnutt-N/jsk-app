# Plan Review: feature-line-audit-fix-map
**Plan**: docs/superpowers/plans/2026-09-12-feature-line-audit-fix-map.md
**Reviewed**: 2026-09-12
**Source PRD**: docs/superpowers/specs/2026-09-12-feature-line-audit-fix-map.md
**Review Mode**: dual
**Verdict**: NOT READY
**Confidence Score**: 1/10 — single-pass implementation

## Reviewer Verdicts
| Reviewer | Diversity | Verdict | Critical issues |
|---|---|---|---|
| A | context isolation only | FAIL | 5 |
| B | context isolation only | FAIL | 10 |

## Rubric Results
| # | Criterion | A | B | Evidence |
|---|---|---|---|---|
| A1 | Context Completeness | FAIL | FAIL | Zero file:line refs; dead paths core/redis.py (real redis_client.py), intent_matcher.py, admin_image_resize.py |
| A2 | Implementation Readiness | FAIL | FAIL | down_revision PUT_REAL_HEAD_HERE; undefined fixtures private_media/query_counter/db_session_factory |
| A3 | Pattern Faithfulness | FAIL | FAIL | Invented ChatSession.duration_seconds, ChatSessionStatus (real SessionStatus), Intent(pattern,priority), CredentialService.encrypt/decrypt(raw) |
| A4 | Validation Coverage | PASS | PASS | pytest + test:unit specified and exist |
| A5 | UX Clarity | FAIL | FAIL | No Before/After or N/A section |
| A6 | No Prior Knowledge | FAIL | FAIL | Stranger blocks at Step 1 (placeholders + wrong imports) |
| B1 | Spec Coverage | FAIL | FAIL | Ghost-push PRD story has no mapped task despite Self-Review claim |
| B2 | Internal Consistency | FAIL | FAIL | D1 Query(le=1000) vs clamp test; health route prefixes; enum name mismatches |
| B3 | Technical Soundness | FAIL | FAIL | percentile on missing column; request.session CSRF on FastAPI; wrong config keys |
| B4 | Scope Discipline | FAIL | FAIL | No NOT Building section; adds duplicate request_status.py |
| B5 | Risk Coverage | FAIL | FAIL | No Risks/Mitigations/GOTCHAs section |
| B6 | Testability | FAIL | FAIL | No edge-case checklist; tests depend on undefined helpers |

## Critical (must fix before implementing)
- Correct dead file refs to redis_client.py, real intent modules, drop or justify admin_image_resize.py
- Align transfer_session signature + SessionStatus, verify_liff_token ->str + LINE_LOGIN_CHANNEL_ID, CredentialService encrypt_credentials(dict)/decrypt_credentials, existing RequestStatus/BookingStatus enums, DEFAULT_POLICY in app/core/permissions.py
- Replace down_revision placeholder with real alembic head; define all fixtures/helpers with import paths
- Add missing ghost-push guard implementation + presence-tracker changes (PRD stories 18-19)
- Add NOT Building, Risks/Mitigations/GOTCHAs, Before/After-or-N/A, edge-case checklist sections

## Important (should fix)
- D1 limit semantics: Query(le=100) or clamp-before-validation consistently
- C5 route prefix alignment (/health under prefix) and D5 mask-helper import verification
- D3 retry scope must cover HTTP errors, not just outside

## Minor / Suggestions
- RFC 5987 filename already fixed in plan drafting; keep on revise pass

## Reviewer Disagreements
None material - both FAIL on the same 11 criteria; both PASS only A4. B lists more invented-API instances than A but same root causes.

## Recommended Next Step
revise and re-validate: fix the Critical list above in the plan file, then re-run prp-validate-plan before any implementation.
