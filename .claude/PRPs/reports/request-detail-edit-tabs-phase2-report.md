# Phase 2 Report: Frontend Edit Mode — แท็บรายละเอียดคำร้อง + ข้อมูลผู้ติดต่อ

**Date:** 2026-06-10
**Scope:** `frontend/app/admin/requests/[id]/page.tsx`
**Depends on:** Phase 1 (Backend `RequestUpdate` schema + `update_request` endpoint — เสร็จแล้ว, ผ่าน review APPROVE)

## What Was Implemented

### 1. แท็บ "รายละเอียดคำร้อง" (details tab)
- ปุ่ม "แก้ไข" มุมขวาบน → เข้าสู่ edit mode พร้อม snapshot ค่าปัจจุบันลง `detailsFormData`
- **หมวดหมู่**: เปลี่ยนจาก text input เป็น `<select>` จาก `CATEGORIES` (`@/lib/constants/categories`)
  - Legacy value ที่ไม่อยู่ในรายการปัจจุบันจะถูกเพิ่มเป็น option แรก เพื่อไม่ให้เปิด edit mode แล้วข้อมูลเปลี่ยนเองเงียบๆ
  - เปลี่ยนหมวดหมู่ → ล้าง `topic_subcategory` อัตโนมัติ (กันค่าย่อยที่ไม่สัมพันธ์กัน)
- **ประเภท**: ถ้าหมวดหมู่คือ "แจ้งเบาะแสยาเสพติด" ใช้ `<select>` จาก `DRUG_REPORTING_SUBCATEGORIES` มิฉะนั้นเป็น text input อิสระ
- **รายละเอียดเพิ่มเติม**: textarea
- ปุ่ม บันทึก/ยกเลิก: บันทึกส่งเฉพาะ field ที่เปลี่ยนจริง (diff กับ `request`) ผ่าน `handleUpdateField` → PATCH `/admin/requests/{id}`

### 2. แท็บ "ข้อมูลผู้ติดต่อ" (contact tab)
- ปุ่ม "แก้ไข" → ฟอร์ม 9 ช่อง: คำนำหน้า, ชื่อ, นามสกุล, โทรศัพท์, อีเมล, หน่วยงาน, ตำบล/แขวง, อำเภอ/เขต, จังหวัด
- ทุก input มี `<label htmlFor>` ครบ (accessibility)
- บันทึกส่งเฉพาะ field ที่เปลี่ยน — ไม่ส่ง field ที่ไม่แตะ (สอดคล้องกับ PATCH semantic ฝั่ง backend: `None` = ไม่อัปเดต)
- Backend จะ recompute `requester_name` อัตโนมัติเมื่อ prefix/firstname/lastname เปลี่ยน (ทำไว้ใน Phase 1)

### 3. Behavior / Safety
- ใช้ `useGuardedUpdate` แยก guard ต่อแท็บ (`savingDetails`, `savingContact`) — กันดับเบิลคลิก และไม่ล็อกปุ่ม workflow ใน hero
- Save ล้มเหลว → toast error และ **คงอยู่ใน edit mode** (ข้อมูลที่พิมพ์ไม่หาย)
- ไม่มีการเปลี่ยนแปลง → ปิด edit mode เฉยๆ ไม่ยิง API
- ลบ TODO comments เดิมทั้ง 2 จุด (details tab + contact tab) ออกแล้ว — `grep TODO` = 0 matches

## Validation Evidence

| Check | Command | Result |
|-------|---------|--------|
| Type check | `npx tsc --noEmit` | ✅ exit 0 |
| Lint | `npx eslint "app/admin/requests/[id]/page.tsx"` | ✅ 0 errors (1 pre-existing warning: `handleDueDateChange` missing `setManageFormData` dep — มีก่อน Phase 2, ไม่เกี่ยวกับงานนี้) |
| Unit tests | `npx vitest run` | ✅ 52/52 passed (5 files) |

## Known Limitations / Next Phases
- **Phase 3 (pending):** Permission check — ปัจจุบันทุก admin role เห็นปุ่มแก้ไข (backend ก็ไม่จำกัด)
- **Phase 4 (optional):** Audit log การแก้ไข contact/details, confirmation dialog ก่อนบันทึก
- **MEDIUM ค้างจาก review:** การส่ง empty string = clear ค่า เป็น behavior ที่ยอมรับแล้ว — frontend ส่งเฉพาะ field ที่เปลี่ยน จึงเกิดเฉพาะเมื่อผู้ใช้ตั้งใจลบค่าในช่องนั้น
- แท็บ details/contact ยังไม่มี dirty-state tab-switch confirmation แบบแท็บ manage (กดเปลี่ยนแท็บระหว่างแก้ = ทิ้งการแก้ไข) — พิจารณาเพิ่มใน polish round ถัดไป
