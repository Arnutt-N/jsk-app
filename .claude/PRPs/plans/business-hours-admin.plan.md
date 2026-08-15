# Business Hours Admin Page — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** เพิ่ม API + หน้า admin จัดการเวลาทำการ (`business_hours` 7 วัน) เพื่อให้ตั้งเวลาเปิด/ปิด — รวมถึง "เปิด 24 ชม." — ได้โดยไม่ต้องแก้ SQL

**Architecture:** endpoint ใหม่ `GET/PUT /api/v1/admin/settings/business-hours` ตาม pattern admin_bookings settings (GET=staff gate, PUT=admin gate + manual audit log), รองรับ `close_time="24:00"` ใน engine ทั้ง booking slots และ business-hours check, frontend client page ตามรอย booking settings page + การ์ดใน settings hub

**Tech Stack:** FastAPI + SQLAlchemy 2.0 async, Pydantic v2; Next.js/React + Tailwind; pytest (เรียก function ตรงๆ + AsyncMock, ไม่ต้องมี DB จริง), vitest + @testing-library/react

**PRD:** `.claude/PRPs/prds/business-hours-admin.prd.md`

## Global Constraints

- **`business_hours` เป็นตารางจริง 7 rows** (ไม่ใช่ key-value) — upsert รายวัน, commit ครั้งเดียว
- **รองรับ `"24:00"` เฉพาะ `close_time`** — open_time ต้อง 00:00-23:59; parse ใน `booking_service.compute_slots` และ `business_hours_service` ต้องไม่ crash
- **Auth ตาม pattern booking settings:** GET = `get_current_staff`, PUT = `get_current_admin` (อยู่ใต้ `access_admin_endpoints` โดยอัตโนมัติ)
- **Audit:** `create_audit_log(action="update_business_hours", resource_type="business_hours")` + `db.commit()` — ไม่ใช่ decorator
- **ข้อความ error เป็นภาษาไทย**; identifier/โค้ดเป็นอังกฤษ
- **ไม่มี DB migration** (ตารางมีอยู่แล้ว, ไม่แก้ schema)
- **ไม่แก้ sidebar/layout** — เข้าถึงผ่านการ์ดใน settings hub เท่านั้น
- **ไม่เปลี่ยน `get_default_hours()`** — env ใหม่ยัง seed จ-ศ 08:00-17:00

---

## File Structure

- `backend/app/schemas/business_hours.py` — **สร้างใหม่**: `BusinessHoursDay`, `BusinessHoursUpdate`, `BusinessHoursOut`
- `backend/app/api/v1/endpoints/admin_business_hours.py` — **สร้างใหม่**: GET + PUT endpoints
- `backend/app/api/v1/api.py` — register router ใหม่
- `backend/app/services/booking_service.py` — รองรับ close "24:00" ใน `compute_slots`
- `backend/app/services/business_hours_service.py` — รองรับ close "24:00" ใน `is_within_business_hours` + `get_next_open_time`
- `backend/tests/test_admin_business_hours_endpoints.py` — **สร้างใหม่**
- `backend/tests/test_booking_slots.py` — เพิ่ม case close "24:00"
- `backend/tests/test_business_hours_24h.py` — **สร้างใหม่**: is_within_business_hours 24 ชม.
- `frontend/lib/business-hours.ts` — **สร้างใหม่**: fetch/save helpers
- `frontend/app/admin/settings/business-hours/page.tsx` — **สร้างใหม่**
- `frontend/app/admin/settings/business-hours/__tests__/page.test.tsx` — **สร้างใหม่**
- `frontend/app/admin/settings/page.tsx` — เพิ่มการ์ดลิงก์

---

## Task 1: Backend — Schemas

**Files:**
- Create: `backend/app/schemas/business_hours.py`

**Interfaces:**
- `BusinessHoursDay`: `day_of_week: int (0-6)`, `is_open: bool`, `open_time: str`, `close_time: str`
- `BusinessHoursUpdate`: `days: List[BusinessHoursDay]`
- `BusinessHoursOut`: `days: List[BusinessHoursDay]`

- [x] **Step 1: สร้าง schema file**

```python
"""Schemas for admin business-hours management."""
import re
from typing import List

from pydantic import BaseModel, Field, field_validator, model_validator

_HHMM_RE = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")


class BusinessHoursDay(BaseModel):
    day_of_week: int = Field(ge=0, le=6)
    is_open: bool
    open_time: str
    close_time: str

    @field_validator("open_time")
    @classmethod
    def _validate_open_time(cls, value: str) -> str:
        if not _HHMM_RE.match(value):
            raise ValueError("เวลาเปิดต้องอยู่ในรูปแบบ HH:MM (00:00-23:59)")
        return value

    @field_validator("close_time")
    @classmethod
    def _validate_close_time(cls, value: str) -> str:
        if value == "24:00":
            return value
        if not _HHMM_RE.match(value) or value == "00:00":
            raise ValueError("เวลาปิดต้องอยู่ในรูปแบบ HH:MM (00:01-23:59) หรือ 24:00")
        return value

    @model_validator(mode="after")
    def _check_open_before_close(self):
        if self.is_open and self.open_time >= self.close_time:
            raise ValueError("เวลาเปิดต้องมาก่อนเวลาปิด")
        return self


class BusinessHoursUpdate(BaseModel):
    days: List[BusinessHoursDay] = Field(min_length=7, max_length=7)

    @field_validator("days")
    @classmethod
    def _check_all_weekdays(cls, days):
        seen = {d.day_of_week for d in days}
        if seen != set(range(7)):
            raise ValueError("ต้องมีข้อมูลครบทั้ง 7 วัน (0=จันทร์ ถึง 6=อาทิตย์) ไม่ซ้ำกัน")
        return days


class BusinessHoursOut(BaseModel):
    days: List[BusinessHoursDay]
```

