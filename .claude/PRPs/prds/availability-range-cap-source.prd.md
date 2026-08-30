# PRD — availability-range: single source for the 62-day cap + pinned AC #4

- สถานะ: approved (ผู้ใช้สั่ง "ปิดจุดอ่อนทั้ง 2" จากผล /review 2026-08-30)
- วันที่: 2026-08-30
- ต้นทาง: `/review` ของ availability-range feature (PR #208 + #209, fixed point `2a93688`)

## ปัญหา

1. **ค่า cap ช่วงวันที่ (62) อยู่ 2 ที่** — backend `MAX_AVAILABILITY_RANGE_DAYS`
   (`liff_bookings.py`) กับ frontend (`lib/booking.ts`) — sync กันด้วยคอมเมนต์เท่านั้น
   (Shotgun Surgery) แก้ที่เดียวแล้วอีกฝั่งพังเงียบๆ (422 → fail-open ทั้ง strip)
2. **AC #4 ยังไม่ถูก range test pin** — พฤติกรรม "slot ที่เลยเวลาปัจจุบันไปแล้วต้องไม่
   ถูกนำเสนอ" มาจากการ reuse `compute_slots` แต่ test 1 ของ range ไม่มี assertion
   จับเรื่องนี้เลย (`remaining == len(slots) * 2` เป็น tautology — ถ้า slot อดีตหลุด
   เข้ามา ทั้งสองค่าโตขึ้นด้วยกัน เทสก็ยังผ่าน)

## เป้าหมาย

- เปลี่ยนแปลง cap ที่ backend ที่เดียว → frontend ตามอัตโนมัติ (ผ่าน `/options`)
- มีเทสที่ fail ทันทีถ้า range path เสนอ slot ที่เลยเวลาแล้ว

## โซลูชันที่เลือก

- **Backend**: ย้าย `MAX_AVAILABILITY_RANGE_DAYS` จาก endpoint ไป `booking_service.py`
  (service layer เป็นเจ้าของ domain constant) → endpoint import กลับมาใช้เท่าเดิม
  → `GET /liff/bookings/options` เพิ่ม field `max_range_days` คืนค่าจาก constant
- **Frontend**: `clipRangeWindow(dateOptions, maxRangeDays = MAX_AVAILABILITY_RANGE_DAYS)`
  รับค่าจาก `/options` (`max_range_days?: number` optional) โดยค่าคงที่ 62 เดิมเหลือเป็น
  **fallback** เมื่อ backend ไม่ส่ง (backend เก่า/สนามหาย) — คงแนว fail-open เดิม
- **เทส AC #4**: เพิ่ม test ใหม่ใน `test_booking_availability_range.py` ที่ NOW=09:15,
  ชั่วโมงทำการ 08:00–17:00 → assert list เวลา slot ของ "วันนี้" เท่ากับ grid ที่กรอง
  `> NOW` แล้ว (เหลือ 09:30–16:30 = 15 slot) ใช้ helper `_slot_times()` ที่มีอยู่แล้ว

## ขอบเขต — ไม่ทำ (ทิ้งไว้ตาม rationale ใน availability-range-review-fixes.plan.md)

- ไม่แก้ 404 `UnknownServiceTypeError` guard ที่ซ้ำกัน 2 endpoint
- ไม่รวม `rangeInfo`/`rangeReady` เป็น state เดียว, ไม่ extract `useAvailabilityRange`
- ไม่เปลี่ยน suffix `Out`, ไม่เปลี่ยนลำดับ 422/503
- ไม่เปลี่ยนพฤติกรรม fail-open ณ ทุกชั้น

## Acceptance Criteria

1. **AC-S1 (single source)**: ค่า cap นิยามที่เดียวใน `booking_service.py`; การเปลี่ยนค่า
   (จำลองในเทส) ทำให้ทั้ง validation ของ endpoint และค่าที่ frontend ใช้ clip เปลี่ยนตาม
2. **AC-S2 (fail-open fallback)**: `/options` ที่ไม่มี `max_range_days` → frontend ใช้
   fallback 62 เดิม (มีเทส unit ยืนยัน default param)
3. **AC-S3 (AC #4 pinned)**: เทส range ที่ NOW=09:15, วันเดียว 08:00–17:00 →
   `[s.start for s in day.slots] == [t for t in grid if t > 09:15]` (15 slot, เริ่ม 09:30)
4. **AC-S4 (ไม่มี behavior change มองเห็นได้)**: เทสเดิมทั้ง backend + frontend ผ่านครบ
   โดยไม่ต้องแก้ behavior (ยกเว้น mock /options ที่เพิ่ม field optional ได้)