# Plan: Rich Menu Tab Switching + Per-User Assignment (all phases)

> **Status: REVISED (2026-06-20)** — ผ่านรีวิวคณะ 6 ผู้เชี่ยวชาญ (backend-impl / LINE-API / migration-DB / frontend-impl / security / completeness) verify เทียบโค้ดจริง. Verdict เดิม NEEDS_REVISION (confidence 6) → แก้ครบ 12 edits → คาด confidence ~8-9. ดู "Plan Review History" ท้ายไฟล์

## Summary
เพิ่ม LINE Rich Menu (A) **สลับเมนูแบบแท็บ** (alias + `richmenuswitch`) และ (B) **กำหนดเมนูตามผู้ใช้ (per-user)** บนสถาปัตยกรรม `RichMenuService` เดิม (raw httpx + token จาก DB) + 2 ตาราง cache + แก้ schema validator ที่ทำให้ `richmenuswitch` พังเงียบ.

## User Story
As an **admin/super-admin ผู้ดูแล LINE OA**, I want **สร้างชุดเมนูที่สลับกันได้แบบแท็บ และกำหนดเมนูเฉพาะผู้ใช้บางคน**, so that **ออกแบบ LINE OA experience ได้หลายชั้นและเฉพาะกลุ่ม**.

## Problem → Solution
สร้าง rich menu ได้แต่ใช้ได้แค่ "เมนูเดียวทุกคน" + `richmenuswitch` พังเงียบ → เพิ่ม alias + per-user + แก้ validator → สลับเมนูได้ + ตั้งเมนูรายคนได้

## Metadata
- **Complexity**: XL (≈22 files)
- **Source PRD**: `.claude/PRPs/prds/rich-menu-switching-and-per-user.prd.md` (REVISED)
- **PRD Phase**: ALL (1–8)
- **Estimated Files**: ~22

---

## UX Design

### Before
```
rich-menus: list / create wizard (action = uri|message) / edit (แก้ name+รูป, แก้ action ไม่ได้)
publish = default ทุกคนเท่านั้น; ไม่มี alias/per-user
```
### After
```
wizard+edit: action เพิ่ม "สลับเมนู (richmenuswitch)" → เลือก alias (fetch จาก backend)
rich-menus เพิ่ม tab "Aliases"; friends page เพิ่ม "กำหนด rich menu" ต่อ user (+ badge "X users")
ลบเมนูที่มี alias/link ชี้อยู่ → 409 + dependency list
```

### Interaction Changes
| Touchpoint | Before | After | Notes |
|---|---|---|---|
| Area action | uri, message | + richmenuswitch (+ alias dropdown) | alias ต้อง synced ก่อน |
| rich-menus page | list | + tab "Aliases" | alias CRUD |
| friends page | — | + "กำหนด rich menu" | per-user link/unlink |
| Delete menu | ลบเลย | 409 ถ้ามี dependency | FK RESTRICT + guard |
| Priority | default ทุกคน | per-user > default (สื่อสารใน UI) | tooltip/banner |

---

## Mandatory Reading

| Priority | File | Lines | Why |
|---|---|---|---|
| P0 | `backend/app/models/rich_menu.py` | 1-37 | model + sync_status pattern |
| P0 | `backend/app/schemas/reply_object.py` | 34-37,53-58 | **model_validator(mode='after') + return self** ตัวอย่างจริง |
| P0 | `backend/app/services/rich_menu_service.py` | 1-205 | httpx/token pattern + จุดเพิ่ม method |
| P0 | `backend/app/api/v1/endpoints/rich_menus.py` | 1-224 | endpoint + auth + PUT/{id} (template_type required) |
| P0 | `backend/app/schemas/rich_menu.py` | 1-64 | RichMenuAreaAction + RichMenuCreate |
| P0 | `backend/app/models/__init__.py` | all | **ที่ register model** (env.py:35 import นี่) |
| P0 | `backend/app/models/user.py` | ~43 | `User.line_user_id` (nullable) สำหรับ IDOR check |
| P1 | `backend/app/core/permissions.py` | 48-109 | KEY_MANAGE_RICH_MENUS (มีแล้ว) |
| P1 | `backend/app/api/deps.py` | 109-204 | get_current_admin / require_permission |
| P1 | `backend/app/models/chat_session.py` | 1-40 | ForeignKey + line_user_id String(50) |
| P1 | `backend/alembic/versions/add_sync_status_to_rich_menus.py` | 1-46 | migration style (per-item guard + downgrade) |
| P1 | `frontend/app/admin/rich-menus/new/page.tsx` | 209,248-342,440-447 | action dropdown + fetch + payload + MenuAction interface |
| P1 | `frontend/app/admin/rich-menus/[id]/edit/page.tsx` | 13-21,97-102 | action interface + PUT payload (latent bug) |
| P1 | `frontend/lib/authFetch.ts` | 1-187 | auto-token (rich-menus pages) |
| P2 | `frontend/app/admin/friends/*` | — | per-user entry; ใช้ useAuth() manual authHeaders |
| P2 | `backend/scripts/db_target.py` | — | alembic dual-target |

