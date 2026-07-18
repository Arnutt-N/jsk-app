---
name: skn-webhook-handler
description: >
  Extends, debugs, or adds new event handlers to the SKN App LINE webhook pipeline.
  Use when asked to "add webhook event", "handle new LINE event", "add postback handler",
  "add special command", "fix webhook not responding", "webhook deduplication",
  "handle follow/unfollow", "เพิ่ม event ใน webhook", "เพิ่ม special command",
  "แก้ webhook ไม่ตอบ", "webhook duplicate", "handle follow event".
  Do NOT use for intent/keyword management (use skn-intent-manager),
  live chat WebSocket (use skn-live-chat-ops), or LINE Flex building (use skn-line-flex-builder).
license: MIT
compatibility: >
  SKN App (JskApp) backend. FastAPI, LINE Bot SDK v3 (linebot.v3.*),
  Redis deduplication. File: backend/app/api/v1/endpoints/webhook.py
metadata:
  author: SKN App Team
  version: 1.0.0
  project: skn-app
  category: line-integration
  tags: [webhook, line-bot, event-handler, fastapi, deduplication]
---

# skn-webhook-handler

Manages the SKN App LINE webhook pipeline: signature validation, event
routing (MessageEvent, PostbackEvent, FollowEvent, UnfollowEvent), the
7-step text message flow, deduplication via Redis, and special command
handlers.

---

## CRITICAL: Project-Specific Rules

1. **`BackgroundTasks` for all event processing** — the webhook endpoint returns `"OK"` immediately and adds `process_webhook_events` as a background task. Never `await` event processing directly in the endpoint.
2. **Redis deduplication on entry** — every event is checked against `webhook:event:{webhookEventId}` in Redis (TTL = 300 s). Duplicate events are silently skipped. Always preserve this check when adding new event types.
3. **`AsyncSessionLocal()` context manager** — `process_webhook_events` opens one shared `AsyncSession` for all events in the batch. Never open a new session per event inside the loop.
4. **LINE verify dummy token guard** — `handle_message_event` skips processing when `event.reply_token == "00000000000000000000000000000000"`. This is the LINE platform signature-verification ping. Never remove this guard.
5. **No HUMAN mode guard before intent matching** — the pipeline does NOT suppress bot responses when a user is in `ChatMode.HUMAN`. Incoming messages are always saved and broadcast to WebSocket operators; intent matching still runs. Only `handoff_service.check_handoff_keywords()` checks `chat_mode` (prevents double-handoff).
6. **`friend_service.get_or_create_user()` is mandatory first** — every `handle_message_event` call must call this before anything else. It guarantees the `User` record exists so WebSocket and live chat can reference it.
7. **Profile refresh with 24-hour stale window** — `friend_service.refresh_profile(force=False, stale_after_hours=24)` silently refreshes the profile if stale. Do not force-refresh on every message.
8. **`reply_token` is single-use** — once `reply_messages()` or `reply_text()` is called with the token, the token is consumed. Never send two replies with the same token. Use `line_service.push_messages(line_user_id, ...)` for follow-up messages.
9. **`parse_response()` handles `$object_id` references** — if `text_content` contains `$flex_1` or `$image_contact`, `parse_response()` resolves them to LINE message objects from the `reply_objects` table. Only call this for plain text responses; never call it for responses that have a JSONB `payload`.
10. **`resolve_payload_urls()` + `strip_flex_body()` before `FlexContainer.from_dict()`** — always run these two utils on any payload from DB before sending to LINE API. Skipping them causes relative `/api/v1/media/` URLs to fail.

---

## Context7 Docs

Context7 MCP is active. Use before writing LINE SDK event parsing or FastAPI BackgroundTasks patterns.

| Library | Resolve Name | Key Topics |
|---|---|---|
| LINE Bot SDK Python | `"line-bot-sdk-python"` | WebhookParser, MessageEvent, PostbackEvent, FollowEvent |
| FastAPI | `"fastapi"` | BackgroundTasks, Request, Header |
| SQLAlchemy | `"sqlalchemy"` | AsyncSession, AsyncSessionLocal context manager |

