# Plan Review — Round 2 (re-validation of revised plan)

**Plan:** `docs/superpowers/plans/2026-09-12-feature-line-audit-fix-map.md` (3713 lines)
**PRD:** `docs/superpowers/specs/2026-09-12-feature-line-audit-fix-map.md`
**Date:** 2026-09-13 | **Reviewers:** 2 independent (A + B) | **Verdict: NEEDS-REVISION** (unanimous)

Both reviewers verified the first half (lines ~30–1914) is strong (~7/10 alone):
round-1 dead refs, invented signatures, placeholders, missing sections, C8 ghost-push
task, fixtures statement — all genuinely fixed and spot-checked against the repo
(26 reference checks combined, ~all exact).

## Blocking findings (fix all before Wave A)

**F1. Two contradictory copies of the same tasks in one file.** Copy-1 lines 30–1914
(revised) vs copy-2 lines 1932–3666 (stale): same task IDs, divergent interfaces
(A1 `require_liff_identity(x_liff_id_token)->str` vs `(request: Request)->dict`;
copy-1 A1 doesn't touch `config.py`, copy-2 does; B2 `down_revision` differs;
A3 scope differs). D1–D7 exist ONLY in the stale copy. Fix: delete stale copy
(lines ~1928–3664, keeping the Wave D overview/ordering note if still accurate),
keep one definition per task ID, rewrite D1–D7 detail in the revised style
(sync TestClient, fully-defined fixtures, verified refs).

**F2. Stale half reintroduces round-1 failures:** undefined fixtures (`db_session`,
`private_media`, `db_session_factory`, `query_counter`, `staff/admin_token`,
`fire_heartbeats`, …); `AsyncClient`/`await test_client.*` contradicting Global
Constraints (plan:22); invented `encrypt/decrypt` with NameError bodies;
`request.session.get("csrf")` despite no session middleware; Bearer-token tests
contradicting cookie-only repo + PRD out-of-scope. All gone with F1 deletion —
verify none leak into the rewritten D-tasks.

**F3. D1 limit contradiction (round-1 carry-over).** `Query(20, le=100)` + manual
clamp line + test demanding `limit=9999 → 200`. With `le=100` FastAPI returns 422
and the clamp is dead code. Pick ONE semantic: `le=100` (test must expect 422)
or clamp-only (drop `le`).

**F4. D7 self-contradictory.** Declares image-resize verify-only ("ห้ามสร้าง
endpoint") yet tests POST `/api/v1/image-resize` (nonexistent → 404/405, never
passes); `DEFAULT_POLICY[...] = ["SUPER_ADMIN"]` mistypes real
`dict[str, frozenset[UserRole]]` (permissions.py:80).

**F5. 6 async fixtures use bare `@pytest.fixture`** (plan:172, 382, 1294, 1553,
1577, 1732; zero `pytest_asyncio` in file; no `asyncio_mode` in backend/pytest.ini).
Repo precedent errors at setup (test_booking_create_concurrency.py:95–97). Use
`@pytest_asyncio.fixture`. Affects A2, B1, C5, C7, C8.

**F6. B2 migration SQL as-written fails.** Unquoted `key` (Postgres reserved word)
in 4 raw-SQL statements; `SystemSettingResponse.model_validate(s, update={...})`
— Pydantic V2 `model_validate` has no `update` kwarg (use constructor or
`model_copy(update=…)`).

**F7. B1 test imports `TRANSFER_ERR_CONFLICT` from the package** (plan:375) but
Step 3 never exports it (`live_chat_service/__init__.py:27–31,55–60`) → ImportError.

**F8. Self-Review validates the wrong version** (§1 maps stories 18–19 to "B1+D1",
never mentions C8; §3 certifies stale signatures). Re-run the Self-Review scan
against the actual surviving text after F1.

## Settled by owner (2026-09-13, computed from all 52 revisions)

- **Single alembic head = `t1u2v3w4x5y6`.** Reviewer A's "3 heads" claim is wrong
  (miscount); Reviewer B correct. `z1a2b3c4d5e6` is mid-chain (`a2b3c4d5e6f7`
  revises it) — NOT a valid `down_revision`. New migrations use
  `down_revision = "t1u2v3w4x5y6"` (re-verify with `alembic heads` at merge time).
- Copy-2 B1 import is uncollectable (confirmed): `transfer_session` is a mixin
  method (`sessions.py:248`), not a module function; the call arg order is also wrong.

## Minor (non-blocking, fix opportunistically)

- C3 cites `intent_matching.py:34-82` without `message_intake/` prefix.
- `POST/PUT /api/v1/admin/intents/keywords` vs actual `@router.post("/keywords")`
  (admin_intents.py:161) — verify mounted path.
- Health "line 140" is actually 142; test_liff_token "146–159" is 147–160.
