# PRP — Codebase Review Fixes 2026-09-02

**Metadata**
- Spec: `.claude/PRPs/findings/2026-09-02-codebase-review-findings.md` (binding; L3 amended to DEFER during planning)
- PRD: `.claude/PRPs/prds/2026-09-02-codebase-review-fixes.prd.md`
- Branch: `fix/codebase-review-fixes-20260902` · Stack: FastAPI/SQLAlchemy-async backend, Next.js/React-19 frontend
- Commands: backend `cd backend && ./venv/Scripts/python.exe -m pytest <paths>` (CI: `python -m pytest`); frontend `cd frontend && npx tsc --noEmit && npm run lint && npx vitest run <paths> && npm run build`
- Constraint: no schema/migration changes; no new runtime dependencies (only version-pin edits).

**Files to Change**
- backend: `app/core/redis_client.py`, `app/api/v1/endpoints/webhook.py`, `app/api/v1/endpoints/admin_users.py`, `app/api/v1/endpoints/auth.py`, `app/api/v1/endpoints/admin_live_chat.py`, `app/api/v1/endpoints/admin_reports.py`, `app/api/v1/endpoints/media.py`, `app/api/v1/endpoints/liff.py`, `app/api/v1/endpoints/admin_integrations.py`, `app/services/rich_menu_service.py`, `app/services/line_service.py`, `app/services/live_chat_service/messaging.py`, `requirements.txt`
- backend tests (new/updated): `tests/test_webhook_signature.py` (new), `tests/test_admin_users_role_check.py` (new), `tests/test_rich_menu_edit_recreate.py` (+1 case), `tests/test_rich_menu_display_scheduler_db.py` (new), `tests/test_auth_login_ratelimit.py` (new), `tests/test_media_upload_allowlist.py` (new), `tests/test_admin_integrations_ssrf.py` (new), `tests/test_webhook_deduplication.py` (update: set() no-connection contract), `tests/test_media_endpoints.py` (update: real magic bytes), `tests/test_session_claim.py` (update: chat_mode reset), `tests/test_line_service_circuit_breaker.py` (update: duplicate-row dedup lookup)
- frontend: `app/liff/service-request/page.tsx`, `app/liff/request-v2/page.tsx`, `app/liff/service-request-single/page.tsx`, `app/liff/booking/page.tsx`, `app/admin/rich-menus/new/page.tsx`, `app/admin/rich-menus/[id]/edit/page.tsx`, `app/admin/live-chat/_hooks/useMessageFlow.ts`, `app/admin/live-chat/_hooks/useConversationSync.ts`

**NOT Building**
- No host allowlist product feature for integrations (DEFER-L1), no CI lock file (DEFER-M2), no CD gating changes (DEFER-M1/M3), no WS-origin tightening (DEFER-L3), no scheduler/behavior changes beyond the listed fixes, no unrelated refactoring.

## Tasks

### Task 1 — H1: webhook dedup lock fails open when Redis is down
- ACTION: `RedisClient.set` must distinguish "redis unavailable" from "lock not acquired".
- IMPLEMENT: in `app/core/redis_client.py` change `async def set(...) -> bool` to `-> Optional[bool]`: return `True` when redis says OK, `False` when NX lost (real contention), **`None`** when `self._redis` is None or any exception occurs (keep the error log). Return-value consumers (verified by grep): the webhook endpoint (`webhook.py:63`) and `tests/test_webhook_deduplication.py::test_set_with_no_connection:275-278` — update the webhook consumer: `if lock_acquired is False: continue` (duplicate/in-flight); `if lock_acquired is None: logger.warning(...processing without dedup lock...)` and fall through to process. Update `test_set_with_no_connection` to assert `result is None` when disconnected (contract change is intentional: None = unavailable). The earlier `exists()` dedup check already degrades to falsy-on-error, so behavior stays fail-open end-to-end.
- VALIDATE: `pytest tests/test_webhook_signature.py tests/test_webhook_deduplication.py -q` (Task 2 includes a Redis-down case asserting the event still processes).
- GOTCHA: `tests/test_webhook_deduplication.py` uses a `redis_client` fixture — check its construction there; the updated assertion must hold for the fixture as built.

