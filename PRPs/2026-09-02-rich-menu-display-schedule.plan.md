# PRP — Rich Menu display settings + scheduler

PRD: `PRPs/2026-09-02-rich-menu-display-schedule.prd.md` · Branch: `feat/rich-menu-display-schedule`

## Phases

### Phase 1 — Backend model + migration

1. `app/models/rich_menu.py`: `RichMenuDisplayMode` enum (ALWAYS/SCHEDULED/MANUAL)
   stored as VARCHAR(9) (same pattern as `status`); columns `display_mode`
   (default 'ALWAYS'), `display_start_at`, `display_end_at` (DateTime tz, nullable).
2. Alembic additive revision (3 columns; no data backfill needed — server
   default covers existing rows).

### Phase 2 — Backend schema + endpoints

1. `schemas/rich_menu.py`: `RichMenuCreate`/`RichMenuUpdate` gain optional
   `display_mode`, `display_start_at`, `display_end_at`; shared validator
   (SCHEDULED ⇒ both times, end > start). `RichMenuResponse` gains the three.
2. `endpoints/rich_menus.py`: create/update persist the fields (update: mode
   may change; changing away from SCHEDULED clears nothing — the scheduler only
   acts on SCHEDULED rows).

### Phase 3 — Backend scheduler + LINE methods

1. `rich_menu_service.py`: `get_default_on_line`, `cancel_default_on_line`.
2. `app/tasks/rich_menu_display_scheduler.py`: copy the broadcast-scheduler
   skeleton (asyncio loop, start/stop, per-item try/except + rollback); 60s
   interval; `_activate_due` + `_expire_due` with audit logs
   (`rich_menu_auto_publish` / `rich_menu_auto_unpublish`, admin_id=None).
3. `app/main.py` lifespan: start/stop alongside the broadcast scheduler.

### Phase 4 — Frontend

1. Create page: "การแสดงผล" card (radio 3 modes; datetime-local ×2 when
   SCHEDULED; hint text per mode). Save&Sync: ALWAYS → after successful sync
   also POST publish; SCHEDULED/MANUAL → sync only. Payload carries the mode
   (+ISO datetimes via `toISOString()`, broadcast pattern).
2. Edit page: same card bound to the menu's saved values; บันทึกและซิงค์ +
   ALWAYS + not PUBLISHED → publish after sync.
3. List page: status pill shows "ตามเวลา" (with period tooltip) for
   SCHEDULED-not-yet-active and "ซ่อน" for MANUAL+synced; keep existing states.

### Phase 5 — Tests + gates + ship

Per PRD §Test plan; full local gates; commit; push; PR; CI green; merge.

## Risks / notes

- Double-publish guard: activation requires status != PUBLISHED and the
  scheduler is single-process (same assumption as the broadcast scheduler).
- `get_default_on_line` failure at expiry → log + retry next tick (menu stays
  PUBLISHED; no data corruption).
- Migration is additive + server-defaulted → safe rollback path (drop columns).
