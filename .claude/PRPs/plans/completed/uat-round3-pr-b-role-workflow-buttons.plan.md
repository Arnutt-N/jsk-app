# Plan: PR B — Role-based workflow buttons + inline kebab (UAT R3)

## Summary
การ์ดคำร้อง (hero) แสดงปุ่ม workflow แน่นเกินไป (supervisor เห็น 4 ปุ่มล้นแถว: รับเรื่อง·มอบหมาย·ส่งต่อ·ปฏิเสธ) และ staff(AGENT)/user กลับไม่เห็นปุ่ม "ปฏิเสธ" เลย. ยุบ 2 แถวปุ่มเป็นแถวเดียว, ย้าย "ส่งต่อหน่วยงานเฉพาะทาง" เข้าเคบับ, เปิด "ปฏิเสธ" ให้ผู้รับผิดชอบ(staff), และดันเคบับไปขวาสุดในบรรทัดเดียวกัน. ผลลัพธ์ตาม cap: staff/user ≤2 ปุ่ม+เคบับ (next-step + ปฏิเสธ, ไม่มีมอบหมาย); supervisor (superadmin/admin/director/head) ≤3 ปุ่ม+เคบับ (next-step + มอบหมาย + ปฏิเสธ).

## User Story
ในฐานะเจ้าหน้าที่/หัวหน้า,
ฉันต้องการเห็นปุ่มดำเนินการที่ตรงกับบทบาทของฉันแบบไม่แน่นล้น,
เพื่อกดงานถัดไปได้ชัดเจน และเข้าถึงตัวเลือกรองผ่านเคบับที่อยู่ขวาสุด.

## Problem → Solution
**Current** (`[id]/page.tsx` L794–956):
- แถวที่ 1 (top-right CTA group): next-step ปุ่ม gate `(isAssignee || canApprove)` + กลุ่ม secondary (มอบหมาย/ส่งต่อ/ปฏิเสธ) gate `canApprove` เท่านั้น → **4 ปุ่มล้นสำหรับ supervisor, staff ไม่เห็นปฏิเสธ**
- แถวที่ 2 (toolbar มี border-top): REJECTED reopen + เคบับ override (gate `canApprove || canRevertApproval`)

**Desired**: แถวเดียว `ml-auto`:
`[next-step CTA] [มอบหมาย — supervisor] [ปฏิเสธ — assignee|supervisor] [⋮ kebab ขวาสุด]`
- "ส่งต่อหน่วยงานเฉพาะทาง" → ย้ายเข้าเคบับ
- REJECTED → "เปิดเรื่องใหม่" เป็น next-step CTA (supervisor)
- เคบับรวม override ทั้งหมด (ส่งต่อ/บังคับเสร็จสิ้น/ย้อนกลับ/ยกเลิกอนุมัติ) แสดงเฉพาะ item ที่ role นั้นมีสิทธิ์

## Metadata
- **Complexity**: Medium
- **Source PRD**: `.claude/PRPs/prds/uat-round3-fixes.prd.md`
- **PRD Phase**: PR B (สูง)
- **Estimated Files**: 1 (frontend) + verify backend reject permission

## Tier mapping (ยืนยันจากโค้ดจริง)
- `canApprove = permissions?.can_assign` → **supervisor tier** = superadmin/admin/director/head (can_assign=true)
- `!canApprove && isAssignee` → **staff tier** = AGENT/ผู้รับผิดชอบ
- `isAssignee = request.assigned_agent_id === userId`
- สิทธิ์มาจาก permission API (`/admin/settings/permissions/me`) ไม่ผูก role label ตรง ๆ → สอดคล้องกับ `admin/settings/permissions` อยู่แล้ว; "agent→staff" เป็นเรื่อง label การแสดงผล ไม่กระทบ gating

---

## UX Design

### Before (cramped, 2 rows)
```
[สถานะ][ความสำคัญ]            รับเรื่อง | มอบหมาย ส่งต่อ ปฏิเสธ   ← ล้น (supervisor)
───────────────────────────────────────────────
(toolbar) ⋮                                        ← เคบับแยกแถว
staff เห็นแค่: รับเรื่อง   (ไม่มีปฏิเสธ, ไม่มีเคบับ)
```

### After (single row, role-capped)
```
supervisor: [สถานะ][ความสำคัญ] ...  รับเรื่อง  มอบหมาย  ปฏิเสธ   ⋮
staff:      [สถานะ][ความสำคัญ] ...  รับเรื่อง          ปฏิเสธ   ⋮
                                                  (ส่งต่อ/override อยู่ใน ⋮)
```

