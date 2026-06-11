# Plan: edit_request_details Permission — Phase 2 (Frontend gating)

## Summary
ต่อยอด Phase 1 (backend merge ใน branch เดียวกันแล้ว): เพิ่ม `can_edit_request_details` เข้า `MyPermissions` interface + `edit_request_details_allowed_roles` เข้า `PermissionSummary` ใน `lib/permissions.ts` แล้ว gate ปุ่ม "แก้ไข" ของแท็บ details และ contact ใน `requests/[id]/page.tsx` ด้วย pattern เดียวกับ `canRevertApproval` — role ที่ไม่มีสิทธิ์จะไม่เห็นปุ่ม

## User Story
As a AGENT (role ไม่มีสิทธิ์), I want หน้า request detail แสดงข้อมูลแบบอ่านอย่างเดียว, so that UI สะท้อนนโยบายจริงและไม่หลอกให้กดแล้วเจอ 403

## Problem → Solution
ปุ่มแก้ไข render ให้ทุกคน (page.tsx:971-979, 1153-1161) → ซ่อนปุ่มเมื่อ `permissions?.can_edit_request_details` ไม่เป็น true (loading/error = ซ่อน ตาม convention เดิม)

## Metadata
- **Complexity**: Small (2 ไฟล์, ~10 บรรทัด)
- **Source PRD**: `.claude/PRPs/prds/edit-request-details-permission.prd.md`
- **PRD Phase**: Phase 2 — Frontend permission gating
- **Estimated Files**: 2

---

## UX Design

### Before
```
แท็บ "รายละเอียดคำร้อง" (ทุก role):
┌──────────────────────────────┐
│                  [✎ แก้ไข]   │  ← ทุกคนเห็น กดได้ (AGENT กดแล้ว save จะเจอ 403 จาก Phase 1)
│  หมวดหมู่: ...               │
└──────────────────────────────┘
```

### After
```
ADMIN / SUPER_ADMIN:               AGENT / DIRECTOR / HEAD (default):
┌──────────────────────────────┐   ┌──────────────────────────────┐
│                  [✎ แก้ไข]   │   │  (ไม่มีปุ่ม — อ่านอย่างเดียว)  │
│  หมวดหมู่: ...               │   │  หมวดหมู่: ...               │
└──────────────────────────────┘   └──────────────────────────────┘
```

### Interaction Changes
| Touchpoint | Before | After | Notes |
|---|---|---|---|
| ปุ่มแก้ไข แท็บ details | แสดงทุก role | แสดงเฉพาะ role ใน policy | ระหว่าง permissions โหลด (null) = ซ่อน — convention เดิมของ canRevertApproval |
| ปุ่มแก้ไข แท็บ contact | แสดงทุก role | แสดงเฉพาะ role ใน policy | gate ด้วย boolean ตัวเดียวกัน |
| Matrix UI `/admin/settings/permissions` | 4 แถว | 5 แถว (อัตโนมัติจาก API) | ไม่ต้องแก้โค้ด — render จาก `rules` |

---

## Mandatory Reading

| Priority | File | Lines | Why |
|---|---|---|---|
| P0 | `frontend/lib/permissions.ts` | 18-40 | MyPermissions + PermissionSummary interfaces ที่ต้องเพิ่ม field |
| P0 | `frontend/app/admin/requests/[id]/page.tsx` | 625-628 | จุด derived permissions (canApprove / canRevertApproval) |
| P0 | `frontend/app/admin/requests/[id]/page.tsx` | 966-995, 1148-1180 | โครง ternary ของปุ่มแก้ไขทั้ง 2 แท็บ |

## External Documentation

ไม่ต้อง — internal patterns ล้วน

---

## Patterns to Mirror

### INTERFACE_FIELDS
```typescript
// SOURCE: frontend/lib/permissions.ts:18-40
export interface MyPermissions {
  role: string
  can_assign: boolean
  can_self_assign: boolean
  can_edit_permissions: boolean
  can_revert_approval: boolean
}

export interface PermissionSummary {
  assign_allowed_roles: string[]
  self_assign_allowed_roles: string[]
  permission_settings_editor_roles: string[]
  revert_approval_allowed_roles: string[]
  /** Stage 2: full editable rule set; empty if backend pre-Stage-2. */
  rules?: PermissionRule[]
}
```

