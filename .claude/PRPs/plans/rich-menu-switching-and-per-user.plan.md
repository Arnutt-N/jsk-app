# Plan: Rich Menu Tab Switching + Per-User Assignment (all phases)

## Summary
เพิ่มความสามารถ LINE Rich Menu 2 อย่างบน jsk-app: (A) **สลับเมนูแบบแท็บ** ผ่าน rich menu alias + `richmenuswitch` action และ (B) **กำหนดเมนูตามผู้ใช้ (per-user)** ผ่าน link/unlink/bulk. ทำบนสถาปัตยกรรม `RichMenuService` เดิม (raw httpx + token จาก DB) โดยเพิ่ม 2 ตาราง cache, แก้ schema validator ที่ทำให้ `richmenuswitch` พังเงียบ, เพิ่ม endpoints + frontend UI.

## User Story
As an **admin/super-admin ผู้ดูแล LINE OA**, I want **สร้างชุดเมนูที่สลับกันได้แบบแท็บ และกำหนดเมนูเฉพาะผู้ใช้บางคน**, so that **ออกแบบ LINE OA experience ได้หลายชั้นและเฉพาะกลุ่ม**.

## Problem → Solution
ปัจจุบันสร้าง rich menu ได้แต่ใช้ได้แค่ "เมนูเดียวสำหรับทุกคน" (default) + `richmenuswitch` ส่งไป LINE แล้วพังเงียบ (schema ขาด `richMenuAliasId`) → เพิ่ม alias system + per-user link + แก้ validator → สลับเมนูได้ทันที + ตั้งเมนูรายคนได้

## Metadata
- **Complexity**: XL (≈22 files: 2 models + 1 migration + service methods + 2 endpoint groups + schema + 2 frontend areas + tests)
- **Source PRD**: `.claude/PRPs/prds/rich-menu-switching-and-per-user.prd.md` (REVISED, post 6-agent review)
- **PRD Phase**: ALL (1–8)
- **Estimated Files**: ~22

---

## UX Design

### Before
```
หน้า rich-menus: list / create wizard (action = uri|message เท่านั้น) / edit (แก้ name+รูป, แก้ action ไม่ได้)
publish = "Set Active" → default ให้ทุกคนเท่านั้น
ไม่มี alias, ไม่มี per-user
```

### After
```
create/edit wizard: action เพิ่ม "สลับเมนู (richmenuswitch)" → เลือก alias ปลายทางจาก dropdown (fetch จาก backend)
หน้า rich-menus เพิ่ม tab "Aliases" (สร้าง/แก้/ลบ alias → ชี้ไป rich menu)
หน้า friends/users: ปุ่ม "กำหนด rich menu" ต่อ user (+ badge "X users" ใน rich-menus list)
ลบเมนูที่มี alias/link ชี้อยู่ → 409 + แจ้ง dependency
```

### Interaction Changes
| Touchpoint | Before | After | Notes |
|---|---|---|---|
| Area action dropdown | uri, message | + richmenuswitch (+ alias dropdown) | alias ต้อง synced ก่อน |
| Rich-menus page | list เท่านั้น | + tab "Aliases" | alias CRUD |
| Friends/users page | — | + "กำหนด rich menu" | per-user link/unlink |
| Delete menu | ลบได้เลย | 409 ถ้ามี alias/link ชี้อยู่ | FK RESTRICT + guard |
| Priority | default ทุกคน | per-user > default (สื่อสารใน UI) | tooltip/banner |

---

## Mandatory Reading

