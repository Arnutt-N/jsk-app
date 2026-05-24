# Plan: AssignModal Improvements (PRD D)

## Summary
เพิ่ม confirm dialog ก่อน assign/reassign, เปลี่ยน label เป็นภาษาไทย, เพิ่มปุ่มถอนการมอบหมาย (unassign), และรองรับการเปลี่ยนผู้รับผิดชอบใน AssignModal โดยไม่มี regression ใน assign flow เดิม

## User Story
As a supervisor (ADMIN/DIRECTOR/HEAD), I want to confirm before assigning/reassigning, unassign when needed, and see Thai labels, so that I can manage assignments without accidental changes.

## Problem → Solution
- **Before**: AssignModal กด "เลือก" แล้ว assign ทันทีโดยไม่ถามยืนยัน — label "Workload: X tasks" เป็น English — ไม่มีทางถอนการมอบหมาย
- **After**: Confirm step ก่อน assign/reassign — label ภาษาไทย "งานที่รับผิดชอบ: X งาน" — ปุ่ม "ถอนการมอบหมาย" พร้อม confirm dialog

## Metadata
- **Complexity**: Medium
- **Source PRD**: `.claude/PRPs/prds/assign-modal-improvements.prd.md`
- **PRD Phase**: All phases (1+2+3)
- **Estimated Files**: 5 (3 source + 1 test + 1 permission)

---

## UX Design

### Before
```
┌──────────────────────────────────┐
│  มอบหมายงาน              [x]     │
├──────────────────────────────────┤
│ [🔍 ค้นหาเจ้าหน้าที่...]          │
│ ┌──────────────────────────────┐ │
│ │ 👤 สมชาย   Workload: 3 tasks │ │
│ │            [เลือก]            │ │
│ └──────────────────────────────┘ │
│ ┌──────────────────────────────┐ │
│ │ 👤 สมหญิง  Workload: 7 tasks │ │
│ │            [เลือก]            │ │
│ └──────────────────────────────┘ │
│                         [ปิด]   │
└──────────────────────────────────┘
```

### After
```
┌──────────────────────────────────┐
│  มอบหมายงาน              [x]     │
├──────────────────────────────────┤
│ [🔍 ค้นหาเจ้าหน้าที่...]          │
│ ┌──────────────────────────────┐ │
│ │ 👤 สมชาย   งานที่รับผิดชอบ: 3│ │
│ │            [เลือก]            │ │
│ └──────────────────────────────┘ │
│                                  │
│ ┌──────────────────────────────┐ │
│ │ ⚠️ ยืนยันการมอบหมาย          │ │
│ │ มอบหมายให้: สมชาย            │ │
│ │ [ยกเลิก] [ยืนยัน]             │ │
│ └──────────────────────────────┘ │
│                         [ปิด]   │
└──────────────────────────────────┘
```

### After (Reassign case)
```
┌──────────────────────────────────┐
│  มอบหมายงาน              [x]     │
├──────────────────────────────────┤
│ ...                              │
│ ┌──────────────────────────────┐ │
│ │ ⚠️ ยืนยันการเปลี่ยนผู้รับผิดชอบ│ │
│ │ จาก: สมหญิง → สมชาย           │ │
│ │ [ยกเลิก] [ยืนยัน]             │ │
│ └──────────────────────────────┘ │
└──────────────────────────────────┘
```

### Interaction Changes
| Touchpoint | Before | After | Notes |
|---|---|---|---|
| AssignModal "เลือก" button | Assigns immediately | Sets pending agent, shows inline confirm | No modal-on-modal |
| AssignModal label | "Workload: X tasks" | "งานที่รับผิดชอบ: X งาน" | Thai only |
| Request detail manage tab | No unassign option | "ถอนการมอบหมาย" button next to assignment field | Only when `canApprove && assigned` |
| Backend PATCH | `assigned_agent_id=null` ignored | `unassign: true` clears the field | New field in RequestUpdate |

---

## Mandatory Reading

| Priority | File | Lines | Why |
|---|---|---|---|
| P0 | `frontend/components/admin/AssignModal.tsx` | 1-150 | Component to modify |
| P0 | `frontend/app/admin/requests/[id]/page.tsx` | 289-295, 866-925 | Assignment handler + manage tab |
| P0 | `backend/app/api/v1/endpoints/admin_requests.py` | 317-415 | PATCH endpoint with bug |
| P1 | `frontend/components/ui/ConfirmDialog.tsx` | 1-99 | Pattern for confirm dialogs |
| P1 | `frontend/components/ui/Button.tsx` | 1-195 | Button variants and props |
| P1 | `backend/app/core/permissions.py` | 1-230 | Permission system |
| P2 | `backend/tests/test_admin_requests_endpoints.py` | 1-255 | Test patterns |