### Interaction Changes
| Touchpoint | Before | After | Notes |
|---|---|---|---|
| staff: ปฏิเสธ | ไม่เห็น | เห็น | gate `(isAssignee \|\| canApprove)` |
| staff: เคบับ | ไม่มี | มี (ส่งต่อ ถ้า drug-report) | 1 เคบับตาม PRD |
| supervisor: ส่งต่อ | ปุ่มที่ 3 (ล้น) | ใน เคบับ | ลดเหลือ ≤3 ปุ่ม |
| เคบับตำแหน่ง | แถวแยกล่าง | บรรทัดเดียว ขวาสุด | `ml-auto` |
| REJECTED reopen | toolbar ล่าง | next-step CTA | รวมแถว |

---

## Mandatory Reading
| Priority | File | Lines | Why |
|---|---|---|---|
| P0 | `frontend/app/admin/requests/[id]/page.tsx` | 794–956 | บล็อกปุ่มทั้งหมดที่ต้อง restructure |
| P0 | `frontend/app/admin/requests/[id]/page.tsx` | 654–658 | derived: isAssignee/canApprove/canRevertApproval |
| P1 | `frontend/lib/permissions.ts` | 18–25 | MyPermissions shape (can_assign ฯลฯ) |
| P1 | `backend/app/api/v1/endpoints/admin_requests.py` | reject/status transition | ยืนยัน staff(assignee) reject ได้ไม่ 403 |

## External Documentation
ไม่ต้อง — pattern ภายในล้วน (Button, DropdownMenu มีอยู่แล้วในไฟล์).

---

## Patterns to Mirror

### NEXT_STEP_CTA (status-driven primary button)
// SOURCE: [id]/page.tsx:799-808
```tsx
{request.status === 'PENDING' && (isAssignee || canApprove) && (
  <Button variant="primary" size="sm" disabled={submitting}
    onClick={() => { void guardedUpdate({ status: 'ACKNOWLEDGED' }); }}
    leftIcon={<Inbox size={18} />}>รับเรื่อง</Button>
)}
```

### KEBAB (DropdownMenu pattern ในไฟล์)
// SOURCE: [id]/page.tsx:907-954
```tsx
<DropdownMenu>
  <DropdownMenuTrigger aria-label="ตัวเลือกเพิ่มเติม"
    className="inline-flex items-center justify-center h-11 w-11 sm:h-8 sm:w-8 rounded-lg border border-border-default ...">
    <MoreVertical size={16} />
  </DropdownMenuTrigger>
  <DropdownMenuContent align="end" className="min-w-[12rem]">
    <DropdownMenuLabel>ตัวเลือกเพิ่มเติม</DropdownMenuLabel>
    <DropdownMenuSeparator />
    <DropdownMenuItem disabled={submitting} onClick={...}>...</DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>
```

### REJECT_BUTTON (outline danger)
// SOURCE: [id]/page.tsx:868-877
```tsx
<Button variant="outline" size="sm"
  className="border-danger/30 text-danger hover:bg-danger/5 hover:text-danger"
  disabled={submitting} onClick={() => setRejectConfirm({ open: true, reason: '' })}
  leftIcon={<XCircle size={16} />}>ปฏิเสธ</Button>
```

---

## Files to Change
| File | Action | Justification |
|---|---|---|
| `frontend/app/admin/requests/[id]/page.tsx` | UPDATE | ยุบ/จัดเรียงปุ่ม workflow ตามบทบาท + เคบับ inline |

## NOT Building
- ไม่เพิ่ม/แก้ backend permission (เว้นแต่พบว่า staff reject 403 → จะ note เป็น follow-up; PR นี้ frontend)
- ไม่ rename enum AGENT→STAFF ใน backend (label-only, นอก scope)
- ไม่แตะแท็บ/ฟอร์มแก้ไข (เป็น PR C)
- ไม่แตะปุ่มใน manage tab (L1455+) นอกเหนือจากที่จำเป็น

---

## Step-by-Step Tasks

