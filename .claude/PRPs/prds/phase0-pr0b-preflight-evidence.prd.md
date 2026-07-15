# PRD — Phase 0 PR 0B: Pre-Flight DB Evidence Collector + Design Doc (Recreation) & Test-Infra Hardening

**Status:** READY-TO-EXECUTE
**Author:** Claude Fable 5 (planner) — 2026-07-15
**Implementer:** Claude Sonnet 5 (subagent)
**Reviewers:** Fable 5 (code review), Opus 4.8 (PR review)
**Branch:** `claude/project-status-pending-nyb3xs`
**Parent plan:** `PRPs/claude_code/2026-07-11-2329-gpt-5.6-sol-p0-p3-remediation.plan.md` + consolidated 5-agent review (`2026-07-12-consolidated-remediation-review.md`)

## Problem

Phase 0 (Pre-Flight) of the P0-P3 remediation plan requires evidence-driven gates
before Phase 1 may start. Codex implemented PR 0B on 2026-07-12 (evidence collector
script + design/evidence doc) but **never committed it** — the files exist only on the
Windows dev machine, which is currently blocked by a broken Docker/WSL install. Only
PR 0A (migration controls, `31632ee`) made it into git.

Additionally, the 2026-07-15 session discovered that `backend/tests/conftest.py` does
`from app.main import app` unconditionally at module import time, which blocks on
Postgres/Redis with no connect timeout. When the DB is down, **every** test in
`backend/tests/` hangs — including pure-config tests like
`test_config_migration_controls.py` that never touch the DB. This directly caused a
multi-hour diagnosis on 2026-07-15 and undermines the Phase 0 gate ("run targeted P0
tests") whenever infra is degraded.

## Goals

1. **Recreate PR 0B** from its documented spec (Codex session log 2026-07-12) so
   Phase 0 evidence tooling lives in git and works on any machine (cloud sandbox,
   WSL, CI):
   - `backend/scripts/collect_preflight_db_evidence.py` — bounded, **read-only** DB
     evidence collector.
   - `docs/remediation/preflight-evidence-and-designs.md` — Phase 0 design decisions
     + evidence record.
   - `backend/scripts/README.md` — document the new script.
2. **Harden `backend/tests/conftest.py`** so DB-independent tests run (and fail fast
   with a clear message rather than hang) when Postgres/Redis are unreachable.
3. **Run the full backend pytest suite** against a real local Postgres 16 + Redis
   (this cloud sandbox) as the verification gate. Baseline recorded 2026-07-15:
   **564 passed** at `d2968ab` + local schema at alembic head `v2w3x4y5z6a7`.

## Non-Goals

- No remote (Supabase) evidence collection in this PR — no prod credentials in this
  environment. The script must *support* `--target remote` via the existing
  `ENV_FILE` convention, but running it against prod is a follow-up on a machine
  holding `backend/.env`.
- No Phase 1 work (cookie auth, LIFF strict enforcement, inbox tables). Phase 0 gate
  decisions (owners, retention policy, advisory-lock ID) remain human decisions.
- No fix for the `public.broadcasts` schema-ownership gap found by Codex — explicitly
  deferred to PR 2F per the remediation plan.
- No change to test behavior when the DB **is** available — the suite must pass
  identically.

## Functional Requirements

### FR1 — Evidence collector `backend/scripts/collect_preflight_db_evidence.py`

- `--target local|remote` (default `local`) resolving the env file exactly like
  `backend/scripts/db_target.py` (`local` → `backend/app/.env`, `remote` →
  `backend/.env`); reuse `_cli_utils.BACKEND_DIR` and the existing script style
  (argparse, `main() -> int`, `raise SystemExit(main())`).
- Read-only: issues **only** `SELECT` statements against catalog/statistics views;
  connects with a **10-second connection timeout**; sets the session read-only
  (`default_transaction_read_only`) as defense in depth.
- Collects (aggregates only):
  1. current schema name + PostgreSQL server version,
  2. Alembic revision from `alembic_version`,
  3. `pg_stat_statements` availability + extension version (graceful "not installed"),
  4. table size / estimated row counts for the top-N largest tables in `public`
     (default N=20, `--limit` flag),
  5. top-N slow statements from `pg_stat_statements` — **normalized `queryid`,
     calls, total/mean exec time only** (only when the extension exists),
  6. presence check: ORM-declared tables missing from the live schema (e.g. the known
     `broadcasts` gap on remote) — reported as a finding, never created.
- **Redaction guarantees (hard requirements):** output must never contain database
  URLs, hostnames, credentials, query text, bind values, row data, or tokens. Slow
  statements are identified by `queryid` only.
- Output: human-readable markdown to stdout by default; `--json` flag for a
  machine-readable variant; `--output PATH` to write to a file. Timestamped (UTC)
  header with target name (`local`/`remote` — not the URL).
- Exit codes: `0` success, `1` connection/timeout failure (one-line actionable
  error, no stack trace, no URL), `2` usage error.

### FR2 — Design & evidence doc `docs/remediation/preflight-evidence-and-designs.md`

Sections (matching what Codex's log says the lost doc covered):
1. **LIFF client inventory** — every LIFF entry point in `frontend/app/liff/` and
   whether it currently sends an ID token (implementer must verify against live code).
2. **Administrator authentication** — current Bearer/localStorage flow; confirm the
   HTTP path goes through the same-origin Vercel rewrite while WebSockets connect
   directly to Koyeb.
3. **WebSocket authentication** — current state + the selected design: host-only
   HTTP cookies plus a **short-lived, single-use WebSocket ticket** (decision made
   2026-07-12, record as decided).
4. **Privileged mutation audit coverage** — endpoints performing privileged writes
   and whether `@audit_action` covers them (survey, not fix).
5. **Cookie/CSRF/refresh design** — the P1.1 design doc the consolidated review
   demands (3-PR split: backend dual-mode → frontend → remove Bearer), including
   CSRF strategy and `COOKIE_AUTH_MODE` interplay.
6. **Durable webhook inbox recovery** — P1.5 phase-1 (inbox only) design + what
   evidence must exist before outbox work (data-loss incidents, volume/latency).
7. **Scheduler advisory leadership** — P1.6 advisory-lock design; lock ID must be
   registered (placeholder + explicit "pending human decision" marker).
8. **Evidence record** — table with one row per collection run: date, target,
   schema, alembic revision, pg_stat_statements version, notable findings. Seed it
   with (a) the 2026-07-12 remote findings recoverable from the session log (schema
   `public`, revision `v2w3x4y5z6a7`, pg_stat_statements 1.11, `broadcasts` table
   missing remotely → deferred to PR 2F) marked as "recovered from session log —
   raw numbers lost, re-collection required", and (b) a fresh local run from this
   environment produced by the new script.
9. **Open items requiring human decisions** — named owners, inbox
   data-classification/retention, advisory-lock ID registration, webhook/Redis
   incident evidence, second table-size sample for growth rate.

### FR3 — conftest hardening `backend/tests/conftest.py`

- Remove the module-level `from app.main import app`; import lazily inside the
  `test_client` fixture (and anywhere else it is needed).
- Tests that never request a DB-dependent fixture must collect and run with
  Postgres/Redis down.
- DB-dependent fixtures must **fail fast** (bounded wait, clear skip/error message
  naming the unreachable service) instead of hanging indefinitely.
- Zero behavior change when services are up: full suite passes before and after
  (baseline: 564 passed).

### FR4 — Docs

- `backend/scripts/README.md`: add `collect_preflight_db_evidence.py` under
  "Supported Database Tooling" (read-only, targets, redaction note) in the existing
  one-line style.

## Acceptance Criteria

- [ ] `collect_preflight_db_evidence.py --target local` runs green against this
      sandbox's Postgres 16 (alembic head `v2w3x4y5z6a7`); output contains schema,
      revision, extension status, table sizes; `--json` validates as JSON.
- [ ] Redaction audit: grep of script + captured outputs shows no URL, password,
      hostname, query text, or bind values. Collector uses SELECT-only statements.
- [ ] With Postgres stopped: collector exits `1` within ~10s with a clean error.
- [ ] With Postgres/Redis stopped: `pytest backend/tests/test_config_migration_controls.py`
      passes (no hang). With services up: **full backend suite passes** with no new
      failures vs the 564-passed baseline.
- [ ] `preflight-evidence-and-designs.md` contains all 9 sections; every factual
      claim about current code (LIFF token sending, audit coverage) is verified
      against the actual source, not copied from memory.
- [ ] `git diff --check` clean; commit style per repo convention (`feat(scripts):`,
      `test(conftest):`, `docs(remediation):`); no model IDs in commit artifacts.

## Workflow / Roles (per user instruction 2026-07-15)

1. Fable 5 writes PRD + PRP plan (this doc + plan file).
2. Sonnet 5 subagent implements on `claude/project-status-pending-nyb3xs`.
3. Fable 5 reviews the diff; Sonnet 5 fixes findings.
4. Sonnet 5 commits, pushes, opens PR to `main`.
5. Opus 4.8 subagent reviews the PR.
6. Sonnet 5 applies final fixes; merge.

## Risks

- **Evidence numbers lost:** Codex's remote table-size numbers are unrecoverable;
  doc must honestly mark them as lost + re-collection pending (do not fabricate).
- **conftest change breaking WS tests:** several test files may import `app` or rely
  on import-time side effects — implementer must grep all usages before moving the
  import.
- **pg_stat_statements absent locally:** sandbox PG likely lacks the extension — the
  collector must degrade gracefully (this itself exercises FR1 item 3).
