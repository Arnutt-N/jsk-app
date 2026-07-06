# PRD: Category Readiness Badge + PUT `is_active` Guard (issue #122 follow-up)

> **Status: DRAFT (2026-07-06)** — brainstorm ผ่าน superpowers:brainstorming, ผู้ใช้อนุมัติ design แล้ว (scope = Backend + Frontend, guard = เฉพาะ PUT, dot = 3 สี) พร้อมเข้าขั้นเขียน implementation plan

## Problem Statement

fix issue #122 (merge `cc5589d`, deploy Koyeb แล้ว) แก้อาการ **webhook กลืนข้อความเงียบ ๆ** เมื่อ intent category ที่ match ใช้งานไม่ได้ — โดยให้ fall through ไป legacy AutoReply. แต่ยัง **ไม่ได้อุด 2 ช่องที่ทำให้ admin เผลอสร้างสถานะ "ดูเหมือนพร้อม แต่จริง ๆ bot จะเงียบ"**:

1. **หน้า admin โกหกเรื่องความพร้อม (readiness)** — จุดสถานะ (dot) และ StatsCard บนหน้า `/admin/chatbot` ตัดสิน "พร้อม/active" จากเกณฑ์ที่**ไม่ตรง**กับที่ webhook ใช้จริง → category ที่เปิดอยู่แต่ไม่มี active response ขึ้นเป็น "เขียว/active" ทั้งที่ webhook จะ fall through ไม่ตอบจาก category นั้น
2. **API เปิด category ที่ยังไม่พร้อมได้ (bypass frontend)** — `PUT /admin/intents/categories/{id}` ตั้ง `is_active=true` ได้แม้ category นั้นไม่มี active response เลย ไม่มี guard ฝั่ง server; frontend gate ใด ๆ ถูก bypass ด้วยการยิง API ตรง

**ผลกระทบ:** admin เข้าใจผิดว่า category พร้อมใช้ ปล่อยทิ้งไว้ ผู้ใช้ปลายทางส่งข้อความแล้วได้ AutoReply ทั่วไป (หรือเงียบถ้าไม่มี AutoReply) แทนคำตอบเฉพาะที่ตั้งใจ — ตรวจจับยากเพราะหน้า admin แสดงว่า "ปกติ"

## นิยามกลาง (Single Source of Truth)

**"category พร้อมให้บริการ" (serviceable)** = `IntentCategory.is_active == True` **และ** มี `IntentResponse` ที่ `is_active == True` อย่างน้อย 1 รายการ

ยึดจากโค้ด webhook ที่ deploy แล้ว — ทั้ง badge (frontend) และ guard (backend) **ต้องใช้เกณฑ์เดียวกันนี้** ห้ามแตกต่าง

## Evidence (ยืนยันจากโค้ด)

**เกณฑ์ serviceable ที่ webhook ใช้จริง:**
- `backend/app/api/v1/endpoints/webhook.py:249` — `if category and category.is_active and category.responses:` เป็นเงื่อนไขเดียวที่ใช้ responses ของ category
- `backend/app/api/v1/endpoints/webhook.py:148-157` — `_intent_keyword_stmt` โหลด `IntentCategory.responses` แบบกรอง `IntentResponse.is_active == True` แล้ว → `category.responses` ที่บรรทัด 249 = **เฉพาะ active response**
- `backend/app/api/v1/endpoints/webhook.py:231-260` — `resolve_reply_responses` docstring ระบุชัด: ใช้ category responses ก็ต่อเมื่อ "active AND has >=1 active response" มิฉะนั้น fall through ไป AutoReply

**Backend ปัจจุบัน (ช่องว่าง):**
- `backend/app/schemas/intent.py:67-76` — `IntentCategoryResponse` มี `keyword_count`, `response_count` แต่**ไม่มี `active_response_count`**
- `backend/app/api/v1/endpoints/admin_intents.py:36-47` — `list_categories` นับ `response_count` = ทั้งหมด (ไม่กรอง `is_active`); loop นับทีละ category (N+1 เดิม)
- `backend/app/api/v1/endpoints/admin_intents.py:77-89` — `update_category` ทำ `setattr` ตรงจาก payload แล้ว commit **ไม่มี guard `is_active`**
- `backend/app/models/intent.py:66` — `IntentResponse.is_active` (Boolean, default True) มีจริง → นับ active ได้

**Frontend ปัจจุบัน (readiness ไม่ exact):**
- `frontend/app/admin/chatbot/page.tsx:23-25` — type category มี `is_active`, `response_count`, `keyword_count` แต่ไม่มี `active_response_count`
- `frontend/app/admin/chatbot/page.tsx:187` — dot สี: `category.is_active ? 'bg-success' : 'bg-border-hover'` → ดูแค่ `is_active` (category active แต่ 0 active response ก็ขึ้นเขียว = โกหก)
- `frontend/app/admin/chatbot/page.tsx:118` — StatsCard "Active Responses" = `sum(response_count)` (นับ inactive ด้วย → label ไม่ตรงค่า)

## Proposed Solution

### A. Backend — เพิ่ม `active_response_count` (schema + GET)

1. `schemas/intent.py` — เพิ่มใน `IntentCategoryResponse`:
   ```python
   active_response_count: int = 0  # responses ที่ is_active == True
   ```
