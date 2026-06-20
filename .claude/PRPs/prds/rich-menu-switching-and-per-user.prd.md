# PRD: Rich Menu Tab Switching + Per-User Rich Menu Assignment

> **Status: REVISED (2026-06-20)** — ผ่านการรีวิวโดยคณะผู้เชี่ยวชาญ 6 มุมมอง (PM, Backend, LINE API, Security, Frontend/UX, Completeness). Verdict เดิม NEEDS_REVISION → แก้ครบ 22 edits แล้ว พร้อม execute. ดู "Review History" ท้ายเอกสาร

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
- **Auth มีครบแล้ว** ทุก endpoint: `get_current_admin` บน read (`rich_menus.py:43,48,181`), `require_permission(KEY_MANAGE_RICH_MENUS)` บน write (`rich_menus.py:56,83,111,145,189,205`); `core/permissions.py` จำกัด `KEY_MANAGE_RICH_MENUS` ให้ SUPER_ADMIN + ADMIN

**ช่องว่างที่ยืนยันแล้ว:**
- **ไม่มี alias:** ไม่มี `RichMenuAlias` model, ไม่มี migration, ไม่มี endpoint, grep `"alias"/"richMenuAliasId"` = 0 ผลลัพธ์ใน `backend/app`
- **richmenuswitch พังเงียบ:** `backend/app/schemas/rich_menu.py:24-30` — `RichMenuAreaAction.type` เป็น `str` ไม่มี enum + **ไม่มีฟิลด์ `richMenuAliasId`** → ส่งไป LINE แล้ว `richmenuswitch` จะใช้งานจริงไม่ได้
- **ไม่มี per-user:** มีแค่ `set_default_on_line()` → `POST /v2/bot/user/all/richmenu/{id}` (`rich_menu_service.py:50-59`) ซึ่งคือ "ทุกคน" ไม่มี link-to-user, ไม่มี bulk link/unlink, ไม่มี mapping table
- **Frontend dropdown:** `frontend/app/admin/rich-menus/new/page.tsx:440-447` มีแค่ `uri` กับ `message` (หน้า edit ไม่มี UI แก้ action เลย)

**LINE API รองรับครบ (จาก official docs):**
- Alias: `POST/PUT/DELETE/GET /v2/bot/richmenu/alias[/{id}]` + `GET /v2/bot/richmenu/alias/list` (list ทั้งหมด — ใช้ reconcile cache)
- Switch action: `{"type": "richmenuswitch", "richMenuAliasId": "..." (required), "data": "..." (optional)}`
- Per-user: `POST/DELETE/GET /v2/bot/user/{userId}/richmenu`, bulk: `POST /v2/bot/richmenu/bulk/{link,unlink}`

## Proposed Solution

เพิ่ม 2 ฟีเจอร์บนสถาปัตยกรรม RichMenuService เดิม (raw httpx + token จาก DB):

### Feature A: Rich Menu Tab Switching (alias + richmenuswitch)
- เพิ่มตาราง `rich_menu_aliases` (cache mapping alias_id ↔ rich_menu_id)
- เพิ่ม service methods + endpoints จัดการ alias (create/update/delete/list)
- เพิ่มฟิลด์ `richMenuAliasId` ใน schema action + enum validation รับ `richmenuswitch` (validate เฉพาะ `richMenuAliasId`; `data` optional)
- เพิ่มตัวเลือก action type "สลับเมนู" ใน frontend wizard + dropdown เลือก alias ปลายทาง

### Feature B: Per-User Rich Menu Assignment
- เพิ่มตาราง `user_rich_menu_links` (cache ว่า line_user_id ไหน → rich_menu_id ไหน)
- เพิ่ม service methods + endpoints: link/unlink/get per-user + bulk
- เพิ่ม UI กำหนดเมนูให้ผู้ใช้รายคน/กลุ่ม (เชื่อมกับตาราง users/friends ที่มี `line_user_id` อยู่แล้ว)

### Release Sequencing
**แนะนำแยกเป็น 2 releases** (ลดความเสี่ยงให้ของที่แก้บั๊กจริงออกก่อน):
- **R1 = Feature A + schema fix** — แก้ช่องโหว่ richmenuswitch ที่ "พังเงียบ" + เปิด tab switching (มูลค่าสูง, แก้บั๊กจริง)
- **R2 = Feature B (per-user) + bulk + guards** — เป็น enhancement

