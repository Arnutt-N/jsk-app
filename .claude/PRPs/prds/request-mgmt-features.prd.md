# Request Management Feature & Decisions (PRD B)

## Problem Statement

หน้า `/admin/requests/[id]` มี 2 ปัญหา behavior ที่ทำให้ admin (admin/staff/director/head) ติดในงานจริง: (1) เมื่อคำร้องอยู่สถานะ **COMPLETED (เสร็จสิ้น)** แล้ว ไม่มีปุ่มอะไรเลยในหน้านั้น — ถ้า admin อนุมัติผิดหรือต้องแก้ ต้องไป edit DB ตรง (ไม่มี workaround ที่ปลอดภัย); (2) Layout ของหน้าใช้ "3 กล่องเรียงกัน" (hero / tab nav / content) ทำให้ดู fragmented ไม่ unified. ทั้งสองปัญหาบล็อก "ปิดงาน production" ที่ user ตั้งเป้าไว้

## Evidence

- Codebase audit (Phase 3, this PRD): `frontend/app/admin/requests/[id]/page.tsx:380-515` แสดงว่า COMPLETED ไม่มี button condition ตรง — workflow buttons ทั้งหมด guard ด้วย `status !== 'COMPLETED' && status !== 'REJECTED'` ทำให้สถานะ COMPLETED render เป็น empty action area
- Backend comment `page.tsx:462`: "Backend has no ALLOWED_TRANSITIONS guard, so revert is a simple PATCH" — confirm ว่าไม่ใช่ข้อจำกัด backend, เป็น UI gating choice ที่ตอนนี้ปิดทางหมด
- User feedback (Round 4 ของ PRD A self-test): "ติด COMPLETED แก้ไม่ได้" + "ไอคอนหาย" (= no buttons rendered)
- User feedback Issue 5: "สองการ์ด ดู uxui ไม่ค่อยดี"

## Proposed Solution

เพิ่ม **2 revert options ใน kebab menu "การจัดการพิเศษ"** (pattern เดียวกับ force-complete/revert-to-pending ที่มีอยู่แล้ว) ให้ supervisor (ADMIN + SUPER_ADMIN เท่านั้น) ยกเลิกการอนุมัติได้ใน 2 ทิศทาง: กลับไป AWAITING_APPROVAL (รออนุมัติ) หรือ IN_PROGRESS (กำลังดำเนินการ) — บันทึก audit log อัตโนมัติทุกครั้ง. พร้อมรวม hero/tab-nav/content เป็น single card (Issue 5) เพื่อ visual coherence

## Key Hypothesis

We believe **เพิ่ม revert kebab items + merge layout** will **ลด UX dead-end ของ COMPLETED state และทำให้หน้า detail page ดู unified** for **admin 4 roles (admin/staff/director/head) — แต่เฉพาะ ADMIN+SUPER_ADMIN จะใช้ revert ได้จริง**.

We'll know we're right when **เจ้าของระบบ (user = tester) self-test pass — admin คลิก revert ได้, audit log ถูกบันทึก, layout merged ดูเป็น 1 card ไม่ใช่ 3**.

## What We're NOT Building

- **Configurable RBAC สำหรับ revert** → PRD C (ตอนนี้ hardcode ADMIN+SUPER_ADMIN; PRD C จะเพิ่ม `revert_approval` key ใน permission_settings table)
- **Backend state machine guard** → ยังไม่ add `ALLOWED_TRANSITIONS` constraint (frontend gating ก็พอ + audit log ตามจับได้)
- **AssignModal i18n toggle + confirm button** → PRD D (Assignment Workflow)
- **Multi-assign / unassign / edit assignment** → PRD D
- **Workflow color overhaul** → audit แล้วสีปัจจุบันใช้ได้ (เขียว/แดง/น้ำเงิน/เหลือง สื่อความหมายถูก) — minor tweaks only ตรงปุ่ม revert ใหม่ใช้ amber/orange pattern เดียวกับ kebab ที่มีอยู่
- **Revert จาก REJECTED** → ใช้ "เปิดเรื่องใหม่" ที่มีอยู่แล้ว, ไม่ซ้ำ

