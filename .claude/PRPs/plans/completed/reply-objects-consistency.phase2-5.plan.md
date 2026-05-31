# Plan: Reply-Objects Consistency — Phase 2-5

## Summary
ปรับปรุงความสอดคล้องของ reply-objects system ในทุก layer — sync frontend dropdowns ให้ตรง backend, เพิ่ม reply-object引用ใน broadcast, unify MatchType enum, และสร้าง comprehensive tests

## User Story
As an Admin, I want all message types to appear correctly in all dropdowns and broadcast to support reply-object references, so that the system is consistent and I can reuse templates everywhere.

## Problem → Solution
**ปัจจุบัน**: Frontend dropdowns ไม่ตรง backend, broadcast ไม่รองรับ reply-object引用, MatchType enum ไม่一致
**เป้าหมาย**: ทุก layer sync กัน, admin ใช้ reply objects ได้ทุกที่

## Metadata
- **Complexity**: Medium
- **Source PRD**: `.claude/PRPs/prds/reply-objects-consistency.prd.md`
- **PRD Phase**: Phase 2, 3, 4, 5
- **Estimated Files**: 5 files

---

## UX Design

### Phase 2: Sync Frontend Types

**Before:**
```
Reply Objects dropdown:  text, flex, image, sticker, video, audio, location (7 types)
Auto-Replies response:   text, flex, image, sticker, video (5 types)
Backend model:           text, flex, image, sticker, video, audio, location, imagemap (8 types)
```

**After:**
```
Reply Objects dropdown:  text, flex, image, sticker, video, audio, location, imagemap (8 types)
Auto-Replies response:   text, flex, image, sticker, video, audio, location, imagemap, template (9 types)
Backend model:           text, flex, image, sticker, video, audio, location, imagemap (8 types)
```

### Phase 3: Broadcast Reply-Objects

**Before:**
```
Broadcast compose → เลือก type: text, image, flex → compose content ใหม่ทุกครั้ง
```

**After:**
```
Broadcast compose → เลือก type: text, image, flex, OR ใส่ $object_id → reuse existing reply object
```

### Phase 4: MatchType Unification

**Before:**
```
AutoReply MatchType: EXACT, CONTAINS, REGEX (3 values)
Intent MatchType:    EXACT, CONTAINS, REGEX, STARTS_WITH (4 values)
Frontend:            exact, contains, starts_with, regex (4 values)
```

**After:**
```
AutoReply MatchType: EXACT, CONTAINS, REGEX, STARTS_WITH (4 values) ← เพิ่ม STARTS_WITH
Intent MatchType:    EXACT, CONTAINS, REGEX, STARTS_WITH (4 values)
Frontend:            exact, contains, starts_with, regex (4 values)
```

---

## Mandatory Reading

| Priority | File | Lines | Why |
|---|---|---|---|
| P0 | `frontend/app/admin/reply-objects/page.tsx` | 26 | OBJECT_TYPES array — missing imagemap |
| P0 | `frontend/app/admin/auto-replies/[id]/page.tsx` | 40 | REPLY_TYPES array — missing audio, location, imagemap, template |
| P0 | `frontend/app/admin/chatbot/broadcast/new/page.tsx` | 24, 40-44 | MessageType + TYPE_OPTIONS — only text/image/flex |
| P1 | `backend/app/models/auto_reply.py` | 18-22 | MatchType enum — missing STARTS_WITH |
| P1 | `backend/app/models/intent.py` | 8-13 | MatchType enum — has STARTS_WITH (reference) |
| P2 | `backend/app/services/broadcast_service.py` | all | Broadcast service — how messages are built |

---

## Files to Change

| File | Action | Phase | Justification |
|---|---|---|---|
| `frontend/app/admin/reply-objects/page.tsx` | UPDATE | 2 | เพิ่ม imagemap ใน OBJECT_TYPES |
| `frontend/app/admin/auto-replies/[id]/page.tsx` | UPDATE | 2 | เพิ่ม audio, location, imagemap, template ใน REPLY_TYPES |
| `frontend/app/admin/chatbot/broadcast/new/page.tsx` | UPDATE | 3 | เพิ่ม reply-object reference option |
| `backend/app/models/auto_reply.py` | UPDATE | 4 | เพิ่ม STARTS_WITH ใน MatchType |
| `backend/tests/test_match_type_unification.py` | CREATE | 5 | Tests for MatchType consistency |

## NOT Building
- Visual imagemap builder UI
- Broadcast reply-object picker UI (ใช้ text input $object_id แทน)
- Migration ของ existing data

---

## Step-by-Step Tasks

### Phase 2: Sync Frontend Types

#### Task 1: เพิ่ม IMAGEMAP ใน reply-objects dropdown
- **ACTION**: เพิ่ม `'imagemap'` ใน OBJECT_TYPES array
- **IMPLEMENT**: แก้ line 26 จาก 7 เป็น 8 types
- **FILE**: `frontend/app/admin/reply-objects/page.tsx:26`
- **MIRROR**: ดู array pattern ที่มีอยู่
- **GOTCHA**: ต้อง lowercase ตรงกับ backend enum value
- **VALIDATE**: เปิด reply-objects page → dropdown มี 8 types