Usage: `mcp__context7__resolve-library-id libraryName="line-bot-sdk-python"` →
`mcp__context7__get-library-docs context7CompatibleLibraryID="..." topic="WebhookParser MessageEvent" tokens=5000`

---

## Architecture Overview

```
POST /api/v1/line/webhook
    │
    ├── 1. Validate x-line-signature (WebhookParser)
    │       └── InvalidSignatureError → 400
    │
    ├── 2. Return "OK" immediately
    │
    └── background_tasks.add_task(process_webhook_events, events)
            │
            ├── AsyncSessionLocal() context (one session for all events)
            │
            └── for event in events:
                    ├── Redis deduplication check (webhook:event:{id}, TTL=300s)
                    ├── MessageEvent  → handle_message_event(event, db)
                    ├── PostbackEvent → handle_postback_event(event, db)
                    ├── FollowEvent   → handle_follow_event(event, db)
                    └── UnfollowEvent → handle_unfollow_event(event, db)
```

### Message Event Pipeline (text messages)

```
handle_message_event(event, db)
    │
    ├── Guard: reply_token == "00000000..." → return (LINE verify ping)
    ├── friend_service.get_or_create_user()   ← guarantees User exists
    ├── friend_service.refresh_profile()      ← refresh if stale (24h)
    ├── user.last_message_at = now
    │
    ├── line_service.save_message(INCOMING)
    ├── ws_manager.broadcast_to_room(NEW_MESSAGE)
    ├── ws_manager.send_to_admin(CONVERSATION_UPDATE) for each admin
    │       └── unread_count = 0 if admin is in room, else get_unread_count()
    │
    ├── line_service.show_loading_animation()
    │
    ├── handoff_service.check_handoff_keywords() ← checks ChatMode.BOT only
    │       └── True → live_chat_service.initiate_handoff() → return
    │
    ├── Special commands (always run, regardless of chat_mode)
    │       ├── "ติดตาม" / "สถานะ" → handle_check_status()
    │       └── r"^0\d{9}$"        → handle_bind_phone()
    │
    ├── Intent matching (always runs, regardless of chat_mode)
    │       ├── 1. EXACT IntentKeyword match
    │       ├── 2. Legacy AutoReply EXACT
    │       ├── 3. CONTAINS IntentKeyword match (ilike '%keyword%')
    │       └── 4. Legacy AutoReply CONTAINS
    │
    ├── Build messages (payload → Flex, text_content → parse_response())
    │       └── max 5 messages (LINE limit)
    │
    └── line_service.reply_messages() + save_message(OUTGOING)

Non-text message path (image / sticker / file / video / audio):
    └── _extract_non_text_message() → save + broadcast WS (no bot reply)
```

### Core Files

| File | Role |
|---|---|
| `backend/app/api/v1/endpoints/webhook.py` | Main webhook endpoint + all event handlers |
| `backend/app/core/line_client.py` | `parser` (WebhookParser), `get_line_bot_api()` (lazy) |
| `backend/app/services/friend_service.py` | `get_or_create_user()`, `refresh_profile()`, follow/unfollow |
| `backend/app/services/handoff_service.py` | `check_handoff_keywords()`, HANDOFF_KEYWORDS list |
| `backend/app/services/response_parser.py` | `parse_response()` — resolves `$object_id` references |
| `backend/app/services/live_chat_service/` (package) | `initiate_handoff()` (handoff.py), `get_unread_count()` (unread.py) — same `live_chat_service` import/facade |
| `backend/app/services/csat_service.py` | `record_response()`, `get_thank_you_message()` |
| `backend/app/utils/url_utils.py` | `resolve_payload_urls()`, `strip_flex_body()` |
| `backend/app/services/flex_messages.py` | `build_request_status_list()` (service request Flex) |

---

## Step 1: Add a New LINE Event Type

To handle a new LINE event type (e.g., `VideoPlayCompleteEvent`):

### 1a. Import the event class

