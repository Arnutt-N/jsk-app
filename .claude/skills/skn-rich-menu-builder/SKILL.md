---
name: skn-rich-menu-builder
description: >
  Creates, modifies, syncs, and publishes LINE Rich Menus in the SKN App (JskApp).
  Use when asked to "create rich menu", "add rich menu", "sync rich menu to LINE",
  "publish rich menu", "upload rich menu image", "update rich menu layout",
  "สร้าง rich menu", "เพิ่ม rich menu", "sync rich menu", "ตั้ง rich menu เป็น default".
  Do NOT use for LINE Flex Messages (use skn-line-flex-builder instead).
license: MIT
compatibility: >
  Claude Code with SKN App project.
  Requires: FastAPI backend on localhost:8000,
  PostgreSQL via docker-compose,
  LINE Messaging API credentials stored in DB or .env.
metadata:
  author: SKN App Team
  version: 1.0.0
  project: skn-app
  category: line-integration
  tags: [rich-menu, line-api, httpx, settings-service]
---

# SKN Rich Menu Builder

Manages the full lifecycle of LINE Rich Menus: creating layouts in DB, syncing
config to LINE, uploading images, and publishing as the OA default menu.

---

## CRITICAL: Project-Specific Rules

These rules are non-negotiable and must be followed every time:

1. **`RichMenuService` uses raw httpx, NOT LineService** — all LINE API calls use
   `httpx.AsyncClient()` with the token fetched from DB via `SettingsService.get_setting(db, "LINE_CHANNEL_ACCESS_TOKEN")`. Never call `line_service` for rich menu operations.

2. **Two separate LINE API bases** — config CRUD and set-default use `https://api.line.me/v2/bot`;
   image upload uses `https://api-data.line.me/v2/bot`. Using the wrong base returns 404.

3. **4-step publish flow (sequential, not atomic):**
   `POST /admin/rich-menus` (DRAFT) →
   `POST /admin/rich-menus/{id}/sync` (create on LINE) →
   `POST /admin/rich-menus/{id}/upload` (push image to LINE) →
   `POST /admin/rich-menus/{id}/publish` (set as default).

4. **Config is stored and sent as a raw dict, not a Pydantic model** — `rich_menu.config`
   is `Column(JSON)`. LINE requires the exact shape:
   `{"size": {"width": 2500, "height": 1686}, "selected": false, "name": "...",
   "chatBarText": "...", "areas": [...]}`.

5. **`sync_with_idempotency()` — call instead of `create_on_line()` directly** — it
   checks whether `line_rich_menu_id` already exists on LINE before recreating. Calling
   `create_on_line()` directly when `line_rich_menu_id` is set will create a duplicate.

6. **`sync_status` is a plain `String` column, not an Enum** — valid values are the strings
   `"PENDING"`, `"SYNCED"`, `"FAILED"`. `status` (DRAFT/PUBLISHED/INACTIVE) is the separate
   `RichMenuStatus` Enum. Don't confuse the two.

7. **Image upload is lazy** — uploading a local image (via `POST /{id}/upload`) auto-pushes
   to LINE only if `rich_menu.line_rich_menu_id` is already set. If not yet synced, the
   image is saved locally and pushed during the sync step automatically.

8. **DELETE on LINE ignores 404** — `delete_from_line()` silently accepts 404 (menu already
   deleted on LINE side). Don't treat 404 as an error in delete workflows.

9. **`publish` requires `line_rich_menu_id` to be set first** — `POST /{id}/publish` calls
   `set_default_on_line(db, rich_menu.line_rich_menu_id)` directly without a guard.
   Always sync before publish or you'll get a `None` ID error.

10. **Rich menu endpoints ARE auth-protected** — every route in `rich_menus.py` requires
    auth: reads use `get_current_admin` (lines 43, 48, 181), writes use
    `require_permission(KEY_MANAGE_RICH_MENUS)` (lines 56, 83, 111, 145, 189, 205).
    `core/permissions.py` limits `KEY_MANAGE_RICH_MENUS` to SUPER_ADMIN + ADMIN.
    Import both from `app.api.deps`; the permission key from `app.core.permissions`.
    Any NEW rich-menu endpoint (alias / per-user / bulk) MUST add
    `require_permission(KEY_MANAGE_RICH_MENUS)`.
    (Corrected 2026-06-20 — this rule previously claimed "no auth for now", which was stale;
    verified against `rich_menus.py`.)

