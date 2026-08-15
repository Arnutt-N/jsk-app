# PRD: Business Hours Admin Page (หน้า admin จัดการเวลาทำการ)

> **Status: DRAFT (2026-08-15)** — รอ review ก่อน implement
> **Branch:** `feat/business-hours-admin`

## Problem Statement

ตาราง `business_hours` (7 rows ต่อสัปดาห์) เป็น config เดียวที่ควบคุม 2 ฟีเจอร์:

1. **ระบบจองคิว** — `compute_slots` (booking_service.py:120) สร้าง slot จาก `open_time`/`close_time` ของวันนั้น; วันปิด = ไม่มี slot
2. **Live chat handoff** — `is_within_business_hours` (business_hours_service.py:25) กำหนดว่าบอทจะเสนอโอนเข้าเจ้าหน้าที่ได้ช่วงไหน; นอกเวลาจะตอบ "เวลาเปิดทำการถัดไป"

**ปัญหา:** ปัจจุบัน **ไม่มี API และไม่มีหน้า admin** แก้ค่านี้ได้เลย — แก้ได้ทาง SQL เท่านั้น (ยืนยันใน checklist ทดสอบ booking ข้อ 0.3) และค่า default ที่ seed มาคือ จ-ศ 08:00-17:00, ส-อา ปิด

**ความต้องการของผู้ใช้:** ระบบนี้เป็นแชทบอทที่ต้องให้บริการตลอด 24 ชั่วโมง — admin ต้องตั้งค่าเวลาทำการเองได้จากหน้า admin (เป้าหมายแรก: เปิด 24/7 ทั้งสัปดาห์)

## Evidence (ยืนยันจากโค้ด)

- `backend/app/models/business_hours.py:7-47` — model: `day_of_week` 0-6 (unique), `is_open`, `open_time`/`close_time` String(5) "HH:MM", `get_default_hours()` = จ-ศ 08:00-17:00
- `backend/app/main.py:71-76,141` — `_initialize_business_hours()` seed defaults ตอน startup ถ้าตารางว่าง
- `backend/app/services/booking_service.py:147-158` — slot ต้อง `cursor + step <= closing` (slot จบก่อนเวลาปิด); `_parse_hhmm` ใช้ `time.fromisoformat` → **"24:00" จะ crash**
- `backend/app/services/business_hours_service.py:16-19,41-43` — `_parse_time` ใช้ `time(int(h), int(m))` → **"24:00" จะ ValueError**; เช็ค `open_t <= current_time <= close_t`
- `backend/app/api/v1/endpoints/admin_bookings.py:104-163` — pattern endpoint settings: GET = `get_current_staff`, PUT = `get_current_admin` + `create_audit_log` manual + `db.commit()`
- `frontend/app/admin/settings/booking/page.tsx:198` — UI อ้างถึง "เวลาทำการ ในหน้าตั้งค่าระบบ" อยู่แล้ว (คาดหวังว่า feature นี้จะมี)
- `frontend/app/admin/settings/page.tsx:139-190` — hub "การจัดการระบบ" มีการ์ดลิงก์ไป permissions/booking — จุดเพิ่มการ์ดใหม่

## Proposed Solution

### A. Backend — endpoints ใหม่ `admin_business_hours.py`

| Method | Path | Gate |
|--------|------|------|
| GET | `/api/v1/admin/settings/business-hours` | `get_current_staff` |
| PUT | `/api/v1/admin/settings/business-hours` | `get_current_admin` |

- Register ใน `api.py` ภายใต้ prefix `/admin/settings` (pattern เดียวกับ settings.py + admin_integrations.py ที่แชร์ prefix กัน)
- **GET**: คืน 7 วันเรียง 0→6; วันที่ไม่มี row ในตาราง = `{is_open: false, open_time: "08:00", close_time: "17:00"}` (placeholder — สอดคล้องกับพฤติกรรมจริงที่วันไม่มี row = ปิด)
- **PUT**: payload = list 7 วันครบ 0-6 ไม่ซ้ำ — upsert รายวัน (มี row อยู่ → update, ไม่มี → insert) แล้ว commit ครั้งเดียว
- **Audit**: `create_audit_log(action="update_business_hours", resource_type="business_hours", details={...})` ตาม pattern admin_bookings.py:149-161

### B. Backend — รองรับ `close_time = "24:00"` (ทำให้ "24 ชม." เป็นจริง)

ถ้าไม่ทำ: ตั้ง 00:00-23:59 จะเสีย slot 23:30-24:00 และ handoff เช็คพลาดช่วง 23:59:01-23:59:59 — ระบบที่โฆษณาว่า 24 ชม. แต่จอง 4 ทุ่มครึ่งไม่ได้ = defect ที่ user เห็น

