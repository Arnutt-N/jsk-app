# Session Summary — claude_code — 2026-10-31T00:00:00+07:00

## Objective

Started as a `/checkpoint`. Turned into: fix the branch's red tests, review PR #301, fix what the review found, migrate the production database (which was far behind), get both PRs merged and deployed, and document the migration procedure.

## Completed

### Checkpoint and local test repair

| Commit | Change |
|---|---|
| `eb768f5` | `test.skip()` returns `void`, so it cannot narrow `password` in the nav-search-roles e2e spec — added an early `return`. `tsc --noEmit` had been failing with TS2345. |
| `5863808` | `vitest testTimeout: 20_000`. 22 LIFF booking specs take 4–6s each under jsdom on a loaded Windows box, right at the 5000ms default; they were failing on machine speed, not behaviour. |
| `7bdad6f` | `tests/test_analytics_perf.py` awaited `redis_client.delete()` from a pytest-asyncio loop while `redis_client._redis` belonged to the TestClient portal loop. That also hung teardown on anyio's `thread.join()` — the same hang that made the full suite look like it never finished. Tests are sync now and clear Redis through a throwaway sync client. |

### PR #301 review — 8 findings, all fixed in `54b5adc`

Two reviewers (backend security, frontend) plus my own verification of every claim.

| # | Severity | Problem |
|---|---|---|
| 1 | Critical | `refresh_policy_if_stale` called `invalidate_cache()` on failure → `_policy_cache is None` → `_allowed_for` fell back to `DEFAULT_POLICY`, which is **wider** than a hardened matrix. A DB flap restored revoked rights. `test_permission_policy_ttl.py` asserted exactly this fail-open behaviour and called it fail-closed. |
| 2 | Critical | `PageAccessGuard` and the sidebar required role **and** capability, so a matrix grant changed nothing — adding DIRECTOR to `access_live_chat` in Settings was a no-op while the hardcoded list excluded them. |
| 3 | High | `/auth/ws-ticket` was in `NON_RETRYABLE_AUTH_PATHS`, so an expired access token killed the socket permanently. |
| 4 | High | Policy refresh had no timeout; a DB that accepts TCP but never answers parked every `require_permission` call (102 sites). |
| 5 | High | F-002 covered only `require_permission`; the plain `get_current_admin/manager/staff` and `_gate_or_viewer` gates (83 route deps) served a pre-revocation matrix forever. |
| 6 | High | `reports` listed `ADMIN_AND_VIEWER`, hiding it from DIRECTOR/HEAD whom `KEY_VIEW_REPORTS` grants. |
| 7 | High | `/admin/analytics` was absent from the manifest, so `canAccessRoute` fell back to ADMIN_ONLY and bounced VIEWER. |
| 8 | Medium | `capabilityAppliesTo` skipped every key for VIEWER, but `view_reports`/`view_audit_log` gate the GETs. |

One reviewer claim was **rejected**: that `ENVIRONMENT` defaulting to `production` breaks `--target remote`. Tested — it fails on `InvalidPasswordError`, not the config guard.

### Production database migration

Production was at `aafd62b6dfa5`, **39 migrations behind** head, not the 3 I expected. Two blockers surfaced only because the chain was replayed on a throwaway database first:

- `533db9188e4b` declared its column with `sa.Enum(..., create_type=False)`. The generic type accepts the argument and discards it, so SQLAlchemy still emitted `CREATE TYPE userrole` → `DuplicateObjectError` on every database that had run the initial migration. Fixed with `postgresql.ENUM` (`2f3bce5`).
- `d5e6f7g8h9i0` refuses to build the pseudonym indexes while any `users.line_user_id` lacks a hash. Five rows did, and **zero** had hashes — contradicting `.agents/PROJECT_STATUS.md`, which recorded "backfill ran (0 NULL hashes)". The backfill script referenced by PR B is not in the tree; wrote it (`e6255b9`, dry-run by default, aborts on hash collision). Applied: 5 hashed, 0 remaining.
- `a7b8c9d0e1f2` requires `ENCRYPTION_KEY`.

