# LIFF Booking Availability Range Endpoint

> Backlog item deferred from PR #207 (user time-boxed that session to UI-only).
> Source: `.agents/PROJECT_STATUS.md` Backlog + checkpoint `handover-qoder-20260829-2244.json`.

## Problem Statement

หลัง PR #207 หน้า `/liff/booking` แสดง date strip ครบหน้าต่าง `advance_days` แล้ว แต่ **chip ทุกวันยังดู "กดได้" เท่ากันหมด** — ผู้ใช้ต้องแตะทีละวันเพื่อค้นหาวันที่เปิด/มีที่ว่าง เพราะ frontend รู้จักเฉพาะ `options` (service_types, advance_days, blackout_dates) ไม่รู้ว่าวันไหนปิดทำการ (weekday ปิด) หรือเต็ม (ทุก slot เต็ม)

พฤติกรรมปัจจุบัน: แตะวันที่ปิด → `loadSlots` เรียก `/availability` → ได้ `slots: []` → แสดง empty state "ไม่มีช่วงเวลา" — ผู้ใช้เสีย 1 request + 1 interaction ต่อวันที่ปิด

## Goal

ให้ date strip **ปิด chip วันที่จองไม่ได้ล่วงหน้า** (disabled) โดยไม่ต้องแตะ — ผู้ใช้เห็นทันทีว่าวันไหนจองได้

Contract จาก Backlog (คงเดิมตามที่ตกลงไว้ใน PR #207):

```
GET /api/v1/liff/bookings/availability/range?service_type=&from=&to=
→ [{date, is_open, remaining}]
```

## Non-Goals

- ไม่แตะ admin booking surfaces (scope LIFF only — decision จาก grilling 2026-08-29)
- ไม่แทน `/availability` รายวันเดิม — ยังใช้เป็น SSOT ของ slot grid ตอนแตะวัน (range endpoint ไม่ส่งราย slot)
- ไม่ทำ caching ฝั่ง server (การจองผ่าน slot cache ฝั่ง client เดิม)
- ไม่มี migration / config ใหม่

## Design

### Backend

**Service** — `booking_service.get_availability_range(db, *, service_type, start_date, end_date, config) -> list[DayAvailability]`:

- Reuse `compute_slots` (pure function) ต่อวัน — policy เดียวกับ `/availability` รายวันทุกข้อ: ปิดวัน / blackout / อดีต / เกิน advance window / disabled → slots ว่าง
- **Batch เป็น 2 queries เสมอ** ไม่ขึ้นกับความยาวช่วง: (1) `BusinessHours` ทั้ง 7 แถว, (2) booked counts ของทั้งช่วง `GROUP BY booking_date, booking_time` (สถานะเดียวกับ `get_booked_counts` = `ACTIVE_STATUSES`)
- `DayAvailability(date, day_hours, slots)` — `is_open := bool(slots)` (slots ว่าง ⇔ ปิด/blackout/อดีต/เกินหน้าต่าง/ไม่มี slot ที่ว่างในวันนั้น), `remaining := sum(slot.remaining)`
- Unknown service → `UnknownServiceTypeError` (เหมือนเดิม)

**Endpoint** — `GET /liff/bookings/availability/range` ใน `liff_bookings.py`:

- Auth: `require_line_user_id` + gate `_require_booking_enabled` (401 / 503) เหมือน `/availability`
- `from > to` → 422; `to - from > 62 วัน` → 422 (กัน query หนัก)
- Unknown service → 404 (ข้อความไทยเดียวกัน)
- Response: `AvailabilityRangeOut { service_type, days: [{date, is_open, remaining}] }`

### Frontend

- `lib/booking.ts`: `fetchAvailabilityRange(idToken, serviceType, from, to)` + types `DayAvailability`, `AvailabilityRange`
- `app/liff/booking/page.tsx`:
  - โหลด range 1 ครั้งต่อ service เมื่อ `options` + `serviceType` พร้อม (window = วันนี้..วันนี้+advance_days) → `Map<iso, DayAvailability>`
  - Chip disabled เมื่อ `!info.is_open || info.remaining === 0` (ข้อมูลยังไม่มา → enabled เหมือนเดิม, fail-open)
  - Preselect วันเปิดที่มีที่ว่างวันแรก (เดิม: `dateOptions[0]` เสมอ); โหลด range ไม่สำเร็จ → fallback พฤติกรรมเดิม
  - เปลี่ยน service → reset range แล้วโหลดใหม่

## Acceptance Criteria

1. `GET /liff/bookings/availability/range` คืน 1 row ต่อวันใน [from, to] เรียงวันขึ้น
2. วันปิดทำการ / blackout / อดีต / เกิน advance window → `is_open: false, remaining: 0`
3. วันเปิดที่ slot เต็มหมด → `is_open: true, remaining: 0`
4. วันนี้: slot ที่เลยเวลาแล้วไม่นับใน `remaining` (เหมือน `/availability`)
5. Unknown service → 404, ปิดระบบ → 503, ไม่มี token → 401, `from > to` / ช่วง > 62 วัน → 422
6. Backend queries ต่อ request = 2 (ไม่ใช่ N ต่อวัน)
7. บนหน้า `/liff/booking`: chip วันปิด/เต็ม disabled + preselect ข้ามไปวันเปิดวันแรก; ทุก behavior เดิม (slot grid, submit, cancel/edit) ไม่เปลี่ยน
8. Gates: pytest + vitest + tsc + eslint + build + CI เขียวครบ

## Risks / Notes

- ประสิทธิภาพ: 2 queries/request, โดย range ที่ frontend ขอ = advance_days+1 วัน (ปัจจุบัน 4) — ต่ำกว่า `/availability` รายวันที่ผู้ใช้แตะเองหลายครั้ง
- Response ไม่มีราย slot → ยังต้องเรียก `/availability` เมื่อเลือกวัน (by design, ข้อมูล slot มีเฉพาะวันที่สนใจ)