---

## Context7 Docs

Context7 MCP is active in this project (`.mcp.json`). Use it before writing code
to verify current library APIs.

| Library | Resolve Name | Key Topics |
|---|---|---|
| FastAPI | `"fastapi"` | UploadFile, File, Form, Depends |
| SQLAlchemy | `"sqlalchemy"` | async session, Column JSON, select |
| httpx | `"httpx"` | AsyncClient, raise_for_status, content |
| Pydantic | `"pydantic"` | BaseModel, model_dump, Optional |

Usage: `mcp__context7__resolve-library-id libraryName="httpx"` →
`mcp__context7__get-library-docs context7CompatibleLibraryID="..." topic="AsyncClient" tokens=5000`

---

## Step 1: Create a Rich Menu (DRAFT)

**Endpoint:** `POST /api/v1/admin/rich-menus`

The endpoint accepts `RichMenuCreate` and builds the LINE config dict internally.
The size is always fixed at `2500 × 1686` (full-size) or `2500 × 843` (half-size).

```python
# Request body (RichMenuCreate)
{
    "name": "Main Menu",
    "chat_bar_text": "เมนูหลัก",
    "template_type": "3-buttons",
    "areas": [
        {
            "bounds": {"x": 0, "y": 0, "width": 833, "height": 1686},
            "action": {"type": "message", "label": "สอบถาม", "text": "สอบถาม"}
        },
        {
            "bounds": {"x": 833, "y": 0, "width": 834, "height": 1686},
            "action": {"type": "uri", "label": "เว็บไซต์", "uri": "https://example.com"}
        },
        {
            "bounds": {"x": 1667, "y": 0, "width": 833, "height": 1686},
            "action": {"type": "postback", "label": "ติดต่อ", "data": "action=contact"}
        }
    ]
}
```

**Config assembled internally (stored in `rich_menu.config`):**
```python
line_config = {
    "size": {"width": 2500, "height": 1686},
    "selected": False,
    "name": data.name,
    "chatBarText": data.chat_bar_text,
    "areas": [area.model_dump() for area in data.areas]
}
```

**Result:** `RichMenuResponse` with `status=DRAFT`, `sync_status="PENDING"`, `line_rich_menu_id=null`.

---

## Step 2: Sync Rich Menu Config to LINE

**Endpoint:** `POST /api/v1/admin/rich-menus/{id}/sync`

Calls `RichMenuService.sync_with_idempotency(db, id)` which:
1. Loads the `RichMenu` from DB
2. If `line_rich_menu_id` exists → verifies the menu still exists on LINE
3. If not found on LINE → marks as `FAILED` (does NOT auto-recreate)
4. If no `line_rich_menu_id` → calls `create_on_line(db, rich_menu.config)` → sets `line_rich_menu_id` + `sync_status="SYNCED"`

Then, if sync succeeded AND `rich_menu.image_path` exists locally, automatically calls
`upload_image_to_line()` with content-type detected from file extension.

```python
# Sync result dict
{
    "success": True,
    "message": "Created on LINE successfully",
    "line_rich_menu_id": "richmenu-abc123",
    "sync_status": "SYNCED"
}
```

**Token resolution path (inside `get_client_headers`):**
```python
# SettingsService reads from DB first, falls back to env
token = await SettingsService.get_setting(db, "LINE_CHANNEL_ACCESS_TOKEN")
headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
```

---

## Step 3: Upload Rich Menu Image

**Endpoint:** `POST /api/v1/admin/rich-menus/{id}/upload`
**Content-Type:** `multipart/form-data`

```python
# Endpoint signature
async def upload_rich_menu_image(
    id: int,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db)
):
```

**Behavior:**
- Saves file to `uploads/rich_menus/{id}_{filename}` (local FS)
- Updates `rich_menu.image_path`
- If `line_rich_menu_id` is already set → immediately calls `upload_image_to_line()`
- If not yet synced → saves locally only (sync step will upload)

