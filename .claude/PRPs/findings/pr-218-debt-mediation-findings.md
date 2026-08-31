# Findings — PR #218 LIFF debt-mediation (codebase-review-fix)

**Date:** 2026-08-31  
**Scope:** `feat/liff-debt-mediation` / PR #218 (`/liff/debt-mediation` + `POST /api/v1/liff/debt-mediation`)  
**Reviewers (read-only):** fastapi-reviewer, python-reviewer, database-reviewer, security-reviewer, react-reviewer, typescript-reviewer, test-engineer, silent-failure-hunter, code-reviewer  
**Critical:** 0  
**High accepted:** 8  
**Medium accepted:** 11  
**Deferred / rejected:** documented below  

Evidence verified against the working tree on `fix/pr-218-review-fixes` (HEAD `d7def8f` + this branch).

---

## Accepted — High

### F01 — `debt_amount` overflows Numeric(14,2) or rounds to 0.00
- **Reporters (4):** fastapi, python, security, code-review
- **Location:** `backend/app/schemas/debt_mediation_liff.py:42`; column `backend/app/models/debt_mediation.py:48`; persist `backend/app/api/v1/endpoints/liff.py:301`
- **Evidence:** `Field(gt=0)` only. Pydantic accepts `1e20` / `0.001`. Postgres `Numeric(14,2)` raises DataError (500) or rounds `0.001` → `0.00`. LIFF `<input type="number">` has `min="0"` and no max (`page.tsx:503-512`).
- **Category:** bug
- **Fix:** `Field(gt=0, max_digits=14, decimal_places=2, allow_inf_nan=False)` + LIFF `max`/`step`; tests for overflow and sub-cent.

### F02 — Switching ลูกหนี้/เจ้าหนี้ keeps a stale `issue_category`
- **Reporters (3):** react, code-review, python (allowlist)
- **Location:** `frontend/app/liff/debt-mediation/page.tsx:441`; schema `debt_mediation_liff.py:49`; `validateStep` `page.tsx:166`
- **Evidence:** `onClick` only `setField('submitter_type', opt.value)`. Debtor/creditor issue lists are disjoint. After DEBTOR → pick issue → Back → CREDITOR, no option looks selected but submit still posts the leftover debtor label. Schema stores any non-empty string.
- **Category:** logic-error
- **Fix:** Reset `issue_category` / `issue_other` / `interest_rate` on submitter change. Server allowlist per `submitter_type` + `ISSUE_OTHER_LABEL`. Wizard test for the switch.

### F03 — Phone `maxLength={10}` contradicts 9–15 digit / `+66` contract
- **Reporters (2):** react, test-engineer
- **Location:** `frontend/app/liff/debt-mediation/page.tsx:494`; helpers `submit-debt-mediation.ts`; schema `_PHONE_PATTERN` / `max_length=20`
- **Evidence:** Placeholder `0xx-xxx-xxxx` plus `maxLength={10}` truncates dashed input before 10 digits; `+66812345678` cannot be typed. Backend accepts both after strip.
- **Category:** logic-error
- **Fix:** `maxLength={20}`; keep `isValidPhone` as the rule. Wizard tests for dashed and `+66`.

### F04 — Province fetch failure is silent
- **Reporters (2):** silent-failure (High), react (Medium)
- **Location:** `frontend/app/liff/debt-mediation/page.tsx:110-121`
- **Evidence:** `catch` only `logger.error`. Badge stays `Connecting...`. Step 2 then shows `กรุณาเลือกจังหวัดที่อาศัย`. Sister wizard `service-request/page.tsx` calls `setError`.
- **Category:** silent-failure
- **Fix:** Thai `setError` + failed badge; retry; `Array.isArray` guard.

### F05 — Schema negatives use `pytest.raises(Exception)`
- **Reporters (2 High):** python, test-engineer (fastapi Low)
- **Location:** `backend/tests/test_liff_debt_mediation.py:67` (10 sites)
- **Evidence:** Sibling `test_service_request_liff_validation.py` uses `pydantic.ValidationError`. A TypeError from a broken constructor still passes.
- **Category:** bad-practice / missing-test
- **Fix:** `pytest.raises(ValidationError)` + message match on the targeted rule.

### F06 — Invalid / missing-token 401 is not proven on the handler or wizard
- **Reporters (1 High):** test-engineer (fastapi Medium for TestClient)
- **Location:** `backend/tests/test_liff_debt_mediation.py:178`; `page.test.tsx` (no 401 case); handler `liff.py:270-271`
- **Evidence:** Token-present tests always patch `verify_liff_token` to succeed. `test_liff_token.py` only posts `/liff/service-requests`. Wizard never stubs POST 401. `test_missing_token_rejected_in_strict_mode` does not assert `db.add` was skipped.
- **Category:** missing-test
- **Fix:** Handler tests: verify raises 401 → no `db.add`; missing token + strict → no `db.add`. Wizard: POST 401 → `SESSION_EXPIRED_MESSAGE`.

