# JskApp P0-P3 Remediation Execution Plan (Revised)

**Created:** 2026-07-12 (Asia/Bangkok)  
**Supersedes:** `PRPs/claude_code/2026-07-11-2329-gpt-5.6-sol-p0-p3-remediation.plan.md`  
**Incorporates:** `PRPs/claude_code/2026-07-12-consolidated-remediation-review.md`  
**Delivery:** Sequential, reversible PRs with verification gates  
**Estimate:** 9-12 weeks with two engineers; re-estimate after pre-flight

## Objective and Rules

Resolve verified security, authorization, durability, correctness, performance, and
maintenance risks in P0-P3 order. This plan authorizes code and test changes only.
Commit, push, deployment, production configuration, and destructive migrations require
separate approval.

Every PR must have one primary outcome, tests, rollout/rollback notes, observability,
targeted checks, and the relevant full suite. Preserve compatibility until adoption is
measured. Every temporary flag needs an owner, threshold, rollback, and removal PR.

## Decisions Replacing the Original Plan

- Roll out strict LIFF verification behind `LIFF_STRICT_MODE`.
- Split cookie authentication into three sequential PRs over about three weeks.
- Ship a durable webhook inbox first. Build an outbox only after evidence and a worker architecture decision.
- Add indexes only after measured query plans and before/after comparison.
- Add defense-in-depth media validation and audit-of-audit.
- Hold scheduler advisory locks on a dedicated connection with guaranteed release.
- Defer client-side image resize unless separately approved.

## Phase 0 - Pre-Flight (1 week)

### PR 0A: Migration Controls

Add typed `LIFF_STRICT_MODE=false` and `COOKIE_AUTH_MODE=bearer|dual|cookie` settings.
Reject unknown production values. Document owners, thresholds, rollback, and removal.

### PR 0B: Evidence and Designs

- Measure webhook volume, duplicates, latency, Redis incidents, and known data loss.
- Record table sizes/growth and representative production-like query plans.
- Confirm `pg_stat_statements` through infrastructure change control.
- Inventory LIFF forms, auth/WebSocket clients, and privileged mutations.
- Record designs for cookie/CSRF/refresh/WebSocket auth, inbox recovery, and scheduler leadership.

Do not store production payloads, personal data, or raw tokens in artifacts.

**Gate:** controls are compatible/tested; evidence and designs are recorded; estimate is updated.

## Phase 1 - Fail-Closed Security (2 weeks)

### PR 1A: Production Guards (P0.1)

Reject production auth bypass, weak `SECRET_KEY`, invalid Fernet key, missing
`LINE_LOGIN_CHANNEL_ID`, and development encryption fallback. Test startup failures
and secret redaction.

### PR 1B: LIFF Token Transmission (P0.2a)

All LIFF forms call `liff.getIDToken()` and send `x-liff-id-token`. Handle missing
LIFF context in Thai UI. Backend remains permissive temporarily and records presence metrics only.

### PR 1C: LIFF Observe Mode and Strict Rollout (P0.2b)

- Verify tokens and derive ownership only from verified `sub`.
- Never authorize with body `line_user_id`.
- Isolate the temporary fallback and emit a metric.
- Test valid, missing, invalid, expired, and forged identity cases.

Enable strict mode after every client is deployed and token presence meets the agreed
threshold (target 100%) for 3-5 days. Smoke-test staging first. Roll back by disabling
the flag; remove fallback code after stability is proven.

### PR 1D: Privileged Audit and Audit-of-Audit (P0.3)

- Audit privileged mutations in the mutation transaction.
- Redact with an allow-list; never persist secrets or tokens.
- Audit reads/exports with actor, filters, timestamp, and result count.
- Revoke application-role `UPDATE`/`DELETE` on immutable audit rows; use a separately
  controlled retention/archive role.

**Gate:** targeted/full backend tests; frontend lint, type-check, unit tests, build; LIFF
smoke tests; security, FastAPI, and React review.