---

## Patterns to Mirror

### MODAL_WRAPPER
```tsx
// SOURCE: frontend/components/ui/Modal.tsx:1-164
<Modal isOpen={isOpen} onClose={onClose} title="มอบหมายงาน" maxWidth="md">
  <div className="space-y-4">
    {/* content */}
  </div>
</Modal>
```

### CONFIRM_DIALOG
```tsx
// SOURCE: frontend/components/ui/ConfirmDialog.tsx:51-89
<Modal isOpen={isOpen} onClose={onClose} maxWidth="sm" showCloseButton={false}>
  <div className="flex flex-col items-center text-center">
    <div className="...iconBg...">{icon}</div>
    <h3 className="text-lg font-semibold text-text-primary mb-2">{title}</h3>
    <p className="text-sm text-text-secondary mb-6">{description}</p>
    <div className="flex gap-3 w-full">
      <Button variant="outline" className="flex-1" onClick={onClose} disabled={isLoading}>
        {cancelText}
      </Button>
      <Button variant={confirmVariant} className="flex-1" onClick={onConfirm} isLoading={isLoading}>
        {confirmText}
      </Button>
    </div>
  </div>
</Modal>
```

### BUTTON_VARIANTS
```tsx
// SOURCE: frontend/components/ui/Button.tsx:1-195
// Variants: primary | secondary | outline | ghost | soft | danger | success | warning | link
// Sizes: xs | sm | md | lg | xl | icon-sm | icon | icon-lg
// Props: isLoading, disabled, leftIcon, rightIcon
<Button variant="primary" size="sm" isLoading={loading} onClick={handler}>
  เลือก
</Button>
```

### AGENT_ROW_LAYOUT
```tsx
// SOURCE: frontend/components/admin/AssignModal.tsx:102-139
<div className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
  currentAssigneeId === agent.id
    ? 'bg-brand-50 border-brand-200 ring-1 ring-brand-200'
    : 'bg-surface border-border-default hover:border-brand-200 hover:shadow-sm'
}`}>
  <div className="flex items-center gap-3">
    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm ${
      currentAssigneeId === agent.id ? 'bg-brand-500 text-white' : 'bg-muted text-text-tertiary'
    }`}>
      {agent.display_name[0]}
    </div>
    <div>
      <p className={`text-sm font-bold ${currentAssigneeId === agent.id ? 'text-brand-700' : 'text-text-primary'}`}>
        {agent.display_name}
        {currentAssigneeId === agent.id && <span className="ml-2 text-[10px] bg-brand-200 text-brand-700 px-1.5 py-0.5 rounded-full">Current</span>}
      </p>
      {/* workload badge */}
    </div>
  </div>
  <Button size="sm" variant={...} disabled={...} onClick={() => handleAssign(agent)} isLoading={...}>
    {currentAssigneeId === agent.id ? 'มอบหมายอยู่' : 'เลือก'}
  </Button>
</div>
```

### ASSIGNMENT_TRIGGER_DIV
```tsx
// SOURCE: frontend/app/admin/requests/[id]/page.tsx:872-880
<div
  onClick={() => setAssignModalOpen(true)}
  className={`w-full px-4 py-2.5 bg-bg border border-border-default rounded-lg text-sm cursor-pointer hover:bg-bg transition-colors flex justify-between items-center ${
    request.assignee_name ? 'font-bold text-text-primary' : 'font-medium text-text-tertiary'
  }`}
>
  <span>{request.assignee_name || "ยังไม่ได้มอบหมาย"}</span>
  <Settings2 size={16} className="text-text-tertiary" />
</div>
```

### BACKEND_PATCH_ENDPOINT
```python
# SOURCE: backend/app/api/v1/endpoints/admin_requests.py:317-415
class RequestUpdate(BaseModel):
    status: Optional[RequestStatus] = None
    priority: Optional[str] = None
    due_date: Optional[datetime] = None
    assigned_agent_id: Optional[int] = None
    assigned_by_id: Optional[int] = None

@router.patch("/{request_id}", response_model=ServiceRequestResponse)
async def update_request(...):
    # ... permission check on line 348 ...
    if update_data.assigned_agent_id is not None:
        request.assigned_agent_id = update_data.assigned_agent_id
        if update_data.assigned_agent_id != current_admin.id:
            request.assigned_by_id = current_admin.id
```

