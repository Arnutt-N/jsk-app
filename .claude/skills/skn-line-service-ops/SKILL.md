---
name: skn-line-service-ops
description: >
  Uses, extends, or debugs the SKN App LINE messaging services — sending replies,
  push messages, images, Flex containers, saving messages to DB, media persistence,
  circuit breaker behavior, rich menu sync, and Telegram handoff notifications.
  Use when asked to "send LINE message", "push message to user", "reply with flex",
  "save message", "show loading animation", "download media", "persist image",
  "rich menu sync", "telegram notification", "LINE circuit open", "LINE API error",
  "ส่ง LINE message", "push ข้อความ", "บันทึก message", "ส่ง flex message",
  "rich menu", "telegram แจ้งเตือน".
  Do NOT use for Flex Message content building (use skn-line-flex-builder),
  webhook event routing (use skn-webhook-handler), or live chat WebSocket
  (use skn-live-chat-ops).
license: MIT
compatibility: >
  SKN App (JskApp) backend. LINE Bot SDK v3 (linebot.v3.*), httpx, FastAPI async.
  File: backend/app/services/line_service.py
metadata:
  author: SKN App Team
  version: 1.0.0
  project: skn-app
  category: line-integration
  tags: [line-messaging, push, reply, media, circuit-breaker, rich-menu, telegram]
---

# skn-line-service-ops

Covers the full surface of the SKN App LINE messaging services: `LineService`
(reply, push, media, circuit breaker), `RichMenuService` (httpx-based LINE
Rich Menu management), and `TelegramService` (handoff + alert notifications).

---

## CRITICAL: Project-Specific Rules

1. **`reply_flex()` vs `reply_messages()` — different input types**
   - `reply_flex(reply_token, alt_text, contents: dict)` — pass a **raw dict**; it calls `FlexContainer.from_dict()` internally.
   - `reply_messages(reply_token, messages: list)` — pass **SDK message objects** (e.g., `FlexMessage`, `TextMessage`). You must build them yourself first.
   - Mixing these up is the most common mistake in this codebase.

2. **`reply_*` vs `push_*` — reply token is single-use**
   - `reply_text / reply_flex / reply_messages` — require a `reply_token` from a LINE webhook event. Token is valid for ~1 minute and can be used **once only**.
   - `push_messages / push_image_message` — send proactively to `line_user_id`. No token required. Used by live chat operators. Push counts against LINE API quota.

3. **All LINE API calls go through `_call_with_circuit()`** — never call `self.api.*` directly. All reply/push/loading methods use the circuit breaker wrapper. The only exception is `show_loading_animation()`, which wraps the circuit call in its own try/except (never raises to caller).

4. **Circuit breaker is global to the singleton** — `line_service` is a module-level singleton. If 5 consecutive LINE API calls fail, the circuit opens and ALL LINE API calls fail fast for 30 seconds. Check `_cb_open_until` when debugging.

5. **`RichMenuService` does NOT use the circuit breaker** — it uses `httpx.AsyncClient()` directly. It also reads `LINE_CHANNEL_ACCESS_TOKEN` from the **database** (via `SettingsService`), not from `settings.LINE_CHANNEL_ACCESS_TOKEN`.

6. **Media URLs must be absolute HTTPS for LINE** — `persist_line_media()` and `persist_operator_upload()` return relative URLs when `settings.SERVER_BASE_URL` is empty. LINE API will reject non-HTTPS URLs. Always verify `SERVER_BASE_URL` is set in production.

7. **`save_message()` requires explicit `direction`** — always pass `MessageDirection.INCOMING` or `MessageDirection.OUTGOING`. Never pass the string `"INCOMING"` directly.

8. **`TelegramService` loads credentials from DB first, then falls back to env** — if no `Provider.TELEGRAM` credential exists in DB, it reads `TELEGRAM_BOT_TOKEN` and `TELEGRAM_ADMIN_CHAT_ID` from `settings`. Both must be set for notifications to work.

9. **Max 5 messages per reply or push** — `reply_messages()` and `push_messages()` silently slice `messages[:5]`. If you pass 6 messages, the 6th is dropped without error.

