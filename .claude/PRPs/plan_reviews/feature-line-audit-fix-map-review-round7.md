# Plan Review: feature-line-audit-fix-map (Round 7, A1 validation correction)

**Plan**: `docs/superpowers/plans/2026-09-12-feature-line-audit-fix-map.md`
**Reviewed**: 2026-09-20
**Input**: A1 validation after commit `d5b6491`
**Review Mode**: targeted correction of an execution-found plan gap
**Verdict**: READY TO RESUME AFTER A1 TEST FOLLOW-UP

## Finding addressed

The implementation correctly applies `require_liff_identity()` to all three LIFF
write routes, so a missing token returns 401 even when `LIFF_STRICT_MODE=false`.
The original plan updated only `test_liff_token.py`; the required A1 validation
then exposed four stale expectations in the media and debt-mediation contracts.

Observed validation: 52 passed, 4 failed. The four failures were:

- media B1 expected the old English detail `LIFF ID token required`;
- media B7 expected strict-off tokenless upload success;
- debt-mediation strict-mode test expected the old English detail;
- debt-mediation transition-mode test expected tokenless persistence.

## Plan amendment

The plan now explicitly modifies:

- `backend/tests/test_liff_media_upload.py` B1 and B7;
- `backend/tests/test_liff_debt_mediation.py` missing-token and transition-mode tests;
- the A1 Step 4 command to run those contracts before commit;
- the A1 Step 5 file list and Step 6 acceptance criteria.

The amended tests assert one Thai 401 detail, no tokenless DB write, and no
dependency calls for rejected transition-mode submissions. No production scope
or PRD story mapping changed.

## Gate

No critical or important plan issue remains for A1. Resume by applying the
amended test changes and rerunning A1 Step 4; do not start A2 until Step 6 is
green. Keep the existing `d5b6491` commit and add the test correction as a
separate conventional commit.
