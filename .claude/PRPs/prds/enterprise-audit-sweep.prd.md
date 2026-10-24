# PRD — Enterprise Audit Sweep (read-only first, fixes as follow-up PRs)

## Problem
User asked (Thai): check bugs, find breaking points, verify every function, workflow, and logic across the whole system at production enterprise grade. No single failing area is named. Last known state: main is at PR #256 (login redirect flake fix, 2026-10-15). Open items already tracked: Round-3b (22 items), broken `upload-security` test file, Phase A relaunch (3 owners stopped, zero commits), 74 review findings recorded 2026-10-14, plus a pending user smoke test (single-attempt login after backend cold start).

## Goals
1. Produce an evidence-backed inventory of what exists (backend 27 endpoint modules, ~26 services, ~20 admin pages, LIFF surfaces, WS live-chat, LINE webhook, booking, upload/media, auth/cookie session, RBAC permissions).
2. Run the full existing verification gates and record exact pass/fail per gate (no "all green" claims without output).
3. Triage every finding by severity (Critical / High / Medium / Low) with file:line + repro or log evidence.
4. Fix nothing in this audit run except what the approved follow-up plan explicitly lists — one verifiable unit per PR (sequence-verifiable-units).

## Non-goals
- No production data mutation, no prod deploys, no env var flips in this run.
- No secret output anywhere (Iron Rule 2026-10-13: counts/hashes/presence only; live secret needed => stop and ask first).
- No broad refactor, no dependency upgrades, no design-system changes.
- No duplicate work: Round-3b / upload-security / Phase A items are referenced, not re-planned, unless the audit proves a root cause they missed (fix-root-causes).

## Scope (read-only audit lanes)
- Lane A backend: `backend/app/api/v1/endpoints/` (27 modules incl. `webhook.py:process_webhook_events`, `ws_live_chat.py`, `auth.py`, `liff.py`, `media.py`, `admin_broadcast.py`), `services/`, `models/`, `schemas/`, `core/` (config, security, audit, permissions), Alembic heads vs PROD.
- Lane B frontend: `frontend/app/admin/*`, `frontend/app/liff/*`, `components/`, `hooks/`, `lib/` (incl. `api-error.ts:readErrorMessage`, `mask.ts:maskLineUserId`), `contexts/AuthContext.tsx`.
- Lane C realtime: WS live-chat (`ws_manager`, auth -> join_room -> message, transfer_session, `access_live_chat` gate) + LINE webhook dedup (Redis lock token flow).
- Lane D cross-cutting: authN/Z (cookie-only, `get_current_admin/manager/staff`, permission keys), error handling (HTTPException code precedent per AGENTS.md), logging, circuit breaker `_call_with_circuit`, rate limits (413/429), pagination bounds, ILIKE escaping, PII masking.
- Lane E quality gates: backend pytest (159 test files), frontend vitest, tsc, eslint, next build, prod smoke (read-only GETs only).

## Success criteria
- [ ] Inventory table exists with per-lane file lists + hotspot symbols (from graft).
- [ ] Gate table exists: backend pytest / frontend vitest / tsc / eslint / next build / prod smoke, each with exact command + raw result (pass count + named failures).
- [ ] Findings file exists with severity, file:line, evidence, and disposition (fix-now in follow-up PR vs defer with reason).
- [ ] Follow-up fix plan lists PR-sized units in dependency order, each with its own verification.
- [ ] No code change on `main`; all audit docs committed on `feat/enterprise-audit-sweep` only.

## Known inputs (do not re-investigate from zero)
- Round-3b 22 items, `upload-security.test.ts` breakage, Phase A relaunch state, 74 findings (2026-10-14), login cold-start smoke task.
- Graft hotspots: `require_permission` (deps.py, 80 callers), `create_audit_log` (46), `resolve_by_line_id` (44), `invalidate_cache` (permissions.py, 37), `readErrorMessage` (31 front callers).

## Risks
- Full pytest + build is slow on Windows/WSL; gate runs may need PG16 on port 5434 + redis override (`~/bin/run-pytest.sh` pattern).
- Prod smoke needs admin cookie session; direct curl without it returns 401 by design (not a bug).
- WSL `grep -P` broken (use sed); PowerShell eats `$()` in double quotes (write bash script file + `tr -d '\r'`).

## Open questions for user (approval gate)
1. May the audit run the full backend suite + frontend build locally (slow, read-only)? Default yes.
2. May it hit PROD with read-only smoke (health + login page 200, transfer endpoint 401 check)? Default yes.
3. Fix policy after triage: fix Critical+High immediately in stacked PRs, or report-only first? Default report-only first.
