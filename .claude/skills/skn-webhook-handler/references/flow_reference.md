# Webhook Handler — Flow Reference

Extracted from `backend/app/api/v1/endpoints/webhook.py`,
`handoff_service.py`, `friend_service.py`, and `response_parser.py`.

---

## Event Type Dispatch Table

| LINE Event Class | Import from | Handler | Key Data |
|---|---|---|---|
| `MessageEvent` | `linebot.v3.webhooks` | `handle_message_event` | `event.source.user_id`, `event.message`, `event.reply_token` |
| `PostbackEvent` | `linebot.v3.webhooks` | `handle_postback_event` | `event.source.user_id`, `event.postback.data`, `event.reply_token` |
| `FollowEvent` | `linebot.v3.webhooks` | `handle_follow_event` | `event.source.user_id` |
| `UnfollowEvent` | `linebot.v3.webhooks` | `handle_unfollow_event` | `event.source.user_id` |

---

## Text Message Decision Tree

```
text = event.message.text.strip()

Step 1 — Handoff check
    └── handoff_service.check_handoff_keywords(text, user, reply_token, db)
            ├── user.chat_mode != BOT → return False (skip, no double-handoff)
            ├── text contains any HANDOFF_KEYWORD → initiate_handoff() → return True
            └── return False → continue to step 2

Step 2 — Special commands
    ├── text in {"ติดตาม", "สถานะ"} → handle_check_status() → return
    └── text matches r"^0\d{9}$"    → handle_bind_phone()   → return

Step 3 — Intent matching (4 priority levels)
    ├── P1. IntentKeyword EXACT (== text, match_type=EXACT)
    │       └── found → category.responses (selectinload, is_active=True)
    ├── P2. AutoReply EXACT (keyword == text, is_active=True)
    ├── P3. IntentKeyword CONTAINS (text ilike '%keyword%', match_type=CONTAINS, LIMIT 1)
    │       └── found → category.responses (selectinload, is_active=True)
    └── P4. AutoReply CONTAINS (text ilike '%keyword%', is_active=True, LIMIT 1)
            └── none found → logger.info("No auto-reply or intent found") → return

Step 4 — Build messages (max 5, LINE limit)
    for each response:
        ├── payload set → resolve_payload_urls() → strip_flex_body() → FlexContainer
        │       └── text_content also set → TextMessage + FlexMessage (costs 2 slots)
        └── payload not set → parse_response(text_content, db)
                ├── $object_id in text → resolve ReplyObject from DB
                └── plain text → TextMessage(text=text_content)

Step 5 — Send & save
    └── line_service.reply_messages(event.reply_token, all_messages)
            └── for each sent msg: describe_line_message(msg) → (type, content, payload)
                    └── save_message(OUTGOING, type, content, payload, sender_role="BOT")
                (one row per LINE message with its REAL content — no more the old
                 single "Sent N messages for intent" summary row)
```

---

## Postback Data Formats

| Pattern | Handler | Parsing |
|---|---|---|
| `action=track_requests` | `handle_check_status()` | String equality |
| `csat\|{session_id}\|{score}` | `handle_csat_response()` | `data.split("\|")` → parts[1]=session_id, parts[2]=score |

---

## WebSocket Broadcast on Incoming Message

Every incoming text message triggers two WS broadcasts after being saved:

```
ws_manager.broadcast_to_room(room_id, {
    "type": "new_message",
    "payload": {id, line_user_id, direction="INCOMING", content, message_type, sender_role="USER", created_at}
})

for admin_id in ws_manager.get_connected_admin_ids():
    ws_manager.send_to_admin(admin_id, {
        "type": "conversation_update",
        "payload": {line_user_id, display_name, picture_url, chat_mode, last_message{content, created_at}, unread_count}
    })
    # unread_count = 0 if admin is currently in the room, else live_chat_service.get_unread_count()
```

---

## Handoff Keyword List

Defined in `backend/app/services/handoff_service.py`. Matching is case-insensitive substring.

### English Keywords
`agent`, `human`, `operator`, `representative`, `support`, `help desk`,
`live person`, `real person`, `talk to someone`, `speak to agent`,
`customer service`, `need help`, `talk to human`, `connect to agent`

### Thai Keywords
`พูดกับเจ้าหน้าที่`, `ติดต่อเจ้าหน้าที่`, `คุยกับคน`, `ขอคน`, `ต้องการคน`,
`เจ้าหน้าที่`, `ขอติดต่อแอดมิน`, `ต้องการความช่วยเหลือ`, `ขอความช่วยเหลือ`,
`ช่วยด้วย`, `คุยกับเจ้าหน้าที่`, `ต้องการเจ้าหน้าที่`, `ขอสาย`, `ต่อสาย`,
`คุยสด`, `เจ้าหน้าที่ให้คำปรึกษา`

