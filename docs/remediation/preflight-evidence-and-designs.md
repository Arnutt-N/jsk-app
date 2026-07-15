# Phase 0 Pre-Flight — Evidence & Designs

**Status:** Recreation of PR 0B (originally implemented by Codex on 2026-07-12,
never committed — see `.claude/PRPs/prds/phase0-pr0b-preflight-evidence.prd.md`).
**Source plan:** `PRPs/claude_code/2026-07-11-2329-gpt-5.6-sol-p0-p3-remediation.plan.md`
**Consolidated review:** `PRPs/claude_code/2026-07-12-consolidated-remediation-review.md`

Every code claim below was re-verified against the current source tree on
2026-07-15 (not copied from memory or from the lost 2026-07-12 session). File
paths and line numbers are cited so claims can be re-checked as the code
changes.

---

## 1. LIFF Client Inventory

All entry points under `frontend/app/liff/`:

| Page | Loads LIFF SDK | Submits a service request | Sends `x-liff-id-token` |
| --- | --- | --- | --- |
| `frontend/app/liff/service-request/page.tsx` | yes (`liff.init`, line 134) | yes (`POST /api/v1/liff/service-requests`, line 378) | **no** |
| `frontend/app/liff/request-v2/page.tsx` | yes (`window.liff.init`, line 72) | yes (`POST /api/v1/liff/service-requests`, line 229) | **no** |
| `frontend/app/liff/service-request-single/page.tsx` | yes (`window.liff.init`, line 107) | yes (`POST /api/v1/liff/service-requests`, line 282) | **no** |
| `frontend/app/liff/close-test/page.tsx` | yes (`window.liff.init`, line 26) | no (debug page, only calls `liff.closeWindow()`) | n/a |
| `frontend/app/liff/test/page.tsx` | no (static debug page, no LIFF SDK import) | no | n/a |

**Finding:** all three form-submitting pages call `liff.getProfile()`
client-side and send the resulting `userId` directly as `line_user_id` in the
JSON body (e.g. `service-request/page.tsx:374`, `request-v2/page.tsx:225`,
`service-request-single/page.tsx:279`). None of them send the
`x-liff-id-token` header. A repo-wide grep for
`getIDToken|id_token|idToken|x-liff-id-token` under `frontend/` returns no
matches anywhere in the frontend — ID token retrieval/transmission is not
implemented on the client at all today.

Backend counterpart (`backend/app/api/v1/endpoints/liff.py:49-61`):

```python
x_liff_id_token: Optional[str] = Header(None),
...
if x_liff_id_token:
    verified_line_user_id = await verify_liff_token(x_liff_id_token)
    line_user_id = verified_line_user_id
    source_details = {"source": "LIFF v2"}
else:
    line_user_id = request.line_user_id
    source_details = {"source": "LIFF-unverified"}
```

Since no client sends the header, **every current LIFF submission takes the
`else` branch** and trusts the client-supplied `line_user_id` unverified
(tagged `LIFF-unverified` in `details`). This is the exact gap
`LIFF_STRICT_MODE` (see §2/§9) is meant to close once clients are updated —
today the flag exists in config but is not wired to any behavior (it is not
read anywhere outside its declaration, see §2), so flipping it now is a
no-op. Once it is wired per the P0.2 design, enabling it before the clients
send ID tokens would 401 every submission — hence the rollout order in
`docs/remediation/migration-controls.md` (clients first, then the flag).

## 2. Administrator Authentication

Current flow, verified in `frontend/contexts/AuthContext.tsx`:

- Login (`AuthContext.tsx:185-224`) posts to `/api/v1/auth/login`, then stores
  `access_token`/`refresh_token`/`user` in `localStorage` (`auth_token`,
  `auth_refresh_token`, `auth_user`). A comment at line 219 acknowledges this
  directly: "Current auth flow stores tokens in localStorage; moving to
  httpOnly cookies requires coordinated backend changes."
- Refresh (`AuthContext.tsx:290-295`) sends the refresh token as a
  `Bearer` header, not a cookie.