ถ้าทีมเลือก ship พร้อมกัน ให้ระบุเหตุผลในแผน implementation (เช่น มี frontend หน้าเดียวที่อยากปล่อยรวด)

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
- **แก้ปัญหา "รูปเมนูแก้ไม่ได้ in-place"** — ยังคง limitation เดิมของ LINE (สร้างใหม่ + ชี้ alias ใหม่); MVP ยังไม่มี Flow re-point alias สำหรับอัปเดตรูป
- **UI เตือนเมื่อจำนวน alias ใกล้ limit 1,000/OA** — ไม่ทำใน MVP
- **A/B testing เมนู** — เกินขอบเขต MVP

## Success Metrics

### ชั้นที่ 1 — Launch Gate (binary pass/fail ก่อนปล่อย)

| Metric | Target | How Measured |
|--------|--------|--------------|
| สร้าง alias แล้วชี้ไป rich menu ได้ | 100% | API test: POST alias → GET alias list มีรายการ |
| richmenuswitch action ส่งไป LINE สำเร็จ + กดสลับได้ | 100% | สร้างเมนู A→B, กดสลับบนมือถือจริง (ดู E2E pre-condition) |
| validator: `richmenuswitch` ไม่มี `richMenuAliasId` → 422 | 100% | unit test (ไม่พังเงียบ) |
| validator: alias_id/userId format ผิด → 422 ก่อนถึง LINE | 100% | unit test |
| Link เมนูให้ user รายคนได้ / Unlink กลับ default | 100% | POST link → GET = id; DELETE → default |
| link เมนูที่ยังไม่ synced → 409 | 100% | API test |
| link userId ที่ไม่มีในระบบ → 404 (IDOR guard) | 100% | API test |
| ลบเมนูที่มี alias/link ชี้อยู่ → 409 + แจ้ง dependency | 100% | API test |
| ไม่มี regression กับ rich menu เดิม | 100% | CI green + create/publish เดิมยังทำงาน |

### ชั้นที่ 2 — Business Success (วัดหลังปล่อย)

| Metric | Target | How Measured |
|--------|--------|--------------|
| admin ใช้งานจริงโดยไม่ต้องถาม dev | ≥1 คน ภายใน 2 สัปดาห์ | admin สร้างชุดเมนูสลับ + ใช้บน LINE จริง |
| (ขึ้นกับ Could) admin เห็นภาพรวม alias + per-user links | ถ้าทำ centralized view | flag: metric นี้ depends on Could feature — ตัดได้ถ้า cut |

## Open Questions

