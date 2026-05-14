# Plan: Request Management Feature & Decisions (PRD B)

## Summary

Close the `/admin/requests/[id]` COMPLETED dead-end by adding two **revert** items to the existing kebab override menu (supervisor-only, with audit log + confirm dialog), and merge the page's three separate cards (hero / tab-nav / tab-content) into a single visually unified card while preserving PR #53's Linear-inspired hero layout intent.

## User Story

As an **admin / super-admin** managing service requests,
I want to **revert a request that was approved by mistake back to a prior state with an audited trail**,
So that I can **fix errors without database edits or creating duplicate requests, and the team has accountability for every revert**.

## Problem → Solution

- **Current**: COMPLETED state has zero workflow buttons (frontend guards exclude COMPLETED from all advance/reject/kebab logic) → admin must edit DB to recover. Layout uses 3 separate cards which feels fragmented.
- **Desired**: COMPLETED retains kebab visibility with 2 new revert options ("ยกเลิกอนุมัติ → รออนุมัติ" and "ยกเลิกอนุมัติ → กำลังดำเนินการ"), each gated by `canApprove`, confirmed via `ConfirmDialog`, and logged to `audit_logs`. Hero merges into one card with internal section dividers.

## Metadata

- **Complexity**: **Medium** (cross-stack: backend audit log + frontend kebab + frontend layout refactor + frontend constants + E2E + tests)
- **Source PRD**: `.claude/PRPs/prds/request-mgmt-features.prd.md`
- **PRD Phase**: All 6 phases (this single plan covers the full PRD since phases are tightly coupled)
- **Estimated Files**: 5 source + 1-2 tests = **6-7 files**
- **Review Notes**:
  - **Round 1 (2026-05-15)**: verified 8 plan claims; resolved Task 1 GOTCHA (`db.commit()` at admin_requests.py:372 is explicit and atomic); added Task 3.5 (STATUS_TRANSITIONS map); clarified `ConfirmDialog` import gap in Task 4 IMPORTS.
  - **Round 2 (2026-05-15)**: deep-verified test conventions + URL routing. Found GAP 3 (Task 2 used wrong test style — codebase uses FakeDB + dependency_overrides + sync TestClient, not async fixtures; also `_FakeDB` is missing `flush()` which `create_audit_log` calls); GAP 4 (Task 6 used non-existent URL filter — list page filter is React state, not URL-synced). Both patched.

---

## UX Design

### Before (COMPLETED state)

```
┌──────────────────────────────────────────────┐
│  HERO CARD (rounded-2xl, own border)         │
│  ┌──── Title ─── [COMPLETED] [LOW] ───┐      │
│  │  (action area: EMPTY — no buttons)  │     │
│  │  (subcategory caption below)        │     │
│  └─────────────────────────────────────┘     │
└──────────────────────────────────────────────┘
   (margin gap)
┌──────────────────────────────────────────────┐
│  TAB NAV (rounded-t-2xl, own border)         │
│  [Details] [Contact] [Comments] [Manage]    │
├──────────────────────────────────────────────┤
│  TAB CONTENT (rounded-b-2xl, own border)     │
│  ...                                          │
└──────────────────────────────────────────────┘
```

→ Admin opens COMPLETED request, sees no buttons, has no recovery path.

### After (COMPLETED state)

```
┌──────────────────────────────────────────────┐
│  SINGLE MERGED CARD (one rounded-2xl, one border) │
│  ┌──── Title ─── [COMPLETED] [LOW] ─── [⋮] ─┐│
│  │  (kebab now visible — opens to:)         ││
│  │  ┌───────────────────────────────────┐   ││
│  │  │ การจัดการพิเศษ                     │   ││
│  │  ├───────────────────────────────────┤   ││
│  │  │ ↺  ยกเลิกอนุมัติ → รออนุมัติ        │   ││  ← NEW
│  │  │ ↺  ยกเลิกอนุมัติ → กำลังดำเนินการ   │   ││  ← NEW
│  │  └───────────────────────────────────┘   ││
│  │  (subcategory caption)                   ││
│  ├───── internal divider ────────────────────┤│
│  │  [Details] [Contact] [Comments] [Manage] ││
│  ├───── internal divider ────────────────────┤│
│  │  TAB CONTENT                              ││
│  └─────────────────────────────────────────┘│
└──────────────────────────────────────────────┘
```

→ Admin clicks kebab item → ConfirmDialog (warning variant) → confirm → audit_log entry + status revert.

### Interaction Changes

| Touchpoint | Before | After | Notes |
|---|---|---|---|
| Kebab visibility on COMPLETED | hidden | visible (gated by `canApprove`) | inner items self-gate by status |
| Kebab items count when COMPLETED | 0 (kebab hidden) | 2 new revert items only | force-complete + revert-to-pending stay hidden on COMPLETED |
| Audit trail for status revert | none | every revert logs to `audit_logs` | action="revert_approval", details: from/to status |
| Page structure | 3 cards, gaps between | 1 card, internal `border-b border-border-default` dividers | preserves Linear-inspired hero row |
| `completed_at` on revert | n/a (revert not possible) | reset to `NULL` when reverting from COMPLETED | symmetric with how `func.now()` is set on entry |

---

## Mandatory Reading