10. **`blob_api` is lazy and separate from `api`** — `LineService.blob_api` uses `AsyncMessagingApiBlob(get_async_api_client())`. It is only needed for downloading message content from LINE. Never use it for sending messages.

---

## Context7 Docs

Context7 MCP is active. Use before writing LINE SDK messaging or media download patterns.

| Library | Resolve Name | Key Topics |
|---|---|---|
| LINE Bot SDK Python | `"line-bot-sdk-python"` | AsyncMessagingApi, ReplyMessageRequest, PushMessageRequest, FlexContainer, ShowLoadingAnimationRequest, AsyncMessagingApiBlob |
| FastAPI | `"fastapi"` | UploadFile, Response, HTTPException |

Usage: `mcp__context7__resolve-library-id libraryName="line-bot-sdk-python"` →
`mcp__context7__get-library-docs context7CompatibleLibraryID="..." topic="AsyncMessagingApi reply push" tokens=5000`

---

## Architecture Overview

```
LineService (singleton: line_service)
├── api: AsyncMessagingApi          ← lazy via get_line_bot_api()
├── blob_api: AsyncMessagingApiBlob ← lazy via get_async_api_client()
├── Circuit Breaker
│   ├── _cb_failures: int           (reset on success)
│   ├── _cb_failure_threshold: 5
│   ├── _cb_open_until: datetime    (None = circuit closed)
│   └── _cb_recovery_timeout_seconds: 30
│
├── SEND via reply_token (webhook events only)
│   ├── reply_text(reply_token, text)
│   ├── reply_flex(reply_token, alt_text, contents: dict)  ← raw dict
│   └── reply_messages(reply_token, messages: list)        ← SDK objects
│
├── SEND proactively (operator messages, notifications)
│   ├── push_messages(line_user_id, messages: list)        ← SDK objects
│   └── push_image_message(line_user_id, image_url, preview_url)
│
├── UX helpers
│   └── show_loading_animation(chat_id, loading_seconds=20)
│
├── DB persistence
│   └── save_message(db, line_user_id, direction, message_type, content, payload, sender_role, operator_name)
│
└── Media operations
    ├── download_message_content(message_id, preview=False) → (bytes, content_type)
    ├── persist_line_media(message_id, media_type, file_name) → {url, preview_url, content_type, size, file_name}
    └── persist_operator_upload(data, media_type, file_name, content_type) → {url, preview_url, ...}

RichMenuService (static methods, httpx, reads token from DB)
    ├── create_on_line / upload_image_to_line / set_default_on_line
    ├── delete_from_line / list_from_line / get_from_line
    └── sync_with_idempotency / get_sync_status / update_sync_status

TelegramService (singleton: telegram_service)
    ├── send_handoff_notification(name, pic_url, recent_msgs, admin_url, db)
    └── send_alert_message(text, db)
```

---

## Step 1: Send a Reply (Webhook Context)

Use `reply_*` only when you have a live `reply_token` from a LINE event.

### Reply with plain text
```python
from app.services.line_service import line_service

await line_service.reply_text(event.reply_token, "สวัสดีครับ ยินดีให้บริการ")
```

### Reply with a single Flex Message
```python
# reply_flex() accepts a raw dict — FlexContainer is built internally
flex_contents = {
    "type": "bubble",
    "body": {
        "type": "box",
        "layout": "vertical",
        "contents": [
            {"type": "text", "text": "ยืนยันการนัดหมาย", "weight": "bold"}
        ]
    }
}
await line_service.reply_flex(event.reply_token, "ยืนยันนัดหมาย", flex_contents)
```

### Reply with multiple messages (up to 5)
```python
from linebot.v3.messaging import TextMessage, FlexMessage, FlexContainer

messages = [
    TextMessage(text="นี่คือข้อมูลที่ท่านขอครับ"),
    FlexMessage(
        alt_text="รายละเอียด",
        contents=FlexContainer.from_dict(flex_contents)
    ),
]
# reply_messages takes SDK objects — NOT raw dicts
await line_service.reply_messages(event.reply_token, messages)
```

**Key difference:**

| Method | Input | Max | When |
|---|---|---|---|
| `reply_text` | `str` | 1 | Simple text only |
| `reply_flex` | `dict` (raw Flex contents) | 1 | Single Flex, raw dict |
| `reply_messages` | `list[SDKMessage]` | 5 | Multiple / mixed types |

