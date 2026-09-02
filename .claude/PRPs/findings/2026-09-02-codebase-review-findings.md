# Codebase Review Findings — 2026-09-02 (whole repo)

Pipeline: `codebase-review-fix` · Branch: `fix/codebase-review-fixes-20260902`
Reviewers: 4 parallel read-only agents — backend (10), frontend (9), security (10), tests+config (10) = 39 raw → **36 unique after dedup** (3 merged pairs marked ≡ below).
Evidence rule: every finding below was verified against the codebase (location + evidence present). Dispositions: **FIX** (this PR) or **DEFER** (documented reason).

## Summary

| Severity | Total | FIX | DEFER |
|---|---|---|---|
| Critical | 0 | 0 | 0 |
| High | 6 | 6 | 0 |
| Medium | 17 | 14 | 3 |
| Low | 13 | 2 | 11 |

---

## HIGH (all accepted → FIX)

### H1 — Webhook dedup drops every LINE message during a Redis outage
- location: `backend/app/api/v1/endpoints/webhook.py:63` (+ `backend/app/core/redis_client.py:75-84`)
- evidence: `lock_acquired = await redis_client.set(lock_key, ..., nx=True)`; `RedisClient.set` returns `False` both when the lock is held AND when Redis is down/`self._redis is None` (catches all exceptions → `return False`). Webhook does `if not lock_acquired: continue` → during any Redis outage every incoming LINE event is silently dropped.
- category: error-handling · reporters: backend
- disposition: **FIX** — make the lock tri-state (None = redis unavailable → fail open, process the event).

### H2 — ADMIN can create/modify/delete DIRECTOR/HEAD users (role escalation)
- location: `backend/app/api/v1/endpoints/admin_users.py:96-117`
- evidence: `_check_role_permission` branches only SUPER_ADMIN / ADMIN / AGENT; `DIRECTOR` and `HEAD` fall through with **no check**, so an ADMIN (manage_users permission) can create/modify users holding DIRECTOR/HEAD roles (which carry `access_manager_endpoints` / `access_staff_endpoints`).
- category: logic-error (privilege escalation) · reporters: backend
- disposition: **FIX** — explicit DIRECTOR/HEAD branches requiring SUPER_ADMIN.

### H3 — LIFF address selects: out-of-order fetch lets a district from the wrong province be submitted
- location: `frontend/app/liff/service-request/page.tsx:169` (+ `handleDistrictChange` :195; duplicated in `frontend/app/liff/request-v2/page.tsx:123`, `frontend/app/liff/service-request-single/page.tsx:141`)
- evidence: `const data = await fetchDistricts(provinceId); setDistricts(data)` — no guard that `provinceId` still matches the current selection after the await; a slow earlier response overwrites the list for the now-selected province.
- category: state-race · reporters: frontend
- disposition: **FIX** — capture the requested id, discard the response when it no longer matches.

### H4 — LIFF booking: stale availability response can put date A's slots under date B
- location: `frontend/app/liff/booking/page.tsx:318`
- evidence: `const loaded = await fetchAvailability(idToken, service, date); slotCache.current.set(key, loaded); setAvailability(loaded)` — no check that `service|date` is still the current selection after the await.
- category: state-race · reporters: frontend
- disposition: **FIX** — same guard pattern; compare against current selection via ref.

### H5 — The public unauthenticated webhook endpoint has zero tests (signature matrix)
- location: `backend/app/api/v1/endpoints/webhook.py:31-42` (no test POSTs to `/api/v1/webhook` anywhere in `backend/tests/`)
- evidence: missing `X-Line-Signature` → 400, invalid signature → 400, valid HMAC → 200 + dispatch: none covered.
- category: missing-test · reporters: tests
- disposition: **FIX** — TestClient matrix with real HMAC computed from `LINE_CHANNEL_SECRET`.

### H6 — Display-scheduler tests never exercise the SQL WHERE clauses
- location: `backend/tests/test_rich_menu_display_schedule.py:66` (`_SeqDB.execute` pops preset results and ignores the statement)
- evidence: inverting `display_start_at <= now` or dropping the mode filter keeps every scheduler test green — the query logic is untested.
- category: regression-risk · reporters: tests
- disposition: **FIX** — real-Postgres integration test (the CI suite already runs with PostgreSQL; same pattern as the DB-backed live-chat tests).

