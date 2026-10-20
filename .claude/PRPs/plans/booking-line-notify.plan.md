# Plan — Booking LINE Notification Toggle + Quota Visibility

> PRD: `.claude/PRPs/prds/booking-line-notify.prd.md` · Branch: `feat/booking-line-notify`
> Gated on operator approval of D1/D2/D3 before implementation.

## Phase 0 — Approval gate (no code)

- Operator approves D1 (independent sends), D2 (default ON), D3 (read-only
  quota display), or picks alternatives → amend PRD §3/§4 first.

## Phase 1 — Backend setting + schemas (TDD)

1. `backend/app/services/booking_service.py` — add `line_enabled: bool = False`
   to `BookingConfig` (decided default OFF 2026-10-21; comment notes the
   rollout consequence: LINE pushes pause until the admin flips it ON).
2. `backend/app/services/booking_settings.py` — add `KEY_LINE_ENABLED =
   "booking_line_enabled"`, extend `ALL_KEYS`, `DEFAULTS`, `_read_booking_config`
   (`_coalesce` + `_parse_bool`), `save_booking_config` canonical write.
3. `backend/app/schemas/booking.py` — `BookingSettingsIn.line_enabled:
   Optional[bool] = None` (+ keep-stored comment); `BookingOptionsOut.line_enabled: bool`.
4. Endpoints `admin_bookings.py` (`get_booking_settings`,
   `update_booking_settings` with the `payload.x if not None else stored.x`
   pattern) + `liff_bookings.py` (`get_booking_options`).
5. Tests first: default-true on fresh/blank/malformed value; save round-trip;
   PUT-omitted-keeps-stored; options exposure. Mirror
   `tests/test_admin_bookings_email.py` structure.

## Phase 2 — Routing enforcement (D1)

6. `backend/app/services/booking_notifications.py`:
   - Add `_line_channel(db)` → `config.line_enabled`.
   - `_push_flex()` returns `False` early (logged skip) when OFF.
   - `notify_booking_confirmed` / `send_booking_reminder`: attempt each
     enabled channel independently; return `any(succeeded)`.
7. Tests: matrix — line off/email on (no push call, email sent); both on
   (both attempted); both off (both skipped, returns False); line on/email
   off (push only, unchanged behavior).

## Phase 3 — Quota endpoint

8. `LineService` — add `get_push_quota()` wrapping SDK `get_message_quota` +
   `get_message_quota_consumption` through `_call_with_circuit`, returning
   `{quota, consumption, remaining}`; pure read, no state change.
9. New `GET /api/v1/admin/bookings/line-quota` (same auth gate as booking
   settings GET) with ~5-min in-memory cache; upstream failure → 502 Thai
   detail; response schema `LineQuotaOut`.
10. Tests: happy path (mocked SDK), cache hit (single SDK call for two HTTP
    hits), failure → 502.

## Phase 4 — Frontend settings page

11. `frontend/lib/booking.ts` — extend `BookingSettings` with
    `line_enabled?: boolean`, add `fetchLineQuota()` typed helper.
12. `frontend/app/admin/settings/booking/page.tsx` — new "แจ้งเตือนทาง LINE"
    toggle section above the email toggle + quota readout line
    ("โควต้า LINE คงเหลือ X / Y • แตะเพื่อรีเฟรช"), fail-open on quota error.
13. Tests: toggle renders/updates/saves (mirror email toggle tests); quota
    line shows numbers, hides on error; omitted-field payload keeps stored
    value (no accidental flip).

## Phase 5 — Ship

14. Full gates: `pytest` (backend), `vitest` + `tsc` + `eslint` + `next build`
    (frontend). Then self-review (standards + spec axes) → commit →
    push → PR → CI green → merge → CD watch + quota endpoint smoke on prod.

## Validation (per phase)

- Phase 1: new settings tests green; existing email tests untouched & passing.
- Phase 2: routing-matrix tests green; no `push_message` mock call when OFF.
- Phase 3: endpoint tests green; real shape verified against SDK types.
- Phase 4: component tests green; manual: toggle both channels, save, reload
  persists; quota number matches LINE OA console.
- Phase 5: CI 4/4 + CD success; post-merge prod smoke (settings GET 200,
  quota GET 200 with numbers).

## Rollback

- Default is OFF by operator decision, so a rollback = revert merge; no
  migration to unwind (settings rows inert). Note this default does NOT
  preserve today's behavior on existing DBs (no stored row → reads False →
  LINE pauses) — post-deploy the admin MUST flip the toggle ON (Phase 5
  smoke step) or booking LINE pushes stay paused.