### PERMISSION_CHECK
```python
# SOURCE: backend/app/core/permissions.py:217-222
def can_assign(role: UserRole | str | None) -> bool:
    return _check(role, KEY_ASSIGN)

def can_self_assign(role: UserRole | str | None) -> bool:
    return _check(role, KEY_SELF_ASSIGN)
```

### TEST_PATTERN
```python
# SOURCE: backend/tests/test_admin_requests_endpoints.py:1-255
class _FakeDB:
    def __init__(self) -> None:
        self.added = []
        self.committed = False
        self._fake_request = None
    async def execute(self, stmt):
        if self._fake_request is not None:
            return _FakeScalarResult(value=self._fake_request)
        return _FakeScalarResult(value=True)

def _patch_admin_overrides(fake_db: _FakeDB):
    async def _override_get_db(): yield fake_db
    async def _override_get_current_admin():
        return SimpleNamespace(id=7, username="real-admin", display_name="Real Admin", role=UserRole.ADMIN)
    app.dependency_overrides[session_get_db] = _override_get_db
    app.dependency_overrides[deps.get_current_admin] = _override_get_current_admin
    def teardown(): app.dependency_overrides.clear()
    return teardown

# Usage:
# client = TestClient(app)
# try:
#     response = client.patch("/api/v1/admin/requests/42", json={...})
# finally:
#     client.close(); teardown()
```

---

## Files to Change

| File | Action | Justification |
|---|---|---|
| `frontend/components/admin/AssignModal.tsx` | UPDATE | Confirm step + Thai label |
| `frontend/app/admin/requests/[id]/page.tsx` | UPDATE | Unassign button + handler |
| `backend/app/api/v1/endpoints/admin_requests.py` | UPDATE | Add `unassign` field + handler |
| `backend/app/core/permissions.py` | UPDATE | Add `can_unassign` helper + KEY_UNASSIGN |
| `backend/tests/test_admin_requests_endpoints.py` | UPDATE | Add unassign test |

## NOT Building

- **Multi-assign** — ยังคง 1 request = 1 assignee
- **Assign history / audit trail สำหรับ unassign** — ใช้ audit_log ที่มีอยู่แล้ว
- **Notification เมื่อ unassign** — ไม่ส่ง LINE/Telegram
- **Modal-on-modal** — confirm เป็น inline ใน AssignModal เดิม

---

## Step-by-Step Tasks

### Task 1: Thai label in AssignModal
- **ACTION**: เปลี่ยน label "Workload: X tasks" เป็น "งานที่รับผิดชอบ: X งาน"
- **IMPLEMENT**: 
  ที่ `frontend/components/admin/AssignModal.tsx` line 123:
  ```tsx
  // BEFORE:
  Workload: {agent.active_tasks} tasks
  // AFTER:
  งานที่รับผิดชอบ: {agent.active_tasks} งาน
  ```
- **MIRROR**: MIRROR: AGENT_ROW_LAYOUT (line 123)
- **IMPORTS**: ไม่ต้องเพิ่ม
- **GOTCHA**: อย่าเปลี่ยนชื่อ prop `active_tasks` — แค่เปลี่ยน display text
- **VALIDATE**: Build frontend (`npm run build`) แล้วตรวจสอบว่าไม่มี "Workload" หลงเหลือในไฟล์

