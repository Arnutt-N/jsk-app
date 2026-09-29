# PRP: Transfer Audit Fix M-8 (2026-09-28)

## Metadata
- **PRD:** `.claude/PRPs/prds/2026-09-28-transfer-audit-m8.prd.md`
- **Findings (binding):** `.claude/PRPs/findings/2026-09-27-full-codebase-findings.md` §M-8
- **Branch:** `fix/transfer-audit-m8` (from `main` @ `9706fa7`)
- **Coverage:** T1→fix · T2→tests · T3→frontend badge. Zero orphan requirements.
- **Working directory for backend commands:** `backend/`
- **Skill:** `writing-plans` (repo PRP format; exact files, exact code, no placeholders)

## Files to Change
1. `backend/app/services/live_chat_service/sessions.py` (T1: import + delete decorator + explicit audit call)
2. `backend/tests/test_transfer_race.py` (T2: reuse `seeded` fixture; +imports `AuditLog`, `select`)
3. `backend/tests/test_transfer_session_errors.py` (T2: docstring only, L5-6)
4. `frontend/app/admin/audit/page.tsx` (T3: one `ACTION_COLORS` line)
- **NOT touched:** `backend/app/core/audit.py` (shared decorator — frozen by PRD),
  both production call sites (already pass `from_operator_id`), no other tests.

## NOT Building
- Any decorator change or fallback key (rejected alternative — see PRD).
- Backfill of historical transfers (would fabricate history).
- `ip_address`/`user_agent` capture (no request context at service layer).
- A frontend test for the badge line (no test covers `ACTION_COLORS` today;
  the page falls back safely — verified `page.tsx:254`).

## Step-by-Step Tasks

### T1 — explicit audit row in transfer_session, dead decorator removed
- **ACTION:** Delete the never-firing decorator; emit the row explicitly after
  the successful mutation, inside the caller's transaction.
- **IMPLEMENT (3 exact edits in `sessions.py`):**
  1. L12 import becomes exactly:
     `from app.core.audit import audit_action, create_audit_log`
     (`audit_action` stays — still used by `claim_session` L34 and
     `close_session` L75, verified.)
  2. DELETE L248 `@audit_action("transfer_session", "chat_session")` (the line
     directly above `async def transfer_session`). Nothing else on that line.
  3. Insert this exact block after the `logger.info(f"Session {session.id}
     transferred ...")` line (L303) and BEFORE `return refreshed` (L304):
     ```python
        await create_audit_log(
            db,
            admin_id=from_operator_id,
            action="transfer_session",
            resource_type="chat_session",
            resource_id=str(session.id),
            details={
                "from_operator_id": from_operator_id,
                "to_operator_id": to_operator_id,
                "reason": reason,
            },
        )
     ```
     Placement rationale (pinned): after the rowcount gate, so `ValueError`
     paths raise before any row is staged (failed transfers stay unaudited);
     `create_audit_log` does add+flush with NO commit, so the row lands in
     the caller's `publish_session_event` commit atomically with the mutation
     (post-M-7 single unit of work).
- **MIRROR:** explicit `create_audit_log` usage in `session_cleanup.py`
  (`_mutate_close_inactive`); row shape mirrors the `SESSION_TRANSFERRED`
  payload minus ids already on the row.
- **VALIDATE:** `python -m pytest tests/test_live_chat_service.py
  tests/test_transfer_session_errors.py -q` (mock suites — must stay green;
  `create_audit_log` against `AsyncMock` db awaits `db.add`/`db.flush`
  harmlessly; NO mock-behavior change expected).
- **RISK (explicit):** none to other audited actions — the decorator file is
  untouched and the other 4 `@audit_action` sites keep working exactly as
  before.

### T2 — DB tests: row emitted on commit, absent on rollback + docstring fix
- **ACTION:** Prove the contract both ways using the existing `seeded`
  fixture in `test_transfer_race.py`; fix the stale decorator mention in
  `test_transfer_session_errors.py`.