### F07 — `getByRole(..., { exact: true })` is not in `ByRoleOptions`
- **Reporters (1):** typescript-reviewer
- **Location:** `frontend/app/liff/debt-mediation/__tests__/page.test.tsx:183`
- **Evidence:** `ByRoleOptions` has no `exact` (`MatcherOptions` for `getByText`). `tsconfig.json` includes `**/*.tsx`. Flag is a runtime no-op.
- **Category:** type-safety
- **Fix:** `getByRole('button', { name: /^อื่น ๆ$/ })`.

### F08 — Form labels are not associated with controls
- **Reporters (1):** react-reviewer
- **Location:** `frontend/app/liff/debt-mediation/page.tsx:467` (all step-2/3 labels)
- **Evidence:** `<label>` sits beside `<input>`/`<select>` with neither `htmlFor` nor wrapping. No `id` / `aria-invalid` / `aria-describedby`. Sister `request-v2` uses `htmlFor`.
- **Category:** framework-issue (a11y)
- **Fix:** Stable `id` + `htmlFor`; `aria-invalid` + `aria-describedby` on error.

---

## Accepted — Medium (same files; fix in this pass)

| ID | Finding | Location | Reporters | Fix direction |
|----|---------|----------|-----------|---------------|
| F09 | Unbounded `sub_district` / `interest_rate` / `issue_category` / `issue_other` | schema:40-50, model String() | fastapi, python, security, code-review | `max_length` + `String(n)` + input `maxLength` |
| F10 | Python `\\d` matches Unicode Nd | schema:11 | python High→Medium, fastapi Low | `[0-9]` / `re.ASCII`; reject Thai digits |
| F11 | Client `!formData.full_name` allows `'   '` | page.tsx:156 | react, code-review | trim in `validateStep` / `buildPayload` |
| F12 | 201 echoes raw `line_user_id` | liff.py:327, schema:153 | silent-failure High→Medium, security Medium | Drop from `DebtMediationResponse` (BookingOut pattern). Identity stays `user_id` FK. |
| F13 | `user_id` FK has no `ON DELETE` | migration:57, model:34 | database | `ondelete="SET NULL"` |
| F14 | `details` JSONB nullable, ORM-only `default=dict` | migration:80, model:62 | database | `nullable=False` + `server_default='{}'::jsonb` |
| F15 | CREDITOR payload can still store `interest_rate` | schema:100 | python | Null out / reject when CREDITOR |
| F16 | Handler return type `-> Any` | liff.py:266 | python | `-> DebtMediationResponse` |
| F17 | Radio cards have no `aria-pressed` | page.tsx:438 | react High→Medium (booking uses `aria-pressed`) | `aria-pressed={selected}` |
| F18 | `data` from `JSON.parse` untyped | page.tsx:225 | typescript | parse as `unknown` |
| F19 | Whitespace-only required strings untested | schema:96 | test-engineer | schema tests for `'   '` |

---

## Rejected / deferred

| Finding | Disposition | Reason |
|---------|-------------|--------|
| No admin list/detail UI | **Deferred** | Explicit PR #218 follow-up; new feature (mandatory PRD/PRP), not a defect in the LIFF write path. |
| No rich-menu entry | **Deferred** | Same — product wiring after merge. |
| No `create_audit_log` on LIFF create | **Deferred** | `create_service_request` in the same file also does not audit citizen creates. Do not invent a one-off audit here. |
| Require `x-liff-id-token` even when `LIFF_STRICT_MODE=false` | **Deferred** | Intentionally copies `create_service_request`. Changing one route would split LIFF identity policy. |
| Dialog focus-trap / Radix rewrite | **Deferred** | Same overlay pattern as `service-request` confirm modal; out of scope. |
| `next/head` no-op in App Router | **Deferred** | Shared by sibling LIFF wizards; not unique to this PR. |
| Duplicate schema/model Enum classes | **Deferred** | Conversion via `.value` is explicit; consolidating is a refactor without a failing invariant. |
| TestClient + `liff-submit` 429 for this route | **Deferred** | Shared decorator already covered for `/liff/media` + `/liff/service-requests`. Handler identity tests stay. |
| PEP8 import order | **Deferred** | Style-only; files will be touched — apply isort if the file is already in the task, else skip. |
| CHECK `(debt_amount > 0)` / debtor interest_rate CHECK | **Deferred** | Pydantic is the write gate; no other writers yet. F01 already blocks overflow at the API. |
| Empty catch around `isInClient` after submit | **Deferred (Low)** | Matches existing LIFF success-screen pattern; keep `useLiffInit` value. |