#### Task 2: เพิ่ม audio, location, imagemap, template ใน auto-replies response types
- **ACTION**: เพิ่ม 4 types ใน REPLY_TYPES array
- **FILE**: `frontend/app/admin/auto-replies/[id]/page.tsx:40`
- **IMPLEMENT**: แก้จาก 5 เป็น 9 types
- **MIRROR**: ดู MATCH_TYPES array line 39
- **GOTCHA**: `template` ไม่ใช่ message type ตรงๆ แต่เป็น response type ที่ใช้ JSON payload
- **VALIDATE**: เปิด auto-reply detail → response form มี 9 types

### Phase 3: Broadcast Reply-Objects

#### Task 3: เพิ่ม reply-object reference ใน broadcast compose
- **ACTION**: เพิ่ม option ให้ใส่ `$object_id` ใน broadcast compose
- **FILE**: `frontend/app/admin/chatbot/broadcast/new/page.tsx`
- **IMPLEMENT**:
  1. เพิ่ม state `objectIdRef` สำหรับ $object_id input
  2. เพิ่ม UI input สำหรับใส่ object_id (หลัง step 1 type selection)
  3. แก้ `buildContent()` ให้รองรับ object_id reference
  4. เพิ่ม step validation สำหรับ object_id
- **MIRROR**: ดู flexJson input pattern ที่มีอยู่
- **GOTCHA**: `$object_id` syntax ต้องตรงกับ response_parser.py pattern
- **VALIDATE**: สร้าง broadcast ด้วย $object_id → save สำเร็จ

### Phase 4: MatchType Unification

#### Task 4: เพิ่ม STARTS_WITH ใน auto_reply.py MatchType
- **ACTION**: เพิ่ม `STARTS_WITH = "starts_with"` ใน MatchType enum
- **FILE**: `backend/app/models/auto_reply.py:18-22`
- **IMPLEMENT**:
  ```python
  class MatchType(str, enum.Enum):
      EXACT = "exact"
      CONTAINS = "contains"
      REGEX = "regex"
      STARTS_WITH = "starts_with"  # ← เพิ่ม
  ```
- **MIRROR**: ดู `backend/app/models/intent.py:8-13` ที่มี STARTS_WITH แล้ว
- **GOTCHA**: ต้องเพิ่ม Alembic migration สำหรับ enum value ใหม่
- **VALIDATE**: import auto_reply.MatchType → มี 4 values

#### Task 5: สร้าง Alembic migration สำหรับ STARTS_WITH
- **ACTION**: สร้าง migration เพิ่ม STARTS_WITH value ใน matchtype enum
- **IMPLEMENT**: `python scripts/db_target.py alembic --target local revision --autogenerate -m "add starts_with to matchtype"`
- **MIRROR**: ดู migration pattern จาก `8a9b1c2d3e4f_add_intent_tables_manual.py`
- **GOTCHA**: PostgreSQL enum alter ต้องใช้ `ALTER TYPE ... ADD VALUE`
- **VALIDATE**: `python scripts/db_target.py alembic --target local upgrade head`

### Phase 5: Tests & Validation

#### Task 6: สร้าง comprehensive tests
- **ACTION**: สร้าง tests สำหรับ MatchType consistency
- **FILE**: `backend/tests/test_match_type_unification.py`
- **IMPLEMENT**: ทดสอบว่า MatchType enum values ตรงกันระหว่าง auto_reply และ intent
- **MIRROR**: ดู test pattern จาก `test_broadcast_service.py`
- **GOTCHA**: ไม่ต้อง mock DB — ทดสอบ enum values โดยตรง
- **VALIDATE**: `python -m pytest tests/test_match_type_unification.py -v`

---

## Testing Strategy

### Unit Tests

| Test | Input | Expected Output |
|---|---|---|
| MatchType auto_reply has STARTS_WITH | `MatchType.STARTS_WITH` | `"starts_with"` |
| MatchType intent has STARTS_WITH | `MatchType.STARTS_WITH` | `"starts_with"` |
| Both MatchTypes have same values | compare enum values | identical |

### Manual Validation
- [ ] Reply Objects page → dropdown มี 8 types รวม imagemap
- [ ] Auto-Replies detail → response form มี 9 types
- [ ] Broadcast compose → สามารถใส่ $object_id ได้
- [ ] AutoReply keyword → STARTS_WITH match type ใช้ได้

---

## Validation Commands

### Frontend Type Check
```bash
cd frontend && npx tsc --noEmit
```
EXPECT: Zero type errors

### Frontend Lint
```bash
cd frontend && npm run lint
```
EXPECT: No errors

### Backend Tests
```bash
cd backend && python -m pytest tests/test_match_type_unification.py -v --noconftest
```
EXPECT: All tests pass

### Database Migration
```bash
cd backend && python scripts/db_target.py alembic --target local upgrade head
```
EXPECT: Migration successful

---

## Acceptance Criteria
- [ ] Frontend reply-objects dropdown มี 8 types
- [ ] Frontend auto-replies response types มี 9 types
- [ ] Broadcast compose รองรับ $object_id reference
- [ ] AutoReply MatchType มี STARTS_WITH
- [ ] Alembic migration ผ่าน
- [ ] Tests ผ่าน
- [ ] Frontend type check ผ่าน

## Risks
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Alembic migration conflict | LOW | MEDIUM | Use `ALTER TYPE ADD VALUE IF NOT EXISTS` |
| Frontend type errors | LOW | LOW | Run tsc --noEmit after changes |

## Notes
- Phase 2 + 4 ทำพร้อมกันได้ (ไม่มี dependency)
- Phase 3 依赖 Phase 1 (เสร็จแล้ว)
- Phase 5 依赖 Phase 2, 3, 4 (ทำหลังสุด)