- [x] **Step 2: sanity check** — `python -c "from app.schemas.business_hours import BusinessHoursUpdate"` จาก `backend/` (WSL venv)

---

## Task 2: Backend — รองรับ "24:00" ใน engines

**Files:**
- Modify: `backend/app/services/booking_service.py` (`compute_slots` ~line 147-152)
- Modify: `backend/app/services/business_hours_service.py` (`is_within_business_hours` ~line 41-43, `get_next_open_time` ~line 64-73)
- Test: `backend/tests/test_booking_slots.py` (เพิ่ม case), `backend/tests/test_business_hours_24h.py` (สร้างใหม่)

- [x] **Step 1: เขียน failing tests ก่อน**

`test_booking_slots.py` — เพิ่ม test: day_hours close_time="24:00", slot 30 นาที → slot สุดท้ายเริ่ม 23:30, จำนวน slot = 48

`test_business_hours_24h.py` — mock DB row close_time="24:00" is_open=True → `is_within_business_hours` คืน True ที่เวลา 23:59:30 (patch `datetime.now`)

- [x] **Step 2: แก้ `compute_slots`**

```python
open_at = _parse_hhmm(day_hours.open_time)
if day_hours.close_time == "24:00":
    closing = datetime.combine(target_date + timedelta(days=1), time(0, 0))
else:
    closing = datetime.combine(target_date, _parse_hhmm(day_hours.close_time))
```

- [x] **Step 3: แก้ `is_within_business_hours`**

```python
open_t = _parse_time(hours.open_time)
if hours.close_time == "24:00":
    return open_t <= current_time
close_t = _parse_time(hours.close_time)
return open_t <= current_time <= close_t
```

- [x] **Step 4: แก้ `get_next_open_time`** — branch `days_ahead == 0`: ถ้า close "24:00" ให้ `current_time >= open_t` ถือว่าเปิดอยู่ (คืน "เปิดให้บริการอยู่ (ถึง 24:00 น.)")

- [x] **Step 5: รัน tests** — `python -m pytest tests/test_booking_slots.py tests/test_business_hours_24h.py -v`

---

## Task 3: Backend — Endpoints + register

**Files:**
- Create: `backend/app/api/v1/endpoints/admin_business_hours.py`
- Modify: `backend/app/api/v1/api.py`
- Test: `backend/tests/test_admin_business_hours_endpoints.py` (สร้างใหม่)

- [x] **Step 1: เขียน failing tests** (style เรียก function ตรงๆ + AsyncMock ตาม test_admin_bookings_endpoints.py)

Cases:
1. GET คืน 7 วันเรียงตาม day_of_week
2. GET — วันไม่มี row ใน DB → `{is_open: False, open_time: "08:00", close_time: "17:00"}`
3. PUT — payload วันไม่ครบ/ซ้ำ → 422 (test ที่ schema level)
4. PUT happy path — row เดิมถูก update, วันที่ไม่มี row ถูก insert, `create_audit_log` ถูกเรียกด้วย action="update_business_hours", `db.commit()` ถูก await
5. PUT รับ close_time "24:00" ได้

- [x] **Step 2: สร้าง endpoint module**

```python
"""Admin endpoints for managing weekly business hours."""
import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_admin, get_current_staff, get_db
from app.core.audit import create_audit_log
from app.models.business_hours import BusinessHours
from app.schemas.business_hours import BusinessHoursOut, BusinessHoursUpdate

logger = logging.getLogger(__name__)

router = APIRouter()

_DEFAULT_PLACEHOLDER = {"open_time": "08:00", "close_time": "17:00"}


@router.get("", response_model=BusinessHoursOut, summary="Read weekly business hours")
async def get_business_hours(
    db: AsyncSession = Depends(get_db),
    _staff=Depends(get_current_staff),
):
    result = await db.execute(select(BusinessHours))
    rows = {row.day_of_week: row for row in result.scalars().all()}
    days = []
    for weekday in range(7):
        row = rows.get(weekday)
        if row is None:
            days.append({
                "day_of_week": weekday,
                "is_open": False,
                **_DEFAULT_PLACEHOLDER,
            })
        else:
            days.append({
                "day_of_week": weekday,
                "is_open": row.is_open,
                "open_time": row.open_time,
                "close_time": row.close_time,
            })
    return BusinessHoursOut(days=days)


@router.put("", response_model=BusinessHoursOut, summary="Update weekly business hours")
async def update_business_hours(
    payload: BusinessHoursUpdate,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_admin),
):
    result = await db.execute(select(BusinessHours))
    rows = {row.day_of_week: row for row in result.scalars().all()}
    for day in payload.days:
        row = rows.get(day.day_of_week)
        if row is None:
            db.add(BusinessHours(
                day_of_week=day.day_of_week,
                is_open=day.is_open,
                open_time=day.open_time,
                close_time=day.close_time,
            ))
        else:
            row.is_open = day.is_open
            row.open_time = day.open_time
            row.close_time = day.close_time
    await create_audit_log(
        db=db,
        admin_id=admin.id,
        action="update_business_hours",
        resource_type="business_hours",
        resource_id=None,
        details={"days": [d.model_dump() for d in payload.days]},
    )
    await db.commit()
    return BusinessHoursOut(days=payload.days)
```

