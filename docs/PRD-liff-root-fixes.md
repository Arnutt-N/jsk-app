# PRD — liff root fixes (4 roots, not 7 symptoms)

## Problem
Three LIFF pages (booking, debt-mediation, service-request) plus request-v2 drifted because shared pieces were never extracted. Seven reported symptoms trace to four roots: (R1) no shared LIFF UI kit — each page hand-rolls its stepper (`const STEPS` in 3 files), status badge (3 meanings), and raw `<select>` (21 sites in 5 files); (R2) hot reads never cached — every booking read repays a LINE token-verify round-trip plus 9 sequential `system_settings` SELECTs across a 3-request frontend waterfall, hence the long booking skeleton; (R3) no shared citizen-name spec — `contact_name` vs `full_name` vs `prefix+firstname+lastname`; (R4) two owners for the bookable-service list — admin setting `booking_service_types` (default empty) vs central taxonomy (grouping only), so a single-item dropdown surprises nobody but confuses everyone.

## Decision (user override 2026-10-17)
User chose the 3-field variant over the synthesis recommendation (prefix-select + single name): every LIFF form collects คำนำหน้า (fixed dropdown) + ชื่อ + นามสกุล. Backend keeps single stored columns and composes at the schema boundary (service-request precedent, no migration).

## Locked addition (user 2026-10-17, validation)
- Shared `frontend/lib/liff/validation.ts` owns phone truth (9–15 digits, backend debt pattern); debt re-exports it with zero behavior change; service-request keeps its local 9–10 rule (documented follow-up). Booking contact stays optional but a filled phone must validate — step-2 Next, summary confirm, and edit-save all gate on it. Formal wording everywhere: `หมายเลขโทรศัพท์ไม่ถูกต้อง` (debt/service-request/request-v2/single updated to match).

## Locked addition (user 2026-10-17, wizard)
- Booking becomes a 4-step wizard with Next/Back like debt/service-request: 1 บริการ → 2 วันเวลา (date+slot stay one decision) → 3 ผู้จอง → 4 สรุป → done. Order is dependency-driven (service before date before slot) with typing last to cut drop-off. Contact stays optional (backend contract unchanged). Submit failure with cleared slot returns to step 2 (index 1). Restored drafts resume at the deepest filled step.

## Scope
1. R1: NEW `frontend/components/liff/LiffStepper.tsx` (`ol` + `aria-current`, brand tokens, numbered+icon+label, `ariaLabel` prop keeps per-page names) applied to 3 pages; NEW `frontend/components/liff/LiffStatusBadge.tsx` (kinds: business-open/closed vs connectivity online/offline/loading) applied to 3 pages; extend shared `components/ui/Select.tsx` with additive `groups` (optgroup) + replace 21 raw `<select>` (booking 1, debt 1, service-request 6, request-v2 7, service-request-single 6).
2. R4: ownership doc (booking setting owns the list, taxonomy owns grouping) + admin settings-screen hint when the list has 0–1 items.
3. R3: spec only — prefix as fixed-choice dropdown + single name field on all 3 pages; service-request keeps optional (anonymous tips, `service_request_liff.py:50`).
4. R2: versioned 60s cache for `load_booking_config` (taxonomy precedent; admin writes invalidate; scheduler keeps `fresh=True` re-read). Measured in settings reads: cold-open waterfall 27 → 9. Deliberately NOT caching LINE token-verify (security call) and NOT deferring the range fetch (would rewrite locked preselect behavior) — both recorded as follow-ups with reasons.

## Non-goals
Changing booking single-page flow into stepped flow (or vice versa); merging the two service-list sources into one table; Redis cache v1; touching admin permission matrix.

## Acceptance
- All 5 pages render stepper/badge/select from shared components; no hand-rolled copies remain (`grep "<select" frontend/app/liff/*/page.tsx` returns nothing; one `const STEPS` definition pattern per page file gone, kept as data only).
- Booking list ownership documented; admin sees a hint on 0–1 items.
- Name spec approved by admin before any R3 code.
- R2 ships only with trunk-vs-head timing numbers.
