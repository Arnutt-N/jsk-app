# PRD — Booking Full-Option (admin queue management, 5 gaps + feature toggles)

## Problem
The admin booking page (`frontend/app/admin/bookings/page.tsx`) is a read-only
check-in counter: list by day, filter by status, set terminal status. Counter
staff cannot create walk-in bookings, edit contact info, search by name/phone/
queue number, see a month calendar, see reminder state, resend reminders, or
assign a case to a staff member. Backend already supports most of the data
operations (filter params, slot engine, advisory locks, scheduler); the admin
surface does not expose them.

## Users
Counter staff (staff role) serving citizens, many elderly, some without LINE.
Admins who configure booking in `/admin/settings/booking`.

## Quota analysis (LINE, verified 2026-10-19 in code)
- Quota-consuming (push): `notify_booking_confirmed` + `send_booking_reminder`
  (`booking_notifications.py` via `line_service.push_messages`). Cost today = 2 pushes
  per booking. Free plan ~500 msgs/month целиком covers ~250 bookings/month.
- FREE already: history-via-chat (`handle_check_booking` in
  `message_intake/commands.py` uses `reply_flex`, costs zero quota). LIFF
  in-app history view costs zero (no message sent at all).
- Cannot use reply for: scheduled reminders (no webhook event, no reply token
  exists at send time) and post-LIFF-booking confirmation (LIFF submit is an
  HTTP API call, no reply token). These MUST be push or email.

## Scope (7 items, phased)
1. **Walk-in create + contact edit (admin).** `POST /admin/bookings` reusing
   `create_booking()` (lock + queue number free). Extend `PATCH` to edit
   contact/note like LIFF `update_booking_contact`. Frontend: "เพิ่มคิวนอก"
   button + edit dialog on `/admin/bookings`.
2. **Search / filter / pagination UI.** Backend: add `q` (ilike on
   contact_name/phone_number/queue_number, escaped like `admin_requests.py`).
   Frontend: search box + service-type dropdown (API already accepts
   `service_type`) + pagination controls (API already accepts limit/offset).
3. **Month calendar view (admin).** Reuse `CalendarPickerTH` (month picker) +
   `GET /liff/bookings/availability/range` fullness coloring + existing day
   list below. Read-only calendar, no drag-drop.
4. **Reminder status + resend.** Show `reminder_sent_at` per row (Thai
   datetime). "ส่งเตือนซ้ำ" button per CONFIRMED row calling a new
   `POST /admin/bookings/{id}/remind` (rate-limited, audit-logged). Keeps the
   at-most-once scheduler untouched; resend is an explicit staff action.
5. **Staff assignment on Booking.** Add `assigned_staff_id` (nullable FK to
   users) + migration + `AssignModal` reuse on bookings page + filter
   "unassigned". Mirrors `service_requests` assignment (no workflow guards;
   booking has no state machine beyond terminal statuses).
6. **Feature toggles in system menu.** Each of items 1–5 and 7 gets an on/off
   switch on the existing settings page (`/admin/settings/booking`), stored as
   `system_settings` booleans following the existing `KEY_*` pattern
   (`booking_settings.py`). Disabled feature hides its UI entry points AND is
   enforced backend (403 with Thai message). Default: ON for items 1–4 if the
   user confirms, OFF for item 5 until staff mapping is ready — decided at
   review, recorded here before implementation.
7. **Notification channels: email opt-in (quota saver).** LIFF booking contact
   step gains an optional email field ("want reminders by email"). If given:
   confirmation + reminders go by EMAIL instead of LINE push (saves 2 quota
   per booking). If blank: LINE push as today. New SMTP email infra
   (env config + Thai templates + background send, best-effort like LINE
   push). Resend (item 4) follows the same channel preference. No change to
   the free reply-based history path.

## Non-goals
No confirm-before-visit button (separate feature). No waitlist. No overbooking.
No change to scheduler at-most-once semantics. No Kanban drag-drop. No change
to ServiceRequest flow. No Telegram CE-date fix (one-line follow-up, separate).

## Acceptance
- Counter staff can create a walk-in booking for today and edit a phone number
  without leaving `/admin/bookings`.
- Search by name/phone/queue number returns within the current page set;
  service-type dropdown and prev/next work.
- Month view shows day fullness colors; clicking a day filters the list.
- Each row shows reminder state in Thai; resend delivers a LINE bubble and is
  audit-logged; double-click cannot double-send (idempotent per minute).
- Assigned staff shows on the row; unassigned filter works; permission
  `can_assign` gates the control like requests.
- With a toggle OFF: button/hidden UI gone AND direct API call rejected.
- `python -m pytest` (booking-related) + `npm run test:unit` +
  `npm run build` pass after each phase.