| Priority | File | Lines | Why |
|---|---|---|---|
| **P0** | `backend/app/core/audit.py` | 97-136 | `create_audit_log` utility — exact signature for revert logging |
| **P0** | `backend/app/models/audit_log.py` | 1-29 | AuditLog model — `action`/`resource_type`/`resource_id`/`details` shape |
| **P0** | `backend/app/api/v1/endpoints/admin_requests.py` | 316-380 | `update_request` PATCH endpoint — where revert detection + audit log insert lives |
| **P0** | `frontend/app/admin/requests/[id]/page.tsx` | 300-545 | Hero + kebab + tab containers — both PRD changes touch this region |
| **P1** | `backend/app/tasks/session_cleanup.py` | 85-104 | Reference: existing `create_audit_log` call pattern with `details` payload |
| **P1** | `frontend/components/ui/ConfirmDialog.tsx` | 1-93 | Canonical confirm dialog — ReactNode description + variant="warning" usage |
| **P1** | `frontend/hooks/useGuardedUpdate.ts` | all | In-flight guard pattern that wraps the PATCH; preserves loading state |
| **P1** | `frontend/components/ui/DropdownMenu.tsx` | 1-50 | DropdownMenuItem API — accepts `onClick`, `disabled`, children |
| **P2** | `frontend/e2e/admin-requests-supervisor.spec.ts` | all | Reference for E2E patterns — `getFirstRequestDetailUrl`, role gating tests |
| **P2** | `backend/app/services/live_chat_service.py` | 261-302 | Reference: `@audit_action` decorator usage (alternative pattern, not used here but informative) |

## External Documentation

No external libraries to research — feature uses only established internal patterns (audit log utility, ConfirmDialog component, DropdownMenu component, useGuardedUpdate hook).

---

## Patterns to Mirror

### AUDIT_LOG_CALL
```python
# SOURCE: backend/app/tasks/session_cleanup.py:92-103
await create_audit_log(
    db=db,
    admin_id=None,                              # use current_admin.id for revert
    action="auto_close_session",                # use "revert_approval" for revert
    resource_type="chat_session",               # use "service_request" for revert
    resource_id=str(session.id),                # use str(request.id) for revert
    details={
        "reason": "inactivity",
        "threshold_minutes": INACTIVE_TIMEOUT_MINUTES,
        "last_activity": session.last_activity_at.isoformat() if session.last_activity_at else None,
    },
)
# NOTE: create_audit_log does db.flush() but NOT db.commit() — the
# caller's commit handles transaction boundary. Match that here so the
# audit row rolls back if the PATCH fails after.
```

### PATCH_ENDPOINT_UPDATE_FLOW
```python
# SOURCE: backend/app/api/v1/endpoints/admin_requests.py:354-358
# Update fields
if update_data.status is not None:
    request.status = update_data.status
    if update_data.status == RequestStatus.COMPLETED:
        request.completed_at = func.now()
# NEW BEHAVIOR: detect revert FROM COMPLETED and reset completed_at to None
# (symmetric with the set above).
```

### KEBAB_DROPDOWN_ITEM
```tsx
// SOURCE: frontend/app/admin/requests/[id]/page.tsx:501-511
{/* "ย้อนกลับ รอรับเรื่อง": revert mid-flow records that were advanced by mistake.
    Hidden on PENDING (already there). */}
{request.status !== 'PENDING' && (
    <DropdownMenuItem
        disabled={submitting}
        onClick={() => { void guardedUpdate({ status: 'PENDING' }); }}
    >
        <Undo2 size={16} className="text-amber-600" />
        ย้อนกลับ รอรับเรื่อง
    </DropdownMenuItem>
)}
// NEW ITEMS: same shape, gated by request.status === 'COMPLETED',
// but wrap onClick in ConfirmDialog open state (not a bare PATCH).
```

### KEBAB_VISIBILITY_GUARD
```tsx
// SOURCE: frontend/app/admin/requests/[id]/page.tsx:479
{canApprove && request.status !== 'COMPLETED' && request.status !== 'REJECTED' && (
    <DropdownMenu>...</DropdownMenu>
)}
// CHANGE TO: drop the COMPLETED exclusion so kebab is visible on COMPLETED too.
// Inner items already self-gate (force-complete + revert-to-pending hidden when terminal).
// Final guard: canApprove && request.status !== 'REJECTED'
```

### CONFIRM_DIALOG_REACTNODE
```tsx
// SOURCE: frontend/app/admin/requests/page.tsx (post PR #54)
<ConfirmDialog
    isOpen={revertConfirm.open}
    onClose={() => setRevertConfirm({ open: false, target: null })}
    onConfirm={() => {
        if (revertConfirm.target) {
            void guardedUpdate({ status: revertConfirm.target });
        }
        setRevertConfirm({ open: false, target: null });
    }}
    title="ยืนยันยกเลิกการอนุมัติ"
    description={
        <>
            คำร้องจะกลับไปสถานะ <b>{statusLabel(revertConfirm.target)}</b>
            <br />
            <span className="text-xs text-amber-600 mt-2 block">
                การกระทำนี้จะถูกบันทึกในประวัติ
            </span>
        </>
    }
    confirmText="ยืนยัน"
    cancelText="ยกเลิก"
    variant="warning"
/>
```

### USE_GUARDED_UPDATE_USAGE
```tsx
// SOURCE: frontend/app/admin/requests/[id]/page.tsx:402 (etc.)
onClick={() => { void guardedUpdate({ status: 'ACKNOWLEDGED' }); }}
// useGuardedUpdate returns [submitting, guardedUpdate]; voiding the
// promise is the project convention for fire-and-forget PATCH from
// click handlers. Do NOT await directly inside onClick.
```

### MERGED_CARD_LAYOUT
```tsx
// NEW PATTERN (no existing exact mirror in codebase):
// Single outer card replacing 3 separate cards
<div className="bg-surface rounded-2xl shadow-sm border border-border-default mb-6">
    {/* Hero section */}
    <div className="p-4 md:p-5">
        {/* existing hero contents from page.tsx:336-524 — title row + subcategory */}
    </div>
    {/* Internal divider — semantic, matches border-default token */}
    <div className="border-t border-border-default" />
    {/* Tab nav section */}
    <div className="px-2 flex justify-center overflow-x-auto no-scrollbar">
        {/* existing tab buttons — drop rounded-t-2xl + border (parent owns them) */}
    </div>
    <div className="border-t border-border-default" />
    {/* Tab content section */}
    <div className="p-4 sm:p-6 md:p-8 min-h-[400px]">
        {/* existing tab content */}
    </div>
</div>
// REASON for two `border-t` dividers vs CSS `:nth-child` magic:
// explicit dividers are easier to reason about and survive accidental
// content reordering.
```

