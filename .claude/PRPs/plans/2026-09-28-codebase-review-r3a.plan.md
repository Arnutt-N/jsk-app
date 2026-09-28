# PRP: Codebase Review Round 3, Batch A (2026-09-28)

## Metadata
- **PRD:** `.claude/PRPs/prds/2026-09-28-codebase-review-r3a.prd.md`
- **Findings (binding):** `.claude/PRPs/findings/2026-09-28-codebase-review-r3-findings.md`
- **Branch:** `fix/codebase-review-r3a-20260928` (from `main` @ `9706fa7`)
- **Coverage map:** T1→R3-H1 · T2→R3-H2 · T3→R3-H3 · T4→R3-H4 · T5→R3-H5 ·
  T6→R3-H6 · T7→R3-H7 · T8→R3-H8 · T9→R3-M2 · T10→R3-M4 · T11→R3-M6 ·
  T12→R3-M9 · T13→R3-M10 · T14→R3-M11 · T15→R3-M13 · T16→R3-M14 ·
  T17→R3-M26 · T18→R3-M27. Zero orphan findings (Batch B tracked in findings file).
- **Working directory for backend commands:** `backend/` via
  `backend\venv_win\Scripts\python.exe` (mock suites, local); DB-backed tests
  run in CI (this Windows host has no Postgres/Redis).
- **Skills:** `writing-plans` (exact files/code, no placeholders),
  `codebase-review-fix` gates (G1/G2/G3).

## Files to Change
1. `backend/app/services/booking_notifications.py` + NEW `backend/tests/test_booking_notifications.py` (T1)
2. `frontend/app/admin/requests/page.tsx` + extend `__tests__/page.test.tsx` (T2)
3. `frontend/app/admin/page.tsx` + NEW `frontend/app/admin/__tests__/page.test.tsx` (T3)
4. NEW `frontend/lib/download-blob.ts` + NEW `frontend/lib/__tests__/download-blob.test.ts` + use in `frontend/app/admin/files/page.tsx` (T4)
5. `frontend/app/liff/service-request/page.tsx` + NEW `__tests__/upload-retry.test.tsx` (T5)
6. NEW `backend/scripts/seed_e2e_requests.py` + `.github/workflows/e2e.yml` (T6)
7. `frontend/e2e/admin-requests-supervisor.spec.ts` (T7)
8. NEW `backend/tests/test_telegram_service.py` (T8)
9. NEW `backend/app/utils/mime_sniff.py` + `backend/app/api/v1/endpoints/media.py` (retarget 2 call sites) + `backend/app/api/v1/endpoints/liff.py` + NEW `backend/tests/test_liff_media_upload.py` (T9)
10. `backend/app/api/v1/endpoints/admin_requests.py` + extend `backend/tests/test_admin_requests_endpoints.py` (T10)
11. `backend/app/api/v1/endpoints/admin_users.py` + extend `backend/tests/test_admin_users.py` (T11)
12. `backend/app/api/v1/endpoints/admin_export.py` + extend `backend/tests/test_admin_analytics_export_endpoints.py` (T12)
13. `backend/app/schemas/service_request_liff.py` + NEW `backend/tests/test_liff_request_schema.py` (T13)
14. `backend/app/core/security.py` (helper) + `backend/app/api/v1/endpoints/admin_users.py` + `backend/app/schemas/auth.py` + NEW `backend/tests/test_password_policy.py` (T14)
15. `frontend/next.config.js` (T15)
16. `backend/app/services/message_intake/intent_matching.py` + NEW `backend/tests/test_intent_tiebreak.py` (T16)
17. `backend/app/api/deps.py` + `backend/app/db/session.py` + `backend/tests/test_admin_pagination_guards.py` (stale comment) (T17)
18. `.github/workflows/cd.yml` (T18)
- **UX before/after (user-visible only):** T2 footer gains working prev/next
  (was dead placeholder); T3 failed loads show an error banner (was silent
  zeros); T5 same-file retry uploads again (was dead); T4 Firefox downloads
  work; T13 oversize LIFF submits get inline 422 (was late 500/db error);
  T15/T18 invisible. All other tasks: no client-visible change.

## NOT Building
- Any Batch-B item (R3-M1/M3/M5/M7/M8/M12/M15-M25/M28-M30, R3-L1/L2) — scheduled round-3b.
- Response-shape changes (T2 paginates client-side over the bare array; T8/T18 touch no prod code paths).
- FK `ondelete` policy change (T11 catches IntegrityError instead — deliberate).
- Enforcing CSP (T15 is report-only; frame headers excluded — LIFF requires framing).
- Migrating `get_db` import sites beyond the re-export (T17 keeps both import paths working).
- Backfills, data migrations, new API routes.

## Step-by-Step Tasks

### T1 — booking flex: build FlexMessage before push (R3-H1)
- **ACTION:** Convert the confirmation dict to an SDK `FlexMessage` in `_push_flex`.
- **Root cause:** `_push_flex` passes raw dicts where the v3 SDK requires Message objects.
- **Regression risk:** LOW — identical Flex payload; mocked test pins the SDK type; failure mode unchanged (False + ERROR log).
- **IMPLEMENT:** in `backend/app/services/booking_notifications.py`:
  1. Add import: `from linebot.v3.messaging import FlexContainer, FlexMessage`
     (top imports, after the sqlalchemy import — mirrors `line_service.py:8`).
  2. Replace the `push_messages` call with exactly:
     ```python
         container = FlexContainer.from_dict(contents)
         await line_service.push_messages(
             raw_line_id,
             [FlexMessage(alt_text=alt_text, contents=container)],
         )
     ```
     (`build_booking_confirmation` returns a bubble dict — verified
     `flex_messages.py:44-45` — so `from_dict` matches `reply_flex` exactly.)