## Success Metrics

| Metric | Target | How Measured |
|--------|--------|--------------|
| Dead-end ของ COMPLETED ปิดได้ | admin คลิก revert จาก COMPLETED ได้ทั้ง 2 ทิศทาง | Manual test + Playwright spec |
| Audit log ถูกบันทึก | 100% ของ revert actions | API check (audit_log table มี entry) |
| Layout merged | 1 card ไม่ใช่ 3 | Visual check + DOM inspection (1 root container, internal dividers) |
| RBAC enforced | AGENT/USER ไม่เห็น revert items | Manual test by role + Playwright spec |
| User self-approval | Pass | Owner manual test on staging |

## Open Questions

- [ ] **Audit log payload structure** — เก็บ field อะไรบ้าง? (proposed: action_type="revert_approval", from_status, to_status, request_id, admin_id, timestamp, reason?) — ต้อง spike กับ `audit_log.py` model
- [ ] **Confirm dialog ก่อน revert** — ต้องมี ConfirmDialog ยืนยันก่อน revert ไหม? (proposed: yes — เพราะเป็น destructive-ish action ที่อาจเปิดความสับสนถ้าทำพลาด)
- [ ] **"เหตุผล" field** — บังคับ admin กรอกเหตุผลตอน revert ไหม? (out-of-scope ของ MVP — defer ถ้า user ต้องการ)

---

## Users & Context

**Primary User**
- **Who**: Admin (ADMIN/SUPER_ADMIN) ที่ต้องแก้ไขคำร้องที่อนุมัติไปแล้ว — เช่น approve ผิดคน, เจอข้อมูลใหม่หลัง approve, ต้องส่งกลับให้ทำเพิ่ม
- **Current behavior**: เปิด `/admin/requests/[id]` ของคำร้อง COMPLETED → ไม่มีปุ่มอะไรให้กด → ไป edit DB ตรง / สร้างคำร้องใหม่ / ถาม dev
- **Trigger**: เจอเคสที่ "อนุมัติไปแล้วแต่ต้องแก้" (จากการทดสอบ production หรือเคสจริง)
- **Success state**: คลิก kebab `⋮` → เห็น "ยกเลิกอนุมัติ → รออนุมัติ" / "ยกเลิกอนุมัติ → กำลังดำเนินการ" → คลิก → confirm → สถานะเปลี่ยน + บันทึกประวัติ

**Job to Be Done**
When คำร้องเสร็จไปแล้วต้องแก้ไข, I want **กลับไปสถานะก่อนหน้าได้โดยไม่ต้องไปแก้ฐานข้อมูล**, so I can **แก้ผิดพลาดได้เองโดยไม่ต้องสร้างคำร้องใหม่ และมีหลักฐานว่าใครทำเมื่อไหร่**.

**Non-Users**
- ประชาชน (LIFF users) — มองไม่เห็น revert flow เลย (admin-only)
- AGENT (staff) — เห็นหน้านี้แต่ revert items ถูก hide (ไม่มีสิทธิ์)
- USER (read-only role) — มองไม่เห็น admin panel ตั้งแต่แรก

---

## Solution Detail

### Core Capabilities (MoSCoW)

