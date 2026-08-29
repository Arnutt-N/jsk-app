# PRP Plan — LIFF Media Upload ID-Token Fix + Regression Tests

**REV 3** — post Codex gpt-5.6-sol round-2 review (`project-log-md/codex/review-liff-media-prd-prp-round2-20260829.md`): remaining BLOCKER (spy contract, B10 shared-budget proof) + all round-2 SHOULD-FIX/NICE-TO-HAVE applied.
**PRD:** `.claude/PRPs/prds/liff-media-upload-id-token.prd.md`
**Branch:** `fix/audit-sweep-20260829` (already checked out; do NOT create a new branch — this is the active audit-sweep work)
**Date:** 2026-08-29

## Ground Rules

- Preserve ALL existing uncommitted working-tree changes; only touch files listed below.
- Do NOT commit, push, or open a PR — user approval required (Codex handoff blocker).
- Follow test-first order per phase.
- Save validation output to `.scratch/liff-media-fix/gates-20260829.txt` (gitignored scratch) so results are auditable (A7).

## Known Facts (verified against source, REV 3)

- Endpoint: `upload_liff_media` at `backend/app/api/v1/endpoints/liff.py:64` — requires `x_liff_id_token` when `settings.LIFF_STRICT_MODE` (declared at `config.py:50`, default `True`); verifies via `verify_liff_token` (LINE `POST https://api.line.me/oauth2/v2.1/verify` with URL passed **positionally** and `data={"id_token": ..., "client_id": ...}` kwarg, `liff.py:28-35`; 503 when `LINE_LOGIN_CHANNEL_ID` blank, `liff.py:24-27`; 401 when LINE rejects or `sub` missing); MIME allowlist jpeg/png/pdf; 10MB cap (`_LIFF_MEDIA_MAX_BYTES`); returns `{id, filename}`; commits a `MediaFile` row.
- Broken call sites (fetch without token header): `service-request/page.tsx:216`, `service-request-single/page.tsx:183`, `request-v2/page.tsx:170`. All three destructure the **nullable** `idToken` (`string | null`) from `useLiffInit`.
- Reference client pattern: `frontend/lib/liff/submit-service-request.ts` — conditional header spread + 401 → Thai session-expired throw + raw Response return. Its message constant is currently a private literal (lines 3-4); it becomes a shared export in this plan.
- Backend test pattern (`backend/tests/test_liff_token.py`): `test_client` fixture; `monkeypatch.setattr(settings, "LIFF_STRICT_MODE", ...)`; `_FakeLineVerifyResponse` + `_patch_line_verify` monkeypatching `liff_module.httpx.AsyncClient` (plain fake — does NOT record calls); DB assertions via `_fresh_engine()` + `NullPool` + `sessionmaker` (lines 37-44) and id-based fetch+delete cleanup (`_fetch_and_delete`, lines 96-127). The app's pooled session must not be reused across event loops. **Do not import private helpers from sibling test modules** (`backend/tests` has no `__init__.py`) — copy the small fakes locally.
- `LINE_LOGIN_CHANNEL_ID` is defaulted to `2000000000` at test-session import time (`backend/tests/conftest.py:17-39`); tests needing it blank override via monkeypatch on `settings`.
- Rate limiting (`backend/app/core/http_rate_limit.py`): bucket key is `ratelimit:{scope}:{client_ip}` (line 80); `/media` and `/service-requests` both use scope `"liff-submit"` (`liff.py:50-62,104-119`); `max_events`/`window_seconds` are captured at route DECORATION time (closure), so monkeypatching `settings.LIFF_SUBMIT_RATE_LIMIT` in a test has NO effect — never do it. Redis-backed via `redis_client.fixed_window_allow` (line 82); autouse `_reset_http_rate_limits` (conftest) resets in-process + Redis buckets BEFORE each test only (no post-yield teardown) — B10 avoids leaking by monkeypatching the Redis call entirely.
- Vitest picks up colocated `__tests__` dirs (`frontend/vitest.config.ts:31-38`); `vitest.setup.ts:9-10` cleans only React trees — tests mocking global `fetch` must reset/restore themselves.