| คำถาม | MVP (default) | Future |
|-------|---------------|--------|
| Per-user เลือกเป้าหมายแบบไหน? | เลือก user รายคน + bulk เลือกหลายคนจากตาราง friends | Segment อัตโนมัติ (role/tag/live-chat status) |
| เก็บ mapping per-user ใน DB ไหม? (LINE ไม่มี list-all) | ✅ มี cache table `user_rich_menu_links`; reconcile ทำได้แค่ spot-check รายคน | Sampling reconcile job (N users/hour) |
| Auth | **มีครบแล้ว** — endpoint เดิมทุกตัวใช้ `get_current_admin`/`require_permission(KEY_MANAGE_RICH_MENUS)` (permissions.py = SUPER_ADMIN+ADMIN); endpoint ใหม่ (alias/per-user/bulk) ต้องใส่ `require_permission(KEY_MANAGE_RICH_MENUS)` ตั้งแต่ Phase 3-4 | RBAC permission key เฉพาะ (เช่น `can_manage_richmenu_peruser`) |
| ผูก per-user กับ live-chat flow อัตโนมัติไหม? | ❌ manual assign เท่านั้น | auto-switch เมนูตอน HUMAN/BOT mode |
| ลบ rich menu ที่มี alias/link ชี้อยู่? | บล็อก (FK RESTRICT + 409) + เตือน dependency | cascade + auto-unlink |
| create-alias-first vs create-on-the-fly (UX)? | **ตัดสินใน Phase 5** (เสนอ: สร้าง alias ก่อน, dropdown fetch จาก backend) | inline create alias ใน wizard |

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
| Must | ตาราง + model `RichMenuAlias` (alias_id, rich_menu_id FK RESTRICT, sync_status) | LINE ไม่มี list-all alias แบบ map กับ DB; ต้อง cache |
| Must | Service: create/update/delete/list alias on LINE (raw httpx) | แกนของ tab switching |
| Must | Endpoints: `POST/GET/PUT/DELETE /admin/rich-menus/aliases` | จัดการ alias จาก dashboard |
| Must | Schema: เพิ่ม `richMenuAliasId` + enum validation; validate เฉพาะ aliasId เมื่อ richmenuswitch (`data` optional) | ปิดช่องโหว่ "พังเงียบ" |
| Must | `require_permission(KEY_MANAGE_RICH_MENUS)` บน endpoint ใหม่ (alias/per-user/bulk) | endpoint จัดการ LINE OA — ต้องกันสิทธิ์ตั้งแต่ต้น |
| Must | Frontend: action type "สลับเมนู (richmenuswitch)" + เลือก alias ปลายทาง (จาก backend) | ให้ admin สร้างเมนูสลับได้จริง |
| Must | ตาราง + model `UserRichMenuLink` (line_user_id, rich_menu_id FK RESTRICT) | cache per-user assignment |
| Must | Service: link/unlink/get per-user + guards (synced + IDOR) | แกนของ per-user |
| Must | Endpoints: link/unlink/get per-user | จัดการจาก dashboard |
| Must | Frontend: UI กำหนดเมนูให้ user รายคน (เชื่อมตาราง friends) | ใช้งานจริงได้ |
| Should | Bulk link/unlink หลาย user พร้อมกัน (`/richmenu/bulk/link`, ≤500/req) | ตั้งเมนูให้กลุ่มได้เร็ว |
| Should | Guard: บล็อกการลบเมนูที่มี alias/user-link ชี้อยู่ (FK RESTRICT + 409 + dependency list) | กัน orphan |
| Should | Frontend: edit page เพิ่ม action editor (แก้ richmenuswitch/alias ได้) | ปัจจุบัน edit แก้ action ไม่ได้เลย |
| Could | หน้า admin รวมศูนย์: ดู alias map + per-user links ทั้งหมด | visibility (metric ชั้น 2 ขึ้นกับข้อนี้) |
| Could | Reconcile แบบ sampling (per-user) + ปุ่ม re-sync alias (ใช้ GET alias/list) | กัน cache drift |
| Could | ปุ่ม "ทดสอบสลับ" / preview flow ใน wizard | DX |
| Won't | Auto-assign ตาม segment/role | เกิน MVP |
| Won't | Analytics การกดสลับเมนู | เกิน MVP |
| Won't | Flow อัปเดตรูปผ่าน re-point alias | เกิน MVP |

### MVP Scope

**Tab switching ใช้งานได้ end-to-end** (สร้างเมนู A↔B + alias + กดสลับบนมือถือจริงได้) **และ per-user assignment รายคนใช้งานได้** (link/unlink/get) จาก dashboard พร้อม validation + guards (synced/IDOR/format) ที่ปิดช่องโหว่ richmenuswitch

### User Flow

**Flow A — สร้างเมนูสลับแท็บ:**
```
Admin สร้างเมนู A + เมนู B (มีอยู่แล้ว)
  → sync ทั้งสองขึ้น LINE (ได้ line_rich_menu_id)
  → สร้าง alias-a → เมนู A, alias-b → เมนู B   (alias ต้องมีก่อนตั้ง switch action)
  → ในเมนู A ตั้ง area action = richmenuswitch → alias-b (เลือกจาก dropdown ที่ fetch มา)
     ในเมนู B ตั้ง area action = richmenuswitch → alias-a
  → publish A เป็น default
  → ผู้ใช้กดปุ่มสลับ → เปลี่ยน A↔B ทันที
```
> หมายเหตุ: publish default **ไม่ override** per-user link ที่ผู้ใช้มีอยู่ (per-user priority สูงกว่า)

**Flow B — กำหนดเมนูตามผู้ใช้:**
```
Admin เปิดหน้า friends/users → เลือกผู้ใช้
  → เลือก rich menu ที่ sync แล้ว → "กำหนดให้ผู้ใช้นี้"
    → ตรวจ: เมนู synced แล้ว? (ไม่ → 409) + line_user_id มีจริง? (ไม่ → 404)
    → POST /admin/rich-menus/{id}/users/{userId}
      → LINE: POST /v2/bot/user/{userId}/richmenu/{lineId}
      → cache ลง user_rich_menu_links
  → ผู้ใช้คนนั้นเห็นเมนูเฉพาะ (priority สูงกว่า default)
  → "ยกเลิก" → DELETE (hard delete) → กลับเห็น default
```