## External Documentation
| Topic | Source | Key Takeaway |
|---|---|---|
| Alias CRUD | LINE ref | create `POST /richmenu/alias`, **update `PUT /richmenu/alias/{id}`**, delete `DELETE`, list `GET /richmenu/alias/list` (คืน `{"aliases":[...]}`); alias ≤1000/OA; delete 100/hr |
| richmenuswitch | LINE ref | `{"type":"richmenuswitch","richMenuAliasId":"..." (required),"data":"..." (optional)}` |
| Per-user | LINE ref | `POST/DELETE/GET /user/{userId}/richmenu/{richMenuId}` (ใช้ **line_rich_menu_id** string); bulk `POST /richmenu/bulk/{link,unlink}` body `{"richMenuId","userIds"}` / `{"userIds"}` (≤500) |
| userId format | LINE ref | `^U[0-9a-f]{32}$` = U + 32 lowercase hex (total 33 chars) |

---

## Patterns to Mirror

### MODEL_PATTERN (+ sync_status)
```python
# SOURCE: backend/app/models/rich_menu.py:1-37
from sqlalchemy import Column, Integer, String, DateTime, Text, ForeignKey
from sqlalchemy.sql import func
from app.db.base import Base

class X(Base):
    sync_status = Column(String, default="PENDING")  # PENDING/SYNCED/FAILED
    last_synced_at = Column(DateTime(timezone=True), nullable=True)
    last_sync_error = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
```

### VALIDATOR_PATTERN (Pydantic v2 — MUST return self)
```python
# SOURCE: backend/app/schemas/reply_object.py:34-37,53-58 (verified มี return self จริง)
from pydantic import model_validator
@model_validator(mode="after")
def _validate(self):
    if self.type == "richmenuswitch" and not self.richMenuAliasId:
        raise ValueError("richMenuAliasId is required for richmenuswitch action")
    return self    # ← ขาดไม่ได้ ไม่งั้น reject ทุก input
```

### FK_PATTERN (line_user_id + ondelete)
```python
# SOURCE: backend/app/models/chat_session.py:1-40
line_user_id = Column(String(50), nullable=False, index=True)  # U + 32 hex (total 33)
# NEW: ForeignKey("rich_menus.id", ondelete="RESTRICT")
```

### SERVICE_PATTERN (httpx + token)
```python
# SOURCE: backend/app/services/rich_menu_service.py:1-60
class RichMenuService:
    API_BASE = "https://api.line.me/v2/bot"
    @staticmethod
    async def get_client_headers(db) -> Dict[str, str]:
        token = await SettingsService.get_setting(db, "LINE_CHANNEL_ACCESS_TOKEN")
        return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    @staticmethod
    async def create_on_line(db, cfg) -> str:
        headers = await RichMenuService.get_client_headers(db)
        async with httpx.AsyncClient() as client:
            r = await client.post(f"{RichMenuService.API_BASE}/richmenu", headers=headers, json=cfg)
            r.raise_for_status()
            return r.json()["richMenuId"]
# list pattern: return r.json().get("aliases", [])   (mirror .get("richmenus",[]) ที่ :85)
```

### ENDPOINT_PATTERN (+ auth)
```python
# SOURCE: backend/app/api/v1/endpoints/rich_menus.py:1-106
from app.api.deps import get_current_admin, require_permission
from app.core.permissions import KEY_MANAGE_RICH_MENUS
@router.get("", response_model=List[RichMenuResponse])
async def list_rich_menus(db=Depends(get_db), current_admin: User = Depends(get_current_admin)): ...
@router.post("", response_model=RichMenuResponse)
async def create(data: RichMenuCreate, db=Depends(get_db),
        current_admin: User = Depends(require_permission(KEY_MANAGE_RICH_MENUS))): ...
```

