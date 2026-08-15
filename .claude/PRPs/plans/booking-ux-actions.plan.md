# Booking UX Actions — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** แก้ 2 ปัญหา UX: (1) หน้า admin คิวนัดหมาย default แสดงทุกวัน (ไม่ filter วันนี้), (2) หน้า LIFF หลังจองมีปุ่มยกเลิก + แก้ไขข้อมูลติดต่อ

**Architecture:** เปลี่ยน default date filter ฝั่ง admin + เรียง asc; เพิ่ม `PATCH /liff/bookings/{id}` (แก้ contact info เท่านั้น, ownership + status + time guard เหมือน cancel); ฝั่ง LIFF เพิ่มปุ่มยกเลิก (ใช้ API เดิม) + ปุ่มแก้ไข (เปิด form → PATCH)

**Tech Stack:** FastAPI + SQLAlchemy 2.0 async, Pydantic v2; Next.js/React + Tailwind; pytest (direct-call + AsyncMock), vitest

**PRD:** `.claude/PRPs/prds/booking-ux-actions.prd.md`

## Global Constraints

- **PATCH แก้ได้แค่ contact info** (contact_name/phone_number/note) — ห้ามแก้ service/date/time (ต้องยกเลิกแล้วจองใหม่)
- **Ownership + status guard เหมือน cancel_booking** — 404 เดียวกันทั้ง "ไม่มี" และ "ไม่ใช่ของเรา"; 409 ถ้าไม่ใช่ CONFIRMED หรือนัดผ่านไปแล้ว
- **ไม่สร้าง API ยกเลิกใหม่** — ใช้ `POST /liff/bookings/{id}/cancel` เดิม
- **Admin default = ทุกวัน** — `date=''` ไม่ส่ง param; เรียง `booking_date.asc(), booking_time.asc()`
- **ข้อความ error เป็นภาษาไทย**; identifier/โค้ดเป็นอังกฤษ
- **ไม่มี DB migration**

---

## File Structure

- `backend/app/schemas/booking.py` — เพิ่ม `BookingUpdateIn`
- `backend/app/api/v1/endpoints/liff_bookings.py` — เพิ่ม `PATCH /{booking_id}`
- `backend/tests/test_booking_update.py` — **สร้างใหม่**
- `frontend/lib/booking.ts` — เพิ่ม `updateBookingContact()`
- `frontend/app/liff/booking/page.tsx` — ปุ่มยกเลิก + แก้ไข + form
- `frontend/app/admin/bookings/page.tsx` — default ทุกวัน + เรียง asc
- `frontend/app/admin/bookings/__tests__/page.test.tsx` — อัปเดต test default
- `frontend/app/liff/booking/__tests__/page.test.tsx` — **สร้างใหม่** (ถ้ายังไม่มี)

---

## Task 1: Backend — `PATCH /liff/bookings/{id}`

**Files:**
- Modify: `backend/app/schemas/booking.py`
- Modify: `backend/app/api/v1/endpoints/liff_bookings.py`
- Test: `backend/tests/test_booking_update.py` (create)

- [ ] **Step 1: เขียน failing tests** (direct-call style ตาม test_booking_list.py)

