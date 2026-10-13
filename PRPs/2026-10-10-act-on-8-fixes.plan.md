# Plan: Fix 8 Act-On findings (2026-10-10)

PRD: PRPs/2026-10-10-act-on-8-fixes.prd.md
Branch: fix/act-on-8-interrogate (from main)
Playbook: pstack Bug fix, applied once per bug, sequential. Lead stays in main
thread; one fresh delegate per bug; lead reviews every diff, stages commits
(failing test, then fix), runs the final full suites, opens the PR.

## Environment (verified this session)
- Backend tests: WSL Ubuntu, `cd backend && ./venv_linux/bin/python -m pytest`
  (venv_linux has all deps; venv_test lacks redis).
- Services: PostgreSQL + Redis via WSL native services. WSL shuts down
  between separate shell calls, so EVERY pytest run must start services and
  run tests in ONE invocation: `wsl -u root bash -lc 'pg_ctlcluster 16 main
  start || true; service redis-server start || true; sleep 2; cd
  /mnt/d/genAI/jsk-app/backend && ./venv_linux/bin/python -m pytest <file>
  -q ...'` (use pg_ctlcluster, not `service postgresql start`, which only
  starts a stub; ignore systemd warnings and already-up noise).
- DB schema: `alembic upgrade head` was run to head on 2026-10-10 against
  skn_app_db (tests fail with UndefinedColumnError without it).
- Smoke proof: tests/test_admin_pagination_guards.py — 11 passed.
- Docker Desktop is DOWN; do not depend on it.
- Frontend: `npm run test:unit` from frontend/ (only if frontend changes).

## Per-bug files (expected)
1. C1: backend/app/services/message_intake/commands.py (+ staff-link support
   wherever smallest) + new backend/tests/test_phone_bind*.py
2. D4: backend/app/api/v1/endpoints/liff.py (attachments) + tests
3. B1: backend/app/core/config.py (guards) + tests (no network)
4. A1: backend/app/core/redis_client.py + tests (real local redis)
5. A3: backend/app/services/broadcast_service.py (+ 2 docstrings) + tests
   (mock LINE api)
6. A2: backend/app/services/live_chat_service/messaging.py (+ callers if the
   return shape changes) + maybe frontend hook + tests both sides as needed
7. C2: backend/app/services/line_service.py (persist_*) + tests (round-trip)
8. D1: backend/app/api/v1/endpoints/settings.py (gate) + tests

## Validation per bug
Failing test observed red -> minimal fix -> test green -> neighboring test
files green -> lead reviews diff -> commit test, commit fix.

## Final gate
Full backend suite green + frontend unit green (if touched) + lead-reviewed
diffs + PR with evidence. No merge without user approval.
