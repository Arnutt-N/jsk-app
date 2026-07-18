# Session Summary — claude_code (Fable 5) — 2026-07-18T19:59:00+07:00

**Branch**: `main`  **HEAD**: `835c261`
**Checkpoint**: `.agents/state/checkpoints/handover-claude_code-20260718-1959.json`

> **Platform Meta**
> | Field | Value |
> |-------|-------|
> | AI CLI IDE | Claude Code |
> | Provider | Anthropic |
> | Model | Fable 5 |
>

## Objective

Finish the 2026-07-17 prod-hardening handoff. This session closed **all three**
of its top items across the day: (1) `HEALTH_ALERT_TELEGRAM_ENABLED=true`,
(2) `TRUST_PROXY_HEADERS=true` (with a spoof-fix first), and — this checkpoint —
(3) Redis-backed HTTP rate-limit buckets.

## Completed — Item 3: Redis-backed HTTP rate limiting (PR #140, `835c261`)

**Why**: the HTTP limiters were in-process, so with prod on **2 uvicorn
workers** the effective limit was doubled. This was measured, not assumed —
the item-2 spoof test returned `10×201 + 6×429` (2 × limit 5) on the LIFF
route.

**Change**:
- `redis_client`: `fixed_window_allow(key, max_events, window_seconds)` —
  `SET key 0 EX window NX` anchors the window TTL exactly once (a plain EXPIRE
  per call would slide the window forward forever), then atomic `INCR`;
  returns `True`/`False`/`None` (None = Redis down). Plus a thin `incr()`.
- `http_rate_limit` dependency: try Redis first; on `None` fall back to the
  existing in-process `SlidingWindowLimiter` — degrades to per-worker limiting
  rather than failing open or closed. Keys `ratelimit:<scope>:<client>`.
- `conftest`: `_reset_http_rate_limits` now also flushes Redis `ratelimit:*`
  keys between tests via a throwaway **sync** redis client (the async
  `redis_client._redis` is bound to the session TestClient's portal loop and
  can't be driven from a sync fixture). Keeps `test_liff_token` (7 POST /
  limit 5) isolated.
- 5 new tests: shared-bucket-across-callers, TTL-anchored-once, `None`→
  fallback, dependency-uses-Redis vs dependency-falls-back-in-process.

**Verification**:
- Local: `test_http_rate_limit` 19/19 + `test_liff_token` 7/7; full suite
  **609 passed / 1 skipped** excluding 3 websocket files (pre-existing Windows
  proactor teardown hang — confirmed the hang is env-only by killing a 12-min
  0-progress run; green on Linux CI).
- CI: all checks green on PR #140 incl. Backend Pytest on Linux (runs the
  websocket files too).
- **Live on prod**: same 16 rotating-XFF POST test now returns **`5×201 +
  11×429`** (was `10×201 + 6×429`) = one shared bucket across both workers.
- Deployment `f0ac0aa4` (sha `835c261`, `/health` 200). Cleaned the 5 junk
  rows the test wrote (`service_requests` ids 41–45; 0 recent rows remain).

**Deploy-race note**: a manual `koyeb services redeploy` right after the merge
collided with the CD workflow (cd.yml fires on the merge's CI success). My
`712d0065` was superseded by CD's `f0ac0aa4` — same sha, harmless, but the poll
should track "latest healthy ≠ previous", not a fixed deployment id.

## Status of the original handoff's 3 items

1. ✅ `HEALTH_ALERT_TELEGRAM_ENABLED=true` (earlier today, deploy `13497ee2`)
2. ✅ `TRUST_PROXY_HEADERS=true` + PR #139 leftmost-XFF spoof fix, verified
3. ✅ Redis-backed rate limits (this checkpoint)

## Next Steps (all NEW/carried, none of the original 3 remain)

- **HIGH — `broadcasts`-table drift on PROD**: scheduler logs
  `UndefinedTableError` every ~15s; needs a hand-written additive migration to
  create `broadcasts` (docs/remediation/preflight-evidence-and-designs.md §8).
  Same drift affects districts/provinces/sub_districts.
- **MED — LIFF empty-body gap**: `POST {}` → 201 + junk row
  (`requester_name='None None'`, all content NULL) when `LIFF_STRICT_MODE=false`.
  Tighten `ServiceRequestCreate` to require key fields, or enable strict mode.
- **Follow-up**: apply the same Redis backing to the WS/auth in-process
  limiters (`rate_limiter.py`) if they need cross-worker enforcement; the
  health watchdog runs per-worker so may send duplicate Telegram alerts.
- **Decisions for the user**: is `SLA_ALERT_TELEGRAM_ENABLED=false` on prod
  intentional? Add branch protection + required checks on main (auto-merge
  shipped PR #137 before CI finished).
- **Carry-over**: update `skn-*` skills referencing single-file
  `live_chat_service.py`; `COOKIE_AUTH_MODE=dual` rollout per PRD; PR 2C
  cookie-only hardening; NEW-3 DIRECTOR/HEAD ws role.
- **Human-only verify**: watch the Telegram operator chat for `[HEALTH] …
  DOWN / RECOVERED` on the next real outage.

## Environment notes

- Windows backend venv (`backend\venv`) was missing `redis` and `pytz`;
  installed both (`redis-8.0.1`). CI/Linux already has them.
- Prod queries/cleanup: `DEV_AUTH_BYPASS=false PYTHONPATH=. ENV_FILE=.env
  venv/Scripts/python.exe …` to get past `enforce_production_guards()`.
- Koyeb CLI 5.10.2 in scratchpad; token in `secrets/secret-keys.txt`.

## Blockers

- _none_
