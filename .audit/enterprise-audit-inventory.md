# Audit Inventory — Enterprise Sweep (Phase 1, read-only)

Branch: `feat/enterprise-audit-sweep`. Base: main @ PR #256 merge (`80dc9b9` per 2026-10-15 checkpoint).

## Lane A — backend (FastAPI, async)
- Endpoints (`backend/app/api/v1/endpoints/`, 27 modules): `auth`, `health`, `webhook` (`process_webhook_events`, Redis dedup + per-invocation lock token), `ws_live_chat`, `liff`, `liff_bookings`, `media` (413 upload-too-large precedent), `rich_menus`, `admin_live_chat`, `admin_broadcast`, `admin_requests`, `admin_bookings`, `admin_business_hours`, `admin_friends`, `admin_users`, `admin_tags`, `admin_intents`, `admin_auto_replies`, `admin_canned_responses`, `admin_reply_objects`, `admin_reports`, `admin_analytics`, `admin_audit`, `admin_export`, `admin_credentials`, `admin_integrations`, `settings`, `locations`.
- Services (`backend/app/services/`, ~26): `live_chat_service/` (facade: UnreadCounts/Handoff/SessionLifecycle/Conversations/Messaging/Analytics/Preferences mixins), `user_identity_service` (`resolve_by_line_id`, 44 callers), `booking_service`, `broadcast_service`, `report_service`, `sla_service`, `telegram_service`, `outbox`, `response_parser` (`build_message_from_object`), `ws_session/`, `message_intake/`, `line_service`, `flex_messages`.
- Core (`backend/app/core/`): `permissions.py` (`require_permission` 80 callers, `invalidate_cache`, keys `access_admin_endpoints/access_manager_endpoints/access_staff_endpoints/access_live_chat`), `audit.py` (`create_audit_log` 46 callers), `cookie_auth.py`, `security.py` (JWT), `redis_client.py`, `websocket_manager.py` (`ws_manager`), `rate_limiter.py` + `http_rate_limit.py` (429 precedent), `pii_masking.py`, `pseudonym_gate.py`, `line_client.py` (`_call_with_circuit` breaker), `request_workflow.py`, `query_utils.py`.
- Deps: `backend/app/api/deps.py` (`get_db`, `get_current_admin/manager/staff`, `get_current_staff`, `require_permission` L236-260).
- Migrations: latest heads end at `z1a2b3c4d5e6_add_geography_tables`; earlier `q8r9s0t1u2v3` (pseudonym destructive), `w3x4y5z6a7b8` (auth sessions + ws tickets). PROD-vs-local head diff is a Phase 2 check (`alembic check --target remote` is read-only; needs secret => do only with user-provided session, else record skipped).
- Tests: 159 files under `backend/tests/` (incl. `test_websocket.py`, `test_admin_requests_endpoints.py` with `_FakeDB`).

## Lane B — frontend (Next.js 16, React 19, TS)
- Admin pages (`frontend/app/admin/`): `live-chat` (LiveChatContext 13 consumers, liveChatStore, ChatArea, liveChatApi, useLiveChatActions), `requests` (+kanban+[id]), `bookings`, `rich-menus` (+aliases), `friends`, `users`, `chat-histories`, `reply-objects`, `broadcast`, `reports`, `analytics`, `audit`, `logs`, `settings` (business-hours, booking, permissions), `bookings`, `canned-responses`, `auto-replies`, `chatbot`, `files`, `image-resize`, `health`, `design-system`.
- LIFF (`frontend/app/liff/`): `booking`, `service-request`, `service-request-single`, `request-v2`, `debt-mediation`, `close-test`, `test`.
- Shared: `frontend/lib/` (`api-error.ts:readErrorMessage` 31 callers, `mask.ts:maskLineUserId` 13 callers, `utils.ts:isoToYMD`), `frontend/hooks/` (`useLiffInit`, `useLiveChatSocket`, `useWebSocket`, `useApiFetch`, `useSessionTimeout`, `useUndoableState`), `frontend/contexts/AuthContext.tsx` (`useAuth` 20 consumers, cookie-only session), `frontend/components/` (`CalendarPickerTH`, ui Button/Card/Badge/Modal).
- Tests: vitest suites next to source (`__tests__/*.test.tsx`), Playwright `e2e/*.spec.ts` (chromium, `loginAsAdmin` helper in `e2e/auth.ts`).

## Lane C — realtime
- WS gate: `_load_and_authorize_ws_user` + `transfer_session` gated by `access_live_chat` (SUPER_ADMIN+ADMIN+AGENT default); HTTP page gate `get_current_staff` permissive (two-gate design).
- Webhook: `process_webhook_events` (webhook.py L53-141) — Redis `exists` dedup + NX lock with uuid token + Lua compare-and-delete release (PR #225 loser-no-delete fix).

## Lane D — cross-cutting contracts
- Auth: cookie-only (PR #200), `DEV_AUTH_BYPASS=true` local only, CSRF, migrate-session/ws-ticket preserved.
- Errors: HTTPException precedent 400/401/403/404/409/413/422/429/500/502/503 (402 unused).
- Masks/caps: `maskLineUserId` (U****...last4), export filename sanitize, `liff-submit` bucket 5/300s, attachment cap 3 (in-flight counted), rich-menu image 1 MB vs media 10 MB.

## Known-open (referenced, not re-planned)
- Round-3b 22 items; `upload-security.test.ts` breakage; Phase A relaunch (3 owners stopped, zero commits); 74 findings (2026-10-14); login cold-start single-attempt smoke.

All paths above `ls`-confirmed this session. Deep reads + gate runs are Phases 2-5 (background agents dispatched).