### DERIVED_PERMISSION
```tsx
// SOURCE: frontend/app/admin/requests/[id]/page.tsx:625-628
// --- Derived state (computed BEFORE any early return so hooks rules are satisfied) ---
const isAssignee = userId !== null && request?.assigned_agent_id === userId;
const canApprove = permissions?.can_assign ?? false;
const canRevertApproval = permissions?.can_revert_approval ?? false;
```

### EDIT_BUTTON_TERNARY (โครงปัจจุบันของทั้ง 2 แท็บ — แบบ details)
```tsx
// SOURCE: frontend/app/admin/requests/[id]/page.tsx:970-980
<div className="flex justify-end">
    {!detailsEditMode ? (
        <Button
            variant="ghost"
            size="sm"
            onClick={handleEnterDetailsEdit}
            leftIcon={<Edit3 size={14} />}
        >
            แก้ไข
        </Button>
    ) : (
```

---

## Files to Change

| File | Action | Justification |
|---|---|---|
| `frontend/lib/permissions.ts` | UPDATE | เพิ่ม field ใหม่ 2 interface ให้ตรง backend response |
| `frontend/app/admin/requests/[id]/page.tsx` | UPDATE | derived const + gate ปุ่ม 2 จุด |

## NOT Building
- Component test ของหน้า page.tsx — repo ไม่มี precedent component-test หน้า admin (vitest ใช้กับ lib utilities); behavioral coverage อยู่ที่ Phase 3 E2E ตาม PRD
- Disable + tooltip — ตัดสินใจแล้วว่า "ซ่อน" (PRD Decisions Log)
- การแก้ matrix UI — แถวใหม่มาเองจาก API
- Dirty-state confirmation — งานค้างคนละเรื่อง (polish round)

---

## Step-by-Step Tasks

### Task 1: เพิ่ม fields ใน lib/permissions.ts
- **ACTION**: แก้ 2 interfaces
- **IMPLEMENT**:
  1. `MyPermissions` (L18-24): เพิ่ม `can_edit_request_details: boolean` ต่อจาก `can_revert_approval`
  2. `PermissionSummary` (L33-40): เพิ่ม `edit_request_details_allowed_roles: string[]` ต่อจาก `revert_approval_allowed_roles`
- **MIRROR**: INTERFACE_FIELDS
- **IMPORTS**: ไม่มี
- **GOTCHA**: ชื่อ field ต้อง snake_case ตรงกับ backend JSON ทุกตัวอักษร (`can_edit_request_details`, `edit_request_details_allowed_roles`) — interface นี้ map ตรงจาก response ไม่มีการแปลง
- **VALIDATE**: `npx tsc --noEmit` ผ่าน (WSL)

### Task 2: Gate ปุ่มแก้ไขใน page.tsx
- **ACTION**: แก้ 3 จุดใน `frontend/app/admin/requests/[id]/page.tsx`
- **IMPLEMENT**:
  1. หลัง L628 (`const canRevertApproval = ...`): เพิ่ม
     ```tsx
     const canEditRequestDetails = permissions?.can_edit_request_details ?? false;
     ```
  2. แท็บ details (L971): เปลี่ยน `{!detailsEditMode ? (` ให้ branch แรก render ปุ่มเฉพาะเมื่อมีสิทธิ์:
     ```tsx
     {!detailsEditMode ? (
         canEditRequestDetails && (
             <Button
                 variant="ghost"
                 size="sm"
                 onClick={handleEnterDetailsEdit}
                 leftIcon={<Edit3 size={14} />}
             >
                 แก้ไข
             </Button>
         )
     ) : (
     ```
  3. แท็บ contact (L1153): เปลี่ยนแบบเดียวกันกับ `handleEnterContactEdit`
