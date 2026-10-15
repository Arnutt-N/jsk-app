# Audit Fixes — ECC lane (`fix/audit-f1f4-ecc`)

Methodology: skills-first per lane (testing_standards F1–F2, database_postgresql_standard F2,
senior-frontend F3–F4, react_19_patterns F4). Order: F2-prove → F1 → F3 → F4.
One commit per fix. IRON RULE honored: no secret values printed anywhere below
(keys referenced by presence/description only; counts only).

## F2 — `test_inbox_equivalence_db` InvalidToken (stale-data artifact, NOT a code bug)

- Skill applied: `database_postgresql_standard` (no schema change bypassing Alembic;
  test-data concern fixed in tests only) + `testing_standards` §2.3 (separate test DB hygiene).
- Approach: prove root cause BEFORE touching code — (1) reran the node on the persistent
  local DB, (2) reran on a fresh migrated DB, (3) diffed relevant files vs `main` (= base).
- Proof evidence:
  - Persistent DB (`skn_app_db`): `FAILED tests/test_inbox_distinct_on.py::test_inbox_equivalence_db`
    with `cryptography.fernet.InvalidToken`, raised in
    `get_conversations` → `decrypt_line_ids_for_users` (fail-loud batch decrypt of every
    user row in the inbox window, `conversations.py:176` → `user_identity_service.py:174`).
  - Fresh DB (`skn_app_test_f2fresh`, `alembic upgrade head` with the committed pytest dummy
    `ENCRYPTION_KEY`): `2 passed` (whole file, both nodes).
  - Read-only probe of `skn_app_db.users`: 8 rows carry tokens; 4 decrypt OK under the pytest
    dummy key, 4 (ids 1, 2, 3, 8) do not — stale rows encrypted under a different key
    (dev runs with a real key). Counts only; no token material read or printed.
  - `git diff main --stat` over `test_inbox_distinct_on.py`, `identity_helpers.py`, `conftest.py`,
    `user_identity_service.py`, `credential_service.py`: empty → failure occurs on base code too.
  - Conclusion: environmental stale-data artifact. The test already cleans up its own nonce rows;
    production fail-loud decrypt contract is deliberate (a tolerant variant exists only for
    cleanup ticks), so no app-code change.
- Diff: module-docstring note in `backend/tests/test_inbox_distinct_on.py` documenting the
  shared-DB staleness hazard + reset procedure (recreate DB / `alembic upgrade head` with the
  dummy key / point `DATABASE_URL` at a fresh DB). No schema change, no Alembic revision,
  no app code touched, no rows deleted from the shared dev DB.
- Verification: `pytest tests/test_inbox_distinct_on.py -q` on the fresh DB → `2 passed`.
  (On the stale persistent DB the node still fails by design — that is the documented hazard.)

## F1 — `test_detailed_and_ws_health_require_admin` fails when `DEV_AUTH_BYPASS=true`

- Skill applied: `testing_standards` §1 (test behavior, not implementation) + §2.3 (test DB/env hygiene).
- Approach: reproduced first — node passes with bypass off, fails with `DEV_AUTH_BYPASS=true`
  exported (simulating the local `backend/.env` + `backend/app/.env` condition from the audit).
  The gate under test (`get_current_user` → `get_current_admin` on both health endpoints)
  reads the `settings.DEV_AUTH_BYPASS` singleton at request time, so the test now pins that
  precondition instead of inheriting ambient env.
- Diff: `backend/tests/test_health_hardening.py` — `test_detailed_and_ws_health_require_admin`
  takes `monkeypatch` (function-scoped, auto-undone) and forces
  `api_deps.settings.DEV_AUTH_BYPASS` to `False` before asserting 401/403. Test-only change;
  no `.env` file created, modified, or committed (both remain absent/untracked in this checkout).
- Verification: `pytest tests/test_health_hardening.py -q` → `2 passed` with bypass unset AND
  with `DEV_AUTH_BYPASS=true` exported.

## F3 — eslint red only from generated Playwright bundles

- Skill applied: `senior-frontend` (Next.js config hygiene — generated output excluded from
  source gates, same class as `.next/`/`out/`/`dist/` ignores already in the flat config).
- Approach: added the generated report dir to the eslint flat-config `ignores` (one-line class
  change); no source file touched, no rule relaxed.
- Diff: `frontend/eslint.config.mjs` — `ignores` gains `"playwright-report-2client/**"`.
- Verification: `npm run lint` (after a clean `npm ci`; lockfile identical to base) → exit 0,
  `0 errors, 11 warnings`. Ignore proof: dropped a fatally-broken stub JS file into
  `playwright-report-2client/trace/`, reran lint → still exit 0 with the same 11 warnings
  (stub invisible to the gate), then deleted the stub. Working tree holds only the config edit.

## F4 — 9 first-party warning spots → 0 warnings (behavior-preserving)

- Skills applied: `react_19_patterns` (compiler-era: exact dep arrays, no new manual
  `useMemo`/`useCallback` bloat — only dep-array corrections) + `senior-frontend` (Next.js
  `Image` for `<img>`, semantic-preserving component edits).
- Approach: minimal exact fix per spot; no function bodies changed except the AuthContext
  destructure reorder (same values, same effect order) and the Image swaps (same src/alt/
  classes/handlers). No test expectations touched — the one test-file edit only retypes the
  fetch mock (all 30 assertions intact); the mid-course correction (zero-arg impl broke
  `tsc` via `never[][]` calls typing) was resolved with an explicit `Mock<...>` annotation
  instead of touching assertions.
- Diff (8 files):
  - `chat-histories/[lineUserId]/page.tsx` — dropped unreferenced `lineUserId` from
    `handleExport` deps → `[messages, displayName]`.
  - `friends/history/page.tsx` — dropped module-const `perPage` (= 20, never reactive)
    from `fetchEvents` deps.
  - `rich-menus/page.tsx`, `settings/custom/page.tsx`, `settings/line/page.tsx` — added
    missing `toast` dep (stable `useCallback` in the Toast provider, so no re-render change).
  - `CommandPalette.tsx` — dropped unreferenced `logout` from the items `useMemo` deps
    (`logout` still used by the confirm handler outside the memo).
  - `files/page.tsx` — two `<img>` → `<Image unoptimized>` (same src/alt/class/onError;
    thumbnail uses `fill` + `relative` parent, modal uses explicit dimensions per repo
    precedent; `unoptimized` because sources are authenticated/dynamic media URLs the
    optimizer must not process).
  - `AuthContext.tsx` — `const { csrf_token, ...userFields }` then `if (csrf_token)
    setCsrfToken(csrf_token)` (was: use-then-discard-as-`_csrf`); token still stripped
    from the stored user object, CSRF store write happens before auth-state set, as before.
  - `image-resize/__tests__/upload-security.test.ts` — mock typed as
    `Mock<(input, init?) => Promise<Response>>` with an arg-free impl (params were ignored);
    zero assertion/behavior change.
- Verification (from `frontend/`): `npm run lint` → exit 0, 0 errors, 0 warnings (was 11);
  `npx tsc --noEmit` → exit 0; `npm run build` → exit 0, compiled + 49/49 static pages;
  `npm run test:unit` → 785/785 passed (91 files); targeted
  `upload-security.test.ts` → 2/2 passed.