- **MIRROR:** `reply_flex` (`line_service.py:155-165`) — same 2 lines.
- **VALIDATE:** NEW `backend/tests/test_booking_notifications.py` (AsyncMock db, local):
  patch `app.services.booking_notifications.resolve_raw_for_push`
  (AsyncMock `"U1"` — note: imported INTO that module, L15) and
  `app.services.booking_notifications.line_service.push_messages` (AsyncMock);
  booking = `SimpleNamespace(queue_number="A1", service_type="svc",
  booking_date=date(2026,1,15), booking_time=time(10,30), contact_name="Ann")`
  (builder reads exactly these 5 attrs — verified `flex_messages.py:42-83`;
  date/time objects: formatters use `.day`/`.strftime` — verified L11-19);
  call `await notify_booking_confirmed(AsyncMock(), booking,
  SimpleNamespace(id=7))` — signature is `(db, booking, user)` (verified
  L46); assert push awaited once, `messages[0]` is a `FlexMessage`,
  `alt_text == "จองคิวสำเร็จ A1"`; second case: resolve returns None →
  False, push not called. Run `python -m pytest
  tests/test_booking_notifications.py -v`.

### T2 — requests table: working client pagination over skip/limit (R3-H2)
- **ACTION:** Page state + `skip`/`limit` params + live prev/next buttons.
- **Root cause:** query builder omits skip/limit; footer is a dead placeholder.
- **Regression risk:** LOW — page-0 view identical to today (same first 100 rows).
- **IMPLEMENT:** in `frontend/app/admin/requests/page.tsx`:
  1. `const PAGE_LIMIT = 100;` near top; `const [page, setPage] = useState(0);`
  2. In `fetchRequests`, after the date appends: `query.append('skip',
     String(page * PAGE_LIMIT)); query.append('limit', String(PAGE_LIMIT));`
     and add `page` to the `useCallback` dep array.
  3. Reset: `useEffect(() => { setPage(0); }, [filter.status, filter.category,
     debouncedSearch, filter.startDate, filter.endDate]);` (place with the
     other effects).
  4. Footer: prev `onClick={() => setPage(p => Math.max(0, p - 1))}
     disabled={page === 0} aria-label="Previous page"`; next `onClick={() =>
     setPage(p => p + 1)} disabled={requests.length < PAGE_LIMIT}
     aria-label="Next page"`; label text `Showing {requests.length} requests
     (page {page + 1})`. (aria-labels added: buttons currently have no
     accessible name — also fixes that a11y nit.)
- **MIRROR:** sibling paginated fetches appending skip/limit
  (`chatbot/broadcast/page.tsx` builds `limit` the same way).
- **VALIDATE:** extend `__tests__/page.test.tsx` (existing `mockApiFetch`
  style): next click sends `skip=100&limit=100`; next disabled when 1 row
  returned; changing a date filter re-sends `skip=0`. Run `cd frontend &&
  npx vitest run app/admin/requests/__tests__/page.test.tsx`.

### T3 — dashboard: fulfilled-not-ok behaves like rejection (R3-H3)
- **ACTION:** Treat HTTP `!ok` exactly as a rejected fetch for error purposes.
- **Root cause:** fulfilled-not-ok falls through both error branches, error stays null.
- **Regression risk:** LOW — ok-path rendering untouched; only adds error branches.
- **IMPLEMENT:** in `frontend/app/admin/page.tsx`:
  1. Add import: `import { getHttpStatusMessage } from '@/lib/api-error';`
  2. Extend both `if/else if` chains with a third branch:
     ```ts
     } else if (statsResult.status === 'fulfilled' && !statsResult.value.ok) {
         errorMessage ??= getHttpStatusMessage(statsResult.value.status);
     }
     ```
     (same shape for the monthly block).
  3. Extend `bothFailed` to count !ok as failed:
     ```ts
     const statsFailed = statsResult.status === 'rejected' || (statsResult.status === 'fulfilled' && !statsResult.value.ok);
     const monthlyFailed = monthlyResult.status === 'rejected' || (monthlyResult.status === 'fulfilled' && !monthlyResult.value.ok);
     const bothFailed = statsFailed && monthlyFailed;
     ```
     (Single-source failure keeps the existing graceful-partial behavior —
     documented tradeoff; the fix removes SILENT failure, not partial render.)
- **MIRROR:** `getHttpStatusMessage` Thai status map already used across admin UI.
- **VALIDATE:** NEW `frontend/app/admin/__tests__/page.test.tsx`
  (`// @vitest-environment jsdom`): mock `PageAccessGuard` (passthrough),
  `StatsCard`/`ChartsWrapper`/`PageHeader`/`LoadingSpinner` (div stubs);
  stub `global.fetch` with REAL `Response` objects: both 403 → "Connection
  Error" banner visible; both ok JSON → stats render, no banner. Run
  `npx vitest run app/admin/__tests__/page.test.tsx`.

### T4 — download helper: attached anchor + deferred revoke (R3-H4)
- **ACTION:** Extract a correct blob-download helper; use it in files page.
- **Root cause:** detached anchor click + same-tick object-URL revoke.
- **Regression risk:** LOW — same download semantics; deferred revoke strictly safer.
- **IMPLEMENT:**
  1. NEW `frontend/lib/download-blob.ts`:
     ```ts
     /** Download a Blob via a DOM-attached anchor (Firefox requires attachment)
      * and revoke the object URL after the download has started. */
     export function downloadBlob(blob: Blob, filename: string): void {
       const url = URL.createObjectURL(blob);
       const a = document.createElement('a');
       a.href = url;
       a.download = filename;
       document.body.appendChild(a);
       a.click();
       a.remove();
       setTimeout(() => URL.revokeObjectURL(url), 1000);
     }
     ```
  2. `files/page.tsx` `downloadFile`: add import line
     `import { downloadBlob } from '@/lib/download-blob';` (with the other
     `@/` imports) and replace the URL/anchor/revoke lines with
     `downloadBlob(blob, file.filename);`.
- **MIRROR:** standard attached-anchor download (MDN pattern).
- **VALIDATE:** NEW `frontend/lib/__tests__/download-blob.test.ts` (jsdom):
  stub `URL.createObjectURL`/`revokeObjectURL` with `vi.fn`, fake timers;
  assert anchor appended+clicked+removed, revoke NOT called synchronously,
  called after `advanceTimersByTime(1000)`. Run the file.

