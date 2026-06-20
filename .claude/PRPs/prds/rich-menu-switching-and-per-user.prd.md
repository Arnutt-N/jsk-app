# PRD: Rich Menu Tab Switching + Per-User Rich Menu Assignment

## Problem Statement

ระบบ Rich Menu ปัจจุบันของ jsk-app **สร้าง/sync/publish ได้ครบ** แต่ใช้ได้แค่ "เมนูเดียวสำหรับทุกคน" (default menu) ขาดความสามารถสำคัญ 2 อย่างที่ LINE Messaging API รองรับอยู่แล้ว:

1. **สลับเมนูแบบแท็บ (tab switching) ไม่ได้** — ผู้ใช้กดปุ่มในริชเมนูแล้วสลับไปอีกเมนูไม่ได้ (เช่น เมนู "หน้าหลัก" ↔ "บริการ" ↔ "ติดต่อ") ทำให้ทุกฟังก์ชันต้องยัดลงเมนูเดียว 6 ช่องเท่านั้น
2. **กำหนดเมนูตามผู้ใช้แต่ละคน (per-user) ไม่ได้** — ทุกคนเห็นเมนูเดียวกันหมด ไม่สามารถให้ admin/agent/ประชาชนเห็นเมนูต่างกัน หรือให้ผู้ใช้ที่อยู่ในสถานะ live-chat เห็นเมนูพิเศษได้

ผลกระทบ: ออกแบบ user experience บน LINE OA ได้จำกัด ทั้งที่ LINE รองรับฟีเจอร์เหล่านี้ครบ

## Evidence

**สิ่งที่มีอยู่แล้ว (ยืนยันจากโค้ด):**
- Rich menu CRUD ครบ: `backend/app/api/v1/endpoints/rich_menus.py:42-224` (9 endpoints)
- Service ครบ: `backend/app/services/rich_menu_service.py:23-205` (create/upload/set-default/delete/list/sync)
- Frontend 3 หน้า: `frontend/app/admin/rich-menus/{page.tsx, new/page.tsx, [id]/edit/page.tsx}`

**ช่องว่างที่ยืนยันแล้ว:**
- **ไม่มี alias:** ไม่มี `RichMenuAlias` model, ไม่มี migration, ไม่มี endpoint, grep `"alias"/"richMenuAliasId"` = 0 ผลลัพธ์ใน `backend/app`
- **richmenuswitch พังเงียบ:** `backend/app/schemas/rich_menu.py:24-30` — `RichMenuAreaAction.type` เป็น `str` ไม่มี enum + **ไม่มีฟิลด์ `richMenuAliasId`** → ส่งไป LINE แล้ว `richmenuswitch` จะใช้งานจริงไม่ได้
- **ไม่มี per-user:** มีแค่ `set_default_on_line()` → `POST /v2/bot/user/all/richmenu/{id}` (`rich_menu_service.py:50-59`) ซึ่งคือ "ทุกคน" ไม่มี link-to-user, ไม่มี bulk link/unlink, ไม่มี mapping table
- **Frontend dropdown:** `frontend/app/admin/rich-menus/new/page.tsx:440-447` มีแค่ `uri` กับ `message` (หน้า edit ไม่มี UI แก้ action เลย)

**LINE API รองรับครบ (จาก official docs):**
- Alias: `POST/PUT/DELETE/GET /v2/bot/richmenu/alias[/{id}]`
- Switch action: `{"type": "richmenuswitch", "richMenuAliasId": "...", "data": "..."}`
- Per-user: `POST/DELETE/GET /v2/bot/user/{userId}/richmenu`, bulk: `POST /v2/bot/richmenu/bulk/{link,unlink}`

## Proposed Solution

เพิ่ม 2 ฟีเจอร์บนสถาปัตยกรรม RichMenuService เดิม (raw httpx + token จาก DB):

