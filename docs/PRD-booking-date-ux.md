# PRD — LIFF booking date UX + stale session + clear + service reuse

## Problem
LIFF booking (`frontend/app/liff/booking/page.tsx`) loads slowly through a sequential chain (liff.init → /options → /range → /availability) with only an in-memory slotCache, so a previous session feels stuck. No per-section clear exists (sibling service-request has clearStep + toast). Booking `service_types` (backend free text) duplicates the `TOPIC_OPTIONS` taxonomy instead of reusing it. Date section stacks CalendarPickerTH on top of a horizontal strip with hidden scrollbar and no affordance, so users cannot discover sideways scroll.

## Users
Citizens booking via LINE LIFF on mobile. Admins who type free-text service names.

## Scope (design B chosen by user)
1. Draft owner `lib/booking/draft.ts`: versioned sessionStorage + 30-min TTL, idempotent per-section clear + full reset, memory-only slot cache (~60s). Selections may survive reload, availability never persists.
2. Service adapter `lib/booking/service-mapping.ts`: group backend strings under TOPIC_OPTIONS categories for optgroup dropdown, unknown → "อื่นๆ", build-time coverage check.
3. `components/liff/booking/DateSection.tsx`: strip-first primary on top (snap + peek + edge fades + arrows + first-scroll hint + desktop scrollbar), CalendarPickerTH collapsed below as month jumper. Single onChange path, isDateDisabled passed through (fail-open preserved).
4. Page rewire: parallel boot after idToken, synchronous draft restore before first paint, uniform SectionClearHeader per block with toast wording matching service-request.

## Non-goals
No backend enum migration. No persisted availability. No change to StepRail order.

## Acceptance
- Cold open shows restorable draft instantly, no stale full state after TTL/version mismatch.
- Each block (service/date/slot/contact) has a working clear with toast; full reset works.
- Service dropdown groups match TOPIC_OPTIONS; unmapped string renders under "อื่นๆ" without breaking.
- Strip hint appears once, arrows scroll, calendar collapsed by default, disabled-day policy unchanged.
- `npm run test:unit` (booking-related) + `npm run build` pass.