### T5 — LIFF upload: reset the file input so retry works (R3-H5)
- **ACTION:** Clear the input value after every upload attempt.
- **Root cause:** input value never cleared, so same-file reselect fires no change event.
- **Regression risk:** LOW — upload flow unchanged; reset only re-enables change events.
- **IMPLEMENT:** in `handleFileUpload` (`liff/service-request/page.tsx`):
  capture `const input = e.target;` as the first line, and in the existing
  `finally` add `input.value = '';` before the ref decrement.
  (Capture-first: `e.target` must not be dereferenced after awaits.)
- **MIRROR:** standard file-input reset for re-select.
- **VALIDATE:** NEW `__tests__/upload-retry.test.tsx` (jsdom). Mocks:
  `@line/liff` (`{__esModule: true, default: {}}`), `useLiffInit`
  (`{idToken: 'tok', initDone: true, profile: null, isInLineApp: true}`),
  `useAutoCloseCountdown` (`{}`), `@/lib/liff/upload-media`
  (`uploadLiffMedia: uploadMock`, `attachmentCapMessage: () => null`,
  `readErrorDetail: async () => null`), `next/head` (passthrough),
  `useToast: () => ({ toast: vi.fn() })`, `logger: { info: vi.fn(),
  error: vi.fn() }`, `location-cascade` (`fetchDistricts: async () =>
  [{DISTRICT_ID: 10, PROVINCE_ID: 1, DISTRICT_THAI: 'เขต', DISTRICT_ENGLISH:
  'K'}]`, `fetchSubDistricts: async () => [{SUB_DISTRICT_ID: 100,
  DISTRICT_ID: 10, SUB_DISTRICT_THAI: 'แขวง', DISTRICT_ENGLISH: 'K',
  POSTAL_CODE: '10100'}]` — shapes verified `types/location.ts:7-19`);
  stub `global.fetch` for `/api/v1/locations/provinces` →
  `[{PROVINCE_ID: 1, PROVINCE_THAI: 'กทม', PROVINCE_ENGLISH: 'BKK'}]`
  (mount effect, verified L111-131). Steps (names verified L584-816):
  step 0 — pick `select[name=prefix]` options[1].value, fill
  `input[name=firstname/lastname/phone_number]` ('สมชาย','ใจดี','0812345679'),
  click `getByRole('button', {name: 'ถัดไป'})` (verified L895-904),
  `await findByRole('combobox')` count 3 (step-1 marker); step 1 — agency
  select options[1], province combobox[0] options[1] (value "1") then
  `await waitFor` district combobox[1] options length 2, pick options[1]
  (value "10"), then sub combobox[2] options[1] (value "100"), click ถัดไป,
  step-2 marker: `await waitFor(() => expect(container.querySelector('select[name="topic_category"]')).not.toBeNull())`; step 2 — category options[1], then
  subcategory (options derive from category — re-query + options[1]),
  `textarea/input[name=description]` = 'รายละเอียดคำร้องทดสอบ', click ถัดไป;
  step 3 — `container.querySelector('input[type=file]')` (verified L863, no
  accessible name). `uploadMock` rejects once (`new Error('boom')`, alert
  shows — stub `window.alert`) then resolves `{id:'1',url:'u',name:'f'}`;
  fire `change` with the SAME `new File(['x'], 'a.png', {type:'image/png'})`
  twice; assert `uploadMock` called twice. (Option-picking via
  `options[1].value` is data-independent — works whatever the constants hold.)

### T6 — seed E2E requests so supervisor specs never skip (R3-H6)
- **ACTION:** New seed script + E2E job step creating PENDING + COMPLETED rows.
- **Root cause:** E2E job seeds the admin user only; specs skip without request rows.
- **Regression risk:** LOW (CI-only) — idempotent skip when rows exist; dry-run default.
- **IMPLEMENT:**
  1. NEW `backend/scripts/seed_e2e_requests.py`, exact skeleton (imports
     pinned — `print_dry_run_hint` takes NO args, verified `seed_admin.py:40`):
     ```python
     from __future__ import annotations
     import argparse
     import asyncio
     import sys
     from datetime import datetime, timezone
     from pathlib import Path

     BACKEND_DIR = Path(__file__).resolve().parents[1]
     if str(BACKEND_DIR) not in sys.path:
         sys.path.insert(0, str(BACKEND_DIR))

     from scripts._script_safety import print_dry_run_hint, print_script_header


     def build_parser() -> argparse.ArgumentParser:
         parser = argparse.ArgumentParser(description="Seed E2E supervisor-spec requests (PENDING + COMPLETED).")
         parser.add_argument("--apply", action="store_true", help="Write changes to the active database.")
         return parser


     async def seed_e2e_requests(*, apply: bool) -> int:
         from sqlalchemy import select
         from app.db.session import AsyncSessionLocal
         from app.models.service_request import RequestStatus, ServiceRequest

         print_script_header("Seed E2E supervisor-spec requests", apply=apply)
         if not apply:
             print_dry_run_hint()
             return 0
         async with AsyncSessionLocal() as db:
             existing = await db.scalar(select(ServiceRequest.id).limit(1))
             if existing:
                 print("requests already seeded, skipping.")
                 return 0
             db.add(ServiceRequest(status=RequestStatus.PENDING, firstname="E2E",
                                   lastname="Pending", topic_category="E2E",
                                   description="e2e seed"))
             db.add(ServiceRequest(status=RequestStatus.COMPLETED, firstname="E2E",
                                   lastname="Done", topic_category="E2E",
                                   description="e2e seed",
                                   completed_at=datetime.now(timezone.utc)))
             await db.commit()
             print("E2E requests seeded (PENDING + COMPLETED).")
             return 0


     def main(argv=None) -> int:
         args = build_parser().parse_args(argv)
         return asyncio.run(seed_e2e_requests(apply=args.apply))


     if __name__ == "__main__":
         raise SystemExit(main())
     ```
     (Column names verified nullable on the model: firstname/lastname L61-62,
     topic_category L64, description L70, completed_at L85; only `source` is
     nullable=False with "LIFF" default — verified model L41.)
  2. `.github/workflows/e2e.yml`: after the "Seed admin user" step insert an
     identical step running `python scripts/seed_e2e_requests.py --apply`
     (same working-directory + comment style).
