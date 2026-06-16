# Plan: Phase 4 PR2 — Reply Objects full types + LINE-fidelity preview

## Summary
ยกระดับหน้า Reply Objects จาก "generic JSON textarea เดียวสำหรับทุก type" เป็น **type-specific editors + LINE-fidelity preview**: เพิ่ม type `template` (4 sub-type: buttons/confirm/carousel/image_carousel) และ `text_v2`, รองรับ **Quick reply เป็น modifier** (แนบ payload ได้ทุก type), และสร้าง **flex/template renderer เต็มรูปแบบ** สำหรับ preview. **Coupon เลื่อนออก** (ไม่ใช่ native LINE type)

## User Story
As a เจ้าหน้าที่ดูแลแชตบอต,
I want สร้าง Reply Object แบบ Template/Text v2 ด้วยฟอร์มเฉพาะ type + แนบ Quick reply + เห็น preview เหมือน LINE จริง,
So that สร้างข้อความได้ถูกต้องครบทุกชนิดโดยไม่ต้องเขียน JSON เอง และมั่นใจว่าหน้าตาตรงก่อนใช้งานจริง.

## Problem → Solution
- **ตอนนี้**: `reply-objects/page.tsx` มี 8 types, editor เป็น `<textarea>` JSON ดิบทุก type (`page.tsx:280-289`), ไม่มี preview, ไม่มี validation per-type. ขาด Template/Text v2/Quick reply
- **เป้าหมาย**: เพิ่ม type `template`+`text_v2` (enum model+schema+migration), validation payload ต่อ type (backend), type-specific editor + LINE flex/template renderer (frontend) ใช้เป็น live preview, Quick reply modifier UI

