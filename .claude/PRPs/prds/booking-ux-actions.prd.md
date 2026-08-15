# PRD: Booking UX — Admin Default View + LIFF Post-Booking Actions

> **Status: DRAFT (2026-08-15)** — รอ review ก่อน implement
> **Branch:** `feat/booking-ux-actions`

## Problem Statement

สองปัญหาจากการใช้งานจริง (ผู้ใช้ยืนยัน):

1. **หน้า admin `/admin/bookings` default filter วันที่ = วันนี้** (page.tsx:37) — การจองล่วงหน้าหลายวันไม่โผล่ในรายการ ผู้ใช้คิดว่า "ไม่มีคนจองเข้ามาเลย" ทั้งที่มี — อันตรายถ้าล่วงหน้าหลายวัน
2. **หน้า LIFF หลังจอง (step 'done') มีแค่สรุป + ปุ่มปิด** (page.tsx:227-259) — ผู้ใช้ที่จองผิด (ชื่อ/เบอร์/เวลา) ไม่มีทางแก้หรือยกเลิกด้วยตัวเอง ต้องรอ admin

## Evidence (ยืนยันจากโค้ด)

- `frontend/app/admin/bookings/page.tsx:37` — `useState(() => toISODate(new Date()))` default วันที่วันนี้
- `backend/app/api/v1/endpoints/admin_bookings.py:36-60` — `list_bookings` เรียง `booking_date.desc(), booking_time.asc()` (นัดไกลสุดก่อน)
- `frontend/app/liff/booking/page.tsx:227-259` — step 'done' มีแค่สรุป + `window.liff?.closeWindow()`
- `backend/app/api/v1/endpoints/liff_bookings.py:192-220` — `POST /liff/bookings/{id}/cancel` มีอยู่แล้ว (ตรวจ ownership + status CONFIRMED + ยังไม่ถึงเวลา)
- `backend/app/services/booking_service.py:368-380` — `cancel_booking` มีอยู่แล้ว
- `frontend/lib/booking.ts:199-206` — `cancelBooking(idToken, bookingId)` มีอยู่แล้ว
- **ไม่มี** API แก้ข้อมูลติดต่อ (contact_name/phone_number/note) ของนัดที่จองแล้ว

## Proposed Solution

### A. Admin `/admin/bookings` — default แสดงทุกวัน

1. `page.tsx:37` — default `date = ''` (ไม่ส่ง param date → backend คืนทุกวัน)
2. `admin_bookings.py:55-56` — เรียง `booking_date.asc(), booking_time.asc()` (นัดเร็วสุดก่อน — ตรงกับ "upcoming" ที่ admin ต้องเห็นก่อน)
3. UI: label วันที่เป็น "ทุกวัน" เมื่อ `date === ''`; ข้อความ footer ปรับตาม

### B. LIFF หลังจอง — ปุ่มยกเลิก + แก้ไข

**B1. ยกเลิก (ใช้ API เดิม):**
- ปุ่ม "ยกเลิกการจอง" ใน step 'done' → `cancelBooking(idToken, confirmed.id)` → ยืนยัน (confirm dialog) → สำเร็จ: reset state กลับหน้าเลือกบริการ + แสดง Alert "ยกเลิกการจองแล้ว"
- ใช้ `POST /liff/bookings/{id}/cancel` ที่มีอยู่แล้ว — ไม่สร้าง API ใหม่

**B2. แก้ไขข้อมูลติดต่อ (API ใหม่):**
- Backend: `PATCH /liff/bookings/{id}` — รับ `contact_name`, `phone_number`, `note` (ทั้งหมด optional — ส่งเฉพาะที่แก้)
  - ตรวจ ownership (เหมือน cancel — 404 เดียวกันทั้ง "ไม่มี" และ "ไม่ใช่ของเรา")
  - ตรวจ status == CONFIRMED + ยังไม่ถึงเวลา (เหมือน cancel — 409 ถ้าแก้ไม่ได้)
  - ใช้ schema `BookingUpdateIn` (field เดียวกับ BookingCreate แต่ optional)
  - Audit: ไม่ต้อง (เป็น citizen action ไม่ใช่ admin) — แต่ log ไว้
- Frontend: ปุ่ม "แก้ไขข้อมูล" ใน step 'done' → เปิด form (ชื่อ/เบอร์/โน้ต prefilled) → `PATCH` → อัปเดต `confirmed` state

**B3. Flow หลัง action:**
- ยกเลิกสำเร็จ → reset ทั้งหมด (กลับ step 'service') + Alert success
- แก้ไขสำเร็จ → กลับ step 'done' + Alert success "แก้ไขข้อมูลเรียบร้อย"

## Out of Scope

- แก้เวลา/บริการของนัดเดิม (ต้องยกเลิกแล้วจองใหม่ — design เดิม)
- หน้า "รายการคิวของฉัน" แยก (มี Flex "คิว" อยู่แล้ว)
- Admin แก้ข้อมูลติดต่อของประชาชน (งานคนละส่วน)

## Tests

- Backend: `tests/test_booking_update.py` — PATCH ตรวจ ownership (404), status ไม่ใช่ CONFIRMED (409), นัดผ่านไปแล้ว (409), happy path (อัปเดต + คืน BookingOut), schema validation
- Frontend: `__tests__/page.test.tsx` (admin bookings) — default ไม่ส่ง date param; `__tests__/page.test.tsx` (liff booking) — ปุ่มยกเลิกเรียก cancelBooking + reset, ปุ่มแก้ไขเปิด form + PATCH

## Rollout

1. Merge → CD deploy (ไม่มี migration)
2. ผู้ใช้เช็คหน้า admin เห็นทุกวัน + ทดสอบยกเลิก/แก้ไขใน LINE

## Risks

- PATCH ต้องไม่ให้แก้ booking ของคนอื่น (ownership check เหมือน cancel)
- การยกเลิกแล้วจองใหม่: slot ที่ว่างอาจถูกคนอื่นจองก่อน — เป็นพฤติกรรมปกติ
