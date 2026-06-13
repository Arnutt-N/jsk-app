# Implementation Report: PR B — Role-based workflow buttons + inline kebab

## Summary
ยุบปุ่ม workflow ของการ์ดคำร้องจาก 2 แถว (ที่ supervisor เห็น 4 ปุ่มล้น, staff ไม่เห็นปฏิเสธ) เป็นแถวเดียวที่ capped ตามบทบาท: next-step CTA + (มอบหมาย เฉพาะ supervisor) + ปฏิเสธ (assignee หรือ supervisor) + เคบับขวาสุด. ย้าย "ส่งต่อหน่วยงานเฉพาะทาง" และ override actions เข้าเคบับ.

## Assessment vs Reality
| Metric | Predicted | Actual |
|---|---|---|
| Complexity | Medium | Medium (จริง ๆ ค่อนไป Small — 1 ไฟล์) |
| Files Changed | 1 | 1 |

## Tasks Completed
| # | Task | Status | Notes |
|---|---|---|---|
| 1 | รวมแถวเดียว + ปฏิเสธให้ staff + kebab ขวาสุด | ✅ | เพิ่ม derived booleans กัน drift ของ kebab |
| 2 | ยืนยัน backend staff reject | ✅ | docstring+โค้ด: status transition = any admin role → ไม่ 403 |
| 3 | ปรับ E2E ปุ่ม | ✅ N/A | ไม่มี E2E assert ปุ่มเหล่านั้น |

## Validation Results
| Level | Status | Notes |
|---|---|---|
| tsc | ✅ Pass | 0 errors |
| eslint | ✅ Pass | 0 errors (1 warning setManageFormData เดิม ไม่เกี่ยว) |
| vitest | ✅ Pass | 79/79 |
| backend reject permission | ✅ Verified | any admin role |

## Files Changed
| File | Action | Lines |
|---|---|---|
| `frontend/app/admin/requests/[id]/page.tsx` | UPDATED | +~120 / -~95 (net ~ even; ยุบ 2 แถว→1) |

## Button caps (ยืนยัน)
- staff/user (can_assign=false, assignee): next-step + ปฏิเสธ + kebab = **≤2 + 1** ✓ (ไม่มีมอบหมาย)
- supervisor (superadmin/admin/director/head, can_assign=true): next-step + มอบหมาย + ปฏิเสธ + kebab = **≤3 + 1** ✓
- ส่งต่อ/บังคับเสร็จสิ้น/ย้อนกลับ/ยกเลิกอนุมัติ → ในเคบับ

## Deviations from Plan
- ไม่มี — ทำตามแผน. Task 2 ยืนยันแล้วว่าไม่ต้องแตะ backend (status transition เปิดให้ทุก admin role).

## Issues Encountered
- None. โครงสร้าง JSX balanced (tsc ผ่าน).

## Tests Written
- ไม่เพิ่ม (UI conditional ล้วน; vitest เดิมไม่ครอบ page นี้, E2E smoke ครอบ render). Manual checklist ใน plan.

## Next Steps
- [ ] commit → push → PR → CI เขียว → merge → PR C