---

## Handoff Flow

```
handoff_service.check_handoff_keywords() returns True
    │
    └── live_chat_service.initiate_handoff(user, reply_token, db)
            │
            ├── business_hours_service.is_within_business_hours(db) → False
            │       ├── reply_text(reply_token, after_hours_message)
            │       ├── ChatSession(status=WAITING, started_at=now)
            │       ├── user.chat_mode = HUMAN
            │       └── return session
            │
            └── Within hours:
                    ├── user.chat_mode = HUMAN
                    ├── ChatSession(status=WAITING, started_at=now) + db.flush()
                    ├── reply_text(reply_token, "เจ้าหน้าที่จะติดต่อกลับในไม่ช้า...")
                    ├── get_queue_position() → _send_queue_flex_message() if position > 0
                    ├── telegram_service.send_handoff_notification(name, pic, recent_msgs, admin_url)
                    └── db.commit() → return session
```

---

## Response Payload Processing (url_utils.py)

```python
from app.utils.url_utils import resolve_payload_urls, strip_flex_body

# Step 1: Convert /api/v1/media/... → https://domain.com/api/v1/media/...
resolved = resolve_payload_urls(payload)
# Uses settings.SERVER_BASE_URL. If not set, falls back to "http://localhost:8000" (won't work with LINE)

# Step 2: Strip body/header/footer from bubble if text is sent separately
stripped = strip_flex_body(resolved)
# bubble → keeps only {type, hero, size, styles}
# carousel → applies _strip_bubble() to each bubble in contents[]
# (Skip this step if you want to send the FULL flex without a separate text message)

# Step 3: Build LINE SDK container
container = FlexContainer.from_dict(stripped)
flex_msg = FlexMessage(alt_text="alt text here", contents=container)
```

---

## parse_response() — `$object_id` Resolution

```python
from app.services.response_parser import parse_response

messages = await parse_response("สวัสดีค่ะ $flex_welcome ดูข้อมูลเพิ่มเติมที่ $image_map", db)
# Returns: [TextMessage("สวัสดีค่ะ  ดูข้อมูลเพิ่มเติมที่"), FlexMessage(...), ImageMessage(...)]
# Max 5 messages returned ([:5] slice enforced)
```

**ObjectType → LINE message mapping:**

| ObjectType | LINE SDK Class | Required payload keys |
|---|---|---|
| `flex` | `FlexMessage` | Full Flex container dict |
| `image` | `ImageMessage` | `url`, `preview_url` |
| `sticker` | `StickerMessage` | `package_id`, `sticker_id` |
| `location` | `LocationMessage` | `title`, `address`, `latitude`, `longitude` |
| `text` | `TextMessage` | `text` |

---

## Non-Text Message Types

| `message.type` | `_extract_non_text_message()` returns | Media persisted? |
|---|---|---|
| `image` | `("image", "[Image]", {line_message_id, preview_url, url, content_type, size})` | Yes — `line_service.persist_line_media("image")` |
| `sticker` | `("sticker", "[Sticker pkg/id]", {line_message_id, package_id, sticker_id, sticker_resource_type})` | No |
| `file` | `("file", filename, {line_message_id, file_name, size, url, content_type})` | Yes — `persist_line_media("file", file_name)` |
| `video` | `("video", "[Video]", {line_message_id, url, content_type, size})` | Yes — `persist_line_media("video")` |
| `audio` | `("audio", "[Audio]", {line_message_id, url, content_type, size})` | Yes — `persist_line_media("audio")` |
| unknown | `(None, "", {})` → handler returns early | No |

All non-text messages are saved to DB (`save_message`) and broadcast to WS room.
**No bot reply is sent** for non-text messages.

---

## Redis Key Pattern

| Key | TTL | Purpose |
|---|---|---|
| `webhook:event:{webhookEventId}` | 300 s (5 min) | Deduplication — prevents duplicate event processing |

Constant: `WEBHOOK_EVENT_KEY_PREFIX = "webhook:event:"`
Config: `settings.WEBHOOK_EVENT_TTL = 300`

---

## LINE Verify Dummy Token

When the LINE Developer Console sends a test webhook (clicking "Verify"), it uses:
```python
event.reply_token == "00000000000000000000000000000000"
```
This is a 32-zero string. The guard at the top of `handle_message_event` checks this and returns immediately, preventing any DB writes or replies.