### Task 1: รวมปุ่ม workflow เป็นแถวเดียว + เปิดปฏิเสธให้ staff + ดันเคบับขวาสุด
- **ACTION**: แก้ `[id]/page.tsx` บล็อก L794–956
- **IMPLEMENT**:
  - คง `<div className="flex flex-wrap items-center gap-2 ml-auto">` เป็น container เดียว (ลบ secondary toolbar row L894–956 ที่มี border-top แล้วย้าย logic เข้ามา)
  - ลำดับ item:
    1. **next-step CTA** (เดิม L799–842) คงไว้ — รวม REJECTED case: `{request.status === 'REJECTED' && canApprove && (<Button ...เปิดเรื่องใหม่ onClick guardedUpdate PENDING+assigned_agent_id:null/>)}`
    2. **มอบหมาย/เปลี่ยนผู้รับผิดชอบ**: gate `canApprove && status !== COMPLETED && status !== REJECTED` (เดิม) — คงไว้ แต่เอา hairline divider ออกหรือคงไว้ก่อนกลุ่ม secondary
    3. **ปฏิเสธ**: เปลี่ยน gate จาก `canApprove` → `(isAssignee || canApprove) && status !== COMPLETED && status !== REJECTED`
    4. **kebab**: ย้ายมาเป็น item สุดท้าย, เพิ่ม `className="ml-auto"` หรือ wrap ด้วย spacer ให้ชิดขวา; gate = แสดงเมื่อมี ≥1 action สำหรับ user
  - ย้าย **ส่งต่อหน่วยงานเฉพาะทาง** (เดิมปุ่ม L858–867) เข้า `DropdownMenuItem` ในเคบับ: `{request.topic_category === 'แจ้งเบาะแสยาเสพติด' && (isAssignee || canApprove) && status !== COMPLETED && status !== REJECTED && (<DropdownMenuItem onClick={() => setEscalationDialogOpen(true)}><Forward .../>ส่งต่อหน่วยงานเฉพาะทาง</DropdownMenuItem>)}`
  - เคบับ override items (เดิม L917–952): บังคับเสร็จสิ้น / ย้อนกลับ รอรับเรื่อง (gate `canApprove`), ยกเลิกอนุมัติ (gate `canApprove && canRevertApproval && COMPLETED) — คง gate เดิม
  - คำนวณ `kebabHasItems` (boolean) จากเงื่อนไขทั้งหมด เพื่อซ่อนเคบับเมื่อว่าง
- **MIRROR**: NEXT_STEP_CTA, KEBAB, REJECT_BUTTON
- **IMPORTS**: ใช้ของเดิม (Forward, MoreVertical, DropdownMenu*, Button, ไอคอน) — ไม่เพิ่ม import ใหม่
- **GOTCHA**:
  - ปุ่มในแถวต้องไม่เกิน cap: staff(`!canApprove`) เห็นได้แค่ next-step(ถ้า isAssignee) + ปฏิเสธ = ≤2; supervisor next-step + มอบหมาย + ปฏิเสธ = ≤3. ตรวจว่าไม่มี state ใดทำให้เกิน
  - `ml-auto` มีอยู่ที่ container แล้ว — ดันทั้งกลุ่มไปขวา; เพื่อให้ "เคบับขวาสุด" ใช้ลำดับ DOM (เคบับเป็น child สุดท้าย) ก็พอ ไม่ต้อง ml-auto ซ้อน
  - อย่าให้ `flex-wrap` ทำให้เคบับตกบรรทัด: ใช้ `flex-nowrap` ไม่ได้ (ปุ่มเยอะ) → คง `flex-wrap` แต่ลดจำนวนปุ่มแล้วจะไม่ล้นบน desktop; mobile ปุ่มยังมี touch target h-11
  - ลบ divider `border-t border-border-subtle` ของแถวที่ 2 และ hairline `<span className="mx-1 h-6 w-px bg-border-default" />` ถ้าไม่ต้องการเส้นคั่นแล้ว (พิจารณาคงไว้ก่อนเคบับเพื่อ group)
- **VALIDATE**: `npx tsc --noEmit` + เปิดหน้า ดูจำนวนปุ่มตาม role/สถานะ

### Task 2: ยืนยัน backend ให้ staff(assignee) ปฏิเสธได้ (ไม่ 403)
- **ACTION**: อ่าน `backend/app/api/v1/endpoints/admin_requests.py` ส่วน update_request / status transition กับ REJECTED
- **IMPLEMENT**: ถ้า backend จำกัด REJECTED เฉพาะ supervisor → **บันทึกเป็น follow-up** (อย่าแก้ใน PR นี้ตาม scope) และพิจารณาว่าควรเปิด gate ปฏิเสธให้ staff หรือไม่; ถ้า backend อนุญาต assignee อยู่แล้ว → ผ่าน
- **GOTCHA**: ปุ่มที่กดแล้ว 403 = UX แย่กว่าเดิม — ต้องยืนยันก่อน ship
- **VALIDATE**: grep endpoint + ถ้าจำเป็นรัน pytest ที่เกี่ยว

### Task 3: (ถ้ามี) ปรับ test/E2E ที่ assert ปุ่ม
- **ACTION**: ตรวจ `frontend/e2e/*.spec.ts` ว่ามี assertion ปุ่ม "มอบหมาย"/"ปฏิเสธ" ที่ตำแหน่งเดิมไหม
- **IMPLEMENT**: อัปเดตถ้าจำเป็น (ส่งต่อ ย้ายเข้าเคบับ → ต้องเปิดเคบับก่อน)
- **VALIDATE**: `npx tsc --noEmit`

---

## Testing Strategy
### Manual (หลัก — เป็น UI conditional)
- [ ] supervisor (admin) @ PENDING: เห็น รับเรื่อง + มอบหมาย + ปฏิเสธ + ⋮ (3+1) ไม่ล้น
- [ ] supervisor @ AWAITING_APPROVAL: อนุมัติ + มอบหมาย + ปฏิเสธ + ⋮
- [ ] staff (assignee, can_assign=false) @ PENDING: รับเรื่อง + ปฏิเสธ + ⋮ (2+1) ไม่มีมอบหมาย
- [ ] staff @ AWAITING_APPROVAL: ปฏิเสธ + ⋮ (ไม่มีอนุมัติ)
- [ ] drug-report: "ส่งต่อหน่วยงานเฉพาะทาง" อยู่ในเคบับ
- [ ] REJECTED: supervisor เห็น "เปิดเรื่องใหม่" เป็น CTA
- [ ] mobile (<640px): เคบับ touch target h-11, ปุ่มไม่ทับซ้อน

### Edge Cases Checklist
- [ ] ไม่มีสิทธิ์เลย (ไม่ใช่ assignee, can_assign=false) → ไม่เห็นปุ่ม action, เคบับซ่อนถ้าว่าง
- [ ] COMPLETED: ไม่มี มอบหมาย/ปฏิเสธ; เคบับมียกเลิกอนุมัติ (ถ้า canRevertApproval)
- [ ] เคบับว่าง → ไม่ render trigger

---

## Validation Commands
### Static Analysis
```bash
cd frontend && npx tsc --noEmit
cd frontend && npx eslint "app/admin/requests/[id]/page.tsx"
```
EXPECT: 0 errors

### Unit/Build
```powershell
cd frontend; npx vitest run
```
EXPECT: no regressions

### Backend (ถ้าแตะ)
```bash
cd backend && python -m pytest tests/test_admin_requests_endpoints.py -q
```
EXPECT: pass

### Manual
- เปิด /admin/requests/[id] ด้วย account แต่ละ role ตาม checklist

---

## Acceptance Criteria
- [ ] staff/user ≤2 ปุ่ม + 1 เคบับ (next-step + ปฏิเสธ, ไม่มีมอบหมาย)
- [ ] supervisor ≤3 ปุ่ม + 1 เคบับ (next-step + มอบหมาย + ปฏิเสธ)
- [ ] เคบับอยู่บรรทัดเดียว ตำแหน่งขวาสุด
- [ ] ส่งต่อ/override อยู่ในเคบับ
- [ ] tsc/eslint/vitest เขียว, ไม่มีปุ่มที่กดแล้ว 403

## Completion Checklist
- [ ] ตาม pattern เดิม (Button/DropdownMenu/ไอคอน)
- [ ] ไม่มี import เกินจำเป็น
- [ ] ไม่ขยาย scope ไป tab/ฟอร์ม (PR C) หรือ backend enum
- [ ] gating ตรวจครบทุก status × tier
- [ ] self-contained

## Risks
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| backend block staff reject → ปุ่ม 403 | กลาง | UX แย่ | Task 2 ยืนยันก่อน; ถ้าบล็อก ให้คง ปฏิเสธ เป็น canApprove + note follow-up |
| flex-wrap ทำเคบับตกบรรทัด | ต่ำ | เคบับไม่ขวาสุด | ลดปุ่มแล้วไม่ล้น; เคบับเป็น child สุดท้าย |
| E2E assert ปุ่มเดิม (ส่งต่อ) | ต่ำ | smoke แดง | Task 3 ตรวจ/อัปเดต |

## Notes
- branch: `fix/uat-r3-b-role-workflow-buttons`
- commit ไม่มี Co-Authored-By; squash merge + delete branch
- เชื่อม PR A: allowlist role เพิ่ง sync แล้ว (director/head login ได้) → ปุ่มตาม can_assign ของ role เหล่านั้นจะถูกต้อง