---

## Technical Approach

**Feasibility**: **HIGH** — LINE API รองรับครบ, สถาปัตยกรรม RichMenuService เดิมขยายได้ตรงไปตรงมา

**Architecture Notes**
- ใช้ pattern เดิม: ทุก LINE call เป็น `httpx.AsyncClient()` + token จาก `SettingsService.get_setting(db, "LINE_CHANNEL_ACCESS_TOKEN")`
- Alias/per-user CRUD ใช้ base `https://api.line.me/v2/bot` (ไม่ใช่ api-data)
- `User`/friends มี `line_user_id` อยู่แล้ว → per-user link ใช้ค่านี้เป็นเป้าหมาย
- LINE เป็น source of truth; ตาราง cache (`rich_menu_aliases`, `user_rich_menu_links`) ไว้ให้ UI list ได้ (LINE ไม่มี endpoint list-all per-user; alias reconcile ใช้ `GET /v2/bot/richmenu/alias/list`)
- Display priority (จาก LINE docs): per-user (API) > default (API) > default (OA Manager) — ต้องสื่อสารใน UI ว่า per-user ทับ default
- **Auth:** endpoint เดิมมี auth ครบแล้ว; endpoint ใหม่ทุกตัวใช้ `require_permission(KEY_MANAGE_RICH_MENUS)`
- **Route ordering:** ต้อง register literal `/aliases` **ก่อน** `/{id:int}` หรือแยกเป็น sub-router (กัน FastAPI cast "aliases" → int)

**Data Model (ใหม่)**
```
rich_menu_aliases
  id PK
  alias_id (str, unique)                         # LINE: ^[a-zA-Z0-9_-]{1,50}$
  rich_menu_id  FK→rich_menus.id (ondelete=RESTRICT)
  sync_status (str: PENDING|SYNCED|FAILED, default PENDING)   # ตาม pattern rich_menus เดิม
  last_synced_at (datetime|null) | last_sync_error (text|null)
  created_at | updated_at        # ระบุ convention: server_default=func.now() + onupdate=func.now()

user_rich_menu_links
  id PK
  line_user_id (str, indexed, unique)            # 1 user มี per-user menu ได้ 1 เมนู; LINE userId 'U'+33
  rich_menu_id  FK→rich_menus.id (ondelete=RESTRICT)
  linked_at | last_sync_error (text|null) | created_at | updated_at
  # retention: unlink = hard delete; cleanup record เมื่อรับ unfollow event จาก webhook
```

**Schema Change**
```python
# backend/app/schemas/rich_menu.py — RichMenuAreaAction
class RichMenuAreaAction(BaseModel):
    type: Literal["uri","message","postback","datetimepicker","richmenuswitch"]
    label: Optional[str] = None
    uri: Optional[str] = None
    text: Optional[str] = None
    data: Optional[str] = ""              # richmenuswitch ใช้ได้ แต่ OPTIONAL (LINE default "")
    displayText: Optional[str] = None
    richMenuAliasId: Optional[str] = None # ← ใหม่
    # model_validator: ถ้า type=="richmenuswitch" → require richMenuAliasId เท่านั้น
    #                  (อย่า require data — LINE ไม่ได้บังคับ)
    # อีก validator: alias_id ^[a-zA-Z0-9_-]{1,50}$ (ใช้ทั้ง action.richMenuAliasId และ alias CRUD)
```
> Backward-compat: `RichMenuAreaAction` ใช้บน **input path เท่านั้น** (`rich_menus.py:72,92` `area.model_dump` ตอน create/update). GET คืน `config` เป็น `Dict[str,Any]` ดิบ ไม่ผ่าน Pydantic action validation → record เก่าไม่ ValidationError