**Content-type detection** (simple extension-based):
```python
ext = os.path.splitext(rich_menu.image_path)[1].lower()
content_type = "image/png" if ext == ".png" else "image/jpeg"
```

**LINE image requirements:**
- Format: JPEG or PNG
- Size: ≤ 1 MB
- Dimensions: must match the `size` in config (e.g. 2500×1686 for full)

---

## Step 4: Publish as Default

**Endpoint:** `POST /api/v1/admin/rich-menus/{id}/publish`

Calls `RichMenuService.set_default_on_line(db, line_rich_menu_id)` which hits:
```
POST https://api.line.me/v2/bot/user/all/richmenu/{line_rich_menu_id}
```

Updates `rich_menu.status = RichMenuStatus.PUBLISHED`.

**Guard required before calling publish** — the endpoint has no guard for `line_rich_menu_id is None`.
Always sync first. Recommended guard to add:
```python
if not rich_menu.line_rich_menu_id:
    raise HTTPException(400, detail="Sync to LINE before publishing")
```

---

## Step 5: List and Get Rich Menus

```python
# List all (ordered newest first)
GET /api/v1/admin/rich-menus
# → List[RichMenuResponse]

# Get specific
GET /api/v1/admin/rich-menus/{id}
# → RichMenuResponse

# Check sync status only
GET /api/v1/admin/rich-menus/{id}/sync-status
# → {"sync_status": "SYNCED", "last_synced_at": "...", "line_rich_menu_id": "...", "last_sync_error": null}
```

---

## Step 6: Update Rich Menu Layout

**Endpoint:** `PUT /api/v1/admin/rich-menus/{id}`

Accepts `RichMenuCreate` — rebuilds the `config` dict and saves. Does NOT
automatically re-sync to LINE. After update, call `sync` again to push changes.

**Warning:** If `line_rich_menu_id` already exists, LINE still has the old config.
You must delete from LINE and re-sync (LINE does not support updating rich menu config
in-place — only create/delete).

Correct update + re-sync workflow:
```
1. DELETE /admin/rich-menus/{id}           # deletes old from LINE + DB
2. POST /admin/rich-menus                  # create new DRAFT with updated layout
3. POST /admin/rich-menus/{new_id}/sync    # push to LINE
4. POST /admin/rich-menus/{new_id}/upload  # re-upload image
5. POST /admin/rich-menus/{new_id}/publish # set as default
```

---

## Step 7: Delete Rich Menu

**Endpoint:** `DELETE /api/v1/admin/rich-menus/{id}`

1. Deletes from LINE if `line_rich_menu_id` is set (404 silently accepted)
2. Deletes local image file if `image_path` exists
3. Deletes `RichMenu` row from DB

```python
# DELETE response
{"message": "Rich Menu deleted"}
```

---

## Step 8: Add RichMenuService to an Endpoint

When calling RichMenuService from a new endpoint or task:

```python
from app.services.rich_menu_service import RichMenuService
from app.services.settings_service import SettingsService

# All methods are @staticmethod — no instantiation
line_id = await RichMenuService.create_on_line(db, config_dict)
await RichMenuService.upload_image_to_line(db, line_id, img_bytes, "image/png")
await RichMenuService.set_default_on_line(db, line_id)
await RichMenuService.delete_from_line(db, line_id)   # 404-safe
menus = await RichMenuService.list_from_line(db)       # List[dict]
menu = await RichMenuService.get_from_line(db, line_id) # dict | None
result = await RichMenuService.sync_with_idempotency(db, rich_menu_id)
status = await RichMenuService.get_sync_status(db, rich_menu_id)
```

---

## Examples

### Example 1: Full publish workflow

**User says:** "สร้าง rich menu 3 ปุ่มและ publish เป็น default"

**Actions:**
1. `POST /admin/rich-menus` with `name`, `chat_bar_text`, `areas` (3 areas, each 833px wide)
2. `POST /admin/rich-menus/{id}/sync` → get `line_rich_menu_id`
3. Upload image via `POST /admin/rich-menus/{id}/upload`
4. `POST /admin/rich-menus/{id}/publish`

