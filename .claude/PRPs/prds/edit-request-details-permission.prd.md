# PRD D: Edit Request Details Permission (edit_request_details)

## Problem Statement

ฟีเจอร์แก้ไขแท็บ "รายละเอียดคำร้อง" และ "ข้อมูลผู้ติดต่อ" ที่หน้า `/admin/requests/[id]` (PR #82) เปิดให้**ทุก admin role แก้ไขข้อมูลคำร้องของประชาชนได้โดยไม่มีการกั้นสิทธิ์** — ปุ่มแก้ไขแสดงให้ทุกคน และ backend ไม่ตรวจสิทธิ์ก่อนบันทึก 12 field ใหม่ ทำให้ role ระดับปฏิบัติการ (AGENT) แก้ข้อมูลส่วนบุคคล เช่น เบอร์โทร ที่อยู่ รายละเอียดเรื่องร้องเรียน ได้โดยไม่มีอำนาจ และ Super Admin ไม่มีเครื่องมือควบคุมนโยบายนี้

## Evidence

- Phase 2 report (`request-detail-edit-tabs-phase2-report.md:39`): "Phase 3 (pending): Permission check — ปัจจุบันทุก admin role เห็นปุ่มแก้ไข (backend ก็ไม่จำกัด)"
- Codebase audit: `backend/app/api/v1/endpoints/admin_requests.py:441-477` อัปเดต detail/contact fields โดยไม่มี permission check (ขณะที่ assignment L367-381 และ revert L390-405 มี guard แล้ว)
- Codebase audit: `frontend/app/admin/requests/[id]/page.tsx:975, 1157` ปุ่ม "แก้ไข" ทั้ง 2 แท็บ render โดยไม่เช็คสิทธิ์ใดๆ

## Proposed Solution

เพิ่ม permission key ใหม่ `edit_request_details` (key เดียวคุมทั้งแท็บ details และ contact) เข้า `permission_settings` table ตาม pattern เดิมของ `revert_approval` (PRD C) — backend helper `can_edit_request_details()` ตรวจสิทธิ์ใน `update_request` เฉพาะเมื่อ PATCH มี field ใน 12 ตัว, frontend ซ่อนปุ่มแก้ไขผ่าน `usePermissions()`, และแถวใหม่ปรากฏใน matrix UI ที่ `/admin/settings/permissions` ให้ Super Admin ติ๊กปรับเองได้โดยไม่ต้อง deploy

ทางเลือก hardcode role ถูกปัดตกเพราะ permission matrix infrastructure พร้อมแล้ว (ทำซ้ำ pattern ที่ 5) และเปลี่ยนนโยบายภายหลังได้โดยไม่ต้องแก้โค้ด

## Key Hypothesis

We believe **การเพิ่ม `edit_request_details` ใน permission matrix พร้อม guard ทั้ง backend และ frontend** will **กั้นการแก้ไขข้อมูลคำร้องให้เหลือเฉพาะ role ที่ได้รับมอบหมาย** for **Super Admin/Admin ผู้ดูแลนโยบายข้อมูลประชาชน**.
We'll know we're right when **role ที่ไม่มีสิทธิ์ไม่เห็นปุ่มแก้ไข + เรียก PATCH field เหล่านี้ตรงๆ ได้ 403 และ Super Admin เปิด/ปิดสิทธิ์ผ่าน Settings UI ได้โดยไม่ต้อง deploy**.

## What We're NOT Building

- **Audit log การแก้ไข field** — เลื่อนไป Phase 4 ของ feature เดิม (ใช้ infrastructure `audit_log` ที่มีอยู่ได้ภายหลัง)
- **แยก key details / contact** — ตัดสินใจใช้ key เดียว เพราะการใช้งานจริงคนแก้มักแก้ทั้งคู่ และลดความซับซ้อนของ matrix
- **Lockout safeguard สำหรับ key นี้** — ถอด SUPER_ADMIN ออกได้ เพราะไม่ใช่ key ควบคุมการเข้าถึงระบบ (ติ๊กกลับได้เสมอ ไม่เกิด self-lockout)
- **Per-user override** — สิทธิ์อิงจาก role เท่านั้น (สอดคล้อง PRD C)
- **Real-time push สิทธิ์ใหม่** — reload page เพียงพอ (สอดคล้อง PRD C)

## Success Metrics

| Metric | Target | How Measured |
|--------|--------|--------------|
| Backend guard coverage | 100% — role ไม่มีสิทธิ์ได้ 403 ทุก field ใน 12 ตัว | pytest: parametrized role tests |
| Frontend gating | ปุ่มแก้ไขซ่อนสำหรับ role ไม่มีสิทธิ์ | vitest/E2E assertion |
| Policy change without deploy | 0 deploys — ติ๊กผ่าน Settings UI | Manual UAT < 30 วินาที |
| Workflow ไม่ถูกกระทบ | AGENT ยังมอบหมาย/เปลี่ยนสถานะได้ตามสิทธิ์เดิม | pytest: PATCH workflow-only fields ผ่านโดยไม่เช็ค key ใหม่ |

## Open Questions

- [x] `ensure_seed_rows()` เพียงพอสำหรับ seed key ใหม่ — ยืนยันตอน plan: revert_approval ไม่มี alembic migration ของตัวเอง ใช้ self-heal seed อย่างเดียว
- [ ] Frontend ควร disable ปุ่ม (เห็นแต่กดไม่ได้) หรือซ่อนปุ่มไปเลย? → default: ซ่อน (สอดคล้องกับ kebab revert ที่ซ่อนเมื่อไม่มีสิทธิ์)

---

## Users & Context

**Primary User**
- **Who**: Super Admin / Admin ผู้กำหนดนโยบายการเข้าถึงข้อมูลประชาชนขององค์กร
- **Current behavior**: ไม่มีทางควบคุม — ทุก role แก้ข้อมูลคำร้องได้หมด
- **Trigger**: ฟีเจอร์แก้ไขเพิ่งขึ้น production (PR #82) และต้องกำหนดว่าใครมีอำนาจแก้ข้อมูลที่ประชาชนยื่นเข้ามา
- **Success state**: เปิด `/admin/settings/permissions` เห็นแถว "แก้ไขข้อมูลคำร้อง" ติ๊กกำหนด role ได้เอง — role ที่ไม่ได้ติ๊กไม่เห็นปุ่มแก้ไขและ backend ปฏิเสธ

**Job to Be Done**
When **มีการเพิ่มความสามารถแก้ไขข้อมูลคำร้องเข้าระบบ**, I want to **กำหนดเองได้ว่า role ไหนแก้ได้**, so I can **ปกป้องข้อมูลประชาชนจากการแก้ไขโดยไม่มีอำนาจ โดยไม่ต้องรอ dev**.

**Non-Users**
- **LIFF users (ประชาชน)** — ไม่เห็น admin panel ไม่กระทบ
- **AGENT/USER** — ได้รับผลของนโยบาย (default: แก้ไม่ได้) แต่ไม่ใช่ผู้ตั้งนโยบาย
- **Developer** — หลังจากนี้ไม่ต้องแก้โค้ดเพื่อปรับสิทธิ์ key นี้อีก

---

## Solution Detail

### Core Capabilities (MoSCoW)

| Priority | Capability | Rationale |
|----------|------------|-----------|
| Must | Key `edit_request_details` ใน DEFAULT_POLICY + seed (default: SUPER_ADMIN, ADMIN) | core ของ PRD นี้ ตาม decision |
| Must | Backend helper `can_edit_request_details()` + guard ใน `update_request` เฉพาะเมื่อ PATCH มี detail/contact field | defense in depth; ต้องไม่กระทบ workflow path |
| Must | `PermissionSummary` + endpoint `/me` ส่ง `can_edit_request_details` | frontend ต้องรู้สิทธิ์ |
| Must | Frontend ซ่อนปุ่ม "แก้ไข" ทั้ง 2 แท็บเมื่อไม่มีสิทธิ์ | UX สอดคล้องนโยบาย |
| Must | แถวใหม่ใน matrix UI พร้อมคำอธิบายภาษาไทย | Super Admin ปรับเองได้ |
| Should | pytest ครอบ guard ทุก role + ครอบ workflow-only PATCH ไม่โดน guard | กัน regression |
| Should | E2E: matrix แสดงแถวใหม่ | สอดคล้อง pattern `permission-settings.spec.ts` |
| Could | Description ภาษาไทยละเอียดใน Settings UI | UX nice-to-have |
| Won't | Audit log การแก้ field | → Phase 4 feature เดิม |
| Won't | แยก key details/contact, per-user override, lockout, real-time push | scope decisions ข้างต้น |

### MVP Scope

Key เดียว `edit_request_details` + backend 403 guard + frontend ซ่อนปุ่ม + matrix row + tests — เพียงพอพิสูจน์ hypothesis ว่านโยบายบังคับได้จริงและปรับได้โดยไม่ deploy

### User Flow

1. Super Admin เปิด `/admin/settings/permissions` → เห็นแถว "แก้ไขข้อมูลคำร้อง (รายละเอียด/ผู้ติดต่อ)" → ติ๊ก role ที่ต้องการ → บันทึก
2. AGENT (ไม่มีสิทธิ์) เปิด `/admin/requests/[id]` → แท็บ details/contact แสดงข้อมูลอ่านอย่างเดียว ไม่มีปุ่มแก้ไข
3. ADMIN (มีสิทธิ์) → เห็นปุ่มแก้ไข ใช้งานได้ตามเดิม
4. ผู้ไม่มีสิทธิ์ยิง PATCH ตรงด้วย field ต้องห้าม → 403 พร้อมข้อความภาษาไทย

---

## Technical Approach

**Feasibility**: HIGH — ทำซ้ำ pattern ที่ proven แล้ว 4 รอบ (`assign_request`, `self_assign_request`, `edit_permission_settings`, `revert_approval`)

**Architecture Notes**
- Backend: `backend/app/core/permissions.py` — เพิ่ม `KEY_EDIT_REQUEST_DETAILS = "edit_request_details"` (L40-43 pattern), DEFAULT_POLICY entry `{SUPER_ADMIN, ADMIN}` (L47-68), helper `can_edit_request_details()` (L217-234 pattern)
- Guard point: `admin_requests.py` `update_request` — ตรวจ**ก่อน** apply L441-477 เฉพาะเมื่อ `update_data` มี field ใดใน 12 ตัว (topic_category, topic_subcategory, description, prefix, firstname, lastname, phone_number, email, sub_district, district, province, agency) — workflow fields (status, priority, assignment, notes) ไม่แตะ guard นี้
- Seed: ตาม pattern revert_approval — `ensure_seed_rows()` (permissions.py:139-184) self-heal อยู่แล้ว + พิจารณา alembic migration seed (ตรวจแนวทาง revert_approval ตอน plan)
- API: `settings.py` PermissionSummary (L42-50) เพิ่ม field + endpoint `/me` เพิ่ม boolean
- Frontend: `lib/permissions.ts` `MyPermissions` interface (L18-24) เพิ่ม `can_edit_request_details`; `requests/[id]/page.tsx` ใช้ `permissions?.can_edit_request_details ?? false` ซ่อนปุ่ม L975, L1157 (pattern เดียวกับ `canRevertApproval` L627-628)
- Matrix UI: แถวใหม่ปรากฏอัตโนมัติเพราะ render จาก `rules` ที่ API ส่งมา — ไม่ต้องแก้ page.tsx ยกเว้นไม่เพิ่ม lockout

**Technical Risks**

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Guard บล็อก workflow PATCH ของ AGENT โดยไม่ตั้งใจ | M | ตรวจเฉพาะเมื่อมี field ใน 12 ตัว + pytest ครอบ workflow-only payload |
| `?? false` ระหว่าง permissions ยัง loading ทำปุ่มกระพริบ/หาย | L | pattern เดียวกับ canRevertApproval ที่ใช้อยู่ — ยอมรับ behavior เดิม |
| Frontend เก่า (ยังไม่ deploy) เรียก PATCH โดยไม่รู้สิทธิ์ | L | Backend 403 + frontend แสดง error toast ตาม error handling เดิม — backward compatible |

---

## Implementation Phases

<!--
  STATUS: pending | in-progress | complete
  PARALLEL: phases that can run concurrently
  DEPENDS: phases that must complete first
  PRP: link to generated plan file once created
-->

| # | Phase | Description | Status | Parallel | Depends | PRP Plan |
|---|-------|-------------|--------|----------|---------|----------|
| 1 | Backend permission key + guard | Key, DEFAULT_POLICY, helper, seed, guard ใน update_request, PermissionSummary + /me, pytest | complete | - | - | [plan](../plans/completed/edit-request-details-permission-phase1.plan.md) · [report](../reports/edit-request-details-permission-phase1-report.md) |
| 2 | Frontend permission gating | MyPermissions interface, ซ่อนปุ่มแก้ไข 2 แท็บ, vitest | complete | - | 1 | [plan](../plans/completed/edit-request-details-permission-phase2.plan.md) · [report](../reports/edit-request-details-permission-phase2-report.md) |
| 3 | E2E + validation | Playwright matrix row test, UAT ทุก role, รายงานผล | complete | - | 2 | [report](../reports/edit-request-details-permission-phase3-report.md) |

### Phase Details

**Phase 1: Backend permission key + guard**
- **Goal**: Backend บังคับนโยบายได้สมบูรณ์ก่อน frontend แตะอะไร
- **Scope**: `permissions.py` (key/policy/helper), seed (ensure_seed_rows + migration ถ้าจำเป็น), `admin_requests.py` guard เฉพาะ 12 field, `settings.py` summary + /me, pytest ครอบทุก role และ workflow-only payload
- **Success signal**: pytest เขียว; PATCH field ต้องห้ามด้วย AGENT ได้ 403; PATCH workflow ด้วย AGENT ได้ตามสิทธิ์เดิม

**Phase 2: Frontend permission gating**
- **Goal**: UI สะท้อนนโยบาย — role ไม่มีสิทธิ์ไม่เห็นปุ่มแก้ไข
- **Scope**: `lib/permissions.ts` interface, `requests/[id]/page.tsx` gate ปุ่ม 2 จุด, vitest, ยืนยันแถว matrix ปรากฏ
- **Success signal**: `npx tsc --noEmit` + vitest เขียว; ปุ่มหายเมื่อ mock permissions ไม่มีสิทธิ์

**Phase 3: E2E + validation**
- **Goal**: พิสูจน์ end-to-end ว่าครบตาม success metrics
- **Scope**: เพิ่ม assertion ใน `permission-settings.spec.ts` (แถวใหม่ + label ไทย), UAT manual ตาม user flow, completion report
- **Success signal**: CI เขียวครบรวม Playwright Smoke; UAT ผ่านทุกข้อ

### Parallelism Notes

ทั้ง 3 phase เป็นลำดับ (sequential) — Phase 2 ต้องรอ API ส่ง boolean ใหม่จาก Phase 1, Phase 3 ต้องรอ UI จาก Phase 2 — แต่งานทั้งหมดเล็กพอที่จะรวมเป็น PR เดียวได้

---

## Decisions Log

| Decision | Choice | Alternatives | Rationale |
|----------|--------|--------------|-----------|
| แนวทางกำหนดสิทธิ์ | Permission matrix (DB-backed) | Hardcode role ในโค้ด | Infrastructure พร้อมแล้ว, ปรับนโยบายโดยไม่ deploy, สอดคล้อง PRD C |
| จำนวน key | Key เดียวคุมทั้ง 2 แท็บ | แยก details/contact เป็น 2 key | คนแก้มักแก้ทั้งคู่, matrix เรียบง่ายกว่า |
| Default policy | SUPER_ADMIN + ADMIN | ถึง DIRECTOR/HEAD, ถึง AGENT | เข้มงวดไว้ก่อน — เพิ่ม role อื่นทีหลังผ่าน matrix ได้ทันที |
| Lockout safeguard | ไม่มี | มีเหมือน revert_approval | ไม่ใช่ key ควบคุมการเข้าถึงระบบ — ไม่มีความเสี่ยง self-lockout |
| ปุ่มเมื่อไม่มีสิทธิ์ | ซ่อน | disable พร้อม tooltip | สอดคล้อง pattern kebab revert ที่ซ่อนเมื่อไม่มีสิทธิ์ |

---

## Research Summary

**Market Context**
ฟีเจอร์ภายใน — ไม่ทำ market research; อ้างอิง pattern ภายใน repo (PRD C: configurable-permission-matrix) เป็น prior art โดยตรง

**Technical Context**
- Permission matrix Stage 2 (DB-backed) พร้อมใช้: `permission_settings` table (JSONB allowed_roles), in-process cache + invalidation, `ensure_seed_rows()` self-heal bootstrap, GET/PATCH endpoint ที่ `settings.py:86-181`
- Frontend: `usePermissions()` hook + session cache ที่ `lib/permissions.ts`, matrix UI render จาก API rules (แถวใหม่อัตโนมัติ)
- Gap ที่ยืนยันแล้ว: `admin_requests.py:441-477` ไม่มี guard, ปุ่มแก้ไข `page.tsx:975, 1157` ไม่เช็คสิทธิ์
- Test patterns: `backend/tests/test_permissions.py` (parametrized role tests), `frontend/e2e/permission-settings.spec.ts` (matrix assertions, ไม่ mutate shared DB)

---

*Generated: 2026-06-11*
*Status: DRAFT - needs validation*
