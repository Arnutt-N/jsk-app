# Release Note: Configurable Permission Matrix — revert_approval

**Version**: PRD C  
**Date**: 2026-05-23  
**Status**: Ready for UAT  
**Branch**: `feat/configurable-permission-matrix`

---

## What Changed

เพิ่ม permission key `revert_approval` เข้าไปในระบบ permission matrix ที่ `/admin/settings/permissions` ทำให้ Super Admin สามารถเปิด/ปิดสิทธิ์ "ยกเลิกการอนุมัติ" ของแต่ละ role ได้เองผ่าน UI โดยไม่ต้องแก้โค้ดหรือ deploy ใหม่

### Before (PRD B)
- สิทธิ์ revert approval ใช้ `can_assign` (สิทธิ์มอบหมาย) เป็นตัวกรอง
- DIRECTOR และ HEAD ที่มีสิทธิ์มอบหมายก็เห็นปุ่ม revert ด้วย (ไม่ตรงกับ decision)
- ต้องแก้โค้ด + deploy เพื่อปรับสิทธิ์

### After (PRD C)
- `revert_approval` เป็น permission key แยกใน `permission_settings` table
- Default: เฉพาะ **SUPER_ADMIN** และ **ADMIN** เท่านั้นที่ revert ได้
- Super Admin ปรับสิทธิ์เองได้ที่ `/admin/settings/permissions` ภายใน 30 วินาที

---

## UAT Checklist สำหรับ Super Admin

### 1. Matrix UI แสดง 4 แถว

- [ ] เปิด `/admin/settings/permissions`
- [ ] เห็นแถว "ยกเลิกการอนุมัติ" เป็นแถวที่ 4 (ต่อจาก "แก้ไขการตั้งค่าสิทธิ์")
- [ ] Checkbox แสดงสถานะถูกต้องตาม default (SUPER_ADMIN ✅, ADMIN ✅, อื่นๆ ❌)

### 2. Toggle สิทธิ์

- [ ] ติ๊ก checkbox ของ DIRECTOR ในแถว "ยกเลิกการอนุมัติ" → กดบันทึก → สำเร็จ
- [ ] กลับมาหน้าเดิม → DIRECTOR มี checkbox ถูกติ๊ก
- [ ] ถอดติ๊ก DIRECTOR → กดบันทึก → สำเร็จ
- [ ] กลับมาหน้าเดิม → DIRECTOR ไม่มี checkbox ถูกติ๊ก

### 3. Lockout Safeguard

- [ ] ลองถอดติ๊ก SUPER_ADMIN ในแถว "แก้ไขการตั้งค่าสิทธิ์" → ระบบไม่ยอม (ป้องกัน lockout)
- [ ] SUPER_ADMIN ถอดติ๊กตัวเองในแถว "ยกเลิกการอนุมัติ" ได้ (ไม่ lockout เพราะยังเข้า Settings ได้)

### 4. Frontend — Kebab Menu Gating

- [ ] เปิด request ที่สถานะ COMPLETED ด้วย role ADMIN → เห็นเมนู "ยกเลิกอนุมัติ" ใน kebab menu
- [ ] เปิด request ที่สถานะ COMPLETED ด้วย role DIRECTOR (ที่ถูกถอดสิทธิ์) → ไม่เห็นเมนู "ยกเลิกอนุมัติ"
- [ ] เปิด request ที่สถานะอื่น (PENDING, IN_PROGRESS, AWAITING_APPROVAL) → ไม่เห็นเมนู "ยกเลิกอนุมัติ"

### 5. Backend Guard (403)

- [ ] ลอง PATCH request COMPLETED กลับไป AWAITING_APPROVAL ด้วย role ที่ไม่มีสิทธิ์ → ได้ 403 "คุณไม่มีสิทธิ์ยกเลิกการอนุมัติ"
- [ ] ลอง PATCH ด้วย role ที่มีสิทธิ์ → สำเร็จ

### 6. Audit Log

- [ ] ทำ revert approval → ตรวจสอบ `audit_log` table มี row ที่ `action='revert_approval'`

---

## Files Changed

| File | Action | Description |
|---|---|---|
| `backend/app/core/permissions.py` | UPDATED | เพิ่ม KEY_REVERT, DEFAULT_POLICY, can_revert_approval() |
| `backend/app/api/v1/endpoints/settings.py` | UPDATED | เพิ่ม can_revert_approval ใน schema + response |
| `backend/app/api/v1/endpoints/admin_requests.py` | UPDATED | เพิ่ม 403 guard สำหรับ revert |
| `frontend/lib/permissions.ts` | UPDATED | เพิ่ม can_revert_approval ใน interface |
| `frontend/app/admin/requests/[id]/page.tsx` | UPDATED | gate kebab menu ด้วย canRevertApproval |
| `backend/tests/test_permissions.py` | CREATED | 10 unit tests (all passing) |
| `frontend/e2e/permission-settings.spec.ts` | UPDATED | E2E test สำหรับ revert_approval row |

---

## Rollback Plan

หากมีปัญหา:
1. ปิดสิทธิ์ revert_approval ของ role ที่มีปัญหาผ่าน Settings UI (ไม่ต้อง deploy)
2. หากต้อง rollback ทั้งหมด: revert branch → deploy → ระบบกลับไปใช้ `can_assign` เดิม

---

## Notes

- **Backward Compatible**: Frontend เก่า (ก่อน deploy PRD C) ยังใช้ `can_assign` ได้ ไม่ break
- **Self-heal**: `ensure_seed_rows()` จะ insert `revert_approval` row อัตโนมัติหากยังไม่มีใน DB
- **No migration needed**: ใช้ self-heal mechanism แทน alembic migration

---

*Report generated: 2026-05-23*  
*Implementation report: `.claude/PRPs/reports/configurable-permission-matrix-report.md`*