| Priority | File | Lines | Why |
|---|---|---|---|
| P0 | `backend/app/models/rich_menu.py` | 1-37 | model + sync_status pattern ที่ alias/link ต้อง mirror |
| P0 | `backend/app/services/rich_menu_service.py` | 1-205 | httpx/token pattern + ที่ที่จะเพิ่ม method |
| P0 | `backend/app/api/v1/endpoints/rich_menus.py` | 1-224 | endpoint + auth pattern + route ที่จะเพิ่ม |
| P0 | `backend/app/schemas/rich_menu.py` | 1-64 | RichMenuAreaAction ที่จะแก้ validator |
| P0 | `backend/app/core/permissions.py` | 48-109 | KEY_MANAGE_RICH_MENUS (มีแล้ว) + DEFAULT_POLICY |
| P1 | `backend/app/api/deps.py` | 109-204 | get_current_admin + require_permission |
| P1 | `backend/app/models/chat_session.py` | 1-40 | ForeignKey + line_user_id String(50) pattern |
| P1 | `backend/alembic/versions/add_sync_status_to_rich_menus.py` | 1-46 | migration style (defensive + downgrade) |
| P1 | `frontend/app/admin/rich-menus/new/page.tsx` | 209,248-342,440-447 | action dropdown + fetch + payload |
| P1 | `frontend/lib/authFetch.ts` | 1-187 | auth auto-inject (เหตุผลที่ fetch ไม่ต้องใส่ token เอง) |
| P2 | `frontend/app/admin/rich-menus/[id]/edit/page.tsx` | all | จะเพิ่ม action editor |
| P2 | `backend/scripts/db_target.py` | — | รัน alembic dual-target |

## External Documentation

| Topic | Source | Key Takeaway |
|---|---|---|
| Alias CRUD | LINE Messaging API ref | `POST/PUT/DELETE/GET /v2/bot/richmenu/alias[/{id}]` + `GET /v2/bot/richmenu/alias/list`; alias ≤1000/OA; **delete alias = 100/hr** |
| richmenuswitch | LINE ref | `{"type":"richmenuswitch","richMenuAliasId":"..." (required),"data":"..." (optional)}` |
| Per-user | LINE ref | `POST/DELETE/GET /v2/bot/user/{userId}/richmenu`; bulk `POST /v2/bot/richmenu/bulk/{link,unlink}` (≤500; unlink body `{userIds[]}`) |
| Priority | LINE ref | per-user(API) > default(API) > default(OA Manager); มีผลทันที; user block → 200 แต่ไม่เห็น |

---

## Patterns to Mirror

### MODEL_PATTERN (+ sync_status)
```python
# SOURCE: backend/app/models/rich_menu.py:1-37
from sqlalchemy import Column, Integer, String, DateTime, Enum, JSON, Text, ForeignKey
from sqlalchemy.sql import func
from app.db.base import Base

class RichMenu(Base):
    __tablename__ = "rich_menus"
    id = Column(Integer, primary_key=True, index=True)
    line_rich_menu_id = Column(String, unique=True, index=True, nullable=True)
    sync_status = Column(String, default="PENDING")  # PENDING, SYNCED, FAILED
    last_synced_at = Column(DateTime(timezone=True), nullable=True)
    last_sync_error = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
```

### FK_PATTERN (mirror for ondelete=RESTRICT + line_user_id)
```python
# SOURCE: backend/app/models/chat_session.py:1-40
from sqlalchemy import Column, Integer, String, ForeignKey
line_user_id = Column(String(50), nullable=False, index=True)   # LINE userId 'U'+32
operator_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
# NEW tables must use: ForeignKey("rich_menus.id", ondelete="RESTRICT")
```

### SERVICE_PATTERN (httpx + token)
```python
# SOURCE: backend/app/services/rich_menu_service.py:1-60
import httpx
from app.services.settings_service import SettingsService

class RichMenuService:
    API_BASE = "https://api.line.me/v2/bot"
    DATA_API_BASE = "https://api-data.line.me/v2/bot"

    @staticmethod
    async def get_client_headers(db: AsyncSession) -> Dict[str, str]:
        token = await SettingsService.get_setting(db, "LINE_CHANNEL_ACCESS_TOKEN")
        return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    @staticmethod
    async def create_on_line(db: AsyncSession, rich_menu_config: Dict[str, Any]) -> str:
        headers = await RichMenuService.get_client_headers(db)
        async with httpx.AsyncClient() as client:
            response = await client.post(f"{RichMenuService.API_BASE}/richmenu", headers=headers, json=rich_menu_config)
            response.raise_for_status()
            return response.json()["richMenuId"]
```

