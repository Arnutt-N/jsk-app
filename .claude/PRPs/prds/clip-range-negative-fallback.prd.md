# PRD — clip-range: unit test เคสค่าติดลบของ maxRangeDays

- สถานะ: approved (ผู้ใช้เลือก "เพิ่มเลย" จากผล /review รอบที่ 3, 2026-08-30)
- ที่มา: Spec axis ของ /review `43629cd...84b12cc` — minor note เดียวที่ actionable:
  plan เดิม (availability-range-cap-source) ระบุ guard ครอบ `0`/`NaN`/negative
  แต่ unit test เทสแค่ undefined/0/NaN — ค่าติดลบไม่มีเทสยืนยัน

## ปัญหา

โค้ด guard (`clipRangeWindow` ใน `frontend/lib/booking.ts`) จัดการค่าติดลบแล้ว
(`maxRangeDays > 0` → fallback 62) แต่ไม่มีเทสป้องกัน regression — ถ้ามีคนแก้ guard
ในอนาคต (เช่น เปลี่ยนเป็น `!== 0` หรือตัดเงื่อนไข `> 0` ออก) ค่าติดลบจะกลายเป็น
cap จริง → กรองหน้าต่างวันที่ออกหมด (หน้าจอว่าง) โดยไม่มีเทสไหนหยุดไว้

## เป้าหมาย

Unit test pin พฤติกรรม: `maxRangeDays` ติดลบ → fallback 62 เหมือน 0/NaN/undefined

## โซลูชัน

เพิ่ม 1 assertion ในเทสเดิม `falls back to the local cap when the advertised one
is missing or invalid` (`frontend/lib/__tests__/booking.test.ts`):
`expect(clipRangeWindow(options, -5)).toHaveLength(63)`

## ขอบเขต — ไม่ทำ

- ไม่แตะโค้ด production ใดๆ (guard ถูกอยู่แล้ว)
- ไม่แตะ backend / ไม่แตะเทสอื่น

## Acceptance Criteria

1. **AC-N1**: เทส `falls back...` ครอบคลุม 4 กรณี (undefined/0/NaN/negative) และผ่าน
2. **AC-N2 (mutation value)**: ถ้าลบ `> 0` ออกจาก guard เทสนี้ต้อง fail
   (-5 จะกลายเป็น cap → ทุกวันถูกกรอง → ได้ [] ไม่ใช่ 63)