### Feature A: Rich Menu Tab Switching (alias + richmenuswitch)
- เพิ่มตาราง `rich_menu_aliases` (cache mapping alias_id ↔ rich_menu_id)
- เพิ่ม service methods + endpoints จัดการ alias (create/update/delete/list)
- เพิ่มฟิลด์ `richMenuAliasId` ใน schema action + enum validation รับ `richmenuswitch`
- เพิ่มตัวเลือก action type "สลับเมนู" ใน frontend wizard + dropdown เลือก alias ปลายทาง

### Feature B: Per-User Rich Menu Assignment
- เพิ่มตาราง `user_rich_menu_links` (cache ว่า line_user_id ไหน → rich_menu_id ไหน)
- เพิ่ม service methods + endpoints: link/unlink/get per-user + bulk
- เพิ่ม UI กำหนดเมนูให้ผู้ใช้รายคน/กลุ่ม (เชื่อมกับตาราง users/friends ที่มี `line_user_id` อยู่แล้ว)

## Key Hypothesis

We believe **การเพิ่ม tab switching + per-user rich menu** จะ **ทำให้ออกแบบ LINE OA experience ได้ยืดหยุ่นขึ้นมาก (เมนูหลายชั้น + เมนูเฉพาะกลุ่ม)** for **admin ผู้ดูแล OA และผู้ใช้ปลายทางบน LINE**.

We'll know we're right when:
- กดปุ่มในริชเมนู A แล้วสลับไปริชเมนู B ได้ทันที (ไม่ต้องปิด-เปิดแชท)
- กำหนดให้ user คนหนึ่งเห็นเมนูต่างจาก default ได้ และ revert กลับ default ได้
- admin เห็นภาพรวมว่า alias ไหนชี้เมนูไหน และ user คนไหนได้เมนูพิเศษ

## What We're NOT Building

- **เปลี่ยน RichMenuService ไปใช้ LINE SDK** — คงรูปแบบ raw httpx เดิม (project rule)
- **Auto-assign เมนูตาม segment ซับซ้อน** (เช่น ตามอายุ/ภูมิภาคแบบ narrowcast) — MVP รองรับ link รายคน + bulk เลือกเองเท่านั้น
- **เก็บ analytics การกดสลับเมนู** — postback `richmenuswitch` มี event แต่ MVP ยังไม่ทำ dashboard สถิติ
- **แก้ปัญหา "รูปเมนูแก้ไม่ได้ in-place"** — ยังคง limitation เดิมของ LINE (สร้างใหม่ + ชี้ alias ใหม่)
- **A/B testing เมนู** — เกินขอบเขต MVP

## Success Metrics

| Metric | Target | How Measured |
|--------|--------|--------------|
| สร้าง alias แล้วชี้ไป rich menu ได้ | 100% | API test: POST alias → GET alias list มีรายการ |
| richmenuswitch action ส่งไป LINE สำเร็จ | 100% | สร้างเมนู A→B, กดสลับบนมือถือจริง สลับได้ |
| `richMenuAliasId` ถูก validate | 100% | ส่ง action `richmenuswitch` ไม่มี alias → 400 (ไม่พังเงียบ) |
| Link เมนูให้ user รายคนได้ | 100% | POST link → GET user richmenu = id ที่ตั้ง |
| Unlink แล้วกลับเป็น default | 100% | DELETE link → user เห็น default menu |
| Admin เห็นภาพรวม alias + per-user | 100% | หน้า admin แสดงรายการ alias และ user-links |
| ไม่มี regression กับ rich menu เดิม | 100% | CI green + create/publish เดิมยังทำงาน |

## Open Questions

| คำถาม | MVP (default) | Future |
|-------|---------------|--------|
| Per-user เลือกเป้าหมายแบบไหน? | เลือก user รายคน + bulk เลือกหลายคนจากตาราง friends | Segment อัตโนมัติ (role/tag/live-chat status) |
| เก็บ mapping per-user ใน DB ไหม? (LINE ไม่มี list-all) | ✅ มี cache table `user_rich_menu_links` | Sync reconciliation job |
| auth บน endpoint rich menu? | ปัจจุบัน "no auth for now" (`api.py`) — **PRD แนะนำเพิ่ม `get_current_admin`** | RBAC permission key `can_manage_richmenu` |
| ผูก per-user กับ live-chat flow อัตโนมัติไหม? | ❌ manual assign เท่านั้น | auto-switch เมนูตอน HUMAN/BOT mode |
| ลบ rich menu ที่มี alias/link ชี้อยู่? | บล็อก + เตือน "มี alias/user ใช้อยู่" | cascade + auto-unlink |