- `booking_service._parse_hhmm` / `compute_slots`: close "24:00" → `closing = datetime.combine(target_date + 1 day, time(0,0))` (slot สุดท้าย 23:30-24:00 ทำงานถูกต้อง)
- `business_hours_service.is_within_business_hours` / `get_next_open_time`: close "24:00" = เปิดถึงสิ้นวัน (ไม่ต้อง parse เป็น time)
- Constraint: "24:00" ยอมรับเฉพาะ `close_time` เท่านั้น; `open_time` ต้องเป็น 00:00-23:59

### C. Schemas — `schemas/business_hours.py`

```python
class BusinessHoursDay(BaseModel):
    day_of_week: int = Field(ge=0, le=6)
    is_open: bool
    open_time: str   # HH:MM, 00:00-23:59
    close_time: str  # HH:MM, 00:01-23:59 หรือ "24:00"

class BusinessHoursUpdate(BaseModel):
    days: List[BusinessHoursDay]  # exactly 7, cover 0-6, no dup
```

Validators: regex HH:MM, `is_open=True` ต้อง `open_time < close_time`, ห้าม open == close

### D. Frontend — หน้า `/admin/settings/business-hours`

- `lib/business-hours.ts`: `fetchBusinessHours()` / `saveBusinessHours()` — plain fetch + `API_BASE` (authFetch interceptor แนบ cookie/CSRF ให้อัตโนมัติ ตาม pattern `lib/booking.ts`)
- `app/admin/settings/business-hours/page.tsx` (client component ตามรอย booking page):
  - 7 แถว (จันทร์→อาทิตย์) แต่ละแถว: toggle เปิด/ปิด + input เวลาเปิด/ปิด (`<input type="time">`) + ปุ่มลัด **"เปิด 24 ชม."** (เซ็ต 00:00→24:00)
  - Validation ฝั่ง client: วันเปิดต้องมี open < close
  - LoadingSpinner / Alert success / Alert danger ตาม pattern booking page
- เพิ่มการ์ดใน hub `settings/page.tsx` ส่วน "การจัดการระบบ" (icon `Clock` จาก lucide-react) — ไม่เพิ่ม tab ใน layout (booking/permissions ก็ไม่ได้เป็น tab)

### E. Tests

- Backend `tests/test_admin_business_hours_endpoints.py`: GET คืน 7 วัน + fill missing, PUT reject (format ผิด, open ≥ close, วันไม่ครบ, วันซ้ำ, 24:00 ใน open_time), PUT happy path (upsert + audit + commit) — style เรียก function ตรงๆ + AsyncMock ตาม test_admin_bookings_endpoints.py
- เพิ่มใน `tests/test_booking_slots.py`: close "24:00" → slot เต็มวัน (สุดท้าย 23:30)
- เพิ่ม/ใหม่ สำหรับ `is_within_business_hours` close "24:00" → True ที่ 23:59:30
- Frontend `__tests__/page.test.tsx`: render 7 วัน, toggle 24 ชม. ส่ง 00:00/24:00, save → PUT payload ถูก, error alert — mock fetch ตาม booking page test

## Out of Scope

- ช่วงเวลาเปิดหลายช่วงต่อวัน (split hours เช่น พักเที่ยง)
- วันหยุดพิเศษ (booking มี `blackout_dates` อยู่แล้ว)
- เปลี่ยนค่า default seed (`get_default_hours`) — prod มี rows อยู่แล้ว จัดการผ่าน UI; env ใหม่ยัง seed จ-ศ 08:00-17:00 เหมือนเดิม
- แก้ sidebar (`layout.tsx`) — settings ย่อยเข้าผ่าน hub อยู่แล้ว

## Rollout

1. Merge → CD deploy (ไม่มี migration — ตารางมีอยู่แล้ว)
2. User เปิด `/admin/settings/business-hours` → ตั้งทุกวันเปิด 24 ชม. → บันทึก
3. เปิด booking + เพิ่มบริการที่ `/admin/settings/booking` → จองได้ 24/7 รวมวันเสาร์/อาทิตย์

## Risks

- **Handoff 24/7**: เปิดทั้งสัปดาห์ทำให้บอทเสนอโอนเข้าเจ้าหน้าที่ได้แม้ตอนดึก — session จะเข้าคิวรอ (เป็นพฤติกรรมที่ user ต้องการตามคำตอบ: "จัดการเวลาทำการของเจ้าหน้าที่" ผ่าน UI ได้เอง)
- **เวลาใน row เดิมไม่ valid** (เช่น open > close จาก SQL manual): PUT ใหม่จะบังคับ validate ทุกวัน → แก้ไขข้อมูลพลาดไปในตัว
