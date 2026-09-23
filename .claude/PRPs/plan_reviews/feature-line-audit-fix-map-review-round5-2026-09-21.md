# Plan Review: feature-line-audit-fix-map (Round 5, 2026-09-21)

**Plan**: `docs/superpowers/plans/2026-09-12-feature-line-audit-fix-map.md`  
**Reviewed**: 2026-09-21  
**Source PRD**: `docs/superpowers/specs/2026-09-12-feature-line-audit-fix-map.md`  
**Review Mode**: dual, independent contexts; same inherited model (no model override)  
**Verdict**: NOT READY  
**Confidence Score**: 1/10 — single-pass implementation

This dated report preserves the tracked historical `...review-round5.md` and the existing round-4 reports. No `--findings` input was supplied, so B7 is skipped. The plan, PRD, code, and git state were not changed by this review.

## Reviewer Verdicts

| Reviewer | Diversity | Verdict | Critical issues |
|---|---|---|---:|
| A | isolated context | FAIL | 3 |
| B | isolated context | FAIL | 4 |

Both reviewers read the current plan and PRD independently. Read-only source checks confirmed at least three plan references: `backend/app/core/permissions.py:61,123`, `frontend/lib/authFetch.ts:156` and `frontend/contexts/AuthContext.tsx:119`, and `backend/app/core/security.py:65-68`. The credential-service mismatch was also checked against `backend/app/services/credential_service.py:74-82`.

## Rubric Results

| # | Criterion | A | B | Evidence |
|---|---|---|---|---|
| A1 | Context Completeness | FAIL | FAIL | B2 migration omits the existing credential payload contract (`plan:721-790`; `credential_service.py:74-82`); C2 omits the promised broadcast UI file (`plan:974-989`). |
| A2 | Implementation Readiness | FAIL | FAIL | B2 cannot be implemented safely without resolving payload, key-disposition, and rollback ownership; C2 does not specify its UI action (`plan:721-790,982-985`). |
| A3 | Pattern Faithfulness | FAIL | FAIL | Three other refs spot-checked, but B2's encrypted bare string contradicts the cited JSON-dict credential-service pattern (`plan:765-771`; `credential_service.py:74-82`). |
| A4 | Validation Coverage | PASS | PASS | Pytest, TypeScript check, unit test, lint, and build commands stated (`plan:38-48`); npm scripts verified in `frontend/package.json:7-14`. |
| A5 | UX Clarity | PASS | PASS | Before/after states and internal-change labels at `plan:3528-3534`. |
| A6 | No Prior Knowledge | FAIL | FAIL | B2 requires design decisions on migration/rollback; C1 and C2 leave required acceptance behavior unspecified (`plan:721-810,876-879,974-989`). |
| B1 | Spec Coverage | FAIL | FAIL | PRD story 15 calls for a consolidated dashboard query but C1 accepts at least 11; story 26 promises a preview button but C2 changes backend only; stories 42-43 have no per-screen/action acceptance map (`PRD:62,73,92-93`; `plan:876-879,982-985,3551`). |
| B2 | Internal Consistency | FAIL | FAIL | B2 deny-list has eight keys while migration handles six; rollback deletes credentials by name, without proving they were created by this migration (`plan:694-699,731-735,777-789`). |
| B3 | Technical Soundness | FAIL | FAIL | B2 encrypts a raw value while normal retrieval expects JSON, preserves a plaintext backup table, and can delete pre-existing credentials on downgrade (`plan:753-790`; `credential_service.py:74-82`). |
| B4 | Scope Discipline | PASS | PASS | NOT Building is explicit and generally matches PRD scope (`plan:3504-3516`). |
| B5 | Risk Coverage | FAIL | FAIL | B2's persistent plaintext backup and rollback deletion are not safely mitigated by its risks section (`plan:753-790,3518-3526`). |
| B6 | Testability | FAIL | FAIL | B2 tests do not read a migrated credential via the normal service or preserve pre-existing credentials; C2 lacks UI and failed-token recovery tests (`plan:638-641,753-810,982-985,1135-1149`). |
| B7 | Finding Coverage | SKIPPED | SKIPPED | No `--findings` argument supplied. |