---

## Users & Context

**Primary User**
- **Who**: Admin/Super Admin ผู้ดูแล LINE OA ผ่าน jsk-app dashboard
- **Current behavior**: สร้างได้แค่เมนูเดียว publish เป็น default ให้ทุกคน
- **Trigger**: ต้องการเมนูหลายชั้น (แท็บ) หรือต้องการให้กลุ่มผู้ใช้ต่างกันเห็นเมนูต่างกัน
- **Success state**: สร้างชุดเมนูสลับกันได้ + กำหนดเมนูเฉพาะผู้ใช้/กลุ่มได้จาก dashboard

**Job to Be Done**
When ออกแบบเมนู LINE OA, I want to ทำเมนูหลายแท็บและกำหนดเมนูตามผู้ใช้, so I can มอบประสบการณ์ที่เหมาะกับผู้ใช้แต่ละกลุ่ม

**End Users (ทางอ้อม)**
- ผู้ใช้ LINE OA ที่จะได้เมนูที่สลับ/เปลี่ยนตามบริบท

**Non-Users**
- LIFF users (ไม่เกี่ยวกับ rich menu)

---

## Solution Detail

### Core Capabilities (MoSCoW)

| Priority | Capability | Rationale |
|----------|------------|-----------|
| Must | ตาราง + model `RichMenuAlias` (alias_id, rich_menu_id, line sync state) | LINE ไม่มี list-all alias แบบ map กับ DB; ต้อง cache |
| Must | Service: create/update/delete/list alias on LINE (raw httpx) | แกนของ tab switching |
| Must | Endpoints: `POST/GET/PUT/DELETE /admin/rich-menus/aliases` | จัดการ alias จาก dashboard |
| Must | Schema: เพิ่ม `richMenuAliasId` + enum validation action type | ปิดช่องโหว่ "พังเงียบ" ของ richmenuswitch |
| Must | Frontend: action type "สลับเมนู (richmenuswitch)" + เลือก alias ปลายทาง | ให้ admin สร้างเมนูสลับได้จริง |
| Must | ตาราง + model `UserRichMenuLink` (line_user_id, rich_menu_id) | cache per-user assignment |
| Must | Service: link/unlink/get per-user (`/user/{userId}/richmenu`) | แกนของ per-user |
| Must | Endpoints: link/unlink/get per-user | จัดการจาก dashboard |
| Must | Frontend: UI กำหนดเมนูให้ user รายคน (เชื่อมตาราง friends) | ใช้งานจริงได้ |
| Should | Bulk link/unlink หลาย user พร้อมกัน (`/richmenu/bulk/link`) | ตั้งเมนูให้กลุ่มได้เร็ว |
| Should | Guard: บล็อกการลบเมนูที่มี alias/user-link ชี้อยู่ | กัน orphan |
| Should | เพิ่ม `get_current_admin` บน endpoint rich menu | security (ตอนนี้ no auth) |
| Could | หน้า admin รวมศูนย์: ดู alias map + per-user links ทั้งหมด | visibility |
| Could | ปุ่ม "ทดสอบสลับ" / preview flow ใน wizard | DX |
| Won't | Auto-assign ตาม segment/role | เกิน MVP |
| Won't | Analytics การกดสลับเมนู | เกิน MVP |

### MVP Scope

**Tab switching ใช้งานได้ end-to-end** (สร้างเมนู A↔B + alias + กดสลับบนมือถือจริงได้) **และ per-user assignment รายคนใช้งานได้** (link/unlink/get) จาก dashboard พร้อม validation ที่ปิดช่องโหว่ richmenuswitch