```python
# tests/test_booking_update.py
"""PATCH /liff/bookings/{id} — citizen edits their own contact info."""
from datetime import date, datetime, time
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest

from app.api.v1.endpoints import liff_bookings
from app.models.booking import Booking, BookingStatus
from app.schemas.booking import BookingUpdateIn


def _booking(status=BookingStatus.CONFIRMED, user_id=7):
    return Booking(
        id=1, user_id=user_id, service_type="ปรึกษากฎหมาย",
        booking_date=date(2026, 8, 19), booking_time=time(9, 0), status=status,
    )


@pytest.mark.asyncio
async def test_update_contact_info_happy_path():
    booking = _booking()
    db = AsyncMock()
    db.get = AsyncMock(return_value=booking)
    with patch("app.api.v1.endpoints.liff_bookings.resolve_by_line_id",
               new=AsyncMock(return_value=SimpleNamespace(id=7))), \
         patch("app.services.booking_service.local_now",
               return_value=datetime(2026, 8, 12, 9, 0)):
        result = await liff_bookings.update_my_booking(
            booking_id=1, payload=BookingUpdateIn(contact_name="ใหม่"),
            db=db, line_user_id="U1",
        )
    assert booking.contact_name == "ใหม่"
    assert result.contact_name == "ใหม่"
    db.commit.assert_awaited()


@pytest.mark.asyncio
async def test_update_booking_of_another_user_is_404():
    booking = _booking(user_id=99)
    db = AsyncMock()
    db.get = AsyncMock(return_value=booking)
    with patch("app.api.v1.endpoints.liff_bookings.resolve_by_line_id",
               new=AsyncMock(return_value=SimpleNamespace(id=7))):
        with pytest.raises(Exception) as exc:
            await liff_bookings.update_my_booking(
                booking_id=1, payload=BookingUpdateIn(contact_name="x"),
                db=db, line_user_id="U1",
            )
    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_update_cancelled_booking_is_409():
    booking = _booking(status=BookingStatus.CANCELLED)
    db = AsyncMock()
    db.get = AsyncMock(return_value=booking)
    with patch("app.api.v1.endpoints.liff_bookings.resolve_by_line_id",
               new=AsyncMock(return_value=SimpleNamespace(id=7))):
        with pytest.raises(Exception) as exc:
            await liff_bookings.update_my_booking(
                booking_id=1, payload=BookingUpdateIn(contact_name="x"),
                db=db, line_user_id="U1",
            )
    assert exc.value.status_code == 409


@pytest.mark.asyncio
async def test_update_past_booking_is_409():
    booking = _booking()
    db = AsyncMock()
    db.get = AsyncMock(return_value=booking)
    with patch("app.api.v1.endpoints.liff_bookings.resolve_by_line_id",
               new=AsyncMock(return_value=SimpleNamespace(id=7))), \
         patch("app.services.booking_service.local_now",
               return_value=datetime(2026, 8, 20, 9, 0)):  # after the booking
        with pytest.raises(Exception) as exc:
            await liff_bookings.update_my_booking(
                booking_id=1, payload=BookingUpdateIn(contact_name="x"),
                db=db, line_user_id="U1",
            )
    assert exc.value.status_code == 409
```

- [ ] **Step 2: เพิ่ม schema `BookingUpdateIn`** ใน `schemas/booking.py`:

```python
class BookingUpdateIn(BaseModel):
    """Citizen-editable contact fields. All optional — send only what changed."""
    contact_name: Optional[str] = Field(default=None, max_length=120)
    phone_number: Optional[str] = Field(default=None, max_length=20)
    note: Optional[str] = Field(default=None, max_length=1000)

    @field_validator("phone_number")
    @classmethod
    def _digits_only(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        cleaned = value.strip().replace("-", "").replace(" ", "")
        if not cleaned:
            return None
        if not cleaned.isdigit():
            raise ValueError("phone_number must contain digits only")
        return cleaned

    @field_validator("contact_name", "note")
    @classmethod
    def _strip_blank(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        return value.strip() or None
```

- [ ] **Step 3: เพิ่ม endpoint** ใน `liff_bookings.py` (หลัง cancel):

```python
@router.patch(
    "/{booking_id}",
    response_model=BookingOut,
    summary="Update my booking contact info",
    dependencies=[_submit_rate_limit],
)
async def update_my_booking(
    booking_id: int = Path(ge=1),
    payload: BookingUpdateIn = None,
    db: AsyncSession = Depends(get_db),
    line_user_id: str = Depends(require_line_user_id),
):
    user = await resolve_by_line_id(db, line_user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="ไม่พบการจอง")

    booking = await db.get(Booking, booking_id)
    if booking is None or booking.user_id != user.id:
        raise HTTPException(status_code=404, detail="ไม่พบการจอง")

    if booking.status != BookingStatus.CONFIRMED:
        raise HTTPException(status_code=409, detail="การจองนี้แก้ไขไม่ได้แล้ว")

    appointment_at = datetime.combine(booking.booking_date, booking.booking_time)
    if appointment_at <= booking_service.local_now():
        raise HTTPException(status_code=409, detail="การจองนี้แก้ไขไม่ได้แล้ว")

    if payload.contact_name is not None:
        booking.contact_name = payload.contact_name
    if payload.phone_number is not None:
        booking.phone_number = payload.phone_number
    if payload.note is not None:
        booking.note = payload.note

    await db.commit()
    await db.refresh(booking)
    return BookingOut.model_validate(booking)
```

- [ ] **Step 4: รัน tests** — `python -m pytest tests/test_booking_update.py -v`

---

## Task 2: Frontend — lib helper

**Files:**
- Modify: `frontend/lib/booking.ts`

- [ ] **Step 1: เพิ่ม `updateBookingContact()`** (ตาม pattern `cancelBooking`):

```typescript
export async function updateBookingContact(
  idToken: string,
  bookingId: number,
  payload: { contact_name?: string | null; phone_number?: string | null; note?: string | null },
): Promise<Booking> {
  const res = await fetch(`${LIFF_BASE}/${bookingId}`, {
    method: 'PATCH',
    headers: liffHeaders(idToken),
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(await readError(res, 'แก้ไขข้อมูลไม่สำเร็จ'))
  return res.json()
}
```