### MIGRATION_PATTERN (per-table guard + downgrade)
```python
# SOURCE: backend/alembic/versions/add_sync_status_to_rich_menus.py (per-item guard)
from alembic import op
import sqlalchemy as sa
revision = 't0u1v2w3x4y5'          # hex-prefixed (match repo style)
down_revision = '<CURRENT_HEAD>'   # GOTCHA: คาด s9t0u1v2w3x4 — ยืนยันด้วย: db_target.py alembic current
branch_labels = None; depends_on = None

def _has_table(conn, name):
    return conn.execute(sa.text(
        "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = :n)"
    ), {"n": name}).scalar()

def upgrade() -> None:
    conn = op.get_bind()
    if not _has_table(conn, 'rich_menu_aliases'):
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
    if not _has_table(conn, 'user_rich_menu_links'):     # อิสระจาก guard แรก (กัน partial-apply)
        op.create_table('user_rich_menu_links',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('line_user_id', sa.String(length=50), nullable=False),
            sa.Column('rich_menu_id', sa.Integer(), nullable=False),
            sa.Column('sync_status', sa.String(), nullable=False, server_default='PENDING'),
            sa.Column('last_synced_at', sa.DateTime(timezone=True), nullable=True),
            sa.Column('last_sync_error', sa.Text(), nullable=True),
            sa.Column('linked_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
            sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
            sa.ForeignKeyConstraint(['rich_menu_id'], ['rich_menus.id'], ondelete='RESTRICT'),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('line_user_id'),
        )
        op.create_index(op.f('ix_user_rich_menu_links_line_user_id'), 'user_rich_menu_links', ['line_user_id'])

def downgrade() -> None:
    op.drop_table('user_rich_menu_links')   # child ก่อน (ปลอดภัย — RESTRICT block DELETE บน parent rows ไม่ใช่ DROP TABLE)
    op.drop_table('rich_menu_aliases')
```

### FRONTEND_FETCH_PATTERN (รู้ความต่าง 2 หน้า)
```typescript
// rich-menus pages: authFetch.ts interceptor inject token อัตโนมัติ → plain fetch พอ
const res = await fetch(`/api/v1/admin/rich-menus/aliases`);
// friends page: ใช้ useAuth() + manual authHeaders ตามแบบไฟล์เดิม (ไม่ใช่ global interceptor)
// SOURCE: frontend/lib/authFetch.ts:1-187 + frontend/app/admin/friends/*
```

### FRONTEND_ACTION_DROPDOWN (+ interface ต้องขยาย)
```tsx
// SOURCE: frontend/app/admin/rich-menus/new/page.tsx:440-447,264-282
// 1) ขยาย interface (ไม่งั้น tsc fail):
//    MenuAction.type: 'uri' | 'message' | 'richmenuswitch';  richMenuAliasId?: string;
<select value={actions[i]?.type || 'uri'} onChange={(e)=>handleActionChange(i,'type',e.target.value)}>
  <option value="uri">Open URL</option>
  <option value="message">Send Msg</option>
  <option value="richmenuswitch">สลับเมนู</option>
</select>
```

---

## Files to Change
| File | Action | Justification |
|---|---|---|
| `backend/app/schemas/rich_menu.py` | UPDATE | RichMenuAreaAction (Literal+richMenuAliasId+validator return self); RichMenuUpdate; alias/user/bulk schemas |
| `backend/app/models/rich_menu_alias.py` | CREATE | RichMenuAlias model |
| `backend/app/models/user_rich_menu_link.py` | CREATE | UserRichMenuLink model (sync_status + linked_at) |
| `backend/app/models/__init__.py` | UPDATE | import 2 models ใหม่ (env.py:35 import นี่) |
| `backend/alembic/versions/<hex>_richmenu_alias_peruser.py` | CREATE | 2 ตาราง (per-table guard, FK RESTRICT, unique) up+down |
| `backend/app/services/rich_menu_service.py` | UPDATE | alias CRUD (update=PUT) + per-user + bulk (json body) |
| `backend/app/api/v1/endpoints/rich_menus.py` | UPDATE | alias + per-user + bulk endpoints + DELETE guard + /dependencies (auth) |
| `frontend/app/admin/rich-menus/new/page.tsx` | UPDATE | richmenuswitch + alias dropdown + ขยาย MenuAction interface |
| `frontend/app/admin/rich-menus/[id]/edit/page.tsx` | UPDATE | action editor (~100 บรรทัด) + ขยาย interface |
| `frontend/app/admin/rich-menus/page.tsx` | UPDATE | tab "Aliases" + badge "X users" + delete-guard UX |
| `frontend/app/admin/rich-menus/aliases/*` | CREATE | alias CRUD UI |
| `frontend/app/admin/friends/...` | UPDATE | "กำหนด rich menu" (useAuth authHeaders) |
| `backend/tests/...`, `frontend/...test` | CREATE | validator/guard/service (httpx mock) + UI |

## NOT Building
- LINE SDK (คง raw httpx) · auto-assign segment · analytics สลับเมนู · re-point alias สำหรับอัปเดตรูป · UI เตือน alias ใกล้ 1000 · เพิ่ม auth ให้ endpoint เดิม (มีแล้ว)

---

## Step-by-Step Tasks

### Phase 1 — Schema & Validation Fix