**Technical Risks**

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| ตั้ง richmenuswitch ก่อนสร้าง alias → กดแล้วไม่สลับ | M | UI: dropdown fetch alias จาก backend + guard เมนูต้อง synced; validate alias มีจริงก่อน publish |
| Cache (DB) กับ LINE หลุดจากกัน (alias ถูกลบบน Console) | M | `GET /richmenu/alias/list` มา reconcile; ปุ่ม re-sync (Could) |
| alias ชี้ rich_menu_id ที่ถูกลบบน LINE Console → silent failure ตอนสลับ | M | reconcile verify ว่า rich_menu_id ยังมีด้วย `GET /v2/bot/richmenu/{id}`, mark stale |
| LINE ไม่มี GET list-all per-user → reconcile ลำบาก | M | UI note "per-user เป็น cache อาจไม่ตรงถ้าแก้นอกระบบ" + Could: sampling reconcile |
| ลบเมนูที่ alias/user ชี้อยู่ → orphan | M | FK `ondelete=RESTRICT` (DB-level) + application guard 409 + dependency list |
| per-user link ไป user ที่ block OA → 200 แต่ไม่เห็นเมนู | L | บันทึก cache ตามที่ส่ง; UI หมายเหตุว่า LINE คืน 200 ไม่การันตีเห็น |
| rate limit: **delete alias = 100/hr** (ไม่ใช่ 2000/s), create alias 2000/s | M | bulk alias cleanup ต้อง queue+throttle; create ปลอดภัย |
| migration ล้มเหลวบน production (downgrade ถูก FK block) | M | เขียน+ทดสอบ `downgrade()` ก่อน deploy remote |

---

## Implementation Phases

> **Implementation Plan:** `.claude/PRPs/plans/rich-menu-switching-and-per-user.plan.md` (self-contained, ครอบทั้ง 8 phases, สร้าง 2026-06-20). Phase statuses คง `pending` จนกว่าจะเริ่ม implement จริง

| # | Phase | Description | Status | Parallel | Depends |
|---|-------|-------------|--------|----------|---------|
| 1 | Schema & Validation Fix | `richMenuAliasId` + action-type enum + validator (aliasId required, data optional) + format validators | pending | with 2 | - |
| 2 | DB Models & Migration | `rich_menu_aliases` + `user_rich_menu_links` (FK RESTRICT) + Alembic up **+ down** | pending | with 1 | - |
| 3 | Backend: Alias Service+API | service + endpoints CRUD alias + `require_permission` + route-ordering | pending | with 4 | 1,2 |
| 4 | Backend: Per-User Service+API | link/unlink/get + bulk + guards (synced 409 / IDOR 404 / format) + `require_permission` | pending | with 3 | 1,2 |
| 5 | Frontend: Switch Action UI | action type "สลับเมนู" + alias dropdown (fetch) + edit page action editor + empty/orphan state | pending | with 6 | 3 |
| 6 | Frontend: Per-User UI | กำหนดเมนูให้ user (friends page = primary) + badge + สื่อสาร priority + bulk UX | pending | with 5 | 4 |
| 7 | Delete Guard & Auth Verify | guard ก่อน DELETE (alias/link check) + verify auth coverage บน endpoint ใหม่ | pending | - | 3,4 |
| 8 | Tests + E2E | unit (validator/guard/service) + manual switch + per-user บนมือถือจริง | pending | - | 5,6,7 |

### Phase Details

**Phase 1: Schema & Validation Fix**
- **Goal**: ปิดช่องโหว่ richmenuswitch พังเงียบ + กัน input ผิด format
- **Scope**: `backend/app/schemas/rich_menu.py` — enum action type + ฟิลด์ `richMenuAliasId` + `data: Optional[str]=""`; `model_validator` require **เฉพาะ** `richMenuAliasId` เมื่อ `richmenuswitch`; validator `alias_id` `^[a-zA-Z0-9_-]{1,50}$`, `userId` ขึ้นต้น `U` ยาว 33
- **Success signal**: `richmenuswitch` ไม่มี aliasId → 422; มี aliasId (ไม่มี data) → ผ่าน; alias_id/userId format ผิด → 422

**Phase 2: DB Models & Migration**
- **Goal**: มีตาราง cache 2 ตาราง + rollback ได้
- **Scope**: model `RichMenuAlias`, `UserRichMenuLink` (FK `ondelete=RESTRICT`, `sync_status:str`) + Alembic autogenerate (`scripts/db_target.py`); **เขียน+ทดสอบ `downgrade()`** ระบุ convention timestamp
- **Success signal**: `alembic upgrade head` **และ `downgrade -1`** สำเร็จทั้ง local + remote

**Phase 3: Backend Alias Service + API**
- **Goal**: จัดการ alias บน LINE ได้
- **Scope**: `RichMenuService.{create,update,delete,list}_alias_on_line()` + endpoints `POST/GET/PUT/DELETE /admin/rich-menus/aliases` พร้อม `require_permission(KEY_MANAGE_RICH_MENUS)`; **route ordering**: register `/aliases` ก่อน `/{id:int}` (หรือ sub-router) + ทดสอบก่อน merge
- **Success signal**: POST alias → ปรากฏใน GET list + บน LINE จริง; `GET /admin/rich-menus/aliases` ไม่ชน `/{id}`