### Task 2: Inline confirm step in AssignModal
- **ACTION**: เพิ่ม confirm step ก่อน call `onAssign` — inline ใน modal (ไม่ใช้ ConfirmDialog component แยก)
- **IMPLEMENT**:
  1. เพิ่ม state `pendingAgent` ที่ `AssignModal.tsx` line 33:
     ```tsx
     const [pendingAgent, setPendingAgent] = useState<Agent | null>(null);
     ```
  2. แก้ `handleAssign` (line 57-62) ให้ set pending แทน assign ทันที:
     ```tsx
     const handleSelect = (agent: Agent) => {
         setPendingAgent(agent);
     };
     ```
  3. เพิ่ม `handleConfirm` ที่ call `onAssign` จริง:
     ```tsx
     const handleConfirm = async () => {
         if (!pendingAgent) return;
         setAssigningId(pendingAgent.id);
         await onAssign(pendingAgent.id, pendingAgent.display_name);
         setAssigningId(null);
         setPendingAgent(null);
         onClose();
     };
     ```
  4. เพิ่ม `handleCancelConfirm`:
     ```tsx
     const handleCancelConfirm = () => {
         setPendingAgent(null);
     };
     ```
  5. แก้ปุ่ม "เลือก" ให้ call `handleSelect` แทน:
     ```tsx
     onClick={() => handleSelect(agent)}
     ```
  6. เพิ่ม confirm panel หลัง agent list (หลัง div ปิดที่ line 141, ก่อน div `flex justify-end` ที่ line 143):
     ```tsx
     {pendingAgent && (
         <div className="border-t border-border-default pt-4 mt-2">
             <div className="bg-warning/5 border border-warning/20 rounded-xl p-4">
                 <p className="text-sm font-semibold text-text-primary mb-3">
                     {currentAssigneeId
                         ? `เปลี่ยนผู้รับผิดชอบจาก ${agents.find(a => a.id === currentAssigneeId)?.display_name || 'เดิม'} เป็น ${pendingAgent.display_name}?`
                         : `มอบหมายงานให้ ${pendingAgent.display_name}?`}
                 </p>
                 <div className="flex gap-2 justify-end">
                     <Button variant="outline" size="sm" onClick={handleCancelConfirm} disabled={assigningId !== null}>
                         ยกเลิก
                     </Button>
                     <Button variant="warning" size="sm" onClick={handleConfirm} isLoading={assigningId === pendingAgent.id}>
                         ยืนยัน
                     </Button>
                 </div>
             </div>
         </div>
     )}
     ```
  7. ปิด modal แล้ว reset state:
     ```tsx
     useEffect(() => {
         if (!isOpen) {
             setPendingAgent(null);
             setAssigningId(null);
             setSearch('');
         }
     }, [isOpen]);
     ```
- **MIRROR**: MIRROR: MODAL_WRAPPER, BUTTON_VARIANTS
- **IMPORTS**: ไม่ต้องเพิ่ม (ใช้ Button ที่ import แล้ว)
- **GOTCHA**: 
  - ต้องหา current assignee name จาก `agents` array (อาจยังไม่ load เสร็จ) — fallback เป็น "เดิม"
  - ปิด modal ต้อง reset `pendingAgent` ไม่เช่นนั้นเปิดใหม่จะยังเห็น confirm panel
  - ใช้ `variant="warning"` สำหรับ confirm button (เหมือน ConfirmDialog)
- **VALIDATE**: 
  - กด "เลือก" → แสดง confirm panel
  - กด "ยกเลิก" → confirm panel หาย
  - กด "ยืนยัน" → call API → modal ปิด
  - กด "ปิดหน้าต่าง" → modal ปิด → เปิดใหม่ confirm panel ไม่แสดง

### Task 3: Backend unassign support
- **ACTION**: เพิ่ม `unassign: bool = False` field ใน `RequestUpdate` schema และ handle ใน PATCH endpoint
- **IMPLEMENT**:
  1. ที่ `backend/app/api/v1/endpoints/admin_requests.py` line 317, เพิ่ม field:
     ```python
     class RequestUpdate(BaseModel):
         status: Optional[RequestStatus] = None
         priority: Optional[str] = None
         due_date: Optional[datetime] = None
         assigned_agent_id: Optional[int] = None
         assigned_by_id: Optional[int] = None
         unassign: bool = False  # NEW
     ```
  2. แก้ permission check (line 348) ให้รวม unassign:
     ```python
     # Permission check on assignment changes
     is_changing_assignee = (
         (update_data.assigned_agent_id is not None and update_data.assigned_agent_id != request.assigned_agent_id)
         or (update_data.unassign and request.assigned_agent_id is not None)
     )
     if is_changing_assignee:
         if update_data.unassign:
             # Unassign requires can_assign permission
             if not can_assign(current_admin.role):
                 raise HTTPException(status_code=403, detail="คุณไม่มีสิทธิ์ถอนการมอบหมายงาน")
         else:
             is_self_assign = update_data.assigned_agent_id == current_admin.id
             if is_self_assign and not can_self_assign(current_admin.role):
                 raise HTTPException(status_code=403, detail="คุณไม่มีสิทธิ์รับเรื่องด้วยตนเอง (self-assign)")
             if not is_self_assign and not can_assign(current_admin.role):
                 raise HTTPException(status_code=403, detail="คุณไม่มีสิทธิ์มอบหมายงานให้ผู้อื่น")
     ```
  3. แก้ update block (line 391) ให้ handle unassign:
     ```python
     if update_data.unassign:
         request.assigned_agent_id = None
         request.assigned_by_id = None
     elif update_data.assigned_agent_id is not None:
         request.assigned_agent_id = update_data.assigned_agent_id
         # Auto-record who assigned (used for audit / Telegram notification routing)
         if update_data.assigned_agent_id != current_admin.id:
             request.assigned_by_id = current_admin.id
     ```
