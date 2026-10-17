# PRP — liff root fixes (units green one by one)

## Files
- NEW `frontend/components/liff/LiffStepper.tsx` (props: steps[{label,icon}], currentIndex, ariaLabel; `ol`, numbered circle → check icon when done, `aria-current="step"`, brand/semantic tokens only) + test `frontend/components/liff/__tests__/LiffStepper.test.tsx`
- EDIT `frontend/app/liff/booking/page.tsx` (delete local StepRail `:49-92`, keep `STEPS` data + `aria-label="ขั้นตอนการจอง"`), `debt-mediation/page.tsx` (`:406-424` block), `service-request/page.tsx` (`:545-563` block)
- NEW `frontend/components/liff/LiffStatusBadge.tsx` (props: kind business|connectivity, state) + apply at `booking/page.tsx:425`, `debt-mediation/page.tsx:390`, `service-request/page.tsx:537`
- EDIT 21 selects → shared `Select` (`components/ui/Select.tsx`, `size md`, `pr-10` chevron room): booking `:578` (grouped, needs new `groups` prop), debt `:574`, service-request x6, request-v2 x7, service-request-single x6
- R4: EDIT `docs/` ownership note + admin bookings settings screen hint (label only)
- R3: spec doc only, no code this round
- R2: EDIT `backend/app/services/booking_settings.py` (versioned cache + invalidate on save) + `frontend/lib/booking/store.ts` (parallel options/taxonomy, defer range) + timing log

## Data shape first (principle-model-the-domain)
Stepper state is `{steps, currentIndex}` — pages keep step derivation, component only renders. Badge state is `{kind, state}` — business vs connectivity can never share one boolean again. Name spec (R3): `{prefix: enum, fullName: string}` — one shape for all three flows.

## Units (each green before next)
1. R1U1 Stepper component + test + 3-page migration (existing booking stepper test `page.test.tsx:385` stays green unchanged).
2. R1U2 StatusBadge component + test + 3-page migration (visual parity: same words as today).
3. R1U3 select swap per page (booking → debt → service-request → request-v2 → service-request-single), existing validation tests green each time; `tsc --noEmit` clean (shared Select extended additively).
4. R4 doc + admin hint (no behavior change).
5. R3 spec → admin approval gate, code later.
6. R2 cache: TTL + invalidate + fresh bypass + read-count measurement (9 vs 27). No wall-time claim without a live DB; remaining cost is 3 serial LINE verifies (out of scope, security).
7. Wizard conversion (user-approved): STEPS 4 items, wizardStep state init from draft, per-step Next gating + Back, summary step with confirm, submit-failure step-back, booking page tests rewritten to walk the wizard.
8. Shared validation: NEW `lib/liff/validation.ts` (isValidPhone/normalizePhone/validateBookingContact) + debt re-export compat + booking step-2/edit/summary gating + unit + page tests.

## Boundaries
Validate at component props (bad kind/state rejected by types); pages keep data derivation. Endpoints thin; cache lives in service with writer-invalidate. Never re-export ORM details. No new deps.

## Validation
- `cd frontend && npm run test:unit -- liff` (stepper/badge/select suites + existing page suites)
- `cd frontend && npm run lint` on touched files
- R2 only: `cd backend && python -m pytest tests/test_booking*.py` + trunk/head cold-open timings
- Manual on phone in LINE: stepper/badge/select look identical across 3 pages; booking list hint visible on 0–1 items.

## Rollback
Each unit own commit on `feat/liff-root-fixes`. Component swaps revert by restoring local blocks (kept small, one page per commit for R1U3). Cache unit reverts to fresh-read (scheduler-safe default).