| Priority | Capability | Rationale |
|----------|------------|-----------|
| Must | **Revert COMPLETED → AWAITING_APPROVAL** (kebab item, supervisor only) | Closes dead-end #1 |
| Must | **Revert COMPLETED → IN_PROGRESS** (kebab item, supervisor only) | Closes dead-end #2 (lower-level revert) |
| Must | **Audit log entry** ทุก revert action | Accountability — admin ตรวจสอบย้อนได้ |
| Must | **Hero + tab nav + content merge** เป็น single card | Visual coherence (Issue 5) |
| Must | **Confirm dialog ก่อน revert** | ป้องกัน mis-click ของ destructive-ish action |
| Should | Playwright E2E test สำหรับ revert flow | Regression guard |
| Should | Backend audit_log endpoint return revert entries | Future feature: ดู history บน UI |
| Could | "เหตุผล" optional field ใน confirm dialog | Better audit trail |
| Won't (PRD B) | Configurable RBAC matrix entry | → PRD C |
| Won't (PRD B) | Backend ALLOWED_TRANSITIONS guard | Frontend + audit log พอ — backend จะ guard ใน PRD ถัดไปถ้าจำเป็น |
| Won't (PRD B) | Major color refresh | Current colors are OK; revert ใช้ amber pattern ของ kebab |

### MVP Scope

**1 PR ครอบคลุม 2 areas:**