### Task 2 — H5: webhook signature test matrix (new file `tests/test_webhook_signature.py`)
- ACTION: cover the public unauthenticated endpoint `POST /api/v1/webhook`.
- IMPLEMENT: build a raw body containing one valid LINE `MessageEvent` (text message, `replyToken`, `webhookEventId`). Use `TestClient` from the existing conftest `app` fixture pattern (follow `tests/test_rich_menu_image_media.py` for TestClient app + dependency overrides). Signature = `base64.b64encode(hmac.new(settings.LINE_CHANNEL_SECRET.encode(), raw_body, sha256).digest())` sent as `X-Line-Signature`. Patch, in the `app.api.v1.endpoints.webhook` module namespace: `redis_client.exists`/`redis_client.set` (AsyncMock; exists→False, set→True) and the event handlers (`_handle_message_event_impl`, `handle_postback_event`, friend_service follow/unfollow) so no DB/LINE IO happens. Cases: missing header → 400; wrong signature → 400; valid signature → 200 + message handler awaited once; **Redis-down case** (set→None) → 200 + handler awaited (Task 1 behavior). Note: events dispatch via `BackgroundTasks`, so `TestClient.post` returns after background execution — assert on the handler mocks.
- VALIDATE: `pytest tests/test_webhook_signature.py -q` green (full gate in Task 19).

### Task 3 — H2: role check must cover DIRECTOR and HEAD
- ACTION: `_check_role_permission` in `admin_users.py` ends with an implicit allow for unknown roles.
- IMPLEMENT: add `elif target_role in (UserRole.DIRECTOR, UserRole.HEAD):` requiring `current_user.role == UserRole.SUPER_ADMIN` else 403 (detail in the same English style: "Only SUPER_ADMIN can manage DIRECTOR/HEAD users").
- TESTS (new `tests/test_admin_users_role_check.py`): direct unit tests of `_check_role_permission` with `SimpleNamespace(role=...)` users — ADMIN→DIRECTOR raises 403, ADMIN→HEAD raises 403, SUPER_ADMIN→DIRECTOR passes, SUPER_ADMIN→AGENT passes, ADMIN→AGENT passes (regression), and the existing SUPER_ADMIN/ADMIN guards still raise for non-super admins.
- VALIDATE: `pytest tests/test_admin_users_role_check.py -q`.

### Task 4 — M12: recreate-on-drift hard-fails on dangling image FK
- ACTION: `_recreate_on_line` currently skips the image upload when `image_media_id` is set but the `MediaFile` row is gone, then deletes the old image-bearing menu.
- IMPLEMENT: in `app/services/rich_menu_service.py` fail-fast block: after `media = await db.get(MediaFile, ...)`, `if media is None: raise RuntimeError("รูปของเมนูหายไปจากระบบ กรุณาอัปโหลดรูปใหม่ก่อนซิงค์")`; the oversize check keeps its current shape (media is now provably non-None).
- TEST: extend `tests/test_rich_menu_edit_recreate.py` — menu with `image_media_id` set, `gets=[None]` → `success is False`, message contains "รูป", `create_on_line` not called, `line_rich_menu_id` unchanged.
- VALIDATE: `pytest tests/test_rich_menu_edit_recreate.py -q`.

### Task 5 — M2 + M5: size caps checked before buffering uploads
- ACTION: `admin_live_chat.py:180` has no cap at all; `media.py:222`/`media.py:245` (both admin upload routes) and `liff.py` media route read the full body before checking length.
- IMPLEMENT: (a) `admin_live_chat.send_media`: define `MAX_LIVE_CHAT_MEDIA_BYTES = 10 * 1024 * 1024` at module top; before `file.read()`: `if file.size is not None and file.size > MAX_LIVE_CHAT_MEDIA_BYTES: raise HTTPException(413, "File too large (max 10MB)")`; keep a post-read `len(content)` check as backstop. (b) `media.py` both upload routes + the LIFF media route: insert the same `file.size` pre-check above the existing `await file.read()` + `len(content)` checks (do not remove the post-read checks).
- VALIDATE: `pytest tests/test_media_upload_allowlist.py -q` (Task 10 file includes an oversize-rejected-before-read case via monkeypatched tiny cap, pattern from `test_rich_menu_image_media.py::test_upload_rejects_oversize_before_reading_body`).

