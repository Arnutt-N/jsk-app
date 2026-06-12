# Audit Log การแก้ไขข้อมูลคำร้อง (Request Edit Audit Log)

> Phase 4 (ส่วนสุดท้าย) ของ feature ชุด "editable details/contact tabs" — ต่อจาก
> PR #82 (แก้ไขได้) และ PR #85 (จำกัดสิทธิ์, PRD [edit-request-details-permission](edit-request-details-permission.prd.md))

## Problem Statement

Admin ที่มีสิทธิ์ (SUPER_ADMIN/ADMIN) แก้ไขข้อมูลคำร้องของประชาชนได้โดยไม่ทิ้งหลักฐานใด ๆ —
ถ้าข้อมูลถูกแก้ผิดหรือมีข้อพิพาทว่า "ข้อมูลเดิมเขียนว่าอะไร" หัวหน้างาน/ผู้ตรวจสอบตอบไม่ได้
ทั้งที่เป็นคำร้องราชการ ระบบมีแค่ `updated_at` (รู้ว่าแก้เมื่อไร แต่ไม่รู้ใครแก้อะไร)

## Evidence

- Phase 2 report ของ feature เดิม (`request-detail-edit-tabs-phase2-report.md`) ระบุ audit log เป็น known gap ที่เลื่อนมา Phase 4
- `update_request` บันทึก audit อยู่แล้วเฉพาะ `unassign` (admin_requests.py:446) และ `revert_approval` (admin_requests.py:503) — การแก้ field 12 ตัวไม่บันทึกอะไรเลย
- PRD edit-request-details-permission ระบุ Won't: "Audit log การแก้ field → Phase 4 feature เดิม"

## Proposed Solution

บันทึก audit entry ทุกครั้งที่ PATCH แก้ detail/contact field สำเร็จ (action `edit_request_details`,
details เก็บ diff `{field: {old, new}}` เฉพาะ field ที่ค่าเปลี่ยนจริง) ผ่าน `create_audit_log()`
ที่มีอยู่ — แล้วแสดงประวัติแทรกใน timeline เดิมของแท็บ "การดำเนินงาน/ความเห็น" บนหน้า request detail
เพื่อให้ประวัติทุกอย่าง (มอบหมาย/สถานะ/แก้ข้อมูล/ความเห็น) อ่านเป็นเส้นเรื่องเดียวเรียงตามเวลา

เลือกแนวทางนี้แทน (ก) section แยกตามแท็บ — กระจายประวัติ 3 ที่ ผู้ตรวจต้องปะติดปะต่อเอง และ
(ข) ตารางใหม่เฉพาะ field history — `audit_logs.details` JSONB รองรับ diff ได้อยู่แล้ว ไม่ต้อง migration

## Key Hypothesis

เราเชื่อว่า การบันทึก diff ค่าเดิม→ค่าใหม่ + แสดงใน timeline จะทำให้หัวหน้างาน/ผู้ตรวจสอบ
ตรวจการแก้ข้อมูลคำร้องย้อนหลังได้ครบ 100% — เราจะรู้ว่าถูกเมื่อทุก PATCH ที่แก้ field
สร้าง audit entry ครบ (ใคร, field, old→new, เมื่อไร) และเปิดดูได้จากหน้า request detail

## What We're NOT Building

- **Retention / ลบ log อัตโนมัติ** — ยังไม่มีข้อกำหนด เก็บยาวไปก่อน
- **Export ประวัติ (CSV/PDF)** — ยังไม่มีผู้ขอใช้
- **หน้า audit viewer รวมทั้งระบบ** — `/admin/audit/logs` API มีอยู่แล้ว UI รวมเป็นเรื่องอนาคต
- **Audit การแก้จากช่องทางอื่น** — admin UI เป็นช่องทางแก้ไขเดียวในปัจจุบัน
- **Permission key ใหม่สำหรับดู log** — ทุก admin role ที่เปิดหน้า request ได้เห็นประวัติได้ (ตัดสินใจแล้ว)

## Success Metrics

