# Session Summary — qoder — 2026-07-25T19:56:00+07:00

**Branch**: `main`  **HEAD**: `5862c2e`
**Checkpoint**: `.agents/state/checkpoints/handover-qoder-20260725-1956.json`

## Objective
Fix the admin login-redirect bug (success toast but no redirect to /admin), get the
full test suite green, and prepare the PR C (LINE ID Pseudonymization contract phase)
gate with prod observability.

## Completed
- **Login-redirect bug — ROOT CAUSE + FIX**: DB migration `b3c4d5e6f7g8` (LINE ID
  pseudonymization expand) was never applied to the local DB. The `users` table was
  missing `line_user_id_hash`/`line_user_id_encrypted`/`line_key_version`, so
  `GET /auth/me` 500'd (UndefinedColumnError) and `/admin` bounced back to `/login`.
  Fixed via `alembic upgrade head` (a2b3c4d5e6f7 → b3c4d5e6f7g8). Not a code bug.
- **Test suite green**: Fixed 6 failures + 53 fixture errors. All **752 backend**
  (pytest) + **409 frontend** (vitest) tests pass.
  - `test_config_migration_controls.py`: assert PR 2C hardened defaults
    (`LIFF_STRICT_MODE=True`, `COOKIE_AUTH_MODE="cookie"`).
  - `test_user_identity.py`: added `_make_begin_nested_mock()` async-CM helper for 3
    tests; corrected `rollback` → `expire` assertion to match production code.
  - `test_rich_menu_peruser_endpoints.py`: mock returns row objects
    (`SimpleNamespace(line_user_id, id)`) not plain strings.
  - `test_admin_audit_endpoints.py`: pass `BulkIdsRequest(ids=ids)` not a raw dict.
- **PR C gate observability** (commit `5862c2e`): added `logger.warning`
  `line_id_plaintext_fallback_hit` in `resolve_by_line_id` so we can confirm zero
  plaintext-fallback hits before dropping the column.
- Committed test fixes (`ddb1456`) + session summary (`450e648`), pushed to `main`.

## Next Steps
- **Check Koyeb prod logs** for `line_id_plaintext_fallback_hit` hits. Gate: zero hits
  for 3-5 consecutive days (prod has been in `dual` mode since 2026-07-21). No Koyeb
  CLI installed locally — user must check the dashboard or install the CLI.
- **Start PR C read-cutover-only phase** (safe, additive — does NOT drop the plaintext
  column): convert ~50 query paths from `line_user_id` to `user_id`/hash using the
  `child_filter` pattern. Scope (13 files):
  - `tasks/session_cleanup.py` (88, 136)
  - `api/v1/endpoints/rich_menus.py` (186-203, 211-219, 301)
  - `services/rich_menu_service.py` (32-54)
  - `services/analytics_service.py` (149, 168, 193, 209, 336, 339)
  - `services/line_service.py` (226-267, 426-437)
  - `services/csat_service.py` (115), `services/handoff_service.py` (122, 125, 132)
  - Already migrated (reference pattern): `webhook.py:673`, `live_chat_service/sessions.py:254`
- **PR C full scope** (after read-cutover + gate): API serialization via
  `decrypt_line_id_for_user`, migration to drop `line_user_id` on 7 tables, remove
  dual-write code, flip `LINE_ID_STORAGE_MODE=pseudonym`.

## Blockers
- Cannot query Koyeb prod logs locally (no CLI). Needs user action to verify the
  plaintext-fallback gate before the destructive column-drop step.

## Notes
- Dev runs in WSL (`backend/venv_linux`, Python 3.13). Frontend is faster on the
  Windows side (`/mnt/d` I/O bottleneck in WSL); used port 3001 (3000 taken by
  huangua-works). Use `cmd //c "taskkill /PID ... /F /T"` — Git bash mangles `/PID`.
- Handoff ref: `project-log-md/qoder/2026-07-21-line-id-pseudonymization-handoff.md`.

> Fill in detail above, then commit. TASK_LOG.md + SESSION_INDEX.md are generated.
