# Session Summary — claude_code (Fable 5) — 2026-07-18T21:28:00+07:00

**Branch**: `main`  **HEAD**: `0b41c33`
**Checkpoint**: `.agents/state/checkpoints/handover-claude_code-20260718-2128.json`

> **Platform Meta**
> | Field | Value |
> |-------|-------|
> | AI CLI IDE | Claude Code |
> | Provider | Anthropic |
> | Model | Fable 5 |
>

## Objective

Close the LIFF empty-body validation gap found earlier today: with
`LIFF_STRICT_MODE=false`, a bare `POST /api/v1/liff/service-requests {}`
validated and wrote a junk row (the server trusted the client's form
validation entirely).

## Completed — LIFF server-side validation (PR #143, `0b41c33`)

**Root cause**: every field on `ServiceRequestCreate` was `Optional` with a
default, so an empty/all-blank body passed Pydantic and the endpoint wrote a
row with `requester_name='None None'` and all content NULL.

**Fix**:
- `ServiceRequestCreate` gains a `model_validator(mode="after")` that requires
  **content** — a topic (`topic_category` or legacy `service_type`) **or** a
  `description`. Empty/whitespace-only → **422**.
- **Requester name is deliberately NOT required.** The existing
  `test_prd_e_drug_reporting` cases construct requests with content but no name
  — because drug-report tips (`แจ้งเบาะแสยาเสพติด`) are legitimately
  **anonymous**. My first attempt required a name and broke 9 of those tests;
  the correct, domain-aware rule is content-only.
- `liff` endpoint: guard the `full_name` f-string parts with `or ''` and store
  `requester_name = full_name or None`, so an anonymous submission is NULL, not
  the literal `"None None"`.

**Why a validator, not just `LIFF_STRICT_MODE=true`**: strict mode only
requires a *token*; a client with a valid token could still POST an empty
body. This is a data-integrity fix at the boundary, orthogonal to auth.

**Verification**:
- TDD: 9 new `test_service_request_liff_validation.py` cases (empty /
  whitespace / no-content → 422; anonymous-with-content, description-only,
  service_type-only → accepted). RED → GREEN.
- `test_liff_token` (7) + `test_prd_e_drug_reporting*` (22) still green.
- Full suite **618 passed / 1 skipped** locally (3 websocket files excluded —
  pre-existing Windows proactor hang; green on Linux CI).
- CI on PR #143: all green. Deployed to Koyeb (`109405b3`, sha `0b41c33`).
- **Live on prod**: `POST {}` → **422** with the correct message; anonymous
  `{topic, description}` → **201** with `requester_name: null` (full_name fix
  confirmed). Cleaned the verify row (id 46); all session junk rows (31–46)
  gone, 0 recent remaining.

**Gotcha**: `curl` on Git Bash mangles inline `-d` Thai UTF-8 → 400 "There was
an error parsing the body". Use `--data-binary @file.json` (a UTF-8 file) for
Thai payloads. (The first anonymous-tip prod check 400'd for exactly this
reason, not a code bug.)

## Next Steps

- **Decision for the user**: also set `LIFF_STRICT_MODE=true` on prod? It
  requires a LIFF token on every submission — orthogonal to this fix, which
  already blocks empty bodies regardless of auth.
- **Last §8 follow-up (no runtime impact)**: harmonise the ORM model vs live
  schema FK nullability (`districts.province_id` / `sub_districts.district_id`
  are `nullable=False` in the model but NULLABLE in live PROD).
- **Follow-up**: Redis-back the WS/auth in-process limiters (`rate_limiter.py`)
  if cross-worker enforcement is needed; the health watchdog runs per-worker so
  may send duplicate Telegram alerts (2 workers).
- **Decisions for the user**: is `SLA_ALERT_TELEGRAM_ENABLED=false` on prod
  intentional? Add branch protection + required checks on main.
- **Carry-over**: update `skn-*` skills referencing single-file
  `live_chat_service.py`; `COOKIE_AUTH_MODE=dual` rollout; PR 2C cookie-only
  hardening; NEW-3 DIRECTOR/HEAD ws role.
- **Human-only verify**: watch the Telegram operator chat for `[HEALTH] …
  DOWN / RECOVERED` on the next real outage.

## Today's shipped work (all verified on PROD)

1. `HEALTH_ALERT_TELEGRAM_ENABLED=true`
2. `TRUST_PROXY_HEADERS=true` + PR #139 leftmost-XFF spoof fix
3. PR #140 Redis-backed HTTP rate limits (`5×201+11×429`)
4. PR #141 broadcasts table (scheduler error stopped)
5. PR #142 geography tables adoption (no-op, endpoint stays 200)
6. PR #143 LIFF empty-body validation (this checkpoint; `POST {}` → 422)

## Environment notes

- Prod ORM queries / cleanup: `DEV_AUTH_BYPASS=false PYTHONPATH=. ENV_FILE=.env
  venv/Scripts/python.exe …`.
- Manual `koyeb services redeploy` races with the CD workflow triggered by the
  merge — poll for "latest healthy deployment whose sha == merge commit",
  not a specific deployment id.

## Blockers

- _none_
