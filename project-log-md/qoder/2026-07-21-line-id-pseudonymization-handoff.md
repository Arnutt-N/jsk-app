# Handoff: LINE ID Pseudonymization (Approach 4A) — 2026-07-21

**Agent:** Qoder  
**Session:** PR A → PR B → Prod rollout (dual mode live)  
**Branch:** `main` (both PRs merged)

---

## What Was Done

### PR A — Expand Phase (merged #153, squash `efe16f0`)

Added pseudonymization infrastructure, dark-shipped behind `LINE_ID_STORAGE_MODE=plaintext`:

- **Config:** `LINE_ID_STORAGE_MODE` (plaintext|dual|pseudonym) + `LINE_ID_HMAC_KEY` + prod guard
- **Models:** `line_user_id_hash` (String 64, unique), `line_user_id_encrypted` (Text), `line_key_version` (Integer) on `users`; `user_id` FK (Integer, nullable, indexed) on 6 child tables
- **Migration:** `b3c4d5e6f7g8` (additive, idempotent column-existence guards)
- **Service:** `backend/app/services/user_identity_service.py` — `resolve_by_line_id`, `populate_surrogate`, `decrypt_line_id_for_user`, `line_id_hash`, `child_filter`
- **Credential helpers:** `credential_service.encrypt_line_id()` / `decrypt_line_id()`
- **Dual-write:** webhook `save_message`×3, handoff `ChatSession`, CSAT `record_response`, friend `handle_follow`/`handle_unfollow`
- **Outbound:** `resolve_raw_for_push` helper in `line_service.py`
- **Tests:** `tests/test_user_identity.py` (11 cases)
- **Docs:** `docs/remediation/migration-controls.md` updated

### PR B — Migrate Phase (merged #154, squash `196305b`)

- **Backfill script:** `backend/scripts/backfill_line_id_pseudonym.py` (batched, idempotent, pre-flight duplicate session detection, validation summary)
- **Mode-aware reads:** `resolve_by_line_id` skips plaintext fallback in `pseudonym` mode; `child_filter` returns `user_id` FK clause in pseudonym mode
- **Pattern applied:** `get_active_session` accepts optional `user_id`, uses `child_filter`
- **Tests:** 5 new cases (16 total in test_user_identity.py)
- **Docs:** PR B flip checklist added to migration-controls.md

### Prod Rollout (completed this session)

1. **Deploy:** Set `LINE_ID_STORAGE_MODE=dual` + `LINE_ID_HMAC_KEY` on Koyeb via API (service `ca890ca2-8a75-4acb-a5fe-cfbdd6d81987`)
2. **Backfill:** Ran against prod Supabase DB — 0 users remaining NULL hash, child FKs populated
3. **Verify:** `/api/v1/health` → `{"database":true,"redis":true,"status":"healthy"}`

---

## Current Prod State

| Setting | Value |
|---------|-------|
| `LINE_ID_STORAGE_MODE` | `dual` |
| `LINE_ID_HMAC_KEY` | Set (see `secrets/secret-keys.txt` — NOT in git) |
| Identity resolution | Hash-first, plaintext fallback for stragglers |
| Dual-write | Active on all webhook ingress paths |

### Remaining NULL user_id (expected, no LINE user):
- `messages`: 2 (system/admin messages)
- `service_requests`: 10 (admin-created requests)

---

## What's Next

### PR C — Contract Phase (after 3-5 days observation)

Gate: zero `resolve_by_line_id` plaintext fallback hits in logs for 3-5 consecutive days.

Tasks:
1. Full read cutover: switch remaining ~50 query paths from `line_user_id` to `user_id`/hash (use `child_filter` pattern from `get_active_session`)
2. API response serialization: return `line_user_id` via `decrypt_line_id_for_user` join
3. Migration: drop `line_user_id` column on 7 tables, recreate indexes on `user_id`
4. Remove dual-write code, remove legacy fallback in identity service
5. Set `LINE_ID_STORAGE_MODE=pseudonym`

### Key files for PR C:
- `services/live_chat_service/conversations.py` (inbox listing, search, pagination)
- `services/live_chat_service/unread.py` (batch unread counts)
- `services/analytics_service.py` (FCR rate, funnel)
- `api/v1/endpoints/admin_reports.py` (operator stats, CSV export)
- `api/v1/endpoints/admin_export.py` (conversation CSV/PDF)
- `services/friend_service.py` (friend stats, event listing)
- `services/rich_menu_service.py` (per-user links)

### Rollback (if needed now):
```
Koyeb Dashboard → Service → Environment → LINE_ID_STORAGE_MODE = plaintext → Save
```
Dual-write continues populating both paths; no data loss.

---

## HMAC Key Warning

The `LINE_ID_HMAC_KEY` is **irreversible** — changing it invalidates ALL existing hashes and requires a full re-backfill. The key is stored in:
- Koyeb env vars (prod)
- `D:\genAI\jsk-app\secrets\secret-keys.txt` (local reference, NOT in git)

---

## Other Completed This Session

- PR #152 (P1.1b frontend page cleanup) was already merged before this session
- Cookie auth (`COOKIE_AUTH_MODE=dual`) rollout still deferred — user runs manually (see PROJECT_STATUS.md Backlog)

---

## Test Baseline

```
tests/test_user_identity.py: 16 passed
tests/test_friend_service.py: all passed
tests/test_config_production_guards.py: all passed
tests/test_live_chat_service.py: all passed (74 total across 4 files)
```