---

## Step 2: Push a Message (No Reply Token)

Use `push_*` to send messages proactively — from operators, scheduled sends,
or any context without a webhook reply token.

```python
from linebot.v3.messaging import TextMessage, ImageMessage
from app.services.line_service import line_service

# Push plain text
await line_service.push_messages(line_user_id, [
    TextMessage(text="เจ้าหน้าที่รับเรื่องของท่านแล้วครับ")
])

# Push image (URLs must be HTTPS in production)
await line_service.push_image_message(
    line_user_id=line_user_id,
    image_url="https://your-domain.com/uploads/line_media/image.jpg",
    preview_url="https://your-domain.com/uploads/line_media/preview.jpg"  # optional
)

# Push multiple messages (operator sends text + image)
from app.services.line_service import line_service
await line_service.push_messages(line_user_id, [
    TextMessage(text="ส่งรูปภาพเพิ่มเติมครับ"),
    ImageMessage(
        original_content_url=image_url,
        preview_image_url=preview_url or image_url
    ),
])
```

---

## Step 3: Show Loading Animation

Display the typing indicator before a potentially slow reply:

```python
# Call BEFORE processing — animation auto-clears when reply is sent
await line_service.show_loading_animation(line_user_id)
# Optional: extend duration for heavy operations (max 60)
await line_service.show_loading_animation(line_user_id, loading_seconds=40)

# NOTE: Never raises an exception to caller — errors are logged as WARNING
# Safe to call even if the user has blocked the OA
```

---

## Step 4: Save a Message to DB

All webhook incoming/outgoing messages and operator messages are saved via `save_message()`:

```python
from app.models.message import MessageDirection
from app.services.line_service import line_service

# Save incoming user message
saved = await line_service.save_message(
    db=db,
    line_user_id=line_user_id,
    direction=MessageDirection.INCOMING,
    message_type="text",
    content=text,
    sender_role="USER",
)

# Save outgoing bot reply — one row per LINE message with its REAL type/content.
# describe_line_message() (line_service.py) maps each SDK send-object to
# (message_type, content, payload): text/image/video/audio/sticker/location/flex/
# template/imagemap. (Was a single message_type="multi" row with content
# f"Sent N messages for intent '{name}'" — that summary string is gone.)
for sent_message in messages:
    m_type, m_content, m_payload = describe_line_message(sent_message)
    await line_service.save_message(
        db=db,
        line_user_id=line_user_id,
        direction=MessageDirection.OUTGOING,
        message_type=m_type,
        content=m_content,
        payload=m_payload,
        sender_role="BOT",
    )

# Save operator (live chat) message
await line_service.save_message(
    db=db,
    line_user_id=line_user_id,
    direction=MessageDirection.OUTGOING,
    message_type="text",
    content=message_text,
    sender_role="ADMIN",
    operator_name=admin.display_name,
)

# Save non-text incoming (with payload)
await line_service.save_message(
    db=db,
    line_user_id=line_user_id,
    direction=MessageDirection.INCOMING,
    message_type="image",
    content="[Image]",
    payload={"url": "...", "preview_url": "...", "content_type": "image/jpeg", "size": 12345},
    sender_role="USER",
)
```

**`message_type` values used in this project:**
`text` | `image` | `sticker` | `file` | `video` | `audio` | `location` | `multi` | `flex`

---

## Step 5: Persist Incoming Media (LINE → Server)

When a user sends an image, file, video, or audio, download it from LINE and
store it locally:

```python
# Used in webhook._extract_non_text_message() for LINE-originating media
result = await line_service.persist_line_media(
    message_id=str(event.message.id),
    media_type="image",       # "image" | "video" | "audio" | "file"
    file_name=None,           # Optional: override auto-generated name
)

# Returns:
# {
#   "url": "https://domain.com/uploads/line_media/image_abcdef.jpg",  ← absolute if SERVER_BASE_URL set
#   "preview_url": "https://domain.com/uploads/line_media/preview_xyz.jpg",  ← images only
#   "content_type": "image/jpeg",
#   "size": 204800,            ← bytes
#   "file_name": "image_abcdef.jpg"
# }

# For files (preserve original filename):
result = await line_service.persist_line_media(
    message_id=str(event.message.id),
    media_type="file",
    file_name=getattr(event.message, "file_name", None),  # from LINE event
)
```