#### Task 1.1: RichMenuAreaAction validator (ปิดบั๊ก richmenuswitch)
- **ACTION**: แก้ `backend/app/schemas/rich_menu.py`
- **IMPLEMENT**: `type: Literal["uri","message","postback","datetimepicker","richmenuswitch"]`; เพิ่ม `richMenuAliasId: Optional[str] = None`; คง `data: Optional[str] = None`; เพิ่ม validator:
  ```python
  @model_validator(mode="after")
  def _validate_richmenuswitch(self):
      if self.type == "richmenuswitch" and not self.richMenuAliasId:
          raise ValueError("richMenuAliasId is required for richmenuswitch action")
      return self
  ```
- **MIRROR**: VALIDATOR_PATTERN (reply_object.py:34-37,53-58)
- **IMPORTS**: `from typing import Literal`; `from pydantic import model_validator`
- **GOTCHA**: **ต้องมี `return self`** ไม่งั้น Pydantic v2 reject ทุก input. **อย่า** require `data`. RichMenuAreaAction ใช้ input path เท่านั้น (GET คืน raw dict) → record เก่าไม่พัง
- **VALIDATE**: richmenuswitch ไม่มี aliasId → 422; มี aliasId (ไม่มี data) → ผ่าน; uri/message เดิม → ผ่าน

#### Task 1.2: Alias/user/bulk schemas + format validators
- **ACTION**: เพิ่ม schemas ใน `rich_menu.py`
- **IMPLEMENT**: `RichMenuAliasCreate{alias_id, rich_menu_id}`, `RichMenuAliasResponse`, `RichMenuUpdate{name, chat_bar_text, areas}` (สำหรับ PUT — ดู Task 5.2), `BulkLinkRequest{rich_menu_id, user_ids}`, `BulkUnlinkRequest{user_ids}`.
  - `alias_id: str = Field(pattern=r"^[a-zA-Z0-9_-]{1,50}$")`
  - userId fields: `Field(pattern=r"^U[0-9a-f]{32}$")`  (U + 32 hex = 33 ตัว)
  - `user_ids: Annotated[List[str], Field(min_length=1, max_length=500)]`
- **MIRROR**: schema style + VALIDATOR_PATTERN
- **IMPORTS**: `from typing import Annotated, List`
- **GOTCHA**: **`Field(max_length=500)` บน `List[str]` ตรงๆ ถูก Pydantic v2 ignore เงียบ** — ต้องใช้ `Annotated[List[str], Field(max_length=500)]` (หรือ `@field_validator`). bulk unlink **ไม่มี** rich_menu_id
- **VALIDATE**: alias_id/userId format ผิด → 422; user_ids 501 ตัว → 422

### Phase 2 — DB Models & Migration

#### Task 2.1: 2 models + register
- **ACTION**: CREATE `rich_menu_alias.py` + `user_rich_menu_link.py`; UPDATE `app/models/__init__.py`
- **IMPLEMENT**:
  - `RichMenuAlias`: id PK; `alias_id String unique index`; `rich_menu_id Integer ForeignKey("rich_menus.id", ondelete="RESTRICT") index`; `sync_status String default "PENDING"`; `last_synced_at`; `last_sync_error Text`; `created_at/updated_at`
  - `UserRichMenuLink`: id PK; `line_user_id String(50) unique index`; `rich_menu_id ... ondelete="RESTRICT" index`; `sync_status String default "PENDING"`; `last_synced_at`; `last_sync_error Text`; `linked_at server_default=func.now()`; `updated_at onupdate=func.now()`
  - ใน `app/models/__init__.py`: `from .rich_menu_alias import RichMenuAlias` + `from .user_rich_menu_link import UserRichMenuLink`
- **MIRROR**: MODEL_PATTERN + FK_PATTERN
- **GOTCHA**: **register ที่ `app/models/__init__.py` เท่านั้น** (verified: `app/db/base.py` มีแค่ `Base = declarative_base()` 3 บรรทัด; `alembic/env.py:35` ใช้ `import app.models`). อย่า import ใน base.py (เสี่ยง circular). UserRichMenuLink ต้องมี `sync_status` ด้วย (track per-user state)
- **VALIDATE**: `python -c "import app.models; from app.db.base import Base; print([t for t in Base.metadata.tables])"` เห็น 2 ตารางใหม่

#### Task 2.2: Alembic migration (up + down)
- **ACTION**: CREATE migration
- **IMPLEMENT**: 2 ตาราง ตาม MIGRATION_PATTERN — **per-table existence guard อิสระ** (กัน partial-apply), `ondelete='RESTRICT'`, `UniqueConstraint('alias_id')` + `UniqueConstraint('line_user_id')`, indexes; `downgrade()` drop `user_rich_menu_links` ก่อน `rich_menu_aliases`
- **MIRROR**: MIGRATION_PATTERN
- **GOTCHA**: ตั้ง `down_revision` = head ปัจจุบัน — รัน `cd backend && python scripts/db_target.py alembic --target local current` (คาด `s9t0u1v2w3x4` — **ยืนยันก่อนใช้**). ใช้ revision id แบบ hex. **FK RESTRICT ไม่ block DROP TABLE** ของ child — downgrade ปลอดภัยไม่ต้อง pre-clear
- **VALIDATE**: `upgrade head` → `downgrade -1` → `upgrade head` สำเร็จ (local + remote)