### E2E_DETAIL_NAVIGATION
```ts
// SOURCE: frontend/e2e/admin-requests-supervisor.spec.ts:29-37
async function getFirstRequestDetailUrl(page: Page): Promise<string | null> {
  const links = page.locator('a[href*="/admin/requests/"]')
  const count = await links.count()
  for (let i = 0; i < count; i++) {
    const href = await links.nth(i).getAttribute('href')
    if (href && /\/admin\/requests\/\d+$/.test(href)) return href
  }
  return null
}
// REUSE this exact helper (don't duplicate). Import or copy verbatim
// into the new revert spec.
```

### BACKEND_TEST_PATTERN
```python
# SOURCE: backend/tests/test_admin_requests_endpoints.py (existing reference)
# Use the same FastAPI TestClient + fixtures pattern when adding revert tests.
# Specifically: a seeded request in COMPLETED state, PATCH revert, assert
# response status + status field + audit_logs row count.
```

---

## Files to Change

| File | Action | Justification |
|---|---|---|
| `backend/app/api/v1/endpoints/admin_requests.py` | UPDATE | Add audit log call in `update_request` when status revert is detected; reset `completed_at = None` on revert from COMPLETED |
| `frontend/lib/constants/request-status.ts` | UPDATE | Extend `STATUS_TRANSITIONS.COMPLETED` from `[]` to `['AWAITING_APPROVAL', 'IN_PROGRESS']` so the documented state-machine map agrees with the new behavior (see Task 3.5) |
| `frontend/app/admin/requests/[id]/page.tsx` | UPDATE | (1) Drop COMPLETED from kebab visibility guard, (2) add 2 new DropdownMenuItem entries with ConfirmDialog wrappers, (3) restructure 3 cards into 1 merged card, (4) **add `ConfirmDialog` import** (verified missing in current file) |
| `frontend/e2e/admin-requests-supervisor.spec.ts` | UPDATE | Add 2-3 tests for revert flow (admin can revert / staff cannot / audit logged) |
| `backend/tests/test_admin_requests_endpoints.py` | UPDATE | Add unit tests: revert from COMPLETED writes audit_log + resets completed_at |
| `frontend/components/ui/Modal.tsx` (if needed) | — | No change expected — ConfirmDialog wraps Modal already |

## NOT Building

- **Backend `ALLOWED_TRANSITIONS` state machine guard** — out of scope; frontend gating + audit log is the contract for this PRD. Backend remains permissive.
- **Configurable RBAC for revert (`revert_approval` permission key)** — deferred to PRD C. This plan uses hardcoded `canApprove` (which already reflects supervisor tier).
- **"Reason" required field on revert** — defer until user feedback requests it. Audit log captures who/when/from/to which is sufficient for MVP accountability.
- **Backend retroactive audit log for prior status changes** — only NEW revert events get logged here. Pre-existing status changes are not back-filled.
- **Mobile-specific layout for the merged card** — preserve existing responsive padding (`p-4 sm:p-6 md:p-8`); do not introduce new breakpoints.
- **AssignModal redesign** (i18n toggle, confirm button) — PRD D.

---

## Step-by-Step Tasks

### Task 1: Backend — Detect revert-from-COMPLETED and write audit log
- **ACTION**: In `update_request`, before applying `update_data.status`, compute `is_revert_from_completed = (request.status == RequestStatus.COMPLETED and update_data.status in (RequestStatus.AWAITING_APPROVAL, RequestStatus.IN_PROGRESS))`. After applying the status update, if `is_revert_from_completed`, call `create_audit_log` and reset `request.completed_at = None`.
- **IMPLEMENT**:
  ```python
  # In backend/app/api/v1/endpoints/admin_requests.py update_request
  from app.core.audit import create_audit_log  # add to imports

  # Detect revert BEFORE mutating
  is_revert_from_completed = (
      update_data.status is not None
      and request.status == RequestStatus.COMPLETED
      and update_data.status in (
          RequestStatus.AWAITING_APPROVAL,
          RequestStatus.IN_PROGRESS,
      )
  )
  prior_status = request.status

  # ... existing field updates ...
  if update_data.status is not None:
      request.status = update_data.status
      if update_data.status == RequestStatus.COMPLETED:
          request.completed_at = func.now()
      elif is_revert_from_completed:
          request.completed_at = None  # symmetric reset

  # After applying mutations but BEFORE commit, log if revert
  if is_revert_from_completed:
      await create_audit_log(
          db=db,
          admin_id=current_admin.id,
          action="revert_approval",
          resource_type="service_request",
          resource_id=str(request.id),
          details={
              "from_status": prior_status.value,
              "to_status": update_data.status.value,
          },
      )
  ```
- **MIRROR**: `AUDIT_LOG_CALL`, `PATCH_ENDPOINT_UPDATE_FLOW`
- **IMPORTS**: `from app.core.audit import create_audit_log`
- **GOTCHA**: `create_audit_log` calls `db.flush()` but not `db.commit()`. The existing endpoint commits via context manager OR explicit `await db.commit()` — verify by re-reading lines 360-380. If there's no explicit commit and the dependency closes the session implicitly, the audit row will commit alongside the request mutation in the same transaction (which is what we want).
- **VALIDATE**: `cd backend && pytest tests/test_admin_requests_endpoints.py -k revert -v`

