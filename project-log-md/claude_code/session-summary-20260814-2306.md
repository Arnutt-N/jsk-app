# Session Summary — claude_code — 2026-08-14T23:06:00+07:00

**Branch**: `main`  **HEAD**: `84ec230`
**Checkpoint**: `.agents/state/checkpoints/handover-claude_code-20260814-2306.json`
**Model**: Claude Opus 5 (Anthropic)

> Closes the arc that ran across `20260813-0702` → `20260814-0542` → `20260814-0649`.
> The booking feature is now in production.

## What shipped

**PR #189** — squash-merged to `main` as `84ec230`, branch deleted. Standalone
appointment booking with an admin-configurable advance reminder: a LIFF page
with real slots derived from `business_hours`, auto-confirmation by LINE Flex,
a `คิว`/`นัดหมาย` command, a Telegram alert to staff, and `/admin/bookings`
plus a settings screen.

CI was green on every check before merging — Backend Pytest, Frontend Lint and
Build, Playwright Smoke, Source Encoding Scan, Vercel.

## Production is migrated and verified

CD run `31816870153` ran on `main`, migrated Supabase, and redeployed Koyeb;
the smoke check passed. Verified afterwards, directly against production:

| Check | Result |
|-------|--------|
| `alembic current --target remote` | **`e6f7g8h9i0j1 (head)`** |
| `alembic check --target remote` | **No new upgrade operations detected** |

That second line is the one worth keeping. The `20260813-0702` checklist asked
for it *before* opening the PR, which is impossible — alembic refuses to compare
unless the database is already at head, so pre-merge it only reported the
revision lag. It is a **post-deploy** check, and now that it can run, it reports
zero drift between the models and production.

## CD is active — the previous understanding was wrong

Project memory recorded CD as "disabled ON PURPOSE" precisely so that merging
could not auto-migrate production. That is no longer true: `gh workflow list
--all` shows all five workflows `active`, CD triggers on `workflow_run` when CI
completes with `head_branch == 'main'`, and `secrets.BACKEND_REMOTE_ENV_FILE` is
set — so `migrate-backend` runs `alembic upgrade head` against Supabase with no
human step.

The trap worth naming: on a PR the `Detect Deployment Scope` job reports
`skipping`, which reads like proof that nothing will deploy. It is only the
branch guard, and it stops applying the instant the branch becomes `main`. This
was surfaced and confirmed with the user before merging, not discovered after.

## Security work

A **plaintext production admin password** was found in this **public**
repository, in `.claude/PRPs/plans/completed/region-migration-frankfurt-phase1-2.plan.md`
— once as `ADMIN_DEFAULT_PASSWORD` and once inside a `curl` login example that
worked as-is. Readable by anyone since PR #65.

It was rotated and the rotation verified by reading the stored hash back: the new
password authenticates, the old one does not. The replacement lives only in the
untracked `secrets/secret-keys.txt`. **No history rewrite was performed** — on a
public repo the old value is permanently compromised, so rotation is the remedy
and removing the lines only stops it being copied forward.

Two gotchas nearly turned the rotation into a silent no-op, and both are now
recorded in memory:

- `app/core/config.py:217` runs `enforce_production_guards()` at **import time**,
  and `backend/.env` sets `DEV_AUTH_BYPASS`, so any script aimed at `--target
  remote` aborts. Pass `DEV_AUTH_BYPASS=false` — os.environ beats the dotenv file,
  and this makes the run stricter, not laxer.
- `settings.DATABASE_URL` is a `PostgresDsn`, not a `str`. Calling `.replace()`
  raises `AttributeError`, which silently killed the same safety check during the
  earlier local seed because that script had no `set -e`.
- `seed_admin.py` only updates a user literally named `admin`; against any other
  name it prints "Another admin user already exists, skipping" and rotates
  **nothing** while still exiting 0.

A full scan of tracked files found nothing else: no API keys, JWTs, private keys
or cloud credentials, and no `.env` has ever been committed. `admin1234` is
fixture data in `backend/tests/test_auth_login.py`, asserted to *fail*.

## Production cleanup

`test_deactivated` (id=4, ADMIN, inactive) is deleted. Before deleting, all 23
foreign keys pointing at `users.id` were discovered from `information_schema`
rather than hardcoded, and each was counted for references to that id — the total
was zero. The script was written to stop rather than delete if the account owned
data or was still active.

## Review that preceded the merge

A five-axis review of the branch produced the security finding above plus three
fixture follow-ups, all applied: cleanup scoped to `TARGET` instead of deleting
every booking with the test service type; a `Race` `NamedTuple` replacing a tuple
that needed nested unpacking and discarded two names; and `try/finally` around
teardown so a cleanup failure cannot leak the engine pool.

The negative control was re-run after that refactor and still bites — removing
`pg_advisory_xact_lock` fails the same two tests, one reporting two bookings
holding the same queue number. The refactor did not weaken what they prove.

## Merge mechanics worth knowing

- `main` had moved 11 commits ahead. Merging it in produced conflicts **only** in
  `.agents/` handoff state, never in code. `TASK_LOG.md` and `SESSION_INDEX.md`
  are generated, so they were regenerated with `gen-handoff-views.cjs` from the
  merged checkpoint set rather than hand-edited; the other two were merged entry
  by entry, keeping both sides.
- `gh pr merge` succeeded on GitHub but failed to update the local checkout,
  leaving the working tree on a stale local `main`. Before `reset --hard`, the one
  local-only commit (`3a479ad`) was checked file by file against `origin/main` and
  confirmed present inside the squash — nothing was lost.
- A stale zero-byte `.git/index.lock` from an interrupted command blocked a
  commit; removed only after confirming no git process was running.

## Test results

| Suite | Result |
|-------|--------|
| Backend, after merging main | **943 passed, 0 failed** |
| Booking concurrency, after merging main | **4 passed** |
| CI on PR #189 | all checks green |

## Next Steps

1. Manual LINE test — needs a LIFF ID from the LINE console. Citizens cannot
   reach `/liff/booking` yet: the rich-menu entry is deliberately not built.
2. Move the new admin password out of `secrets/secret-keys.txt` into a password
   manager.
3. Treat any merge to `main` as a production migration and deploy.
4. Redis still cannot be installed in WSL — no `gcc`, and `apt` needs the sudo
   password — so the 60 live-chat/websocket tests remain CI-only. Nothing is
   unverified: CI ran them green on #189.

## Blockers

- None for the shipped feature.
