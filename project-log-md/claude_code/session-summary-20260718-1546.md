# Session Summary — claude_code (Fable 5) — 2026-07-18T15:46:00+07:00

**Branch**: `main`  **HEAD**: `0134e8c`
**Checkpoint**: `.agents/state/checkpoints/handover-claude_code-20260718-1546.json`

> **Platform Meta**
> | Field | Value |
> |-------|-------|
> | AI CLI IDE | Claude Code |
> | Provider | Anthropic |
> | Model | Fable 5 |
>

## Objective

Execute handoff item 1 from the 2026-07-17 checkpoint: enable
`HEALTH_ALERT_TELEGRAM_ENABLED=true` in production "once deployed" — which
required first discovering that PR #137's backend code had never reached
Koyeb at all.

## Completed

### Production ops (no repo code changes — Koyeb + verification only)

1. **Found the deploy gap**: CD runs after PR #137/#138 never deployed the
   backend — PR #137's merge-commit CI was red (frontend lint), and PR #138's
   green CI produced a frontend-only `cd-scope`. Both recent CD runs show
   `Deploy Backend (Koyeb)` skipped. Prod was running code from 16 Jul 00:53
   UTC (deployment `cb5e9fac`).
2. **Pre-checks before touching prod**:
   - PROD DB (Supabase) already at alembic head `x9y0z1a2b3c4` — the
     cookie-auth tables/indexes were applied earlier; no migration needed.
     (Windows venv `backend\venv\Scripts\python.exe scripts\db_target.py`
     works for this; WSL not required.)
   - `COOKIE_AUTH_MODE` is **unset** on Koyeb → code default `bearer`
     preserved; deploying latest main is auth-behavior-neutral.
   - Both new migrations are additive + idempotent (guarded by inspect).
3. **The change**: downloaded Koyeb CLI 5.10.2 (windows_amd64) to scratchpad,
   authenticated with the token from `secrets/secret-keys.txt`, then:
   `koyeb services update jsk-app --app conservative-lusa --env
   HEALTH_ALERT_TELEGRAM_ENABLED=true`. The env update **merges** the var and
   triggers a full rebuild from tracked `refs/heads/main` — so this single
   command was also the **first prod deploy of PR #137** (HTTP rate limiting,
   health watchdog, live_chat_service package split).
4. **Verification**: new deployment `13497ee2` HEALTHY; built from exact sha
   `0134e8c` with `skip_build: false`; `HEALTH_ALERT_TELEGRAM_ENABLED`
   present in the deployment definition; `GET /api/v1/health` → 200
   `{"database":true,"redis":true,"status":"healthy"}`.
   Note: app-level `logger.info` lines (e.g. "Health watchdog task started")
   are invisible in Koyeb logs — only uvicorn's own loggers have handlers;
   watchdog output will only appear as `logger.warning` when an alert fires.

### Findings (pre-existing, NOT caused by this deploy)

- **`broadcasts` table MISSING on PROD** — no alembic migration ever created
  it (known ORM/live-schema drift, docs/remediation/
  preflight-evidence-and-designs.md §8). Broadcast scheduler logs
  `UndefinedTableError: relation "broadcasts" does not exist` every ~15s per
  worker — confirmed in BOTH the old instance (pre-#137 code) and the new
  one. Broadcast feature cannot work on prod until fixed.
- **Prod runs 2 uvicorn workers** → in-process rate-limit buckets are
  per-worker (limits effectively ×2) and the health watchdog runs per-worker
  (possible duplicate Telegram alerts, per-worker cooldown).
- **`SLA_ALERT_TELEGRAM_ENABLED="false"` on prod** — SLA breach alerts are
  off; health alerts use a separate flag (now on) through the same
  telegram_service channel.

### Memory updated

- `project_prod_migration_state.md` (PROD head x9y0z1a2b3c4 + broadcasts
  drift), `project_deploy_architecture.md` (local Koyeb CLI deploy path,
  2-worker runtime facts), MEMORY.md index lines.

## Next Steps

- **Fix broadcasts drift**: hand-written additive migration creating
  `broadcasts` on PROD (docs/remediation §8) — scheduler errors every 15s
  until fixed. Consider the same for districts/provinces/sub_districts drift.
- Handoff item 2: set `TRUST_PROXY_HEADERS=true` on Koyeb (all clients
  currently share one rate-limit bucket behind Koyeb's edge proxy) — verify
  Koyeb strips client-supplied `X-Forwarded-For` first.
- Handoff item 3: Redis-backed rate-limit buckets — prod ALREADY runs 2
  workers, so in-process limits are doubled today.
- Decide whether `SLA_ALERT_TELEGRAM_ENABLED=false` on prod is intentional.
- Human verification: watch the Telegram operator chat for `[HEALTH] ... DOWN
  / RECOVERED` messages on the next real outage (cannot be safely tested
  from here without inducing one).
- Carry-over: branch protection with required checks on main; update skn-*
  skills referencing single-file `live_chat_service.py`;
  `COOKIE_AUTH_MODE=dual` rollout per PRD; PR 2C cookie-only hardening;
  NEW-3 DIRECTOR/HEAD ws role decision.

## Blockers

- _none_