### Task 6 — M3: delete_conversation resets chat_mode to BOT
- ACTION: force-closing the open session in `admin_live_chat.delete_conversation` (≈line 643) never reverts the user's `chat_mode`, unlike `close_session` in `services/live_chat_service/sessions.py:116-118` which sets it back to `ChatMode.BOT` (str-enum, value "BOT").
- IMPLEMENT: in the same block where `session.status = CLOSED` is set, add `user.chat_mode = ChatMode.BOT` guarded by `if user:` (the endpoint already resolves `user`; `ChatMode` is imported in `sessions.py` from `app.models.<chat model module>` — reuse the same import source in admin_live_chat.py).
- TESTS: extend `tests/test_session_claim.py` (the DB-backed live-chat REST suite CI runs with PostgreSQL): delete a conversation whose user is in HUMAN mode → `user.chat_mode == ChatMode.BOT` afterwards. Skip if the DB is unreachable (suite already requires services).
- VALIDATE: `pytest tests/test_session_claim.py -q` (DB-gated; CI authoritative).

### Task 7 — M4 + L1 + L2: backend small batch
- ACTION: unbounded exports, a fragile dedup lookup, and a non-constant-time token compare.
- IMPLEMENT: (a) `admin_reports.py` service-requests and followers exports: add `.limit(10000)` to the export selects (matching the messages export) so a wide date range cannot load unbounded rows. (b) `line_service.get_incoming_message_by_line_message_id` (:241): replace `scalar_one_or_none()` with `.limit(1)` + scalars().first() so one duplicate row can't raise MultipleResultsFound. (c) `media.py get_media`: `secrets.compare_digest(str(media.public_token or ""), str(token or ""))` (import `secrets`).
- TESTS: (a) add one assertion to the closest existing reports test if one exists (grep `tests/` for `admin_reports`); if none exists, record as accepted-risk in the findings file — the change is a single `.limit(10000)` clause on two selects. (b) extend `tests/test_line_service_circuit_breaker.py` (the existing line_service test file): two matching rows → returns the first instead of raising. (c) covered by Task 10's media test (wrong token still 403, correct token passes).
- VALIDATE: `pytest tests/test_line_service_circuit_breaker.py tests/test_media_upload_allowlist.py -q`.
- MIRROR: behavior parity with the messages export cap (limit(10000), same 413/200 semantics unchanged).

### Task 8 — M1: rate-limit POST /auth/login (+ test)
- ACTION: `/login` performs password verification with no limiter; the repo already has `_auth_rate_limit_exceeded(key)` (Redis fixed-window with in-process fallback, auth.py:69-81) wired only into migrate-session and ws-ticket.
- IMPLEMENT: add `request: Request` parameter to the `login` endpoint; immediately after `username_masked = ...` insert `if await _auth_rate_limit_exceeded(f"login:{request.client.host if request.client else 'unknown'}:{payload.username}"): raise HTTPException(429, "Too many login attempts, try again later")` — BEFORE any DB/password work.
- TESTS (new `tests/test_auth_login_ratelimit.py`): patch `app.api.v1.endpoints.auth.redis_client.fixed_window_allow` — returning `False` (exhausted) → POST /auth/login with any creds → 429 without touching the DB (patch `auth_service`/`db` not required since the 429 precedes the query); returning `True` → proceeds to the normal invalid-credentials 401 path (proves the limiter is on the login route and does not block clean traffic). Use the conftest `app` fixture + dependency override for `get_db` only where needed.
- VALIDATE: `pytest tests/test_auth_login_ratelimit.py -q`.

