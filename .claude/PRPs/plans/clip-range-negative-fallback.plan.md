# Plan — unit test เคสค่าติดลบของ maxRangeDays

PRD: `.claude/PRPs/prds/clip-range-negative-fallback.prd.md`
Branch: `test/clip-range-negative-fallback` (จาก `84b12cc`)

## Task 1 — เพิ่ม assertion ในเทสเดิม

ไฟล์เดียว: `frontend/lib/__tests__/booking.test.ts` — ในเทส
`falls back to the local cap when the advertised one is missing or invalid`:

- เพิ่มบรรทัดหลัง assertion NaN:
  `expect(clipRangeWindow(options, -5)).toHaveLength(63)`
- ไม่แตะอย่างอื่นในไฟล์ (ชื่อเทสครอบ "invalid" อยู่แล้ว)

## Validation

- `npm run test:unit -- booking` (รันจาก `frontend/` ผ่าน background + poll
  ตาม convention เครื่องช้า)
- eslint เฉพาะไฟล์ที่แตะ

## Mutation check (ทางความคิด ไม่ต้อง commit)

ลบ `> 0` ออกจาก guard → `-5` กลายเป็น cap → `addDaysISO(first, -5)` = limit
ก่อนวันแรก → ทุก `iso > limit` → filter คืน `[]` → `toHaveLength(63)` fail ✓
(pin มีอำนาจจับ regression จริง)

## Gates

1. vitest (booking filter) เขียว
2. eslint ไฟล์ที่แตะสะอาด
3. Encoding Check ผ่าน CI

## ระวัง

- อย่าแตะโค้ด `booking.ts` — งานนี้เพิ่มเทสเท่านั้น
- หน้าเว็บ/พฤติกรรมต้องไม่เปลี่ยนแม้แต่บรรทัดเดียว