2. `admin_intents.py` → `list_categories` — นับ total + active ใน **query เดียวต่อ category** ด้วย Postgres `FILTER` clause (ไม่เพิ่ม round-trip เกินของเดิม):
   ```python
   r_total, r_active = (await db.execute(
       select(
           func.count(IntentResponse.id),
           func.count(IntentResponse.id).filter(IntentResponse.is_active == True),
       ).where(IntentResponse.category_id == cat.id)
   )).one()
   resp.response_count = r_total
   resp.active_response_count = r_active
   ```
   > หมายเหตุ: โค้ดเดิมมี N+1 อยู่แล้ว; การเปลี่ยนนี้ **ไม่ทำให้แย่ลง** (ยังคง query response ต่อ category = 1 รอบเท่าเดิม) — ไม่ขยาย scope ไปรื้อ N+1 ทั้งก้อน (categories มีไม่กี่สิบ ยังไม่คุ้ม)

### B. Backend — Guard ที่ `PUT /categories/{cat_id}`

- **เงื่อนไขบล็อก:** เมื่อ payload ระบุ `is_active: true` อย่างชัดเจน (อยู่ใน `data.model_dump(exclude_unset=True)`) **และ** category นั้นมี active response == 0 → `HTTPException(status_code=400, detail=...)`
- ข้อความไทย: `"ไม่สามารถเปิดใช้งานหมวดนี้ได้ เพราะยังไม่มีการตอบกลับที่เปิดใช้งาน (active response) — กรุณาเพิ่มอย่างน้อย 1 รายการก่อน"`
- ตรวจ (query นับ active response) **ก่อน** `setattr`/commit แล้ว raise
- **ไม่บล็อก:** การแก้ `name`/`description` ที่ไม่แตะ `is_active`; การตั้ง `is_active=false` (ปิด) ผ่านเสมอ
- **ขอบเขต:** guard เฉพาะ `PUT` — `POST /categories` (สร้างใหม่) ไม่ guard เพราะ category ใหม่ยังไม่มี response (ต้องมี category ก่อนถึงเพิ่ม response ได้ = chicken-egg)

### C. Frontend — `frontend/app/admin/chatbot/page.tsx`

1. เพิ่ม `active_response_count: number` ใน type (บรรทัด ~24)
2. **dot สถานะ (บรรทัด 187) → 3 สี:**
   - 🟢 `bg-success` (เขียว) = `is_active && active_response_count > 0` — พร้อมใช้จริง
   - 🟡 เหลือง/ส้ม (เช่น `bg-warning`/token ที่มี) = `is_active && active_response_count === 0` — เปิดอยู่แต่ bot จะเงียบ (เตือน)
   - ⚪ `bg-border-hover` (เทา) = `!is_active` — ปิด
   - เพิ่ม `title`/aria-label อธิบายสถานะเพื่อ a11y
3. **StatsCard "Active Responses" (บรรทัด 118):** เปลี่ยนเป็น `sum(active_response_count)` ให้ตัวเลขตรงกับ label

## Testing (TDD, RED-first)

**Backend (`backend/tests/`):**
1. GET `/categories` คืน `active_response_count` ถูกต้องเมื่อ category มี active + inactive response ปนกัน (เช่น 3 total, 2 active → `response_count=3`, `active_response_count=2`)
2. PUT `is_active=true` ที่ category มี 0 active response → **400**
3. PUT `is_active=true` ที่ category มี ≥1 active response → **200**
4. PUT แก้ `name` (ไม่ส่ง `is_active`) บน category ที่ 0 active response → **200** (ไม่ถูกบล็อก)
5. PUT `is_active=false` บน category ใด ๆ → **200** (ปิดได้เสมอ)

**Frontend:** unit test ฟังก์ชัน/logic เลือกสี dot 3 สถานะ (ถ้ามี test setup รองรับ เช่น แยก helper `readinessColor(cat)`)

## Acceptance Criteria

- [ ] `GET /admin/intents/categories` มี field `active_response_count` ที่ถูกต้อง (กรอง `is_active == True`)
- [ ] `PUT /categories/{id}` ตั้ง `is_active=true` ขณะ 0 active response → 400 + ข้อความไทย; กรณีอื่นตามข้อ B
- [ ] หน้า `/admin/chatbot` dot แสดง 3 สถานะตามนิยาม serviceable; StatsCard "Active Responses" นับเฉพาะ active
- [ ] เกณฑ์ badge + guard ตรงกับ webhook `webhook.py:249` (serviceable = is_active AND active_response_count > 0)
- [ ] Backend pytest + frontend lint/tsc/vitest/build เขียว (ตาม CI ของโปรเจกต์)

## Non-Goals / Deferred

- ไม่รื้อ N+1 ทั้งก้อนใน `list_categories` (แค่ไม่ทำให้แย่ลง)
- ไม่ guard `POST /categories` (chicken-egg — ดูข้อ B)
- ไม่แตะ DB schema / ไม่มี migration ใหม่ (ใช้คอลัมน์ `is_active` ที่มีอยู่)
- ไม่เปลี่ยน flow การสร้าง category (ไม่บังคับ default `is_active=false`)

## Deploy

- Backend: schema/logic เท่านั้น ไม่มี migration → Koyeb ผ่าน `cd.yml` (backend-only)
- Frontend: Vercel (auto จาก merge)
- ทั้งคู่ผ่าน PR เดียว
