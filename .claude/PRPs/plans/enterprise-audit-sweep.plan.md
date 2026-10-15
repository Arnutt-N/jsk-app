# Plan — Enterprise Audit Sweep (7 phases, read-only through Phase 5)

PRD: `.claude/PRPs/prds/enterprise-audit-sweep.prd.md`
Branch: `feat/enterprise-audit-sweep` (created, based on main @ PR #256 merge)
Mode: investigation only until user approves fix phase. No code edits before Phase 6 approval.

## Phase 0 — Pickup + branch [DONE]
- Files: this plan + PRD + `.audit/enterprise-audit-sweep.todo.md`
- Validation: `git branch --show-current` => `feat/enterprise-audit-sweep`; `git status --short` clean except new docs.

## Phase 1 — Static inventory (read-only, no test runs)
- Steps:
  1. `graft skeleton` on top-10 hotspot files (deps.py, audit.py, user_identity_service.py, permissions.py, webhook.py, ws_live_chat.py, LiveChatContext.tsx, AuthContext.tsx, api-error.ts, mask.ts).
  2. `graft callers require_permission`, `graft callers resolve_by_line_id`, `graft callers create_audit_log` (blast radius notes).
  3. List Alembic heads: `python scripts/db_target.py alembic --target local heads` + `history | head`.
  4. Write `.audit/enterprise-audit-inventory.md` (lane tables + hotspot table).
- Validation: inventory file exists; every row has a file path that `ls` confirms.

## Phase 2 — Backend gates (read-only runs)
- Commands (from `backend/`):
  - `python -m pytest -q` (full; record N passed / named failures)
  - `python -m pytest tests/test_websocket.py -q` (WS lane isolation)
  - `ruff check app tests || true` if ruff configured; else note `no ruff config`.
- On env failure: fall back to `DATABASE_URL` override pattern (`~/bin/run-pytest.sh`, PG16 port 5434 + redis) and record which fallback was used.
- Validation: paste raw tail (last 15 lines) into `.audit/enterprise-audit-gates-backend.md`; never summarize counts from memory.

## Phase 3 — Frontend gates (read-only runs)
- Commands (from `frontend/`): `npm run lint`, `npx tsc --noEmit`, `npm run test:unit`, `npm run build`.
- Pre-existing `upload-security.test.ts` breakage: record exact `tsc`/vitest error text; do not fix here.
- Validation: `.audit/enterprise-audit-gates-frontend.md` with 4 raw outputs.

## Phase 4 — Security + error-handling scan (read-only)
- Checks: secret grep by count only (`git grep -c "BEGIN PRIVATE KEY\|sk-live\|xoxb-" || true` — counts, never values); auth-gate list (`get_current_admin/manager/staff`, `access_live_chat`); HTTPException code audit (expect 400/401/403/404/409/413/422/429/500/502/503 per AGENTS.md); PII masking spots (`maskLineUserId` callers = 13 expected); upload caps (1 MB LINE rich-menu vs 10 MB media); rate-limit buckets (`liff-submit` 5/300s).
- Validation: `.audit/enterprise-audit-security.md` with counts + file:line per claim.

## Phase 5 — Prod smoke (read-only GETs only)
- Checks: backend `/api/v1/health` 200 + `database/redis:true`; frontend `/` 200; `GET /admin/rich-menus` without cookie => 401 (expected hardened); `GET /health/pseudonym-gate` shape only if admin session available, else record `skipped: no admin session`.
- Validation: `.audit/enterprise-audit-prod-smoke.md` with HTTP codes + deployment SHAs; no response bodies containing IDs/tokens pasted.

## Phase 6 — Triage + fix plan (STOPS for user approval)
- Write `.audit/enterprise-audit-findings.md`: one row per finding (severity / file:line / evidence / disposition). Map against Round-3b 22, upload-security, 74 findings to avoid duplicates.
- Propose follow-up PR units (each: failing test first, then fix — sequence-verifiable-units), max 1 concern per PR, ordered by dependency.
- Validation: self-review vs PRD success criteria; then `ask_user_question` (fix-now vs report-only).

## Phase 7 — Review + handoff (no merge without approval)
- Run reviewer pass on audit docs only; commit docs on `feat/enterprise-audit-sweep`; push; open PR as `report-only` (no code diff) OR proceed to fix PRs only on explicit user go.
- Handoff via `node .agents/scripts/handoff-new.cjs pi "<summary>"` + regenerate views; cite Iron Rule in checkpoint + summary.

## Stop conditions
- Any gate blocked by environment after 2 fallback attempts => record BLOCKED with exact error, continue other lanes.
- Any step needing a live secret => stop that step, ask user (Iron Rule), never guess.
- Any Critical finding threatening prod data => pause fix work, report immediately.
