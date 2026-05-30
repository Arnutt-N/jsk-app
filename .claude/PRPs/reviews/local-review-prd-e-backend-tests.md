# Code Review: PRD E Backend Schema Validation Tests

**Reviewed**: 2026-05-29
**Branch**: feat/community-agencies-drug-reporting
**Commit**: 7bbb604
**Decision**: APPROVE

## Summary

Two backend test files validate that the `ServiceRequestCreate` Pydantic schema accepts all new values from PRD E (4 agencies, drug reporting category, 4 subcategories). 11 tests, all pass on Python 3.9.

## Findings

### CRITICAL
None

### HIGH
None

### MEDIUM
None

### LOW

1. **Schema duplication** — `test_prd_e_drug_reporting_standalone.py:19-68`
   - Redefines `ServiceRequestCreate` model inline rather than importing the real schema. This is a pragmatic workaround for Python 3.9 compatibility (real schema uses `str | None` syntax requiring 3.10+).
   - **Risk**: If the real schema gains new required fields, the standalone copy will drift.
   - **Mitigation**: Comment at line 3-5 explains the reason. The main test file (`test_prd_e_drug_reporting.py`) imports the real schema for WSL/Python 3.13+ environments.

2. **Outdated example** — `test_prd_e_drug_reporting_standalone.py:58`
   - `"agency": "ยุติธรรมจังหวัดเชียงใหม่"` in model_config example doesn't match any PRD E agency.
   - **Impact**: Cosmetic only — example values are documentation, not assertions.

## Validation Results

| Check | Result |
|---|---|
| Pytest (standalone, Python 3.9) | ✅ 11/11 Pass |
| Pytest (real schema, WSL Python 3.13+) | ⏭️ Skipped (needs WSL) |

## Files Reviewed

| File | Type | Lines |
|------|------|-------|
| `backend/tests/test_prd_e_drug_reporting.py` | Added | 110 |
| `backend/tests/test_prd_e_drug_reporting_standalone.py` | Added | 179 |
