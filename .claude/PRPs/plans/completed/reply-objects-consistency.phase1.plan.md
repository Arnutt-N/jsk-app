# Plan: Fix response_parser — Add VIDEO, AUDIO, IMAGEMAP Support

## Summary
แก้ไข `response_parser.py` ให้รองรับ VIDEO, AUDIO, IMAGEMAP message types ที่ขาดอยู่ และเพิ่ม IMAGEMAP ใน schema enum ที่หายไป ทำให้ reply objects ทุกประเภทที่สร้างได้ในระบบสามารถใช้งานได้จริง

## User Story
As an Admin, I want to create reply objects of any type (including VIDEO, AUDIO, IMAGEMAP) and have them resolve correctly when referenced in auto-reply responses, so that all message types work end-to-end without silent failures.

## Problem → Solution
**ปัจจุบัน**: `response_parser.build_message_from_object()` รองรับแค่ 5 จาก 8 types (FLEX, IMAGE, STICKER, LOCATION, TEXT) — VIDEO, AUDIO, IMAGEMAP ถูกสร้างได้แต่ resolve ไม่ได้ (silent fail → return None)

**เป้าหมาย**: รองรับครบทั้ง 8 types — ทุก reply object ที่สร้างได้ก็ใช้ได้จริง

## Metadata
- **Complexity**: Small
- **Source PRD**: `.claude/PRPs/prds/reply-objects-consistency.prd.md`
- **PRD Phase**: Phase 1 — Fix response_parser
- **Estimated Files**: 3 files (2 update, 1 create)

---

## UX Design

### Before
```
Admin สร้าง reply object (VIDEO type)
  → บันทึกสำเร็จ ✓
  → ใช้ $video_test ใน auto-reply
  → User ส่ง keyword → ไม่ได้รับอะไร (silent fail)
```

### After
```
Admin สร้าง reply object (VIDEO type)
  → บันทึกสำเร็จ ✓
  → ใช้ $video_test ใน auto-reply
  → User ส่ง keyword → ได้รับ video message จริง ✓
```

### Interaction Changes
| Touchpoint | Before | After | Notes |
|---|---|---|---|
| VIDEO reply object | Silent fail | Works | `VideoMessage` from LINE SDK |
| AUDIO reply object | Silent fail | Works | `AudioMessage` from LINE SDK |
| IMAGEMAP reply object | Silent fail | Works | `ImagemapMessage` from LINE SDK |
| Schema dropdown | Missing IMAGEMAP | Has IMAGEMAP | API accepts all 8 types |

---

## Mandatory Reading

| Priority | File | Lines | Why |
|---|---|---|---|
| P0 (critical) | `backend/app/services/response_parser.py` | 107-161 | `build_message_from_object()` — target function to modify |
| P0 (critical) | `backend/app/models/reply_object.py` | 12-21 | `ObjectType` enum — reference for all 8 types |
| P1 (important) | `backend/app/schemas/reply_object.py` | 10-17 | `ObjectTypeEnum` — missing IMAGEMAP |
| P2 (reference) | `backend/tests/test_broadcast_service.py` | 1-50 | Test pattern to follow |

---

## External Documentation

| Topic | Source | Key Takeaway |
|---|---|---|
| VideoMessage | linebot.v3.messaging | `original_content_url`, `preview_image_url` (both required) |
| AudioMessage | linebot.v3.messaging | `original_content_url`, `duration` (both required) |
| ImagemapMessage | linebot.v3.messaging | `base_url`, `alt_text`, `base_size`, `actions` (all required) |
| ImagemapBaseSize | linebot.v3.messaging | `width`, `height` (both required) |

---

## Patterns to Mirror

### ERROR_HANDLING
// SOURCE: `backend/app/services/response_parser.py:117-161`
```python
try:
    payload = obj.payload
    if obj.object_type == ObjectType.FLEX:
        # ...
    else:
        logger.warning(f"Unsupported object type: {obj.object_type}")
        return None
except Exception as e:
    logger.error(f"Error building message from object {obj.object_id}: {e}")
    return None
```

### IMPORT_PATTERN
// SOURCE: `backend/app/services/response_parser.py:13-20`
```python
from linebot.v3.messaging import (
    TextMessage,
    FlexMessage,
    FlexContainer,
    ImageMessage,
    StickerMessage,
    LocationMessage
)
```

### TEST_PATTERN
// SOURCE: `backend/tests/test_broadcast_service.py:12-28`
```python
def _broadcast(**overrides):
    defaults = dict(id=1, title="Test", ...)
    defaults.update(overrides)
    return SimpleNamespace(**defaults)

@pytest.mark.asyncio
async def test_send_broadcast_rejects_completed_status():
    svc = BroadcastService()
    bc = _broadcast(status=BroadcastStatus.COMPLETED)
    db = AsyncMock()
    with pytest.raises(ValueError, match="Cannot send"):
        await svc.send_broadcast(db, bc)
```