### Task 2: Backend — Unit tests for revert + audit log
- **ACTION**: Add test cases to `backend/tests/test_admin_requests_endpoints.py` covering: (a) PATCH revert from COMPLETED → AWAITING_APPROVAL writes one audit_log entry with correct payload + nulls `completed_at`, (b) same for IN_PROGRESS, (c) PATCH forward-only transitions (e.g. IN_PROGRESS → AWAITING_APPROVAL) do NOT write an audit_log row from the revert code path.
- **IMPLEMENT**: Match the existing FakeDB + dependency-override + sync TestClient pattern used by `test_create_comment_ignores_forged_user_id_query_param` (lines 13-77 of the same file). The plan-original async fixture style does NOT exist in this codebase — do not introduce it.

  **Step A — Extend `_FakeDB` to support `flush()`** (required because `app.core.audit.create_audit_log` calls `await db.flush()`):
  ```python
  class _FakeDB:
      def __init__(self) -> None:
          self.added: list = []
          self.committed = False
          self._fake_request = None  # caller populates before invoking handler

      async def execute(self, stmt):
          # Caller sets self._fake_request to a SimpleNamespace with the
          # fields the handler reads/mutates: id, status, completed_at, etc.
          return _FakeScalarResult(value=self._fake_request)

      def add(self, obj) -> None:
          self.added.append(obj)

      async def commit(self) -> None:
          self.committed = True

      async def refresh(self, obj) -> None:
          # The handler refreshes the request to read DB-generated columns;
          # tests can keep this as a no-op since they inject a fully-formed
          # fake request via execute().
          return None

      async def flush(self) -> None:
          # create_audit_log calls await db.flush() to get the row ID.
          # No-op in the fake — the AuditLog instance is already in
          # self.added, which is what we assert on.
          return None
  ```

  **Step B — Test case: revert COMPLETED → AWAITING_APPROVAL**:
  ```python
  from datetime import datetime, timezone
  from types import SimpleNamespace
  from fastapi.testclient import TestClient

  from app.api import deps
  from app.db.session import get_db as session_get_db
  from app.main import app
  from app.models.audit_log import AuditLog
  from app.models.service_request import RequestStatus
  from app.models.user import UserRole


  def test_revert_completed_to_awaiting_approval_logs_audit():
      fake_db = _FakeDB()
      fake_db._fake_request = SimpleNamespace(
          id=42,
          status=RequestStatus.COMPLETED,
          completed_at=datetime(2026, 5, 14, 12, 0, tzinfo=timezone.utc),
          priority="LOW",
          due_date=None,
          assigned_agent_id=None,
          assigned_by_id=None,
      )

      async def _override_get_db():
          yield fake_db

      async def _override_get_current_admin():
          return SimpleNamespace(
              id=7,
              username="real-admin",
              display_name="Real Admin",
              role=UserRole.ADMIN,
          )

      app.dependency_overrides[session_get_db] = _override_get_db
      app.dependency_overrides[deps.get_current_admin] = _override_get_current_admin

      client = TestClient(app)
      try:
          response = client.patch(
              "/api/v1/admin/requests/42",
              json={"status": "AWAITING_APPROVAL"},
          )
      finally:
          client.close()
          app.dependency_overrides.clear()

      assert response.status_code == 200
      assert fake_db.committed is True

      # The handler mutated the same object — verify the in-memory state
      assert fake_db._fake_request.status == RequestStatus.AWAITING_APPROVAL
      assert fake_db._fake_request.completed_at is None

      # Audit row landed in fake_db.added
      audit_rows = [obj for obj in fake_db.added if isinstance(obj, AuditLog)]
      assert len(audit_rows) == 1
      log = audit_rows[0]
      assert log.action == "revert_approval"
      assert log.resource_type == "service_request"
      assert log.resource_id == "42"
      assert log.admin_id == 7
      assert log.details == {
          "from_status": "COMPLETED",
          "to_status": "AWAITING_APPROVAL",
      }
  ```

  **Step C — Symmetric test for IN_PROGRESS** (same shape, different target):
  ```python
  def test_revert_completed_to_in_progress_logs_audit():
      # Identical setup as test above, but PATCH body is {"status": "IN_PROGRESS"}
      # and the details assertion uses "to_status": "IN_PROGRESS".
      # ... (omitted for brevity — copy from test above) ...
  ```

  **Step D — Negative test: forward transitions do NOT log**:
  ```python
  def test_forward_transition_does_not_log_revert_audit():
      """A normal IN_PROGRESS → AWAITING_APPROVAL via "ส่งอนุมัติ" should
      pass through the same endpoint without producing a revert_approval
      audit log row."""
      fake_db = _FakeDB()
      fake_db._fake_request = SimpleNamespace(
          id=43,
          status=RequestStatus.IN_PROGRESS,
          completed_at=None,
          priority="LOW",
          due_date=None,
          assigned_agent_id=None,
          assigned_by_id=None,
      )
      # ... (same overrides as test above) ...

      response = client.patch(
          "/api/v1/admin/requests/43",
          json={"status": "AWAITING_APPROVAL"},
      )

      assert response.status_code == 200
      audit_rows = [obj for obj in fake_db.added if isinstance(obj, AuditLog)]
      assert audit_rows == []  # no revert audit because not COMPLETED → x
  ```
- **MIRROR**: `BACKEND_TEST_PATTERN` — but specifically the FakeDB + dependency_overrides + sync TestClient pattern from `test_admin_requests_endpoints.py:13-77`.
- **IMPORTS** (top of file, alongside existing): `from app.models.audit_log import AuditLog`, `from app.models.service_request import RequestStatus`. The `from datetime import datetime, timezone` and `from types import SimpleNamespace` are already imported at lines 2-3.
- **GOTCHA**:
  - The existing `_FakeDB` class does **not** implement `flush()`, but `app.core.audit.create_audit_log` calls `await db.flush()`. **You must add the `flush` method** to `_FakeDB` (Step A) or all revert tests will raise `AttributeError`.
  - `_FakeDB.execute` originally returns `_FakeScalarResult(value=True)` — that's only enough to pass the `if not request` truthiness check. For the revert path the handler MUTATES `request.status` and `request.completed_at`, so `execute` must return a real-ish object (SimpleNamespace).
  - Do NOT introduce `pytest-asyncio` async test functions. The codebase convention is sync `def test_*` + `TestClient` (which handles the asyncio loop internally).
  - The shared `_FakeDB` instance lives across all tests in the file. Either give each test its own instance (current pattern) or ensure proper teardown — current tests use a fresh instance per test, follow that.
- **VALIDATE**: `cd backend && pytest tests/test_admin_requests_endpoints.py -k "revert" -v` — expect 3 tests pass.

