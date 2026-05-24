# Code Review: PRD E — Drug Reporting (แจ้งเบาะแสยาเสพติด)

**Reviewed**: 2026-05-25
**Branch**: feat/community-agencies-drug-reporting
**Decision**: APPROVE

## Summary

PRD E adds drug reporting category with 4 subcategories, 4 agencies, conditional subcategory dropdown, escalation dialog, and LIFF auto-close. All validation passes, no critical or high issues found.

## Findings

### CRITICAL

None

### HIGH

None

### MEDIUM

1. **E2E test selectors are fragile** — `drug-reporting.spec.ts:42,61,83,127`
   - Uses `nth()` to target selects by position (e.g., `selects.nth(1)` for subcategory, `selects.nth(selectCount - 1)` for agency). Adding/removing a select element between the category and subcategory selects would break these tests.
   - **Fix**: Consider adding `data-testid="subcategory-select"` and `data-testid="agency-select"` attributes in the create page form.

2. **Dead catch block** — `request-v2/page.tsx:304`
   - `catch {}` is empty but the try body uses `window.liff?.closeWindow()` with optional chaining — the only possible throw is a ReferenceError if `window` is truly undefined, which can't happen in a browser LIFF context.
   - **Fix**: Remove the try/catch, just call `window.liff?.closeWindow(); window.close()` directly, or log the error in the catch block.

### LOW

3. **Spread unnecessary for immutable constant** — `create/page.tsx:309`
   - `[...CATEGORIES]` spreads an `as const` array. Since the Select component only reads options, the spread is harmless but unnecessary. `[...DRUG_REPORTING_SUBCATEGORIES]` and `[...AGENCIES]` follow same pattern — consistent with codebase convention.

## Validation Results

| Check | Result |
|---|---|
| TypeScript (`tsc --noEmit`) | ✅ Pass |
| ESLint | ✅ Pass (0 errors) |
| Tests (`vitest run`, 29 tests) | ✅ 29/29 Pass |
| Build | ⏭️ Skipped (requires full app) |

## Files Reviewed

| File | Type | Lines |
|------|------|-------|
| `lib/constants/categories.ts` | Added | 56 |
| `lib/constants/agencies.ts` | Added | 27 |
| `lib/constants/__tests__/categories.test.ts` | Added | 115 |
| `lib/constants/__tests__/agencies.test.ts` | Added | 61 |
| `components/ui/EscalationDialog.tsx` | Added | 97 |
| `e2e/drug-reporting.spec.ts` | Added | 133 |
| `app/admin/requests/create/page.tsx` | Modified | +18/-23 |
| `app/admin/requests/page.tsx` | Modified | +1 |
| `app/admin/requests/[id]/page.tsx` | Modified | +28 |
| `app/liff/request-v2/page.tsx` | Modified | +40/-7 |
| `app/liff/service-request/page.tsx` | Modified | +15/-3 |
