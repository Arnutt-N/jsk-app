# UAT Fixes Report: Request Edit Audit Log

> รอบแก้หลัง UAT ของ feature request-edit-audit-log (PR #86 merged) — 5 issues

## Issues & Resolutions

### ① [CRITICAL] Timeline ไม่แสดงรายการแก้ไข
**Root cause**: `AuditLog.created_at` ประกาศใน model เป็น `DateTime` (naive) แต่คอลัมน์จริงใน DB
(ทั้ง local และ Supabase) เป็น `timestamp with time zone`. `GET /admin/audit/logs` คำนวณ
`cutoff = datetime.now(timezone.utc) - timedelta(days=...)` ซึ่ง timezone-aware แล้ว bind เข้า query
ที่ asyncpg มอง column เป็น `TIMESTAMP WITHOUT TIME ZONE` → ปฏิเสธ → **500 ทุก call**

**ทำไมหลุด CI**: graceful degradation (audit fetch ล้ม → log + แสดง comments ต่อ) กลบ 500 จาก
E2E render-safety test ที่เช็คแค่ "หน้าไม่ crash"

**Fix**:
- `models/audit_log.py`: `created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True)` — ทำให้ตรงกับ DB จริง (ไม่ต้อง migration เพราะ DDL ตรงอยู่แล้ว)
- ยืนยันกับ remote DB: query เดิม (resource_id=25, action filter, days=3650) คืน 2 แถวถูกต้อง
- `e2e/audit-timeline.spec.ts`: เพิ่ม `expect(res.status()).toBe(200)` ผ่าน `waitForResponse` กันบั๊กคลาสนี้ recur (E2E ที่มี fallback ต้อง assert response status ด้วย)

### ② [UI] ปุ่มแก้ไข (แท็บรายละเอียด)
ย้ายจากแถวบนสุดแยกเดี่ยว → แถวเดียวกับชื่อแบบคำร้อง (หมวดหมู่/ประเภท) มุมขวาบน

### ③ [UI] ปุ่มแก้ไข (แท็บผู้ติดต่อ)
ย้ายเข้าในกรอบโปรไฟล์ผู้ยื่น มุมขวาบน (`absolute top-4 right-4`)

### ④ [UI] ปุ่มยกเลิก/บันทึก
ย้ายไปล่างขวาของฟอร์มแก้ไขทั้ง 2 แท็บ (จากเดิมอยู่บนสุด)

### ⑤ [UI/Consistency] Dropdown ที่อยู่ลำดับชั้น
ฟอร์มแก้ไข contact ใช้ `<input>` ธรรมดาสำหรับหน่วยงาน/จังหวัด/อำเภอ/ตำบล ต่างจากฟอร์ม LIFF ที่เป็น dropdown
**Fix** (reusable, unity/consistency):
- สร้าง `components/forms/ThaiAddressCascade.tsx` — dropdown ลำดับชั้น จังหวัด→อำเภอ→ตำบล
  ใช้ `/api/v1/locations/*` ชุดเดียวกับ LIFF (request-v2), เก็บค่าเป็นชื่อไทย (ตรง schema),
  preselect จากชื่อเดิมโดยไม่ trigger onChange (กัน false-positive diff), legacy passthrough
- หน่วยงาน: `<select>` จาก `AGENCIES` constant เดียวกับ LIFF + legacy passthrough

## Validation

| Check | Status |
|---|---|
| pytest full suite | ✅ 345 passed |
| vitest | ✅ exit 0 (69 tests) |
| tsc | ✅ 0 errors |
| eslint | ✅ 0 errors (1 pre-existing warning: setManageFormData) |
| remote query replication | ✅ 2 rows returned (ยืนยัน fix) |

## Files Changed

| File | Action |
|---|---|
| `backend/app/models/audit_log.py` | UPDATED (created_at timezone=True) |
| `frontend/components/forms/ThaiAddressCascade.tsx` | CREATED (reusable cascade) |
| `frontend/app/admin/requests/[id]/page.tsx` | UPDATED (button placement + dropdowns) |
| `frontend/e2e/audit-timeline.spec.ts` | UPDATED (assert 200) |

## Notes
- ไม่ต้อง migration: column เป็น timestamptz อยู่แล้วทั้ง local/remote — fix แค่ทำให้ model ตรงความจริง
- `ThaiAddressCascade` เป็น component กลาง พร้อม reuse ในฟอร์มอื่น (เช่น admin create) ในอนาคต
