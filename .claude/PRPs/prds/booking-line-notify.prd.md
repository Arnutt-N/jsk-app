# PRD — Booking LINE Notification Toggle + Quota Visibility + Email Config Audit

> Branch: `feat/booking-line-notify` · Date: 2026-10-21 · Author: Pi

## 1. Problem (why)

- Booking confirmations/reminders are sent over **two channels**: LINE push
  (Flex bubble, consumes LINE push-message quota) and email (SMTP).
- Today LINE push has **no on/off switch** — it fires whenever a raw LINE id
  resolves. Email has a switch (`email_enabled`, default OFF).
- Operator reports push quota is now sufficient and wants LINE notifications
  explicitly manageable from the settings menu, plus a quota readout so staff
  can see consumption before it runs out.
- Operator also asked: does the email toggle exist, and is its config format
  appropriate? (Answered in §2.)

## 2. Audit of the current email config (answer to the operator)

**The email toggle EXISTS and its format is GOOD — keep it as the template.**

| Aspect | State | Verdict |
|---|---|---|
| Setting key | `booking_email_enabled` in `system_settings` (free-text `true`/`false`) | Good — consistent with all other booking keys |
| Typed config | `BookingConfig.email_enabled: bool = False` (fail-closed default) | Good |
| Read path | `_coalesce(..., _parse_bool, default)` — typo degrades to default, never raises | Good |
| Write path | `save_booking_config` canonicalizes to `true`/`false` + invalidates cache | Good |
| API schema | `BookingSettingsIn.email_enabled: Optional[bool] = None` — **None = "not sent", keeps stored value**; a stale client that omits the field can never flip the channel | Exemplary — copy this for LINE |
| Enforcement | 422 when `payload.email` supplied while toggle OFF (`admin_bookings` walk-in + contact-update, `liff_bookings` create + update); LIFF `/options` exposes `email_enabled` so the client hides the email field | Good, complete |
| Settings UI | Toggle "รับการยืนยันและเตือนทางอีเมล" with helper "ปิดไว้ช่องกรอกอีเมลจะหาย…กลับไปทาง LINE ทั้งหมด" | Good |
| Routing | `_email_channel()` → if enabled + address present, try email **first**; on success `return True` (**LINE skipped**); on failure fall through to LINE | ⚠️ **Exclusive-or routing — the one thing to revisit** (see §3 decision D1) |

## 3. Decisions required (operator approval gates)

- **D1 — Channel routing when both toggles are ON and an email address exists:**
  (R) **Independent sends** — attempt LINE (if `line_enabled`) AND email
  (if `email_enabled` + address) independently; overall success = any channel
  succeeded. Rationale: operator explicitly wants LINE delivery ("รองรับ line
  เพิ่ม"); the current exclusive-or silently drops the LINE bubble exactly when
  email works. Cost: up to 2 sends per booking event (quota impact mitigated by
  the new toggle + quota readout). Alternative: keep exclusive-or (email wins) —
  cheaper but contradicts the request.
- **D2 — `line_enabled` default:** ~~(R) **ON (`True`)** — preserves today's
  behavior (LINE always attempted); operator turns it OFF only to save quota.~~
  **Decided 2026-10-21: OFF (`False`)** — operator wants explicit opt-in.
  ⚠️ Rollout consequence: existing prod DB has no `booking_line_enabled` row,
  so after deploy LINE booking pushes PAUSE until an admin flips the toggle
  ON in the settings menu (email channel unaffected). Post-deploy step added
  to the plan.
- **D3 — Quota readout scope:** (R) **Read-only display** on the booking
  settings page (quota / used / remaining via SDK `get_message_quota` +
  `get_message_quota_consumption`, cached ~5 min, fail-open blank on error).
  No auto-cutoff when quota runs low (out of scope; toggle is the control).

## 4. Requirements

1. **R1 — `line_enabled` setting (backend):** new key `booking_line_enabled`,
   `BookingConfig.line_enabled: bool = False` (decided default OFF 2026-10-21), `_read`/`save` via the same
   `_coalesce`/`canonical` pattern, included in `ALL_KEYS` + `DEFAULTS`.
2. **R2 — API schemas:** `BookingSettingsIn.email_enabled`-style
   `line_enabled: Optional[bool] = None` sentinel; `BookingSettingsOut`
   inherits; `BookingOptionsOut` exposes `line_enabled: bool` for LIFF/admin
   clients (informational; LIFF needs no UI change).
3. **R3 — Enforcement:** `_push_flex()` in `booking_notifications.py` returns
   `False` (skip, logged) when `line_enabled` is OFF — this single choke point
   covers confirm, reminder, and resend paths. Settings PUT keeps stored value
   when field omitted (same `payload.x if not None else stored.x` pattern).
4. **R4 — Settings UI:** new toggle section "แจ้งเตือนทาง LINE" with helper
   text (Thai): ON = ส่งยืนยัน/เตือนเป็นฟองข้อความใน LINE (ใช้โควต้าพุช);
   OFF = ไม่ส่ง LINE, เหลือเฉพาะอีเมล (ถ้าเปิดไว้). Placed directly above the
   email toggle so both channel switches sit together.
5. **R5 — Quota endpoint:** `GET /api/v1/admin/bookings/line-quota`
   (staff-readable, admin…? — R: same gate as booking settings GET) returns
   `{quota, consumption, remaining}`; short server-side cache (~5 min);
   never raises to the client (upstream failure → 502 with Thai detail, per
   codebase precedent; display treats error as blank).
6. **R6 — Quota display:** booking settings page shows "โควต้า LINE คงเหลือ
   X / Y" with refresh; fail-open (hidden/blank on error, never blocks save).
7. **R7 — Email config:** NO schema/key changes (audit verdict: appropriate).
   Only its helper text stays accurate under D1 (both channels can fire).

## 5. Non-goals

- No auto-disable when quota is low; no per-service/per-user channel prefs.
- No LINE narrowcast/broadcast changes (1:1 push only, as today).
- No SMTP changes; live mail test still awaits the sandbox (prior handoff).
- No migration (additive `system_settings` row only, same as every toggle).

## 6. Acceptance criteria

- AC1: Fresh DB → `line_enabled` reads `False`; malformed value → `False`.
- AC2: `line_enabled=false` → confirm + reminder + resend skip LINE push
  (no `push_message` call), logged; email still sent when enabled.
- AC3: Both ON + address present → both attempted (D1); LINE success recorded
  even when email succeeds.
- AC4: Stale PUT omitting `line_enabled` keeps stored value (no flip).
- AC5: Quota endpoint returns numbers matching LINE OA console; SDK/outage
  failure → 502 Thai detail, UI stays usable.
- AC6: Backend suite + frontend suite + `tsc` + `eslint` + `next build` green;
  new TDD tests for R1–R3 (toggle parse/default/enforcement × confirm/remind).

## 7. Risks

- **Double-send cost (D1):** each booking event may consume 1 push + 1 email.
  Mitigated by toggles + visible quota. Flagged, operator-accepted.
- **Quota staleness:** 5-min cache means display can lag real usage; acceptable
  for an informational readout (documented in helper text).
