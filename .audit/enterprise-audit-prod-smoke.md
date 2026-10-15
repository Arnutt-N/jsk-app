# Enterprise Audit — Prod Smoke (READ-ONLY GETs)

Branch: `feat/enterprise-audit-sweep` (verified via `git branch --show-current`, not switched).
Mode: read-only investigation, GETs only with short timeouts. No code edited.
Throughput checkpoint: n/a, read-only investigation.
IRON RULE: no secret values used or printed. No `.env` values read. No login attempted.

## Prod base URLs (NON-SECRET repo config/docs only)

- Backend: `https://conservative-lusa-jsk-4p0-88fe8c20.koyeb.app` — source `docs/remediation/cookie-auth-rollout-runbook.md:62` (public deploy hostname in runbook; health-check example).
- Frontend: `https://jsk-app.vercel.app` — source `.claude/PRPs/prds/region-migration-frankfurt.prd.md:7` and `.claude/PRPs/plans/completed/region-migration-frankfurt-phase1-2.plan.md:141` (public Vercel URL in plan docs).
- Health path: `/api/v1/health` — source `backend/app/api/v1/endpoints/health.py:21`.
- Admin rich-menus prefix: `/api/v1/admin/rich-menus` — source `backend/app/api/v1/api.py:50`.

## Smoke commands (codes only, bodies discarded)

```bash
curl -s -o /dev/null -w "%{http_code}" --max-time 20 https://conservative-lusa-jsk-4p0-88fe8c20.koyeb.app/api/v1/health
curl -s -o /dev/null -w "%{http_code}" --max-time 20 https://jsk-app.vercel.app/
curl -s -o /dev/null -w "%{http_code}" --max-time 20 https://conservative-lusa-jsk-4p0-88fe8c20.koyeb.app/api/v1/admin/rich-menus
```

Raw output (HTTP codes, no bodies):

| Check | Result | Expected |
|---|---|---|
| `GET <backend>/api/v1/health` | 200 | 200 |
| `GET <frontend>/` | 200 | 200 |
| `GET <backend>/api/v1/admin/rich-menus` (no cookie) | 401 | 401 (hardened, not a bug) |

## Deployment markers observed (headers only, no bodies)

- Backend: `server: cloudflare`, `x-koyeb-backend: fra`, `x-koyeb-brand: koyeb_default`, `x-koyeb-glb: sin`, `cf-cache-status: DYNAMIC`. Note: `HEAD` on `/api/v1/health` returns 405; `GET` returns 200 (recorded above).
- Frontend: `server: Vercel`, `x-matched-path: /`, `x-vercel-cache: HIT`.

`x-koyeb-backend: fra` matches the Frankfurt region-migration target in the plan docs.

## SKIPPED (needs admin session — not attempted)

- Authenticated admin checks (login flow, cookie issuance, authorized rich-menu list, WS auth, permission matrix reads). Per IRON RULE no live secret or login is attempted; these steps stop here as SKIPPED (no admin session).

Verdict: all three public smoke codes match expectations; Frankfurt Koyeb + Vercel markers confirmed.