### Task 9 — M9 (minimal): SSRF guard on integration test endpoints
- ACTION: `admin_integrations.py` `test_n8n` (:358) and `test_integration` (:588) fetch admin-supplied URLs with no scheme/host validation and echo `resp.text[:200]` / raw exception text.
- IMPLEMENT: add module-level `def _assert_safe_url(url: str) -> None:` — parse with `urllib.parse.urlsplit`; require scheme `http`/`https`; reject hostname `localhost`/ending `.localhost`/`*.local`; if the hostname is an IP literal (`ipaddress.ip_address`), reject when `is_private or is_loopback or is_link_local` (covers 169.254.169.254, 127.0.0.1, 10/8, 172.16/12, 192.168/16). Call it in both endpoints before any fetch; on fetch, replace the `resp.text[:200]` echo with a generic success/failure message carrying only the status code, and sanitize exception text (`str(exc)[:120]`). DNS-level protections are explicitly out of scope (DEFER-L1).
- TESTS (new `tests/test_admin_integrations_ssrf.py`): direct unit tests of `_assert_safe_url` — `https://example.com` passes; `http://127.0.0.1/`, `http://169.254.169.254/`, `http://10.0.0.5/`, `ftp://x`, `http://localhost/` all raise; plus one endpoint-level test that configuring `url=http://127.0.0.1:5678` and calling the test endpoint returns 400 without any outbound call (patch httpx to explode if called).
- VALIDATE: `pytest tests/test_admin_integrations_ssrf.py -q`.

### Task 10 — M10: admin media uploads get the LIFF MIME allowlist + safe serving headers
- ACTION: `media.py` admin uploads store client-declared mime with no allowlist; `get_public_file`/`get_media` serve bytes inline without `nosniff`.
- IMPLEMENT: (a) reuse the LIFF allowlist constants — import `_LIFF_MEDIA_ALLOWED_MIMES` semantics: at `media.py` top define `ALLOWED_MIMES = {"image/jpeg", "image/png", "application/pdf"}` and a `_sniff_mime(data)` identical to `rich_menus._sniff_image_mime` extended with the PDF magic `%PDF`; in both admin upload routes, after reading content: `mime = _sniff_mime(content)`; `if mime is None: raise HTTPException(422, "Only JPEG, PNG, or PDF files are supported")` (replaces trusting `file.content_type`; keep `detect_category(mime, filename)`). (b) `get_public_file` and `get_media` responses: add `"X-Content-Type-Options": "nosniff"`; in `get_public_file` use `inline` disposition only for `image/jpeg|image/png` (PDF and everything else → `attachment`), and add the same header to `get_media`.
- TESTS (new `tests/test_media_upload_allowlist.py`): admin upload of `text/html` bytes → 422; PNG-magic bytes → 200 and stored `mime_type == "image/png"`; `file.size` oversize pre-check case (Task 5); GET public file of a stored PNG → 200 + `nosniff` header; GET media with wrong token → 403 (covers L2 compare path).
- VALIDATE: `pytest tests/test_media_upload_allowlist.py tests/test_rich_menu_image_media.py -q`.

### Task 11 — S5: mask plaintext LINE ids in push-failure logs
- ACTION: two log lines write the raw (pseudonym-protected) LINE user id.
- IMPLEMENT: `messaging.py:54` and `:152` → `logger.error(f"LINE push failed after persist for {mask_line_id(line_user_id)}: {e}")` (import `mask_line_id` from `app.core.logging_utils` — the same helper the rest of the codebase is contract-bound to use).
- VALIDATE: `pytest tests/ -k "messaging or live_chat_service" -q`; grep `line_user_id}: ` returns no unmasked f-strings in this file.

### Task 12 — M13: dependency pins
- ACTION: vulnerable jose floor; bcrypt arrives only transitively.
- IMPLEMENT: `requirements.txt` — `python-jose[cryptography]>=3.4.0` (CVE-2024-33663/33664 floor) and replace `passlib[bcrypt]>=1.7.4` with `bcrypt>=4.0.0` (code imports bcrypt directly; passlib is imported nowhere).
- MIRROR: `app/core/security.py` imports stay untouched (`from jose import jwt`, `import bcrypt`) — pins only.
- VALIDATE: `pip install -r requirements.txt` resolves in CI; `pytest tests/ -k "auth"` green locally.

## Risks / GOTCHAs (register)