### ENDPOINT_PATTERN (+ auth)
```python
# SOURCE: backend/app/api/v1/endpoints/rich_menus.py:1-106
from app.api.deps import get_current_admin, require_permission
from app.core.permissions import KEY_MANAGE_RICH_MENUS
router = APIRouter()

@router.get("", response_model=List[RichMenuResponse])
async def list_rich_menus(db: AsyncSession = Depends(get_db), current_admin: User = Depends(get_current_admin)):
    result = await db.execute(select(RichMenu).order_by(RichMenu.created_at.desc()))
    return result.scalars().all()

@router.post("", response_model=RichMenuResponse)
async def create_rich_menu(data: RichMenuCreate, db: AsyncSession = Depends(get_db),
        current_admin: User = Depends(require_permission(KEY_MANAGE_RICH_MENUS))):
    ...
```

### PERMISSION_PATTERN (already has the key)
```python
# SOURCE: backend/app/core/permissions.py:50,93
KEY_MANAGE_RICH_MENUS = "manage_rich_menus"
# DEFAULT_POLICY: KEY_MANAGE_RICH_MENUS: frozenset({UserRole.SUPER_ADMIN, UserRole.ADMIN})
# Gate routes with: Depends(require_permission(KEY_MANAGE_RICH_MENUS))
```

### MIGRATION_PATTERN (defensive + downgrade)
```python
# SOURCE: backend/alembic/versions/add_sync_status_to_rich_menus.py + e3f4g5h6i7j8_add_rich_menus_table.py
from alembic import op
import sqlalchemy as sa
revision = 'add_richmenu_alias_and_peruser'
down_revision = '<CURRENT_HEAD>'   # GOTCHA: get via db_target.py alembic current
branch_labels = None
depends_on = None

def upgrade() -> None:
    conn = op.get_bind()
    exists = conn.execute(sa.text(
        "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'rich_menu_aliases')"
    )).scalar()
    if exists:
        return
    op.create_table('rich_menu_aliases',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('alias_id', sa.String(), nullable=False),
        sa.Column('rich_menu_id', sa.Integer(), nullable=False),
        sa.Column('sync_status', sa.String(), nullable=False, server_default='PENDING'),
        sa.Column('last_synced_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('last_sync_error', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['rich_menu_id'], ['rich_menus.id'], ondelete='RESTRICT'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('alias_id'),
    )
    op.create_index(op.f('ix_rich_menu_aliases_id'), 'rich_menu_aliases', ['id'])
    # ... user_rich_menu_links similarly (unique line_user_id, indexed)

def downgrade() -> None:
    op.drop_table('user_rich_menu_links')
    op.drop_table('rich_menu_aliases')
```

### FRONTEND_FETCH_PATTERN (auth auto-injected — DO NOT add token manually)
```typescript
// SOURCE: frontend/app/admin/rich-menus/new/page.tsx:209,248-262 + frontend/lib/authFetch.ts
const API_BASE = '/api/v1';
// authFetch.ts interceptor auto-injects Authorization: Bearer <window.__JSK_ADMIN_AUTH_TOKEN__>
// for any /api/v1/admin/* request. So plain fetch() is correct:
const res = await fetch(`${API_BASE}/admin/rich-menus/aliases`);   // token added automatically
```

### FRONTEND_ACTION_DROPDOWN
```tsx
// SOURCE: frontend/app/admin/rich-menus/new/page.tsx:440-447,264-282
<select value={actions[i]?.type || 'uri'} onChange={(e) => handleActionChange(i, 'type', e.target.value)}>
  <option value="uri">Open URL</option>
  <option value="message">Send Msg</option>
  {/* ADD: <option value="richmenuswitch">สลับเมนู</option> */}
</select>
// handleActionChange already special-cases object_id/intent_name → add a case for 'richMenuAliasId'
```

---

## Files to Change

