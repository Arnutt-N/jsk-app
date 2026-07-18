# Session Summary — claude_code (Fable 5) — 2026-07-18T18:14:00+07:00

**Branch**: `main`  **HEAD**: `9c2589f`
**Checkpoint**: `.agents/state/checkpoints/handover-claude_code-20260718-1814.json`

> **Platform Meta**
> | Field | Value |
> |-------|-------|
> | AI CLI IDE | Claude Code |
> | Provider | Anthropic |
> | Model | Fable 5 |
>

## Objective

Work the 2026-07-17 handoff's prod-hardening list. This session closed
**item 1** (health-alert Telegram flag — done earlier today) and **item 2**
(`TRUST_PROXY_HEADERS=true`), the latter of which turned out to require a
security fix first.

## Completed

### Item 2 — `TRUST_PROXY_HEADERS=true` on prod, done safely

The handoff's own caveat ("verify Koyeb strips client-supplied
X-Forwarded-For first") was the crux. Investigation showed it does **not**:

- The Koyeb public domain is fronted by **Cloudflare** (`server: cloudflare`,
  `cf-ray`, `cf-connecting-ip` on responses). Cloudflare **appends** the real
  connecting IP to any client-supplied `X-Forwarded-For` rather than replacing
  it — so the **leftmost** XFF entry is attacker-controlled.
- Old `_client_key()` took the leftmost entry when `TRUST_PROXY_HEADERS=true`.
  Flipping the flag as-is would have let any caller rotate a fake XFF per
  request to get a fresh rate-limit bucket every time — a **full bypass** of
  the LIFF/media/public-file limits.

**PR #139** (squash-merged `9c2589f`, all CI green — Backend Pytest, Frontend
Lint/Build, Playwright Smoke, Encoding, Vercel) fixes the key resolution to,
when `TRUST_PROXY_HEADERS=true`:
1. `CF-Connecting-IP` — Cloudflare always overwrites it, unspoofable
2. rightmost `X-Forwarded-For` entry — appended by the trusted edge
3. direct socket address (also the flag-off default, unchanged)

Added 4 tests (rightmost-XFF, CF-Connecting-IP preference, spoofed-leftmost
rotation cannot change the key, flag-off ignores both) — `test_http_rate_limit`
14/14 local.

Then set `TRUST_PROXY_HEADERS=true` via Koyeb CLI (deploy `0588c241`, built
from `9c2589f`, `HEALTH_ALERT_TELEGRAM_ENABLED` also still true; `/health` 200).

### Live prod verification (the conclusive part)

16× `POST /api/v1/liff/service-requests` with a **rotating** fake
`X-Forwarded-For` on every request → **`10×201 + 6×429`**.
- 429s appearing despite rotating XFF proves buckets key on the real
  Cloudflare IP, not the spoofable header (broken code would have given 16
  unique buckets → zero 429s).
- The exact `10+6` split (limit 5/300s) proves **exactly 2 uvicorn workers**
  (2×5 allowed + 2×3 blocked). A prior 135× rotating-XFF test on the
  public-file route (limit 120/60s) gave all 404 — inconclusive because an
  even 2-worker split (~67 each) never trips 120. Lesson: use the low-limit
  LIFF endpoint for prod spoof tests.

### Side finding — LIFF empty-body validation gap (found + cleaned)

With `LIFF_STRICT_MODE=false` (transition mode), an empty-body `POST {}` to
the LIFF endpoint returns **201 Created** and writes a real row:
`requester_name='None None'` (f-string over None firstname/lastname), all
content fields NULL, `source='LIFF'`, no `line_user_id`. The spoof test
created 10 such junk rows (`service_requests` ids **31–40**) in PROD.
**All 10 deleted** by exact signature (`created_at > now()-40min` AND
`requester_name IN (NULL,'None None')` AND category/description/line_user_id/
phone/email all NULL, `RETURNING id`); remaining recent rows = 0, no
legitimate submission touched.

### Memory updated

`project_deploy_architecture.md` (TRUST_PROXY status + spoof fix + live
verification + 2-worker confirmation + LIFF gap + db_target guard-override
recipe), `project_prod_migration_state.md` + MEMORY.md (from item 1 earlier).

## Next Steps

- **Item 3 now justified**: move rate-limit buckets to Redis — in-process
  limits are literally doubled on prod (proven by 10×201+6×429). The health
  watchdog likewise runs per-worker and may send duplicate Telegram alerts.
- **Fix LIFF validation gap**: empty-body `POST {}` → 201 + junk row. Tighten
  `ServiceRequestCreate` to require key fields, or set `LIFF_STRICT_MODE=true`
  (weigh against the transition-mode rollout).
- Still open from item-1 handoff: `broadcasts`-table drift on PROD (scheduler
  `UndefinedTableError` every ~15s); decide whether
  `SLA_ALERT_TELEGRAM_ENABLED=false` is intentional; branch protection +
  required checks on main; update `skn-*` skills referencing single-file
  `live_chat_service.py`; `COOKIE_AUTH_MODE=dual` rollout; PR 2C cookie-only
  hardening; NEW-3 DIRECTOR/HEAD ws role.
- **Human-only verify**: watch the Telegram operator chat for `[HEALTH] …
  DOWN / RECOVERED` on the next real outage (cannot safely induce from here).

## Environment notes

- Prod spoof/cleanup used the Windows backend venv (`backend\venv`), not WSL.
- db_target/app-code against remote `.env` trips `enforce_production_guards()`
  (`DEV_AUTH_BYPASS must be disabled in production`); override per-invocation:
  `DEV_AUTH_BYPASS=false PYTHONPATH=. ENV_FILE=.env venv/Scripts/python.exe …`.
- Koyeb CLI 5.10.2 (windows_amd64) in scratchpad; token in
  `secrets/secret-keys.txt`. `services update --env` merges the var AND
  rebuilds from `refs/heads/main`.

## Blockers

- _none_