| Metric | Target | How Measured |
|--------|--------|--------------|
| ความครบของ audit | 100% ของ PATCH ที่เปลี่ยน detail/contact field สร้าง entry พร้อม diff | pytest: PATCH แล้ว assert AuditLog ถูก add พร้อม old/new ถูกต้อง |
| ไม่บันทึก noise | ส่ง field มาแต่ค่าเท่าเดิม = ไม่อยู่ใน diff; payload workflow-only = ไม่มี entry | pytest เคสค่าเท่าเดิม + workflow-only |
| UI แสดงประวัติ | เปิดแท็บการดำเนินงานเห็น entry การแก้ไขเรียงเวลาแทรกกับ comment | Playwright/UAT |
| ไม่กระทบ workflow เดิม | test เดิมทั้งหมดผ่านโดยไม่แก้ | pytest + vitest เดิมเขียว |

## Open Questions

- [ ] ชื่อ field ภาษาไทยใน timeline — ใช้ mapping กลางที่ frontend (Should) ตำแหน่งไฟล์ตัดสินตอน plan
- [ ] ลำดับการ merge audit + comments ใน timeline เมื่อ timestamp เท่ากัน (edge case เล็ก ตัดสินตอน implement)

---

## Users & Context

**Primary User**
- **Who**: หัวหน้างาน/ผู้ตรวจสอบ (และ admin ทุก role) ที่ต้องตอบว่า "ข้อมูลคำร้องนี้ถูกใครแก้ อะไร เมื่อไร"
- **Current behavior**: ดูได้แค่ `updated_at` แล้วเดา หรือถามต่อกันปากเปล่า
- **Trigger**: ข้อมูลในคำร้องดูไม่ตรงกับที่ประชาชนยื่น / มีข้อพิพาท / ตรวจงานประจำ
- **Success state**: เปิดแท็บการดำเนินงาน เห็นทันทีว่า "สมชาย แก้เบอร์โทรศัพท์ จาก 081... เป็น 089... เมื่อ 12 มิ.ย."

**Job to Be Done**
เมื่อข้อมูลคำร้องถูกตั้งคำถามหรือถูกตรวจสอบ ฉันต้องการเห็นประวัติการแก้ไขครบทุกครั้งเรียงตามเวลา
เพื่อยืนยันได้ว่าใครเปลี่ยนอะไรและข้อมูลเดิมคืออะไร

**Non-Users**
ประชาชนผู้ยื่นคำร้อง (LIFF) — ไม่เห็นประวัติฝั่ง admin

---

## Solution Detail

### Core Capabilities (MoSCoW)

| Priority | Capability | Rationale |
|----------|------------|-----------|
| Must | บันทึก audit entry พร้อม diff `{field: {old, new}}` เฉพาะ field ที่ค่าเปลี่ยนจริง | หัวใจของ feature — ตอบ "ข้อมูลเดิมคืออะไร" ได้ |
| Must | API ดึง audit ราย request (เพิ่ม filter `resource_id` ให้ `/admin/audit/logs` หรือ endpoint ย่อยของ request) | ช่องว่างที่พบ — API เดิม filter ราย resource ไม่ได้ |
| Must | แทรก entry การแก้ไขใน timeline แท็บ "การดำเนินงาน/ความเห็น" เรียงเวลา | ตัดสินใจแล้ว: ประวัติรวมจุดเดียว |
| Should | แสดงชื่อ field เป็นภาษาไทย (เช่น "เบอร์โทรศัพท์") | อ่านง่ายสำหรับ non-technical |
| Could | แสดง entry มอบหมาย/เปลี่ยนสถานะเดิมใน timeline ด้วย (unassign, revert_approval) | ได้ฟรีจาก API เดียวกัน — ถ้าไม่เพิ่ม scope มาก |
| Won't | Retention, export, audit viewer รวม, permission key ดู log | ดูหัวข้อ What We're NOT Building |

### MVP Scope

Backend สร้าง entry + API ดึงราย request + frontend แทรก timeline — แค่นี้ hypothesis ทดสอบได้ครบ

### User Flow