```python
# In webhook.py imports
from linebot.v3.webhooks import (
    MessageEvent,
    PostbackEvent,
    FollowEvent,
    UnfollowEvent,
    VideoPlayCompleteEvent,   # ← add here
)
```

### 1b. Add handler function

```python
async def handle_video_complete_event(event: VideoPlayCompleteEvent, db: AsyncSession):
    line_user_id = event.source.user_id
    tracking_id = event.video_play_complete.tracking_id
    logger.info(f"User {line_user_id} finished video {tracking_id}")

    # Example: send a follow-up message via push (NOT reply — no reply_token here)
    await line_service.push_messages(line_user_id, [
        TextMessage(text="Thank you for watching! Let us know if you have questions.")
    ])
```

### 1c. Register in `process_webhook_events`

```python
# In the event routing elif chain
if isinstance(event, MessageEvent):
    await handle_message_event(event, db)
elif isinstance(event, PostbackEvent):
    await handle_postback_event(event, db)
elif isinstance(event, FollowEvent):
    await handle_follow_event(event, db)
elif isinstance(event, UnfollowEvent):
    await handle_unfollow_event(event, db)
elif isinstance(event, VideoPlayCompleteEvent):   # ← add here
    await handle_video_complete_event(event, db)
```

---

## Step 2: Add a Special Command (Text Pattern)

Special commands intercept specific text before intent matching runs. They always
fire regardless of `chat_mode` (BOT or HUMAN).

Add new commands in `handle_message_event`, between the handoff check and intent matching:

```python
# Current special commands block (lines 196-205 in webhook.py)
if text == "ติดตาม" or text == "สถานะ":
    await handle_check_status(line_user_id, event.reply_token, db)
    return

if re.match(r"^0\d{9}$", text):
    await handle_bind_phone(text, line_user_id, event.reply_token, db)
    return

# ← Add your new command here, before "# 3. Find Intent"

if text.lower() in {"ping", "test"}:
    await line_service.reply_text(event.reply_token, "pong ✅")
    return
```

**Special command handler pattern:**

```python
async def handle_my_command(
    line_user_id: str,
    reply_token: str,
    db: AsyncSession
) -> None:
    """Handle a specific text command."""
    try:
        # Do DB lookups, build response...
        await line_service.reply_text(reply_token, "Your response here")
    except Exception as e:
        logger.error(f"Error in handle_my_command for {line_user_id}: {e}")
        await line_service.reply_text(reply_token, "ขออภัย เกิดข้อผิดพลาด")
```

**Always return after handling** — not returning causes intent matching to also fire.

---

## Step 3: Add a Postback Handler

Postback data format used in this project: `action=xxx` or `key|value|value`.

```python
async def handle_postback_event(event: PostbackEvent, db: AsyncSession):
    line_user_id = event.source.user_id
    data = event.postback.data

    await line_service.show_loading_animation(line_user_id)

    if data == "action=track_requests":
        await handle_check_status(line_user_id, event.reply_token, db)
    elif data.startswith("csat|"):
        await handle_csat_response(line_user_id, data, event.reply_token, db)
    elif data.startswith("confirm_cancel|"):    # ← add new handler here
        await handle_confirm_cancel(line_user_id, data, event.reply_token, db)
    else:
        pass  # Unknown postback — silently ignore
```

**Postback handler pattern:**

```python
async def handle_confirm_cancel(
    line_user_id: str,
    data: str,
    reply_token: str,
    db: AsyncSession
) -> None:
    """Handle postback: confirm_cancel|{request_id}"""
    try:
        parts = data.split("|")
        if len(parts) != 2:
            logger.warning(f"Invalid confirm_cancel postback: {data}")
            return
        request_id = int(parts[1])
        # ... cancel the request ...
        await line_service.reply_text(reply_token, "คำร้องถูกยกเลิกเรียบร้อยแล้ว")
    except (ValueError, IndexError) as e:
        logger.error(f"Error parsing postback '{data}': {e}")
    except Exception as e:
        logger.error(f"Error in handle_confirm_cancel: {e}")
```

