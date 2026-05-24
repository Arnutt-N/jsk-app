# PRD D: AssignModal Improvements

## Problem Statement

AssignModal มีข้อจำกัด 4 ด้านที่ทำให้ supervisor ทำงานไม่สะดวก:
1. **ไม่มี confirm dialog** — กด "เลือก" แล้ว assign ทันทีโดยไม่ถามยืนยัน เสี่ยง assign ผิดคน
2. **Label ภาษาอังกฤษ** — "Workload: X tasks" ไม่สอดคล้องกับ UI ภาษาไทยที่เหลือ
3. **ไม่มี unassign** — เมื่อ assign ผิดหรือต้องการถอนผู้รับผิดชอบ ต้องไป assign คนอื่นแทน ไม่มีทางถอนออกได้
4. **Edit assignment ไม่ชัดเจน** — ปุ่ม "เปลี่ยนผู้รับผิดชอบ" เปิด modal เดิม แต่ไม่มี confirm ก่อนเปลี่ยน

## Evidence

- `AssignModal.tsx:123` — label `"Workload: X tasks"` เป็น English ท่ามกลาง UI ภาษาไทย
- `AssignModal.tsx:57-62` — `handleAssign` call `onAssign` ทันทีโดยไม่มี confirm step
- `admin_requests.py:348` — `if update_data.assigned_agent_id is not None` → ส่ง `null` เพื่อ unassign ไม่ผ่าน permission check (ถูก skip ไป แต่ logic ที่ line 391 ก็ skip การ set null ด้วย)
- `page.tsx:411` — ปุ่ม "เปลี่ยนผู้รับผิดชอบ" / "มอบหมาย" ใช้ modal เดียวกัน ไม่มี unassign path

## Proposed Solution

### A. Confirm dialog ก่อน assign/reassign
เพิ่ม confirm step ใน `AssignModal` ก่อน call `onAssign` — แสดงชื่อ agent ที่เลือกและชื่อ assignee ปัจจุบัน (ถ้ามี) เพื่อให้ supervisor ยืนยันก่อน

### B. Label ภาษาไทย
เปลี่ยน `"Workload: X tasks"` → `"งานที่รับผิดชอบ: X งาน"`

### C. Unassign (ถอนการมอบหมาย)
- **Frontend**: เพิ่มปุ่ม "ถอนการมอบหมาย" ใน request detail page (เฉพาะเมื่อมี assignee และ `canApprove`)
- **Backend**: แก้ `admin_requests.py` ให้รองรับ `assigned_agent_id = null` อย่างชัดเจน — เพิ่ม `unassign: bool = False` field ใน `RequestUpdate` schema หรือแก้ logic ให้ `assigned_agent_id = null` ผ่าน permission check ได้ (ต้องการ `can_assign`)

### D. Edit assignment (เปลี่ยนผู้รับผิดชอบ)
ใช้ confirm dialog เดียวกับ A — modal แสดง "กำลังเปลี่ยนจาก [ชื่อเดิม] → [ชื่อใหม่]" ก่อน confirm

## Key Hypothesis

We believe **การเพิ่ม confirm dialog + unassign + label ภาษาไทย** จะ **ลด assign ผิดพลาดและทำให้ supervisor จัดการ assignment ได้ครบวงจร** for **supervisor (ADMIN/DIRECTOR/HEAD) ที่มอบหมายงาน**.
We'll know we're right when **supervisor สามารถ assign, reassign, และ unassign ได้ครบโดยมี confirm ทุก action ที่ destructive**.

## What We're NOT Building

- **Multi-assign** — ยังคง 1 request = 1 assignee
- **Assign history / audit trail สำหรับ unassign** — ใช้ audit_log ที่มีอยู่แล้ว ไม่เพิ่ม field ใหม่
- **Permission key ใหม่สำหรับ unassign** — ใช้ `can_assign` เดิม (unassign = สิทธิ์เดียวกับ assign)
- **Notification เมื่อ unassign** — ไม่ส่ง LINE/Telegram เมื่อถอนการมอบหมาย

## Success Metrics

| Metric | Target |
|--------|--------|
| Confirm dialog แสดงก่อนทุก assign/reassign | 100% |
| Unassign ทำงานได้ (assigned_agent_id → null) | backend test pass |
| Label ภาษาไทยครบ | ไม่มี English label ใน AssignModal |
| ไม่มี regression ใน assign flow เดิม | CI green |

## Open Questions

- [ ] เมื่อ unassign แล้ว status ควรเปลี่ยนกลับเป็น PENDING หรือคงสถานะเดิม? → **คงสถานะเดิม** (unassign ≠ reset workflow)
- [ ] Confirm dialog ใช้ `ConfirmDialog` component เดิม หรือ inline ใน modal? → **inline ใน AssignModal** (เพื่อไม่ให้ modal ซ้อน modal)

---

## Users & Context

**Primary User**
- **Who**: Supervisor (ADMIN/DIRECTOR/HEAD) ที่มอบหมายงานให้ agent
- **Current behavior**: กด "เลือก" แล้ว assign ทันที — ถ้า assign ผิดต้องเปิด modal ใหม่แล้วเลือกคนอื่น ไม่มีทาง unassign
- **Trigger**: ต้องการมอบหมาย, เปลี่ยนผู้รับผิดชอบ, หรือถอนการมอบหมาย
- **Success state**: ทุก assign/reassign/unassign มี confirm step — ไม่มี accidental assignment

---

## Implementation Plan

### Phase 1: Frontend-only (ไม่ต้องแก้ backend)
1. **AssignModal.tsx** — เพิ่ม confirm step (inline, ไม่ใช้ modal ซ้อน)
2. **AssignModal.tsx** — เปลี่ยน label เป็นภาษาไทย

### Phase 2: Unassign support
3. **admin_requests.py** — รองรับ `assigned_agent_id = null` อย่างชัดเจน (เพิ่ม `unassign` flag หรือแก้ null check)
4. **page.tsx** — เพิ่มปุ่ม "ถอนการมอบหมาย" ใน manage tab (เฉพาะ `canApprove && request.assigned_agent_id`)

### Phase 3: Tests
5. Unit test สำหรับ unassign backend endpoint
6. E2E test สำหรับ confirm dialog flow

### Files to Change

| File | Change |
|------|--------|
| `frontend/components/admin/AssignModal.tsx` | confirm step + Thai label |
| `frontend/app/admin/requests/[id]/page.tsx` | unassign button |
| `backend/app/api/v1/endpoints/admin_requests.py` | null assigned_agent_id support |
| `backend/tests/` | unassign test |