| File | Action | Justification |
|---|---|---|
| `backend/app/schemas/rich_menu.py` | UPDATE | RichMenuAreaAction: Literal type + richMenuAliasId + model_validator; alias/user schemas |
| `backend/app/models/rich_menu_alias.py` | CREATE | RichMenuAlias model |
| `backend/app/models/user_rich_menu_link.py` | CREATE | UserRichMenuLink model |
| `backend/app/db/base.py` (or models `__init__`) | UPDATE | import new models so Alembic + mapper see them |
| `backend/alembic/versions/<new>_richmenu_alias_peruser.py` | CREATE | 2 tables (FK RESTRICT) + upgrade/downgrade |
| `backend/app/services/rich_menu_service.py` | UPDATE | alias CRUD + per-user link/unlink/get + bulk methods |
| `backend/app/api/v1/endpoints/rich_menus.py` | UPDATE | alias + per-user + bulk endpoints + DELETE guard + dependencies endpoint |
| `frontend/app/admin/rich-menus/new/page.tsx` | UPDATE | richmenuswitch option + alias dropdown (fetch) + guards |
| `frontend/app/admin/rich-menus/[id]/edit/page.tsx` | UPDATE | action editor (incl richmenuswitch) |
| `frontend/app/admin/rich-menus/page.tsx` | UPDATE | tab "Aliases" + badge "X users" + delete-guard UX |
| `frontend/app/admin/rich-menus/aliases/*` (or component) | CREATE | alias CRUD UI |
| `frontend/app/admin/friends/...` (per-user UI) | UPDATE | "กำหนด rich menu" + assignment display |
| `backend/tests/...` + `frontend/...test` | CREATE | validator/guard/service + UI tests |

## NOT Building
- เปลี่ยน RichMenuService → LINE SDK (คง raw httpx)
- Auto-assign ตาม segment/role (manual + bulk เท่านั้น)
- Analytics การกดสลับเมนู
- Flow อัปเดตรูปผ่าน re-point alias
- UI เตือน alias ใกล้ limit 1000
- เพิ่ม auth ให้ endpoint เดิม (มีครบแล้ว — แค่ verify)

---

## Step-by-Step Tasks

### Phase 1 — Schema & Validation Fix

#### Task 1.1: แก้ RichMenuAreaAction (ปิดบั๊ก richmenuswitch)
- **ACTION**: แก้ `backend/app/schemas/rich_menu.py`
- **IMPLEMENT**: เปลี่ยน `type: str` → `type: Literal["uri","message","postback","datetimepicker","richmenuswitch"]`; เพิ่ม `richMenuAliasId: Optional[str] = None`; `data: Optional[str] = None` (คงเดิม); เพิ่ม `@model_validator(mode="after")` ที่ถ้า `type=="richmenuswitch"` แล้ว `richMenuAliasId` ว่าง → `raise ValueError`. **อย่า** require `data`
- **MIRROR**: schema ใน `rich_menu.py:24-30` (เพิ่ม import `Literal` จาก typing, `model_validator` จาก pydantic)
- **IMPORTS**: `from typing import Literal`; `from pydantic import model_validator`
- **GOTCHA**: pydantic v2 (ไฟล์ใช้ `ConfigDict` แล้ว). `RichMenuAreaAction` ใช้ **input path เท่านั้น** (`rich_menus.py:72,92` `area.model_dump`) — GET คืน config เป็น raw dict ไม่ผ่าน validator → record เก่าไม่พัง
- **VALIDATE**: `richmenuswitch` ไม่มี aliasId → 422; มี aliasId (ไม่มี data) → ผ่าน

#### Task 1.2: Format validators (alias_id, userId)
- **ACTION**: เพิ่ม schemas สำหรับ alias + per-user ใน `rich_menu.py`
- **IMPLEMENT**: `RichMenuAliasCreate{alias_id, rich_menu_id}`, `RichMenuAliasResponse`, `UserRichMenuLinkCreate{...}`, `BulkLinkRequest{rich_menu_id, user_ids: List[str]}`, `BulkUnlinkRequest{user_ids: List[str]}`. ใส่ `Field(pattern=r"^[a-zA-Z0-9_-]{1,50}$")` บน alias_id; userId `Field(pattern=r"^U[0-9a-f]{32}$")`; `user_ids: List[...] = Field(max_length=500)`
- **MIRROR**: schema style ใน `rich_menu.py` (BaseModel + ConfigDict)
- **GOTCHA**: bulk unlink request **ไม่มี** rich_menu_id (LINE spec)
- **VALIDATE**: alias_id/userId ผิด format → 422; user_ids > 500 → 422

### Phase 2 — DB Models & Migration