## 🔴 Critical (must fix before implementing)

1. **B2 migrates an unreadable credential shape.** The migration encrypts a raw string (`plan:765-771`), but `CredentialService.encrypt_credentials()` serializes a dictionary to JSON and `decrypt_credentials()` JSON-decodes the plaintext (`credential_service.py:74-82`). Normal retrieval of migrated rows would fail or return the wrong type. Specify the exact dictionary shape and test reads through `CredentialService`.
2. **B2 rollback can delete pre-existing credentials.** `DELETE FROM credentials WHERE name = ANY(:keys)` (`plan:787-789`) does not distinguish rows created by the migration from rows already present. Track inserted row IDs or a migration-specific marker, prove downgrade preserves pre-existing rows, and test upgrade→downgrade→upgrade.
3. **B2 leaves secret disposition unresolved.** The settings write guard names eight sensitive keys but the migration selects six (`plan:694-699,731-735`); the two root-key names require an explicit safe disposition rather than simply encrypting them with themselves. The `_secret_migration_backup` table created at `plan:753-758` retains plaintext after upgrade despite the stated at-rest goal. Define secure, time-bounded backup/restore and removal behavior with tests.
4. **C1 conflicts with PRD story 15.** The PRD requires a consolidated dashboard query (`PRD:62,155-162`), but the C1 test comments accept at least 11 data statements and only prove cache reuse (`plan:876-882`). Either implement and test the promised query reduction or explicitly revise the PRD/acceptance decision.
5. **C2 omits user-visible and recovery behavior.** The PRD asks for a preview button and failed-token handling for later cleanup (`PRD:73-74,194-201`); C2 lists only backend files and its retry path counts failures without a recovery record (`plan:982-989,1090-1133`). Add the affected frontend file(s), UI test, and a defined failed-token persistence/retry contract.

## 🟡 Important (should fix)

- D7 must specify that static `GET /admin/media/resize-ticket` is registered **before** existing dynamic `GET /admin/media/{media_id}` (`media.py:348`). Otherwise the dynamic route can intercept the ticket path and yield a UUID validation error. This contributes to A2/B3 already counted above.
- D7 Step 1b's `resize_setup` monkeypatches `media_module.redis_client` (`plan:3093-3103`), but the current module has no such attribute; it is introduced in Step 3 (`plan:3321-3324`). The intended red test will fail during fixture setup rather than at the missing route. Define an explicit red-phase patch target or separate the pre-implementation test expectations. This contributes to A2/B6 already counted above.
- B2 Step 6 proposes counting `_secret_migration_backup` before/after a downgrade that drops that table (`plan:790,809-810`). Give an executable before/after evidence query. This is the same B2 root cause, not an additional score deduction.

## 🟢 Minor / Suggestions

- Preserve the improvements in D7: the ticket now has a distinct type, the CSRF transport has a concrete test, and the PRD makes LIFF GET/PATCH conditional on actual route inventory (`plan:2915-2939,3015-3238`; `PRD:72`). These do not offset independent failures in B2/C1/C2.

## Reviewer Disagreements

None on criterion outcomes. Reviewers found different examples for A1/A2/A6 and B3/B6, but both marked the same applicable criteria FAIL.

## Scoring

Unique failed Group A criteria: A1, A2, A3, A6 (4). Unique failed Group B criteria: B1, B2, B3, B5, B6 (5). Important items above share these failed root causes and are not deducted again. `max(1, 10 - 2×4 - 1×5) = 1`; consensus FAIL also caps at 7. This is a rubric score for the whole 20-task plan, not a measure of whether D7 improved relative to round 4. Band <6: **NOT READY / RE-PLAN**.

## Recommended Next Step

Re-plan B2, C1, and C2 with source-faithful data/rollback contracts and PRD-matched acceptance tests, then re-run `prp-validate-plan` before implementation.