- **IMPLEMENT:**
  - Add imports to `test_transfer_race.py`: `from sqlalchemy import select`
    (new line with the sqlalchemy imports) and
    `from app.models.audit_log import AuditLog` (with the app model imports).
  - NEW `test_transfer_emits_audit_row(seeded)`:
    ```python
    @pytest.mark.asyncio
    async def test_transfer_emits_audit_row(seeded):
        Session, ids = seeded

        async with Session() as db:
            await live_chat_service.transfer_session(
                line_user_id=ids["line"],
                from_operator_id=ids["a"],
                to_operator_id=ids["b"],
                reason="ฝากดูต่อ",
                db=db,
            )
            await db.commit()

        async with Session() as db:
            rows = (
                await db.execute(
                    select(AuditLog).where(
                        AuditLog.action == "transfer_session",
                        AuditLog.resource_id == str(ids["session"]),
                    )
                )
            ).scalars().all()
            assert len(rows) == 1
            row = rows[0]
            assert row.admin_id == ids["a"]
            assert row.resource_type == "chat_session"
            assert row.details == {
                "from_operator_id": ids["a"],
                "to_operator_id": ids["b"],
                "reason": "ฝากดูต่อ",
            }
            await db.delete(row)
            await db.commit()
    ```
    (The trailing delete keeps the test DB clean — the fixture teardown only
    removes session/user rows, and `resource_id` is a plain string with no FK
    cascade.)
  - EXTEND `test_transfer_audit_atomic_with_mutation`: after the existing
    rollback block and session-state asserts, add:
    ```python
    async with Session() as db:
        rows = (
            await db.execute(
                select(AuditLog).where(
                    AuditLog.action == "transfer_session",
                    AuditLog.resource_id == str(ids["session"]),
                )
            )
        ).scalars().all()
        assert rows == []
    ```
    (Rollback must drop the staged audit row with the mutation.)
  - Docstring fix in `test_transfer_session_errors.py` L5-6, exact replacement:
    old: `to 404 / 403 / 400. transfer_session carries an @audit_action decorator and\nneeds a real DB,`
    new: `to 404 / 403 / 400. transfer_session writes its audit row explicitly and\nneeds a real DB,`
- **MIRROR:** `test_request_guards.py:36,67-69` (`select(AuditLog).where(...)`
  assertion style against a real DB).
- **VALIDATE:** `python -m pytest tests/test_transfer_race.py -v` — DB-backed,
  runs green in CI (this Windows host has no Postgres/Redis; same constraint
  as round-2 T1/T7, which CI verified).
- **RISK (explicit):** no other test can break from the new rows — every
  existing `AuditLog` assertion in the suite filters by non-transfer actions
  or non-transfer resources (verified by search: `test_admin_audit_endpoints`,
  `test_admin_requests_endpoints`, `test_cookie_auth`,
  `test_image_resize_security`, `test_request_guards`).

### T3 — audit-page badge color for transfer_session
- **ACTION:** Add one line to `ACTION_COLORS` in
  `frontend/app/admin/audit/page.tsx` (after the `"close_session"` L35 line):
  `"transfer_session": "bg-warning/12 text-warning",`
  (Warning = operator-attention semantics, same as `update` /
  `revert_approval`; a session changing hands deserves scanning attention.
  Unknown actions already fall back safely at L254, so this is polish.)
- **MIRROR:** sibling session-lifecycle entries L34-36 in the same map.
- **VALIDATE:** `cd frontend && npx eslint app/admin/audit/page.tsx` +
  full `npm run test:unit` at the end (no map-specific test exists or is
  added — see NOT Building).

## Validation Commands
- After T1+T2 (mock part): `cd backend && python -m pytest
  tests/test_live_chat_service.py tests/test_transfer_session_errors.py -q`
- DB tests (CI): `cd backend && python -m pytest tests/test_transfer_race.py -v`
- Frontend: `cd frontend && npx eslint app/admin/audit/page.tsx`, then full
  `npm run test:unit` at the end
- No ruff/mypy config exists in `backend/` → pytest is the gate.

## Testing Strategy
- Contract asserted exactly (admin/action/resource/details equality), not
  just "a row exists"; atomicity asserted both ways (commit→row,
  rollback→no row).
- No existing assertion is weakened; the only test-text change is the
  two-word docstring fix for the removed decorator.

## Acceptance Criteria
- [ ] Successful transfer (HTTP + WS — same service method) writes exactly
  one audit row matching the PRD contract.
- [ ] Failed transfer writes no row; rolled-back transfer writes no row.
- [ ] Mock suites green locally; DB tests green in CI.
- [ ] Shared decorator file untouched (`git diff --stat` shows no
  `backend/app/core/audit.py`).
- [ ] No new warnings/errors in test output attributable to this change.

## Self-review (writing-plans gate, done by plan author)
- Spec coverage: every PRD row-contract field → T1 call args + T2 asserts;
  "failed transfers unaudited" → T1 placement + T2 rollback assert;
  decorator frozen → NOT Building + acceptance check; badge line → T3. No gaps.
- Placeholder scan: no TBD/TODO/"similar to"/missing-code steps; every code
  step carries exact code.
- Type consistency: `resource_id=str(session.id)` in T1 matches
  `str(ids["session"])` filter in T2; details keys identical in both.