### Phase 3 — Backend: Alias Service + API

#### Task 3.1: Alias service methods
- **ACTION**: UPDATE `rich_menu_service.py`
- **IMPLEMENT**:
  - `create_alias_on_line(db, alias_id, line_rich_menu_id)` → `client.post(f"{API_BASE}/richmenu/alias", json={"richMenuAliasId": alias_id, "richMenuId": line_rich_menu_id})`
  - `update_alias_on_line(db, alias_id, line_rich_menu_id)` → **`client.put(f"{API_BASE}/richmenu/alias/{alias_id}", json={"richMenuId": line_rich_menu_id})`**
  - `delete_alias_on_line(db, alias_id)` → `client.delete(...)` (404-safe)
  - `list_aliases_from_line(db)` → `client.get(f"{API_BASE}/richmenu/alias/list")` → `return r.json().get("aliases", [])`
  - ทุกตัว update DB cache + sync_status
- **MIRROR**: SERVICE_PATTERN (`.get("aliases",[])` mirror `:85`)
- **GOTCHA**: **update = PUT ไม่ใช่ POST** (POST → 404/405). alias ต้องชี้ `line_rich_menu_id` (string) — ถ้า rich_menu ยังไม่ synced ให้ raise. DELETE ไม่มี body — พิจารณา headers ไม่มี Content-Type. delete alias 100/hr → map 429 → `HTTPException(429, "ลบ alias ได้สูงสุด 100/hr")`. alias_id immutable (เปลี่ยนปลายทางได้ เปลี่ยนชื่อไม่ได้)
- **VALIDATE**: unit test เรียก PUT บน update; list extract aliases ถูก

#### Task 3.2: Alias endpoints (route ordering!)
- **ACTION**: UPDATE `rich_menus.py`
- **IMPLEMENT**: `POST/GET/PUT/DELETE /admin/rich-menus/aliases[/{alias_id}]` + `require_permission(KEY_MANAGE_RICH_MENUS)`
- **MIRROR**: ENDPOINT_PATTERN
- **GOTCHA**: register literal `/aliases` **ก่อน** `/{id:int}` (มี `GET /{id}`) ไม่งั้น FastAPI cast "aliases"→int. หรือแยก sub-router. ทดสอบก่อน merge
- **VALIDATE**: `GET /admin/rich-menus/aliases` คืน list (ไม่ 422)

### Phase 4 — Backend: Per-User Service + API

#### Task 4.1: Per-user service methods
- **ACTION**: UPDATE `rich_menu_service.py`
- **IMPLEMENT**: (ทุกตัวรับ `line_rich_menu_id: str` — ไม่ใช่ local id)
  - `link_to_user(db, line_user_id, line_rich_menu_id)` → `client.post(f"{API_BASE}/user/{line_user_id}/richmenu/{line_rich_menu_id}")`
  - `unlink_from_user(db, line_user_id)` → `client.delete(f"{API_BASE}/user/{line_user_id}/richmenu")`
  - `get_user_rich_menu(db, line_user_id)` → `client.get(...)`
  - `bulk_link(db, line_rich_menu_id, user_ids)` → `client.post(f"{API_BASE}/richmenu/bulk/link", json={"richMenuId": line_rich_menu_id, "userIds": user_ids})`
  - `bulk_unlink(db, user_ids)` → `client.post(f"{API_BASE}/richmenu/bulk/unlink", json={"userIds": user_ids})`
  - update cache `user_rich_menu_links`
- **MIRROR**: SERVICE_PATTERN + set_default_on_line
- **GOTCHA**: **bulk_unlink body = `json={"userIds": user_ids}`** (dict — ห้ามเขียน `{"userIds"}` ที่เป็น set!). param ชื่อ `line_rich_menu_id` ให้ชัด (string ของ LINE). LINE คืน 200 แม้ user block (ไม่เห็นเมนู) — บันทึก cache ตามส่ง. unlink = hard delete row
- **VALIDATE**: unit test เรียกถูก endpoint + body เป็น dict