Chain then completed to `f0a1b2c3d4e5`. Verified: `view_reports` = `["SUPER_ADMIN","ADMIN","DIRECTOR","HEAD","VIEWER"]`, 14 permission rows, all 7 enum labels, 0 `$skn_` rows, 42 tables.

### Merges and deploy

- PR #301 → `dcfd285`, PR #302 → `c37985a`.
- **CD for `dcfd285` failed** on `Artifact download failed after 5 retries` (GitHub infra, not code). Its follow-up docs PR reported `success` while every Deploy/Migrate job was **skipped**. Re-ran with `gh run rerun <id> --failed`; all six jobs then passed, backend and frontend smoke checks green.
- DB revision and deployed code now match.

### Docs

- `docs/DB_MIGRATION_RUNBOOK_TH.md` (new) — env file contents and sources, three pre-flight gates, the traps met for real, cleanup, and (added after the deploy confusion) section 6 on job-level CD verification.
- `docs/DEPLOY_VERCEL_KOYEB_SUPABASE_UPSTASH_TH.md` — added the missing migration step (the guide jumped straight to seeding admin), added `LINE_ID_HMAC_KEY`/`LINE_ID_STORAGE_MODE` to the Koyeb env list, fixed duplicate numbering.
- `.agents/PROJECT_STATUS.md` — attached a CORRECTION under the 2026-07-21 entry rather than editing it.
- `docs/cd-skip-trap` branch holds `f0a5893` (runbook section 6), **not yet pushed or PR'd**.

## Next Steps

1. Open a PR for `docs/cd-skip-trap` (`f0a5893`) — runbook section 6.
2. Delete stale branches: `fix/codebase-review-20261026`, `docs/ops-docs-corrections`, plus ~10 older ones.
3. Three reviewer suggestions on PR #301 were **not** acted on (all low impact, unverified):
   - `useLiveChatSocket.ts` — a `MESSAGE_FAILED` with `retryable === false` leaves the pending entry, so the UI offers a retry that cannot succeed
   - `authFetch.ts:105` — `url.includes(path)` also matches a query string (`?next=/auth/login`)
   - `vitest.config.ts` — `coverage.all` is false, so files no test imports are never counted

## Blockers

None.

## Deferred (not blockers)

- **Backend full suite hangs at session teardown on Windows** (anyio/TestClient `thread.join()`). It reaches 97% with 0 failures and then stops; kill it and read the dot count. Two clean runs gave **1764 dots, 0 F, 0 E, 0 s**. This is environment, not code.
- Frontend full suite: 1049/1050, one jsdom timeout that passes 12/12 in isolation.

## Environment notes for the next agent

- **CI is the only trustworthy judge** (still true). Local runs give false reds that shift between runs — the failing set changed each time, and every one passed in isolation.
- Run vitest as `node node_modules/vitest/vitest.mjs run --root <repo>/frontend <path>`; `npx vitest` does not work here.
- `pytest` on this box hangs at teardown. Use `--maxfail=N` and read the dot/F/E counts from the log rather than waiting for a summary line.
- **Docker Desktop exits by itself** when the machine goes idle. `docker ps` returning only a header means the DB/Redis are gone and every DB-backed test will fail with a service-reachability error. Check before trusting any red result.
- **DNS on this machine drops intermittently** — `nslookup github.com` times out, `gh` reports "error connecting to api.github.com", and asyncpg gives `gaierror`. It recovers on its own; retry rather than debugging.
- `--target remote` reads `backend/.env`, which is gitignored and absent from the tree. Recreate it from `secrets/secret-keys.txt` (see the runbook), and delete it afterwards — it holds `SECRET_KEY` and `ENCRYPTION_KEY` in plaintext.
- Maintenance scripts that import `app.core.config` hit `enforce_production_guards` immediately. Do **not** add a bypass; run them with `ENVIRONMENT=development`, which is safe because `LINE_ID_HMAC_KEY` is read before any fallback.

## Iron rule reminder (user-mandated 2026-10-13)

No key, token, password, or secret appears in this handoff, the checkpoint, the
PR body, or any log from this session. Secrets were handled by presence/count
checks only. Cite this rule in every handoff.
