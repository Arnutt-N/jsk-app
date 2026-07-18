# Session Summary — claude_code (Fable 5) — 2026-07-18T22:05:00+07:00

**Branch**: `main`  **HEAD**: `d2bd301`
**Checkpoint**: `.agents/state/checkpoints/handover-claude_code-20260718-2205.json`

> **Platform Meta**
> | Field | Value |
> |-------|-------|
> | AI CLI IDE | Claude Code |
> | Provider | Anthropic |
> | Model | Fable 5 |
>

## Objective

Handoff item D: make the two remaining per-worker states cross-worker aware,
now that prod is confirmed to run 2 uvicorn workers — the auth rate limiter and
the health-watchdog Telegram alerts.

## Completed — PR #144 (`d2bd301`, deployed Koyeb `95fe5ab5`)

### 1. Auth rate limiter → Redis-backed
`POST /auth/migrate-session` and `POST /auth/ws-ticket` are limited 5/60s keyed
by user id, but the limiter was in-process — a user got **10/60s** across the 2
workers. Now uses the existing `redis_client.fixed_window_allow` (same
mechanism as PR #140) with the in-process `SlidingWindowLimiter` as fallback
when Redis is down (per-worker, never fails open). Extracted `AUTH_RATE_LIMIT`
/ `AUTH_RATE_WINDOW` constants + an `_auth_rate_limit_exceeded(key)` helper.

The **WS message limiter is intentionally left in-process** (per-connection,
hot path — Redis there is latency for no cross-worker benefit).

### 2. Health watchdog alerts → de-duplicated across workers
The watchdog runs per worker, so on a DB/Redis outage every worker sent its own
Telegram alert (duplicates; per-process cooldown). Added
`redis_client.claim_once(key, ttl)` — `SET NX EX`, **tri-state**: `True`
claimed→act, `False` already-claimed→skip, `None` Redis-down→act anyway. The
watchdog claims a shared key (TTL = cooldown, keyed by the alert text) before
sending, so exactly one worker sends per transition. **Redis-down still sends**
— the tri-state exists so a Redis outage isn't mistaken for "already claimed"
and the alert never gets swallowed (Redis down is when it matters most).

### Verification
- TDD: 6 new tests — watchdog two-workers-send-once (shared FakeRedis) +
  redis-down-still-sends; auth limiter blocks-after-limit, shared-across-callers,
  in-process fallback, distinct-key isolation.
- Full backend suite **624 passed / 1 skipped** locally (3 websocket files
  excluded — pre-existing Windows proactor hang; green on Linux CI).
- CI on PR #144 all green. Deployed (`95fe5ab5`, sha `d2bd301`).
- **Prod smoke** (as far as safe): `/health` 200 with new code; both
  `/api/v1/auth/ws-ticket` and `/api/v1/auth/migrate-session` return 401
  unauth (endpoints intact; the limiter sits after `get_current_user`).
- **Deliberately not live-tested**: a full rate-limit test needs a login →
  audit-log noise + risks locking a real admin's ws-ticket for 60s; the
  watchdog dedup needs a real outage. The Redis mechanism itself is already
  prod-proven (item 3, `5×201+11×429`) and unit-tested here.
- **Gotcha**: the auth router mounts under `/auth`, so the real paths are
  `/api/v1/auth/ws-ticket` and `/api/v1/auth/migrate-session` (a first smoke
  at `/api/v1/ws-ticket` 404'd).

## Next Steps

- **Last §8 follow-up (no runtime impact)**: harmonise the ORM model vs live
  schema FK nullability (`districts.province_id` / `sub_districts.district_id`
  are `nullable=False` in the model but NULLABLE in live PROD).
- **Decisions for the user** (blocking nothing, but worth closing): set
  `LIFF_STRICT_MODE=true` on prod? Is `SLA_ALERT_TELEGRAM_ENABLED=false`
  intentional? Add branch protection + required checks on main.
- **Carry-over**: update `skn-*` skills referencing single-file
  `live_chat_service.py`; `COOKIE_AUTH_MODE=dual` rollout; PR 2C cookie-only
  hardening; NEW-3 DIRECTOR/HEAD ws role.
- **Human-only verify**: watch the Telegram operator chat for `[HEALTH] …
  DOWN / RECOVERED` (now single, not duplicated) on the next real outage.

## Today's shipped work (7 items, all deployed + verified as far as safe)

1. `HEALTH_ALERT_TELEGRAM_ENABLED=true`
2. `TRUST_PROXY_HEADERS=true` + PR #139 leftmost-XFF spoof fix
3. PR #140 Redis-backed HTTP rate limits (`5×201+11×429`)
4. PR #141 broadcasts table (scheduler error stopped)
5. PR #142 geography tables adoption (no-op, endpoint stays 200)
6. PR #143 LIFF empty-body validation (`POST {}` → 422)
7. PR #144 cross-worker auth limiter + health-alert dedup (this checkpoint)

## Environment notes

- Manual `koyeb services redeploy` races with the merge-triggered CD workflow —
  poll for "latest healthy deployment whose sha == merge commit".
- Session cost was very high (~$650); a fresh session is recommended for the
  remaining low-priority follow-ups.

## Blockers

- _none_
