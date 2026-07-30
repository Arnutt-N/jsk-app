# PRD + PRP — Pseudonym Gate Hardening

**Branch:** `fix/pseudonym-gate-hardening`
**Date:** 2026-07-30
**Trigger:** PR C gate read `gate_status: fail`, `fallback_hit_count: 176` on production (first hit 2026-07-28 08:16 UTC).

---

## Part 1 — PRD

### Problem

Six of eight production LINE users (`users.id` 1, 5, 6, 7, 8, 9) stored a
`line_user_id_hash` computed with the **development fallback HMAC key**
(`dev_line_id_hmac_key_not_for_production`) instead of the production
`LINE_ID_HMAC_KEY` configured on Koyeb. Every hash lookup for those users missed,
so `resolve_by_line_id` / `resolve_many_by_line_id` fell through to the plaintext
column and incremented the PR C gate counter — blocking the destructive phase
indefinitely.

Verified on prod (read-only) before the fix:

| Check | Result |
| --- | --- |
| `users` with plaintext but NULL hash | 0 |
| Hashes matching Koyeb `LINE_ID_HMAC_KEY` | 2 of 8 (ids 2, 3) |
| Hashes matching dev fallback key | 6 of 8 (ids 1, 5, 6, 7, 8, 9) |
| `line_user_id_encrypted` decryptable with prod `ENCRYPTION_KEY` | 8 of 8 |

The bad rows were repaired manually on 2026-07-30 (re-hash + Redis counter reset,
gate now reads `pass`). This PRD covers the **code defects that allowed it** so it
cannot recur, plus the missing self-heal that let the miss persist for 2 days.

### Root causes

**RC1 — silent dev-key fallback when a dev-configured process writes to a remote DB.**
`_get_hmac_key()` (`app/services/user_identity_service.py:31`) returns the dev
constant whenever `settings.is_production_like` is False. `ENVIRONMENT` and
`DATABASE_URL` are independent, so a process started with a development env file
(or `ENVIRONMENT=development` plus an exported remote `DATABASE_URL` — the pattern
documented in the ops notes for `seed_admin.py`) writes dev-key hashes into the
production database with no warning. `enforce_production_guards()` only fires when
`ENVIRONMENT` itself is production-like, so it never caught this.

**RC2 — `resolve_many_by_line_id` records a gate hit but never repairs the row.**
`resolve_by_line_id` lazily backfills surrogates on a plaintext hit
(`user_identity_service.py:89-98`), so ids 2 and 3 self-healed the first time
those users messaged the bot. `resolve_many_by_line_id`
(`user_identity_service.py:161-167`) only counts the hit. The batch path serves
admin polling endpoints (friends list, rich-menu links, unread counts), so the
same six rows were re-counted on every poll — 176 hits — and would never heal.

### Goals

1. A dev-configured process must **fail loudly** instead of using the dev HMAC key
   when it is pointed at a non-local database.
2. The batch resolver must **self-heal** plaintext hits the same way the single
   resolver does, so a stale hash converges to correct on first read.
3. No behaviour change for genuine local development (localhost DB, no
   `LINE_ID_HMAC_KEY`) — the dev fallback must keep working there.

### Non-goals

- The destructive phase itself (drop `line_user_id` on 7 tables, flip
  `LINE_ID_STORAGE_MODE=pseudonym`) — separate PRD once the gate clears 3-5 days.
- Key rotation / `line_key_version` > 1 support.
- An admin endpoint to reset the gate counter (done directly against Redis).

### Success criteria

- Pointing a `development` env file at a remote `DATABASE_URL` and calling
  `line_id_hash` raises `RuntimeError` naming `LINE_ID_HMAC_KEY`.
- Local development (localhost DB, no key) still resolves via the dev fallback.
- A batch plaintext hit writes `line_user_id_hash` / `line_user_id_encrypted` /
  `line_key_version`, so a second identical call resolves by hash with no gate hit.
- Backend suite green (baseline 771 passed).

---

## Part 2 — PRP (implementation plan)