**Result:** Menu appears as the rich menu for all LINE OA users.

### Example 2: Fix a "FAILED" sync

**User says:** "sync status เป็น FAILED ทำไง"

**Actions:**
1. `GET /admin/rich-menus/{id}/sync-status` — check `last_sync_error` for details
2. If LINE returned 400 → validate `config` JSON structure matches LINE spec
3. If LINE returned 401 → check `LINE_CHANNEL_ACCESS_TOKEN` in DB settings
4. Fix the issue, then `POST /admin/rich-menus/{id}/sync` again

**Note:** `sync_with_idempotency()` will NOT retry if `line_rich_menu_id` is already set
and the menu was deleted on LINE. Must clear `line_rich_menu_id` in DB first:
```python
rich_menu.line_rich_menu_id = None
rich_menu.sync_status = "PENDING"
await db.commit()
```

### Example 3: Update layout of existing published menu

**User says:** "แก้ layout rich menu แต่ keep image เดิม"

**Actions:**
1. Note the existing `image_path` from `GET /admin/rich-menus/{id}`
2. `DELETE /admin/rich-menus/{id}` (removes from LINE + DB)
3. `POST /admin/rich-menus` with updated `areas`
4. `POST /admin/rich-menus/{new_id}/sync`
5. Re-upload saved image bytes to `POST /admin/rich-menus/{new_id}/upload`
6. `POST /admin/rich-menus/{new_id}/publish`

---

## Common Issues

### `LINE API error: 400 - {"message":"The request body has 1 error(s)"}`
**Cause:** `config` dict shape is wrong — missing required fields or wrong types.
**Fix:** Validate the config against the required shape:
```python
required_fields = ["size", "selected", "name", "chatBarText", "areas"]
# size must be {"width": int, "height": int}
# areas[].bounds must be {"x": int, "y": int, "width": int, "height": int}
# areas[].action.type must be "uri" | "message" | "postback" | "datetimepicker"
```

### `LINE API error: 401 - {"message":"Authentication failed"}`
**Cause:** `LINE_CHANNEL_ACCESS_TOKEN` is missing or expired.
**Fix:** Check `SettingsService.get_setting(db, "LINE_CHANNEL_ACCESS_TOKEN")` returns a valid token.
Set in DB via `POST /admin/settings` or update `backend/.env`.

### `Image saved locally, but LINE Upload failed`
**Cause:** `upload_image_to_line()` uses `api-data.line.me`, not `api.line.me`. Wrong base URL
or image exceeds 1 MB.
**Fix:** Check image size, confirm you're using the DATA_API_BASE for the upload endpoint.

### Publish succeeds but users still see old rich menu
**Cause:** LINE caches rich menus per user. Cache clears automatically within ~1 minute.
**Fix:** Wait or have users block/unblock the OA to force refresh.

### `NoneType` error on publish
**Cause:** `rich_menu.line_rich_menu_id` is `None` — sync was never done.
**Fix:** Call `POST /{id}/sync` first to create on LINE, then publish.

### `sync_with_idempotency` returns `success: False, sync_status: FAILED`
**Cause:** `line_rich_menu_id` was set but the menu was deleted directly on LINE Console.
**Fix:**
```python
# Clear stale LINE ID then re-sync
rich_menu.line_rich_menu_id = None
rich_menu.sync_status = "PENDING"
await db.commit()
# then POST /{id}/sync again
```

---

## Quality Checklist

Before finishing, verify:
- [ ] `RichMenuService` methods called with `db` as first arg (all are `@staticmethod`)
- [ ] Sync called before publish (never publish without `line_rich_menu_id`)
- [ ] Image file exists locally before calling `upload_image_to_line()`
- [ ] New router registered in `api.py` with `prefix="/admin/rich-menus"`
- [ ] `config` dict always has `size`, `selected`, `name`, `chatBarText`, `areas`
- [ ] `sync_status` updated via `RichMenuService.update_sync_status()` — not direct `.sync_status = "..."` assignment (to ensure `last_synced_at` is also set)
- [ ] Every DB call uses `await`
- [ ] `delete_from_line()` call wrapped in `try/except` (404 is silently accepted internally but other errors should be logged)
