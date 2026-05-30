# Plan: Live Chat 100% Compliance — Phased Implementation

## Summary
Achieve 100% compliance with LINE OA Live Chat best practices. Current score: 69% → Target: 97%. Organized into 6 phases with dependency chain.

## User Story
As an admin/operator, I want a fully compliant live chat system with security, analytics, and reliability features, so that I can confidently handle customer conversations at scale.

## Metadata
- **Complexity**: Large (20+ files across backend + frontend)
- **Source PRD**: `live-chat-100-compliance.plan.md`
- **Estimated Files**: ~25 files
- **Phases**: 6

---

## Phase 1: Security & Authentication Hardening (+10%)
**Status**: pending
**Dependencies**: none
**Estimated**: 3 days

### Tasks
1. **JWT Auth Integration** — Replace hardcoded adminId with useAuth(), send JWT on WebSocket auth, validate on backend
   - Files: `frontend/app/admin/live-chat/page.tsx`, `frontend/lib/websocket/client.ts`, `backend/app/api/v1/endpoints/ws_live_chat.py`
2. **Audit Logging** — Create AuditLog model + migration, log admin actions (claim, close, send)
   - Files: `backend/app/models/audit_log.py`, `backend/app/services/live_chat_service.py`, `backend/alembic/versions/`
3. **Session Timeout** — Track activity, show warning 5min before timeout, auto-logout
   - Files: `frontend/hooks/useAuth.ts`, `frontend/components/admin/SessionTimeoutWarning.tsx`, `backend/app/core/security.py`

### Validation
- `cd frontend && npx tsc --noEmit && npm run lint`
- `cd backend && python -m pytest tests/ -v`
- Manual: login → live chat → verify JWT sent on connect

---

## Phase 2: Enhanced Handoff Workflow (+12%)
**Status**: pending
**Dependencies**: Phase 1
**Estimated**: 3 days

### Tasks
1. **Keyword-Based Handoff Triggers** — Detect handoff keywords BEFORE intent matching in webhook
   - Files: `backend/app/api/v1/endpoints/webhook.py`, `backend/app/services/live_chat_service.py`
   - Keywords: "พูดกับเจ้าหน้าที่", "ติดต่อเจ้าหน้าที่", "ขอคุยกับคน", "agent", "human"
2. **Queue Position & Wait Time** — Calculate position in waiting queue, show estimated wait
   - Files: `backend/app/services/live_chat_service.py`, `backend/app/api/v1/endpoints/admin_live_chat.py`, `frontend/app/admin/live-chat/page.tsx`
3. **Business Hours Handling** — BusinessHours model + check within hours before handoff
   - Files: `backend/app/models/business_hours.py`, `backend/app/services/live_chat_service.py`, `backend/app/api/v1/endpoints/admin_settings.py`

### Validation
- `cd backend && python -m pytest tests/test_handoff_keywords.py tests/test_business_hours.py -v`
- Manual: send "ติดต่อเจ้าหน้าที่" → verify handoff triggers

---

## Phase 3: Operator Productivity Features (+10%)
**Status**: pending
**Dependencies**: Phase 1
**Estimated**: 2 days

### Tasks
1. **Canned Responses** — CannedResponse model + CRUD + picker component with "/" shortcut
   - Files: `backend/app/models/canned_response.py`, `backend/app/api/v1/endpoints/admin_canned_responses.py`, `frontend/components/admin/CannedResponsePicker.tsx`
2. **Notification Sounds** — Audio hook + sound file for incoming messages
   - Files: `frontend/public/sounds/new-message.mp3`, `frontend/hooks/useNotificationSound.ts`
3. **Operator Transfer** — transfer_session method + WebSocket event + UI
   - Files: `backend/app/services/live_chat_service.py`, `backend/app/api/v1/endpoints/ws_live_chat.py`, `frontend/app/admin/live-chat/page.tsx`