### Phase 1 — remote-database detection on Settings

**File:** `backend/app/core/config.py`

Add a `is_remote_database` property next to `is_production_like`, mirroring its
fail-closed style: parse the host out of `DATABASE_URL` and return `False` only
for a recognized local host allowlist (`localhost`, `127.0.0.1`, `::1`, `db` —
the docker-compose service name). Anything else (Supabase pooler, unknown) counts
as remote. Empty/unparsable host returns `False` so unit tests with sqlite/memory
URLs are unaffected.

No change to `enforce_production_guards()` — this property is a building block,
not a startup guard, because a legitimate dev-to-remote read session must still be
able to boot.

### Phase 2 — fail-loud HMAC key resolution

**File:** `backend/app/services/user_identity_service.py`

In `_get_hmac_key()`, deny the dev fallback when the active database is remote:

```
key = settings.LINE_ID_HMAC_KEY
if key: return key
if settings.is_production_like:      raise RuntimeError(...)   # existing
if settings.is_remote_database:      raise RuntimeError(...)   # new
return _DEV_HMAC_KEY
```

Error text must name the variable and the reason (dev fallback would corrupt
remote hashes) without echoing any configured value. Keep the existing production
message unchanged so `test_config_production_guards` style assertions hold.

### Phase 3 — self-heal in the batch resolver

**File:** `backend/app/services/user_identity_service.py`

In `resolve_many_by_line_id`, after `record_fallback_hit(...)`, populate the
surrogate columns using the same nested-savepoint + `IntegrityError` guard as
`resolve_by_line_id:89-98`. Per-row savepoint so one conflicting row cannot roll
back the whole batch; on `IntegrityError`, expire the row and keep the mapping
already resolved from plaintext (the id is correct regardless). Backfill is
best-effort — the caller owns the commit, matching the module contract.

### Phase 4 — backfill script guard

**File:** `backend/scripts/backfill_line_id_pseudonym.py`

The script already prints the resolved ENV file and DB target via
`print_script_header`. Phase 2 makes it abort on the dangerous combination, since
it calls `line_id_hash` through the same helper — no script-specific code needed.
Verify by reading the script path, and extend the header note only if the abort
message would be unclear in context.

### Phase 5 — tests

**File:** `backend/tests/test_user_identity.py` (+ `test_config_production_guards.py`)

| Test | Asserts |
| --- | --- |
| `is_remote_database` for localhost / 127.0.0.1 / docker `db` | `False` |
| `is_remote_database` for a pooler host | `True` |
| `_get_hmac_key` dev + remote DB, no key | raises `RuntimeError` mentioning `LINE_ID_HMAC_KEY` |
| `_get_hmac_key` dev + local DB, no key | returns dev fallback (regression guard) |
| `_get_hmac_key` key set + remote DB | returns configured key |
| `resolve_many` plaintext hit | sets hash/encrypted/key_version on the row |
| `resolve_many` plaintext hit raising `IntegrityError` | mapping still returned, no exception |

### Validation

```bash
cd backend && python -m pytest tests/test_user_identity.py tests/test_config_production_guards.py -v
cd backend && python -m pytest          # full suite, expect >= 771 passed
```

Then re-check the gate on prod (`GET /api/v1/health/pseudonym-gate`) to confirm
`gate_status: pass` is unchanged by the deploy.

### Risks

- **False-positive abort** blocking a legitimate dev session against remote data:
  mitigated because the abort only triggers when `LINE_ID_HMAC_KEY` is *absent* —
  setting it (as prod does) always wins.
- **Batch backfill on a hot admin path** adds writes to a previously read-only
  function. Bounded by the number of legacy rows (converges to zero) and wrapped
  per-row so a failure degrades to the current count-only behaviour.

---

## Follow-up (not in this PR)

- Gate clock restarted 2026-07-30 after the manual repair — needs
  `gate_status: pass` + `fallback_hit_count: 0` through ~2026-08-04 before the
  destructive phase PRD.
- Audit other scripts that write identity columns for the same dev-key exposure.
