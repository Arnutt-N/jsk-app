---
name: skn-line-flex-builder
description: >
  Manages LINE integration, specifically building and managing Flex Message templates for SKN App.
  Use when asked to "create flex message", "build LINE template",
  "modify webhook handler", "debug LINE event",
  "สร้าง flex message", "ตั้งค่า rich menu", "debug LINE event".
  Do NOT use for creating FastAPI models or Next.js components.
compatibility: SKN App, LINE Messaging API v3, Python 3.11+
metadata:
  category: line-integration
  tags: [line, webhook, liff, flex-message]
---

# LINE Flex Message Builder Skill

Provides instructions and best practices for constructing, validating, and sending LINE Flex Messages within the SKN App backend.

---

## CRITICAL: LINE Integration Rules

1. **Webhook must process in BackgroundTasks** — always return fast (HTTP 200 OK within 1 second), process the actual LINE event async to avoid timeouts from the LINE platform.
2. **Always verify LIFF tokens on backend** — never trust client-side decoded data.
3. **Use lazy initialization for LINE SDK** — `get_line_bot_api()` instead of a module-level global instance to avoid startup crashes if tokens are missing.

---

## Context7 Docs

Context7 MCP is active. Use before writing linebot v3 SDK or Flex Message code to ensure you are using the V3 API which has breaking changes from V2.

| Library | Resolve Name | Key Topics |
|---|---|---|
| LINE Bot SDK (Python) | `"line-bot-sdk-python"` | FlexMessage, FlexContainer, QuickReply |
| LINE Messaging API | `"line-messaging-api"` | Flex component schemas, rate limits |

Usage: `mcp__context7__resolve-library-id libraryName="line-bot-sdk-python"` →
`mcp__context7__get-library-docs context7CompatibleLibraryID="..." topic="FlexMessage v3" tokens=5000`

---

## Step 1: Design the Flex JSON

Use the [LINE Flex Message Simulator](https://developers.line.biz/flex-simulator/) to design the JSON payload. Ensure sizes and text wrapping are configured correctly.

## Step 2: Create the Template Builder

File: `backend/app/services/flex_messages.py`

```python
from linebot.v3.messaging import (
    FlexMessage,
    FlexContainer
)
import json

def build_[feature]_flex(title: str, description: str, action_url: str) -> FlexMessage:
    bubble_string = f"""
    {{
      "type": "bubble",
      "header": {{
        "type": "box",
        "layout": "vertical",
        "contents": [
          {{
            "type": "text",
            "text": "{title}",
            "weight": "bold",
            "size": "xl",
            "color": "#172554"
          }}
        ]
      }},
      "body": {{
        "type": "box",
        "layout": "vertical",
        "contents": [
          {{
            "type": "text",
            "text": "{description}",
            "wrap": true
          }}
        ]
      }},
      "footer": {{
        "type": "box",
        "layout": "vertical",
        "contents": [
          {{
            "type": "button",
            "action": {{
              "type": "uri",
              "label": "View Details",
              "uri": "{action_url}"
            }},
            "style": "primary",
            "color": "#2563eb"
          }}
        ]
      }}
    }}
    """
    
    # Parse the string to dict, then strictly load into FlexContainer
    dict_payload = json.loads(bubble_string)
    container = FlexContainer.from_dict(dict_payload)
    
    return FlexMessage(
        alt_text="You have a new notification",
        contents=container
    )
```

## Step 3: Implement Webhook Fast-Return Pattern

File: `backend/app/api/v1/endpoints/webhook.py`

```python
from fastapi import APIRouter, Request, BackgroundTasks
from linebot.v3.webhook import WebhookParser
from app.core.config import settings
from app.services.line_service import process_events

router = APIRouter()
parser = WebhookParser(settings.LINE_CHANNEL_SECRET)

@router.post("/webhook")
async def webhook(request: Request, background_tasks: BackgroundTasks):
    body = await request.body()
    body_decode = body.decode('utf-8')
    signature = request.headers.get("x-line-signature", "")
    
    # validate signature first (synchronously)
    events = parser.parse(body_decode, signature)
    
    # Process asynchronously to ensure < 1s response to LINE
    background_tasks.add_task(process_events, events)
    
    return {"status": "ok"}
```

---

## Examples

### Example 1: Create a Status Update Notification

**User says:** "สร้าง flex message สำหรับแจ้งเตือนสถานะ" (Create status update flex message)

**Actions:**
1. Generate the JSON layout for a Status Update card.
2. Create a builder function `build_status_update_flex(status, tracking_id)` in `flex_messages.py`.
3. Read the Context7 docs for `line-bot-sdk-python` to ensure standard `FlexMessage` construction is used.

**Result:** A python function returning a valid `FlexMessage` object ready for the push/reply API.

---

## Common Issues

### Webhook Timeout (Red Error on LINE OA Manager)
**Cause:** Attempting to query the database or call external APIs synchronously inside the `/webhook` route.
**Fix:** Move all heavy processing into `BackgroundTasks` as shown in Step 3.

### Invalid Flex JSON Structure
**Cause:** Missing required properties or syntax errors when using Python f-strings to inject JSON.
**Fix:** Remember to escape raw curly braces `{{` and `}}` when using f-strings for JSON building.

---

## Quality Checklist

Before finishing, verify:
- [ ] Logic relies on `BackgroundTasks` for webhook responses
- [ ] No module-level instantiation of LINE Bot API clients
- [ ] `alt_text` properly describes the message for push notifications and accessibility