---

## Files to Change

| File | Action | Justification |
|---|---|---|
| `backend/app/services/response_parser.py` | UPDATE | Add VIDEO, AUDIO, IMAGEMAP cases + imports |
| `backend/app/schemas/reply_object.py` | UPDATE | Add IMAGEMAP to ObjectTypeEnum |
| `backend/tests/test_response_parser.py` | CREATE | Unit tests for all 8 message types |

## NOT Building
- Imagemap visual builder UI (ใช้ raw JSON editor ต่อไป)
- Migration ของ existing reply objects
- Broadcast reply-object引用 (Phase 3)

---

## Step-by-Step Tasks

### Task 1: Add IMAGEMAP to ObjectTypeEnum schema
- **ACTION**: เพิ่ม IMAGEMAP value ใน `ObjectTypeEnum`
- **IMPLEMENT**: เพิ่ม `IMAGEMAP = "imagemap"` หลัง LOCATION
- **MIRROR**: ดู `backend/app/models/reply_object.py:21` ที่ model มี IMAGEMAP แล้ว
- **IMPORTS**: None (แก้ไข enum ที่มีอยู่)
- **GOTCHA**: ต้องตรงกับ model enum value (`"imagemap"`)
- **VALIDATE**: import schema enum → ต้องมี 8 values ตรงกับ model

### Task 2: Add new message imports to response_parser
- **ACTION**: เพิ่ม `VideoMessage`, `AudioMessage`, `ImagemapMessage`, `ImagemapBaseSize` ใน import
- **IMPLEMENT**: แก้ import block ที่ line 13-20
- **MIRROR**: ดู import pattern ที่มีอยู่
- **IMPORTS**: `from linebot.v3.messaging import (..., VideoMessage, AudioMessage, ImagemapMessage, ImagemapBaseSize)`
- **GOTCHA**: `ImagemapBaseSize` ไม่ใช่ message type — import จาก `linebot.v3.messaging` เหมือนกัน แค่เพิ่มใน import list เดียวกัน
- **VALIDATE**: `python -c "from app.services.response_parser import VideoMessage, AudioMessage, ImagemapMessage"`

### Task 3: Add VIDEO case in build_message_from_object
- **ACTION**: เพิ่ม `elif obj.object_type == ObjectType.VIDEO:` block
- **IMPLEMENT**:
  ```python
  elif obj.object_type == ObjectType.VIDEO:
      return VideoMessage(
          original_content_url=payload.get("original_content_url") or payload.get("url"),
          preview_image_url=payload.get("preview_image_url") or payload.get("preview_url") or payload.get("url"),
      )
  ```
- **MIRROR**: ดู IMAGE case ที่ line 129-133 — ใช้ `.get()` + fallback pattern เหมือนกัน
- **IMPORTS**: None (import ทำใน Task 2)
- **GOTCHA**: LINE SDK ใช้ snake_case (`original_content_url`) ไม่ใช่ camelCase
- **VALIDATE**: สร้าง mock ReplyObject(object_type=VIDEO, payload={...}) → call → ได้ VideoMessage

### Task 4: Add AUDIO case in build_message_from_object
- **ACTION**: เพิ่ม `elif obj.object_type == ObjectType.AUDIO:` block
- **IMPLEMENT**:
  ```python
  elif obj.object_type == ObjectType.AUDIO:
      return AudioMessage(
          original_content_url=payload.get("original_content_url") or payload.get("url"),
          duration=int(payload.get("duration", 0)),
      )
  ```
- **MIRROR**: ดู LOCATION case ที่ line 143-149 — ใช้ `float()` cast pattern
- **IMPORTS**: None
- **GOTCHA**: `duration` ต้องเป็น int (milliseconds) — ใช้ `int()` cast ป้องกัน type error
- **VALIDATE**: สร้าง mock ReplyObject(object_type=AUDIO, payload={"url": "...", "duration": 5000}) → call → ได้ AudioMessage

### Task 5: Add IMAGEMAP case in build_message_from_object
- **ACTION**: เพิ่ม `elif obj.object_type == ObjectType.IMAGEMAP:` block
- **IMPLEMENT**:
  ```python
  elif obj.object_type == ObjectType.IMAGEMAP:
      base_size = ImagemapBaseSize(
          width=int(payload.get("base_size", {}).get("width", 1040)),
          height=int(payload.get("base_size", {}).get("height", 1040)),
      )
      return ImagemapMessage(
          base_url=payload.get("base_url") or payload.get("url"),
          alt_text=obj.alt_text or payload.get("alt_text") or f"ImageMap: {obj.name}",
          base_size=base_size,
          actions=payload.get("actions", []),
      )
  ```