### User Flow

**Flow A — สร้างเมนูสลับแท็บ:**
```
Admin สร้างเมนู A + เมนู B (มีอยู่แล้ว)
  → sync ทั้งสองขึ้น LINE (ได้ line_rich_menu_id)
  → สร้าง alias-a → เมนู A, alias-b → เมนู B
  → ในเมนู A ตั้ง area action = richmenuswitch → alias-b
     ในเมนู B ตั้ง area action = richmenuswitch → alias-a
  → publish A เป็น default
  → ผู้ใช้กดปุ่มสลับ → เปลี่ยน A↔B ทันที
```

**Flow B — กำหนดเมนูตามผู้ใช้:**
```
Admin เปิดหน้า friends/users → เลือกผู้ใช้
  → เลือก rich menu ที่ sync แล้ว → "กำหนดให้ผู้ใช้นี้"
    → POST /admin/rich-menus/{id}/users/{userId}
      → LINE: POST /v2/bot/user/{userId}/richmenu/{lineId}
      → cache ลง user_rich_menu_links
  → ผู้ใช้คนนั้นเห็นเมนูเฉพาะ (priority สูงกว่า default)
  → "ยกเลิก" → DELETE → กลับเห็น default
```

---

## Technical Approach

**Feasibility**: **HIGH** — LINE API รองรับครบ, สถาปัตยกรรม RichMenuService เดิมขยายได้ตรงไปตรงมา

**Architecture Notes**
- ใช้ pattern เดิม: ทุก LINE call เป็น `httpx.AsyncClient()` + token จาก `SettingsService.get_setting(db, "LINE_CHANNEL_ACCESS_TOKEN")`
- Alias/per-user CRUD ใช้ base `https://api.line.me/v2/bot` (ไม่ใช่ api-data)
- `User`/friends มี `line_user_id` อยู่แล้ว → per-user link ใช้ค่านี้เป็นเป้าหมาย
- LINE เป็น source of truth; ตาราง cache (`rich_menu_aliases`, `user_rich_menu_links`) ไว้ให้ UI list ได้ (LINE ไม่มี endpoint list-all per-user)
- Display priority (จาก LINE docs): per-user (API) > default (API) > default (OA Manager) — ต้องสื่อสารใน UI ว่า per-user ทับ default

**Data Model (ใหม่)**
```
rich_menu_aliases
  id PK | alias_id (str, unique) | rich_menu_id FK→rich_menus.id
  line_synced (bool) | last_sync_error (text|null)
  created_at | updated_at

user_rich_menu_links
  id PK | line_user_id (str, indexed) | rich_menu_id FK→rich_menus.id
  linked_at | last_sync_error (text|null) | created_at | updated_at
  (unique: line_user_id — 1 user มี per-user menu ได้ 1 เมนู)
```

**Schema Change**
```python
# backend/app/schemas/rich_menu.py — RichMenuAreaAction
class RichMenuAreaAction(BaseModel):
    type: Literal["uri","message","postback","datetimepicker","richmenuswitch"]
    label: Optional[str] = None
    uri: Optional[str] = None
    text: Optional[str] = None
    data: Optional[str] = None
    displayText: Optional[str] = None
    richMenuAliasId: Optional[str] = None   # ← ใหม่ (required เมื่อ type=richmenuswitch)
    # + model_validator: ถ้า type==richmenuswitch ต้องมี richMenuAliasId
```