---

## Step 4: Understand Deduplication

LINE may occasionally deliver the same webhook event twice. The project guards
against this using Redis with a 5-minute TTL.

```python
# In process_webhook_events — already implemented, do NOT modify
event_id = getattr(event, 'webhook_event_id', None)
if event_id:
    cache_key = f"webhook:event:{event_id}"   # WEBHOOK_EVENT_KEY_PREFIX = "webhook:event:"
    if await redis_client.exists(cache_key):
        logger.info(f"Duplicate webhook event {event_id}, skipping")
        continue
    await redis_client.setex(cache_key, settings.WEBHOOK_EVENT_TTL, "1")
    # settings.WEBHOOK_EVENT_TTL = 300 (5 minutes, in config.py)
```

**Debugging deduplication issues:**
- If events are silently dropped, check Redis: `KEYS webhook:event:*`
- If TTL is too short and duplicates slip through, increase `WEBHOOK_EVENT_TTL` in `config.py`
- `webhook_event_id` is `None` for some older LINE events — those are NOT deduplicated

---

## Step 5: The `$object_id` Reference System

`parse_response()` allows auto-reply `text_content` to embed reusable message objects
using `$object_id` syntax. These objects are stored in the `reply_objects` table.

```python
# Example auto-reply text_content:
# "ท่านสามารถดูข้อมูลที่ $flex_traffic และ $image_map ครับ"
#
# parse_response() splits this into:
# 1. TextMessage("ท่านสามารถดูข้อมูลที่  และ  ครับ")
# 2. FlexMessage from reply_objects where object_id = "flex_traffic"
# 3. ImageMessage from reply_objects where object_id = "image_map"
```

**When to use `parse_response()` vs direct payload handling:**

| Condition | Use |
|---|---|
| `IntentResponse.payload` is set (JSONB dict) | Direct: `FlexContainer.from_dict(strip_flex_body(resolve_payload_urls(payload)))` |
| `IntentResponse.text_content` has `$xxx` references | `parse_response(text_content, db)` |
| `IntentResponse.text_content` is plain text | `TextMessage(text=text_content)` |
| Legacy `AutoReply.text_content` | `parse_response(text_content, db)` |

**ObjectType enum values** (in `reply_objects` table):
`text` | `flex` | `image` | `sticker` | `video` | `audio` | `location` | `imagemap`

---

## Step 6: Non-Text Message Handling

Non-text messages (image, sticker, file, video, audio) are saved to DB and broadcast
to WebSocket operators but do NOT trigger any bot reply.

```python
# _extract_non_text_message() handles these types and returns (type, content, payload):
# image   → line_service.persist_line_media() → {"url", "preview_url", "content_type", "size"}
# sticker → {"package_id", "sticker_id", "sticker_resource_type"}
# file    → line_service.persist_line_media(media_type="file") → {"file_name", "size", "url"}
# video   → line_service.persist_line_media() → {"url", "content_type", "size"}
# audio   → same as video

# These are saved and broadcast for operators, then the handler returns (no bot reply)
```

**To add a new media type handler**, add an `if message_type == "..."` block in
`_extract_non_text_message()`:

```python
if message_type == "location":
    lat = getattr(message, "latitude", None)
    lon = getattr(message, "longitude", None)
    address = getattr(message, "address", "")
    return "location", address or "[Location]", {
        "line_message_id": line_message_id,
        "latitude": lat,
        "longitude": lon,
        "address": address,
    }
```

---

## Step 7: Handoff Keywords

The handoff keyword list lives in `backend/app/services/handoff_service.py`.

**Current hardcoded lists:**

```python
HANDOFF_KEYWORDS_EN = ["agent", "human", "operator", "support", ...]
HANDOFF_KEYWORDS_TH = ["เจ้าหน้าที่", "พูดกับเจ้าหน้าที่", "ขอคน", ...]
HANDOFF_KEYWORDS = HANDOFF_KEYWORDS_EN + HANDOFF_KEYWORDS_TH
```