#### Task 2.1: สร้าง 2 models
- **ACTION**: CREATE `backend/app/models/rich_menu_alias.py` + `user_rich_menu_link.py`
- **IMPLEMENT**:
  - `RichMenuAlias`: id PK, `alias_id String unique index`, `rich_menu_id Integer ForeignKey("rich_menus.id", ondelete="RESTRICT") index`, `sync_status String default "PENDING"`, `last_synced_at`, `last_sync_error Text`, timestamps
  - `UserRichMenuLink`: id PK, `line_user_id String(50) unique index`, `rich_menu_id Integer ForeignKey("rich_menus.id", ondelete="RESTRICT") index`, `linked_at`, `last_sync_error Text`, timestamps
- **MIRROR**: MODEL_PATTERN + FK_PATTERN (chat_session.py line_user_id String(50))
- **IMPORTS**: `from sqlalchemy import Column, Integer, String, DateTime, Text, ForeignKey`; `from sqlalchemy.sql import func`; `from app.db.base import Base`
- **GOTCHA**: ต้อง import models ใหม่ใน `app/db/base.py` (หรือ models `__init__`) ไม่งั้น Alembic autogenerate มองไม่เห็น + mapper error. timestamps ใช้ `server_default=func.now()` + `onupdate=func.now()` (ตาม rich_menus)
- **VALIDATE**: `python -c "from app.models.rich_menu_alias import RichMenuAlias"` ไม่ error

#### Task 2.2: Alembic migration (up + down)
- **ACTION**: CREATE migration
- **IMPLEMENT**: `op.create_table` 2 ตาราง (FK `ondelete='RESTRICT'`, unique constraints, indexes); `downgrade()` drop ทั้งสอง (drop `user_rich_menu_links` ก่อน). ใช้ defensive existence check
- **MIRROR**: MIGRATION_PATTERN
- **GOTCHA**: ตั้ง `down_revision` = head ปัจจุบัน — รัน `cd backend && python scripts/db_target.py alembic --target local current` ก่อน แล้วใส่ค่า. อย่า autogenerate ทับ migration อื่น
- **VALIDATE**: `python scripts/db_target.py alembic --target local upgrade head` แล้ว `downgrade -1` แล้ว `upgrade head` — สำเร็จทั้งคู่

### Phase 3 — Backend: Alias Service + API

#### Task 3.1: Alias service methods
- **ACTION**: UPDATE `rich_menu_service.py`
- **IMPLEMENT**: `create_alias_on_line(db, alias_id, line_rich_menu_id)` → `POST {API_BASE}/richmenu/alias` body `{"richMenuAliasId","richMenuId"}`; `update_alias_on_line` → `POST {API_BASE}/richmenu/alias/{aliasId}`; `delete_alias_on_line` → `DELETE {API_BASE}/richmenu/alias/{aliasId}` (404-safe); `list_aliases_from_line` → `GET {API_BASE}/richmenu/alias/list`. ทุกตัว update DB cache + sync_status
- **MIRROR**: SERVICE_PATTERN (httpx.AsyncClient, get_client_headers, raise_for_status)
- **GOTCHA**: alias ต้องชี้ `line_rich_menu_id` (string ของ LINE) ไม่ใช่ local id — ถ้า rich_menu ยังไม่ synced (line_rich_menu_id IS NULL) ห้ามสร้าง alias → ให้ service raise. delete alias rate 100/hr
- **VALIDATE**: unit test (mock httpx) เรียกถูก URL/body

#### Task 3.2: Alias endpoints
- **ACTION**: UPDATE `rich_menus.py`
- **IMPLEMENT**: `POST/GET/PUT/DELETE /admin/rich-menus/aliases[/{alias_id}]` ทุกตัว `Depends(require_permission(KEY_MANAGE_RICH_MENUS))` (GET ใช้ get_current_admin ก็ได้)
- **MIRROR**: ENDPOINT_PATTERN
- **IMPORTS**: (มีแล้ว) get_current_admin, require_permission, KEY_MANAGE_RICH_MENUS
- **GOTCHA**: **route ordering** — register literal `/aliases` **ก่อน** `/{id:int}` (มี `GET /{id}` อยู่) ไม่งั้น FastAPI พยายาม cast "aliases"→int. ทางเลือก: แยก sub-router. ทดสอบก่อน merge
- **VALIDATE**: `GET /admin/rich-menus/aliases` คืน list (ไม่ 422 จาก `/{id}`)

### Phase 4 — Backend: Per-User Service + API