- **MIRROR:** `seed_admin.py` (safety header, `--apply`, idempotent skip).
- **VALIDATE:** CI E2E job (cannot run Playwright locally): the 7 supervisor
  tests must show as passed, not skipped, in the job output. Locally:
  `python scripts/seed_e2e_requests.py` (dry-run prints header + hint,
  exit 0) and `--help`.

### T7 — revert E2E: assert the UI flip after confirm (R3-H7)
- **ACTION:** Fulfill PATCH + follow-up GET with reverted state; assert the pill flips (depends on T6 seed).
- **Root cause:** test asserts the fabricated PATCH echo; the promised reload observation never existed.
- **Regression risk:** LOW (E2E-only) — no prod code; T6 seed + full route control make it deterministic.
- **IMPLEMENT:** in `admin-requests-supervisor.spec.ts`: replace the whole
  revert-confirm test (L226-270, incl. its WRONG comment L230-233 claiming a
  `window.location.reload` — verified: zero reload matches in `[id]/page.tsx`;
  confirm flows through `guardedUpdate` → PATCH → `fetchDetail` refetch, L1641
  + L402-413) with this exact test (renamed — no reload happens):
  ```ts
  test('confirming the revert dialog sends PATCH and flips the status pill', async ({ page }) => {
    const detailUrl = await getFirstCompletedRequestDetailUrl(page)
    test.skip(!detailUrl, 'no COMPLETED requests in test DB')
    const id = detailUrl!.split('/').pop()!

    // Baseline: real backend GET on page load; capture BEFORE installing fulfills.
    const [detailResp] = await Promise.all([
      page.waitForResponse((r) => r.request().method() === 'GET' && r.url().endsWith(`/api/v1/admin/requests/${id}`)),
      page.goto(detailUrl!),
    ])
    const baseline = await detailResp.json()
    await expect(page.getByRole('button', { name: 'กลับ' })).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('text=เสร็จสิ้น').first()).toBeVisible()

    // Fulfill PATCH (no backend mutation) + the follow-up GET refetch with reverted state.
    let patchPayload: Record<string, unknown> | null = null
    await page.route(`**/api/v1/admin/requests/${id}`, async (route) => {
      const req = route.request()
      if (req.method() === 'PATCH') {
        patchPayload = req.postDataJSON?.() ?? {}
        return route.fulfill({ status: 200, contentType: 'application/json',
          body: JSON.stringify({ ok: true, ...patchPayload }) })
      }
      return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ ...baseline, status: 'AWAITING_APPROVAL' }) })
    })

    await page.getByRole('button', { name: 'การจัดการพิเศษ' }).click()
    await page.getByRole('menuitem', { name: /ยกเลิกอนุมัติ.*รออนุมัติ/ }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    const patchRespPromise = page.waitForResponse((r) =>
      r.request().method() === 'PATCH' && r.url().endsWith(`/api/v1/admin/requests/${id}`))
    await dialog.getByRole('button', { name: /ยืนยัน/ }).click()
    const patchResp = await patchRespPromise
    expect(patchResp.ok()).toBe(true)
    expect(patchPayload?.status).toBe('AWAITING_APPROVAL')
    await expect(page.locator('text=รออนุมัติ').first()).toBeVisible({ timeout: 10_000 })
  })
  ```
  (Route glob matches ONLY the exact detail GET + PATCH — comments/audit paths
  are longer and never match whole-string. Pill text `รออนุมัติ` verified
  `lib/constants/request-status.ts:44`; sibling test proves the
  `text=เสร็จสิ้น` pill pattern (spec L208-209). Keep `test.skip(!detailUrl)`;
  T6 seed means it never triggers in CI.)
- **MIRROR:** standard Playwright reload-after-mutation pattern.
- **VALIDATE:** CI E2E job (Playwright cannot run locally). Locally: `npx tsc
  --noEmit` subset gate for the spec file is NOT configured — instead run
  `npx eslint e2e/admin-requests-supervisor.spec.ts` to catch syntax/type slips.

### T8 — telegram: execute the real send paths in unit tests (R3-H8)
- **ACTION:** Cover credential-load, 200, non-200, exception, and HTML-escape paths.
- **Root cause:** real send paths substituted by always-True mocks in every existing test.
- **Regression risk:** NONE — tests only, zero prod change.
- **IMPLEMENT:** NEW `backend/tests/test_telegram_service.py` (pure mocks, local).
  Instantiate a FRESH `TelegramService()` per test (methods mutate
  `bot_token`/`chat_id` — a shared instance would bleed config across tests).
  Exact patch targets (`credential_service` is imported INTO the telegram
  module — verified L7):
  ```python
  from types import SimpleNamespace
  from unittest.mock import AsyncMock, patch
  from app.services import telegram_service as tg_mod
  from app.services.telegram_service import TelegramService

  CRED = SimpleNamespace(credentials="enc", metadata_json={"admin_chat_id": "42"})

  class _FakeCM:
      def __init__(self, status_code=200, text="ok", exc=None, calls=None):
          self._s = (status_code, text, exc, calls if calls is not None else [])
      async def __aenter__(self):
          return self
      async def __aexit__(self, *exc_info):
          return False
      async def post(self, url, json=None):
          status_code, text, exc, calls = self._s
          calls.append({"url": url, "json": json})
          if exc is not None:
              raise exc
          return SimpleNamespace(status_code=status_code, text=text)
  ```
  Per-case wiring (`db = AsyncMock()`; `patch.object(tg_mod.credential_service,
  "get_default_credential", new=AsyncMock(return_value=CRED-or-None))`;
  `patch.object(tg_mod.credential_service, "decrypt_credentials",
  return_value={"bot_token": "tok"})`;
  `patch("httpx.AsyncClient", return_value=_FakeCM(...))`):
  1. unconfigured: credential None → `send_alert_message("hi", db)` False
     (settings has no telegram attrs in test env — `getattr(..., None)` path).
  2. handoff 200: `send_handoff_notification("Ann", None,
     [SimpleNamespace(content="hello")], "https://admin/x", db)` True +
     `"tok" in calls[0]["url"]` + `calls[0]["json"]["chat_id"] == "42"`.
  3. alert non-200: `_FakeCM(500, "err")` → False.
  4. `post` raises `RuntimeError("boom")` → False.
  5. escape: content `"<script>x</script>"` → `"&lt;script&gt;" in
     calls[0]["json"]["text"]`.
  (Signatures verified L39-45/L87; items need `.content` — verified L58.
  No prod-code change in this task — tests only.)