**Phase 4: Backend Per-User Service + API**
- **Goal**: link/unlink เมนูให้ user รายคน อย่างปลอดภัย
- **Scope**: `RichMenuService.{link_to_user,unlink_from_user,get_user_rich_menu,bulk_link,bulk_unlink}()` + endpoints + `require_permission`; **guards**: (1) `line_rich_menu_id IS NULL` → 409 "must be synced before linking"; (2) IDOR — `line_user_id` ไม่อยู่ใน users/friends → 404; (3) bulk validate ทุก userId, max 500, bulk unlink body = `{userIds[]}` เท่านั้น (ไม่มี richMenuId)
- **Success signal**: link → `GET /user/{id}/richmenu` คืน id; unlink → กลับ default; เคส 409/404/422 ครบ

**Phase 5: Frontend Switch Action UI**
- **Goal**: admin สร้าง/แก้เมนูสลับได้จาก wizard และ edit
- **Scope**: เพิ่ม `richmenuswitch` ใน action dropdown (`new/page.tsx`) + **alias dropdown ที่ fetch จาก `GET /admin/rich-menus/aliases`** (ไม่ใช่ free-text) + guard "เมนูต้อง synced ก่อน" + empty/loading/orphan state ("ยังไม่มี alias — สร้างก่อน" + link); **edit page ([id]/edit) เพิ่ม action editor** (แก้ richmenuswitch + alias ได้ ไม่ใช่ read-only); กำหนดที่อยู่ alias management UI (เสนอ tab "Aliases" ในหน้า rich-menus); ตัดสิน create-alias-first vs on-the-fly
- **Success signal**: สร้างเมนู A↔B → กดบนมือถือสลับได้; แก้ alias ปลายทางจาก edit page ได้

**Phase 6: Frontend Per-User UI**
- **Goal**: กำหนดเมนูตาม user จาก dashboard
- **Scope**: **primary entry point = friends/users page** (ปุ่ม/modal "กำหนด rich menu") + แสดง assignment ปัจจุบัน; rich-menus list แสดง badge "X users"; centralized view = Could/Phase ถัดไป; **สื่อสาร priority** (tooltip บน ACTIVE badge / info banner ว่า per-user ทับ default); bulk UX (checkbox single-page, max 500, confirm modal, toast progress) — Should
- **Success signal**: เลือก user → กำหนดเมนู → ผู้ใช้เห็นเมนูเฉพาะ; admin เข้าใจว่าทำไมบาง user ไม่เห็น default

**Phase 7: Delete Guard & Auth Verify**
- **Goal**: กัน orphan + ยืนยัน security ของ endpoint ใหม่
- **Scope**: guard ก่อน `DELETE /admin/rich-menus/{id}` — เช็ค alias/user-link (FK RESTRICT + คืน 409 + dependency list ผ่าน `GET /{id}/dependencies`); **verify** ว่า endpoint ใหม่ทุกตัว (alias/per-user/bulk) มี `require_permission(KEY_MANAGE_RICH_MENUS)` ครบ (auth เดิมมีอยู่แล้ว — แค่ตรวจ coverage)
- **Success signal**: ลบเมนูที่มี alias/link → 409 + แจ้งรายการ; endpoint ใหม่ไม่มี token → 401, role ไม่พอ → 403