- **MIRROR**: MIRROR: BACKEND_PATCH_ENDPOINT, PERMISSION_CHECK
- **IMPORTS**: ไม่ต้องเพิ่ม (ใช้ can_assign, can_self_assign ที่ import แล้ว)
- **GOTCHA**: 
  - `unassign=True` ต้องมี priority สูงกว่า `assigned_agent_id` (เพราะ frontend อาจส่งทั้งคู่)
  - ตรวจสอบว่า `request.assigned_agent_id is not None` ก่อน unassign (ป้องกัน unassign request ที่ยังไม่ได้ assign)
  - อย่าลืม set `assigned_by_id = None` ด้วยเมื่อ unassign
- **VALIDATE**: 
  - PATCH `{"unassign": true}` → assigned_agent_id เป็น null
  - PATCH `{"unassign": true}` โดย AGENT role → 403
  - PATCH `{"assigned_agent_id": 5}` → ยังทำงานได้เหมือนเดิม

### Task 4: Unassign button in request detail page
- **ACTION**: เพิ่มปุ่ม "ถอนการมอบหมาย" ใน manage tab (Row 2: Assignment)
- **IMPLEMENT**:
  1. ที่ `frontend/app/admin/requests/[id]/page.tsx`, import เพิ่ม:
     ```tsx
     import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
     import { UserX } from 'lucide-react';  // เพิ่มใน import block
     ```
  2. เพิ่ม state สำหรับ unassign confirm:
     ```tsx
     const [unassignDialogOpen, setUnassignDialogOpen] = useState(false);
     ```
  3. เพิ่ม handler:
     ```tsx
     const handleUnassign = async () => {
         await handleUpdateField({ unassign: true });
         setUnassignDialogOpen(false);
     };
     ```
  4. แก้ Row 2 (Assignment section, ประมาณ line 867-881) ให้มีปุ่ม unassign:
     ```tsx
     <div className="space-y-3">
         <label className="text-xs font-bold text-text-tertiary uppercase tracking-wider flex items-center gap-2">
             <UserPlus size={14} className="text-primary" /> มอบหมายงานให้
         </label>
         <div className="flex gap-2">
             <div
                 onClick={() => setAssignModalOpen(true)}
                 className={`flex-1 px-4 py-2.5 bg-bg border border-border-default rounded-lg text-sm cursor-pointer hover:bg-bg transition-colors flex justify-between items-center ${
                     request.assignee_name ? 'font-bold text-text-primary' : 'font-medium text-text-tertiary'
                 }`}
             >
                 <span>{request.assignee_name || "ยังไม่ได้มอบหมาย"}</span>
                 <Settings2 size={16} className="text-text-tertiary" />
             </div>
             {canApprove && request.assigned_agent_id && (
                 <Button
                     variant="outline"
                     size="sm"
                     className="h-auto px-3 border-danger/30 text-danger hover:bg-danger/5 hover:text-danger"
                     onClick={() => setUnassignDialogOpen(true)}
                     title="ถอนการมอบหมาย"
                 >
                     <UserX size={16} />
                 </Button>
             )}
         </div>
     </div>
     ```
  5. เพิ่ม ConfirmDialog component ใน JSX (หลัง AssignModal หรือใกล้ๆ กัน):
     ```tsx
     <ConfirmDialog
         isOpen={unassignDialogOpen}
         onClose={() => setUnassignDialogOpen(false)}
         onConfirm={handleUnassign}
         title="ถอนการมอบหมาย"
         description={`ถอนการมอบหมายงานจาก ${request.assignee_name || 'ผู้รับผิดชอบ'}?`}
         confirmText="ถอนการมอบหมาย"
         cancelText="ยกเลิก"
         variant="warning"
     />
     ```