#### Task 4.2: Per-user endpoints + guards
- **ACTION**: UPDATE `rich_menus.py`
- **IMPLEMENT**:
  - `POST/DELETE/GET /admin/rich-menus/{id}/users/{user_id}` — โหลด `RichMenu` จาก DB ก่อน, ส่ง `rich_menu.line_rich_menu_id` (string) ต่อ service
  - bulk: **`POST /admin/rich-menus/users/bulk-link` + `/users/bulk-unlink`** (แยกออกจาก `/{id}` route)
  - **Guards**: (1) link/bulk-link: ถ้า `rich_menu.line_rich_menu_id IS NULL` → `HTTPException(409,"Rich menu must be synced before linking")`; (2) IDOR: `await db.execute(select(User).where(User.line_user_id == line_user_id))` ไม่พบ → `HTTPException(404)`; bulk validate ทุก userId; (3) **unlink ไม่ต้องมี synced-guard** (ให้ยกเลิก assignment ของเมนูที่ถูกลบบน LINE ได้)
  - ทุก route `require_permission(KEY_MANAGE_RICH_MENUS)`
- **MIRROR**: ENDPOINT_PATTERN + HTTPException (`rich_menus.py:205-224`)
- **IMPORTS**: `from app.models.user import User`
- **GOTCHA**: IDOR table = **`User` (users)** — `User.line_user_id` nullable; "friends" = User ที่ `line_user_id IS NOT NULL` (ไม่มีตาราง friends แยก; `WHERE line_user_id = :v` ไม่ match NULL อยู่แล้ว). per-user link ส่ง **line_rich_menu_id** ไม่ใช่ `{id}` ในตัว LINE call
- **VALIDATE**: link เมนูยังไม่ synced → 409; userId มั่ว → 404; link สำเร็จ → GET คืน id

### Phase 5 — Frontend: Switch Action UI

#### Task 5.1: richmenuswitch + alias dropdown (wizard)
- **ACTION**: UPDATE `new/page.tsx`
- **IMPLEMENT**: ขยาย `interface MenuAction { type: 'uri'|'message'|'richmenuswitch'; richMenuAliasId?: string; ... }`; เพิ่ม `<option value="richmenuswitch">สลับเมนู</option>`; เมื่อเลือก → alias dropdown ที่ fetch `GET /admin/rich-menus/aliases` (state+useEffect แบบ reply-objects); เพิ่ม case `richMenuAliasId` ใน `handleActionChange`; empty state ("ยังไม่มี alias — สร้างก่อน" + link); guard เตือนถ้าเมนูยังไม่ synced
- **MIRROR**: FRONTEND_ACTION_DROPDOWN + FRONTEND_FETCH_PATTERN + fetch reply-objects (`new/page.tsx:248-262`)
- **GOTCHA**: **ต้องขยาย MenuAction interface** ไม่งั้น `tsc --noEmit` fail (block build). plain fetch พอ (authFetch inject token)
- **VALIDATE**: `npx tsc --noEmit` ผ่าน; เลือก richmenuswitch → เห็น alias dropdown มีรายการ

#### Task 5.2: Edit page action editor + RichMenuUpdate schema
- **ACTION**: UPDATE `[id]/edit/page.tsx` + `backend/app/schemas/rich_menu.py` + `rich_menus.py` PUT
- **IMPLEMENT**:
  - Backend: สร้าง `RichMenuUpdate{name, chat_bar_text, areas}` (template_type **ไม่มี**); เปลี่ยน `PUT /{id}` ให้รับ `RichMenuUpdate` (ไม่เรียก `resolve_rich_menu_size`); ขยาย `RichMenuAreaAction` รวม richMenuAliasId (ทำใน Task 1.1 แล้ว)
  - Frontend: เพิ่ม action editor (~100 บรรทัด) แก้ type/uri/text/richMenuAliasId ต่อ area; ขยาย action interface (`edit/page.tsx:13-21`) + richMenuAliasId; ส่งใน PUT
- **MIRROR**: action UI จาก `new/page.tsx`; PUT pattern เดิม
- **GOTCHA**: **latent bug ที่ verify แล้ว** — `PUT /{id}` เดิมรับ `RichMenuCreate` ที่ `template_type` required + เรียก `resolve_rich_menu_size(data.template_type)` (`rich_menus.py:56,68`) → edit page ส่งแค่ `{name,chat_bar_text,areas}` = พัง (Save ปัจจุบันน่าจะ 422). ต้องแก้เป็น `RichMenuUpdate` ก่อน. bounds key edit ใช้ `{w,h}` ต่างจาก create `{width,height}`
- **VALIDATE**: แก้ alias ปลายทางจาก edit page → PUT 200; `tsc` ผ่าน

### Phase 6 — Frontend: Alias mgmt + Per-User UI

#### Task 6.1: Alias management UI
- **ACTION**: CREATE tab/section "Aliases" ในหน้า rich-menus
- **IMPLEMENT**: list (GET) + create (เลือก rich menu ที่ synced + alias_id) + edit (re-point → PUT) + delete; AdminTable pattern
- **MIRROR**: list pattern (`rich-menus/page.tsx:39-55`) + FRONTEND_FETCH_PATTERN
- **VALIDATE**: สร้าง alias → ปรากฏใน list + ใช้ใน dropdown (Task 5.1)