## Task 1 — Backend regression tests (B1–B10)

**File (new):** `backend/tests/test_liff_media_upload.py`

All DB helpers are `async def`, awaited inside `@pytest.mark.asyncio` tests.
Local helpers (copy the small fakes; no cross-module imports):

1. `_FakeLineVerifyResponse` — copy verbatim from `test_liff_token.py:66-75`.
2. `_patch_line_verify(monkeypatch, resp)` — copy verbatim from
   `test_liff_token.py:78-93` for the non-spy cases.
3. `_patch_line_verify_spy(monkeypatch, resp) -> AsyncMock` — spy variant;
   **must return the post mock** so tests can assert on it:

   ```python
   def _patch_line_verify_spy(monkeypatch, resp):
       post_mock = AsyncMock(return_value=resp)
       fake_client = MagicMock()
       fake_client.post = post_mock
       fake_cm = MagicMock()
       fake_cm.__aenter__ = AsyncMock(return_value=fake_client)
       fake_cm.__aexit__ = AsyncMock(return_value=False)
       monkeypatch.setattr(liff_module.httpx, "AsyncClient", MagicMock(return_value=fake_cm))
       return post_mock
   ```

4. `_fresh_engine()` — copy from `test_liff_token.py:43-44`.
5. `async def _count_media_files() -> int` — NullPool session,
   `select(func.count()).select_from(MediaFile)`, dispose in `finally`.
   Used by B1/B9 no-write proofs.
6. `async def _fetch_media_file(media_id) -> MediaFile | None` and
   `async def _delete_media_file(media_id)` — NullPool session
   select / delete+commit, dispose in `finally`. Every success-path test
   deletes its row in `finally` (id-based, same as `_fetch_and_delete`).

Multipart upload shape:

```python
res = test_client.post(
    "/api/v1/liff/media",
    files={"file": ("photo.jpg", b"\xff\xd8\xfffake-jpeg", "image/jpeg")},
    headers={"x-liff-id-token": "tok-valid"},
)
```

Class `TestLiffMediaUploadContract` — 10 tests (PRD matrix B1–B10):

- **B1** `test_strict_on_no_token_returns_401_without_db_write`: strict True,
  no header → 401 `"LIFF ID token required"`; `_count_media_files()`
  identical before/after.
- **B2** `test_strict_on_valid_token_uploads_and_verifies`:
  `post_mock = _patch_line_verify_spy(monkeypatch, _FakeLineVerifyResponse(200, {"sub": VERIFIED_SUB}))`;
  POST jpeg → 200; assert `data["filename"] == "photo.jpg"` and
  `uuid.UUID(data["id"])` parses; then

  ```python
  post_mock.assert_awaited_once_with(
      "https://api.line.me/oauth2/v2.1/verify",
      data={"id_token": "tok-valid", "client_id": settings.LINE_LOGIN_CHANNEL_ID},
  )
  ```

  (URL positional — production calls `client.post("https://...", data={...})`
  at `liff.py:29-34`); fetch MediaFile by id, assert filename/mime_type/
  size_bytes match the uploaded payload; delete in `finally`.
- **B3** strict on, LINE verify 400 → 401 `"Invalid LIFF ID token"`.
- **B4** strict on, LINE verify 200 `{}` (no `sub`) → 401
  `"LIFF token missing sub claim"` (media-route coverage; complements
  `test_liff_token.py:245`).
- **B5** strict on, valid token, `text/plain` file → 400, detail contains
  `ประเภทไฟล์ไม่รองรับ`.
- **B6** boundary pair: `monkeypatch.setattr(liff_module, "_LIFF_MEDIA_MAX_BYTES", 16)`
  — send 16-byte jpeg → 200 (cleanup); send 17-byte jpeg → 413.
- **B7** `test_strict_off_no_token_accepted`: strict False, no header →
  200 persisted; cleanup.
