# Plan: Live Chat Testing & Code Review — Phased Implementation

## Summary
Comprehensive backend WebSocket testing for live chat: session claim, multi-operator, reconnection. 8 tasks across 3 test phases + code review. Pure testing — no production code changes.

## User Story
As a QA engineer/developer, I want to verify Live Chat reliability through comprehensive testing, so that operators can confidently handle conversations without bugs in claim, multi-operator, or reconnection scenarios.

## Metadata
- **Complexity**: Medium (4-5 test files)
- **Source PRD**: `live-chat-testing-review.plan.md`
- **Estimated Files**: 5 files
- **Phases**: 4

---

## Phase 1: Test Infrastructure Setup
**Status**: pending
**Dependencies**: none
**Estimated**: 0.5 day

### Tasks
1. **Shared Fixtures** — Add authenticated WebSocket helper + drain_auth_responses to conftest.py
   - Files: `backend/tests/conftest.py`
   - Pattern: MIRROR `backend/tests/test_ws_security.py:1-20`

### Validation
- `cd backend && python -m pytest tests/conftest.py -v`

---

## Phase 2: Session Claim & Multi-Operator Tests
**Status**: pending
**Dependencies**: Phase 1
**Estimated**: 1 day

### Tasks
1. **test_session_claim.py** — claim without room (error), claim WAITING session, claim already-claimed, SESSION_CLAIMED broadcast
   - Files: `backend/tests/test_session_claim.py`
   - Pattern: MIRROR `backend/tests/test_websocket.py:41-55`
2. **test_multi_operator.py** — two operators join same room, operator_joined broadcast, operator_left on disconnect, presence shows all online
   - Files: `backend/tests/test_multi_operator.py`
   - Pattern: MIRROR `backend/tests/test_websocket.py:26-38`

### Validation
- `cd backend && python -m pytest tests/test_session_claim.py tests/test_multi_operator.py -v`

---

## Phase 3: Reconnection & Service Tests
**Status**: pending
**Dependencies**: Phase 1
**Estimated**: 1 day

### Tasks
1. **test_reconnection.py** — reconnect same admin_id, room must rejoin after reconnect, multiple tabs same admin
   - Files: `backend/tests/test_reconnection.py`
   - Pattern: MIRROR `backend/tests/test_websocket.py:93-111`
2. **test_live_chat_service.py** — unit tests for claim_session, close_session, get_active_session with mocks
   - Files: `backend/tests/test_live_chat_service.py`
   - Pattern: MIRROR `backend/tests/test_ws_security.py:203-242`

### Validation
- `cd backend && python -m pytest tests/test_reconnection.py tests/test_live_chat_service.py -v`

---

## Phase 4: Edge Cases & Full Suite
**Status**: pending
**Dependencies**: Phase 2, 3
**Estimated**: 0.5 day

### Tasks
1. **Edge Case Tests** — Add leave_room test + typing_indicators test to existing test_websocket.py
   - Files: `backend/tests/test_websocket.py`
2. **Full Test Suite** — Run all tests, fix failures
3. **Code Review** — Review ws_live_chat.py error handling, websocket_manager.py room cleanup, live_chat_service.py transaction handling

### Validation
- `cd backend && python -m pytest tests/ -v --tb=short`
- `cd backend && python -m pytest tests/ --cov=app --cov-report=term-missing`

---

## Success Criteria
- [ ] 10+ new tests created
- [ ] All existing tests continue to pass
- [ ] Session claim workflow fully tested
- [ ] Multi-operator room handling tested
- [ ] Reconnection state recovery tested
- [ ] Code review checklist completed

## Risks
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Tests fail due to missing DB/LINE mocks | HIGH | MEDIUM | Use mocks; skip integration tests |
| Multi-client WebSocket tests flaky | MEDIUM | LOW | Add timeouts, don't assume message ordering |
| pytest-asyncio not installed | LOW | HIGH | Add to requirements-dev.txt if missing |
