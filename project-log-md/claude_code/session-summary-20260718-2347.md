# Session Summary — claude_code (Fable 5) — 2026-07-18T23:47:00+07:00

**Branch**: `main`  **HEAD**: `df0413f`
**Checkpoint**: `.agents/state/checkpoints/handover-claude_code-20260718-2347.json`

> **Platform Meta**
> | Field | Value |
> |-------|-------|
> | AI CLI IDE | Claude Code |
> | Provider | Anthropic |
> | Model | Fable 5 |
>

## Purpose

Consolidated session rollup + the definitive "what to do next" list. Supersedes
the per-item handoffs from today (`1546` → `2226`) as the single reference.

## Shipped today — 8 prod-hardening items (all deployed + verified as far as safe)

| # | Item | PR / change | Live verification |
|---|------|-------------|-------------------|
| 1 | `HEALTH_ALERT_TELEGRAM_ENABLED=true` | Koyeb env | deploy healthy, /health 200 |
| 2 | `TRUST_PROXY_HEADERS=true` + leftmost-XFF spoof fix | PR #139 | 16 rotating-XFF POSTs still bucketed by real IP |
| 3 | Redis-backed HTTP rate limits | PR #140 | `5×201+11×429` (one shared bucket / 2 workers) |
| A | `broadcasts` table | PR #141 (`y0z1a2b3c4d5`) | scheduler `UndefinedTableError` stopped |
| B | geography tables adoption | PR #142 (`z1a2b3c4d5e6`) | PROD apply no-op, endpoint stays 200 |
| C | LIFF empty-body validation | PR #143 | `POST {}` → 422; anonymous tip → 201, name NULL |
| D | cross-worker auth limiter + health-alert dedup | PR #144 | /health 200, auth endpoints 401 unauth (intact) |
| F1 | skn-* skill docs → `live_chat_service` package | PR #145 | docs-only, CI green |

- **PROD alembic head**: `z1a2b3c4d5e6`.
- Cleaned all LIFF junk rows created during testing (`service_requests` ids 31–46).
- Full backend suite: **624 passed / 1 skipped** locally (3 websocket files
  excluded = pre-existing Windows proactor hang; green on Linux CI).
- Key reusable primitives added: `redis_client.fixed_window_allow` (fixed-window
  counter, shared across workers) and `redis_client.claim_once` (tri-state
  SET-NX-EX single-winner claim).

## What to do next

### Group 1 — user decisions (each ≈ one command once decided)
- Set `LIFF_STRICT_MODE=true` on prod? (forces a LIFF token on every
  submission; orthogonal to the PR #143 empty-body fix which already lands).
- `SLA_ALERT_TELEGRAM_ENABLED` is `false` on prod — intentional, or turn on?
- Add branch protection + required checks on main — auto-merge shipped PR #137
  before CI finished; this is the root cause of that gap.

### Group 2 — large multi-step, needs a FRESH session (empty context window)
- `COOKIE_AUTH_MODE=dual` production rollout per PRD. The backing tables are
  already dark-shipped on PROD (`w3x4y5z6a7b8` / `x9y0z1a2b3c4`); the flag is
  currently `bearer`. This is a real rollout, not a one-liner.
- PR 2C cookie-only hardening (follows the dual rollout).
- NEW-3 DIRECTOR/HEAD ws role — decision + implementation.

### Group 3 — low-priority cleanup (no runtime impact)
- Harmonise ORM model vs live-schema FK nullability: model declares
  `districts.province_id` / `sub_districts.district_id` `nullable=False` but
  live PROD has them NULLABLE (last scrap of §8). Either `ALTER … SET NOT NULL`
  after confirming no NULL FK rows, or relax the model.

### Human-only verification
- Watch the Telegram operator chat for `[HEALTH] … DOWN / RECOVERED` (now single
  and deduped across workers) on the next real outage — cannot be safely induced
  from here.

## Recommendation

The high-value hardening work is **done**. Answer Group 1 inline whenever; start
a **fresh session** for Group 2 (large + needs a clean context window). Session
cost was very high (~$775). All deploy recipes and gotchas are captured in memory
`project_deploy_architecture` + `project_prod_migration_state`.

## Environment notes

- Backend deploy: local Koyeb CLI (token in `secrets/secret-keys.txt`),
  `koyeb services redeploy jsk-app --app conservative-lusa` — but a manual
  redeploy races the merge-triggered CD workflow; poll for "latest healthy
  deployment whose sha == the merge commit".
- Migrations to PROD: `venv\Scripts\python.exe scripts\db_target.py alembic
  --target remote upgrade head`.
- Prod ORM queries: `DEV_AUTH_BYPASS=false PYTHONPATH=. ENV_FILE=.env
  venv/Scripts/python.exe …` (to pass `enforce_production_guards`).
- `curl` on Git Bash mangles inline `-d` Thai UTF-8 → use `--data-binary
  @file.json`.

## Blockers

- _none_