## MEDIUM — accepted → FIX (14)

### M1 ≡ (backend + security, 2 reporters) — POST /auth/login has no rate limit
- location: `backend/app/api/v1/endpoints/auth.py:133` (`_auth_rate_limit_exceeded` only wired at :384 and :427)
- disposition: **FIX** — reuse the existing limiter keyed by IP+username before password verification.

### M2 — Live-chat media upload has no size cap
- location: `backend/app/api/v1/endpoints/admin_live_chat.py:180` (`content = await file.read()`, only empty-check in messaging.py:81; siblings cap 10 MB)
- disposition: **FIX** — enforce the 10 MB cap before read (pattern: rich_menus upload).

### M3 — delete_conversation leaves the user in HUMAN chat mode
- location: `backend/app/api/v1/endpoints/admin_live_chat.py:643` (force-closes sessions; never resets `user.chat_mode` unlike `close_session` sessions.py:116-118)
- disposition: **FIX** — reset chat_mode to BOT after force-close.

### M4 — CSV exports unbounded for wide date ranges
- location: `backend/app/api/v1/endpoints/admin_reports.py:171` (service-requests + followers exports have no `.limit()`; messages export caps at 10 000)
- disposition: **FIX** — same 10 000-row cap on the other two exports.

### M5 — Upload endpoints buffer the whole body before the size check
- location: `backend/app/api/v1/endpoints/media.py:222` (same pattern `liff.py:93`)
- disposition: **FIX** — reject on `file.size` header before `read()` (keep the post-read check as backstop), pattern already used in rich_menus.py:594.

### M6 ≡ (frontend, 2 findings merged) — blob-URL leak in rich-menu image pickers
- location: `frontend/app/admin/rich-menus/new/page.tsx:622` (new URL per render, never revoked) + `[id]/edit/page.tsx:137` (previous preview never revoked)
- disposition: **FIX** — memoize per-file with cleanup (revoke previous).

### M7 — Any 4xx media failure flips live-chat to "backend offline"
- location: `frontend/app/admin/live-chat/_hooks/useMessageFlow.ts:240` (`catch { getStore().setBackendOnline(false) }`)
- disposition: **FIX** — only network failures / 5xx set offline; surface 4xx as a toast.

### M8 — Overlapping chat-detail responses can overwrite newer state
- location: `frontend/app/admin/live-chat/_hooks/useConversationSync.ts:99` (guards room id but not response order; 3 s poll + post-action refresh overlap)
- disposition: **FIX** — monotonic request sequence; drop stale responses.