#### Task 6.2: Per-user assignment UI
- **ACTION**: UPDATE friends page (primary) + badge ใน rich-menus list
- **IMPLEMENT**: ปุ่ม/modal "กำหนด rich menu" ต่อ user → POST link; แสดง assignment + ยกเลิก (DELETE); rich-menus list badge "X users" → **เพิ่ม `user_link_count` ใน RichMenu list interface (frontend) + backend list endpoint return ผ่าน JOIN/subquery**; info banner/tooltip ว่า per-user ทับ default; (Should) bulk select (checkbox single-page, max 500, confirm, toast)
- **MIRROR**: modal/table ในหน้า friends/users
- **GOTCHA**: **friends page ใช้ `useAuth()` + manual authHeaders** (ไม่ใช่ global interceptor แบบ rich-menus pages) — ตามแบบไฟล์เดิม. primary entry = friends; centralized view = Could
- **VALIDATE**: กำหนดเมนูให้ user → เห็นเมนูเฉพาะ; ยกเลิก → กลับ default

### Phase 7 — Delete Guard & Auth Verify

#### Task 7.1: DELETE guard + dependencies endpoint
- **ACTION**: UPDATE `rich_menus.py` DELETE + เพิ่ม `GET /{id}/dependencies`
- **IMPLEMENT**: `GET /admin/rich-menus/{id}/dependencies` (**`Depends(get_current_admin)`**) คืน `{aliases:[...], user_count:N}`; DELETE: query dependency, ถ้ามี → 409 + รายการ; **ห่อ guard+delete ด้วย `try/except IntegrityError: await db.rollback(); raise HTTPException(409,...)`** (FK RESTRICT เป็น enforcer, guard เป็น friendly pre-check); frontend pre-fetch `/dependencies` ก่อนเปิด ConfirmDialog → ใส่ในข้อความ
- **MIRROR**: DELETE endpoint (`rich_menus.py:205-224`)
- **IMPORTS**: `from sqlalchemy.exc import IntegrityError`
- **GOTCHA**: dependencies endpoint **ต้องมี auth** (leak operational data). `get_current_admin` = ADMIN+SUPER_ADMIN (deps.py:117)
- **VALIDATE**: ลบเมนูที่มี alias/link → 409 + รายการ; `/dependencies` ไม่มี token → 401

#### Task 7.2: Verify auth coverage
- **ACTION**: ตรวจ endpoint ใหม่ทุกตัวมี `require_permission(KEY_MANAGE_RICH_MENUS)` (read ใช้ get_current_admin)
- **VALIDATE**: endpoint ใหม่ไม่มี token → 401; role AGENT → 403

### Phase 8 — Tests + E2E

#### Task 8.1: Backend unit tests
- **ACTION**: CREATE tests
- **IMPLEMENT**: validator (richmenuswitch ไม่มี aliasId → 422; **uri/message ปกติ → ผ่าน** (กัน regression จาก return self); alias_id/userId format; **user_ids 501 → 422**); guards (409 synced, 404 IDOR); service (mock httpx → assert URL/method/body; **update_alias ใช้ PUT**; bulk_unlink body = dict)
- **MIRROR**: test pattern ใน `backend/tests/` (conftest)
- **GOTCHA**: conftest เดิมไม่มี httpx mock fixture — ใช้ **`pytest-httpx` (HTTPXMock)** หรือ `respx` หรือ `unittest.mock.AsyncMock` + `patch("httpx.AsyncClient")`. ตัวอย่าง: `httpx_mock.add_response(method="PUT", url=...)`
- **VALIDATE**: `cd backend && python -m pytest` ผ่าน

#### Task 8.2: Frontend + E2E
- **ACTION**: unit test logic ที่แตะ + manual E2E
- **Pre-condition**: ยืนยัน test LINE OA + token valid + device + ผู้รับผิดชอบ; ถ้าไม่มี → integration test (mock) + device test out-of-scope MVP
- **VALIDATE**: `cd frontend && npx tsc --noEmit && npm run lint && npx vitest run`; manual: A↔B กดสลับบนมือถือ; per-user เห็นเมนูเฉพาะ

---

## Testing Strategy

### Unit Tests
| Test | Input | Expected | Edge? |
|---|---|---|---|
| validator richmenuswitch | no aliasId | 422 | ✓ |
| validator richmenuswitch | aliasId ok, no data | pass | ✓ |
| validator regression | uri/message ปกติ | pass (return self ทำงาน) | ✓ |
| alias_id format | "bad id!" | 422 | ✓ |
| userId format | not U+32hex | 422 | ✓ |
| bulk size | 501 userIds | 422 (Annotated ทำงาน) | ✓ |
| link guard synced | line_rich_menu_id=None | 409 | ✓ |
| link guard IDOR | unknown line_user_id | 404 | ✓ |
| update_alias method | — | client.put called | |
| bulk_unlink body | — | json={"userIds":[...]} dict | ✓ |
| delete alias | 404 from LINE | swallowed | ✓ |