- **MIRROR:** `test_booking_flex.py`-style service unit tests (mock collaborators).
- **VALIDATE:** `python -m pytest tests/test_telegram_service.py -v` (local, no DB).

### T9 — LIFF upload: sniff magic bytes via a shared helper (R3-M2)
- **ACTION:** Single enforcement point for magic sniffing; LIFF uses it too.
- **Root cause:** LIFF trusts spoofable Content-Type while the sniff helper lives admin-local.
- **Regression risk:** LOW — behavior-preserving verbatim move; both upload suites must stay green.
- **IMPLEMENT:**
  1. NEW `backend/app/utils/mime_sniff.py` with this EXACT content (moved
     verbatim from `media.py:59-68` — verified firsthand; L70+ is limiter/
     schema code, NOT part of the def):
     ```python
     """Shared magic-byte sniffing: single enforcement point for upload mime checks."""
     from typing import Optional


     def sniff_mime(data: bytes) -> Optional[str]:
         """Real mime from magic bytes, or None when the bytes are neither PNG,
         JPEG, nor PDF."""
         if data.startswith(b"\x89PNG\r\n\x1a\n"):
             return "image/png"
         if data.startswith(b"\xff\xd8\xff"):
             return "image/jpeg"
         if data.startswith(b"%PDF"):
             return "application/pdf"
         return None
     ```
  2. `media.py`: delete private `_sniff_mime` (L59-68); add import line
     `from app.utils.mime_sniff import sniff_mime` with the other
     `from app...` imports; change both call sites (L278, L663 — verified)
     from `_sniff_mime(content)` to `sniff_mime(content)`. No behavior change.
  3. `liff.py` `upload_liff_media`: add import line
     `from app.utils.mime_sniff import sniff_mime` (with the other
     `from app...` imports, after the `app.models.media_file` line);
     after the size checks (L116-118), insert:
     ```python
         sniffed = sniff_mime(content)
         if sniffed is None or sniffed not in _LIFF_MEDIA_ALLOWED_MIMES:
             raise HTTPException(status_code=422, detail="ไฟล์ไม่ตรงกับประเภทที่รองรับ (JPEG, PNG, PDF เท่านั้น)")
     ```
     and store `mime_type=sniffed` (replace `mime` at L124) + pass `sniffed`
     to `detect_category`. Keep the header pre-check (cheap reject).
- **MIRROR:** `media.py:261-282` (`_validate_media_upload` 422 shape).
- **VALIDATE:** NEW `backend/tests/test_liff_media_upload.py` (TestClient +
  `dependency_overrides[deps.get_db]` mock-db style per
  `test_admin_analytics_export_endpoints.py`; patch
  `app.api.v1.endpoints.liff.require_liff_identity` AsyncMock `"U1"`):
  real-PNG-bytes + spoofed `content_type="image/png"` on HTML bytes → 422;
  real PNG → 200 with stored `mime_type == "image/png"`. Local run.

### T10 — priority enum + assignee existence (422/404, not 500) (R3-M4)
- **ACTION:** Type priority as the enum; verify assignee ids exist.
- **Root cause:** free-string priority applied onto an Enum column; assignee ids never resolved.
- **Regression risk:** LOW — only previously-500ing inputs change (→422/404); verified frontend sends exact enum values and tests use uppercase only.
- **IMPLEMENT:** in `backend/app/api/v1/endpoints/admin_requests.py`
  (`RequestPriority` + `User` already imported — verified L17/L21):
  1. Schema (L338): `priority: Optional[RequestPriority] = None`.
  2. At the TOP of `_apply_status_and_assignment` (before the
     `if update_data.unassign:` block at L470 — verified L470 `if` / L484
     `elif` chain: inserting between them is a SyntaxError), insert:
     ```python
         if update_data.assigned_agent_id is not None:
             agent = await db.get(User, update_data.assigned_agent_id)
             if not agent:
                 raise HTTPException(status_code=404, detail="Assigned agent not found")
         if update_data.assigned_by_id is not None:
             assigner = await db.get(User, update_data.assigned_by_id)
             if not assigner:
                 raise HTTPException(status_code=404, detail="Assigned-by user not found")
     ```
     (404, not 422: the VALUE shape is fine, the REFERENT is missing —
     matches `get_request_detail` 404 convention.)
- **MIRROR:** `status: Optional[RequestStatus]` enum field directly above (L337).
- **VALIDATE:** extend `backend/tests/test_admin_requests_endpoints.py`:
  PATCH `priority: "BOGUS"` → 422; PATCH `assigned_agent_id: 999999` → 404
  (mock-db style of that file). Local run.

### T11 — hard delete: IntegrityError → 409 with guidance (R3-M6)
- **ACTION:** Catch FK failure on hard delete; tell the admin to deactivate.
- **Root cause:** unhandled FK IntegrityError on hard delete of referenced users.
- **Regression risk:** LOW — soft path untouched (no delete, no trip); hard path 500→409.
- **IMPLEMENT:** in `admin_users.py` delete endpoint (L562-576):
  1. Add import: `from sqlalchemy.exc import IntegrityError` (no such import
     today — verified).
  2. Wrap delete+audit+commit:
     ```python
         try:
             if hard:
                 await db.delete(user)
             else:
                 user.is_active = False
             await create_audit_log(
                 db=db,
                 admin_id=current_admin.id,
                 action="delete_user",
                 resource_type="user",
                 resource_id=str(user_id),
                 details={"username": username, "role": role_value, "hard": hard},
             )
             await db.commit()
         except IntegrityError:
             await db.rollback()
             raise HTTPException(
                 status_code=status.HTTP_409_CONFLICT,
                 detail="Cannot hard-delete: user has related records; deactivate instead",
             )
     ```
     (create_audit_log body unchanged inside the try. Soft path unaffected —
     no delete, no FK trip.)
