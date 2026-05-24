# PRD C: Configurable Permission Matrix

## Problem Statement

ระบบสิทธิ์สำหรับ "ยกเลิกการอนุมัติ" (revert approval) ที่เพิ่มใน PRD B ใช้ `can_assign` (สิทธิ์มอบหมาย) เป็นตัวกรอง ซึ่งให้สิทธิ์ DIRECTOR และ HEAD โดยปริยาย — แต่ revert เป็น action ที่ละเอียดอ่อนกว่ามอบหมายงาน เพราะ "ย้อน" สถานะที่อนุมัติแล้วได้ ทำให้ Super Admin ไม่สามารถจำกัดสิทธิ์เฉพาะ ADMIN+SUPER_ADMIN ได้โดยไม่ให้ dev แก้โค้ดและ deploy ใหม่

## Evidence

- PRD B session decision: revert_approval ตกลงให้ hardcode เฉพาะ ADMIN+SUPER_ADMIN ก่อน — แต่ปัจจุบันใช้ `canApprove = can_assign` ทำให้ DIRECTOR/HEAD เห็น kebab revert ด้วย (mismatch กับ decision)
- จากการ explore codebase: permission_settings infrastructure (table + matrix UI) พร้อมใช้แล้ว ตั้งแต่ Stage 2 (PR #44)
- จาก PRD B section "Out of scope": `Configurable permission matrix → PRD C` — ถูก scope ไว้ตั้งแต่ตอน plan

## Proposed Solution

เพิ่ม permission key ใหม่ `revert_approval` เข้าไปใน `permission_settings` table พร้อม backend helper `can_revert_approval()` และเพิ่มแถวใน matrix UI ที่ `/admin/settings/permissions` ให้ Super Admin/Admin ติ๊กเลือกได้ว่า role ใดมีสิทธิ์ revert approval โดยไม่ต้องแก้โค้ด — ใช้ pattern เดียวกับ `assign_request`, `self_assign_request`, `edit_permission_settings` ที่มีอยู่แล้ว

## Key Hypothesis

We believe **การย้าย revert_approval จาก hardcode ไปอยู่ใน permission_settings table** จะ **ทำให้ Super Admin ปรับสิทธิ์เองได้โดยไม่ต้องรอ dev** for **Super Admin ที่ดูแลโครงสร้างองค์กร**.
We'll know we're right when **Super Admin สามารถเปิด/ปิดสิทธิ์ revert ของ DIRECTOR/HEAD ได้ผ่าน Settings UI ภายใน 30 วินาที โดยไม่ต้อง deploy ใหม่**.

## What We're NOT Building

- **เพิ่ม role ใหม่** — ใช้ 6 roles เดิม (SUPER_ADMIN/ADMIN/DIRECTOR/HEAD/AGENT/USER) ไม่สร้าง custom role
- **Per-user override** — สิทธิ์อิงจาก role เท่านั้น ไม่มี exception รายบุคคล
- **Permission inheritance/hierarchy** — แต่ละ role independent ไม่มี logic "SUPER_ADMIN ครอบทุกสิทธิ์อัตโนมัติ"
- **Real-time push** — User ต้อง reload page เพื่อเห็นสิทธิ์ใหม่ (ไม่ทำ websocket)
- **Migrate hardcoded check อื่นๆ** — แก้เฉพาะ revert_approval ตาม scope (force_complete, reopen ยังใช้ can_assign เดิม → PRD ในอนาคต)

## Success Metrics

| Metric | Target | How Measured |
|--------|--------|--------------|
| Time to change permission | < 30 seconds | Manual UAT: เปิด Settings → ติ๊ก → บันทึก |
| Backend guard coverage | 100% | Unit tests pass + 403 returned for unauthorized roles |
| Zero downtime to change policy | 0 deploys needed | `permission_settings` table update only |
| Audit trail completeness | 100% of revert actions logged | `audit_log.action='revert_approval'` rows |

## Open Questions

- [ ] หากลบ ADMIN ออกจาก revert_approval จะ lock SUPER_ADMIN ออกได้ไหม? → ใช้ pattern เดียวกับ edit_permission_settings (refuse to remove SUPER_ADMIN)
- [ ] เมื่อ migration apply แต่ frontend ยังไม่ deploy รุ่นใหม่ → backward compatible หรือไม่? → frontend เก่าใช้ `can_assign` เดิม ไม่ break
- [ ] ต้องเตือน user ที่กำลังจะ revert เพื่อ confirm twice หรือไม่? → ConfirmDialog ที่มีอยู่แล้วจาก PRD B พอ

---

## Users & Context

**Primary User**
- **Who**: Super Admin (ผู้ดูแลระบบสูงสุด) ที่กำหนดนโยบายระดับองค์กร
- **Current behavior**: เปิด ticket ขอให้ dev แก้ permissions.py แล้วรอ deploy
- **Trigger**: โครงสร้างองค์กรเปลี่ยน, ต้องลด/เพิ่มสิทธิ์ระดับ DIRECTOR หรือ HEAD
- **Success state**: เปิด `/admin/settings/permissions` → ติ๊กถอด → บันทึก → role ที่ถูกถอดไม่เห็นเมนู revert ภายใน reload เดียว

**Job to Be Done**
When **โครงสร้างองค์กรเปลี่ยนหรือต้องการให้ role ใหม่ทำ revert ได้**, I want **ปรับสิทธิ์เองในหน้า Settings**, so I can **ไม่ต้องรอ dev แก้โค้ดและ deploy**.

**Non-Users**
- **LIFF users (ประชาชน)** — ไม่เห็น admin panel ทั้งหมด ไม่กระทบ
- **AGENT/USER** — เห็นหน้า Settings แต่เฉพาะส่วนที่เกี่ยวข้องกับตนเอง ไม่เห็นส่วน Super Admin
- **Developer** — ไม่ต้องมาแก้โค้ดสำหรับ permission tweak อีก (จะมาแก้เมื่อเพิ่ม action ใหม่ๆ เท่านั้น)

---

## Solution Detail

### Core Capabilities (MoSCoW)

| Priority | Capability | Rationale |
|----------|------------|-----------|
| Must | เพิ่ม `revert_approval` permission key ใน DB + matrix UI | core ของ PRD นี้ |
| Must | Backend guard `can_revert_approval()` ใน admin_requests endpoint | defense in depth |
| Must | Lockout safeguard: ห้ามถอด SUPER_ADMIN | กัน lock ตัวเองออก |
| Must | Default policy: ADMIN + SUPER_ADMIN เท่านั้น | sync กับ decision PRD B |
| Should | Audit log บันทึกการ revert (มีอยู่แล้วจาก PRD B) | ใช้ infrastructure เดิม |
| Should | Frontend `usePermissions()` ส่ง `can_revert_approval` boolean | ใช้ pattern เดิม |
| Could | Description ภาษาไทยใน Settings UI | UX nice-to-have |
| Won't | Per-user override | scope creep |
| Won't | Real-time refresh | reload เพียงพอ |
| Won't | Custom role creation | scope creep |

### MVP Scope

แก้ **เฉพาะ** revert_approval ให้เป็น configurable — pattern ที่ชัดเจน, scope แคบ, validate ก่อนขยายไปสิทธิ์อื่นๆ ใน PRD ในอนาคต

### User Flow

```
Super Admin เปิด /admin/settings/permissions
  ↓
เห็น 4 แถว (เพิ่มจาก 3 เดิม): assign / self_assign / edit_settings / revert_approval
  ↓
ติ๊ก/ถอดติ๊ก checkbox ใน matrix
  ↓
กดบันทึก → backend update permission_settings + invalidate cache + reload policy
  ↓
User คนอื่นที่เปิดหน้า requests detail (COMPLETED) → reload → เห็น/ไม่เห็น kebab revert ตามสิทธิ์ใหม่
```

---

## Technical Approach

**Feasibility**: 🟢 **HIGH**

**Architecture Notes**
- ใช้ infrastructure ที่มีอยู่แล้ว 100% — ไม่ต้องสร้าง table ใหม่ ไม่ต้องสร้าง endpoint ใหม่
- Pattern พิสูจน์แล้วผ่าน 3 keys ที่มีอยู่ (assign_request, self_assign_request, edit_permission_settings)
- Backend guard เพิ่มเป็น defense-in-depth — frontend filter UI, backend reject 403

**Technical Risks**

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Frontend `canApprove` (alias ของ can_assign) ถูกใช้กับ action อื่นด้วย → แก้ผิด revert items | M | Grep ทั้ง codebase, แก้เฉพาะบรรทัดที่เป็น revert kebab items |
| Migration seed ชนกับ `ensure_seed_rows` | L | ใช้ `ON CONFLICT (key) DO NOTHING` |
| User ที่เคย revert ได้ ตอนนี้ถูก lock ออกโดยไม่รู้ตัว | M | Behavior change ตั้งใจ + release note + Super Admin ปรับเองใน Settings ได้ |
| Cache invalidation race condition | L | `invalidate_cache()` + `load_policy()` after PATCH (pattern เดิม) |

---

## Implementation Phases

| # | Phase | Description | Status | Parallel | Depends | PRP Plan |
|---|-------|-------------|--------|----------|---------|----------|
| 1 | Backend permission core | เพิ่ม KEY_REVERT, can_revert_approval(), DEFAULT_POLICY entry | pending | - | - | configurable-permission-matrix.plan.md |
| 2 | Backend endpoint guard | เพิ่ม guard ใน admin_requests.py + update settings.py schema | pending | with 3 | 1 | configurable-permission-matrix.plan.md |
| 3 | Backend migration | Alembic migration seed revert_approval row | pending | with 2 | 1 | configurable-permission-matrix.plan.md |
| 4 | Frontend permission interface | Update MyPermissions interface + page.tsx revert kebab | pending | - | 2 | configurable-permission-matrix.plan.md |
| 5 | Tests + E2E | Unit tests + E2E spec update | pending | - | 4 | configurable-permission-matrix.plan.md |
| 6 | UAT + Documentation | Manual test on staging + release note | pending | - | 5 | - |

### Phase Details

**Phase 1: Backend permission core**
- **Goal**: เพิ่ม permission key ใหม่ในระบบ permission core
- **Scope**: 1 file change (`app/core/permissions.py`)
- **Success signal**: `python -c "from app.core.permissions import can_revert_approval; print(can_revert_approval('ADMIN'))"` returns `True`

**Phase 2: Backend endpoint guard**
- **Goal**: ป้องกันที่ backend layer แม้ frontend bug
- **Scope**: 2 files (`endpoints/settings.py` schema, `endpoints/admin_requests.py` guard)
- **Success signal**: PATCH request ด้วย role DIRECTOR ที่พยายาม revert → 403

**Phase 3: Backend migration**
- **Goal**: Seed default revert_approval row ใน DB
- **Scope**: 1 alembic migration file
- **Success signal**: `alembic upgrade head` สำเร็จ + row exists ใน permission_settings

**Phase 4: Frontend permission interface**
- **Goal**: เชื่อม backend ใหม่กับ UI
- **Scope**: 2 files (`lib/permissions.ts`, `app/admin/requests/[id]/page.tsx`)
- **Success signal**: Matrix UI แสดง 4 แถว, revert kebab gates by `can_revert_approval`

**Phase 5: Tests + E2E**
- **Goal**: ป้องกัน regression
- **Scope**: 1-2 test files
- **Success signal**: All tests pass ใน CI

**Phase 6: UAT + Documentation**
- **Goal**: Verify กับ Super Admin จริง
- **Scope**: Manual test checklist + brief release note
- **Success signal**: Owner sign-off

### Parallelism Notes

Phase 2 + Phase 3 รันคู่กันได้ (endpoint guard ไม่ต้องรอ migration row ก่อน เพราะ DEFAULT_POLICY fallback ครอบไว้)

---

## Decisions Log

| Decision | Choice | Alternatives | Rationale |
|----------|--------|--------------|-----------|
| Default policy | ADMIN + SUPER_ADMIN | (1) match can_assign เดิม (2) เฉพาะ SUPER_ADMIN | Sync กับ decision PRD B + lock-down approach (admin opt-in ภายหลัง) |
| Backend guard | YES, defense in depth | Frontend-only check | Security best practice — เผื่อ frontend bug |
| Audit log | ใช้ที่มีอยู่จาก PRD B | สร้าง audit เฉพาะ permission change | Reuse infrastructure |
| MVP scope | เฉพาะ revert_approval | (1) บวก force_complete + reopen (2) ทุก hardcoded check | Validate pattern ก่อน, ขยายภายหลัง |
| Lockout safeguard | ใช้ pattern เดียวกับ edit_permission_settings (ห้ามถอด SUPER_ADMIN) | ปล่อยอิสระ | กันยิงเท้าตัวเอง |

---

## Research Summary

**Market Context**
Permission matrix (role × action grid) เป็น pattern มาตรฐานใน admin panels ทั่วไป (AWS IAM, Google Workspace, Jira) — user คาดหวังจาก enterprise admin tool — ไม่มี differentiation ทางด้าน UX แต่เป็น minimum viable

**Technical Context**
- `permission_settings` table มีอยู่แล้ว (migration `n4o5p6q7r8s9`)
- Matrix editor UI สำเร็จรูปอยู่แล้ว (`/admin/settings/permissions/page.tsx`)
- Pattern `_check(role, KEY)` ทำงานผ่าน 3 keys อื่นๆ มาแล้ว
- Cache + invalidation logic มีอยู่ใน `app/core/permissions.py`
- audit_log infrastructure ใช้ใน PRD B แล้ว — re-use ได้
- Implementation plan รออยู่ที่ `.claude/PRPs/plans/configurable-permission-matrix.plan.md` (8 tasks, confidence 9/10)

---

*Generated: 2026-05-23*
*Status: DRAFT - ready for implementation*
