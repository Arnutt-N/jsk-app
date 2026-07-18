# Session Summary — claude_code (Fable 5) — 2026-07-18T20:49:00+07:00

**Branch**: `main`  **HEAD**: `cff7465`
**Checkpoint**: `.agents/state/checkpoints/handover-claude_code-20260718-2049.json`

> **Platform Meta**
> | Field | Value |
> |-------|-------|
> | AI CLI IDE | Claude Code |
> | Provider | Anthropic |
> | Model | Fable 5 |
>

## Objective

Close the remaining §8 live-schema drift (`docs/remediation/
preflight-evidence-and-designs.md`): the geography reference tables
`provinces` / `districts` / `sub_districts`, declared by
`app/models/geography.py` but never captured in a migration. (`broadcasts`,
the fourth §8 table, was fixed earlier today in PR #141.)

## Completed — geography tables adoption (PR #142, `cff7465`)

**Investigation first — the §8 doc was stale.** Unlike `broadcasts` (a truly
missing table causing a runtime error), all three geography tables **already
existed and were fully seeded** on both environments:

| Table | local | PROD |
|---|---|---|
| provinces | 77 | 77 |
| districts | 928 | 928 |
| sub_districts | 7436 | 7436 |

`GET /api/v1/locations/provinces` on PROD already returned 200 with data. So
there was **no runtime error** — the real drift was "tables exist but Alembic
doesn't track them" (created historically via `create_all`/seed, never a
migration). Risk: a fresh DB built purely from migrations would lack them and
the LIFF address dropdowns would break; autogenerate keeps wanting to create
them.

**Adoption migration `z1a2b3c4d5e6`** (down_revision `y0z1a2b3c4d5`):
- Idempotent: `upgrade()` no-ops on existing DBs (guarded by table-existence),
  Alembic records the revision; a fresh DB gets the schema.
- Mirrors the **live** schema (introspected on PROD), not the model, where
  they differ: live `districts.province_id` / `sub_districts.district_id` are
  **NULLABLE**, but the model declares `nullable=False`. Did NOT silently
  `NOT NULL` live columns — left as a follow-up.
- Seed data (8k+ rows) NOT in the migration (separate seed step).
- `downgrade()` is a deliberate no-op (dropping seeded reference tables that
  predate migration tracking = data loss with no migration-tracked recovery).

**Verification**:
- Local: apply no-ops + records revision (`alembic current` → `z1a2b3c4d5e6`).
- **Fresh throwaway DB**: full migration chain from base creates all three geo
  tables (3/5/7 cols, correct indexes + FKs) plus `broadcasts` — end-to-end
  create path green.
- CI on PR #142: all green.
- **PROD applied**, head now `z1a2b3c4d5e6`; verified a **true no-op** —
  endpoint still 200 with 77 provinces, row counts unchanged (77/928/7436).

All four §8 tables (`broadcasts` + the three geography tables) are now
schema-tracked in migrations.

## Next Steps

- **Last §8 follow-up (no runtime impact)**: harmonise the ORM model vs live
  schema on FK nullability — model declares `districts.province_id` /
  `sub_districts.district_id` `nullable=False` but live PROD has them NULLABLE.
  Either `ALTER ... SET NOT NULL` (after confirming no NULL FK rows) or relax
  the model. This clears §8 entirely.
- **MED — LIFF empty-body gap**: `POST {}` → 201 + junk row when
  `LIFF_STRICT_MODE=false`. Tighten `ServiceRequestCreate` or enable strict.
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

## Today's arc (all shipped + verified on PROD)

1. `HEALTH_ALERT_TELEGRAM_ENABLED=true` (deploy `13497ee2`)
2. `TRUST_PROXY_HEADERS=true` + PR #139 leftmost-XFF spoof fix
3. PR #140 Redis-backed HTTP rate limits (`5×201+11×429` verified)
4. PR #141 broadcasts table (scheduler error stopped)
5. PR #142 geography tables adoption (this checkpoint)

## Environment notes

- Fresh-DB migration test: `env.py` reads `DATABASE_URL` from the env var
  first, so `DATABASE_URL=postgresql+asyncpg://…/geo_migtest python -m alembic
  upgrade head` runs the chain against a throwaway DB (create/drop via asyncpg
  on the `postgres` db).
- Prod ORM queries: `DEV_AUTH_BYPASS=false PYTHONPATH=. ENV_FILE=.env
  venv/Scripts/python.exe …`.

## Blockers

- _none_