- **MIRROR:** username-conflict 409 shape in `create_user` (same file L349-352).
- **VALIDATE:** extend `backend/tests/test_admin_users.py` (TestClient +
  override style): mock db where `commit` raises
  `IntegrityError("stmt", {}, Exception("fk"))`, user row resolves, caller
  SUPER_ADMIN → 409 + detail mentions deactivate; soft delete still 200.
  Local run.

### T12 — CSV defuse: quote formula-leading cells (R3-M9)
- **ACTION:** Prefix-defuse `=+-@`-leading message content in CSV exports.
- **Root cause:** raw content cells execute as formulas when opened in spreadsheets.
- **Regression risk:** LOW — prefix only on formula-leading cells; normal cells byte-identical.
- **IMPLEMENT:** in `backend/app/api/v1/endpoints/admin_export.py`:
  1. Add helper (module level, near `_display_name`):
     ```python
     _FORMULA_LEADERS = ("=", "+", "-", "@", "\t", "\r")

     def _defuse_csv_cell(value: str) -> str:
         """Prefix a single quote so spreadsheet apps never execute the cell."""
         if value[:1] in _FORMULA_LEADERS:
             return "'" + value
         return value
     ```
  2. In `_iter_csv_rows`, wrap ONLY the content cell: `_defuse_csv_cell(m.content
     or "")`. (Other cells are system-controlled: timestamp, ids, enums.)
- **MIRROR:** OWASP CSV-injection `' Defuse (prefix, not strip — data preserved).
- **VALIDATE:** extend `backend/tests/test_admin_analytics_export_endpoints.py`
  CSV test: message content `=cmd|'/c calc'!A0` → output cell
  `'=cmd|'/c calc'!A0` (exact full string); normal content untouched. Local run.

### T13 — LIFF create schema: length caps + typed attachments (R3-M10)
- **ACTION:** Mirror F5/F6 caps on the LIFF twin; type the attachments list.
- **Root cause:** LIFF twin missed the F5/F6 capping pass; attachments list untyped.
- **Regression risk:** LOW — caps mirror the proven admin twin; oversized payloads now 422 (intended).
- **IMPLEMENT:** in `backend/app/schemas/service_request_liff.py` (add
  `Field` to the pydantic import):
  ```python
  class AttachmentRef(BaseModel):
      id: str = Field(..., max_length=64)
      url: str = Field(..., max_length=500)
      name: Optional[str] = Field(None, max_length=255)
  ```
  Caps (F5/F6 mirror): prefix 20, firstname/lastname 100, phone_number 20,
  email 254, agency 200, province/district/sub_district 100,
  topic_category/topic_subcategory 100, description 5000, name 100,
  service_type 100, line_user_id 100; `attachments: Optional[list[AttachmentRef]]
  = Field(default_factory=list, max_length=3)` (3 = `LIFF_MAX_ATTACHMENTS`,
  verified `frontend/lib/liff/upload-media.ts:8`). Keep `_require_content`
  validator untouched.
- **MIRROR:** `AdminRequestCreate` caps (`admin_requests.py:56-71`).
- **VALIDATE:** NEW `backend/tests/test_liff_request_schema.py` (pure pydantic,
  no DB): 101-char firstname → ValidationError; 4 attachments → error; bad
  item shape → error; valid minimal payload passes. Local run.

### T14 — bcrypt-safe passwords: byte-length validator on 4 fields (R3-M11)
- **ACTION:** Reject >72 UTF-8 bytes with 422 (chars cap alone is WRONG for multibyte).
- **Root cause:** raw bcrypt raises past 72 bytes; no field caps it.
- **Regression risk:** LOW — rejects only previously-crashing inputs; 72B+ passwords never worked.
- **IMPLEMENT:**
  1. `backend/app/core/security.py`, after `BCRYPT_ROUNDS`:
     ```python
     BCRYPT_MAX_PASSWORD_BYTES = 72

     def assert_bcrypt_compatible(password: str) -> str:
         """Raise ValueError when the password exceeds raw bcrypt's 72-byte input limit."""
         if len(password.encode("utf-8")) > BCRYPT_MAX_PASSWORD_BYTES:
             raise ValueError("Password must be at most 72 bytes")
         return password
     ```
  2. `admin_users.py` — on `UserCreateRequest.password` and
     `UserUpdateRequest.password`: `Field(..., min_length=8, max_length=72)` +
     ```python
         @field_validator("password")
         @classmethod
         def _check_password_bytes(cls, v: str) -> str:
             return assert_bcrypt_compatible(v)
     ```
     On `ResetPasswordRequest.new_password`: `Field(..., min_length=8,
     max_length=72)` + identical body with `@field_validator("new_password")`.
     (Add `field_validator` + helper imports; `Field` already imported.)
  3. `schemas/auth.py` `LoginRequest.password`: `Field(..., max_length=72)` +
     the same 4-line validator for `"password"` (add `Field` + helper
     imports; `field_validator` already imported).
- **MIRROR:** existing `field_validator("username")` normalizer in `auth.py:11-14`.
- **VALIDATE:** NEW `backend/tests/test_password_policy.py` (pure unit, local):
  72 ascii ok; 73 ascii raises; 18 emoji (72 bytes) ok; 19 emoji raises;
  schema-level: `UserCreateRequest`/`LoginRequest` with 73-char password →
  ValidationError. (Route wiring proven by schema use; no per-route tests.)