### Validation
- `cd frontend && npm run lint && npx tsc --noEmit`
- Manual: operator A → transfer to operator B → verify session moves

---

## Phase 4: Metrics & Analytics (+15%)
**Status**: pending
**Dependencies**: Phase 2, 3
**Estimated**: 4 days

### Tasks
1. **CSAT Survey** — Send survey on session close, handle postback rating
   - Files: `backend/app/models/csat_response.py`, `backend/app/services/csat_service.py`, `backend/app/services/live_chat_service.py`
2. **FCR Calculation** — Add is_first_contact_resolution field, calculate rate
   - Files: `backend/app/models/chat_session.py`, `backend/app/services/analytics_service.py`
3. **Real-Time KPI Dashboard** — LiveKPICards component + analytics endpoint
   - Files: `frontend/app/admin/live-chat/analytics/page.tsx`, `frontend/components/admin/LiveKPICards.tsx`, `backend/app/api/v1/endpoints/admin_analytics.py`

### Validation
- `cd backend && python -m pytest tests/test_csat_service.py tests/test_fcr_calculation.py -v`
- Manual: close session → CSAT survey appears in LINE → rate 5 stars

---

## Phase 5: Reliability & Scalability (+8%)
**Status**: pending
**Dependencies**: Phase 4
**Estimated**: 3 days

### Tasks
1. **Webhook Deduplication** — Redis-based event ID dedup with 5min TTL
   - Files: `backend/app/api/v1/endpoints/webhook.py`, `backend/app/core/redis.py`
2. **Redis Pub/Sub** — PubSubManager for horizontal WebSocket scaling
   - Files: `backend/app/core/pubsub_manager.py`, `backend/app/core/websocket_manager.py`
3. **Auto-Close Inactive Sessions** — Background task to close sessions inactive >30min
   - Files: `backend/app/tasks/session_cleanup.py`, `backend/app/services/live_chat_service.py`

### Validation
- `cd backend && python -m pytest tests/ -v`
- Manual: send duplicate webhook → verify only processed once

---

## Phase 6: Enhanced Admin Dashboard (+5%)
**Status**: pending
**Dependencies**: Phase 4
**Estimated**: 2 days

### Tasks
1. **KPI Display** — Add waiting/active/FRT/resolution/CSAT/FCR cards to live-chat header
   - Files: `frontend/app/admin/live-chat/page.tsx`
2. **Analytics Export** — CSV/Excel export for analytics data
   - Files: `backend/app/api/v1/endpoints/admin_reports.py`, `frontend/app/admin/reports/page.tsx`

### Validation
- `cd frontend && npm run build`
- Manual: live chat page → verify KPI cards visible

---

## Database Migrations Required
```bash
cd backend
alembic revision --autogenerate -m "add_audit_logs_table"
alembic revision --autogenerate -m "add_business_hours_table"
alembic revision --autogenerate -m "add_canned_responses_table"
alembic revision --autogenerate -m "add_csat_responses_table"
alembic revision --autogenerate -m "add_session_fcr_fields"
alembic upgrade head
```

---

## Success Criteria
- [ ] JWT auth integrated frontend-to-backend
- [ ] Audit logs capturing all admin actions
- [ ] Keyword handoff triggers working
- [ ] Queue position displayed
- [ ] Business hours enforced
- [ ] Canned responses usable
- [ ] Notification sounds playing
- [ ] Operator transfer working
- [ ] CSAT surveys sent and recorded
- [ ] FCR calculated accurately
- [ ] Real-time KPI dashboard operational
- [ ] Webhook dedup filtering duplicates
- [ ] Redis Pub/Sub enabling horizontal scaling
- [ ] Auto-close inactive sessions
- [ ] Analytics export functional

## Risks
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| LINE API rate limiting | MEDIUM | HIGH | Exponential backoff, cache responses |
| WebSocket message ordering | LOW | MEDIUM | Sequence numbers, queue when disconnected |
| Database migration conflicts | LOW | HIGH | Review migration, test on staging first |
