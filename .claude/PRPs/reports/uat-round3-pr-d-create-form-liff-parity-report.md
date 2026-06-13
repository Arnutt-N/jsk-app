# Implementation Report: PR D — Admin create form = LIFF parity

## Summary
ฟอร์มสร้างคำร้อง admin ตอนนี้เหมือน LIFF request-v2: ลำดับ step ผู้ร้อง → สถานที่/หน่วยงาน → รายละเอียด, ที่อยู่เป็น cascade, หัวข้อ/หัวข้อย่อย cascade ทุกหมวด, submit แท็บสุดท้าย. ย้าย `TOPIC_OPTIONS` เป็น shared constant ใช้ทั้ง LIFF + admin.

## Tasks Completed
| # | Task | Status |
|---|---|---|
| 1 | `categories.ts`: TOPIC_OPTIONS + TOPIC_CATEGORY_OPTIONS | ✅ |
| 2 | LIFF: ลบ hardcode → import shared (DRY) | ✅ |
| 3 | create form: reorder step + address cascade + category/subcategory cascade + reset + submit แท็บสุดท้าย | ✅ |

## Validation
| Level | Status |
|---|---|
| tsc | ✅ 0 errors |
| eslint | ✅ 0 errors/warnings |
| vitest | ✅ 79/79 (category tests ยังผ่าน — เพิ่ม export ไม่กระทบ) |

## Files Changed
| File | Action |
|---|---|
| `frontend/lib/constants/categories.ts` | UPDATED (+TOPIC_OPTIONS, TOPIC_CATEGORY_OPTIONS) |
| `frontend/app/liff/request-v2/page.tsx` | UPDATED (import shared, ลบ inline ~42 บรรทัด) |
| `frontend/app/admin/requests/create/page.tsx` | UPDATED (step order, address cascade, category cascade, useEffect) |

## Bug fixed
- "กด ถัดไป ที่ step รายละเอียด แล้วให้บันทึกเลยทั้งที่ที่อยู่ยังไม่กรอก" → แก้โดยสลับให้รายละเอียดเป็น step สุดท้าย; ที่อยู่/หน่วยงานมาก่อน → ปุ่มบันทึกอยู่แท็บสุดท้ายจริง

## Deviations
- ขยาย scope จาก "create form อย่างเดียว" → ย้าย TOPIC_OPTIONS เป็น shared + refactor LIFF (DRY ตาม CLAUDE.md source-of-truth). ใช้ map จริงของ LIFF (7 หมวด) เป็น parity แทนรายการประมาณใน PRD
- ไม่ unify `CATEGORIES` ทั้งแอป (list filter/[id] edit/audit ยังใช้) — เลี่ยง ripple/data migration → follow-up

## Follow-up (noted)
- พิจารณา unify category ทั้งระบบ (list filter dropdown + [id] edit) ให้ใช้ TOPIC_OPTIONS เดียวกัน — แยก PR เพราะกระทบ filter + ข้อมูลเดิม

## Next
- [ ] commit → push → PR → CI → merge → PR E