- **MIRROR**: MIRROR: ASSIGNMENT_TRIGGER_DIV, CONFIRM_DIALOG
- **IMPORTS**: `UserX` from `lucide-react`, `ConfirmDialog` from `@/components/ui/ConfirmDialog`
- **GOTCHA**: 
  - ต้องเช็ค `canApprove` (จาก permissions.can_assign) และ `request.assigned_agent_id` ก่อนแสดงปุ่ม
  - `handleUpdateField` ต้องรองรับ `unassign` field (จาก Task 3)
  - ปุ่มใช้ `variant="outline"` + custom class สีแดง (danger) เพื่อให้ดูเป็น destructive action
- **VALIDATE**: 
  - เปิด request ที่มี assignee + ผู้ใช้เป็น supervisor → แสดงปุ่ม 🗑️
  - กดปุ่ม → แสดง ConfirmDialog
  - กด "ถอนการมอบหมาย" → assigned_agent_id เป็น null → UI อัปเดต
  - request ที่ไม่มี assignee → ไม่แสดงปุ่ม

### Task 5: Backend unit test for unassign
- **ACTION**: เพิ่ม test สำหรับ unassign flow
- **IMPLEMENT**:
  ที่ `backend/tests/test_admin_requests_endpoints.py` (เพิ่มต่อท้ายไฟล์):
  ```python
  def test_unassign_request_clears_assigned_agent():
      fake_db = _FakeDB()
      fake_request = SimpleNamespace(
          id=42,
          status=RequestStatus.IN_PROGRESS,
          completed_at=None,
          priority="LOW",
          due_date=None,
          assigned_agent_id=5,
          assigned_by_id=7,
      )
      fake_db._fake_request = fake_request
      teardown = _patch_admin_overrides(fake_db)

      client = TestClient(app)
      try:
          response = client.patch(
              "/api/v1/admin/requests/42",
              json={"unassign": True},
          )
      finally:
          client.close()
          teardown()

      assert response.status_code == 200
      assert fake_db.committed is True
      assert fake_request.assigned_agent_id is None
      assert fake_request.assigned_by_id is None


  def test_unassign_request_forbidden_for_agent_role():
      fake_db = _FakeDB()
      fake_request = SimpleNamespace(
          id=42,
          status=RequestStatus.IN_PROGRESS,
          completed_at=None,
          priority="LOW",
          due_date=None,
          assigned_agent_id=5,
          assigned_by_id=7,
      )
      fake_db._fake_request = fake_request

      async def _override_get_db():
          yield fake_db

      async def _override_get_current_admin():
          return SimpleNamespace(
              id=3,
              username="agent-user",
              display_name="Agent User",
              role=UserRole.AGENT,
          )

      app.dependency_overrides[session_get_db] = _override_get_db
      app.dependency_overrides[deps.get_current_admin] = _override_get_current_admin

      client = TestClient(app)
      try:
          response = client.patch(
              "/api/v1/admin/requests/42",
              json={"unassign": True},
          )
      finally:
          client.close()
          app.dependency_overrides.clear()

      assert response.status_code == 403
      assert fake_request.assigned_agent_id == 5  # unchanged
  ```
- **MIRROR**: MIRROR: TEST_PATTERN
- **IMPORTS**: ใช้ `SimpleNamespace`, `RequestStatus`, `UserRole` ที่ import แล้วในไฟล์
- **GOTCHA**: 
  - Fake request ต้องมี `assigned_agent_id` เริ่มต้นเป็น int (ไม่ใช่ None) เพื่อให้ unassign มีผล
  - `_patch_admin_overrides` ใช้ role=ADMIN — สำหรับ test forbidden ต้องสร้าง override เอง
  - ต้อง clear `app.dependency_overrides` ใน finally
- **VALIDATE**: `cd backend && python -m pytest tests/test_admin_requests_endpoints.py -v` → ทุก test pass

---

## Testing Strategy

### Unit Tests