**Technical Risks**

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| richmenuswitch ส่งไป LINE แต่ alias ยังไม่ถูกสร้าง → กดแล้วไม่สลับ | M | validate ว่า alias มีจริงก่อน publish; UI เตือนลำดับ (sync→alias→switch) |
| Cache (DB) กับ LINE หลุดจากกัน (alias ถูกลบบน LINE Console) | M | endpoint `GET alias list` ดึงจาก LINE มา reconcile; ปุ่ม re-sync |
| ลบเมนูที่ alias/user ชี้อยู่ → orphan | M | guard ก่อนลบ + แจ้งรายการที่กระทบ |
| per-user link ไป user ที่ block OA → 200 แต่ไม่เห็นเมนู | L | บันทึก cache ตามที่ส่ง; แสดงหมายเหตุว่า LINE คืน 200 ไม่การันตีเห็น |
| endpoint ไม่มี auth (สถานะปัจจุบัน) | M | เพิ่ม `get_current_admin` (Should) |
| rate limit: create/delete alias = 2000/s OK; create/delete rich menu = 100/hr | L | bulk ops ระวัง; alias ส่วนใหญ่อยู่ใต้ลิมิตสูง |

---

## Implementation Phases

| # | Phase | Description | Status | Parallel | Depends |
|---|-------|-------------|--------|----------|---------|
| 1 | Schema & Validation Fix | เพิ่ม `richMenuAliasId` + action-type enum + validator | pending | with 2 | - |
| 2 | DB Models & Migration | สร้าง `rich_menu_aliases` + `user_rich_menu_links` + Alembic | pending | with 1 | - |
| 3 | Backend: Alias Service+API | service methods + endpoints CRUD alias | pending | with 4 | 1,2 |
| 4 | Backend: Per-User Service+API | link/unlink/get + bulk | pending | with 3 | 1,2 |
| 5 | Frontend: Switch Action UI | action type "สลับเมนู" + เลือก alias ใน wizard/edit | pending | with 6 | 3 |
| 6 | Frontend: Per-User UI | กำหนดเมนูให้ user (หน้า friends/rich-menu) | pending | with 5 | 4 |
| 7 | Guards & Auth | บล็อกลบเมนูที่มี alias/link + เพิ่ม get_current_admin | pending | - | 3,4 |
| 8 | Tests + E2E | unit (validator, service) + manual switch บนมือถือจริง | pending | - | 5,6,7 |

### Phase Details

**Phase 1: Schema & Validation Fix**
- **Goal**: ปิดช่องโหว่ richmenuswitch พังเงียบ
- **Scope**: `backend/app/schemas/rich_menu.py` — enum action type + ฟิลด์ `richMenuAliasId` + model_validator
- **Success signal**: ส่ง action `richmenuswitch` ไม่มี alias → 400; มี alias → ผ่าน

**Phase 2: DB Models & Migration**
- **Goal**: มีตาราง cache 2 ตาราง
- **Scope**: model `RichMenuAlias`, `UserRichMenuLink` + Alembic autogenerate (`db_target.py`)
- **Success signal**: `alembic upgrade head` สำเร็จทั้ง local + remote

**Phase 3: Backend Alias Service + API**
- **Goal**: จัดการ alias บน LINE ได้
- **Scope**: `RichMenuService.{create,update,delete,list}_alias_on_line()` + endpoints `POST/GET/PUT/DELETE /admin/rich-menus/aliases`
- **Success signal**: POST alias → ปรากฏใน GET list + บน LINE จริง

**Phase 4: Backend Per-User Service + API**
- **Goal**: link/unlink เมนูให้ user รายคน
- **Scope**: `RichMenuService.{link_to_user,unlink_from_user,get_user_rich_menu,bulk_link,bulk_unlink}()` + endpoints
- **Success signal**: link → `GET /user/{id}/richmenu` คืน id ที่ตั้ง; unlink → กลับ default

**Phase 5: Frontend Switch Action UI**
- **Goal**: admin สร้างเมนูสลับได้จาก wizard
- **Scope**: เพิ่ม `richmenuswitch` ใน action dropdown (`new/page.tsx`) + dropdown เลือก alias ปลายทาง + แสดง action ใน edit page
- **Success signal**: สร้างเมนู A↔B → กดบนมือถือสลับได้

**Phase 6: Frontend Per-User UI**
- **Goal**: กำหนดเมนูตาม user จาก dashboard
- **Scope**: ปุ่ม/modal "กำหนด rich menu" ในหน้า friends/users + แสดง assignment ปัจจุบัน + bulk select (Should)
- **Success signal**: เลือก user → กำหนดเมนู → ผู้ใช้เห็นเมนูเฉพาะ