- No CSRF token, no `Set-Cookie`/`response.cookies` handling exists anywhere
  in the backend: `grep -rln "csrf\|CSRF\|set_cookie" backend/app --include="*.py"`
  returns zero files.
- `backend/app/api/v1/endpoints/auth.py` exposes only
  `POST /login`, `POST /refresh`, `GET /me` — all Bearer/JSON, no cookies.

Same-origin HTTP path (Vercel rewrite) — confirmed in `frontend/next.config.js:17-30`:

```js
async rewrites() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000/api/v1';
  const backendBase = apiUrl.replace(/\/api\/v1\/?$/, '');
  return [
    { source: '/api/v1/:path*', destination: `${backendBase}/api/v1/:path*` },
    ...
  ]
}
```

All `fetch()` calls in `AuthContext.tsx` and `frontend/lib/authFetch.ts` use
relative paths (`/api/v1/...`), so in production the browser talks to the
Vercel origin, and Vercel transparently proxies to the Koyeb backend
(`backendBase`). This matches the claim: **HTTP goes through the same-origin
rewrite.**

`COOKIE_AUTH_MODE` (`backend/app/core/config.py:15`) is declared
(`bearer|dual|cookie`, default `bearer`) but, like `LIFF_STRICT_MODE`, is not
read anywhere outside its own declaration and
`backend/tests/test_config_migration_controls.py` — no dual-mode cookie
issuance code exists yet. It is a Phase 0 landed *control point*, not yet
wired to behavior.

## 3. WebSocket Authentication

Verified in `frontend/lib/websocket/wsUrl.ts:1-32`:

```ts
// Vercel's rewrite proxy strips the WebSocket upgrade headers, so in
// production the socket must connect directly to the backend host taken
// from NEXT_PUBLIC_API_URL. Same-host proxying stays as the fallback for
// setups where the API URL is unset or relative (Next dev rewrites).
```

`buildLiveChatWsUrl()` connects directly to `NEXT_PUBLIC_API_URL` (the Koyeb
host) when it is an absolute `http(s)` URL, converting the scheme to
`ws`/`wss`; it only falls back to same-host (`window.location.host`) when the
API URL is relative/unset (local dev). This confirms: **WebSockets bypass the
Vercel rewrite and connect directly to Koyeb**, unlike the HTTP path in §2.

Current backend WS auth (`backend/app/api/v1/endpoints/ws_live_chat.py`):

- The client's first message must be `{"type": "auth", "payload": {"token": "<jwt access token>"}}`
  (docstring at lines 157-158, `AuthPayload` schema, `handle_auth()` at
  lines 102-119).
- `authenticate_ws_user()` (lines 32-90) decodes the JWT with `jose.jwt`,
  requires `token_type == "access"` and a `sub` claim, and looks up the user
  in Postgres.
- The token is explicitly **not** accepted as a URL query parameter (comment,
  lines 109-113) — it must be sent as the first WS message payload.
- There is no cookie read anywhere in this file; the JWT travels inside the
  WS message body, issued the same way as the Bearer HTTP flow in §2.

Note: `CLAUDE.md`'s documented flow (`{"type": "auth", "payload": {"admin_id": "1"}}`)
is a simplified illustration — the live code requires a full JWT `token`
field, not a bare `admin_id`.