### Task 3: Frontend — Expand kebab visibility to include COMPLETED
- **ACTION**: In `frontend/app/admin/requests/[id]/page.tsx` line 479, change the kebab guard from `canApprove && request.status !== 'COMPLETED' && request.status !== 'REJECTED'` to `canApprove && request.status !== 'REJECTED'`. Verify inner items (force-complete and revert-to-pending) keep their own status-based gating so they remain hidden on COMPLETED.
- **IMPLEMENT**:
  ```tsx
  {/* Before: line 479 */}
  {canApprove && request.status !== 'COMPLETED' && request.status !== 'REJECTED' && (

  {/* After: */}
  {canApprove && request.status !== 'REJECTED' && (
  ```
  Then verify force-complete (line 493-499) and revert-to-pending (line 503-511) keep their own conditions. Force-complete should add an outer status gate (it currently relies on the outer COMPLETED exclusion — add `request.status !== 'COMPLETED'` to its `disabled` OR wrap in `{request.status !== 'COMPLETED' && ...}`).
- **MIRROR**: `KEBAB_VISIBILITY_GUARD`
- **IMPORTS**: none new
- **GOTCHA**: Existing comment on line 491-492 says "Outer guard already excludes terminal states." That assumption breaks after this change — update the comment AND add a self-gate on force-complete: `{request.status !== 'COMPLETED' && <DropdownMenuItem ...>...</DropdownMenuItem>}`.
- **VALIDATE**: Manual — on COMPLETED, kebab opens; only the 2 new revert items are visible (no force-complete, no revert-to-pending).

### Task 3.5: Frontend — Update `STATUS_TRANSITIONS` constant
- **ACTION**: In `frontend/lib/constants/request-status.ts:75`, change `COMPLETED: []` to `COMPLETED: ['AWAITING_APPROVAL', 'IN_PROGRESS']` so the documented state-machine map reflects the new revert behavior.
- **IMPLEMENT**:
  ```ts
  // Before (line 75):
  COMPLETED:         [],

  // After:
  COMPLETED:         ['AWAITING_APPROVAL', 'IN_PROGRESS'],
  ```
- **MIRROR**: Existing entries in the same `STATUS_TRANSITIONS` map — same shape, alphabetical/logical ordering.
- **IMPORTS**: none new
- **GOTCHA**: `canTransition()` (declared lines 79-82) is currently defined but UNUSED across the codebase (verified via grep). The map is documentation-only today, but updating it keeps the source of truth honest. If a future PR enforces `canTransition` (e.g. disables backward buttons), our revert items will already pass the check. Do NOT add `canTransition` enforcement to the new kebab items in this PR — that would expand scope.
- **VALIDATE**: `cd frontend && npx tsc --noEmit` — the type narrowing on `RequestStatus[]` should accept the new entries; if it fails, the array typing is too strict and needs `as const` removal.

### Task 4: Frontend — Add two revert kebab items with ConfirmDialog
- **ACTION**: After the existing revert-to-pending item (line 511), add two new `<DropdownMenuItem>` entries gated by `request.status === 'COMPLETED'`. Each one opens a ConfirmDialog before calling `guardedUpdate`. Use a single shared `revertConfirm` state to track which target was clicked.
- **IMPLEMENT**:
  ```tsx
  // State (near top of component, alongside assignModalOpen):
  const [revertConfirm, setRevertConfirm] = useState<{
      open: boolean
      target: 'AWAITING_APPROVAL' | 'IN_PROGRESS' | null
  }>({ open: false, target: null })

  // New items inside DropdownMenuContent, after revert-to-pending:
  {request.status === 'COMPLETED' && (
      <>
          <DropdownMenuItem
              disabled={submitting}
              onClick={() => setRevertConfirm({ open: true, target: 'AWAITING_APPROVAL' })}
          >
              <Undo2 size={16} className="text-amber-600" />
              ยกเลิกอนุมัติ → รออนุมัติ
          </DropdownMenuItem>
          <DropdownMenuItem
              disabled={submitting}
              onClick={() => setRevertConfirm({ open: true, target: 'IN_PROGRESS' })}
          >
              <Undo2 size={16} className="text-amber-600" />
              ยกเลิกอนุมัติ → กำลังดำเนินการ
          </DropdownMenuItem>
      </>
  )}

  // ConfirmDialog rendered alongside other top-level dialogs (e.g. after AssignModal):
  <ConfirmDialog
      isOpen={revertConfirm.open}
      onClose={() => setRevertConfirm({ open: false, target: null })}
      onConfirm={() => {
          if (revertConfirm.target) {
              void guardedUpdate({ status: revertConfirm.target })
          }
          setRevertConfirm({ open: false, target: null })
      }}
      title="ยืนยันยกเลิกการอนุมัติ"
      description={
          <>
              คำร้องจะกลับไปสถานะ{' '}
              <b>
                  {revertConfirm.target === 'AWAITING_APPROVAL'
                      ? 'รออนุมัติ'
                      : revertConfirm.target === 'IN_PROGRESS'
                      ? 'กำลังดำเนินการ'
                      : ''}
              </b>
              <br />
              <span className="text-xs text-amber-600 mt-2 block">
                  การกระทำนี้จะถูกบันทึกในประวัติ
              </span>
          </>
      }
      confirmText="ยืนยัน"
      cancelText="ยกเลิก"
      variant="warning"
  />
  ```
- **MIRROR**: `KEBAB_DROPDOWN_ITEM`, `CONFIRM_DIALOG_REACTNODE`, `USE_GUARDED_UPDATE_USAGE`
- **IMPORTS**: **Add `import { ConfirmDialog } from '@/components/ui/ConfirmDialog'`** (verified missing in current page.tsx — line 31 imports `AssignModal` but not `ConfirmDialog`). `Undo2` from `lucide-react` is already imported at line 29 — no addition needed.
- **GOTCHA**: The two items must be guarded by `request.status === 'COMPLETED'` even though the outer kebab is now visible on COMPLETED. The other inner items (force-complete, revert-to-pending) are non-COMPLETED gates — keep them separate. Avoid wrapping with a single status switch — readability beats DRY here.
- **VALIDATE**: Manual — admin sees both items on COMPLETED, no items on non-COMPLETED open states (force-complete/revert-to-pending appear instead).