#### Task 4.1: Per-user service methods
- **ACTION**: UPDATE `rich_menu_service.py`
- **IMPLEMENT**: `link_to_user(db, line_user_id, line_rich_menu_id)` → `POST {API_BASE}/user/{userId}/richmenu/{lineId}`; `unlink_from_user` → `DELETE {API_BASE}/user/{userId}/richmenu`; `get_user_rich_menu` → `GET {API_BASE}/user/{userId}/richmenu`; `bulk_link` → `POST {API_BASE}/richmenu/bulk/link` body `{"richMenuId","userIds"}`; `bulk_unlink` → `POST {API_BASE}/richmenu/bulk/unlink` body `{"userIds"}`. update cache `user_rich_menu_links`
- **MIRROR**: SERVICE_PATTERN + set_default_on_line (รูปแบบ POST /user/...)
- **GOTCHA**: LINE คืน 200 แม้ user block/ไม่ใช่ friend (ไม่เห็นเมนู) — บันทึก cache ตามที่ส่ง. unlink = hard delete row
- **VALIDATE**: unit test เรียกถูก endpoint

#### Task 4.2: Per-user endpoints + guards
- **ACTION**: UPDATE `rich_menus.py`
- **IMPLEMENT**: `POST/DELETE/GET /admin/rich-menus/{id}/users/{user_id}` + `POST /admin/rich-menus/{id}/users/bulk-link` + `/bulk-unlink`. **Guards**: (1) โหลด rich_menu, ถ้า `line_rich_menu_id IS NULL` → `HTTPException(409, "Rich menu must be synced before linking")`; (2) IDOR — query `users`/friends ด้วย line_user_id, ไม่พบ → `HTTPException(404)`; (3) bulk validate ทุก userId + max 500. ทุก route `require_permission(KEY_MANAGE_RICH_MENUS)`
- **MIRROR**: ENDPOINT_PATTERN + HTTPException ใน DELETE endpoint (`rich_menus.py:205-224`)
- **GOTCHA**: ต้องหาตารางที่เก็บ line_user_id ของ friends/users (เช็ค `app/models/user.py` + friend_event/friends model) เพื่อทำ IDOR check
- **VALIDATE**: link เมนูยังไม่ synced → 409; userId มั่ว → 404; link สำเร็จ → GET คืน id

### Phase 5 — Frontend: Switch Action UI

#### Task 5.1: richmenuswitch ใน wizard + alias dropdown
- **ACTION**: UPDATE `new/page.tsx`
- **IMPLEMENT**: เพิ่ม `<option value="richmenuswitch">สลับเมนู</option>`; เมื่อเลือก → แสดง alias dropdown ที่ fetch จาก `GET /admin/rich-menus/aliases` (เพิ่ม state + useEffect แบบเดียวกับ reply-objects); เพิ่ม case ใน `handleActionChange` สำหรับ `richMenuAliasId`; empty state ("ยังไม่มี alias — สร้างก่อน" + link); guard เตือนถ้าเมนูยังไม่ synced
- **MIRROR**: FRONTEND_ACTION_DROPDOWN + FRONTEND_FETCH_PATTERN + fetch reply-objects (`new/page.tsx:248-262`)
- **GOTCHA**: ใช้ plain `fetch()` — authFetch inject token ให้เอง (อย่าใส่ Authorization เอง). alias dropdown ต้อง fetch (ไม่ใช่ free-text)
- **VALIDATE**: เลือก richmenuswitch → เห็น alias dropdown มีรายการจริง