**Decided design (2026-07-12, recorded here per the PR 0B PRD — this decision
was made in the lost Codex session and is recreated as authoritative
direction, not re-derived from code that doesn't exist yet):** host-only HTTP
cookies for the admin session, plus a short-lived, single-use WebSocket
*ticket* — the client exchanges its cookie session for a one-time ticket via
an authenticated HTTP call, then presents the ticket as the WS `auth` payload
instead of a long-lived JWT. This avoids ever putting the long-lived session
credential in a WS message body or query string. No implementation exists
yet; this is Phase 1 (P1.1) scope.

## 4. Privileged Mutation Audit Coverage

`@audit_action` decorator is defined once, in `backend/app/core/audit.py:12-30`.
A full grep of the backend for its usage:

```
$ grep -rn "@audit_action" backend/app --include="*.py"
backend/app/services/live_chat_service.py:310  @audit_action("claim_session", "chat_session")
backend/app/services/live_chat_service.py:351  @audit_action("close_session", "chat_session")
backend/app/services/live_chat_service.py:497  @audit_action("transfer_session", "chat_session")
backend/app/services/live_chat_service.py:848  @audit_action("send_message", "message")
backend/app/services/live_chat_service.py:880  @audit_action("send_media", "message")
```

**Finding: exactly 5 uses, all in `live_chat_service.py`, all service-layer
methods for live-chat session/message actions.** Zero endpoint files under
`backend/app/api/v1/endpoints/` reference `@audit_action` directly.

Mutating routes (`@router.post|put|patch|delete`) per endpoint file, counted
with `grep -cE '@router\.(post|put|patch|delete)' <file>`:

| File | Mutating routes | `@audit_action` coverage |
| --- | --- | --- |
| `admin_users.py` | 4 | none |
| `admin_broadcast.py` | 6 | none |
| `admin_credentials.py` | 5 | none |
| `admin_integrations.py` | 8 | none |
| `admin_intents.py` | 9 | none |
| `admin_live_chat.py` | 9 | indirect, via `live_chat_service` calls only |
| `admin_requests.py` | 4 | none |
| `admin_auto_replies.py` | 3 | none |
| `admin_canned_responses.py` | 3 | none |
| `admin_reply_objects.py` | 3 | none |
| `admin_tags.py` | 3 | none |
| `rich_menus.py` | 13 | none |
| `auth.py` | 2 (login, refresh) | none |
| `media.py` | 9 | none |
| `settings.py` | 4 | none |
| `liff.py` | 1 (public LIFF submission, not admin) | none |
| `webhook.py` | 1 (LINE webhook, not admin) | none |
| `admin_analytics.py`, `admin_audit.py`, `admin_export.py`, `admin_friends.py`, `admin_reports.py`, `health.py`, `locations.py`, `ws_live_chat.py` | 0 | n/a |

Total mutating routes across `backend/app/api/v1/endpoints/*.py`: **87**
(`grep -rcE '@router\.(post|put|patch|delete)' backend/app/api/v1/endpoints/*.py`
summed — table above reconciles to the same total). Of those, only the
live-chat claim/close/transfer/send-message/send-media paths get audit
coverage, and only because they call into `live_chat_service` methods that
carry the decorator — not because the endpoint itself is audited. User
creation/role changes, password resets, credential writes, broadcast
create/send, intent/auto-reply/canned-response/reply-object CRUD, rich menu
CRUD, media/settings writes, and request status/assignment changes have
**zero** audit trail today. This is a survey only, per the PRD's non-goals —
no fix is included in this PR.

### 4.1 P0.3 remediation — addendum (2026-07-15)

Implemented per `.claude/PRPs/prds/p0.3-audit-coverage.prd.md`: every route
in that PRD's FR1 coverage matrix now calls `create_audit_log()` directly
(no `@audit_action` — that decorator remains service-layer-only, unchanged).
Updated coverage for the 6 files in scope:

| File | Mutating routes | Audit coverage (after P0.3) |
| --- | --- | --- |
| `admin_users.py` | 4 | **all 4**: `create_user`, `update_user`, `delete_user`, `reset_password` |
| `admin_broadcast.py` | 6 | **4 of 6** (lifecycle only, per PRD scope): `create_broadcast`, `schedule_broadcast`, `cancel_broadcast`, `send_broadcast`. `update_broadcast`/`delete_broadcast` intentionally left unaudited — not named in the PRD's FR1 matrix (draft-only edits/deletes; lower risk than the lifecycle transitions) |
| `admin_credentials.py` | 5 | **all 5**: `create_credential`, `update_credential`, `delete_credential`, `verify_credential`, `set_default_credential` |
| `admin_integrations.py` | 8 | **all 8**: `update_telegram_config`, `update_n8n_config`, `create_integration`, `update_integration`, `delete_integration`, and `test_integration` for all 3 test routes (telegram/n8n/custom) |
| `media.py` | 9 | **2 of 9** (per PRD scope): `delete_media`, `bulk_delete_media`. Upload, public-link create/revoke, bulk-public, and metadata-patch routes stay out of scope — not in the PRD's Work list |
| `settings.py` | 4 | **all 4**: `update_permissions`, `update_system_setting`, `validate_line_token`, plus the pre-existing (unrelated) permission-matrix read paths unaffected |

Design decisions the PRD left to the implementer:

- **`system_setting` value-logging rule** (`settings.py::_is_secret_setting_key`):
  any setting key can theoretically hold a secret — confirmed by
  `rich_menu_service.py` reading `LINE_CHANNEL_ACCESS_TOKEN` back out of
  `system_settings` as a fallback source (the LINE settings page POSTs
  both `LINE_CHANNEL_ACCESS_TOKEN` and `LINE_CHANNEL_SECRET` to this
  endpoint), alongside genuinely non-secret keys like `HANDOFF_KEYWORDS`.
  The rule is **fail-closed** (PR review finding O1 — the original
  substring denylist of TOKEN/SECRET/PASSWORD/KEY/CREDENTIAL failed OPEN
  for keys like `webhook_url`, `authorization`, `bearer`, `dsn`,
  `connection_string`): every value is redacted to
  `{"key": ..., "value_changed": true}` unless the key is on the explicit
  `_NON_SECRET_SETTING_KEYS` allowlist (currently only `HANDOFF_KEYWORDS`,
  surveyed from every `SettingsService`/`SystemSetting` call site). Same
  philosophy as P0.1's environment allowlist. Keys are added to the
  allowlist only when their values are safe to show any audit-log viewer.
- **Transaction-sharing deviation**: `credential_service.py`,
  `broadcast_service.py`, and `SettingsService.set_setting()` commit
  internally (they're shared services, out of this PRD's touch scope). For
  routes that delegate to them (`admin_credentials.py`'s 5 routes,
  `admin_broadcast.py`'s 4 lifecycle routes, `settings.py`'s
  `update_system_setting`), the audit row is written and committed in a
  second, immediately-following transaction rather than one shared
  transaction with the mutation. Not-found/validation failures never reach
  the audit call in these paths, so "zero audit rows on failure" still
  holds. True single-transaction sharing (audit + mutation in one
  `db.commit()`) is used everywhere the endpoint owns its own commit:
  `admin_users.py` (all 4 routes), `media.py` (both routes), and
  `admin_integrations.py`'s custom-integration CRUD + refactored
  `_upsert_credential()` helper (in-file, so it stays in scope).
- Test/verify endpoints with no natural DB mutation (`verify_credential`,
  `validate_line_token`, the 3 `test_integration` routes) write the audit
  row as the mutation itself, for both success and failure outcomes, and
  never log the decrypted secret used to run the test.

**Still deferred** (explicit non-goals, unchanged from the original survey):
`admin_intents.py`, `admin_auto_replies.py`, `admin_canned_responses.py`,
`admin_reply_objects.py`, `admin_tags.py`, `rich_menus.py`, and
`admin_requests.py`'s remaining unaudited routes stay unaudited — outside
P0.3's 6-file scope; follow-up work. `auth.py` login/refresh auditing
remains deferred to the P1.1 cookie-auth rebuild.

**Notable finding — FIXED** (`.claude/PRPs/prds/fix-credential-response.prd.md`):
while writing FR3 tests, `admin_credentials.py`'s
`CredentialResponse.model_validate(...)` was found to fail unconditionally
against a bare `Credential` ORM instance — `credential.metadata` resolves to
SQLAlchemy's `Base.metadata` registry (name collision; the JSONB column is
mapped under the Python attribute `metadata_json`), and `credentials_masked`
has no default so pydantic reports it "required" even though the endpoint
code only assigns it *after* the `model_validate()` call. This reproduced on
unmodified code and affected `create_credential`, `update_credential`,
`set_default_credential`, `get_credential`, and `list_credentials` — every
route returning `CredentialResponse`. No existing test exercised this file
before P0.3, so it went uncaught. Fixed in `backend/app/schemas/credential.py`
(`metadata` now uses `AliasChoices("metadata_json", "metadata")` for
validation with `serialization_alias="metadata"`, and `credentials_masked`
defaults to `""`) plus tests in `backend/tests/test_credential_schema.py`
and updated assertions in the two P0.3 audit tests
(`test_create_credential_writes_one_audit_row`,
`test_update_credential_redacts_secret_value`) that previously tolerated the
`ValidationError`.