- **B8** `test_strict_off_invalid_token_still_rejected`: strict False, LINE
  verify 400 → 401 (token presence always verifies, regardless of flag).
- **B9** `test_blank_channel_id_returns_503_without_db_write`:
  `monkeypatch.setattr(settings, "LINE_LOGIN_CHANNEL_ID", "")` plus a second
  whitespace-only parametrization `"   "`; token present → 503;
  `_count_media_files()` unchanged.
- **B10** `test_media_shares_liff_submit_bucket_with_service_requests`
  (FR8 proof — deterministic, no real Redis, no settings monkeypatch):

  ```python
  from app.core import http_rate_limit as http_rate_limit_module

  recorded: list[str] = []
  limit = settings.LIFF_SUBMIT_RATE_LIMIT  # the value captured at decoration

  async def fake_fixed_window_allow(key, *, max_events, window_seconds):
      recorded.append(key)
      return len(recorded) <= max_events

  monkeypatch.setattr(
      http_rate_limit_module.redis_client, "fixed_window_allow", fake_fixed_window_allow
  )

  for _ in range(limit):  # exhaustion counts even on 401 — route deps run first
      res = test_client.post("/api/v1/liff/media", files=JPEG_FILE)
      assert res.status_code == 401  # strict on, no token

  res = test_client.post("/api/v1/liff/service-requests", json=_minimal_body())
  assert res.status_code == 429

  assert len(set(recorded)) == 1                 # one shared bucket
  assert recorded[0].startswith("ratelimit:liff-submit:")
  ```

  `_minimal_body()` = a valid `ServiceRequestCreate` dict copied from
  `test_liff_token.py:47-63`. monkeypatch restores the Redis binding
  automatically, so nothing leaks even if this runs last.

**Validation:** from `backend/` (WSL venv_linux bridge):
`python -m pytest tests/test_liff_media_upload.py -v`. The endpoint is
already correct, so tests should pass immediately (regression guards); any
failure = real defect → fix endpoint only if it contradicts the PRD contract.

## Task 2 — Shared constant + upload helper + client tests (RED first)

**File (new):** `frontend/lib/liff/session-expired.ts`

```ts
export const SESSION_EXPIRED_MESSAGE =
  'เซสชัน LINE หมดอายุ กรุณาปิดหน้าต่างนี้แล้วเปิดฟอร์มใหม่จากเมนู LINE'
```

**File (edit):** `frontend/lib/liff/submit-service-request.ts` — delete the
local literal constant and import the shared one:
`import { SESSION_EXPIRED_MESSAGE } from './session-expired'`. No re-export,
no behavior change.

**File (new):** `frontend/lib/liff/upload-media.ts`

```ts
import { SESSION_EXPIRED_MESSAGE } from './session-expired'

const LIFF_MEDIA_ENDPOINT = '/api/v1/liff/media'

export async function uploadLiffMedia(
  file: File,
  idToken: string | null
): Promise<Response> {
  const formData = new FormData()
  formData.append('file', file)

  const res = await fetch(LIFF_MEDIA_ENDPOINT, {
    method: 'POST',
    headers: idToken ? { 'x-liff-id-token': idToken } : {},
    body: formData
  })

  if (res.status === 401) {
    throw new Error(SESSION_EXPIRED_MESSAGE)
  }

  return res
}
```

Never set `Content-Type` (browser sets the multipart boundary).

**File (new):** `frontend/lib/liff/__tests__/upload-media.test.ts` — Vitest,
global `fetch` mocked with explicit lifecycle:

```ts
beforeEach(() => { vi.stubGlobal('fetch', vi.fn()) })
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })
```

- **F1** capture `fetch` args: URL `/api/v1/liff/media`, `method: 'POST'`;
  `new Headers(init.headers).get('Content-Type') === null`;
  `init.body instanceof FormData` and `body.get('file') === file`;
  header `x-liff-id-token` equals token when given; when `idToken` is null,
  `new Headers(init.headers).get('x-liff-id-token') === null`.