## Metadata
- **Complexity**: XL (มี flex renderer เต็ม + 4 template sub-type + enum migration)
- **Source PRD**: `.claude/PRPs/prds/chatbot-system-utilities-audit.prd.md`
- **PRD Phase**: Phase 4 — Chatbot Management Hardening (PR2; PR1 merged #109)
- **Estimated Files**: ~14 (frontend components ใหม่หลายตัว + backend migration/schema/validation + tests)

---

## Decisions (locked, 2026-06-17)
| Decision | Choice | Rationale |
|---|---|---|
| Type set | `template`(4 sub) + `text_v2` + Quick reply(modifier); **defer Coupon** | LINE-accurate; quickReply เป็น modifier ตาม API จริง; coupon ไม่ใช่ native (รอออกแบบ flex-based) |
| Preview fidelity | **Full LINE-fidelity** (flex renderer เต็ม) | ผู้ใช้เลือก — ต้อง render bubble/box/text/image/button/carousel จริง |

---

## UX Design

### Before
```
[New Template] → Modal: Universal ID / Name / Protocol(select 8) / Category / Alt / [JSON textarea ดิบ]
ไม่มี preview
```

### After
```
[New Template] → Modal 2 คอลัมน์:
  ซ้าย = ฟอร์มตาม type ที่เลือก
     - template → เลือก sub-type (buttons/confirm/carousel/image_carousel) + ฟอร์ม title/text/actions[]
     - text_v2 → text + emoji/substitution helper
     - (ทุก type) → toggle "Quick reply" → เพิ่ม items[] (label/action)
     - flex/อื่น ๆ → JSON textarea เดิม (escape hatch)
  ขวา = LIVE PREVIEW (LINE-fidelity): render bubble/template/carousel + quick reply chips
```

### Interaction Changes
| Touchpoint | Before | After | Notes |
|---|---|---|---|
| Protocol select | 8 types | 10 types (+template, +text_v2) | enum |
| Editor | JSON ทุก type | type-specific + JSON escape hatch | |
| Quick reply | ไม่มี | toggle + items editor (modifier) | แนบ payload.quickReply |
| Preview | ไม่มี | live LINE-fidelity renderer | |

---

## Mandatory Reading
| Priority | File | Lines | Why |
|---|---|---|---|
| P0 | `frontend/app/admin/reply-objects/page.tsx` | 15-121, 204-300 | โครง state/form/modal ที่จะ refactor เป็น type-specific + preview |
| P0 | `backend/app/models/reply_object.py` | 12-21, 44-51 | `ObjectType` native enum (ต้อง migration) + payload JSONB |
| P0 | `backend/app/schemas/reply_object.py` | 10-26, 31-42 | `ObjectTypeEnum` + `payload: Dict[str,Any]` (เพิ่ม value + validation) |
| P0 | `backend/app/api/v1/endpoints/admin_reply_objects.py` | 60-113 | create/update — จุดเสริม validation; gate `KEY_MANAGE_REPLY_OBJECTS` |
| P1 | `backend/app/services/broadcast_service.py` | 111-167 | `_build_messages` — ถ้าจะให้ template/text_v2 ส่งได้จริงผ่าน OBJECT_REF (อาจ defer) |
| P1 | `backend/alembic/versions/` (ไฟล์ล่าสุด) | all (1 ตัวอย่าง) | mirror โครง migration (revision/down_revision/op) |
| P2 | `frontend/components/ui/Modal.tsx`, `Button.tsx`, `Toast` | - | UI primitives ที่ใช้อยู่ |

## External Documentation / Research (ทำก่อน implement — ตาม reuse-first)
| Topic | Action | Why |
|---|---|---|
| LINE Flex Message schema | context7 / LINE docs | โครง bubble/box/text/image/button/separator + carousel — renderer ต้องตรง spec |
| LINE Template message | LINE docs | buttons/confirm/carousel/image_carousel payload shape + ข้อจำกัด (จำนวน action, ขนาดรูป) |
| LINE Quick reply | LINE docs | `quickReply.items[]` (action types: message/uri/postback/camera/location) + จำกัด 13 items |
| React flex renderer | `gh search` + npm | **หา library พร้อม port ก่อนเขียนเอง** (เช่น flex-message renderer) — ลด effort flex renderer เต็ม |

> KEY: ก่อนเขียน flex renderer เอง ให้ค้น GitHub/npm หา renderer ที่ port ได้ (80% solution) — ถ้าไม่มีที่เหมาะ ค่อยเขียน recursive renderer ขั้นต่ำครอบ box/text/image/button/separator/icon + bubble/carousel

---

## Patterns to Mirror

### CURRENT_FORM_STATE
```typescript
// SOURCE: reply-objects/page.tsx:34-41
const [formData, setFormData] = useState({
    object_id: '', name: '', category: '',
    object_type: 'flex', payload: '{}', alt_text: ''
});
```

### CURRENT_SUBMIT (payload = JSON.parse)
```typescript
// SOURCE: reply-objects/page.tsx:65-93 — payload ส่งเป็น object หลัง JSON.parse
const payload = { ...formData, payload: JSON.parse(formData.payload) };
```

### PERMISSION_GATE
```python
# SOURCE: admin_reply_objects.py:60-65 — create/update/delete gated
current_admin: User = Depends(require_permission(KEY_MANAGE_REPLY_OBJECTS))
```

### ENUM_DUAL_DEFINITION (ต้องแก้ทั้งคู่)
```python
# model: backend/app/models/reply_object.py:12  -> Postgres native enum (migration)
class ObjectType(str, enum.Enum): TEXT="text" ... IMAGEMAP="imagemap"
# schema: backend/app/schemas/reply_object.py:10 -> code only
class ObjectTypeEnum(str, Enum): TEXT="text" ... IMAGEMAP="imagemap"
```

---

## Files to Change
| File | Action | Justification |
|---|---|---|
| `backend/alembic/versions/xxxx_add_reply_object_types.py` | CREATE | `ALTER TYPE objecttype ADD VALUE 'template','text_v2'` |
| `backend/app/models/reply_object.py` | UPDATE | +`TEMPLATE`,`TEXT_V2` ใน `ObjectType` |
| `backend/app/schemas/reply_object.py` | UPDATE | +ใน `ObjectTypeEnum` + payload validator ต่อ type |
| `backend/app/api/v1/endpoints/admin_reply_objects.py` | UPDATE | (option) เรียก validator/normalize ก่อน save |
| `backend/tests/test_reply_object_validation.py` | CREATE | validate payload shape per type + quickReply |
| `frontend/app/admin/reply-objects/page.tsx` | UPDATE | type list, 2-col modal, สลับ editor ตาม type, แนบ preview |
| `frontend/app/admin/reply-objects/_components/editors/TemplateEditor.tsx` | CREATE | ฟอร์ม 4 sub-type |
| `frontend/app/admin/reply-objects/_components/editors/TextV2Editor.tsx` | CREATE | text + emoji/substitution |
| `frontend/app/admin/reply-objects/_components/QuickReplyEditor.tsx` | CREATE | modifier items[] |
| `frontend/app/admin/reply-objects/_components/preview/LineFlexRenderer.tsx` | CREATE | recursive flex renderer (bubble/box/text/image/button/sep/icon + carousel) |
| `frontend/app/admin/reply-objects/_components/preview/MessagePreview.tsx` | CREATE | เลือก renderer ตาม type + quick reply chips |
| `frontend/lib/line/message-types.ts` | CREATE | shared TS types สำหรับ flex/template/quickReply |
| `frontend/app/admin/reply-objects/__tests__/*` | CREATE | vitest: renderer + payload build |

## NOT Building
- **Coupon type** — เลื่อน (ไม่ใช่ native LINE; ต้องออกแบบ flex-based แยก)
- **ส่ง template/text_v2 ผ่าน broadcast/auto-reply จริง** — ถ้า `_build_messages`/auto-reply ยังไม่รองรับ ให้ทำ minimal (เก็บ+preview) แล้ว note เป็น follow-up; ไม่ใช่แกน PR2 (PR2 = authoring + preview)
- **Imagemap visual editor** — คง JSON เดิม
- **Narrowcast/multi-rich-menu** — Could items เลื่อนทั้ง phase

---

## Step-by-Step Tasks

### Task 1: Backend enum + migration
- **ACTION**: เพิ่ม `TEMPLATE="template"`, `TEXT_V2="text_v2"` ใน `ObjectType` (model) และ `ObjectTypeEnum` (schema); สร้าง Alembic migration
- **IMPLEMENT (migration)**:
  ```python
  def upgrade():
      op.execute("ALTER TYPE objecttype ADD VALUE IF NOT EXISTS 'template'")
      op.execute("ALTER TYPE objecttype ADD VALUE IF NOT EXISTS 'text_v2'")
  def downgrade():
      pass  # Postgres ไม่รองรับลบ enum value แบบ in-place
  ```
- **MIRROR**: ไฟล์ migration ล่าสุดใน `backend/alembic/versions/` (revision/down_revision chain)
- **GOTCHA**: (1) ยืนยันชื่อ Postgres enum type จริง (default `objecttype`) ด้วย migration เดิม/`\dT`; (2) `ALTER TYPE ADD VALUE` ใช้ค่าใหม่ใน transaction เดียวกันไม่ได้ — แยก migration จากการใช้งาน; (3) ต้องแก้ enum **ทั้ง 2 ที่** (model+schema) ไม่งั้น validation/ORM ไม่ตรง
- **VALIDATE**: `python scripts/db_target.py alembic --target local upgrade head` ผ่าน; POST reply object `object_type:"template"` ไม่ 422

### Task 2: Payload validation per type (backend)
- **ACTION**: เพิ่ม Pydantic validator บน `ReplyObjectBase.payload` ตาม `object_type` (template มี `template.type` ∈ 4 ค่า + fields ที่จำเป็น; text_v2 มี `text`; quickReply (ถ้ามี) เป็น `{items: [...]}` ≤13)
- **IMPLEMENT**: `@model_validator(mode="after")` ตรวจ shape ขั้นต่ำต่อ type — fail = ValueError → 422
- **MIRROR**: pydantic style ในโปรเจกต์ (Field/ConfigDict)
- **GOTCHA**: validation ขั้นต่ำพอใช้งานปลอดภัย อย่า over-validate flex (ปล่อย flex เป็น free JSON ตามเดิม); quickReply เป็น optional modifier บน payload ทุก type
- **VALIDATE**: unit test payload ถูก/ผิด per type

### Task 3: Frontend shared types + research/build flex renderer
- **ACTION**: นิยาม TS types (`message-types.ts`) + สร้าง `LineFlexRenderer` (recursive)
- **IMPLEMENT**: renderer รองรับ node: `bubble`,`carousel`,`box`(layout vertical/horizontal/baseline),`text`,`image`,`button`,`separator`,`icon`,`filler`; map flex props → CSS (flex-direction, flex grow, spacing, weight, color, size, align). ใช้ inline style ตาม flex spec
- **MIRROR**: ผลการ research (port library ถ้ามี) — ดู External Research
- **GOTCHA**: flex มี recursion ลึก → ระวัง perf/oversized; จำกัด depth/ขนาด; รองรับเฉพาะ subset ที่ template/flex ใช้จริงก่อน
- **VALIDATE**: vitest render bubble/carousel ตัวอย่าง → snapshot/DOM assert; ดูด้วยตาใน Playwright

### Task 4: Type-specific editors
- **ACTION**: `TemplateEditor` (เลือก sub-type + ฟอร์มตาม sub-type), `TextV2Editor`, `QuickReplyEditor` (modifier)
- **IMPLEMENT**: แต่ละ editor คืน payload object; page เลือก editor ตาม `object_type`; flex/อื่น ๆ คง JSON textarea (escape hatch); quick reply toggle รวม `payload.quickReply`
- **MIRROR**: CURRENT_FORM_STATE + การ submit (payload เป็น object)
- **GOTCHA**: ต้อง round-trip กับ edit เดิม (payload JSON → ฟอร์ม) — ถ้า payload ไม่เข้า schema ฟอร์มที่รู้จัก ให้ fallback JSON textarea; immutability (อย่า mutate state ตรง — spread)
- **VALIDATE**: สร้าง template/text_v2 + quick reply → payload ถูก → POST 201; edit แล้วฟอร์ม prefill ถูก

### Task 5: รวม preview เข้า modal (2 คอลัมน์)
- **ACTION**: ปรับ modal เป็น 2 คอลัมน์ (ฟอร์ม + `MessagePreview` live)
- **IMPLEMENT**: `MessagePreview` เลือก renderer ตาม type (flex/template → LineFlexRenderer, text/text_v2 → bubble, image → thumb...) + quick reply chips; อัปเดต realtime จาก formData
- **MIRROR**: Modal `maxWidth` เดิม (ขยายเป็น lg/xl), layout grid ในหน้าเดิม
- **GOTCHA**: payload ที่ยังพิมพ์ไม่ครบ/ผิด → preview ต้องไม่ crash (guard + แสดง placeholder); responsive (คอลัมน์ stack บนจอเล็ก)
- **VALIDATE**: พิมพ์แล้ว preview เปลี่ยนตาม; payload ผิดไม่ crash

### Task 6: Tests
- **ACTION**: backend validation tests + frontend vitest (renderer + payload build)
- **IMPLEMENT**: ตาม Testing Strategy
- **VALIDATE**: pytest + vitest เขียว (vitest local เท่านั้น — CI ไม่รัน)

---

## Testing Strategy
### Unit Tests
| Test | Input | Expected | Edge? |
|---|---|---|---|
| validate template ok | payload.template.type=buttons + actions | pass | - |
| validate template bad | template.type=unknown | 422 | ✓ |
| validate text_v2 | {text:"hi"} | pass | - |
| validate quickReply >13 | items length 14 | 422 | ✓ |
| renderer bubble | flex bubble json | DOM มี text/button | - |
| renderer carousel | 3 bubbles | 3 columns | - |
| renderer bad payload | {} / partial | placeholder ไม่ throw | ✓ |
| editor → payload | กรอกฟอร์ม template | payload object ถูก | - |

### Edge Cases Checklist
- [ ] edit reply object เดิม (payload JSON) → ฟอร์ม prefill หรือ fallback JSON
- [ ] payload ผิด/ครึ่ง ๆ → preview ไม่ crash
- [ ] quick reply 0 และ 13 items
- [ ] template image_carousel ไม่มีรูป → placeholder
- [ ] role ไม่มี `KEY_MANAGE_REPLY_OBJECTS` → create/update 403

---

## Validation Commands
```bash
# backend
cd backend && python scripts/db_target.py alembic --target local upgrade head
python -m pytest tests/test_reply_object_validation.py -v
python -m pytest            # no regression
# frontend (รันผ่าน WSL)
cd frontend && npx tsc --noEmit && npx eslint app/admin/reply-objects
npx vitest run             # local only (CI ไม่รัน vitest)
# visual
npx playwright test  (หรือเปิด dev ดู preview)
```
EXPECT: migration ผ่าน · tests เขียว · tsc/eslint clean · preview ตรง LINE

### Manual Validation
- [ ] สร้าง template(buttons) → preview เหมือน LINE → save → ใช้งานได้
- [ ] text_v2 + quick reply → preview chips ถูก
- [ ] edit ของเดิม → ไม่พัง

---

## Acceptance Criteria
- [ ] type `template`+`text_v2` สร้าง/แก้/ลบได้ (gated)
- [ ] Quick reply แนบได้ทุก type (modifier)
- [ ] LINE-fidelity preview render flex/template/carousel/quick reply
- [ ] migration ผ่าน, ไม่ regress reply objects เดิม (8 types ยังทำงาน)
- [ ] tests เขียว, tsc/eslint clean

## Completion Checklist
- [ ] enum แก้ทั้ง model+schema + migration
- [ ] preview ไม่ crash กับ payload ผิด (no silent crash)
- [ ] immutable state updates (spread)
- [ ] permission gate คงเดิม
- [ ] escape hatch JSON ยังอยู่สำหรับ flex/advanced
- [ ] ไม่เพิ่ม scope (Coupon/ส่งจริง defer)

## Risks
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Flex renderer เต็มรูปแบบใช้เวลามาก | H | H | reuse-first (port library); ทำ subset ที่ใช้จริงก่อน; แยก component + test |
| enum migration (ADD VALUE in tx / ชื่อ type) | M | M | migration แยก, `IF NOT EXISTS`, ยืนยันชื่อ type ก่อน |
| edit payload เดิมไม่เข้าฟอร์มใหม่ | M | M | fallback JSON textarea เมื่อ parse ฟอร์มไม่ได้ |
| preview crash กับ input ครึ่ง ๆ | M | M | guard ทุก node + placeholder |
| scope creep (Coupon/ส่งจริง) | M | M | NOT Building ชัดเจน |

## Notes
- **Decisions**: type set = template+text_v2+quickReply(modifier), defer Coupon; preview = full LINE-fidelity (user 2026-06-17)
- PR2 โฟกัส **authoring + preview**; การส่งจริงผ่าน broadcast/auto-reply ถ้ายังไม่รองรับ → follow-up (ไม่บล็อก)
- ขนาด XL — ถ้าระหว่าง implement พบว่าใหญ่เกิน ให้พิจารณาแยก flex renderer เป็น PR ย่อยก่อน (renderer + preview) แล้วตามด้วย editors