## Phase 2 - Auth, Authorization, and Durability (3-4 weeks)

### PR 2A: Cookie Backend Foundation (P1.1a)

- In dual mode, read cookies first and temporarily accept Bearer tokens.
- Put access/refresh tokens in `HttpOnly` cookies with production `Secure`, explicit
  `SameSite`, consistent expiry, and narrow paths where practical.
- Implement logout using matching cookie-clear attributes.
- Rotate refresh tokens atomically; store hashed identifiers; detect reuse and revoke the
  affected session family.
- Add an audited, rate-limited Bearer-to-cookie migration endpoint.
- Permit credentialed CORS only from explicit origins.

Use a consistent double-submit CSRF design. Access/refresh cookies remain HttpOnly. Keep
the CSRF value in memory with a safe reload bootstrap endpoint, or in a non-HttpOnly CSRF
cookie echoed in `X-CSRF-Token`. Compare in constant time and require it for
state-changing cookie-authenticated requests.

For WebSockets, validate `Origin` and use same-origin cookies or a short-lived,
single-use ticket. Never put long-lived credentials in query strings.

### PR 2B: Frontend Auth Migration (P1.1b)

- Centralize requests, use `credentials: include`, and attach CSRF to mutations.
- Model `loading|authenticated|unauthenticated`; do not infer auth from token state.
- Bootstrap from an `/auth/me`-style endpoint.
- Migrate once, remove localStorage tokens, and single-flight concurrent refresh.
- Test reload, expiry, logout, migration failure, multiple tabs, and concurrent 401s.

Move from bearer to dual mode and monitor outcomes before proceeding.

### PR 2C: Cookie-Only Hardening (P1.1c)

Switch to cookie mode, remove Bearer fallback and legacy storage after the observation
window, run security tests/review, then remove the temporary mode flag.

### PR 2D: RBAC Unification (P1.2)

Make DB permission keys authoritative across REST and WebSocket. Align navigation, page
guards, direct URLs, report/export/media semantics, and `DIRECTOR`/`HEAD` behavior.
Preserve `SUPER_ADMIN` lockout. Add a six-role matrix test. Frontend guards are UX only.

### PR 2E: Secure Media (P1.3)

- Enforce streamed size limits before full reads.
- Validate allow-listed magic bytes, declared MIME, decoded images, dimensions, and
  decompression-bomb limits; reject active content.
- Sanitize names, support Thai names via RFC 5987, and return `nosniff`.
- Authorize private media by permission key.
- Sign expiring URLs with HMAC, key IDs, rotation, maximum expiry, and constant-time comparison.
- Test polyglots, mismatches, oversize, expiry, and tampering.

### PR 2F: Alembic Ownership and Correctness (P1.4/P1.7)

Remove runtime schema creation; retain connectivity checks/idempotent seeds. Reconcile
LIFF nullability, router ownership, and route collisions. Require one Alembic head and
test upgrade/downgrade on a production-like snapshot.

### PR 2G: Durable Webhook Inbox (P1.5 Phase 1)

- Commit validated events and stable LINE event IDs/deduplication keys before success.
- Track received, processing, completed, retryable-failed, and terminal-failed states.
- Claim atomically; make handlers idempotent; keep Redis optional.
- Add bounded retention (initial proposal: 90 days), batched cleanup, metrics, and archive
  policy. Do not assume `pg_cron`; use approved infrastructure or a leader-protected job.
- Benchmark commit latency and test replay, Redis outage, interruption, and recovery.

Inline processing is acceptable initially only if the inbox commits first and a recovery
job reclaims unfinished records.

### Outbox Decision Gate (P1.5 Phase 2)

Build an outbox only when evidence shows a recovery/asynchronous side-effect need. First
define worker mechanism, retry/backoff, dead letters, ordering, idempotency, retention,
partition threshold, and ownership. FastAPI `BackgroundTasks` is not a durable queue.

### PR 2H: Multi-Instance Job Safety (P1.6)