- **R1 (biggest): existing tests pin the old contracts.** `tests/test_webhook_deduplication.py::test_set_with_no_connection:275-278` asserts `set()` returns False when disconnected (Task 1 changes it to None → update that assertion); `tests/test_media_endpoints.py:21-42` uploads `b'hello world'` declared as application/pdf expecting success (Task 10's magic-byte sniff returns None for it → the test must upload real `%PDF`-magic bytes instead). Both files are in Files to Change. Mitigation: both updates are part of their tasks and Task 19's full gate would catch any other pinned contract.
- **R2: `upload_media_alt` (media.py:240-247) delegates to `upload_media`** — a single edit site suffices; do not double-edit.
- **R3: Task 9's scheme/IP-literal guard does not catch decimal/octal IP encodings** (`http://2130706433/`) — `ip_address()` raises on those hostnames; accepted under DEFER-L1 (add an inline comment).
- **R4: local pytest without Docker shows the documented 62 environmental errors** — the gate compares against that constant baseline; CI (with PostgreSQL/Redis) is authoritative.
- **R5: ChatMode is a str-enum** (`ChatMode.BOT`, value "BOT") — assign the member, not a raw string (pattern: sessions.py:118).
- **R6: PDF public links become attachment downloads** (Task 10b) — shared PDF links change behavior; release-note line included in the PR body.

### Task 13 — H3: LIFF cascading-select race guards (3 pages)
- ACTION: district/sub-district fetches resolve after the user changed the parent selection.
- IMPLEMENT (identical pattern per page, in `service-request/page.tsx`, `request-v2/page.tsx`, `service-request-single/page.tsx`): add `const latestProvinceReq = useRef<string | null>(null)` (and `latestDistrictReq`); in `handleProvinceChange` set `latestProvinceReq.current = String(provinceId)` synchronously before the await; after `const data = await fetchDistricts(provinceId)` add `if (latestProvinceReq.current !== String(provinceId)) return` before `setDistricts(data)` (same for the sub-district fetch with its own ref). Keep the loading-flag clears inside the guarded path so a stale response can never clear a newer request's spinner — move `finally` setLoading(false) to run only when the response was accepted, or track "is this still the newest request" the same way.
- VALIDATE: `npx tsc --noEmit` + `npm run lint` (these three LIFF pages have no test dirs — verified; frontend full vitest run must stay green regardless).

### Task 14 — H4: booking availability race guard
- IMPLEMENT: in `app/liff/booking/page.tsx` `loadSlots`: add `const latestSlotKey = useRef<string>("")`; set `latestSlotKey.current = key` synchronously before the await; after `const loaded = await fetchAvailability(...)` add `if (latestSlotKey.current !== key) return;` before caching + `setAvailability` (cache set may stay unguarded — it is keyed); in `finally`, only `setLoadingSlots(false)` when `latestSlotKey.current === key` so an older request can't clear a newer one's spinner. `setError(null)`/`setAvailability(null)` in catch follow the same guard.
- VALIDATE: `npx tsc --noEmit` + `npm run lint` (booking page has a `__tests__/page.test.tsx` — run `npx vitest run app/liff/booking`).

### Task 15 — M6: blob-URL lifecycle in rich-menu image pickers
- ACTION: object URLs are minted per render / never revoked (2 sites).
- IMPLEMENT: (a) `new/page.tsx`: replace the inline `URL.createObjectURL(file)` in JSX with `const previewUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file])` plus `useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl])`; use `previewUrl` in the `<img src>`. (b) `edit/page.tsx`: keep `imagePreview` state but track the object URL separately (`objectUrlRef`); in `handleImageChange` revoke the previous ref value before minting the new one; add an unmount cleanup that revokes the current one (the server-served `image_url` preview path must NOT be revoked — only URLs this page created).
- VALIDATE: `npx tsc --noEmit` + `npx vitest run app/admin/rich-menus` (the overlay tests assert `getByAltText('Preview')` — must keep rendering).

### Task 16 — M7: media 4xx must not flip live-chat offline
- ACTION: `useMessageFlow.ts:240` catch treats every failure (including 413/422) as backend-offline.
- IMPLEMENT: restructure the media send to capture the response: on `res.ok === false` with `res.status < 500` → surface a toast/error message (reuse the hook's existing toast/error affordance) and DO NOT call `setBackendOnline(false)`; only fetch rejections and `res.status >= 500` flip offline (keep the current offline path otherwise).
- VALIDATE: `npx tsc --noEmit` + `npx vitest run app/admin/live-chat/_hooks` (useMessageFlow.test.tsx exists).

### Task 17 — M8: chat-detail response ordering guard
- ACTION: overlapping detail fetches can resolve out of order.
- IMPLEMENT: `useConversationSync.ts` `fetchChatDetail`: module/hook-level `const detailSeqRef = useRef(0)`; at call start `const seq = ++detailSeqRef.current`; after the existing `selectedIdRef.current !== id` check add `if (seq !== detailSeqRef.current) return;` before any `set` of conversation state.
- VALIDATE: `npx tsc --noEmit` + `npx vitest run app/admin/live-chat/_hooks` (useConversationSync.test.tsx exists).

### Task 18 — H6: real-Postgres scheduler integration test (new `tests/test_rich_menu_display_scheduler_db.py`)
- ACTION: the `_SeqDB`-based scheduler tests cannot see the SQL WHERE clauses.
- IMPLEMENT: module-level async probe (asyncpg/SQLAlchemy connect with a 3-second timeout against `settings.DATABASE_URL`); `pytestmark = pytest.mark.skipif(...)` when the DB is unreachable (CI runs with PostgreSQL; locally this skips cleanly instead of erroring). Test body: create/clear rows in `rich_menus` via `AsyncSessionLocal` (ids are auto-PK; delete created rows in a finally), insert: SCHEDULED+DRAFT+start in the past+line id → expect activated; SCHEDULED+DRAFT+start in the future → untouched; SCHEDULED+PUBLISHED+end in the past + patched `get_default_on_line` returning its own id → INACTIVE + cancel awaited; SCHEDULED+PUBLISHED+end in the past + patched default belonging to another id → INACTIVE, cancel NOT awaited (asserts both the WHERE semantics and the AC4 guard against real SQL).
- VALIDATE: `pytest tests/test_rich_menu_display_scheduler_db.py -q` (locally: skipped; CI: runs).

### Task 19 — Full gates
- VALIDATE: backend `pytest tests/ -q` (expect the documented environmental set locally: 62 PG/Redis-dependent errors stay identical; CI runs everything green); frontend `npx tsc --noEmit && npm run lint && npm run test:unit && npm run build`; then commit → push → PR → CI + Playwright green → merge.

## Testing Strategy

New tests: Tasks 2, 3, 8, 9, 10 (new files), 4 (extension), 18 (new DB-gated file). Updated: 6. Pattern sources: `test_rich_menu_image_media.py` (TestClient + dependency overrides + monkeypatched caps), `test_rich_menu_alias_service.py` (httpx fakes). No test is weakened; the pre-existing flaky-mock lesson applies — new fetch-mocking tests route by URL+method, never by call order.

## Acceptance Criteria

1. AC-1 (H1): a Redis outage cannot drop LINE messages — covered by the Redis-down webhook test.
2. AC-2 (H2): ADMIN cannot manage DIRECTOR/HEAD users — covered by role-check unit tests.
3. AC-3 (H3/H4): stale async responses cannot overwrite newer selections (province/district/sub-district/booking slots) — guard present in all 3 pages + booking.
4. AC-4 (H5): webhook 400/400/200 matrix + Redis-down processing all covered.
5. AC-5 (H6): scheduler due/expiry selection verified against real PostgreSQL in CI (skips locally without DB).
6. AC-6 (M-batch): login 429s under the shared limiter; live-chat + admin media + LIFF uploads enforce size caps and the JPEG/PNG/PDF allowlist; exports capped at 10 000 rows; integration URLs blocked for private/loopback/link-local/localhost and stop echoing response bodies; push-failure logs mask line ids; recreate hard-fails on dangling image FK; jose ≥3.4.0 + explicit bcrypt.
7. AC-7 (frontend M-batch): 4xx no longer flips the console offline; detail responses ordered; blob URLs revoked.
8. AC-8: all gates green (local + CI + E2E); deferred findings unchanged (documented in the findings file).