- **MIRROR**: DERIVED_PERMISSION + EDIT_BUTTON_TERNARY
- **IMPORTS**: ไม่มี (`usePermissions` ใช้อยู่แล้วที่ L333)
- **GOTCHA**: ใช้ `canEditRequestDetails && (...)` ใน branch แรกของ ternary เดิม — **ห้าม** เปลี่ยนเงื่อนไข ternary นอกสุด (`!detailsEditMode`) เพราะ branch else คือปุ่ม ยกเลิก/บันทึก ของ edit mode ที่ต้องคงเดิม
- **GOTCHA**: ผู้ใช้เข้า edit mode ไม่ได้ถ้าไม่เห็นปุ่ม จึงไม่ต้อง guard ที่ handleEnterDetailsEdit/handleSave เพิ่ม — backend 403 (Phase 1) คือ defense ชั้นสุดท้ายอยู่แล้ว
- **VALIDATE**: `npx tsc --noEmit` + `npx eslint app/admin/requests/[id]/page.tsx lib/permissions.ts` ผ่าน (WSL)

---

## Testing Strategy

### Unit Tests

ไม่เพิ่ม — เหตุผล: การเปลี่ยนแปลงคือ boolean gate บรรทัดเดียวในหน้า 1,200 บรรทัดที่ repo ไม่มีโครง component-test; การทดสอบพฤติกรรม (ปุ่มหาย/แสดงตาม role) เป็นหน้าที่ Phase 3 (E2E + UAT) ตามโครง PRD — vitest เดิมทั้งหมด (52 tests) ต้องยังเขียว

### Edge Cases Checklist
- [x] permissions = null (loading/error) → ปุ่มซ่อน (ปลอดภัยไว้ก่อน) — พฤติกรรมจาก `?? false`
- [x] อยู่ใน edit mode แล้ว → branch else ของ ternary ไม่โดนแตะ ปุ่มยกเลิก/บันทึกทำงานเดิม
- [x] Backend เก่า (ไม่มี field) → `undefined ?? false` = ซ่อน — fail-closed

---

## Validation Commands

> tsc/eslint รันใน WSL; **vitest ต้องรันบน Windows PowerShell** (node_modules เป็น Windows platform — rollup native binding)

### Static Analysis (WSL)
```bash
wsl -e bash -c "cd /mnt/d/genAI/jsk-app/frontend && npx tsc --noEmit && npx eslint 'app/admin/requests/[id]/page.tsx' lib/permissions.ts"
```
EXPECT: Zero errors

### Unit Tests (Windows PowerShell)
```powershell
Set-Location frontend; npx vitest run
```
EXPECT: 52+ tests ผ่านเท่าเดิม (ไม่มี regression)

### Manual Validation (optional — dev servers)
- [ ] Login ด้วย ADMIN → เห็นปุ่มแก้ไขทั้ง 2 แท็บ
- [ ] Login ด้วย AGENT → ไม่เห็นปุ่ม ทั้ง 2 แท็บแสดงแบบอ่านอย่างเดียว
- [ ] `/admin/settings/permissions` มีแถว "แก้ไขข้อมูลคำร้อง (รายละเอียด/ผู้ติดต่อ)"

---

## Acceptance Criteria
- [ ] Tasks 1-2 เสร็จ
- [ ] tsc + eslint + vitest ผ่าน
- [ ] ปุ่มแก้ไขถูก gate ด้วย `can_edit_request_details` ทั้ง 2 แท็บ
- [ ] ternary edit-mode branch เดิมไม่ถูกกระทบ

## Completion Checklist
- [ ] โค้ดใหม่ mirror pattern `canRevertApproval` ทุกจุด
- [ ] ชื่อ field ตรง backend JSON
- [ ] ไม่มี scope เพิ่ม (ไม่แตะ matrix UI, ไม่เพิ่ม dialog)

## Risks
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| แก้ ternary พลาดจน edit-mode buttons หาย | L | M | GOTCHA ระบุชัด: แตะเฉพาะ branch แรก + tsc/eslint จับ syntax |
| ปุ่มกระพริบตอน permissions โหลด | L | L | พฤติกรรมเดียวกับ canRevertApproval ที่ใช้อยู่ — ยอมรับแล้ว |

## Notes
- Phase 1 (backend) เสร็จใน branch `feat/edit-request-details-permission` แล้ว — Phase 2 ทำต่อใน branch เดียวกัน รวม PR เดียวตาม PRD
- หลัง Phase 2 เหลือ Phase 3: เพิ่ม assertion ใน `frontend/e2e/permission-settings.spec.ts` + UAT + report