### M9 — Read-SSRF via admin-configured integration URLs + response echo
- location: `backend/app/api/v1/endpoints/admin_integrations.py:588` (+ :358; URL stored as plain str, `resp.text[:200]` and `str(exc)` returned)
- disposition: **FIX (minimal)** — block non-http(s) schemes and private/loopback/link-local/metadata IP literals before fetch; stop echoing response bodies (keep status only). Full host allowlisting deferred (needs owner's allowed-host policy — see DEFER-D1).

### M10 — Stored XSS via admin media upload (no MIME allowlist, served inline)
- location: `backend/app/api/v1/endpoints/media.py:96-103, 222-234` (client mime honored, no sniffing; no `X-Content-Type-Options`; LIFF uploads already allowlist JPEG/PNG/PDF at liff.py:55)
- disposition: **FIX** — same allowlist + magic-byte sniff for admin uploads; serve with `Content-Disposition: attachment` (images excepted where inline preview is required by the admin UI — keep sniffed-type only) + `nosniff`.

### M11 — Plaintext LINE user IDs in live-chat push-failure logs
- location: `backend/app/services/live_chat_service/messaging.py:54, 152`
- evidence: `logger.error(f"LINE push failed after persist for {line_user_id}: {e}")` — violates the masking contract in `app/core/logging_utils.py`.
- disposition: **FIX** — `mask_line_id(...)` at both sites.

### M12 — Recreate-on-drift silently drops the image when the media row is missing (dangling FK)
- location: `backend/app/services/rich_menu_service.py:562` (`if rich_menu.image_media_id and media:` — `media` may be None → recreates imageless and deletes the old image-bearing menu)
- disposition: **FIX** — hard-fail before create when `image_media_id` is set but the row is gone; add test.

### M13 — Dependency floors: `python-jose>=3.3.0` admits CVE-2024-33663/33664 (fixed 3.4.0); `bcrypt` only present transitively via unused `passlib`
- location: `backend/requirements.txt:9-10` (`app/core/security.py` imports `bcrypt` directly, `passlib` imported nowhere)
- disposition: **FIX** — raise `python-jose[cryptography]>=3.4.0`; replace passlib with an explicit `bcrypt` pin.

### M14 — Admin-staff task counters use per-message N+1… *deferred variant*
- (listed under Low as B9; not duplicated here — see L-set)

## MEDIUM — DEFER (3)

- **DEFER-M1** — CD completes green while deploying nothing when secrets/vars are missing (`.github/workflows/cd.yml:149,208,289,370,413`): reason — changing deploy gating to hard-fail can block legitimate maintenance deploys; needs owner decision on policy (fail vs. explicit input). Filed for owner review.
- **DEFER-M2** — Backend deps unpinned (no lock file; CI/CD install latest at run time, `requirements.txt:1-14`): reason — introducing a lock file is a process change (pip-compile/uv adoption + CI + CD migration job changes); deserves its own PR, not a rider on this one.
- **DEFER-M3** — CD not gated on the E2E (Playwright) workflow conclusion (`.github/workflows/cd.yml:5`): reason — same policy concern as DEFER-M1 (workflow_run chain only triggers on CI); owner decision required on whether E2E latency should gate deploys.

## LOW — accepted → FIX (2)

- **L1** — `line_service.py:241`: `scalar_one_or_none()` on a non-unique lookup — one duplicate row raises MultipleResultsFound and poisons every redelivery of that message → `.limit(1)` + first(). **FIX**
- **L2** — `backend/app/api/v1/endpoints/media.py:124`: private-file token compare uses `!=` → `secrets.compare_digest` (one-liner, defense-in-depth). **FIX**

## LOW — DEFER (11)

- **DEFER-L11 (amended from FIX-L3)** — `ws_live_chat.py:51` WS origin guard no-ops when `BACKEND_CORS_ORIGINS` is empty: the current guard already rejects unmatched origins whenever the allowlist is non-empty; the residual gap is the empty-allowlist configuration. Fail-closing that case would break any deployment that never configured CORS — needs a production config audit before tightening. **(moved from FIX during plan review — the originally scoped fix was a no-op against current code)**

## LOW — DEFER (10)

- **DEFER-L1** — `admin_integrations.py` full https-only host allowlist (needs owner's allowed-host list; minimal scheme/private-IP block shipped in M9).
- **DEFER-L2** — `.env.production.example` sets `LIFF_STRICT_MODE=false` (deployment policy decision; changing the template default affects the migration-mode contract).
- **DEFER-L3 (webhook replay TTL)** — Webhook replay beyond the 5-minute dedup TTL (needs persistence decision for processed event ids beyond TTL; current LINE-side risk accepted).
- **DEFER-L4** — docker-compose binds 0.0.0.0 with weak dev passwords (dev-only stack; hardening = owner's local-env policy).
- **DEFER-L5** — CI-committed Fernet key (dev-default key, CI-scoped; rotation needs coordinated conftest+2 workflow changes — filed for owner).
- **DEFER-L6** — `websocket_manager.py:750` operator-online key without TTL (needs product decision on TTL length vs. availability aggregates).
- **DEFER-L7** — `message_intake/broadcast.py:29` per-admin unread N+1 (batch API exists; perf-only, low traffic).
- **DEFER-L8** — `useSessionTimeout` activity handler unthrottled (perf-only, timer churn harmless at current scale).
- **DEFER-L9** — `useNotificationSound` AudioContext per notification + dead `audioRef` code (cosmetic/perf).
- **DEFER-L10** — Kanban board renders empty on fetch failure with no error state (UX polish; separate UI task).
