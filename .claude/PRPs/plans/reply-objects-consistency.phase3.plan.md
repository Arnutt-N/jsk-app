# Plan: Broadcast Reply-Object References

## Summary
เพิ่มการ引用 reply objects ใน broadcast — admin สามารถส่ง broadcast โดย引用 `$object_id` แทนการ compose content ใหม่ทุกครั้ง

## User Story
As an Admin, I want to reference an existing reply object in a broadcast by its $object_id, so that I can reuse message templates without recreating content.

## Problem → Solution
**ปัจจุบัน**: Broadcast compose บังคับให้ compose content ใหม่ทุกครั้ง (text/image/flex เท่านั้น)
**เป้าหมาย**: Admin ใส่ `$object_id` → broadcast service resolve เป็น LINE message object จริง

## Metadata
- **Complexity**: Medium
- **Source PRD**: `.claude/PRPs/prds/reply-objects-consistency.prd.md`
- **PRD Phase**: Phase 3 — Broadcast reply-objects
- **Estimated Files**: 5 files
- **Confidence Score**: 10/10

---

## UX Design

### Before
```
Broadcast compose → เลือก type: text | image | flex → compose content ใหม่
```

### After
```
Broadcast compose → เลือก type: text | image | flex | Reply Object → ใส่ $object_id → reuse template
```

### Interaction Changes
| Touchpoint | Before | After | Notes |
|---|---|---|---|
| Type selection | 3 options | 4 options (+Reply Object) | New card in step 0 |
| Compose step | Content form | $object_id input | Simple text input |
| Preview | Shows content | Shows object_id reference | "$flex_welcome" |

---

## Mandatory Reading

| Priority | File | Lines | Why |
|---|---|---|---|
| P0 | `frontend/app/admin/chatbot/broadcast/new/page.tsx` | 24-44, 89-101 | MessageType + buildContent |
| P0 | `backend/app/services/broadcast_service.py` | 111-157 | _build_messages — resolve object_id |
| P1 | `backend/app/services/response_parser.py` | 76-108 | resolve_object() — reuse for broadcast |
| P2 | `backend/app/models/broadcast.py` | all | BroadcastType enum |

---

## Files to Change

| File | Action | Justification |
|---|---|---|
| `frontend/app/admin/chatbot/broadcast/new/page.tsx` | UPDATE | เพิ่ม Reply Object type option + $object_id input |
| `backend/app/services/broadcast_service.py` | UPDATE | เพิ่ม object_id resolution ใน _build_messages |
| `backend/tests/test_broadcast_reply_object.py` | CREATE | Tests for object_id resolution |

---

## Step-by-Step Tasks

### Task 1: เพิ่ม Reply Object option ใน broadcast compose UI
- **FILE**: `frontend/app/admin/chatbot/broadcast/new/page.tsx`
- **ACTION**: เพิ่ม type option "Reply Object" พร้อม icon
- **IMPLEMENT**:
  1. เพิ่ม state `objectIdRef` สำหรับ $object_id input
  2. เพิ่ม TYPE_OPTIONS entry: `{ type: 'object_ref', label: 'Reply Object', desc: 'ใช้ template ที่มีอยู่', icon: <Package /> }`
  3. เพิ่ม step 1 form สำหรับ object_id: text input พร้อม `$` prefix hint
  4. แก้ `buildContent()` → return `{ object_id: objectIdRef }` สำหรับ type 'object_ref'
  5. แก้ `canProceed()` step 1 → validate objectIdRef ไม่ empty
- **MIRROR**: ดู flexJson input pattern
- **GOTCHA**: `MessageType` type ต้องเพิ่ม `'object_ref'` (ตรงกับ backend BroadcastType.OBJECT_REF)
- **VALIDATE**: เลือก Reply Object → เห็น $object_id input

### Task 2: เพิ่ม object_id resolution ใน broadcast service
- **FILE**: `backend/app/services/broadcast_service.py`
- **ACTION**: เพิ่ม case สำหรับ resolve object_id ใน `_build_messages()`
- **IMPLEMENT**:
  ```python
  # ใน _build_messages() เพิ่มหลัง MULTI case:
  elif broadcast.message_type == BroadcastType.OBJECT_REF:
      object_id = content.get("object_id", "")
      if object_id:
          resolved = await resolve_object(object_id, db)  # reuse response_parser
          if resolved:
              messages.append(resolved)
  ```
  **หมายเหตุ**: `_build_messages` ปัจจุบันเป็น sync method — ต้อง refactor เป็น async เพื่อใช้ `resolve_object()`
- **MIRROR**: ดู MULTI case pattern
- **GOTCHA**: `_build_messages` ต้องเปลี่ยนเป็น async + รับ db parameter
- **VALIDATE**: สร้าง broadcast ด้วย object_id → _build_messages return resolved message

### Task 3: เพิ่ม OBJECT_REF ใน BroadcastType enum
- **FILE**: `backend/app/models/broadcast.py`
- **ACTION**: เพิ่ม `OBJECT_REF = "object_ref"` ใน BroadcastType
- **MIRROR**: ดู enum pattern ที่มีอยู่
- **GOTCHA**: ต้อง sync กับ frontend MessageType
- **VALIDATE**: import BroadcastType → มี OBJECT_REF

### Task 4: Update edit page สำหรับ OBJECT_REF
- **FILE**: `frontend/app/admin/chatbot/broadcast/[id]/page.tsx`
- **ACTION**: เพิ่ม rendering สำหรับ OBJECT_REF type
- **IMPLEMENT**: แสดง object_id reference ใน preview section
- **MIRROR**: ดู existing type rendering patterns
- **GOTCHA**: ต้อง handle case ที่ content.object_id อาจไม่มี
- **VALIDATE**: เปิด broadcast edit page สำหรับ OBJECT_REF type → แสดง object_id

### Task 5: สร้าง tests
- **FILE**: `backend/tests/test_broadcast_reply_object.py`
- **ACTION**: ทดสอบ _build_messages สำหรับ OBJECT_REF type
- **MIRROR**: ดู test_broadcast_service.py pattern
- **GOTCHA**: ต้อง mock resolve_object (ไม่ต้อง mock DB)
- **VALIDATE**: `python -m pytest tests/test_broadcast_reply_object.py -v --noconftest`

---

## Validation Commands

### Frontend Type Check
```bash
cd frontend && npx tsc --noEmit
```

### Backend Tests
```bash
cd backend && python -m pytest tests/test_broadcast_reply_object.py tests/test_broadcast_service.py -v --noconftest
```

---

## Acceptance Criteria
- [ ] Broadcast compose มี Reply Object type option
- [ ] Admin ใส่ $object_id ได้
- [ ] Broadcast service resolve object_id เป็น LINE message
- [ ] Tests ผ่าน
- [ ] Frontend type check ผ่าน

## Risks
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| _build_messages refactor to async | LOW | MEDIUM | Method signature change, callers need update |
| Object not found at send time | LOW | LOW | Log warning, skip message |

## Notes
- Reuse `resolve_object()` จาก response_parser.py — ไม่ต้องเขียน logic ใหม่
- `_build_messages` refactor เป็น async เป็น breaking change — ต้อง update callers:
  - `send_broadcast()` line 168 → `await self._build_messages(broadcast, db)`
  - `test_broadcast_service.py` → update mock/assertion
- หน้า edit `broadcast/[id]/page.tsx` ต้องรองรับ OBJECT_REF type ด้วย (แสดง object_id reference)