**Storage paths:**
- Incoming LINE media: `backend/uploads/line_media/`
- Operator uploads: `backend/uploads/operator_media/`

---

## Step 6: Persist Operator-Uploaded Media

When an operator uploads a file through the admin UI for a live chat:

```python
# Used in ws_live_chat.py for operator media uploads
result = await line_service.persist_operator_upload(
    data=file_bytes,             # raw bytes from UploadFile or WebSocket payload
    media_type="image",          # "image" | "file" | "video" | "audio"
    file_name="screenshot.png",  # original filename (sanitized internally)
    content_type="image/png",    # MIME type
)

# Returns:
# {
#   "url": "https://domain.com/uploads/operator_media/a1b2c3_screenshot.png",
#   "preview_url": "https://domain.com/uploads/operator_media/a1b2c3_screenshot.png",  ← same URL for images
#   "content_type": "image/png",
#   "size": 51200,
#   "file_name": "a1b2c3_screenshot.png"    ← prefixed with uuid4().hex for uniqueness
# }

# Then push the image to LINE:
await line_service.push_image_message(
    line_user_id=line_user_id,
    image_url=result["url"],
    preview_url=result["preview_url"],
)
```

---

## Step 7: Understand the Circuit Breaker

The circuit breaker protects against LINE API outages. Understand it before
calling `line_service` in new contexts.

```python
# Circuit state (on line_service singleton)
line_service._cb_failures          # int — consecutive failures
line_service._cb_open_until        # datetime | None — None = circuit closed
line_service._cb_failure_threshold # 5 — failures to open
line_service._cb_recovery_timeout_seconds  # 30 — seconds before auto-close

# What happens when circuit is open:
#   _call_with_circuit() raises RuntimeError("LINE API circuit is open")
#   All reply/push calls fail fast without hitting LINE

# What happens after 5 failures:
#   Circuit opens for 30 seconds
#   _cb_open_until = now + 30s
#   All calls fail fast until timeout passes

# Circuit auto-recovers:
#   After 30s, next call attempts to reach LINE
#   On success → _cb_failures = 0, _cb_open_until = None
#   On failure → threshold check continues
```

**Debugging a stuck-open circuit:**

```python
# In a FastAPI endpoint or shell:
from app.services.line_service import line_service
from datetime import datetime, timezone

print(f"Failures: {line_service._cb_failures}")
print(f"Open until: {line_service._cb_open_until}")

# Force-reset (emergency only):
line_service._cb_failures = 0
line_service._cb_open_until = None
```

**Note:** `show_loading_animation()` catches all exceptions internally — it never propagates circuit errors to the caller.

---

## Step 8: Rich Menu Sync

`RichMenuService` manages LINE Rich Menu creation/deletion. It uses httpx
directly (not `line_service`) and reads the channel token from the DB.

```python
from app.services.rich_menu_service import RichMenuService

# Sync a rich menu from DB → LINE (idempotent: won't re-create if already synced)
result = await RichMenuService.sync_with_idempotency(db, rich_menu_id=1)
# {"success": True, "line_rich_menu_id": "richmenu-abc123", "sync_status": "SYNCED"}

# Set as default for all LINE OA users
await RichMenuService.set_default_on_line(db, line_rich_menu_id="richmenu-abc123")

# List all rich menus currently on LINE
menus = await RichMenuService.list_from_line(db)
```

**Channel access token source for RichMenuService:**
- Reads from `SettingsService.get_setting(db, "LINE_CHANNEL_ACCESS_TOKEN")`
- This is the **DB settings table**, not `settings.LINE_CHANNEL_ACCESS_TOKEN` from env
- Update via admin settings panel, not `.env`

**IMPORTANT:** `RichMenuService` does NOT use `_call_with_circuit()` — HTTP errors from httpx will raise directly to caller. Always wrap calls in try/except.

---

## Step 9: Telegram Notifications

Send handoff alerts and system alerts to a Telegram admin group:

