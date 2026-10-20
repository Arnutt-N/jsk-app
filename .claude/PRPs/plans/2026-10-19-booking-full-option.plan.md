# Booking Full-Option Implementation Plan

> **For agentic workers:** implement phase-by-phase in order. Each phase ends in
> a verifiable state (tests + build green) before the next starts. Do not skip
> ahead. Branch: `feat/booking-full-option`.

**Goal:** Counter staff can run the full booking lifecycle from
`/admin/bookings` (walk-in create, contact edit, search, month view, reminder
resend, staff assignment), every new capability toggleable from
`/admin/settings/booking`, and citizens who give an email get confirmations +
reminders by email instead of quota-consuming LINE push.

**Architecture:** Reuse the existing engines, add thin admin surfaces.
`create_booking()` (advisory lock + queue number) serves both LIFF and admin
create. `BookingConfig` + `KEY_*` pattern in `booking_settings.py` gains one
boolean per new capability. Email is a new best-effort sender mirroring
`booking_notifications.py` (never raises, ERROR-logged). No scheduler
semantics change. No ServiceRequest change.

**Tech Stack:** FastAPI async + SQLAlchemy 2.0 + Pydantic V2 + Alembic;
Next.js 16 + React 19 + TS + Tailwind v4; Vitest + Playwright; pytest.

**PRD:** `.claude/PRPs/prds/2026-10-19-booking-full-option.prd.md`

## Global Constraints
- Async by default; never return ORM models (`model_validate`).
- Thai UI strings; Thai error details for 403/409.
- 4-space indent backend, 2-space frontend, UTF-8 LF.
- Every new endpoint: auth gate (`get_current_staff` for counter ops,
  `get_current_admin` for settings) + audit log on mutation.
- Feature OFF hides UI entry AND backend rejects (403). No dead switches.
- No new npm dependencies. SMTP via stdlib `smtplib` (no new pip deps).
- Comment rule: why-only, no restatements (`no-comments` review pre-commit).

## Static Evidence (verified 2026-10-19 on `main`)
| # | Finding | Location |
|---|---------|----------|
| E1 | Admin bookings API has GET list + PATCH status only, no POST | `backend/app/api/v1/endpoints/admin_bookings.py:37-108` |
| E2 | `SETTABLE_STATUSES` = 3 terminals; re-set terminal → 409 | `admin_bookings.py:40-44,68-108` |
| E3 | `create_booking` flush-not-commit; caller commits; lock per day | `booking_service.py:197-212,267-325` |
| E4 | LIFF PATCH contact-only; admin cannot edit anything but status | `liff_bookings.py`, `schemas/booking.py:BookingUpdateIn` |
| E5 | List API accepts date/status/service_type/limit/offset; UI uses date+status only | `admin_bookings.py:37-60`, `bookings/page.tsx` |
| E6 | Reminder loop 60s; claim-before-send at-most-once; `reminder_sent_at` single column | `tasks/booking_reminder.py`, `booking_service.py:516-574` |
| E7 | Confirm + reminder go via `push_messages` (quota); history-via-chat uses `reply_flex` (free) | `booking_notifications.py`, `message_intake/commands.py:22-39` |
| E8 | No SMTP/email infra; no email column on Booking or User contact step | grep 2026-10-19 (empty) |
| E9 | `Booking` has no `assigned_staff_id`; requests have `assigned_agent_id` + `AssignModal` | `models/booking.py:24-73` |
| E10 | Config: `system_settings` text + never-raise + 60s cache; settings UI exists | `booking_settings.py`, `settings/booking/page.tsx` |
| E11 | Locked user decision 2026-10-19: email INSTEAD of push when provided | this program chat |

## Phase 1 — Walk-in create + contact edit + toggles
- [ ] Backend: `POST /admin/bookings` (staff gate, toggle `booking_walkin_enabled`, calls `create_booking()`, audit `create_booking_walkin`). Extend PATCH schema with optional contact_name/phone_number/note (same rules as LIFF update), audit `update_booking_contact`.
- [ ] Frontend: "เพิ่มคิวนอก" button + dialog (service dropdown, `CalendarPickerTH`, slot select via existing availability API, contact fields); per-row edit button + dialog. Both hidden when toggle OFF.
- [ ] Settings UI: `booking_walkin_enabled` switch (default ON).
- [ ] Tests: `backend/tests/test_admin_bookings_walkin.py` (create ok, toggle OFF → 403, double-submit same slot → one 409 SlotFull, contact edit ok, terminal-guard intact). Vitest for dialog validation (BE date parse, phone optional).
- [ ] Validate: `python -m pytest tests/test_admin_bookings_walkin.py backend/tests/test_booking*.py`, `npm run test:unit`, `npm run build`.

