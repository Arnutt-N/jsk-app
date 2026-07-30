# Session Summary — qoder — 2026-07-30T11:15:00+07:00

**Branch**: `main`  **HEAD**: `a34c080`
**Checkpoint**: `.agents/state/checkpoints/handover-qoder-20260730-1115.json`

## Objective
Verify the PR C pseudonym gate on production (day ~2 of the 3-5 day window) and act on the result.
The gate turned out to be failing, so the session became: diagnose the root cause, repair
production, and ship the code fix that prevents a recurrence.

## Completed

### 1. Gate verification — found FAIL, not pass
First authenticated read of `GET /api/v1/health/pseudonym-gate` returned:

```
gate_status: fail | fallback_hit_count: 176 (redis) | first_hit_at: 2026-07-28T08:16:46Z
```

Reading it took three attempts — worth knowing for next time:
- Bare `curl` to the Koyeb host → 401 (endpoint is admin-only).
- `Authorization: Bearer localStorage.auth_token` → 401. The frontend migrated to **cookie
  auth**; `auth_token` in localStorage is a legacy key that `AuthContext` now clears.
- What works: from a logged-in admin tab, `fetch('/api/v1/health/pseudonym-gate', { credentials: 'include' })`
  — relative path so the same-origin proxy forwards the cookie. Or `curl` with a cookie jar
  after `POST /api/v1/auth/login` (seed admin credentials).

### 2. Root cause (verified read-only against prod DB)
| Check | Result |
| --- | --- |
| `users` with plaintext but NULL hash | 0 |
| Hashes matching the Koyeb `LINE_ID_HMAC_KEY` | 2 of 8 (ids 2, 3) |
| Hashes matching the dev fallback key | **6 of 8 (ids 1, 5, 6, 7, 8, 9)** |
| `line_user_id_encrypted` decryptable with prod `ENCRYPTION_KEY` | 8 of 8 |

Two defects combined:
- **`_get_hmac_key` silently fell back to the dev key.** It only checked `is_production_like`,
  but `ENVIRONMENT` and `DATABASE_URL` are independent — a development-configured process
  aimed at the remote DB (the `export DATABASE_URL=…` pattern used for `seed_admin.py`) wrote
  dev-key hashes into production with no warning. `enforce_production_guards()` never fired
  because `ENVIRONMENT` itself was `development`.
- **`resolve_many_by_line_id` counted hits without repairing rows.** `resolve_by_line_id`
  lazily backfills surrogates, which is why ids 2 and 3 self-healed when those users messaged
  the bot. The batch path (friends list, rich-menu links, unread counts) only incremented the
  counter, so the same six rows were re-counted on every admin poll — 176 hits — and would
  never converge.

The Koyeb env var was read via the control-plane API (`GET /v1/deployments/<id>`) using the
token in the secrets file; the key was written to a gitignored temp file, used, then deleted.
Note the earlier claim that `api.koyeb.com` is DNS-blocked on this machine — `app.koyeb.com/v1`
works fine.

### 3. Production repair (user-approved, both writes)
- Re-hashed `users.id` 1,5,6,7,8,9 with the correct key; re-verified all 8 rows match.
  `line_user_id_encrypted` was already correct, so it was left untouched.
- Deleted `pseudonym_gate:fallback_hits` (176) and `pseudonym_gate:first_hit_at` on Upstash.
- Re-read the gate → `pass` / `0`. Then exercised `/admin/friends` (the batch-resolver path
  that had been generating the hits) and re-read → still `pass` / `0`.

### 4. PR #175 — hardening (merged, squash `a34c080`)
- `Settings.is_remote_database` (`app/core/config.py:139`) — host allowlist
  (`localhost`, `127.0.0.1`, `::1`, docker `db`); `PostgresDsn` is a **multi-host** URL so it
  reads `.hosts()`, not `.host`, and pydantic keeps IPv6 brackets (`[::1]`) so they are stripped.
- `_get_hmac_key` now refuses the dev fallback when the target DB is remote and no key is set.
  Local development is unchanged; a configured key always wins.
- `resolve_many_by_line_id` backfills surrogates behind a per-row savepoint, mirroring
  `resolve_by_line_id`; an `IntegrityError` degrades to the old count-only behaviour.
- The backfill script inherits the guard for free — it hashes through the same helper.
- 12 new tests; backend suite **794 passed, 1 skipped** (baseline 771). CI all green.
- PRD + PRP: `docs/remediation/pseudonym-gate-hardening-prd-prp.md`.

Verified the guard against the exact failure scenario: `ENVIRONMENT=development` plus an
exported remote `DATABASE_URL` now aborts naming `LINE_ID_HMAC_KEY`, while the local env file
still resolves via the dev fallback.

## Next Steps
- Re-read `GET /api/v1/health/pseudonym-gate` after the Koyeb CD deploy of `a34c080` to confirm
  `pass` / `0` is unaffected by the hardening.
- **Gate clock restarted 2026-07-30** (the 176 hits were real misses, so the earlier window is
  void) — need `gate_status: pass` + `fallback_hit_count: 0` through ~2026-08-04.
- Then write PRD + PRP for the PR C destructive phase: drop `line_user_id` on 7 tables, remove
  dual-write, flip `LINE_ID_STORAGE_MODE=pseudonym`.
- Consider auditing other scripts that write identity columns for the same dev-key exposure
  (listed as follow-up in the PRD).
- Unrelated quick wins still open: `SLA_ALERT_TELEGRAM_ENABLED=true` on Koyeb, rich-menu
  Task 6.2 prod smoke, `COOKIE_AUTH_MODE` effective-mode check.

## Blockers
- _none_

## Notes for the next agent
- Backend must run with `backend/venv/Scripts/python.exe` — the system Python is too old for
  `X | None` syntax.
- `backend/.env` targets the **remote** DB (`ENVIRONMENT=production`), `backend/app/.env` targets
  local. `scripts/db_target.py` switches between them via `ENV_FILE`.
- `backend/.env` still has **no `LINE_ID_HMAC_KEY`**. That is now safe (the guard aborts instead
  of using the dev key), but any future identity-writing script run against remote data needs
  the real key copied in first.
