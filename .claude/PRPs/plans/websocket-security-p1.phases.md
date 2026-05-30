# Plan: WebSocket Security Hardening (P1 Critical) — Phased Implementation

## Summary
Production-grade security for WebSocket live chat: JWT authentication replacing mock auth, rate limiting (30 msg/min), and input validation with XSS sanitization. Must be completed before production deployment.

## User Story
As a system administrator, I want the WebSocket live chat to have production-grade security, so that operators can safely communicate without risk of unauthorized access, spam attacks, or injection vulnerabilities.

## Metadata
- **Complexity**: Medium (7 files)
- **Source PRD**: `websocket-security-p1.plan.md`
- **Estimated Files**: 7 files
- **Confidence**: 10/10 — ready for one-pass implementation
- **Phases**: 4

---

## Phase 1: Dependencies & Configuration
**Status**: pending
**Dependencies**: none
**Estimated**: 0.5 day

### Tasks
1. **Add bleach dependency** — `bleach>=6.0.0` for HTML sanitization
   - Files: `backend/requirements.txt`
2. **Add rate limit config** — `WS_RATE_LIMIT_MESSAGES=30`, `WS_RATE_LIMIT_WINDOW=60`, `WS_MAX_MESSAGE_LENGTH=5000`
   - Files: `backend/app/core/config.py`

### Validation
- `cd backend && pip install -r requirements.txt`
- `python -c "from app.core.config import settings; print(settings.WS_RATE_LIMIT_MESSAGES)"`

---

## Phase 2: Rate Limiter & Schema Validation
**Status**: pending
**Dependencies**: Phase 1
**Estimated**: 1 day

### Tasks
1. **Create rate_limiter.py** — Sliding window algorithm, singleton `ws_rate_limiter`, `is_allowed()`/`reset()`/`cleanup_stale()`
   - Files: `backend/app/core/rate_limiter.py`
   - Pattern: MIRROR `backend/app/core/websocket_manager.py:168-169` singleton
2. **Update ws_events.py** — Add `WSErrorCode` enum, `AuthPayload.token` with min_length, `SendMessagePayload` with bleach sanitization, `JoinRoomPayload` with regex pattern
   - Files: `backend/app/schemas/ws_events.py`
   - Pattern: MIRROR `backend/app/schemas/ws_events.py:51-65`

### Validation
- `python -c "from app.core.rate_limiter import ws_rate_limiter; print(ws_rate_limiter.is_allowed('test'))"`
- `python -c "from app.schemas.ws_events import SendMessagePayload; p = SendMessagePayload(text='<script>alert(1)</script>'); print(p.text)"`

---

## Phase 3: Endpoint & Manager Integration
**Status**: pending
**Dependencies**: Phase 2
**Estimated**: 1 day

### Tasks
1. **Update ws_live_chat.py** — Replace mock auth with JWT decode (`jose.jwt.decode`), rate limit check before processing, Pydantic validation for payloads, proper error codes
   - Files: `backend/app/api/v1/endpoints/ws_live_chat.py`
   - Pattern: MIRROR error response pattern at lines 79-84
   - GOTCHA: Check both query param `token` and auth message payload
2. **Update websocket_manager.py** — Import `ws_rate_limiter`, call `reset()` in disconnect
   - Files: `backend/app/core/websocket_manager.py`

### Validation
- `cd backend && python -m py_compile app/core/rate_limiter.py app/api/v1/endpoints/ws_live_chat.py app/schemas/ws_events.py`
- `cd backend && python -c "from app.main import app; print('Import OK')"`

---

## Phase 4: Tests & Manual Verification
**Status**: pending
**Dependencies**: Phase 3
**Estimated**: 0.5 day

### Tasks
1. **Create test_ws_security.py** — JWT tests (valid/expired/invalid), rate limiter tests (within limit/exceeded/reset/independent clients), schema tests (sanitization/length/format)
   - Files: `backend/tests/test_ws_security.py`
   - Pattern: MIRROR `backend/tests/test_websocket.py:1-20`
2. **Manual integration** — Generate JWT, connect WebSocket, test auth/rate-limit/sanitization

### Validation
- `cd backend && python -m pytest tests/test_ws_security.py -v`
- `cd backend && python -m pytest tests/ -v`

---

## NOT Building (Scope Limits)
- Token refresh mechanism (tokens have 30-min expiry)
- User database lookup (JWT is self-contained)
- IP-based rate limiting (per-connection only)
- Redis-backed rate limiting (single-server is sufficient)
- Token blacklist/revocation (short-lived tokens only)
- Audit logging to database (stdout only)

---

## Success Criteria
- [ ] JWT tokens validated using SECRET_KEY from config
- [ ] Invalid/expired tokens return auth_error with specific codes
- [ ] Rate limiting blocks messages over 30/minute
- [ ] HTML content sanitized (no `<script>` tags)
- [ ] Messages over 5000 characters rejected
- [ ] LINE user ID format validated (`U{32 hex chars}`)
- [ ] All unit tests pass
- [ ] Rate limit resets on disconnect

## Risks
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Circular import with rate_limiter | LOW | MEDIUM | Use lazy import if needed; rate_limiter is standalone |
| Rate limiter memory growth | MEDIUM | LOW | cleanup_stale() method available |
| JWT clock skew issues | LOW | MEDIUM | Standard 30-min expiry; clients refresh proactively |
