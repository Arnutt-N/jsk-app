# Session Summary — claude_code (Claude Opus 5) — 2026-08-05T14:19:00+07:00

**Branch**: `main`  **HEAD**: `e693a9a`
**Checkpoint**: `.agents/state/checkpoints/handover-claude_code-20260805-1419.json`

> **Platform Meta**
> | Field | Value |
> |-------|-------|
> | AI CLI IDE | Claude Code |
> | Provider | Anthropic |
> | Model | Claude Opus 5 |
>

## Objective

Close the three HIGH correctness defects raised in
`project-log-md/claude_code/architecture-review-verification-20260802-2200.md`.

## Completed

### PR #184 merged (squash `e693a9a`) — 9 files, +1,273/-75

All CI green before merge: Backend Pytest 1m14s, Frontend Lint and Build
1m21s, Playwright Smoke 3m15s, Source Encoding Scan 8s, Vercel deployed.

#### HIGH-1 — the backend never enforced the state machine

`STATUS_TRANSITIONS` lived only in `frontend/lib/constants/request-status.ts`,
where it disabled buttons. `admin_requests.py` assigned `request.status`
directly, so `PATCH {"status": "COMPLETED"}` on a PENDING row skipped
`ACKNOWLEDGED`, `IN_PROGRESS` and `AWAITING_APPROVAL` in one call.

**The review's prescription ("move the map to the backend and enforce it")
would have broken two working features.** `STATUS_TRANSITIONS` governs only
the single status-driven CTA. The kebab menu separately offers supervisors:

| Menu item | Move | Condition (`page.tsx:659-660`) |
|---|---|---|
| บังคับเสร็จสิ้น | → `COMPLETED` from any state | `canApprove && status !== 'COMPLETED'` |
| ย้อนกลับ รอรับเรื่อง | → `PENDING` from any active state | `canApprove && status ∉ {PENDING, COMPLETED}` |

`canApprove` is `permissions.can_assign`. Six real transitions would have
started returning 422. The word **"บังคับ"** (force) in the menu label is the
tell: skipping steps there is intended, not a bug.

Owner chose to keep the menus and record the skips. Implemented rule:

```
on-map move                  -> anyone who reaches the endpoint
off-map move + can_assign    -> allowed, action=status_change_forced
off-map move, no can_assign  -> 422
```

New `backend/app/core/request_workflow.py` owns the map plus
`can_transition` / `requires_override` / `validate_transition` /
`describe_invalid_transition`. The guard sits **after** the existing
permission checks so an unauthorized caller gets 403 and learns nothing
about the row's state.

#### HIGH-2 — status transitions were not audited

The table recorded who *undid* an approval but not who *granted* one — "who
completed this request?" had no answer beyond a bare `completed_at`.

Every transition now writes exactly one row, under the action that describes
it. The branches are exclusive, so no transition yields a duplicate pair:

| action | meaning |
|---|---|
| `status_change` | normal step along the map |
| `status_change_forced` | supervisor skipped steps (`details.forced = true`) |
| `revert_approval` | pre-existing revert-from-COMPLETED path |

`frontend/app/admin/audit/page.tsx` did not know the new actions, so a forced
transition would have rendered as an unlabelled grey chip beside routine
ones. Given the point is spotting skipped approvals, `status_change_forced`
now gets danger styling; the other four request actions got colours while in
there.

#### HIGH-3 — commit succeeded, caller was told it failed

`commit → broadcast → emit KPI` was written twice and drifted, each copy
receiving a fix the other never did:

- WS wrapped `emit_live_kpis_update`; HTTP did not → **HTTP 500 after the
  session was already claimed**
- HTTP guarded `session.status` with `hasattr`; WS called `.value` outright.
  `ChatSession.status` is `String(20)`, so a plain `str` raised
  `AttributeError` → generic handler → `"Failed to claim session"`, **also
  after the commit**

New `backend/app/services/live_chat_service/choreography.py` holds the rule:
**once `commit()` returns, the operation has happened and nothing may turn it
back into an error.** Broadcast failure logs at error (other operators' views
go stale); KPI failure logs at warning. A commit failure still propagates —
nothing is durable then, so reporting failure is honest.

