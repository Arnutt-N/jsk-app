# Audit Findings — Enterprise Sweep (Phase 6 triage, REPORT-ONLY, no fixes applied)

Branch: `feat/enterprise-audit-sweep`. Evidence files: `.audit/enterprise-audit-{inventory,gates-backend,gates-frontend,security,prod-smoke}.md`.
Rule: nothing below is fixed in this run. Each row names severity, file:line, evidence, and disposition.

## Gate scoreboard

| Lane | Result |
|---|---|
| Backend collect | PASS — 1476 collected, 0 errors |
| Backend websocket | PASS — 10/10 |
| Backend full suite | 1469 passed, **2 failed**, 5 skipped |
| Frontend lint | FAIL exit 1 — **all 185 errors in generated files, 0 in source** |
| Frontend tsc | PASS — 0 errors |
| Frontend unit | PASS — 91/91 files, 785/785 tests |
| Frontend build | PASS — 50/50 routes |
| Security scan | PASS — no live secrets; gates + codes + masks + caps verified |
| Prod smoke | PASS — 200 / 200 / 401 as designed |

## Findings

### F1 — Low (test-env only): `test_detailed_and_ws_health_require_admin` fails under local env
- Test: `backend/tests/test_health_hardening.py:8-11` — asserts unauthenticated `GET /api/v1/health/detailed` returns 401/403.
- Failure: `AssertionError: /api/v1/health/detailed` (full-suite tail, gates-backend file).
- Root cause (proven): local env files `backend/.env` + `backend/app/.env` both set `DEV_AUTH_BYPASS=true` (boolean flag, not key material), so the dev bypass answers 200 locally. Prod is unaffected — prod smoke shows the same class of admin endpoint returns 401 without a cookie.
- Disposition: follow-up PR-1 — make the test force the bypass off (or set the flag false in the test env), then rerun the node. One concern per PR.

### F2 — Medium (root cause UNPROVEN): `test_inbox_equivalence_db` raises `InvalidToken`
- Test: `backend/tests/test_inbox_distinct_on.py:54` (`@pytest.mark.skipif` when PG unreachable — it RAN, so local PG was up); failure `cryptography.fernet.InvalidToken` (gates-backend file).
- Prime suspects (not yet proven): (a) stale rows in the persistent local test DB (`skn_app_db` on docker :5432) encrypted under a different key from an earlier run; (b) `os.environ.setdefault` vs `ENV_FILE` precedence split for the encryption key (`backend/tests/conftest.py:17-36` sets test defaults only when the env lacks them). The committed test key itself is a dummy and is never printed anywhere.
- Disposition: confirm FIRST by rerunning the single node on a fresh test DB, then rerunning it on `main` base. If it passes on fresh DB => stale-data artifact, add a DB-reset note to the test docs. If it fails on base too => pre-existing failure, fix in its own PR. No code touched until the rerun proves which one.

### F3 — Low (config): eslint gate red only because of generated Playwright bundles
- Evidence: `npm run lint` exits 1 with 3024 problems; all 185 `error` lines sit under `frontend/playwright-report-2client/trace/*` (minified bundles). Zero errors in first-party source (gates-frontend file, complete warning list quoted there).
- Disposition: follow-up PR-2 — add the generated report dir to eslint flat-config `ignores`, rerun gate. One-line-class change, gate rerun is the proof.

### F4 — Info (backlog): 2839 lint warnings in source, 9 first-party spots
- Spots (from gates-frontend file): `exhaustive-deps` (chat-histories `[lineUserId]`, friends history, rich-menus, settings custom/line), `no-img-element` (files page x2), `no-unused-vars` (upload-security test `input`/`init`, AuthContext `_csrf`).
- Disposition: cleanup backlog, NOT blocking — tsc and build are green. Do not bundle with F1-F3 fixes.

### F5 — CLOSED: `upload-security.test.ts` breakage is already fixed
- Evidence: `npx tsc --noEmit` exits 0 with zero errors; fix landed as `ceed1ff` ("type fetch mock in upload-security test (#244)"). Remove this from the open list.

### F6 — VERIFIED, no action: security + prod smoke
- Secrets: 0 private keys, 0 live tokens (2 doc-text prefix mentions re-verified by line length: 58/39 chars — too short to hold live key material).
- Auth gates present with fail-closed semantics (`deps.py:30/143/176/201/236`, `permissions.py:67-69/76/156`).
- Error codes: expected set 400/401/403/404/409/413/422/429/500/502/503 fully covered, no outliers.
- PII masking: 13 caller files as expected. Caps/buckets: rich-menu 1 MB, media 10 MB, `liff-submit` 5/300s, attachments 3 — all with enforcement lines.
- Prod: backend health 200, frontend 200, admin-without-cookie 401; Koyeb `fra` + Vercel markers match the region plan.

## Carried-over open items (referenced, not duplicated)
- Round-3b (22 items), Phase A relaunch (3 owners stopped, zero commits), 74 findings recorded 2026-10-14, user smoke test (single-attempt login after backend cold start).

## Proposed follow-up order (needs user go; one PR per unit)
1. Prove-F2: fresh-DB rerun + base rerun of `test_inbox_equivalence_db` (no code; evidence only).
2. PR-1: F1 test-env fix + node rerun green.
3. PR-2: F3 eslint ignores + lint gate green.
4. Backlog: F4 warning cleanup (only if user wants it).