ADMIN แก้เบอร์โทรในแท็บผู้ติดต่อ → บันทึก → ผู้ตรวจเปิดคำร้องเดิม → แท็บการดำเนินงาน/ความเห็น →
เห็น entry "แก้ไขข้อมูลผู้ติดต่อ" พร้อม field/ค่าเดิม/ค่าใหม่/ชื่อคนแก้/เวลา แทรกตามลำดับเวลา

---

## Technical Approach

**Feasibility**: HIGH — ทุกชิ้นมี pattern ใน codebase แล้ว

**Architecture Notes**
- Capture diff ใน `update_request` (admin_requests.py): จุดที่ guard `is_editing_details` คำนวณอยู่แล้ว
  มี `EDITABLE_DETAIL_CONTACT_FIELDS` ครบ 12 field — อ่านค่าเดิมจาก `request` ก่อน apply, เทียบหลัง apply
- ใช้ `create_audit_log()` (core/audit.py:97) ตาม pattern `revert_approval` — flush ไม่ commit, caller commit
- `audit_logs.details` เป็น JSONB — เก็บ `{"fields": {field: {"old": ..., "new": ...}}}` ได้โดยไม่ต้อง migration
- API: เพิ่ม `resource_id` filter ให้ `GET /admin/audit/logs` (เปลี่ยนแบบ additive — client เดิมไม่กระทบ)
- Frontend: fetch audit ของ request → map เป็น timeline entry แทรกกับ `comments` เรียงตาม `created_at`
  (reuse bubble/dot style เดิม — เพิ่ม tint ใหม่สำหรับ "แก้ไขข้อมูล")
- PII (ชื่อ/เบอร์/อีเมล) ใน log: ยอมรับ — อยู่ใน DB เดียวกับที่เก็บ PII ต้นทางอยู่แล้ว, ทุก admin role เห็นได้ (ตัดสินใจแล้ว)

**Technical Risks**

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Diff ผิดเมื่อ apply ค่าก่อน capture (อ่านค่าเดิมช้าไป) | M | capture ค่าเดิมของ 12 field ก่อนถึง block "# Update fields" + pytest ยืนยัน old ถูกต้อง |
| Timeline รก เมื่อแก้ทีละหลาย field | L | 1 PATCH = 1 entry (รวมทุก field ใน entry เดียว) ไม่แตกราย field |
| `page.tsx` บวมขึ้นอีก (เกิน 800 บรรทัดอยู่แล้ว) | M | แตก component ใหม่ (เช่น `AuditTimelineEntry`) แทนการเขียน inline |

---

## Implementation Phases

<!--
  STATUS: pending | in-progress | complete
  PARALLEL: phases that can run concurrently (e.g., "with 3" or "-")
  DEPENDS: phases that must complete first (e.g., "1, 2" or "-")
  PRP: link to generated plan file once created
-->

| # | Phase | Description | Status | Parallel | Depends | PRP Plan |
|---|-------|-------------|--------|----------|---------|----------|
| 1 | Backend: capture diff + API | สร้าง audit entry พร้อม old→new ใน update_request, เพิ่ม resource_id filter, pytest | complete | - | - | [plan](../plans/completed/request-edit-audit-log-phase1.plan.md) · [report](../reports/request-edit-audit-log-phase1-report.md) |
| 2 | Frontend: timeline merge | fetch audit ราย request, แทรก timeline เรียงเวลา, ชื่อ field ไทย, component แยก | complete | - | 1 | [plan](../plans/completed/request-edit-audit-log-phase2.plan.md) · [report](../reports/request-edit-audit-log-phase2-report.md) |
| 3 | E2E + validation | Playwright/UAT ยืนยัน entry ปรากฏ, completion report | pending | - | 2 | - |

### Phase Details

**Phase 1: Backend capture diff + API**
- **Goal**: ทุกการแก้ field ถูกบันทึกครบและดึงราย request ได้
- **Scope**: `admin_requests.py` (capture old ก่อน apply → diff → `create_audit_log` action `edit_request_details`),
  `admin_audit.py` (`resource_id` filter), pytest: diff ถูกต้อง / ค่าเท่าเดิมไม่อยู่ใน diff / workflow-only ไม่มี entry / filter ทำงาน