Use a dedicated long-lived DB connection for advisory leadership. Release in `finally`;
on connection loss, stop scheduling. Use non-blocking acquisition with bounded
retry/jitter and a lock-ID registry. Preserve row locks and idempotent transitions. Test
two instances, leader loss, reconnect, shutdown, and duplicate prevention.

**Gate:** auth/CSRF E2E, role/WebSocket matrix, signed-media tests, migration checks,
Redis-offline inbox recovery, multi-instance scheduler tests, and specialist reviews.

## Phase 3 - Consolidation and Measured Performance (2-3 weeks)

### PR 3A: Intent/AutoReply (P2.1)

Make normalized Intent canonical; migrate legacy rows reversibly; preserve fallback until
counts and behavior match; deprecate routes before removing consumers.

### PR 3B: Reports/Exports (P2.2)

Define report, analytics, and export boundaries; share queries/serializers; migrate
consumers; correct permissions; compare CSV/PDF output; preserve Thai output.

### PR 3C: Pagination and Indexes (P2.3)

Add cursor pagination with stable unique ordering. Use table sizes, `pg_stat_statements`,
and `EXPLAIN (ANALYZE, BUFFERS)`. Show before/after latency, buffers, write cost, and
index size. Use concurrent production index creation where needed and account for
Alembic transaction constraints.

### PR 3D: Audit Consistency (P2.4)

Align date ranges, add correlation IDs, retain useful redacted before/after values, and
verify actor plus rollback semantics.

### PR 3E: Critical E2E (P2.6)

Cover LIFF, cookie/CSRF, roles, media, reports/exports, settings/integrations, webhook
replay, and scheduler leadership. Security journeys block merging.

**Deferred P2.5:** client-side image resize requires separate product approval.

**Gate:** reversible migrations, output parity, pagination contracts, measured query
plans, critical E2E, and domain/general reviews.

## Phase 4 - Documentation and Cleanup (1-2 weeks)

- **PR 4A (P3.1/P3.2):** refresh skills, `CLAUDE.md`, codemaps, and technical docs; add
  source-of-truth and `last-verified` metadata; consolidate only verified duplicates.
- **PR 4B (P3.3):** make `globals.css` the application token source, tokenize charts,
  define package boundaries, and keep visual cleanup separate from report behavior.
- **PR 4C (P3.4):** inventory deprecations with owner, consumers, removal date, and
  rollback; migrate consumers before deletion; consolidate LIFF forms after stability.
- **PR 4D (P3.5):** standardize user-facing JskApp naming, Node versions, and reproducible
  Python locking; avoid DB identifier renames without a dedicated migration.

**Gate:** regenerate codemaps; route/dead-code checks; all tests/builds; final security,
accessibility, performance, and documentation reviews.

## Verification Commands

Run through WSL per repository policy.

```bash
cd backend
python -m pytest
python scripts/db_target.py alembic --target local upgrade head
python scripts/verify_schema_extended.py

cd ../frontend
npm run lint
npx tsc --noEmit
npm run test:unit
npm run build
npm run test:e2e
```

Run PR-targeted checks first. Full suites are phase gates, not substitutes for targeted
verification.

## Required Operational Signals

- LIFF token presence and verification outcomes.
- Login/refresh, reuse detection, CSRF rejection, and migration outcomes.
- Inbox states, duplicates, retries, failures, and oldest unfinished age.
- Scheduler leader, lock acquisition/loss, and duplicate-prevention outcomes.
- Signed-media rejection classes without signatures or sensitive URLs.
- Audit-write failures and audit read/export activity.

Document owners and alert thresholds before strict-mode enablement.

## Completion Definition

The program is complete only when all phase gates pass; temporary compatibility flags
and fallback code are removed; no critical/high finding remains without an accepted
exception; migrations/configuration have tested rollback; durability failures are
observable; documentation matches implementation; and final backend, frontend, E2E,
build, security, and review gates pass.