### Task 5: Frontend — Merge hero, tab nav, tab content into a single card
- **ACTION**: In `frontend/app/admin/requests/[id]/page.tsx`, wrap the three existing containers (hero `:335`, tab nav `:528`, tab content `:545`) in a single outer `<div>` with `bg-surface rounded-2xl shadow-sm border border-border-default mb-6`. Strip the rounded/border/background classes from the inner three divs and add `border-t border-border-default` dividers between sections. Preserve all inner content layout (hero's flex row, tab buttons, tab content) untouched.
- **IMPLEMENT**:
  ```tsx
  {/* Outer merged card */}
  <div className="bg-surface rounded-2xl shadow-sm border border-border-default mb-6">

      {/* Hero section — kept structurally identical, just drops outer chrome */}
      <div className="p-4 md:p-5">
          {/* existing children of the OLD hero div: lines 336-524 */}
      </div>

      <div className="border-t border-border-default" />

      {/* Tab nav section */}
      <div className="px-2 flex justify-center overflow-x-auto no-scrollbar">
          {/* existing tab buttons map from lines 529-541 */}
      </div>

      <div className="border-t border-border-default" />

      {/* Tab content section */}
      <div className="p-4 sm:p-6 md:p-8 min-h-[400px]">
          {/* existing tab content from line 547+ */}
      </div>
  </div>
  ```
  Remove the `mb-6` from the OLD hero div (now on outer); remove `rounded-2xl shadow-sm border border-border-default` from OLD hero; remove `bg-surface rounded-t-2xl border border-border-default` from OLD tab nav; remove `bg-surface rounded-b-2xl shadow-sm border-x border-b border-border-default` from OLD tab content.
- **MIRROR**: `MERGED_CARD_LAYOUT`
- **IMPORTS**: none new
- **GOTCHA**: PR #53 ("Linear-inspired hero card") gave the hero its own visual weight via the standalone card. The MERGE preserves the hero's INTERNAL layout (single flex row with title + badges + actions + kebab). What changes is only the OUTER chrome. Visual regression risk: ensure the title row's spacing still feels balanced when the card extends below — adjust `p-4 md:p-5` if needed but DO NOT touch the inner flex row's gap classes.
- **VALIDATE**: Visual — viewport 320 / 768 / 1440 all show a single card with internal dividers. No accidental double borders. Hero row still wraps cleanly on mobile.

### Task 6: E2E — Playwright tests for revert flow
- **ACTION**: Add to `frontend/e2e/admin-requests-supervisor.spec.ts` a new `test.describe('Revert from COMPLETED')` block with 3 tests: (a) supervisor sees both revert items on a COMPLETED request, (b) clicking + confirming reverts the status (verify via subsequent page state — status badge text changes), (c) cancelling the confirm dialog does NOT mutate status. If the seed doesn't have a COMPLETED request, skip with a clear message (use the same `test.skip(true, ...)` pattern PR #54's spec adopted post-review).
- **IMPLEMENT**:
  ```ts
  // GOTCHA UPDATE: the list page's filter is React state, NOT URL-synced
  // (page.tsx:102-130 — `filter.status` reads from useState, no
  // useSearchParams). Going to `/admin/requests?status=COMPLETED`
  // would NOT pre-apply the filter. Instead, drive the filter dropdown
  // through the UI to find a COMPLETED row.

  async function getFirstCompletedRequestUrl(page: Page): Promise<string | null> {
      // 1. Navigate to the list and wait for it to render
      await page.goto('/admin/requests')
      await expect(page.locator('table')).toBeVisible({ timeout: 10_000 })

      // 2. Select "เสร็จสิ้น" (COMPLETED) in the status filter dropdown
      //    The list page renders a <Select> primitive with each status
      //    label as an <option>. Use selectOption with the literal
      //    value to avoid coupling to display strings.
      const statusSelect = page.locator('select').first()
      // Try the value the API expects (matches STATUS_OPTIONS in
      // request-status.ts:60). If the select uses label rather than value,
      // fall through to the label.
      try {
          await statusSelect.selectOption('COMPLETED')
      } catch {
          await statusSelect.selectOption({ label: 'เสร็จสิ้น' })
      }

      // 3. Wait for the table to refetch — table may briefly show a
      //    skeleton or stay empty if no COMPLETED rows exist.
      //    Give the network ~2s before declaring "no rows".
      await page.waitForTimeout(500)

      // 4. Reuse the top-of-file helper to find a detail link in the
      //    now-filtered table.
      return getFirstRequestDetailUrl(page)
  }

  test.describe('Revert from COMPLETED', () => {
      test.beforeEach(async ({ page }) => {
          await loginAsAdmin(page)
      })

      test('supervisor sees both revert items on COMPLETED', async ({ page }) => {
          const url = await getFirstCompletedRequestUrl(page)
          if (!url) {
              test.skip(true, 'No COMPLETED request in test DB')
              return
          }
          await page.goto(url)
          await page.getByRole('button', { name: 'การจัดการพิเศษ' }).click()
          await expect(page.getByText('ยกเลิกอนุมัติ → รออนุมัติ')).toBeVisible()
          await expect(page.getByText('ยกเลิกอนุมัติ → กำลังดำเนินการ')).toBeVisible()
      })

      test('cancelling the dialog leaves the status untouched', async ({ page }) => {
          // Run THIS test BEFORE the mutating one below so the COMPLETED
          // row is still available.
          const url = await getFirstCompletedRequestUrl(page)
          if (!url) {
              test.skip(true, 'No COMPLETED request in test DB')
              return
          }
          await page.goto(url)
          await page.getByRole('button', { name: 'การจัดการพิเศษ' }).click()
          await page.getByText('ยกเลิกอนุมัติ → กำลังดำเนินการ').click()
          await page.getByRole('button', { name: 'ยกเลิก' }).click()
          // Status should still be COMPLETED-flavoured
          await expect(page.locator('text=เสร็จสิ้น').first()).toBeVisible()
      })

      test('clicking and confirming reverts to AWAITING_APPROVAL', async ({ page }) => {
          // ORDER MATTERS: this test mutates the test DB. Keep it LAST.
          const url = await getFirstCompletedRequestUrl(page)
          if (!url) {
              test.skip(true, 'No COMPLETED request in test DB')
              return
          }
          await page.goto(url)
          await page.getByRole('button', { name: 'การจัดการพิเศษ' }).click()
          await page.getByText('ยกเลิกอนุมัติ → รออนุมัติ').click()
          await page.getByRole('button', { name: 'ยืนยัน' }).click()
          await expect(page.locator('text=รออนุมัติ').first()).toBeVisible({ timeout: 5_000 })
      })
  })
  ```
