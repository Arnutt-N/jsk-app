# PRD — LIFF Media Upload ID-Token Fix + Regression Tests

**Date:** 2026-08-29 (REV 3 — post Codex gpt-5.6-sol round-2 review, `project-log-md/codex/review-liff-media-prd-prp-round2-20260829.md`)
**Branch:** `fix/audit-sweep-20260829`
**Source:** Codex deep review finding A1 (CRITICAL) + A2 (HIGH) in `project-log-md/codex/deep-review-qoder-audit-architecture-20260829.md`
**Plan:** `.claude/PRPs/plans/liff-media-upload-id-token.plan.md`

## Problem

The audit sweep added `POST /api/v1/liff/media` and migrated all three LIFF
service-request pages to it, but the client-side fetch calls **omit the
`X-Liff-Id-Token` header**. The endpoint requires that header whenever
`LIFF_STRICT_MODE` is enabled (`backend/app/core/config.py:50`), and the
default is `true`. In production (strict mode on, no env override) **every
file upload returns 401** — the attachment flow on all three LIFF forms is
broken.

Affected call sites (all identical: `fetch` with only `method` + `body`):

- `frontend/app/liff/service-request/page.tsx:216`
- `frontend/app/liff/service-request-single/page.tsx:183`
- `frontend/app/liff/request-v2/page.tsx:170`

All three pages already have access to the **nullable** `idToken` from
`useLiffInit` (`string | null`, `frontend/hooks/useLiffInit.ts:38-44`) — they
pass it to `submitServiceRequest` at submit time; only the upload path
forgets it. Note: `service-request-single` can run without a LINE login and
`service-request` has no `initDone` loading gate, so `idToken` may be `null`
at upload time — the fix must handle that gracefully (strict mode 401 →
session-expired message, not a silent success).

Second gap (A2): there is **no regression test** covering the `/liff/media`
contract — no test references the endpoint at all. Prior "green gates"
therefore did not catch the 401.

## Goals

1. All three LIFF pages send `X-Liff-Id-Token` on media upload so uploads
   work under the production-default `LIFF_STRICT_MODE=true`.
2. Consolidate the upload call in one shared helper (mirroring the existing
   `submitServiceRequest` pattern in `frontend/lib/liff/submit-service-request.ts`)
   so the token contract has a single source of truth.
3. Share the session-expired message as ONE exported constant (currently a
   private duplicated literal) so submit + upload paths cannot drift.
4. Add endpoint regression tests covering the full upload contract,
   including token-present-always-verified, server-misconfiguration 503,
   size boundary, and rate-limit scope/shared-budget wiring.
5. Add client-side tests proving the header/FormData contract.

## Non-Goals

- No change to the backend endpoint behavior (its contract is correct).
- No change to submit (`/liff/service-requests`) logic — already token-aware
  (it only gains the shared constant import).
- No other audit-sweep items (AsyncSession, PII logs, LINE push semantics —
  separate work items).
- No commit/push/PR without user approval (per Codex handoff blocker).

## Solution

**Shared constant (frontend):** new `frontend/lib/liff/session-expired.ts`
exporting `SESSION_EXPIRED_MESSAGE` (the existing Thai string). Both
`submit-service-request.ts` and the new upload helper import it; the private
duplicated literals are removed. The Thai literal must exist in exactly ONE
file afterwards (enforced by grep in validation).

**Frontend helper:** new `frontend/lib/liff/upload-media.ts` exporting
`uploadLiffMedia(file: File, idToken: string | null): Promise<Response>`:

- POST `multipart/form-data` (`file` field) to `/api/v1/liff/media`
- Attach `x-liff-id-token` header when `idToken` is present (same conditional
  spread pattern as `submit-service-request.ts`); never set `Content-Type`
  manually (browser sets the multipart boundary)
- Throw `new Error(SESSION_EXPIRED_MESSAGE)` on 401
- Return raw `Response` otherwise; pages keep their existing
  `alert()` / `logger.error` handling, surfacing the session-expired message
  **only** when the thrown error is the session-expired one — all other
  errors keep the generic Thai `อัพโหลดไฟล์ไม่สำเร็จ`

**Backend tests:** new `backend/tests/test_liff_media_upload.py` using the
established `test_client` fixture + monkeypatched `httpx.AsyncClient` pattern
from `backend/tests/test_liff_token.py` (no real network calls). Small fakes
(`_FakeLineVerifyResponse`) are copied locally into the new file — no
cross-test-module imports (`backend/tests` has no `__init__.py`).
`LINE_LOGIN_CHANNEL_ID` is already defaulted at test-session import time in
`backend/tests/conftest.py:17-39`; tests that need it empty override via
`monkeypatch.setattr(settings, "LINE_LOGIN_CHANNEL_ID", "")`.

**Frontend tests:** new `frontend/lib/liff/__tests__/upload-media.test.ts`
(colocated convention; both locations are picked up per
`frontend/vitest.config.ts:31-38`) with mocked global `fetch` and explicit
per-test reset/restore (`vitest.setup.ts` only cleans React trees).

## Functional Requirements