#### Task 5.2: Edit page action editor
- **ACTION**: UPDATE `[id]/edit/page.tsx`
- **IMPLEMENT**: เพิ่ม action editor (ปัจจุบันไม่มี) ให้แก้ type/uri/text/richMenuAliasId ต่อ area; ส่งใน PUT payload
- **MIRROR**: action UI จาก `new/page.tsx`; PUT pattern เดิมของ edit page
- **GOTCHA**: bounds key edit page ใช้ `{w,h}` (จาก DB) ต่างจาก create `{width,height}` (ดู skill rule #3) — คงคีย์ของแต่ละหน้า
- **VALIDATE**: แก้ alias ปลายทางจาก edit page → PUT สำเร็จ

### Phase 6 — Frontend: Alias mgmt + Per-User UI

#### Task 6.1: Alias management UI
- **ACTION**: CREATE tab/section "Aliases" ในหน้า rich-menus
- **IMPLEMENT**: list aliases (GET) + create (เลือก rich menu ที่ synced + alias_id) + edit (re-point) + delete; ใช้ AdminTable pattern เดิม
- **MIRROR**: list pattern (`rich-menus/page.tsx:39-55`) + FRONTEND_FETCH_PATTERN
- **VALIDATE**: สร้าง alias → ปรากฏใน list + ใช้ใน dropdown (Task 5.1) ได้

#### Task 6.2: Per-user assignment UI
- **ACTION**: UPDATE friends/users page (primary entry) + badge ใน rich-menus list
- **IMPLEMENT**: ปุ่ม/modal "กำหนด rich menu" ต่อ user → POST link; แสดง assignment ปัจจุบัน + ปุ่มยกเลิก (DELETE); rich-menus list แสดง badge "X users"; info banner/tooltip ว่า per-user ทับ default; (Should) bulk select (checkbox single-page, max 500, confirm, toast)
- **MIRROR**: modal/table pattern ที่ใช้ในหน้า friends/users + FRONTEND_FETCH_PATTERN
- **GOTCHA**: primary entry = friends page; centralized view = Could (ทำทีหลังได้)
- **VALIDATE**: กำหนดเมนูให้ user → ผู้ใช้เห็นเมนูเฉพาะ; ยกเลิก → กลับ default

### Phase 7 — Delete Guard & Auth Verify

#### Task 7.1: DELETE guard + dependencies endpoint
- **ACTION**: UPDATE `rich_menus.py` DELETE + เพิ่ม `GET /{id}/dependencies`
- **IMPLEMENT**: ก่อนลบ — query alias/link ที่ชี้ rich_menu_id นี้; ถ้ามี → `HTTPException(409, detail={aliases:[...], users: N})`. `GET /{id}/dependencies` คืนรายการให้ frontend แสดงก่อน confirm. (FK RESTRICT เป็น safety net ระดับ DB)
- **MIRROR**: DELETE endpoint เดิม (`rich_menus.py:205-224`)
- **VALIDATE**: ลบเมนูที่มี alias/link → 409 + รายการ

#### Task 7.2: Verify auth coverage
- **ACTION**: ตรวจ endpoint ใหม่ทุกตัวมี `require_permission(KEY_MANAGE_RICH_MENUS)` (หรือ get_current_admin บน read)
- **VALIDATE**: เรียก endpoint ใหม่ไม่มี token → 401; role AGENT → 403

### Phase 8 — Tests + E2E

#### Task 8.1: Backend unit tests
- **ACTION**: CREATE tests
- **IMPLEMENT**: validator (richmenuswitch ไม่มี aliasId → 422; alias_id/userId format), guards (409 synced, 404 IDOR), service methods (mock httpx → assert URL/body)
- **MIRROR**: test pattern ที่มีใน `backend/tests/` (หา conftest + async test style)
- **VALIDATE**: `cd backend && python -m pytest` ผ่าน

#### Task 8.2: Frontend + E2E
- **ACTION**: unit test logic ที่แตะ + manual E2E
- **Pre-condition**: ยืนยัน test LINE OA + token valid + device + ผู้รับผิดชอบ; ถ้าไม่มี → integration test (mock) + device test out-of-scope MVP
- **VALIDATE**: `cd frontend && npx tsc --noEmit && npm run lint && npx vitest run`; manual: สร้าง A↔B → กดสลับบนมือถือ; กำหนด per-user → เห็นเมนูเฉพาะ

---

## Testing Strategy

### Unit Tests
| Test | Input | Expected | Edge? |
|---|---|---|---|
| validator richmenuswitch | type=richmenuswitch, no aliasId | 422 | ✓ |
| validator richmenuswitch | aliasId ok, no data | pass | ✓ |
| validator alias_id format | "bad id!" | 422 | ✓ |
| validator userId | not U+32hex | 422 | ✓ |
| link guard synced | rich_menu.line_rich_menu_id=None | 409 | ✓ |
| link guard IDOR | unknown line_user_id | 404 | ✓ |
| bulk size | 501 userIds | 422 | ✓ |
| create_alias_on_line | config | POST correct URL/body | |
| delete alias | 404 from LINE | swallowed | ✓ |

### Edge Cases Checklist
- [ ] richmenuswitch ไม่มี aliasId → 422 (ไม่พังเงียบ)
- [ ] link เมนูที่ยังไม่ synced → 409
- [ ] link userId ที่ไม่มีในระบบ → 404
- [ ] ลบเมนูที่มี alias/link → 409
- [ ] alias dropdown ว่าง → empty state
- [ ] bulk > 500 → 422
- [ ] user block OA → LINE 200, cache บันทึก, UI note
- [ ] route `/aliases` ไม่ชน `/{id}`
- [ ] migration downgrade ผ่าน

---

## Validation Commands

### Static Analysis (frontend)
```bash
cd frontend && npx tsc --noEmit && npm run lint
```
EXPECT: zero type/lint errors

### Unit Tests (backend)
```bash
cd backend && python -m pytest
```
EXPECT: all pass (รันใน WSL, venv_linux)

### Unit Tests (frontend — CI ไม่รัน vitest ต้องรันเอง)
```bash
cd frontend && npx vitest run
```
EXPECT: all pass

### Database Migration
```bash
cd backend && python scripts/db_target.py alembic --target local current   # get head for down_revision
cd backend && python scripts/db_target.py alembic --target local upgrade head
cd backend && python scripts/db_target.py alembic --target local downgrade -1
cd backend && python scripts/db_target.py alembic --target local upgrade head
```
EXPECT: up + down + up สำเร็จ

### Build
```bash
cd frontend && npm run build
```
EXPECT: build ผ่าน (tsc + next build)

### Manual Validation
- [ ] สร้างเมนู A,B → sync → สร้าง alias-a,alias-b → ตั้ง richmenuswitch ไขว้ → publish A → กดสลับบนมือถือ A↔B ได้
- [ ] friends page: กำหนดเมนูให้ user → user เห็นเมนูเฉพาะ → ยกเลิก → กลับ default
- [ ] ลบเมนูที่มี alias ชี้อยู่ → 409 + แจ้ง dependency

---

## Acceptance Criteria
- [ ] ทุก task เสร็จ
- [ ] validation commands ผ่านทั้งหมด
- [ ] tests เขียนแล้วและผ่าน
- [ ] ไม่มี type/lint error
- [ ] ตรง UX design
- [ ] migration up+down ผ่าน local + remote

## Completion Checklist
- [ ] ตาม pattern ที่ค้นพบ (model/service/endpoint/migration/fetch)
- [ ] error handling ตาม HTTPException style เดิม
- [ ] endpoint ใหม่มี require_permission ครบ
- [ ] frontend ใช้ plain fetch (authFetch inject ให้)
- [ ] ไม่มี hardcoded token/URL (ใช้ API_BASE + SettingsService)
- [ ] route ordering /aliases ก่อน /{id}
- [ ] ไม่มี scope เกิน NOT Building
- [ ] self-contained — ไม่ต้องถามเพิ่มตอน implement

## Risks
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| route /aliases ชน /{id} | M | M | register ก่อน /{id} หรือ sub-router + test |
| down_revision ผิด head | M | M | รัน alembic current ก่อนเขียน migration |
| ไม่มี test LINE OA สำหรับ E2E | M | M | integration test (mock) + device test out-of-scope MVP |
| IDOR check หา friends table ไม่เจอ | L | M | อ่าน app/models/user.py + friend models ก่อน Phase 4 |
| FK RESTRICT block downgrade ถ้ามีข้อมูล | L | M | downgrade drop child ก่อน (user_rich_menu_links → rich_menu_aliases) |

## Notes
- **R1/R2 split (จาก PRD):** ทำ Phase 1-3 + 5(switch) + 7-8 = R1 (Feature A, แก้บั๊ก) ก่อนได้; Phase 4 + 6(per-user) = R2. ถ้าทำรวดเดียวก็ได้ตาม dependency
- **Auth มีอยู่แล้ว** (verified) — Phase 7.2 แค่ verify ไม่ใช่เพิ่มใหม่
- frontend fetch ไม่ต้องแตะเรื่อง auth (authFetch.ts จัดการ) — ลดงาน Phase 5/6
- dev รันใน WSL (venv_linux, npm/npx ผ่าน WSL)
