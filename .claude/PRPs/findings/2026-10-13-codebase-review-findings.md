# Findings — whole-codebase review 2026-10-13

**Base**: `feat/liff-booking-unity-debt-service` @ `c1237e3` (includes unmerged PR #254)
**Method**: 5 parallel read-only reviewers (frontend, backend, security, tests, architecture),
structured JSON contract (area/severity/location/evidence/category/suggestion), ≤15 each.
**Raw**: 75 findings → **74 unique after 1 merge** (5 Critical, 21 High, 34 Medium, 14 Low).
**Validity**: every finding carries file:line + quoted evidence; all 5 Criticals re-verified
against source this session. Disposition: Critical + High default-ACCEPTED into PRD/PRP;
Medium/Low triaged (fix vs defer-with-reason) at plan stage per workflow.
**Dedup**: backend-M + security-H on `auth.py:150` (login throttle key) share one root cause
→ merged into H-SEC-AUTH-01 with both reporters.

---

## Critical (5) — must fix, G3

### C-BE-01 — LINE push before session/message commit (backend)
- **Location**: `backend/app/api/v1/endpoints/admin_live_chat.py:506`
- **Evidence**: `await line_service.push_messages(`
- **Detail**: initial_message is pushed to LINE before `save_message`/commit; a later DB
  failure leaves a citizen with a message the system never recorded.
- **Fix**: defer the push until after commit (outbox mutate-commit-announce).

### C-BE-02 — webhook dedup marker vs outbox failures (backend)
- **Location**: `backend/app/api/v1/endpoints/webhook.py:107`
- **Evidence**: `await drain_outbox(box)`
- **Detail**: `db.commit()` (:105) then drain (:107) then `setex` marker; partial outbox
  failure semantics need explicit retry/failure accounting instead of a blanket marker.
- **Fix**: only mark processed when every send succeeds, or record failures for retry.

### C-ARCH-01 — DDL in lifespan startup (architecture)
- **Location**: `backend/app/main.py:59`
- **Evidence**: `CREATE TABLE IF NOT EXISTS system_settings (`
- **Detail**: schema management bypasses Alembic (`_initialize_database` runs raw DDL).
- **Fix**: remove DDL from startup; manage `system_settings` via migrations only.

### C-ARCH-02 — unpinned dependencies (architecture)
- **Location**: `backend/requirements.txt:1`
- **Evidence**: `fastapi>=0.109.0`
- **Detail**: floating ranges make production rebuilds unreproducible.
- **Fix**: pin exact versions with a lockfile.

### C-TEST-01 — supervisor e2e silently skips (tests)
- **Location**: `frontend/e2e/admin-requests-supervisor.spec.ts:94`
- **Evidence**: `test.skip(!detailUrl, 'no requests in test DB; supervisor view nothing to render')`
- **Detail**: the force-complete escape-hatch journey never executes without seed data.
- **Fix**: seed a deterministic supervisor-view fixture.

---

## High (21)

### H-BE-01 — broadcast-all path leaves counts empty (backend)
- `backend/app/services/broadcast_service.py:220` — `await self.api.broadcast(` —
  populate total/success/failure counts as the multicast path does.

### H-BE-02 — LINE token frozen at import (backend)
- `backend/app/core/line_client.py:9` — `configuration = Configuration(access_token=settings.LINE_CHANNEL_ACCESS_TOKEN)` —
  resolve per-request from the credential store instead.

### H-BE-03 — corrupt role strings raise 500 (backend)
- `backend/app/core/permissions.py:324` — `role_enum = role if isinstance(role, UserRole) else UserRole(role)` —
  catch invalid roles and fail closed to 403.

### H-BE-04 — assigned_agent_id not validated on create (backend)
- `backend/app/api/v1/endpoints/admin_requests.py:140` — `assigned_agent_id=body.assigned_agent_id,` —
  validate agent exists/is-staff, 404 otherwise (PATCH path already does).

### H-BE-05 — setting commit split from audit row (backend)
- `backend/app/services/settings_service.py:45` — `await db.commit()` —
  flush-only in service; endpoint commits setting + audit atomically.

### H-BE-06 — media binary fetched before authz (backend)
- `backend/app/api/v1/endpoints/media.py:151` — `result = await db.execute(select(MediaFile).filter(MediaFile.id == media_id))` —
  defer the binary column until after the authz check.

### H-SEC-AUTH-01 — login throttle key weak both ways (backend + security, MERGED)
- `backend/app/api/v1/endpoints/auth.py:150` — `f"login:{request.client.host if request.client else 'unknown'}:{payload.username}"` —
  rotating usernames bypass per-user buckets AND all proxied clients share one 5/min bucket.
  Reporters: backend (Medium, rotation bypass), security (High, proxy sharing).
- **Fix**: proxy-aware client key + normalized-username bucket (both dimensions).

### H-FE-01 — unvalidated payload URLs into href/src (frontend)
- `frontend/app/admin/live-chat/_components/MessageBubble.tsx:42` — `<a href={imageUrl} target="_blank" rel="noreferrer" className="block">` —
  gate through the existing `isSafeImageUrl` guard.

### H-FE-02 — useSearchParams without Suspense (frontend)
- `frontend/app/admin/auto-replies/[id]/page.tsx:46` — `const searchParams = useSearchParams();` —
  wrap in Suspense per App Router prerender rules.

### H-FE-03 — LIFF page bypasses rewrite proxy (frontend)
- `frontend/app/liff/service-request-single/page.tsx:99` — `const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api/v1'` —
  use the relative `/api/v1` proxy like other LIFF pages.

### H-ARCH-01 — pydantic extra=ignore hides typos (architecture)
- `backend/app/core/config.py:135` — `extra="ignore"` —
  forbid or startup-check unknown keys.

### H-ARCH-02 — Telegram creds via getattr (architecture)
- `backend/app/services/telegram_service.py:36` — `self.bot_token = getattr(settings, "TELEGRAM_BOT_TOKEN", None)` —
  declare on Settings or route through credential_service.

### H-ARCH-03 — two Redis client constructions (architecture)
- `backend/app/core/pubsub_manager.py:44` — `self._redis = await redis.from_url(` —
  unify into one shared factory.

### H-ARCH-04 — two routers share /admin/settings (architecture)
- `backend/app/api/v1/api.py:61` — `api_router.include_router(admin_integrations.router, prefix="/admin/settings", tags=["admin-settings"])` —
  consolidate into one module with distinct sub-paths.

### H-ARCH-05 — endpoint imports ORM directly (architecture)
- `backend/app/api/v1/endpoints/admin_audit.py:10` — `from app.models.audit_log import AuditLog` —
  move queries behind service functions.

### H-ARCH-06 — compose is infra-only, undocumented (architecture)
- `docker-compose.yml:5` — `image: postgres:16-alpine` —
  add app services/Dockerfiles or document infra-only + prod parity.

### H-TEST-01 — no e2e for booking cancel journey (tests)
- `backend/app/api/v1/endpoints/liff_bookings.py:255` — `"/{booking_id}/cancel",` —
  add LIFF create-then-cancel e2e (critical state transition uncovered).

### H-TEST-02 — broadcast real-send path untested (tests)
- `frontend/app/admin/chatbot/broadcast/__tests__/dryrun-button.test.tsx:87` — `expect(routerMock.push).not.toHaveBeenCalled();` —
  add non-dry-run companion asserting navigation + payload.

### H-TEST-03 — resize-ticket security test skipped (tests)
- `backend/tests/test_image_resize_security.py:92` — `pytest.skip("RED: resize ticket route + redis_client not implemented yet")` —
  implement so the upload-abuse gate is exercised.

### H-TEST-04 — stubGlobal leak across tests (tests)
- `frontend/app/admin/chatbot/broadcast/__tests__/dryrun-button.test.tsx:51` — `vi.restoreAllMocks();` —
  `vi.unstubAllGlobals` in teardown (restoreAllMocks skips global stubs).

### H-TEST-05 — concurrency suite skips without Postgres (tests)
- `backend/tests/test_booking_create_concurrency.py:47` — `pytestmark = pytest.mark.skipif(` —
  guarantee Postgres in CI so the double-booking race test runs.

---

## Medium (34) — triage at plan stage

**Backend (5 after merge):** liff.py:182 per-attachment selects → bulk IN query;
broadcast_service.py:112 `setattr(broadcast, key, value)` → explicit allowlist;
permissions.py:305 `_policy_cache = None` → cross-worker invalidation;
db/session.py:24 `yield session` → explicit rollback-on-error;
admin_requests.py:272 `limit: int = Query(100, ge=1, le=200),` → total count + smaller max.
**Frontend (10):** ErrorBoundary.tsx:28 retryCount reset; useConversationSync.ts:109
unencoded conversation id; service-request/page.tsx:4 `next/head` in App Router;
CustomerPanel.tsx:99 unallowlisted next/Image host; useSessionTimeout.ts:75 warning
never reset on activity; MessageInput.tsx:105 render-phase setState;
MessageBubble.tsx:26 object-as-child risk; ConversationItem.tsx:99 per-row intervals;
useWebSocket.ts:57 dropped caller token; useLiveChatSocket.ts:204 untested retry paths.
**Security (6):** security.py:105 reserved-claims merge; ws_live_chat.py:51 open
allowlist fail-open; ws_live_chat.py:32 ticket in URL query; auth.py:203 refresh
unthrottled; config.py:77 ALGORITHM not allowlisted; requirements.txt:9 python-jose
unmaintained.
**Architecture (6):** merge-migration downgrades; cd.yml remote-env validation;
postcss duplicate config; package.json dev webpack-vs-turbopack flags; api.ts
REST/WS origin split; useLiveChatSocket vs useWebSocket duplication.
**Tests (7):** local schema redefinition; triplicated e2e helper; 3× fixed-sleep
waits; toBeDefined on preview text; time.sleep in ws-security test.

## Low (14) — triage at plan stage

Backend: admin_export.py:149 export pins pooled connection. Frontend: Toast.tsx:35
timer handles; useConversationSync.ts:219 raw history.replaceState. Security (8):
liff.py:60 raw upstream body in logs; auth.py:471 CSRF echo; main.py:201 CORS
authorization header; security.py:21 BCRYPT_ROUNDS=10; liff.py:72 STIRCT-mode flag
dead branch; security.py:178 token-type confusion; auth.py:314 logout CSRF;
line_client.py:12 parser built at import. Architecture: main.py:8 unused
StaticFiles import. Tests: MessageBubble.render toBeTruthy; polish.spec
screenshot baseline gate.

---

## Rejected

None at collection time. Rejections (with reasons) will be recorded here if the
PRP stage drops or defers any finding above.