### Edge Cases Checklist
- [ ] richmenuswitch ไม่มี aliasId → 422 · uri/message ปกติยังผ่าน (return self)
- [ ] update alias = PUT · bulk_unlink body เป็น dict
- [ ] link เมนูยังไม่ synced → 409 · userId ไม่มีในระบบ → 404
- [ ] user_ids 501 → 422 · ลบเมนูมี dependency → 409
- [ ] model ใหม่เห็นใน Base.metadata · migration up+down ผ่าน · partial-apply recover ได้
- [ ] tsc ผ่าน (MenuAction interface ขยายแล้ว) · route /aliases ไม่ชน /{id}

---

## Validation Commands

### Static Analysis (frontend)
```bash
cd frontend && npx tsc --noEmit && npm run lint
```
EXPECT: zero errors (โดยเฉพาะหลังขยาย MenuAction interface)

### Unit Tests (backend, WSL venv_linux)
```bash
cd backend && python -m pytest
```
EXPECT: all pass

### Unit Tests (frontend — CI ไม่รัน vitest, รันเอง)
```bash
cd frontend && npx vitest run
```
EXPECT: all pass

### Model registration check
```bash
cd backend && python -c "import app.models; from app.db.base import Base; print([t for t in Base.metadata.tables])"
```
EXPECT: เห็น rich_menu_aliases + user_rich_menu_links

### Database Migration
```bash
cd backend && python scripts/db_target.py alembic --target local current   # ← ใช้ตั้ง down_revision
cd backend && python scripts/db_target.py alembic --target local upgrade head
cd backend && python scripts/db_target.py alembic --target local downgrade -1
cd backend && python scripts/db_target.py alembic --target local upgrade head
```
EXPECT: up + down + up สำเร็จ

### Build
```bash
cd frontend && npm run build
```
EXPECT: build ผ่าน

### Manual Validation
- [ ] สร้าง A,B → sync → alias-a,alias-b → richmenuswitch ไขว้ → publish A → กดสลับบนมือถือ A↔B
- [ ] friends page: กำหนดเมนูให้ user → เห็นเมนูเฉพาะ → ยกเลิก → default
- [ ] ลบเมนูที่มี alias → 409 + dependency

---

## Acceptance Criteria
- [ ] ทุก task เสร็จ · validation commands ผ่าน · tests ผ่าน · ไม่มี type/lint error · ตรง UX · migration up+down ผ่าน local+remote

## Completion Checklist
- [ ] ตาม pattern (model/service/endpoint/migration/fetch/validator)
- [ ] model_validator มี return self · update alias = PUT · bulk_unlink = dict body
- [ ] model register ใน app/models/__init__.py · endpoint ใหม่มี require_permission/get_current_admin ครบ
- [ ] MenuAction interface ขยายแล้ว (tsc ผ่าน) · RichMenuUpdate schema สำหรับ PUT
- [ ] route /aliases ก่อน /{id} · ไม่มี scope เกิน NOT Building · self-contained

## Risks
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| ลืม return self ใน validator | M | High | unit test uri/message ต้องผ่าน (regression gate) |
| down_revision ผิด head | M | M | รัน alembic current ก่อน (คาด s9t0u1v2w3x4) |
| route /aliases ชน /{id} | M | M | register ก่อน /{id} + test |
| ไม่มี test LINE OA (E2E) | M | M | integration test (mock) + device test out-of-scope MVP |
| edit page PUT พัง (template_type) | M | High | สร้าง RichMenuUpdate schema (Task 5.2) ก่อนแตะ edit |

## Notes
- **R1/R2 split:** Phase 1-3 + 5 + 7-8 = R1 (Feature A, แก้บั๊ก); Phase 4 + 6 = R2 (per-user)
- frontend rich-menus pages = global authFetch; **friends page = useAuth() manual headers** (ต่างกัน)
- dev รันใน WSL (venv_linux, npm/npx ผ่าน WSL)

---

## Plan Review History
| Date | Reviewer | Verdict | Action |
|------|----------|---------|--------|
| 2026-06-20 | คณะ 6 ผู้เชี่ยวชาญ (backend-impl / LINE-API / migration-DB / frontend-impl / security / completeness) ผ่าน multi-agent workflow (verified เทียบโค้ดจริง) | NEEDS_REVISION (conf 6) → แก้แล้ว | แก้ 12 edits: 3 CRITICAL (update alias PUT, validator return self, bulk_unlink dict body) + 6 HIGH (model __init__.py, RichMenuUpdate schema, MenuAction interface, Annotated bulk size, per-table migration guard, dependencies auth) + 7 MED + 4 LOW |