- **MIRROR**: `E2E_DETAIL_NAVIGATION` for the inner href scan, and the post-PR-#54 `test.skip(true, ...) + early return` pattern from `admin-requests-polish.spec.ts`.
- **IMPORTS**: existing imports cover `expect`, `test`, `Page`, `loginAsAdmin`. No new imports needed — `selectOption` is a method on `Locator`.
- **GOTCHA**:
  - The list page filter is React state — `goto('/admin/requests?status=COMPLETED')` does NOT apply the filter. **Use the dropdown UI**.
  - `selectOption('COMPLETED')` assumes the `<select>` options use status values. If the codebase uses labels for option values, the inner `try/catch` falls back to `{ label: 'เสร็จสิ้น' }` — confirm during implementation by inspecting the rendered `<select>` element.
  - Tests run in file order by default. The mutating test (last) transitions the seed row to AWAITING_APPROVAL — subsequent reruns of the suite need fresh COMPLETED data OR the suite re-creates a COMPLETED row in a setup hook (out of scope for this PRD — accept the one-shot mutation).
  - `page.waitForTimeout(500)` is a small bandage for the refetch — if Playwright is flaky here, swap for `page.waitForResponse(/admin\/requests/)` to wait on the actual fetch.
- **VALIDATE**: `cd frontend && npm run test:e2e -- admin-requests-supervisor.spec.ts` (locally with seeded DB) or rely on CI Playwright Smoke.

### Task 7: Local validation pass
- **ACTION**: Run all validation commands listed in the Validation Commands section. Address any failures before moving to commit.
- **IMPLEMENT**: see Validation Commands section.
- **MIRROR**: n/a — operational task.
- **IMPORTS**: n/a
- **GOTCHA**: Backend tests need Postgres + Redis running. If Docker isn't up, document the failure and rely on CI for backend test verification. Frontend type-check / lint / unit tests run without external dependencies and should pass locally.
- **VALIDATE**: All commands return non-zero for genuine failures only.

---

## Testing Strategy

### Backend Unit Tests (Task 2)

| Test | Input | Expected Output | Edge Case? |
|---|---|---|---|
| Revert COMPLETED → AWAITING_APPROVAL writes audit log | PATCH `/admin/requests/{id}` with `{status: "AWAITING_APPROVAL"}` on a COMPLETED row | 200; status="AWAITING_APPROVAL"; `completed_at` is null; 1 new `audit_logs` row with `action="revert_approval"`, `details={"from_status":"COMPLETED","to_status":"AWAITING_APPROVAL"}` | No (happy path) |
| Revert COMPLETED → IN_PROGRESS writes audit log | same with `{status: "IN_PROGRESS"}` | symmetric: 200; status="IN_PROGRESS"; `completed_at` null; 1 audit row | No |
| Forward IN_PROGRESS → AWAITING_APPROVAL does NOT log | PATCH from IN_PROGRESS to AWAITING_APPROVAL | 200; no `revert_approval` audit row created | Yes — not a revert; must NOT log via this code path |
| Forward PENDING → ACKNOWLEDGED does NOT log | PATCH from PENDING to ACKNOWLEDGED | 200; no audit row from revert path | Yes — sanity |
| Revert to invalid status fails or no-ops | PATCH from COMPLETED to PENDING via API | Either rejected or logs as a non-revert change — match existing semantics | Yes — current backend has no guard, so this will pass through; explicitly assert audit row content doesn't have "revert_approval" action |

### Frontend E2E (Task 6)

| Test | Expected Behavior |
|---|---|
| Supervisor sees both revert items on COMPLETED | Both menu items visible |
| Cancel keeps status | Status badge unchanged after dialog dismissal |
| Confirm reverts | Status badge updates to target state |

### Edge Cases Checklist

- [ ] **COMPLETED → AWAITING_APPROVAL → COMPLETED → revert again**: idempotency. Each revert writes its own audit log.
- [ ] **Concurrent reverts**: two admins click revert nearly simultaneously. Last-writer-wins on status. Both audit rows exist (no dedup). Acceptable.
- [ ] **Network failure mid-PATCH**: `useGuardedUpdate` keeps `submitting` true and shows toast. Audit row should NOT exist if PATCH errored (transaction rollback).
- [ ] **Non-admin loads URL directly**: kebab is hidden because `canApprove` is false. No revert possible from UI. Backend would still accept the PATCH if hit directly (current contract) — that's a known limitation, mitigated by audit log.
- [ ] **`completed_at` null on revert**: verified via Task 2 test (b).
- [ ] **Mobile viewport (320px)**: merged card layout doesn't overflow. Internal dividers visible.
- [ ] **Dark mode**: merged card uses `border-border-default` which has dark-mode token; verify no contrast issues.

---

## Validation Commands

### Static Analysis