- [x] **Step 3: register ใน api.py** — เพิ่ม import + `api_router.include_router(admin_business_hours.router, prefix="/admin/settings/business-hours", tags=["admin"])`

- [x] **Step 4: รัน tests** — `python -m pytest tests/test_admin_business_hours_endpoints.py -v`

---

## Task 4: Frontend — lib helpers

**Files:**
- Create: `frontend/lib/business-hours.ts`

- [x] **Step 1: สร้าง lib module** (ตาม pattern `lib/booking.ts`)

```typescript
import { API_BASE } from '@/lib/constants/api'

export interface BusinessHoursDay {
  day_of_week: number
  is_open: boolean
  open_time: string
  close_time: string
}

const BASE = `${API_BASE}/admin/settings/business-hours`

async function readError(res: Response, fallback: string): Promise<Error> {
  try {
    const body = await res.json()
    if (typeof body?.detail === 'string') return new Error(body.detail)
  } catch {
    /* ignore */
  }
  return new Error(fallback)
}

export async function fetchBusinessHours(): Promise<BusinessHoursDay[]> {
  const res = await fetch(BASE)
  if (!res.ok) throw await readError(res, 'โหลดเวลาทำการไม่สำเร็จ')
  const data = await res.json()
  return data.days
}

export async function saveBusinessHours(days: BusinessHoursDay[]): Promise<BusinessHoursDay[]> {
  const res = await fetch(BASE, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ days }),
  })
  if (!res.ok) throw await readError(res, 'บันทึกเวลาทำการไม่สำเร็จ')
  const data = await res.json()
  return data.days
}
```

---

## Task 5: Frontend — หน้า admin + hub card

**Files:**
- Create: `frontend/app/admin/settings/business-hours/page.tsx`
- Modify: `frontend/app/admin/settings/page.tsx` (เพิ่มการ์ดในส่วน "การจัดการระบบ")
- Test: `frontend/app/admin/settings/business-hours/__tests__/page.test.tsx` (สร้างใหม่)

- [x] **Step 1: เขียน failing tests** (mock fetch ด้วย `vi.stubGlobal` ตาม booking page test)

Cases:
1. render 7 วัน (จันทร์→อาทิตย์) หลังโหลด
2. toggle ปิดวัน → is_open=false ใน payload ที่ save
3. กด "เปิด 24 ชม." → open_time="00:00", close_time="24:00"
4. save → PUT ถูกเรียกพร้อม payload ครบ 7 วัน
5. fetch fail → Alert danger แสดง error

- [x] **Step 2: สร้าง page.tsx** — client component ตามรอย booking page:
  - state: `days: BusinessHoursDay[]`, `loading`, `saving`, `error`, `saved`
  - `THAI_DAY_NAMES = ['จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์', 'อาทิตย์']`
  - แต่ละแถว: checkbox เปิด/ปิด, `<input type="time">` ×2 (disabled เมื่อปิด), ปุ่ม "เปิด 24 ชม." (secondary, ตั้ง 00:00/24:00 + is_open=true)
  - client validation ก่อน save: วันเปิดต้อง open < close → set error ไม่ยิง API
  - header + subtitle อธิบายว่าค่านี้คุมทั้ง slot จองคิวและการโอนเข้าเจ้าหน้าที่
  - `<Button onClick={handleSave} disabled={saving}>` icon Save

- [x] **Step 3: เพิ่มการ์ดใน settings hub** — ส่วน "การจัดการระบบ" ต่อจากการ์ด booking: icon `Clock`, title "เวลาทำการ", desc "ตั้งค่าเวลาเปิด-ปิดรายสัปดาห์ (จองคิว + โอนเข้าเจ้าหน้าที่)", href `/admin/settings/business-hours`

- [x] **Step 4: รัน tests** — `npm run test:unit` (frontend/)

---

## Task 6: Verification + full gates

- [x] **Step 1: Backend full suite** — `python -m pytest` จาก `backend/` (WSL)
- [x] **Step 2: Frontend lint + build** — `npm run lint && npm run build` จาก `frontend/`
- [x] **Step 3: Frontend unit tests** — `npm run test:unit`
- [x] **Step 4: commit** — conventional commits แยก backend/frontend/docs

---

## Deviations Log

(กรอกเมื่อออกนอกแผน)