`ws` and `analytics` are passed in rather than imported, so the HTTP layer
keeps its module singletons and the WS layer keeps late resolution through
the package namespace, which `patch('app.services.ws_session.ws_manager')`
depends on.

**The review named two call sites. There are four.** The fourth is the
operator-initiated conversation endpoint, whose broadcast was not wrapped at
all. It needs `db.refresh()` between commit and fan-out, so it calls
`announce_session_event()` while the other three use `publish_session_event()`.

### Drift guard

`tests/test_request_workflow.py` parses the TypeScript constants file and
asserts the two maps are identical. Editing one side alone now fails CI:
frontend-only edits re-open the original hole, backend-only edits make the UI
offer buttons the API rejects. It also pins the six override moves as
**off-map** — folding them into the map would silently drop the
`status_change_forced` distinction.

### Two existing tests were corrected, not worked around

- `test_forward_transition_does_not_log_revert_audit` asserted
  `audit_rows == []`; now expects the new `status_change` row alongside the
  still-absent `revert_approval` one.
- `test_workflow_patch_not_blocked_by_details_guard_for_agent` patched
  `PENDING → IN_PROGRESS`, which skips "รับเรื่อง". It passed only because
  nothing checked. Switched to `PENDING → ACKNOWLEDGED` so it tests the guard
  it is named for.

### Also this session

- `alembic upgrade head` on local: already at head `d5e6f7g8h9i0`, no-op.
  `alembic check --target local` → **No new upgrade operations detected**,
  independently confirming PR #183 closed the model-vs-schema drift.
- Docker Desktop had been hung 31 minutes (backend polling a dead engine
  while WSL distro `docker-desktop` sat Stopped). Fixed by killing
  `Docker Desktop` + `com.docker.backend` + `com.docker.build` +
  `docker-sandbox`, `wsl --shutdown`, relaunch. Postgres+Redis have been up
  since, so DB-backed tests ran locally for the first time on this box.

## Verification

| Suite | Result |
|---|---|
| Backend pytest | **872 passed** (816 + 46 + 10, see gotcha below) |
| Frontend vitest | **462 passed** |
| `npx tsc --noEmit` | clean |
| `npx eslint` | clean (one pre-existing warning in `requests/[id]/page.tsx`, untouched) |
| CI on PR #184 | all green |

47 tests added (`test_request_workflow.py` 34, `test_session_choreography.py` 13).

## Not done / blocked

- **pseudonym gate still unread** and now overdue (due 2026-08-04). Requires a
  logged-in admin browser tab; cookie auth is `SameSite=Strict` so `curl`
  returns 401. Unchanged from the previous handoff — an agent cannot do this.
- **5 MEDIUM findings untouched**, two of which this PR walked directly past:
  M5 (`completed_at` not reset when leaving COMPLETED for REJECTED/PENDING)
  and M4 (`RequestUpdate.priority` is `Optional[str]`, not the enum). Also
  M1 (CSV export has no LIMIT on service-requests/followers), M2 (PDF takes
  `period` days while CSV takes `start_date`/`end_date`), M3
  (`KEY_EXPORT_CHAT` gates *report* export).
- Review items 02 (LIFF, 2,427 lines, **zero tests**) and 03 (Rich Menu) are
  still unverified beyond line counts.

## Local runner gotcha (new)

The full `pytest` run **hangs near 99%** on this Windows box: 872 collected,
killed after ~10 min with `test_websocket.py` outstanding. Run in isolation
that file takes **50s and passes**. Almost certainly leaked Redis connections
or event loops accumulating across the preceding ~860 tests; CI splits jobs so
it never sees this.

Workaround that yields a real full-suite result:

```bash
pytest --ignore=tests/test_websocket.py \
       --ignore=tests/test_websocket_manager_redis.py \
       --ignore=tests/test_ws_security.py     # 816 passed, ~3min
pytest tests/test_ws_security.py tests/test_websocket_manager_redis.py  # 46
pytest tests/test_websocket.py                                          # 10
```

**Do not read the hang as a failure.**

Note also that `python`/`python3` on this machine hit the Windows Store
execution alias, so `handoff-new.cjs` reports `validator: FAIL`. Run the
validator explicitly with `backend/venv/Scripts/python.exe`.

## Blockers

- _none_ (the gate read needs a human login, which is not a code blocker)