1. **Frontend (`/admin/requests/[id]`)**
   - เพิ่ม 2 `<DropdownMenuItem>` ใน kebab override (visible when `canApprove && status === 'COMPLETED'`)
   - Hero/tab-nav/content merge: refactor parent containers จาก 3 cards เป็น 1 card with section dividers
   - ConfirmDialog wrap around revert action (ใช้ component canonical จาก PR #54)

2. **Backend (light touch)**
   - PATCH `/admin/requests/{id}` ยอมรับ status transition COMPLETED → AWAITING_APPROVAL / IN_PROGRESS อยู่แล้ว (no guard) — no code change
   - Audit log entry creation ใน update_request endpoint — ตรวจ pattern ปัจจุบันว่ามี middleware/hook อัตโนมัติ หรือต้อง manual insert ใน revert path

### User Flow

```
1. Admin เปิด /admin/requests/[id] ของคำร้อง COMPLETED
2. เห็น kebab menu "⋮" (การจัดการพิเศษ) — เปิดได้เพราะ canApprove=true
3. คลิก ⋮ → เห็น dropdown 2 รายการใหม่:
     - "ยกเลิกอนุมัติ → รออนุมัติ" (icon: Undo2, amber-600)
     - "ยกเลิกอนุมัติ → กำลังดำเนินการ" (icon: Undo2, amber-600)
4. คลิกรายการใดรายการหนึ่ง → ConfirmDialog เด้งขึ้น:
     "ยืนยันยกเลิกการอนุมัติ?
      คำร้องจะกลับไปสถานะ [target]
      การกระทำนี้จะถูกบันทึกในประวัติ"
5. คลิก "ยืนยัน" → PATCH /admin/requests/{id} { status: target } + audit log insert
6. หน้า refresh → status เปลี่ยน → workflow buttons ปกติของ state ใหม่กลับมา
```

---

## Technical Approach

**Feasibility**: 🟡 **MEDIUM**

- Frontend: 🟢 HIGH — reuse `useGuardedUpdate` (PR #52) + `ConfirmDialog` (PR #54) + kebab pattern ที่มีอยู่
- Hero merge: 🟢 HIGH — pure JSX restructure, no logic change
- Audit log: 🟡 MEDIUM — ต้องตรวจว่ามี auto-logging middleware หรือต้องเขียน manual

**Architecture Notes**

- **No backend state machine change** — `update_request` endpoint ที่ `backend/app/api/v1/endpoints/admin_requests.py:323` accept any RequestStatus อยู่แล้ว
- **RBAC**: ใช้ `canApprove` (existing supervisor check จาก permissions module) — hardcoded ADMIN+SUPER_ADMIN — ไม่แตะ permission_settings table (PRD C จะแก้)
- **Audit log path**: `backend/app/models/audit_log.py` + `backend/app/api/v1/endpoints/admin_audit.py` มีอยู่แล้ว — ใช้ pattern ที่มี
- **Kebab visibility**: ปัจจุบัน `canApprove && status !== 'COMPLETED' && status !== 'REJECTED'` → ต้องขยายเป็น `canApprove && status !== 'REJECTED'` (เปิดให้ COMPLETED เห็น kebab ด้วย, items ภายใน self-gate)
- **Confirm dialog**: ใช้ `ConfirmDialog` variant="warning" (ไม่ใช่ danger — เพราะไม่ใช่ deletion)

**Key Files**

| Area | File | Change |
|------|------|--------|
| Frontend kebab + revert items | `frontend/app/admin/requests/[id]/page.tsx:479-514` | Expand kebab visibility + add 2 new DropdownMenuItems with ConfirmDialog wrappers |
| Frontend hero merge | `frontend/app/admin/requests/[id]/page.tsx:300-545` | Restructure 3 cards → 1 card with internal dividers |
| Backend audit | `backend/app/api/v1/endpoints/admin_requests.py:323-370` | Insert audit_log row when status revert detected (or wire automatic middleware) |
| Tests | `frontend/e2e/admin-requests-supervisor.spec.ts` | Add E2E for revert flow |

**Technical Risks**

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Audit log API changes ฉุดเวลา | M | Spike audit_log.py ใน Phase 1 (planning) ก่อน implement |
| Hero merge ทำลาย PR #53 (Linear-inspired hero) intent | M | Diff comparison — preserve title/status/actions row, รวมเฉพาะ container; visual regression via Playwright screenshot |
| RBAC bypass via API direct call | L | Audit log จับได้; backend RBAC guard เพิ่มใน PRD C ถ้าจำเป็น |
| Mobile layout break ตอน merge | M | Test breakpoints 320/768/1440 |
| `completed_at` field handling on revert | M | ตอน revert ต้อง set `completed_at = null` หรือ keep? (ปัจจุบัน L357-358 set ตอน → COMPLETED) — open question for plan phase |

---

## Implementation Phases

<!--
  STATUS: pending | in-progress | complete
  PARALLEL: phases that can run concurrently
  DEPENDS: phases that must complete first
-->

| # | Phase | Description | Status | Parallel | Depends | PRP Plan |
|---|-------|-------------|--------|----------|---------|----------|
| 1 | Backend audit log spike | ตรวจ audit_log model + pattern, decide manual vs middleware | complete | - | - | folded into bundled plan |
| 2 | Backend revert path + audit log | ใส่ audit log entry ตอน status revert (or middleware) | complete | - | 1 | `plans/completed/request-mgmt-features.plan.md` |
| 3 | Frontend revert kebab items | 2 DropdownMenuItem + ConfirmDialog wraps | complete | with 4 | 2 | `plans/completed/request-mgmt-features.plan.md` |
| 4 | Frontend hero merge | Restructure containers 3→1 | complete | with 3 | - | `plans/completed/request-mgmt-features.plan.md` |
| 5 | Playwright E2E for revert | Test 2 transitions + audit log assertion | complete | - | 3 | `plans/completed/request-mgmt-features.plan.md` |
| 6 | User acceptance test | Owner self-test on staging | pending | - | 4, 5 | — owner to run manually |

### Phase Details

**Phase 1: Backend audit log spike** (planning task, no code yet)
- **Goal**: ตัดสินใจ — manual insert ใน update_request endpoint หรือใช้ event-based middleware
- **Scope**: อ่าน `audit_log.py` model, ดู existing entries' shape, ตรวจ where it's written today
- **Success signal**: เลือก pattern แล้ว document ใน plan file

**Phase 2: Backend revert path + audit log**
- **Goal**: ทุก status update เขียน audit log (อย่างน้อย revert paths)
- **Scope**: `admin_requests.py:355-358` — detect revert (transition from COMPLETED → others) + insert audit_log row; handle `completed_at` reset
- **Success signal**: pytest passes + smoke test: PATCH revert returns 200 + audit_log row exists

**Phase 3: Frontend revert kebab items**
- **Goal**: 2 visible items in kebab when COMPLETED + canApprove
- **Scope**: Expand kebab visibility guard + add items + wrap onClick in ConfirmDialog
- **Success signal**: Manual test — see items only when role permits + COMPLETED status

**Phase 4: Frontend hero merge** (parallel with Phase 3)
- **Goal**: 1 card visually unified
- **Scope**: Restructure 3 `<div>` containers → 1 with internal dividers; keep all existing children layouts
- **Success signal**: DOM has 1 root section; visual on 3 breakpoints OK

**Phase 5: Playwright E2E for revert**
- **Goal**: Regression guard for both transitions + audit assertion
- **Scope**: 1 spec, 2-3 tests (admin can revert / staff cannot / audit log entry created)
- **Success signal**: Tests pass in CI

**Phase 6: User acceptance test**
- **Goal**: Owner sign-off
- **Scope**: Walkthrough — admin login → COMPLETED request → revert both directions → check audit log on backend
- **Success signal**: Owner approves merge

### Parallelism Notes

- Phase 3 (kebab items) และ Phase 4 (hero merge) แยกไฟล์/แยก concern → ทำ parallel ได้ใน PR เดียวกัน
- Phase 1+2 (backend) → frontend (Phase 3) เพราะ E2E test ต้องการ backend ที่บันทึก audit log

---

## Decisions Log

| Decision | Choice | Alternatives | Rationale |
|----------|--------|--------------|-----------|
| Revert UX | 2 kebab items (ไม่ใช่ปุ่ม + picker dialog) | ปุ่มเดียว + popup picker | User เลือก option 1 (Q1) — คลิกตรง 1 ครั้ง, pattern เดียวกับ kebab ที่มีอยู่ |
| Audit log | บันทึกอัตโนมัติทุกครั้ง | ไม่บันทึก / เลือกบันทึก | User เลือก auto (Q2) — ตรวจสอบย้อนได้, accountability |
| RBAC | Hardcoded ADMIN+SUPER_ADMIN | Configurable matrix entry | PRD C scope — keep B focused |
| State machine | Frontend gating only | Backend ALLOWED_TRANSITIONS guard | Existing pattern (revert-to-pending ใน kebab ก็ frontend-only); audit log + RBAC enough |
| Confirm dialog | warning variant | danger variant | Revert ไม่ใช่ deletion — semantic difference |
| Hero merge | Single card, internal dividers | Keep 3 cards / merge only 2 | User confirmed Q1 ของ initial PRD intake (เซสชันก่อน) |
| Color refresh | Minor tweaks only | Full Linear/Jira color redesign | Audit found current palette is fine — over-engineering risk |
| Revert จาก REJECTED | ใช้ "เปิดเรื่องใหม่" ที่มีอยู่ | เพิ่มใน kebab ด้วย | Avoid duplicate UI |

---

## Research Summary

**Market Context**
- Linear: Done → Reopen → status picker (chooses Backlog/Todo/In Progress) — matches our 2-item approach
- Jira: Reopen workflow transition typically Done → In Progress, configurable per project workflow
- Notion: Status field is free-form, no workflow guard — closest to our backend (no ALLOWED_TRANSITIONS)
- Consensus pattern: revert/reopen is supervisor-only, audit-logged, with target-state selection

**Technical Context**
- Frontend state machine: 6 buttons + kebab with 2 escape hatches (force-complete + revert-to-pending) — well-structured, easy to extend
- Backend `update_request` (PATCH): accepts any RequestStatus, no transition validation — simplifies revert addition but requires frontend + audit log discipline
- Permission keys: 3 hardcoded (`assign_request`, `self_assign_request`, `edit_permission_settings`) — `revert_approval` will be added in PRD C
- Audit log infrastructure: model + endpoint exist (`audit_log.py`, `admin_audit.py`) — need to verify auto-logging vs manual insert pattern in Phase 1 spike
- ConfirmDialog (PR #54 canonical): ReactNode description + variant prop — supports the warning UX needed for revert

---

*Generated: 2026-05-15*
*Status: DRAFT - approved by user during intake, ready for /prp-plan*