---

## Task 3: Frontend — LIFF booking page (ยกเลิก + แก้ไข)

**Files:**
- Modify: `frontend/app/liff/booking/page.tsx`
- Test: `frontend/app/liff/booking/__tests__/page.test.tsx` (create)

- [ ] **Step 1: เขียน failing tests** (mock fetch ตาม pattern booking settings test)

Cases:
1. step 'done' มีปุ่ม "ยกเลิกการจอง" → คลิก → confirm → `cancelBooking` ถูกเรียก → กลับ step 'service'
2. step 'done' มีปุ่ม "แก้ไขข้อมูล" → คลิก → form แสดง prefilled → แก้ชื่อ → save → PATCH ถูกเรียก → กลับ 'done' + Alert
3. cancel fail → Alert error

- [ ] **Step 2: แก้ page.tsx**

State เพิ่ม: `editing: boolean`, `cancelling: boolean`

```tsx
// ใน step 'done' section เพิ่ม:
<div className="mt-5 space-y-2">
  <Button variant="secondary" className="w-full" onClick={() => setEditing(true)}>
    แก้ไขข้อมูล
  </Button>
  <Button variant="danger" className="w-full" onClick={handleCancel} disabled={cancelling}>
    {cancelling ? 'กำลังยกเลิก...' : 'ยกเลิกการจอง'}
  </Button>
</div>
```

```tsx
const handleCancel = async () => {
  if (!idToken || !confirmed) return
  if (!window.confirm('ต้องการยกเลิกการจองนี้หรือไม่?')) return
  setCancelling(true)
  setError(null)
  try {
    await cancelBooking(idToken, confirmed.id)
    setConfirmed(null)
    setServiceType(null)
    setSelectedDate(null)
    setSelectedSlot(null)
    setAvailability(null)
    setContactName('')
    setPhoneNumber('')
    setNote('')
    setSavedMessage('ยกเลิกการจองแล้ว')
  } catch (err) {
    logger.error('Cancel booking failed:', err)
    setError(err instanceof Error ? err.message : 'ยกเลิกไม่สำเร็จ')
  } finally {
    setCancelling(false)
  }
}
```

```tsx
// editing form (เมื่อ editing && confirmed):
const handleUpdate = async () => {
  if (!idToken || !confirmed) return
  setSubmitting(true)
  setError(null)
  try {
    const updated = await updateBookingContact(idToken, confirmed.id, {
      contact_name: contactName.trim() || null,
      phone_number: phoneNumber.trim() || null,
      note: note.trim() || null,
    })
    setConfirmed(updated)
    setEditing(false)
    setSavedMessage('แก้ไขข้อมูลเรียบร้อย')
  } catch (err) {
    logger.error('Update booking failed:', err)
    setError(err instanceof Error ? err.message : 'แก้ไขข้อมูลไม่สำเร็จ')
  } finally {
    setSubmitting(false)
  }
}
```

- [ ] **Step 3: รัน tests** — `npm run test:unit -- app/liff/booking/__tests__/page.test.tsx`

---

## Task 4: Frontend — admin bookings default ทุกวัน

**Files:**
- Modify: `frontend/app/admin/bookings/page.tsx`
- Modify: `frontend/app/admin/bookings/__tests__/page.test.tsx`

- [ ] **Step 1: แก้ default** — `useState<string>('')` (แทน `toISODate(new Date())`)

```tsx
const [date, setDate] = useState('')  // '' = ทุกวัน
```

- [ ] **Step 2: แก้ label + footer** — เมื่อ `date === ''` แสดง "ทุกวัน" แทนวันที่

- [ ] **Step 3: อัปเดต tests** — default ไม่ส่ง date param; เรียง asc

---

## Task 5: Backend — admin list เรียง asc

**Files:**
- Modify: `backend/app/api/v1/endpoints/admin_bookings.py:55-56`

- [ ] **Step 1: แก้ order** — `booking_date.asc(), booking_time.asc()`

- [ ] **Step 2: รัน tests** — `python -m pytest tests/test_admin_bookings_endpoints.py -v`

---

## Task 6: Verification + full gates

- [ ] **Step 1: Backend full suite** — `python -m pytest` (WSL)
- [ ] **Step 2: Frontend lint + build** — `npm run lint && npm run build`
- [ ] **Step 3: Frontend unit tests** — `npm run test:unit`
- [ ] **Step 4: commit** — conventional commits แยก backend/frontend

---

## Deviations Log

(กรอกเมื่อออกนอกแผน)
