# Session Summary — claude_code — 2026-08-14T06:49:00+07:00

**Branch**: `feat/booking-appointments`  **HEAD**: `d31fbdf`
**Checkpoint**: `.agents/state/checkpoints/handover-claude_code-20260814-0649.json`
**Model**: Claude Opus 5 (Anthropic)

> Continues `20260814-0542`. That checkpoint closed the migration/concurrency
> verification gap; this one covers the code review that followed it, which
> turned up a security issue larger than the diff under review.

## Objective

Run a five-axis review of the booking branch before opening the PR, then act on
what it found.

## The finding that mattered

The review's security pass turned up a **plaintext production admin password**
committed to this repository:

`.claude/PRPs/plans/completed/region-migration-frankfurt-phase1-2.plan.md`

- line 194 — `export ADMIN_DEFAULT_PASSWORD="…"` for the PROD seed step
- line 277 — the same value inside a `curl` login example that worked as-is

`Arnutt-N/jsk-app` is **PUBLIC**, and the value had been readable since it
landed in PR #65 (`ed01955`). It was found while checking whether the throwaway
password used to seed the local database had leaked — it had not; this was
pre-existing.

### Rotated, and verified rather than assumed

Two checks ran before anything was written to production, and both earned their
place:

1. **The account had to be named `admin`.** `seed_admin.py` updates a user
   literally called `admin`; against any other name it prints *"Another admin
   user already exists, skipping"* and rotates **nothing** while still exiting 0.
   PROD does have `admin` (id=1) — plus `test_deactivated` (id=4, role=ADMIN,
   `is_active=False`), a leftover test account noted below.
2. **`app/core/config.py:217` runs `enforce_production_guards()` at import
   time**, and `backend/.env` sets `DEV_AUTH_BYPASS`, so the first attempt
   aborted with *"Unsafe production configuration"* rather than rotating.
   Passing `DEV_AUTH_BYPASS=false` (os.environ beats the dotenv file) resolves
   it, and makes the run stricter, not laxer.

Rotation was then confirmed by reading the stored hash back: **the new password
verifies and the old one does not**. The new value lives only in the untracked
`secrets/secret-keys.txt` (gitignored at line 2 of the pattern list, never
tracked); both plan lines now read it from the environment.

**No history rewrite was performed.** On a public repository the old value must
be treated as permanently compromised, so rotation is the remedy and deleting
the lines only stops it being copied forward. `git log -S` still finds it in
five or more commits, as expected.

### The rest of the tree is clean

A full scan of tracked files found:

| Category | Result |
|----------|--------|
| API keys, JWTs, private keys, AWS keys | **none** |
| Connection strings with real passwords | none — all are test fixtures (`user:secret`, `{canary}`) |
| `.env` ever committed | **never** — `git log --all --diff-filter=A -- "*.env"` is empty |
| `admin1234` | **not a credential** — fixture data in `backend/tests/test_auth_login.py`, asserted to *fail*. Left alone. |

## Review follow-ups applied

Three items from the review, all in the concurrency fixture:

- Cleanup deleted every booking with the test service type **regardless of
  date**; now scoped to `TARGET` so a shared development database is not touched
  outside the test's own day.
- The fixture had grown a second job and yielded a tuple needing nested
  unpacking, discarding two names at one call site. It now yields a `Race`
  `NamedTuple` and is called `race`, matching the project's own Python style
  rule; call sites read `race.db_a` / `race.user_a`.
- Teardown had no `try/finally`, so a failure in the cleanup session skipped
  `engine.dispose()` and leaked the pool. Both stages are now in `finally`.

The negative control was re-run afterwards: removing `pg_advisory_xact_lock`
still fails the same two tests, with two bookings sharing one queue number. The
refactor did not weaken what they prove.

## What the review also established

CI provides **both** `postgres:16` and `redis:7` with
`DATABASE_URL: postgresql+asyncpg://postgres:password@127.0.0.1:5432/skn_app_db`
(`.github/workflows/ci.yml:70-93`), matching the test's default exactly. So the
previous session's fixture fix was not polish — with Postgres present the
`skipif` never applies, and the broken fixture would have produced **four errors
on the very first push**.

## Test results (actually run)

| Suite | Result |
|-------|--------|
| Backend — full | **870 passed, 0 failed, 60 errors** (all "Redis not reachable") |
| Backend — concurrency file | **4 passed** before and after the refactor |
| Negative control | 2 failed, as designed |

The warning count moved 4 → 5; all warnings are pre-existing
`coroutine ... was never awaited` from `AsyncMock` in live-chat/websocket tests,
none from booking.

## Commits

```
0c3c04a security: remove the committed PROD admin password from the migration plan
d31fbdf test(booking): tighten the concurrency fixture after review
```

## Next Steps

1. Open the PR to `main`; nothing on this branch has been pushed.
2. Delete the leftover `test_deactivated` account (id=4, ADMIN, inactive) from PROD.
3. The new admin password is **only** in the untracked `secrets/secret-keys.txt`
   as `JSK_PROD_ADMIN_PASSWORD` — never quote it in a tracked file.
4. Redis remains unavailable in WSL, leaving those 60 tests to CI.

## Blockers

- None.
