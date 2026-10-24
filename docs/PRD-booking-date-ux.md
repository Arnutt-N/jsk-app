# PRD — LIFF booking date UX + stale session + clear + service reuse

## Problem
LIFF booking (`frontend/app/liff/booking/page.tsx`) loads slowly through a sequential chain (liff.init → /options → /range → /availability) with only an in-memory slotCache, so a previous session feels stuck. No per-section clear exists (sibling service-request has clearStep + toast). Booking `service_types` (backend free text) duplicates the `TOPIC_OPTIONS` taxonomy instead of reusing it. Date section stacks CalendarPickerTH on top of a horizontal strip with hidden scrollbar and no affordance, so users cannot discover sideways scroll.

## Users
Citizens booking via LINE LIFF on mobile. Admins who type free-text service names.

## Locked decisions (user 2026-10-16)
- Draft TTL: 30 minutes.
- Strip: 7-day paging (one week per page, arrows page by week), not the full advance_days span.
- Disabled days: three explicit states with legend — open / full (เต็ม) / closed-holiday (หยุด, incl. blackout dates). Missing range data stays fail-open (rendered as open, no legend claim).
- Service taxonomy: single DB-backed source, admin-editable, shared by LIFF service-request and booking. Backend today stores both as free text (service_request.topic_category/subcategory columns; booking_service_types in system_settings) with TOPIC_OPTIONS hardcoded in frontend — so this phase ships a DB-ready adapter (fetch taxonomy when endpoint exists, fallback to TOPIC_OPTIONS) plus a backend follow-up for the endpoint + admin UI.

## Scope (design B chosen by user)
1. Draft owner `lib/booking/draft.ts`: versioned sessionStorage + 30-min TTL, idempotent per-section clear + full reset, memory-only slot cache (~60s). Selections may survive reload, availability never persists.
2. Service adapter `lib/booking/service-mapping.ts`: DB-ready taxonomy client — fetch shared taxonomy from backend when the endpoint exists, fallback to TOPIC_OPTIONS; group backend strings under categories for optgroup dropdown, unknown → "อื่นๆ", build-time coverage check. Backend endpoint + admin UI is a stacked follow-up.
3. `components/liff/booking/DateSection.tsx`: 7-day paged strip primary on top (week label + prev/next-week arrows + snap + peek + edge fades + first-scroll hint + desktop scrollbar + three-state legend: open/full/closed-holiday), CalendarPickerTH collapsed below as month jumper (same legend). Single onChange path, isDateDisabled passed through (fail-open preserved).
4. Page rewire: parallel boot after idToken, synchronous draft restore before first paint, uniform SectionClearHeader per block with toast wording matching service-request.

## Non-goals
No backend enum migration. No persisted availability. No change to StepRail order.

## Acceptance
- Cold open shows restorable draft instantly, no stale full state after TTL/version mismatch.
- Each block (service/date/slot/contact) has a working clear with toast; full reset works.
- Service dropdown groups match TOPIC_OPTIONS; unmapped string renders under "อื่นๆ" without breaking.
- Strip hint appears once, arrows scroll, calendar collapsed by default, disabled-day policy unchanged.
- `npm run test:unit` (booking-related) + `npm run build` pass.