**Phase 7: Guards & Auth**
- **Goal**: กัน orphan + ป้องกัน endpoint
- **Scope**: guard ก่อน DELETE rich menu (เช็ค alias/link) + เพิ่ม `get_current_admin` ทุก route rich menu
- **Success signal**: ลบเมนูที่มี alias → 409/เตือน; เรียก endpoint ไม่มี token → 401

**Phase 8: Tests + E2E**
- **Goal**: ยืนยันคุณภาพ + ไม่มี regression
- **Scope**: unit test validator + service (mock httpx); manual E2E สลับเมนู + per-user บนมือถือจริง
- **Success signal**: CI green + สลับ/per-user ทำงานจริง + flow เดิม (create/publish) ไม่พัง

### Parallelism Notes

- Phase 1 + 2 ขนานกันได้ (schema vs DB ไม่พึ่งกัน)
- Phase 3 (alias) + 4 (per-user) ขนานกันได้ หลัง 1,2 เสร็จ
- Phase 5 (frontend switch) + 6 (frontend per-user) ขนานกันได้ หลัง backend คู่ของมันเสร็จ

---

## Decisions Log

| Decision | Choice | Alternatives | Rationale |
|----------|--------|--------------|-----------|
| LINE client | raw httpx เดิม | LINE SDK | project rule — RichMenuService ห้ามใช้ line_service |
| เก็บ alias/link ใน DB | ✅ cache table | query LINE สดทุกครั้ง | LINE ไม่มี list-all per-user; UI ต้องการภาพรวม |
| Per-user targeting | รายคน + bulk (manual) | segment อัตโนมัติ | MVP คุมขอบเขต; segment ทำ PRD แยกได้ |
| แก้ schema validation | enum + validator | ปล่อย str เดิม | ปิดช่องโหว่ richmenuswitch พังเงียบ (HIGH severity) |
| Auth | แนะนำเพิ่ม get_current_admin | คง no-auth | endpoint rich menu จัดการ OA — ควรกันสิทธิ์ |
| ลบเมนูที่มี dependency | บล็อก + เตือน | cascade auto-unlink | ปลอดภัยกว่าใน MVP; cascade ไว้ future |

---

## Research Summary

**LINE API (จาก official Messaging API reference)**
- Alias: `POST/PUT/DELETE/GET /v2/bot/richmenu/alias[/{id}]` — สูงสุด 1,000 alias/OA, rate 2,000/s (delete 100/hr)
- Switch action: `richmenuswitch` ต้องมี `richMenuAliasId` + `data`; postback กลับมามี `newRichMenuAliasId` + `status`
- Per-user: `POST/DELETE/GET /v2/bot/user/{userId}/richmenu`; bulk `POST /v2/bot/richmenu/bulk/{link,unlink}` (≤500 user/req)
- Display priority: per-user (API) > default (API) > default (OA Manager); การสลับ/link มีผลทันที
- รูป rich menu แก้ไม่ได้ in-place (สร้างใหม่เท่านั้น) → alias ช่วยให้อัปเดตรูปโดยไม่ต้องแก้ทุกปุ่ม

**Codebase Context (จากการสำรวจ)**
- Backend: `rich_menus.py` (9 endpoints), `rich_menu_service.py` (9 methods, @staticmethod, raw httpx), `models/rich_menu.py` (12 cols, RichMenuStatus enum), `schemas/rich_menu.py` (action type = str, ไม่มี enum/aliasId)
- Frontend: list/create/edit 3 หน้า; action dropdown มีแค่ uri/message; publish = global เท่านั้น
- มี `line_user_id` ใน users/friends → ใช้เป็นเป้าหมาย per-user ได้ทันที
- Alembic dual-target (`scripts/db_target.py`) รองรับ migration local + remote

---

*Generated: 2026-06-20*
*Status: DRAFT - ready for review/execution*
