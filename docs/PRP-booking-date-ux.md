# PRP — implement booking date UX (design B)

## Files
- NEW `frontend/lib/booking/draft.ts` (+ `frontend/lib/booking/__tests__/draft.test.ts`)
- NEW `frontend/lib/booking/service-mapping.ts` (+ `frontend/lib/booking/__tests__/service-mapping.test.ts`)
- NEW `frontend/components/liff/booking/DateSection.tsx`
- EDIT `frontend/app/liff/booking/page.tsx` (rewire only, no logic redesign)
- EDIT `frontend/app/liff/booking/__tests__/page.test.tsx` if selectors change

## Data shape first (principle-model-the-domain)
BookingDraft reducer over scattered useState booleans. Service table/registry over branching on free-text names.

```ts
BookingDraft { service, date, slotId, contactName, phoneNumber, note, savedAt }
DraftAction = service/set | date/set (clears slotId) | slot/set | contact/set | section/clear (idempotent) | draft/reset
ServiceOption { value, label, category }; ServiceGroup { category, options[] }
DateSectionProps { dates, value, onChange, isDateDisabled, minDate, maxDate }
```

## Units (principle-sequence-verifiable-units, each green before next)
1. draft.ts + tests: expiry, version mismatch, corrupt JSON → EMPTY_DRAFT; clear date also clears slot; double clear is no-op.
2. service-mapping.ts + tests: known strings classified, unknown → "อื่นๆ", every TOPIC_OPTIONS key covered.
3. DateSection.tsx: strip on top with affordances, calendar in collapsed disclosure, one onChange.
4. page.tsx rewire: Promise.all boot, loadDraft before paint, SectionClearHeader per block, keep latestSlotKey guard behavior inside getSlots single-flight.

## Boundaries (principle-boundary-discipline)
Validate at storage load + adapter (never throw to UI). Pure reducer/business logic trusted on typed input. No wire types leak to markup.

## Concurrency (principle-separate-before-serializing-shared-state)
One writer for draft (reducer module). Page dispatches only. Availability cache memory-only, cleared on reset.

## Validation
- `cd frontend && npm run test:unit -- lib/booking` (new tests)
- `cd frontend && npm run build`
- Manual: 360px wide, strip hint shows once, arrows work, calendar collapsed, per-section clear toasts.

## Rollback
Each unit is its own commit. Revert unit 4 first (page rewire), units 1-3 are additive and safe alone.