- **Success signal**: pytest เขียวทั้งหมด รวม test เดิม 338 ตัวไม่แตก

**Phase 2: Frontend timeline merge**
- **Goal**: ผู้ตรวจเห็นประวัติแก้ไขใน timeline เดิม
- **Scope**: fetch audit logs ของ request, merge + sort กับ comments, component `AuditTimelineEntry` แยกไฟล์,
  mapping ชื่อ field ไทย (constants), tint/icon ใหม่ใน timeline
- **Success signal**: tsc + eslint + vitest เขียว; เปิดแท็บเห็น entry แทรกถูกลำดับ

**Phase 3: E2E + validation**
- **Goal**: พิสูจน์ end-to-end + ปิด feature ชุดนี้สมบูรณ์
- **Scope**: E2E assertion (แก้ field → entry ปรากฏใน timeline), UAT manual, completion report
- **Success signal**: CI เขียวครบรวม Playwright Smoke; UAT ผ่าน

### Parallelism Notes

ทั้ง 3 phase เป็นลำดับ — Phase 2 รอ API จาก Phase 1, Phase 3 รอ UI จาก Phase 2 —
ขนาดรวมเล็กพอเป็น PR เดียวเหมือนชุด edit-request-details-permission

---

## Decisions Log

| Decision | Choice | Alternatives | Rationale |
|----------|--------|--------------|-----------|
| ตำแหน่งแสดง log | รวม timeline เดิม (แท็บการดำเนินงาน) | section ต่อแท็บ / แท็บใหม่ | ประวัติอ่านเป็นเส้นเรื่องเดียว, reuse UI, ไฟล์ไม่บวม 2 จุด |
| สิทธิ์ดู log | ทุก admin role | ผูก edit_request_details / key ใหม่ | โปร่งใสสุด ไม่เพิ่ม key |
| ระดับ detail | old → new เต็ม | เฉพาะชื่อ field | ตอบ "ข้อมูลเดิมคืออะไร" ได้จริง; PII อยู่ DB เดิมอยู่แล้ว |
| Storage | `audit_logs.details` JSONB เดิม | ตารางใหม่ field_history | ไม่ต้อง migration, pattern เดิมรองรับ |
| Granularity | 1 PATCH = 1 entry รวมทุก field | 1 field = 1 entry | timeline ไม่รก, อ่านเป็นเหตุการณ์เดียว |
| บันทึกเมื่อไร | เฉพาะ field ที่ค่าเปลี่ยนจริง | ทุก field ใน payload | ลด noise (default ที่ user ยืนยัน) |

---

## Research Summary

**Market Context**
ไม่ทำ market research — internal feature ต่อยอด pattern audit ที่มีในระบบเอง
(field-level audit diff เป็น pattern มาตรฐานใน admin system ทั่วไป เช่น Django admin LogEntry)

**Technical Context**
- `backend/app/models/audit_log.py` — ตาราง `audit_logs` มี `details` JSONB พร้อมใช้
- `backend/app/core/audit.py:97` — `create_audit_log()` helper (flush, caller commit)
- `backend/app/api/v1/endpoints/admin_requests.py:415-426` — guard + `EDITABLE_DETAIL_CONTACT_FIELDS` จาก PR #85 คือจุด capture diff
- `backend/app/api/v1/endpoints/admin_requests.py:446,503` — pattern การเรียก create_audit_log ใน update_request (unassign, revert_approval)
- `backend/app/api/v1/endpoints/admin_audit.py:15` — `GET /admin/audit/logs` มี filter admin_id/action/resource_type แต่**ขาด resource_id** (gap ที่ต้องเพิ่ม)
- `frontend/app/admin/requests/[id]/page.tsx:1342-1381` — timeline UI (จุดสี + bubble, แยก SYSTEM/ADMIN) ที่จะ reuse

---

*Generated: 2026-06-12*
*Status: DRAFT - validated through interactive gates (UI placement, visibility, detail level, scope)*