## Phase 2 — Search / filter / pagination UI
- [ ] Backend: `q` param on `GET /admin/bookings` (ilike contact_name/phone_number/queue_number, wildcard-escaped, same helper style as `admin_requests.py:265-323`). No toggle (pure UI completion).
- [ ] Frontend: search box (debounced like requests page), service-type dropdown from settings, prev/next pagination. Empty-state Thai text.
- [ ] Tests: backend `q` matches + escape (`%` literal); Vitest search wiring.
- [ ] Validate: pytest booking files, `npm run test:unit`, build.

## Phase 3 — Month calendar view (admin)
- [ ] Frontend only: month grid reusing `CalendarPickerTH` month nav; day fullness via existing `GET /liff/bookings/availability/range` (staff-callable? else add `GET /admin/bookings/availability/range` thin wrapper); click day → set list filter. Toggle `booking_calendar_enabled` (default ON) hides the tab.
- [ ] Backend (only if LIFF range route rejects staff tokens): thin admin wrapper route, same service call.
- [ ] Tests: Vitest month render + day-click filter; Playwright `bookings-calendar.spec.ts` (chromium-only).
- [ ] Validate: `npm run test:unit`, `npm run test:e2e` (calendar spec), build.

## Phase 4 — Reminder status + resend
- [ ] Backend: `POST /admin/bookings/{id}/remind` (staff gate, toggle `booking_resend_enabled`; CONFIRMED only else 409; per-booking idempotency: skip if a send occurred < 60s ago → 429 Thai message; sends via LINE push in this phase, extended to the email channel rule in Phase 6; audit `resend_booking_reminder`).
- [ ] Frontend: `reminder_sent_at` Thai-datetime column ("ยังไม่เคยเตือน" fallback); resend button with confirm; hidden when toggle OFF.
- [ ] Tests: resend ok, second immediate resend → 429, CANCELLED → 409, toggle OFF → 403.
- [ ] Validate: pytest, test:unit, build.

## Phase 5 — Staff assignment
- [ ] Backend: migration add `bookings.assigned_staff_id` nullable FK users(id, ON DELETE SET NULL) + explicit index name; PATCH assignment (gate `can_assign` semantics like requests); `unassigned_only` filter on list. Toggle `booking_assign_enabled` (default OFF until staff mapping ready).
- [ ] Frontend: assignee column + `AssignModal` reuse + unassigned filter chip.
- [ ] Tests: assign/unassign, toggle OFF → 403 + UI hidden, migration upgrade/downgrade on scratch DB.
- [ ] Validate: alembic upgrade/downgrade, pytest, test:unit, build.

## Phase 6 — Email channel (quota saver)
- [ ] Backend: `Booking.email` nullable column + migration; `BookingEmailIn` validation (optional, RFC-ish regex, max 254); SMTP sender module `booking_email.py` (stdlib smtplib, env `SMTP_*`, Thai subject/body templates for confirm + reminder, best-effort bool, ERROR log); channel rule in create/reminder/resend paths: email present → email instead of push; blank → push as today. Toggle `booking_email_enabled` (default ON).
- [ ] Frontend LIFF: optional email field in contact step (zod email optional, Thai hint "ใส่ไว้รับเตือนทางอีเมล ไม่เปลืองโควต้า LINE"); admin row shows channel badge (LINE/อีเมล).
- [ ] Tests: channel rule matrix (email→no push call, blank→push), bad email → 422, SMTP down → booking still commits (best-effort), template renders BE date `19/8/2569` style.
- [ ] Validate: pytest, test:unit, build. Manual: real SMTP sandbox send once.

## Close-out (every phase)
- [ ] `no-comments` review on touched files; reviewer triage on rule-table items.
- [ ] Phase summary to operator in Thai (user-visible changes first).
- [ ] Commit per phase on `feat/booking-full-option`; push + PR after Phase 6 (single PR, phased commits). Secrets: verify by counts only.