- **MIRROR**: ดู FLEX case ที่ line 120-126 — nested object construction pattern
- **IMPORTS**: None
- **GOTCHA**: `actions` ต้องเป็น list of ImagemapAction dicts — LINE SDK แปลงจาก dict อัตโนมัติ
- **VALIDATE**: สร้าง mock ReplyObject(object_type=IMAGEMAP, payload={...}) → call → ได้ ImagemapMessage

### Task 6: Create unit tests
- **ACTION**: สร้าง `backend/tests/test_response_parser.py`
- **IMPLEMENT**: ทดสอบ `build_message_from_object()` สำหรับทุก 8 types
- **MIRROR**: ดู test pattern จาก `test_broadcast_service.py`
- **IMPORTS**: `pytest`, `SimpleNamespace`, `unittest.mock`
- **GOTCHA**: ไม่ต้อง mock DB — ทดสอบ `build_message_from_object()` โดยตรง
- **VALIDATE**: `python -m pytest tests/test_response_parser.py -v`

---

## Testing Strategy

### Unit Tests

| Test | Input | Expected Output | Edge Case? |
|---|---|---|---|
| TEXT type | `ObjectType.TEXT, {"text": "hello"}` | `TextMessage(text="hello")` | No |
| FLEX type | `ObjectType.FLEX, {bubble_json}` | `FlexMessage` | No |
| IMAGE type | `ObjectType.IMAGE, {"url": "..."}` | `ImageMessage` | No |
| STICKER type | `ObjectType.STICKER, {"package_id": "1", "sticker_id": "2"}` | `StickerMessage` | No |
| LOCATION type | `ObjectType.LOCATION, {...}` | `LocationMessage` | No |
| VIDEO type | `ObjectType.VIDEO, {"original_content_url": "...", "preview_image_url": "..."}` | `VideoMessage` | No |
| AUDIO type | `ObjectType.AUDIO, {"original_content_url": "...", "duration": 5000}` | `AudioMessage` | No |
| IMAGEMAP type | `ObjectType.IMAGEMAP, {"base_url": "...", "base_size": {...}, "actions": [...]}` | `ImagemapMessage` | No |
| VIDEO fallback URLs | `{"url": "..."}` | `VideoMessage` with url as both fields | Yes |
| AUDIO missing duration | `{"original_content_url": "..."}` | `AudioMessage(duration=0)` | Yes |
| IMAGEMAP missing alt_text | `alt_text=None` | Uses name as fallback | Yes |
| Unsupported type | Future new type | `None` + warning log | Yes |

### Edge Cases Checklist
- [x] Empty payload → handled by `.get()` with defaults
- [x] Missing required fields → fallback values
- [x] Invalid type values → `int()`/`float()` cast with default
- [x] Null alt_text → fallback to obj.name

---

## Validation Commands

### Static Analysis
```bash
cd backend
python -c "from app.services.response_parser import build_message_from_object; print('Import OK')"
```
EXPECT: No import errors

### Unit Tests
```bash
cd backend
python -m pytest tests/test_response_parser.py -v
```
EXPECT: All tests pass (12+ test cases)

### Full Test Suite
```bash
cd backend
python -m pytest tests/ -v
```
EXPECT: No regressions

### Manual Validation
- [ ] สร้าง reply object (VIDEO type) ผ่าน API → สำเร็จ
- [ ] ใช้ `$object_id` ใน auto-reply response → user ได้รับ video message
- [ ] สร้าง reply object (AUDIO type) → ใช้ได้จริง
- [ ] สร้าง reply object (IMAGEMAP type) → ใช้ได้จริง

---

## Acceptance Criteria
- [ ] `response_parser.build_message_from_object()` รองรับครบทั้ง 8 types
- [ ] `ObjectTypeEnum` schema มี IMAGEMAP
- [ ] Unit tests ผ่านทุก case
- [ ] No regressions ใน existing tests
- [ ] No type errors

## Completion Checklist
- [ ] Code follows existing error handling pattern (try/except + logger)
- [ ] Import follows existing pattern (from linebot.v3.messaging import ...)
- [ ] Tests follow existing pattern (SimpleNamespace + pytest.mark.asyncio)
- [ ] No hardcoded values
- [ ] Self-contained — no questions needed during implementation

## Risks
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| IMAGEMAP payload format varies | LOW | MEDIUM | Use `.get()` with sensible defaults |
| LINE SDK version mismatch | LOW | HIGH | Verified imports work via `python -c` test |

## Notes
- **ไม่ต้อง Alembic migration** — `ObjectTypeEnum` เป็น Pydantic schema enum (ไม่ใช่ SQLAlchemy column), model `ObjectType` มี IMAGEMAP อยู่แล้ว
- Phase 1 scope: response_parser + schema fix เท่านั้น
- Frontend dropdown sync (Phase 2) และ broadcast integration (Phase 3) แยกออกจากกัน
- `ImagemapMessage` ต้องการ `actions` list — format ขึ้นอยู่กับ admin ที่สร้าง payload ผ่าน JSON editor