---

## Severity adjustments (with reason)

- Unicode `\\d` (python High) → **Medium (F10)**: LIFF `isValidPhone` already uses `[0-9]`; only a raw API client can send Nd digits.
- Radio `role="radiogroup"` (react High) → **Medium (F17)**: booking uses `aria-pressed` on the same exclusive-button pattern; we match that, not a full radio widget.
- Raw `line_user_id` on 201 (silent-failure High) → **Medium (F12)**: same echo as `ServiceRequestResponse`; caller already has LIFF `profile.userId`. Still drop it to match `BookingOut`.
- Admin surface (silent-failure High) → **Deferred**: product follow-up, not a bug in the submitted wizard.

---

## Stack commands (Step 1 — reuse everywhere)

| Check | Command (from repo root) |
|-------|--------------------------|
| Backend scoped | `cd backend && python -m pytest tests/test_liff_debt_mediation.py tests/test_booking_migration.py -q` |
| Frontend scoped | `cd frontend && npx vitest run app/liff/debt-mediation lib/liff/__tests__/submit-debt-mediation.test.ts` |
| Typecheck | `cd frontend && npx tsc --noEmit` |
| ESLint touched | `cd frontend && npx eslint app/liff/debt-mediation/page.tsx app/liff/debt-mediation/__tests__/page.test.tsx lib/liff/submit-debt-mediation.ts lib/liff/__tests__/submit-debt-mediation.test.ts` |

---

## Final-review additions (2026-08-31, post-implementation loop — Qwen Code)

Discovered by the Step-10 final review (backend-stack, frontend-stack, security reviewers on the fix diff).
No Critical / High. Dispositions below; fixed items landed in the same working tree (uncommitted).

| ID | Severity | Finding | Disposition |
|----|----------|---------|-------------|
| R1 | Medium | `line_user_id` was the only string field without `max_length`; a multi-MB value could be persisted as identity (`users.line_user_id_encrypted`, unbounded Text) in transition mode before the rate limiter sees the body | **Fixed** — `Field(default=None, max_length=64)` + `test_overlong_line_user_id_rejected` (deviation from plan scope, logged) |
| R2 | Medium | Migration SQL contract test pinned `String(200)` by loose substring — passes even on the wrong column | **Fixed** — per-column substring asserts incl. details `nullable=False, server_default` |
| R3 | Medium | F02 switch test could pass vacuously (no assertion observed the clearing itself) | **Fixed** — assert debtor issue button `aria-pressed='false'` after the switch, before re-select |
| R4 | Low | Boundary test used a truthiness assert; no 14-integer-digit rejection case | **Fixed** — `== Decimal("999999999999.99")` + `test_amount_fourteen_integer_digits_rejected` |
| R5 | Low | No mirror test for CREDITOR posting a debtor-path issue label | **Fixed** — `test_creditor_issue_from_debtor_list_rejected` |
| R6 | Low | CREDITOR with 81+ char `interest_rate` → 422 (field cap) instead of silent clear — inconsistent for the same logical input | **Accepted as-is** — conservative 422; API-only path (LIFF client always sends null); moving the clear above field validation would fight Pydantic v2 ordering |
| R7 | Low | Overflow amount (`1e20`) passes client validation → generic Thai 422 fallback instead of a field error | **Deferred** — plan froze `validateStep` gates (surgical-only); `max` attr + server 422 contract satisfy the PRD; changing the gate is a UX follow-up |
| R8 | Low | FastAPI default 422 payload echoes failing field `input` (up to 500 chars, client's own data) | **Deferred** — systemic to all LIFF routes; a custom `validation_exception_handler` is an app-wide change, not scoped to this PR |
| R9 | Low | Pydantic Decimal accepts Unicode Nd digits (`๑๒๓` → `123`) — value-benign, but canonicalization is inconsistent with the ASCII phone rule | **Deferred** — no overflow risk (digit caps still apply); normalization is a small follow-up if admin search needs canonical amounts |
| R10 | Low | Issue labels are UI copy mirrored into backend frozensets — a future frontend reword would 422 legitimate submits; no cross-contract test binds the two copies | **Deferred** — label-drift risk already tracked in plan Risks (labels inlined verbatim); real fix is slug values or a shared-contract test = product follow-up |