### T15 — security headers in next.config.js, LIFF-safe (R3-M13)
- **ACTION:** Add `headers()` — minus frame controls (LIFF requires framing).
- **Root cause:** no headers() hook and no middleware file anywhere under frontend/.
- **Regression risk:** LOW — report-only CSP + passive headers; frame controls excluded for LIFF.
- **IMPLEMENT:** in `frontend/next.config.js`, add:
  ```js
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        { key: 'Strict-Transport-Security', value: 'max-age=31536000' },
        { key: 'Content-Security-Policy-Report-Only', value: "default-src 'self'; img-src 'self' https: data:; script-src 'self' 'unsafe-inline' 'unsafe-eval' https:; style-src 'self' 'unsafe-inline' https:; connect-src 'self' https:;" },
      ],
    }];
  },
  ```
  (No `X-Frame-Options`/frame-ancestors: LIFF pages MUST be frameable inside
  LINE — document with an inline comment. CSP report-only: zero breakage risk;
  HSTS without includeSubDomains: conservative. `unsafe-inline/eval` in the
  report-only CSP matches Next.js runtime needs — this header only REPORTS.)
- **MIRROR:** Next.js `headers()` convention.
- **VALIDATE:** `npm run build` in CI (config load + route build); no unit
  test (config-only). Note expected headers in the PR for manual curl check.

### T16 — deterministic intent tiebreak: order by id (R3-M14)
- **ACTION:** One-line order in the shared stmt builder (no priority column exists).
- **Root cause:** limit(1) over an unordered builder picks an arbitrary winner.
- **Regression risk:** LOW — ordering only; single-match behavior identical.
- **IMPLEMENT:** in `_intent_keyword_stmt` (`intent_matching.py:51-60`), append
  `.order_by(IntentKeyword.id.asc())` after `.filter(*filters)`.
  (Verified: `IntentKeyword` has NO priority column — id.asc = oldest rule
  wins, deterministic. Covers all three `limit(1)` sites + REGEX-all order.)
- **MIRROR:** `order_by(Tag.name.asc())` sibling style in conversations.py.
- **VALIDATE:** NEW `backend/tests/test_intent_tiebreak.py` (mocked db,
  local) with this exact stub (signature `(text, db)`, returns the row —
  verified L63-77):
  ```python
  from types import SimpleNamespace
  from unittest.mock import AsyncMock, MagicMock
  from app.services.message_intake.intent_matching import find_intent_keyword

  row = SimpleNamespace(id=7)
  res = MagicMock()
  res.scalars.return_value.first.return_value = row
  db = AsyncMock()
  db.execute = AsyncMock(return_value=res)

  out = await find_intent_keyword("เวลาเปิด", db)
  assert out is row
  assert "ORDER BY" in str(db.execute.call_args.args[0])
  ```
  (EXACT branch executes first → exactly one `execute`; `str(stmt)` needs no
  engine; table-name-free assert. No existing `find_intent_keyword` test file
  — verified zero matches — so a new file.)

### T17 — single get_db: re-export + fix annotation (R3-M26)
- **ACTION:** One implementation, both import paths keep working (identity preserved).
- **Root cause:** two identical generators with split imports + one wrong annotation.
- **Regression risk:** MEDIUM — import-identity change; mitigated by identical bodies + override-heavy suite + full CI suite.
- **IMPLEMENT:**
  1. `backend/app/db/session.py`: fix annotation to `async def get_db() ->
     AsyncGenerator[AsyncSession, None]:` (+ `from typing import AsyncGenerator`).
  2. `backend/app/api/deps.py`: DELETE the local `get_db` def (L25-27);
     extend L5 to `from app.db.session import AsyncSessionLocal, get_db`.
     (No circular import: `db/session` imports only config. Every
     `deps.get_db` reference — incl. `dependency_overrides` identity keys —
     now IS `db/session.get_db`; this also heals the split the stale comment
     in `test_admin_pagination_guards.py:89` documents.)
  3. Update that stale comment to state the unification.
- **MIRROR:** canonical single-source import pattern.
- **VALIDATE:** full local mock-core run (`python -m pytest tests/ -q -x
  --ignore` DB-bound files is NOT configured — instead run the 6 most
  override-heavy files: `test_session_claim test_admin_requests_endpoints
  test_admin_pagination_guards test_transfer_session_errors
  test_live_chat_service test_auth_login_ratelimit`) + FULL suite in CI
  (import-surface change). Zero behavior change expected.

### T18 — CD: pin koyeb install.sh to v5.12.0 + retry (R3-M27)
- **ACTION:** Pinned release tarball + checksum verify + transient-failure retries.
- **Root cause:** moving-target installer + no retry on the observed transient 404.
- **Regression risk:** LOW (CD-only) — loud curl failure on any problem; version command proves the binary.
- **IMPLEMENT:** in `.github/workflows/cd.yml` "Install Koyeb CLI" step
  (verified: `install.sh` exists at tag `v5.12.0`, same 1240 bytes; latest
  release confirmed via API 2026-09-28):
  ```yaml
        env:
          KOYEB_CLI_VERSION: v5.12.0
        run: |
          set -e
          URL_BASE="https://github.com/koyeb/koyeb-cli/releases/download/${KOYEB_CLI_VERSION}"
          TARBALL="koyeb-cli_${KOYEB_CLI_VERSION#v}_linux_amd64.tar.gz"
          mkdir -p /tmp/koyeb-dl && cd /tmp/koyeb-dl
          for i in 1 2 3; do
            curl -fsSL -o "$TARBALL" "$URL_BASE/$TARBALL" \
            && curl -fsSL -o checksums.txt "$URL_BASE/checksums.txt" && break || sleep 10
          done
          test -s "$TARBALL" && test -s checksums.txt
          sha256sum -c --ignore-missing checksums.txt
          mkdir -p "$HOME/.koyeb/bin" && tar -xzf "$TARBALL" -C "$HOME/.koyeb/bin"
          BIN="$(find "$HOME/.koyeb/bin" -name koyeb -type f | head -1)"
          BIN_DIR="$(dirname "$BIN")"
          if [ "$BIN_DIR" != "$HOME/.koyeb/bin" ]; then mv "$BIN" "$HOME/.koyeb/bin/koyeb"; BIN="$HOME/.koyeb/bin/koyeb"; fi
          test -x "$BIN" && "$BIN" version
          echo "$HOME/.koyeb/bin" >> "$GITHUB_PATH"
  ```
  (Pinning install.sh alone is NOT enough — the installer fetches the latest
  binary, so the tag must pin the TARBALL + checksums (verified 2026-09-28
  via `gh api repos/koyeb/koyeb-cli/releases/latest` → tag v5.12.0, asset
  `koyeb-cli_5.12.0_linux_amd64.tar.gz`, `checksums.txt` present; re-run
  that command to re-verify before any bump). `find`+`mv` covers either
  tarball layout; `version` proves a working binary; retry kills the
  transient-404 flake. If the tag is ever deleted upstream, curl fails
  loudly — visible, not silent.)