| ID | Requirement |
|---|---|
| FR1 | Upload request from all 3 pages carries `X-Liff-Id-Token` when the LIFF session has a token; pages call the shared helper with `(file, idToken)`. |
| FR2 | Endpoint returns 401 (no DB write) for upload without token when `LIFF_STRICT_MODE=true`. |
| FR3 | A PRESENT token is always verified via LINE regardless of strict flag; invalid token → 401 in both modes; 200 without `sub` → 401. |
| FR4 | Valid token + allowed MIME + ≤10MB → 200 with `{id, filename}`; MediaFile persisted (verified by direct DB query). Boundary: exactly max bytes accepted, max+1 rejected 413. |
| FR5 | Disallowed MIME → 400. |
| FR6 | Non-strict mode + no token → upload accepted (existing transition behavior preserved). |
| FR7 | Token present + `LINE_LOGIN_CHANNEL_ID` blank → 503, no DB write (fail-closed misconfiguration guard). |
| FR8 | `/liff/media` and `/liff/service-requests` share the exact `liff-submit` rate-limit bucket (same Redis key per client IP, `http_rate_limit.py:80`): exhausting the budget via uploads makes the submit route return 429. |
| FR9 | Client treats 401 as session-expired with the single shared Thai constant; pages surface that message and only that message — other errors keep the generic Thai text. |
| FR10 | Client helper never sets `Content-Type` manually; body is `FormData` carrying the file under `file`. |

## Test Matrix

Backend (`test_liff_media_upload.py`):

| # | Case | FR |
|---|---|---|
| B1 | strict on, no token → 401; `_count_media_files()` unchanged before/after (NullPool) | FR2 |
| B2 | strict on, valid token → spy `AsyncMock` awaited once with **positional** LINE verify URL and `data={"id_token": ..., "client_id": ...}`; 200 `{id, filename}`; MediaFile row persisted with filename/mime/size; row deleted in `finally` | FR3, FR4 |
| B3 | strict on, invalid token (LINE 400) → 401 | FR3 |
| B4 | strict on, LINE 200 without `sub` → 401 (media route explicitly, complementing the service-requests case in `test_liff_token.py:245`) | FR3 |
| B5 | strict on, valid token, `text/plain` → 400 | FR5 |
| B6 | boundary pair with monkeypatched `_LIFF_MEDIA_MAX_BYTES`: exactly max → 200; max+1 → 413 | FR4 |
| B7 | strict off, no token → 200 persisted | FR6 |
| B8 | strict off, invalid token present → 401 (token presence always verifies) | FR3 |
| B9 | token present + blank `LINE_LOGIN_CHANNEL_ID` → 503, `_count_media_files()` unchanged | FR7 |
| B10 | shared-budget wiring: monkeypatch `redis_client.fixed_window_allow` with a deterministic counter fake recording keys; exhaust the budget through `/liff/media` (401s still count — route dependency runs before the handler), then ONE `/liff/service-requests` POST → 429; assert all recorded keys are identical and start with `ratelimit:liff-submit:` | FR8 |

Frontend (`upload-media.test.ts`):

| # | Case | FR |
|---|---|---|
| F1 | sends POST `/api/v1/liff/media`; header `x-liff-id-token` = token when provided, absent when `null`; `body instanceof FormData`, `body.get('file') === file`; `new Headers(init.headers).get('Content-Type') === null` | FR1, FR10 |
| F2 | 401 → rejects with `SESSION_EXPIRED_MESSAGE` imported from the canonical `session-expired.ts`; the SAME constant value is what `submitServiceRequest` throws (single-source drift guard) | FR9 |
| F3 | 200 → resolves to the raw Response | FR9 |

Page/source-contract validation (documented limit: no component render tests
for the upload path this round):

| # | Case | FR |
|---|---|---|
| P1 | grep proves all three pages contain the exact call `uploadLiffMedia(file, idToken)` and zero bare `fetch('/api/v1/liff/media'` remain | FR1 |
| P2 | grep proves the Thai session-expired literal exists in exactly one file (`frontend/lib/liff/session-expired.ts`) | FR9 |

## Acceptance Criteria

- All 10 backend cases and 3 frontend cases pass.
- P1/P2 grep checks pass.
- Full backend pytest suite and frontend Vitest suite stay green.
- Frontend `tsc` + lint clean.
- Validation output saved to `.scratch/liff-media-fix/gates-20260829.txt`
  for audit trail (per A7).

## Risks / Mitigations

| Risk | Mitigation |
|---|---|
| `idToken` null at upload time (single-page form without LINE login, or wizard before init completes) | Helper sends no header → strict mode 401 → Thai session-expired alert (correct signal, not silent success); non-strict still accepts |
| Cross-event-loop DB errors in assertions | All DB helpers are `async def` over a throwaway `_fresh_engine()` + `NullPool` + `sessionmaker` (`test_liff_token.py:37-44` pattern), awaited inside `@pytest.mark.asyncio` tests — never the app's pooled session |
| Success-path rows polluting the dev DB | Every persistence assertion deletes its row by id in `finally` (same id-based cleanup as `_fetch_and_delete` in `test_liff_token.py:96-127`) |
| 10MB body in tests slow | Monkeypatch `_LIFF_MEDIA_MAX_BYTES` down (e.g. 16) and test max/max+1 |
| Rate-limit test flakiness / leaked Redis buckets | B10 fully monkeypatches `fixed_window_allow` (no real Redis, deterministic, nothing leaks); conftest autouse reset covers all other tests |
| Limit captured at decoration time defeats settings monkeypatch | Plan does NOT monkeypatch `LIFF_SUBMIT_RATE_LIMIT`; B10 reads the real captured value and counts against it |
| Existing `_patch_line_verify` doesn't record calls | Plan defines a spy variant returning the `post` AsyncMock; B2 asserts positional URL + exact data kwargs + call count |

## Out-of-Scope Follow-ups (tracked separately)

- A3 background AsyncSession ownership (`handoff.py`)
- A4 remaining plaintext LINE-ID logs (`messaging.py:54,152`)
- A5 LINE push false-success semantics
- A7 full gate rerun with saved transcripts (partially addressed here)
- Architecture report corrections (Codex queue item 2)