```python
from app.services.telegram_service import telegram_service

# Handoff notification (called automatically by live_chat_service.initiate_handoff)
await telegram_service.send_handoff_notification(
    user_display_name=user.display_name or "Unknown",
    user_picture_url=user.picture_url,
    recent_messages=recent_msgs,      # list of Message objects (uses .content)
    admin_panel_url=f"{settings.ADMIN_URL}/admin/live-chat?user={line_user_id}",
    db=db,
)

# Generic operational alert
await telegram_service.send_alert_message(
    text="⚠️ LINE API circuit opened — check connectivity",
    db=db,
)
```

**Credential resolution order:**
1. `Provider.TELEGRAM` credential in DB (`credential.credentials["bot_token"]`, `metadata_json["admin_chat_id"]`)
2. `settings.TELEGRAM_BOT_TOKEN` and `settings.TELEGRAM_ADMIN_CHAT_ID` (env)
3. If neither configured → logs WARNING, returns `False`

---

## Common Issues

### "LINE API circuit is open" RuntimeError

**Cause:** 5+ consecutive LINE API failures (network issue, invalid token, rate limit).
**Fix:**
```bash
# Check backend logs for root cause:
#   "LINE circuit opened after 5 failures; operation=... error=..."
# Circuit auto-recovers in 30 seconds.
# Force-reset if needed:
python -c "from app.services.line_service import line_service; line_service._cb_failures=0; line_service._cb_open_until=None; print('reset')"
```

### `reply_flex()` sends blank or broken message

**Cause:** Passing an SDK `FlexMessage` object instead of a raw `dict` to `reply_flex()`.
**Fix:** Pass the raw `dict` contents. `reply_flex()` calls `FlexContainer.from_dict()` internally. If you already have a `FlexMessage` SDK object, use `reply_messages()` instead.

### Image not displaying in LINE (URL rejected)

**Cause:** Media URL is relative (`/uploads/line_media/...`) or uses HTTP, not HTTPS.
**Fix:** Set `SERVER_BASE_URL=https://your-domain.com` in `backend/.env`. LINE API requires HTTPS for all media URLs.

### Telegram notification not sent ("Telegram bot token or chat ID not configured")

**Cause:** Neither DB credential nor env vars are configured.
**Fix:**
```bash
# Option A: set in .env
TELEGRAM_BOT_TOKEN=123456:ABC...
TELEGRAM_ADMIN_CHAT_ID=-100123456789

# Option B: add via admin panel → Settings → LINE/Telegram credentials
# Uses Provider.TELEGRAM in the credentials table
```

### Push messages not arriving for users

**Cause:** User has blocked the LINE OA, or LINE API quota exceeded.
**Fix:** Check backend logs for `ApiException` from `push_messages`. If quota, check LINE Messaging API plan (basic plan has monthly push limit).

### Rich menu sync fails ("LINE ID exists but menu not found on LINE")

**Cause:** The rich menu was manually deleted on LINE Developer Console but `line_rich_menu_id` still exists in DB.
**Fix:** Clear `line_rich_menu_id` in the `rich_menus` table, then re-sync:
```sql
UPDATE rich_menus SET line_rich_menu_id = NULL, sync_status = 'PENDING' WHERE id = {id};
```

---

## Quality Checklist

Before finishing, verify:

- [ ] Using `reply_*` only when a `reply_token` is available (webhook context)
- [ ] Using `push_*` for operator sends, scheduled messages, or follow-ups
- [ ] `reply_flex()` receives a `dict`, NOT a `FlexMessage` SDK object
- [ ] `reply_messages()` / `push_messages()` receive SDK message objects, NOT dicts
- [ ] `save_message()` called with explicit `MessageDirection.INCOMING` / `OUTGOING`
- [ ] `persist_line_media()` / `persist_operator_upload()` return URL verified — HTTPS if production
- [ ] Circuit breaker awareness: code calling `line_service.*` is wrapped in try/except
- [ ] `show_loading_animation()` called BEFORE heavy processing, not after
- [ ] `RichMenuService` calls wrapped in try/except (no circuit protection)
- [ ] Telegram credentials configured (DB or env) before calling notification methods

---

*See `references/api_reference.md` for full method signatures, circuit breaker state machine, and media file path reference.*