## 5. Cookie / CSRF / Refresh Design (P1.1)

No implementation exists yet (confirmed in §2: zero cookie/CSRF code in the
backend). Recording the 3-PR design from the 2026-07-12 consolidated review
(`PRPs/claude_code/2026-07-12-consolidated-remediation-review.md`, "Top 8
Must-Fix" item 2) as the agreed target shape:

**PR #1 — Backend dual-mode foundation**
- `CookieOrBearerAuth` dependency: read `access_token` cookie first, fall
  back to the `Authorization: Bearer` header while `COOKIE_AUTH_MODE=dual`.
- CSRF via double-submit cookie: a `csrf_token` cookie (httponly) plus an
  `x-csrf-token` header the frontend must echo back; validated with
  `secrets.compare_digest`.
- Refresh-token rotation with reuse detection (mark-used + revoke-all-on-reuse).
- A one-time `/auth/migrate-session` endpoint so an already-logged-in Bearer
  client can exchange its token for cookies without forcing re-login.

**PR #2 — Frontend migration**
- `authFetch`/`AuthContext` switch to `credentials: 'include'` and stop
  writing `access_token` to `localStorage`; CSRF token kept in memory only.
- Gated by `COOKIE_AUTH_MODE` so the same frontend build works against a
  backend still in `bearer` mode during rollout.

**PR #3 — Remove Bearer fallback + harden**
- Drop `CookieOrBearerAuth`'s Bearer branch, enforce `SameSite=Strict`,
  security review before flipping `COOKIE_AUTH_MODE=cookie` in production.

`COOKIE_AUTH_MODE` transition thresholds (bearer → dual → cookie) are already
documented in `docs/remediation/migration-controls.md` — this section adds
the *implementation* shape referenced by that gate, it does not change the
gate itself.

### 5.1 P1.1a addendum (2026-07-16)

PR #1 (backend dual-mode foundation, above) implemented — see
`.claude/PRPs/prds/p1.1a-cookie-backend-foundation.prd.md` and
`.claude/PRPs/plans/p1.1a-cookie-backend-foundation.plan.md` for the full
spec, test matrix, and scope decisions. Two new tables
(`auth_sessions`, `ws_tickets`, migration `w3x4y5z6a7b8`), cookie issuance +
mode-aware `get_current_user`, CSRF double-submit, `/auth/logout`,
`/auth/migrate-session`, `/auth/ws-ticket`, WebSocket ticket auth + Origin
validation, and explicit CORS method/header lists all landed behind the
`bearer` default (no behavior change at that default; test 1 of the FR8
matrix in `backend/tests/test_cookie_auth.py` proves byte-compatibility).
PR #2 (frontend migration) and PR #3 (Bearer removal + `SameSite=Strict`)
remain, per the 3-PR design recorded above.

## 6. Durable Webhook Inbox Recovery (P1.5, phase 1 only)

Current state, verified in `backend/app/api/v1/endpoints/webhook.py`:

- Deduplication is Redis-only: each event is checked/marked against a
  `WEBHOOK_EVENT_TTL`-second (`backend/app/core/config.py`) cache key
  (`webhook.py:87`, `:109`). There is no durable inbox table — a grep of
  `backend/app/models/__init__.py` shows no `webhook_inbox`/`webhook_outbox`
  model exists.
- If Redis is unavailable or evicts the dedup key before LINE's retry
  arrives, a webhook could be reprocessed with no durable record of the first
  attempt; there is currently no way to audit this after the fact from the
  DB.

**No evidence yet exists of an actual data-loss incident or of webhook
volume** in this repo — the consolidated review's proposal to build inbox
tooling is evidence-first (only build outbox/queue infra once a real
incident, Redis-unavailability pattern, or a `> 10K/day` volume signal is
observed). Per PRD non-goals, this PR does not implement the inbox; it
records what evidence must exist before Phase 1 outbox work starts:

- At least one documented data-loss or duplicate-processing incident, or
- A measured Redis-unavailability rate over a representative window, or
- Measured webhook volume/latency crossing an agreed threshold (proposed
  starting point from the review: 10K events/day — **not yet ratified**, see §9).

Proposed phase-1-only schema (inbox, no outbox/worker), carried over from the
consolidated review, for reference when this is implemented:

```sql
CREATE TABLE webhook_inbox (
    id BIGSERIAL PRIMARY KEY,
    signature_hash VARCHAR(64) NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL,
    event_type VARCHAR(50) NOT NULL,
    line_user_id VARCHAR(255),
    payload JSONB NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'received',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_webhook_dedup
        UNIQUE (signature_hash, timestamp, event_type, line_user_id)
);
```

Data classification, retention period, and whether `payload` may contain
PII that needs redaction/shorter retention are **pending human decisions**
(§9) — not resolved by this PR.

## 7. Scheduler Advisory Leadership (P1.6)

Current state, verified in `backend/app/tasks/broadcast_scheduler.py`:

- `start_broadcast_scheduler()` (lines 78-82) unconditionally starts an
  `asyncio.create_task(run_scheduled_broadcasts())` in the current process.
- There is no `pg_advisory_lock`/`pg_try_advisory_lock` call anywhere in
  `backend/app` (`grep -rn "advisory_lock\|pg_advisory" backend/app` —
  zero matches). If more than one backend instance runs (horizontal scaling
  on Koyeb), every instance would independently fire the same scheduled
  broadcasts — there is currently no leadership election of any kind.

**Design (not yet implemented):** session-level `pg_try_advisory_lock` at
FastAPI lifespan startup, released in a `finally`/shutdown block, gating
whether a given instance runs `start_broadcast_scheduler()`. Async pattern
proposed in the consolidated review:

```python
async def acquire_scheduler_lock(db: AsyncSession, lock_id: int) -> bool:
    result = await db.execute(text("SELECT pg_try_advisory_lock(:id)"), {"id": lock_id})
    return result.scalar()
```

**Lock ID registration — placeholder, pending human decision (§9):** the
review proposed `999001` for the broadcast scheduler and `999002` for session
cleanup (`backend/app/tasks/session_cleanup.py`, which also has no leadership
guard today). These numbers are **not reserved anywhere in code or docs** yet
— before implementation, an owner must register a real ID scheme (e.g. a
constants module) to prevent collision with any other advisory-lock user
(none currently exist in this codebase, but the registry should exist before
a second lock is added).

## 8. Evidence Record

| Date | Target | Schema | Alembic revision | `pg_stat_statements` | Notable findings |
| --- | --- | --- | --- | --- | --- |
| 2026-07-12 | remote (Supabase) | `public` | `v2w3x4y5z6a7` | 1.11 | `public.broadcasts` table missing on remote (deferred to PR 2F). **Recovered from the PR 0B PRD/session record only — the original table-size/row-count numbers Codex collected are unrecoverable (Windows dev machine, uncommitted). Not fabricated here; re-collection against remote is required and is out of scope for this PR (no `backend/.env` / prod credentials in this sandbox).** |
| 2026-07-15 | local (this sandbox) | `public` | `v2w3x4y5z6a7` | not installed | See full collector output below. `broadcasts`, `districts`, `provinces`, `sub_districts` are declared in ORM metadata but absent from the live local schema (same class of gap as the remote `broadcasts` finding — confirms the presence-check logic works, and surfaces 3 more local-only gaps to track). |

Fresh local run (`backend/scripts/collect_preflight_db_evidence.py --target local`, 2026-07-15):

```
# Pre-Flight DB Evidence

- Target        : local
- Collected (UTC): 2026-07-15T06:30:44Z (re-run for this doc)

## Schema & Server
- Current schema : public
- Server version : PostgreSQL 16.13 (Ubuntu 16.13-0ubuntu0.24.04.1)

## Alembic Revision
- v2w3x4y5z6a7

## pg_stat_statements
- not installed

## Top 20 Tables by Size (public schema)
| Table | Total Size | Estimated Rows |
| --- | --- | --- |
| chat_sessions | 64 kB | unknown |
| service_requests | 64 kB | unknown |
| canned_responses | 64 kB | unknown |
| business_hours | 56 kB | unknown |
| audit_logs | 56 kB | unknown |
| users | 48 kB | unknown |
| messages | 48 kB | unknown |
| user_rich_menu_links | 40 kB | unknown |
| rich_menu_aliases | 40 kB | unknown |
| request_comments | 40 kB | unknown |
| intent_categories | 40 kB | unknown |
| csat_responses | 32 kB | unknown |
| organizations | 32 kB | unknown |
| bookings | 32 kB | unknown |
| auto_replies | 32 kB | unknown |
| reply_objects | 32 kB | unknown |
| rich_menus | 32 kB | unknown |
| system_settings | 32 kB | unknown |
| intent_keywords | 32 kB | unknown |
| tags | 32 kB | unknown |

## Slow Statements (pg_stat_statements)
- skipped: pg_stat_statements not installed

## ORM Tables Missing From Live Schema
- broadcasts (declared in ORM metadata, not found on live schema)
- districts (declared in ORM metadata, not found on live schema)
- provinces (declared in ORM metadata, not found on live schema)
- sub_districts (declared in ORM metadata, not found on live schema)
```

Estimated rows show `unknown` (`null` in the JSON output) because this local
database has never had `ANALYZE` run against it — `reltuples` stays at `-1`
until Postgres computes statistics, and the collector renders that sentinel
as unknown rather than a literal `-1`. This is expected on a freshly migrated
sandbox DB, not a collector bug; a second sample after `ANALYZE` (or organic
usage) is one of the open items in §9.

`pg_stat_statements` is not installed locally (`SELECT extname FROM
pg_extension` returns only `plpgsql`), so the collector's extension-absent
degrade path (§ FR1 item 3 / plan Task 1 GOTCHA) is exercised for real by
this run, not simulated.

## 9. Open Items Requiring Human Decisions

| Item | Decision needed | Owner |
| --- | --- | --- |
| Named owners for each migration control | `LIFF_STRICT_MODE` and `COOKIE_AUTH_MODE` owners per `docs/remediation/migration-controls.md` are described by role ("Backend security owner", "Authentication owner") but no individual is named. | Engineering lead |
| Webhook inbox data classification & retention | Does `webhook_inbox.payload` need PII redaction before storage? What retention window (the review's draft used 90 days, unratified)? | Backend/security owner |
| Advisory-lock ID registration | No constants module/registry exists. The review's `999001`/`999002` are proposed, not reserved. Must be formally registered before P1.6 implementation to avoid collision. | Backend owner |
| Webhook/Redis incident evidence | No documented data-loss incident, Redis-unavailability rate, or webhook volume measurement exists yet in this repo — required before starting outbox (phase 2) work per §6. | Backend/ops owner |
| Second table-size sample for growth rate | Only one local sample exists (2026-07-15, this doc) and one lost remote sample (2026-07-12, numbers unrecoverable). A second dated sample — ideally after `ANALYZE` and some real usage — is needed to compute any growth rate. | Backend owner (re-run `collect_preflight_db_evidence.py` periodically) |
| Remote (Supabase) re-collection | This PR's collector supports `--target remote` but was not run against remote — no `backend/.env`/prod credentials in this sandbox. Must be run from a machine holding those credentials. Caveat: check the `DATABASE_URL` query-string format first — the collector translates SQLAlchemy-style `?ssl=require` to asyncpg's `?sslmode=require` automatically, but other non-libpq params in the URL may still need adjusting for asyncpg. | Whoever holds `backend/.env` |
| `public.broadcasts` schema-ownership gap | Confirmed still missing from *local* too (§8), in addition to the previously-known remote gap. Explicitly deferred to PR 2F per the PRD non-goals — flagging here so it isn't lost again. | PR 2F owner |
