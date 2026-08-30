# Plan — availability-range: single source for the 62-day cap + pinned AC #4

> PRD: `.claude/PRPs/prds/availability-range-cap-source.prd.md` · branch: `fix/availability-range-cap-source` · base: `43629cd` (main)

## งานทั้งหมด (TDD — เทสก่อนโค้ดเสมอ)

### Task 1 — Backend: ย้าย constant + เพิ่ม `max_range_days` ที่ `/options`

ไฟล์:
- `backend/app/services/booking_service.py` — เพิ่ม `MAX_AVAILABILITY_RANGE_DAYS = 62`
  ไว้บนสุดส่วน constants (พร้อม doc comment อธิบายว่า endpoint + `/options` อ้างถึง)
- `backend/app/api/v1/endpoints/liff_bookings.py` — ลบนิยามเดิม (บรรทัด ~126), เพิ่ม
  `MAX_AVAILABILITY_RANGE_DAYS` เข้า import block จาก `booking_service` (มีอยู่แล้ว),
  `get_booking_options` เพิ่ม `max_range_days=MAX_AVAILABILITY_RANGE_DAYS`
- `backend/app/schemas/booking.py` — `BookingOptionsOut` เพิ่ม `max_range_days: int`
  (+ comment: field นี้คือ contract ที่ LIFF ใช้ shape request จึงไม่ใช่ operational detail)

เทสก่อน:
- หาเทส endpoint `/options` เดิม (grep `/options` ใน backend/tests) → เพิ่ม assertion
  `max_range_days == 62`; ถ้าไม่มีเทส options เลย ให้เพิ่ม minimal test ในไฟล์เทส
  endpoint ที่เกี่ยวข้อง (mock auth ตาม pattern ของไฟล์นั้น)
- ยืนยันเทส endpoint range (cap 62) ยังผ่านหลังย้าย constant

Validation: `python -m pytest tests/test_booking_availability_range.py -q` +
ไฟล์เทส endpoint ที่แตะ (รันจาก `backend/` ด้วย venv)

### Task 2 — Frontend: `clipRangeWindow` รับ cap จาก options (fallback 62)

ไฟล์:
- `frontend/lib/booking.ts`
  - `clipRangeWindow(dateOptions, maxRangeDays = MAX_AVAILABILITY_RANGE_DAYS)` —
    เปลี่ยน comment ของ constant: จาก "keep the two in sync" เป็น "fallback เมื่อ
    /options ไม่ส่ง max_range_days (backend เก่า)"
  - `limit = addDaysISO(dateOptions[0], maxRangeDays)`
  - guard: `maxRangeDays` ที่ส่งมาเป็น `0`/`NaN`/negative → ใช้ fallback (Number.isFinite + > 0)
- `frontend/app/liff/booking/page.tsx`
  - `interface BookingOptions` เพิ่ม `max_range_days?: number`
  - effect range (บรรทัด ~281): `clipRangeWindow(dateOptions, options?.max_range_days)`
  - เพิ่ม `options` เข้า deps ของ effect (แก้ exhaustive-deps; options เปลี่ยน → dateOptions
    เปลี่ยนอยู่แล้ว จึงไม่กระทบพฤติกรรม)

เทสก่อน:
- `frontend/lib/__tests__/booking.test.ts` — เพิ่ม 2 case ใน describe('clipRangeWindow'):
  (1) cap ที่ส่งมาเล็กกว่า (เช่น 10) → ตัดตามค่านั้น (2) ค่าหาย/ไม่ valid → fallback 62
- `frontend/app/liff/booking/__tests__/page.test.tsx` — stubFetch เพิ่ม override
  `maxRangeDays?: number` ส่งเป็น `max_range_days` ใน mock /options; เพิ่มเทส:
  advanceDays ใหญ่ (เช่น 100) + maxRangeDays 10 → ตรวจ query `to` ของ range request
  อยู่ห่างจาก `from` = 10 วัน

Validation: `npm run test:unit -- booking` (รันจาก `frontend/`)

### Task 3 — เทส backend pin AC #4

ไฟล์: `backend/tests/test_booking_availability_range.py`
- เพิ่ม test `test_slots_at_or_before_now_are_dropped_from_todays_day` ต่อจาก test 1:
  NOW=09:15 (ตาม module constant), `_hours(TODAY.weekday())` 08:00–17:00, วันเดียว
  - `expected = [t for t in _slot_times(hours) if datetime.combine(TODAY, t) > NOW]`
  - `assert [slot.start for slot in days[0].slots] == expected`
  - sanity: `assert len(expected) == 15` (กัน helper เองพังเงียบๆ)

Validation: `python -m pytest tests/test_booking_availability_range.py -q`

## Gates (ก่อน PR)

1. Backend: `python -m pytest` (ชุดเต็ม ผ่าน background + poll ตาม convention)
2. Frontend: `npm run test:unit` + `npm run lint` + `npm run build`
3. Encoding Check ผ่าน CI (ไฟล์ Python/TS ใหม่ต้อง UTF-8 ไม่มี BOM)

## ระวัง

- อย่าเปลี่ยนพฤติกรรม fail-open ใดๆ — chip ที่ไม่มีข้อมูลยัง enabled เสมอ
- อย่าแตะ endpoint validation logic อื่น (422 ก่อน 503 คงเดิม)
- เทส page.test.tsx: route `/availability/range` ต้อง match ก่อน `/availability` (substring)