| Test | Input | Expected Output | Edge Case? |
|---|---|---|---|
| unassign clears assigned_agent_id | PATCH `{"unassign": true}` | assigned_agent_id=null, assigned_by_id=null | No |
| unassign forbidden for AGENT | PATCH `{"unassign": true}` with AGENT role | 403, field unchanged | Yes |
| unassign no-op if already unassigned | PATCH `{"unassign": true}` where assigned_agent_id=None | 200, no change | Yes |
| assign still works | PATCH `{"assigned_agent_id": 5}` | assigned_agent_id=5 | No (regression) |
| self-assign still works | PATCH `{"assigned_agent_id": 7}` by admin id=7 | assigned_agent_id=7 | No (regression) |

### Edge Cases Checklist
- [ ] Unassign request ที่ยังไม่ได้ assign (assigned_agent_id=None)
- [ ] Unassign โดย role ที่ไม่มี can_assign (AGENT, USER)
- [ ] Assign ใหม่หลังจาก unassign
- [ ] Confirm dialog แสดงข้อความถูกต้องทั้ง assign ใหม่และ reassign
- [ ] Modal ปิดแล้วเปิดใหม่ → confirm panel ไม่แสดง
- [ ] Frontend ส่ง `assigned_agent_id` + `unassign: true` → backend prioritize unassign

---

## Validation Commands

### Static Analysis (Frontend)
```bash
cd /d/genAI/jsk-app/frontend
npm run build
```
EXPECT: Zero build errors

### Type Check (Frontend)
```bash
cd /d/genAI/jsk-app/frontend
npx tsc --noEmit
```
EXPECT: Zero type errors

### Unit Tests (Backend)
```bash
cd /d/genAI/jsk-app/backend
python -m pytest tests/test_admin_requests_endpoints.py -v
```
EXPECT: All tests pass (including new unassign tests)

### Permission Tests
```bash
cd /d/genAI/jsk-app/backend
python -m pytest tests/test_permissions.py -v
```
EXPECT: All tests pass

### Full Backend Test Suite
```bash
cd /d/genAI/jsk-app/backend
python -m pytest
```
EXPECT: No regressions

### Manual Validation
- [ ] Open AssignModal → click "เลือก" → confirm panel appears
- [ ] Click "ยกเลิก" in confirm panel → panel disappears
- [ ] Click "เลือก" again → click "ยืนยัน" → API called → modal closes
- [ ] Open request with assignee → "ถอนการมอบหมาย" button visible
- [ ] Click "ถอนการมอบหมาย" → ConfirmDialog appears
- [ ] Click "ถอนการมอบหมาย" in dialog → assigned_agent_id cleared
- [ ] Request without assignee → no unassign button
- [ ] Label shows "งานที่รับผิดชอบ: X งาน" (not "Workload")

---

## Acceptance Criteria
- [ ] All 5 tasks completed
- [ ] `npm run build` passes with zero errors
- [ ] Backend tests pass (including new unassign tests)
- [ ] No regression in existing assign flow
- [ ] Confirm dialog appears before every assign/reassign
- [ ] Thai label used consistently in AssignModal
- [ ] Unassign button visible only when `canApprove && assigned`
- [ ] Unassign clears both `assigned_agent_id` and `assigned_by_id`

## Completion Checklist
- [ ] Code follows discovered patterns (Modal, ConfirmDialog, Button, FakeDB)
- [ ] Error handling matches codebase style (HTTPException with Thai messages)
- [ ] No hardcoded values (use constants, config, or props)
- [ ] Self-contained — no questions needed during implementation

## Risks
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Frontend ส่งทั้ง `assigned_agent_id` และ `unassign: true` | Medium | Medium | Backend handle unassign ก่อน assigned_agent_id |
| Confirm panel ไม่ reset เมื่อ modal ปิด | Low | Low | useEffect cleanup on isOpen change |
| Test dependency override leak | Low | High | Use try/finally + teardown in all tests |
| Regression in assign flow เดิม | Medium | High | Test assign ก่อน/หลัง unassign |

## Notes
- **Backend bug root cause**: `if update_data.assigned_agent_id is not None:` (line 391) ทำให้ส่ง `null` ไม่ล้าง field ได้ แก้โดยเพิ่ม `unassign: bool = False` field แยกต่างหาก
- **Permission decision**: unassign ใช้ `can_assign` เดิม (ไม่ต้องเพิ่ม permission key ใหม่) ตาม PRD scope
- **Confirm UX decision**: inline confirm ใน AssignModal (ไม่ใช้ ConfirmDialog component แยก) เพื่อป้องกัน modal ซ้อน modal