```bash
# Backend type check (mypy/ruff if configured) — skip if not in CI flow
cd backend && ruff check app/ 2>&1 | tail -20

# Frontend type check
cd frontend && npx tsc --noEmit 2>&1 | tail -10
```
EXPECT: Zero errors (frontend); ruff may have project-wide noise — focus on the lines we changed.

### Lint

```bash
# Frontend lint on changed files
cd frontend && npx eslint app/admin/requests/\[id\]/page.tsx e2e/admin-requests-supervisor.spec.ts 2>&1 | tail -10
```
EXPECT: Zero errors on changed files.

### Backend Unit Tests

```bash
cd backend && pytest tests/test_admin_requests_endpoints.py -k "revert or audit" -v 2>&1 | tail -30
```
EXPECT: All revert + audit tests pass.

### Frontend E2E (local — optional, CI is canonical)

```bash
cd frontend && npm run test:e2e -- admin-requests-supervisor.spec.ts 2>&1 | tail -40
```
EXPECT: Pre-existing tests stay green; 3 new tests pass or skip (if no COMPLETED seed).

### Full Backend Test Suite

```bash
cd backend && pytest tests/ 2>&1 | tail -10
```
EXPECT: No regressions.

### Browser Validation (manual)

1. Start dev server: `docker-compose up -d db redis && cd backend && python run.py --target local`
2. Start frontend: `cd frontend && npm run dev`
3. Login as admin → go to a COMPLETED request
4. Verify: kebab visible → click → 2 revert items show
5. Click "ยกเลิกอนุมัติ → รออนุมัติ" → ConfirmDialog opens with warning copy → confirm → status updates → no console errors
6. Reload page → status remains as expected → query `audit_logs` table → row exists with correct payload
7. Verify merged card visually on 3 viewports (320 / 768 / 1440)

### Manual Validation Checklist

- [ ] Backend test pass for revert audit cases
- [ ] Frontend kebab shows 2 new items only on COMPLETED
- [ ] ConfirmDialog opens with warning variant
- [ ] PATCH writes audit_log row with correct shape
- [ ] `completed_at` nulled on revert
- [ ] Merged card visually unified on all breakpoints
- [ ] No regression on PR #54 polish (button widths, copy, etc.)
- [ ] E2E tests pass on CI

---

## Acceptance Criteria

- [ ] All 7 tasks completed
- [ ] All validation commands pass (or are documented as deferred to CI with reason)
- [ ] Backend tests added for both revert directions + 2 negative cases
- [ ] E2E tests added for both transitions + cancel
- [ ] No type errors
- [ ] No lint errors on changed files
- [ ] Hero card retains PR #53 Linear-inspired internal layout
- [ ] Audit log entries written for every revert (manually verified once)

## Completion Checklist

- [ ] Code follows existing patterns (audit log call shape, kebab item structure, ConfirmDialog ReactNode pattern)
- [ ] Error handling: `useGuardedUpdate` already catches; no new try/catch needed
- [ ] Logging: audit_log only (no application logger.info added — would be redundant)
- [ ] Tests follow existing pytest fixtures + Playwright helper patterns
- [ ] No hardcoded status strings in tests (use `RequestStatus.COMPLETED.value`)
- [ ] Documentation updated: PRD B phase statuses bumped to `complete` after merge
- [ ] No unnecessary scope additions
- [ ] Self-contained — no questions needed during implementation

---

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| ~~`db.commit()` boundary in `update_request` is implicit~~ | ~~M~~ | ~~M~~ | **RESOLVED Round 1 (2026-05-15)**: `admin_requests.py:372` calls `await db.commit()` explicitly. Audit row + status update commit atomically — both roll back together on error. No mitigation needed. |
| ~~Backend test pattern mismatch (Task 2)~~ | ~~H~~ | ~~M~~ | **RESOLVED Round 2 (2026-05-15)**: Task 2 rewritten to use FakeDB + dependency_overrides + sync TestClient. Plan now includes the `_FakeDB.flush()` extension required by `create_audit_log`. |
| ~~E2E `?status=COMPLETED` URL filter assumption (Task 6)~~ | ~~H~~ | ~~M~~ | **RESOLVED Round 2 (2026-05-15)**: helper rewritten to drive the filter dropdown UI instead of relying on URL params. Fallback path tries both value and label selection. |
| Hero merge subtly breaks PR #53 Linear hero layout (e.g. background shifts, padding changes) | M | M | Side-by-side visual diff; preserve `p-4 md:p-5` on hero section; the inner flex row's structure stays identical |
| E2E seed doesn't have COMPLETED row → revert tests always skip | M | L | Document in PR body; add seed fixture or run on staging snapshot before merging |
| Force-complete kebab item leaks onto COMPLETED state after widening visibility guard | L | L | Task 3 GOTCHA covers this — must add `request.status !== 'COMPLETED'` self-gate on force-complete |
| Backend has no `ALLOWED_TRANSITIONS` guard, so a malicious client could revert without UI gate | L | L | Audit log captures admin_id of every revert; documented as known limitation; PRD C will add `revert_approval` permission_settings key |
| Mobile users hit narrower modal/merged card and dividers feel awkward | L | L | Visual QA on 320px viewport; if needed, drop dividers on `< sm` breakpoint via `hidden sm:block` |

## Notes

- This plan consolidates all 6 PRD phases into a single implementation pass because the work is tightly coupled (audit log infra → backend revert → frontend kebab → E2E test) and fits in one PR.
- The hero merge (PRD Phase 4) is parallel-safe with kebab additions (Phase 3) — they touch different sections of the same file but no overlapping lines.
- After merge: PRD C ("Configurable Workflow Permissions") will replace the hardcoded `canApprove` gate on the new revert items with a `revert_approval` permission key reading from `permission_settings`. The kebab item code structure will not need to change — only the visibility condition.
- The `details` payload of the audit log is intentionally minimal (`from_status`, `to_status`). If future PRDs need more (e.g. `reason`, `ip`), the JSONB column accommodates additive fields without migration.
- Consider follow-up: a "View audit log" link in the kebab menu so admin can see who reverted what. Out of scope for this PRD — file as future improvement.
