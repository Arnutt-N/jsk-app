# PRD — Rich Menu: display settings (แสดงตลอดเวลา / ตามช่วงเวลา / ซ่อน)

Date: 2026-09-02 · Branch: `feat/rich-menu-display-schedule` · Follow-up to PR #220
Reporter: user — "ในหน้าการสร้างริชเมนู ไม่มีปุ่มให้กำหนดว่าให้แสดงริชเมนูตลอดเวลา เวลา หรือให้ซ่อน (Default behavior, Display period)"

## Problem

LINE OA Manager's rich-menu creator offers display timing (always / date range)
and default behavior; our admin create page has neither. Menus go live only via
a manual "Set Active" on the list page, and there is no way to schedule a menu
for a campaign window or to keep one synced-but-hidden for per-user/alias use.

## Goals

G1. Create + edit pages gain a **การแสดงผล** section with three modes:
   - **แสดงตลอดเวลา (ALWAYS)** — when saved with sync, the menu also becomes the
     default (live) immediately, like OA Manager's default behavior.
   - **ตามช่วงเวลา (SCHEDULED)** — display period start/end; a background task
     activates the menu (sets default) at start and reverts it at end.
   - **ซ่อน (MANUAL)** — synced but never auto-published; for per-user/alias use.
G2. The scheduler is honest: at period end it cancels the default **only if this
    menu is still the default** (another menu set as default meanwhile must not
    be silently un-published).
G3. List + edit pages show the display mode/period state (e.g. "ตามเวลา" pill
    with the period, "ซ่อน" pill) so the scheduled state isn't invisible.
G4. Validation: SCHEDULED requires start AND end; end > start; naive datetimes
    are rejected client-side (frontend sends ISO with offset, broadcast pattern).

## Non-goals

- Per-user scheduling (period applies to the default binding only).
- Changing how `status` (DRAFT/PUBLISHED/INACTIVE) is stored — the scheduler
  writes the same statuses a human would.

## Semantics

- Model columns (additive migration): `display_mode` VARCHAR(9) DEFAULT 'ALWAYS'
  ('ALWAYS' | 'SCHEDULED' | 'MANUAL'), `display_start_at`, `display_end_at`
  (timestamptz, nullable).
- ALWAYS + save-and-sync → existing publish flow runs after sync (create and
  edit pages; on edit only when not already PUBLISHED).
- SCHEDULED:
  - Activation tick: mode=SCHEDULED, start <= now, `line_rich_menu_id` present,
    status != PUBLISHED → `set_default_on_line` → status=PUBLISHED + audit log
    (admin_id=None system action, broadcast-scheduler pattern).
  - Expiry tick: mode=SCHEDULED, end <= now, status=PUBLISHED → check
    `get_default_on_line()`; if it equals this menu's LINE id →
    `cancel_default_on_line()` → status=INACTIVE + audit. Otherwise just mark
    INACTIVE (another menu owns the default now).
  - Poll every 60s (broadcast scheduler uses 30s for ±1min delivery; menu
    display has no such tolerance).
- MANUAL: nothing automatic ever.
- Existing menus default to ALWAYS → behavior unchanged until the admin picks
  another mode (AC5).

## New LINE service methods

- `get_default_on_line(db)` — GET `/user/all/richmenu` → `{"richMenuId": ...}`
  or None on 404.
- `cancel_default_on_line(db)` — DELETE `/user/all/richmenu`.

## Acceptance criteria

AC1. Create page: แสดงตลอดเวลา + Save & Sync → menu is live (default) without
     pressing Set Active; toast says so.
AC2. Create page: ตามช่วงเวลา + start/end → saved with mode SCHEDULED; before
     start nothing is live; at/after start the scheduler publishes within a
     minute; after end the default is cancelled (status INACTIVE).
AC3. ซ่อน → synced menu with no default binding; pill shows "ซ่อน".
AC4. End-of-period never cancels a default that now belongs to another menu.
AC5. Menus created before this PR behave exactly as before (default ALWAYS).
AC6. Scheduler actions are audit-logged as system actions; failures are logged
     and retried next tick (a failed activate must not wedge the menu).
AC7. Backend: full rich-menu suite + new scheduler/validation tests green.
     Frontend: vitest for mode radios, SCHEDULED inputs, publish-after-sync
     behavior; tsc/eslint/build clean; CI green.

## Test plan

Backend (`tests/test_rich_menu_display_schedule.py`):
- schema validation: SCHEDULED without start/end → 422; end <= start → 422
- create/edit persist mode+period; default mode ALWAYS (AC5)
- scheduler `_activate_due`: due menu → set_default + PUBLISHED + audit;
  not-yet-due / already PUBLISHED / no line id → untouched
- scheduler `_expire_due`: still-default → cancel + INACTIVE; default moved to
  another menu → INACTIVE only, cancel NOT called (AC4)
- service: get_default 404 → None; cancel maps errors like set_default

Frontend (create page `__tests__`):
- radio group renders 3 modes; SCHEDULED reveals two datetime-local inputs
- ALWAYS + save&sync issues create→upload→sync→publish in order
- SCHEDULED payload carries display_mode/start/end (ISO strings)

Gates: full pytest (websocket files excluded locally), vitest, tsc, eslint,
next build, CI (Pytest/Lint+Build/Playwright).