- **IMPLEMENT-TIME CHECK (pinned):** before implementing T18, re-run
  `gh api repos/koyeb/koyeb-cli/releases/latest --jq "{tag: .tag_name,
  assets: [.assets[].name]}"`; if the tag moved past v5.12.0 or the asset
  names changed, update `KOYEB_CLI_VERSION` + `TARBALL` together (never bump
  one without the other).
- **MIRROR:** pinned-action convention (`actions/checkout@v4`).
- **VALIDATE:** next CD run on main (post-merge); no test (workflow-only).
  Risk note: if v5.12.0 is ever deleted upstream, CD fails loudly at the
  curl step — visible, not silent.

## Validation Commands
- Scoped (after EVERY task): the task's VALIDATE line.
- Backend mock-core (after all backend tasks): `cd backend &&
  ..\backend\venv_win\Scripts\python.exe -m pytest tests/test_booking_notifications.py
  tests/test_telegram_service.py tests/test_liff_media_upload.py
  tests/test_admin_requests_endpoints.py tests/test_admin_users.py
  tests/test_admin_analytics_export_endpoints.py
  tests/test_liff_request_schema.py tests/test_password_policy.py
  tests/test_intent_tiebreak.py tests/test_session_claim.py
  tests/test_live_chat_service.py tests/test_transfer_session_errors.py
  tests/test_admin_pagination_guards.py tests/test_auth_login_ratelimit.py -q`
- Frontend (after all frontend tasks): `cd frontend && npm run test:unit`
  + `npx eslint` on every touched file.
- CI-only: full backend suite (import surface T17), E2E (T6+T7), `next build`
  (T15), CD (T18, post-merge).
- No ruff/mypy config exists in `backend/` → pytest is the gate.

## Testing Strategy
- Every behavior fix asserts the NEW behavior (SDK-object type, skip param
  sent, banner shown, revoke deferred, second upload call, mock 422/409/404,
  defused cell, deterministic winner, same-object re-export).
- Pure-pydantic/pure-function tests where possible (T13/T14/T16: no DB).
- Never weaken existing assertions; T2/T10/T11/T12 extend files in the style
  pinned in their VALIDATE lines (`mockApiFetch` / TestClient + override /
  CSV-row asserts) — no extra discovery needed.
- E2E/build/CD verified by CI; each such task names its CI signal.

## Acceptance Criteria
- [ ] All 8 Highs fixed at root cause; 10 Mediums fixed; no orphan finding.
- [ ] Scoped suites green after each task; mock-core + frontend suites green at end.
- [ ] CI green: backend suite, E2E (7 supervisor tests PASS, not skip), build, encoding.
- [ ] No `backend/app/core/audit.py` change; no Batch-B file touched except
  shared test-file extends (none in this batch).
- [ ] No new warnings/errors in test output attributable to these changes.

## Self-review (writing-plans gate, done by plan author)
- Spec coverage: every Batch-A PRD item → ≥1 task; Batch B explicitly NOT in
  plan (NOT Building + findings file). No gaps.
- Placeholder scan: every code step carries exact code/commands; zero
  "read at implement" / "read first" notes remain (T9 body pasted verbatim,
  T5 mocks/fields spelled, test styles pinned per task).
- Type consistency: `AttachmentRef`/`sniff_mime`/`assert_bcrypt_compatible`/
  `downloadBlob`/`_defuse_csv_cell` names used identically wherever referenced;
  `PAGE_LIMIT=100` matches backend default; `LIFF_MAX_ATTACHMENTS=3` mirrored.
- Dependency order: T6 before T7 validation (seed → spec); T17 validated by
  the mock-core run; T9's util move keeps media.py green via retarget.

## Implementation notes (deviations from plan, all verified)

- **T5 test:** implemented with a `value`-setter spy instead of a bare
  retry-count assert. Rationale: jsdom never reproduces the real browser
  symptom (no change event when reselecting an identical file), so a
  bare count passes WITH and WITHOUT the fix (proven by negative
  control). The spy pins the `finally` reset directly: green with the
  fix, `expected [] to include ''` without it. Also: step-0 `prefix` is
  a text input (not a select) and step-1 select order is
  agency/province/district/sub_district — the test fills them accordingly.
- **T9 test file:** `backend/tests/test_liff_media_upload.py` already
  existed (B1-B10 DB-backed contract) — the plan's NEW-file name
  collided. The sniff tests live in NEW
  `backend/tests/test_liff_media_sniff.py` instead; the B1-B10 file is
  byte-identical. B1-B10 compatibility with the sniff gate reviewed by
  reading: all 200-path uploads use JPEG magic bytes, MIME asserts hold.
- **T9 override key:** the plan's `dependency_overrides[deps.get_db]`
  does NOT match liff.py (it imports `app.db.session.get_db`, a
  DIFFERENT object pre-T17 — verified firsthand). The test overrides
  `session_get_db`. Post-T17 both keys are identical anyway.
- **T13 handler:** typing `attachments` as `list[AttachmentRef]` would
  break the JSONB store (`attachments=request.attachments` passes
  models to SQLAlchemy). liff.py now dumps each item with
  `model_dump()` before insert — required companion change, covered by
  the existing LIFF suites (44 green).