**Matching logic:** `any(kw in text.lower() for kw in HANDOFF_KEYWORDS)`
- Case-insensitive substring match on the full message text
- Only fires when `user.chat_mode == ChatMode.BOT` (prevents double-handoff)

**To add a keyword at runtime** (persists until server restart):
```python
handoff_service.add_custom_keyword("new keyword here")
```

**Handoff flow when keyword detected:**
1. `live_chat_service.initiate_handoff(user, reply_token, db)` called
2. Checks `business_hours_service.is_within_business_hours()`:
   - Within hours: `user.chat_mode = HUMAN`, create `ChatSession(WAITING)`, send greeting + queue position, send Telegram notification
   - After hours: same but sends after-hours message with next open time
3. Handler returns `True` → webhook returns immediately (skips intent matching)

---

## Common Issues

### "Webhook returns 400 — Invalid signature"

**Cause:** `LINE_CHANNEL_SECRET` in `.env` doesn't match the channel.
**Fix:** Verify `settings.LINE_CHANNEL_SECRET` matches the LINE Developer Console channel secret.
```bash
# Test signature locally
python -c "from app.core.line_client import parser; print(parser)"
```

### "Webhook event processed twice"

**Cause:** Redis is down or `redis_client.exists()` raised an exception silently.
**Fix:**
```bash
docker-compose up -d redis
redis-cli KEYS "webhook:event:*"   # Check if dedup keys are being set
```

### "Bot responds in HUMAN mode / operator and bot both reply"

**Cause:** By design — the webhook does not suppress bot responses in HUMAN mode.
**Fix (if suppression is needed):** Add a guard after `friend_service.get_or_create_user()`:
```python
# Add after user creation, before intent matching
from app.models.user import ChatMode
if user.chat_mode == ChatMode.HUMAN:
    # Still save message and broadcast for operators
    return   # Skip bot response entirely
```

### "Special command not triggering"

**Cause:** Text has leading/trailing whitespace or different encoding.
**Fix:** The pipeline already calls `text.strip()` at line 126. For Thai text equality checks, use `.strip()` in your condition too.

### "Bot sends no reply but logs show intent found"

**Cause:** `payload` has relative URLs like `/api/v1/media/...` that LINE API rejects (requires HTTPS absolute URL).
**Fix:** Ensure `resolve_payload_urls(payload)` is called before `FlexContainer.from_dict()`. Also verify `settings.SERVER_BASE_URL` is set to the public HTTPS URL.

### "`$flex_1` not resolved in parse_response()"

**Cause:** No `ReplyObject` with `object_id = "flex_1"` in the DB, or `is_active = False`.
**Fix:** Check `reply_objects` table. The function logs `WARNING: ReplyObject not found: $flex_1`.

### "Follow event does not create user"

**Cause:** `handle_follow_event` calls `friend_service.handle_follow()` which only logs the event — user creation is done by `friend_service.get_or_create_user()`, which is only called in `handle_message_event`.
**Fix:** If you need user creation on follow, add `await friend_service.get_or_create_user(line_user_id, db)` to `handle_follow_event`.

---

## Quality Checklist

Before finishing, verify:

- [ ] New event type imported from `linebot.v3.webhooks`
- [ ] New handler added to the `elif` chain in `process_webhook_events`
- [ ] Deduplication block preserved (not removed or bypassed)
- [ ] `reply_token` used at most once per handler
- [ ] `reply_text` / `reply_messages` wrapped in try/except with fallback
- [ ] Payload passed through `resolve_payload_urls()` + `strip_flex_body()` before `FlexContainer.from_dict()`
- [ ] `parse_response()` used only for text responses (not when payload is set)
- [ ] Special commands: `return` after sending reply
- [ ] Postback data: length check before `.split()` access by index
- [ ] Non-text types: saved + WS broadcast (no bot reply unless explicitly added)
- [ ] Handler tested via LINE app or `ngrok` + LINE Messaging API Verify

---

*See `references/flow_reference.md` for the full event dispatch table and message-building decision tree.*
