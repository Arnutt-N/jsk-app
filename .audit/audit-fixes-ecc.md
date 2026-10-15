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