**Phase 8: Tests + E2E**
- **Goal**: ยืนยันคุณภาพ + ไม่มี regression
- **Pre-condition (ต้องมีก่อน Phase 5/8)**: ยืนยัน test LINE OA + token valid + device + ผู้รับผิดชอบ device test. ถ้าไม่มี test OA → ลด success signal ของ switch/per-user เป็น integration test (mock httpx) + mark device test out-of-scope MVP
- **Scope**: unit test validator + guards + service (mock httpx); **manual E2E gate** (แยกจาก "CI green") สลับเมนู + per-user บนมือถือจริง
- **Success signal**: CI green + (E2E gate) สลับ/per-user ทำงานจริง + flow เดิม (create/publish) ไม่พัง

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
| แก้ schema validation | enum + validator (aliasId required, data optional) | ปล่อย str เดิม | ปิดช่องโหว่ richmenuswitch พังเงียบ (CRITICAL) |
| Auth | endpoint เดิม **มี auth ครบแล้ว**; endpoint ใหม่ใช้ `require_permission(KEY_MANAGE_RICH_MENUS)` | คง no-auth (❌ ไม่จริง) | endpoint จัดการ LINE OA — ต้องกันสิทธิ์ |
| alias sync state | `sync_status:str` | `line_synced:bool` | ตรง pattern `rich_menus` เดิม + เก็บ error state ได้ |
| ลบเมนูที่มี dependency | บล็อก (FK RESTRICT + 409) | cascade auto-unlink | ปลอดภัยกว่าใน MVP; cascade ไว้ future |
| Release | แนะนำแยก R1 (Feature A) / R2 (Feature B) | ship พร้อมกัน | ให้ของที่แก้บั๊กจริงออกก่อน ลดความเสี่ยง |

---

## Research Summary

**LINE API (จาก official Messaging API reference)**
- Alias: `POST/PUT/DELETE/GET /v2/bot/richmenu/alias[/{id}]` + `GET /v2/bot/richmenu/alias/list` (list ทั้งหมดบน channel — ใช้ reconcile DB cache ใน re-sync flow) — สูงสุด 1,000 alias/OA
- Rate limit: **create alias 2,000/s; delete alias 100/hr** (เหมือน delete rich menu — bulk cleanup ต้อง queue+throttle)
- Switch action: `richmenuswitch` ต้องมี `richMenuAliasId` (**required**); `data` = **optional** (LINE ส่ง postback ด้วย `data=""` ถ้าไม่ระบุ); postback กลับมามี `newRichMenuAliasId` + `status`
- Per-user: `POST/DELETE/GET /v2/bot/user/{userId}/richmenu`; bulk `POST /v2/bot/richmenu/bulk/{link,unlink}` (≤500 user/req; unlink body = `{userIds[]}` เท่านั้น)
- Display priority: per-user (API) > default (API) > default (OA Manager); การสลับ/link มีผลทันที
- รูป rich menu แก้ไม่ได้ in-place (สร้างใหม่เท่านั้น) — alias *สามารถ* ใช้ re-point ไปเมนูใหม่ได้ แต่ flow นี้อยู่นอก MVP (Won't)

**Codebase Context (จากการสำรวจ + รีวิว)**
- Backend: `rich_menus.py` (9 endpoints, **auth ครบ**: `get_current_admin`/`require_permission(KEY_MANAGE_RICH_MENUS)`), `rich_menu_service.py` (9 methods, @staticmethod, raw httpx), `models/rich_menu.py` (12 cols, `sync_status:str` pattern), `schemas/rich_menu.py` (action type = str, ไม่มี enum/aliasId — input path เท่านั้น)
- `permissions.py:51,93` — `KEY_MANAGE_RICH_MENUS` = SUPER_ADMIN + ADMIN
- Frontend: list/create/edit 3 หน้า; action dropdown มีแค่ uri/message; edit page ไม่มี action editor; publish = global
- มี `line_user_id` ใน users/friends → ใช้เป็นเป้าหมาย per-user ได้ทันที
- Alembic dual-target (`scripts/db_target.py`) รองรับ migration local + remote

---

## Review History

| Date | Reviewer | Verdict | Action |
|------|----------|---------|--------|
| 2026-06-20 | คณะผู้เชี่ยวชาญ 6 มุมมอง (PM / Backend Architect / LINE API Expert / Security / Frontend-UX / Completeness Critic) ผ่าน multi-agent workflow | NEEDS_REVISION → แก้แล้ว | แก้ 3 CRITICAL (auth มีอยู่แล้ว, data optional, alias chicken-and-egg) + 6 HIGH + 6 MEDIUM + 3 LOW = 22 edits integrated |

**CRITICAL ที่แก้:**
1. ลบคำกล่าวอ้างผิด "no auth for now" — auth มีครบแล้ว (verified `rich_menus.py` ด้วย grep)
2. `richmenuswitch.data` = optional (ไม่ใช่ required) — validator require เฉพาะ `richMenuAliasId`
3. แก้ alias chicken-and-egg ใน UX flow (Phase 5: alias ต้องมีก่อน + dropdown fetch จาก backend)

---

*Generated: 2026-06-20 | Revised: 2026-06-20 (post 6-agent review)*
*Status: REVISED - ready for execution*