- **F2** mocked 401 → rejects with the shared constant; drift guard:
  import `SESSION_EXPIRED_MESSAGE` from `@/lib/liff/session-expired` and
  assert BOTH `uploadLiffMedia`'s rejection message and
  `submitServiceRequest`'s rejection message equal it (proves single source
  of truth by value identity of the one canonical constant).
- **F3** mocked 200 → resolves to the same Response instance.

**Validation:** from `frontend/`: `npm run test:unit -- upload-media`.

## Task 3 — Wire the three pages

In each page's `handleFileUpload`, replace the inline
`fetch('/api/v1/liff/media', {...})` with the helper, and surface ONLY the
session-expired message:

```ts
import { uploadLiffMedia } from '@/lib/liff/upload-media'
import { SESSION_EXPIRED_MESSAGE } from '@/lib/liff/session-expired'
// ...
try {
    const res = await uploadLiffMedia(file, idToken)
    if (!res.ok) throw new Error('Upload failed')
    const data = await res.json()
    setFormData(prev => ({ ...prev, attachments: [ ... ] }))
} catch (err) {
    alert(err instanceof Error && err.message === SESSION_EXPIRED_MESSAGE
        ? SESSION_EXPIRED_MESSAGE
        : 'อัพโหลดไฟล์ไม่สำเร็จ')
    logger.error(err)
}
```

Behavior contract: 400/413/500/network errors keep the existing generic Thai
message; only the helper's 401 error shows the session-expired text.

Files:

- `frontend/app/liff/service-request/page.tsx` (fetch at :216)
- `frontend/app/liff/service-request-single/page.tsx` (fetch at :183)
- `frontend/app/liff/request-v2/page.tsx` (fetch at :170)

**Validation (P1/P2 source-contract):**
- `grep -rn "fetch('/api/v1/liff/media'" frontend/` → zero hits.
- `grep -rn "uploadLiffMedia(file, idToken)" frontend/app/liff` → exactly 3
  hits, one per page (proves each page passes the token; documents the limit
  that no component render test exists for the upload path this round).
- `grep -rln "เซสชัน LINE หมดอายุ" frontend/` → exactly 1 file:
  `frontend/lib/liff/session-expired.ts` (P2 single-source check).
- `npx tsc --noEmit` clean; `npm run lint` clean.

## Task 4 — Gate rerun + transcript

Run from respective dirs (WSL bridge for backend), appending all output with
timestamps to `.scratch/liff-media-fix/gates-20260829.txt`:

1. `python -m pytest tests/test_liff_media_upload.py tests/test_liff_token.py tests/test_http_rate_limit.py -v`
2. `python -m pytest` (full backend suite — green parity with prior count)
3. `npm run test:unit` (full frontend suite)
4. `npx tsc --noEmit`
5. `npm run lint`
6. `npm run build`

If any gate fails: fix root cause, rerun, append to same transcript.

## Task 5 — Update reports (docs only)

- `project-log-md/qoder/audit-sweep-review-20260829.md`: correct the LIFF
  upload section — the CRITICAL was NOT closed by the endpoint alone; the
  header fix + tests in this task close it. Reference the new test files and
  the gate transcript path.
- Do NOT touch the architecture HTML report (separate work item).

## Out of Scope

- Commit / push / PR (requires user approval).
- Other Codex findings A3–A5.
- Architecture report corrections.

## Definition of Done

- [ ] Task 1: 10 backend tests green (B1–B10); B2 asserts positional URL + exact data kwargs; B10 proves single shared `ratelimit:liff-submit:*` key across both routes; success rows cleaned up.
- [ ] Task 2: shared constant + helper + 3 client tests green; fetch mock lifecycle explicit; no constant duplication.
- [ ] Task 3: 3 pages wired; P1/P2 greps pass; tsc/lint clean.
- [ ] Task 4: all 6 gates green, transcript saved.
- [ ] Task 5: audit-sweep report corrected.
- [ ] No commit/push performed.
