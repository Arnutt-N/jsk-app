# LINE Flex Message — Component & Property Reference

Adapted from `.agents/skills/line_flex_message_builder` with SKN App-specific additions.

---

## Container Types

### Bubble

Single card with optional header, hero, body, footer sections.

```python
{
    "type": "bubble",
    "size": "kilo",              # nano/micro/kilo/mega/giga
    "header": { ... },           # optional — usually colored title bar
    "hero": { ... },             # optional — full-width image
    "body": { ... },             # main content
    "footer": { ... }            # optional — action buttons
}
```

| Size | Width | Use Case |
|------|-------|---------|
| `nano` | 120px | Tiny badge-like card |
| `micro` | 140px | Compact list item |
| `kilo` | 210px | Standard notification |
| `mega` | 300px | Default (most cards) |
| `giga` | 500px | Full-width rich card |

### Carousel

Horizontal scroll container of bubbles. Max 10 bubbles.

```python
{
    "type": "carousel",
    "contents": [
        { "type": "bubble", ... },
        { "type": "bubble", ... }
    ]
}
```

---

## Layout Components

### Box

Container that arranges children horizontally, vertically, or on a baseline.

```python
{
    "type": "box",
    "layout": "vertical",        # vertical / horizontal / baseline
    "spacing": "sm",             # space between children
    "paddingAll": "lg",          # inner padding (or paddingTop/Bottom/Start/End)
    "backgroundColor": "#f5f5f5",
    "cornerRadius": "8px",       # border radius
    "contents": [ ... ]          # child components
}
```

| Property | Values |
|---------|--------|
| `layout` | `vertical`, `horizontal`, `baseline` |
| `spacing` | `none`, `xs`, `sm`, `md`, `lg`, `xl`, `xxl` |
| `paddingAll` | `none`, `xs`, `sm`, `md`, `lg`, `xl`, `xxl` |
| `flex` | 0–10 (proportional width in horizontal layout) |
| `margin` | `none`, `xs`, `sm`, `md`, `lg`, `xl`, `xxl` |

---

## Content Components

### Text

```python
{
    "type": "text",
    "text": "Hello World",
    "size": "md",
    "weight": "bold",
    "color": "#333333",
    "wrap": True,                # allow text wrapping
    "align": "center",           # start / center / end
    "decoration": "none",        # none / underline / line-through
    "flex": 0                    # space allocation (in horizontal box)
}
```

| `size` | Pixels |
|--------|--------|
| `xxs` | 9px |
| `xs` | 11px |
| `sm` | 13px |
| `md` | 14px (default) |
| `lg` | 16px |
| `xl` | 19px |
| `xxl` | 22px |
| `3xl` | 36px |

### Image

```python
{
    "type": "image",
    "url": "https://example.com/image.jpg",   # HTTPS required
    "size": "full",
    "aspectRatio": "16:9",
    "aspectMode": "cover",                    # cover / fit
    "action": { ... }                          # optional tap action
}
```

### Button

```python
{
    "type": "button",
    "style": "primary",          # primary (green) / secondary (white) / link (text)
    "height": "md",              # sm / md
    "action": {
        "type": "uri",
        "label": "ดูรายละเอียด",
        "uri": "https://example.com"
    }
}
```

### Separator

```python
{
    "type": "separator",
    "color": "#eeeeee",
    "margin": "md"
}
```

### Spacer

```python
{
    "type": "spacer",
    "size": "md"                 # xs / sm / md / lg / xl / xxl
}
```

### Filler

Pushes sibling components to opposite ends of a horizontal box.

```python
{"type": "filler"}
```

---

## Actions

### URI Action — Open URL

```python
{
    "type": "uri",
    "label": "View",
    "uri": "https://example.com"
}
```

### Message Action — Send Text Message

```python
{
    "type": "message",
    "label": "Say Hello",
    "text": "Hello!"
}
```

### Postback Action — Send Data to Webhook

```python
{
    "type": "postback",
    "label": "Select",
    "data": "action=select&id=123",
    "displayText": "Selected item"   # shown in chat as user's message
}
```

---

## Spacing Token Reference

| Token | px Value |
|-------|----------|
| `none` | 0px |
| `xs` | 4px |
| `sm` | 8px |
| `md` | 12px |
| `lg` | 16px |
| `xl` | 20px |
| `xxl` | 24px |

---

## Quick Reply (SDK — not JSON)

Quick reply is set on the SDK message object, not inside the flex container.

```python
from linebot.v3.messaging import (
    QuickReply, QuickReplyItem,
    MessageAction, PostbackAction, URIAction
)

quick_reply = QuickReply(items=[
    QuickReplyItem(action=MessageAction(label="ดูคำร้อง", text="ดูคำร้องของฉัน")),
    QuickReplyItem(action=PostbackAction(
        label="ติดต่อเจ้าหน้าที่",
        data="action=contact_agent",
        display_text="ติดต่อเจ้าหน้าที่"
    )),
])
# Attach to TextMessage:
TextMessage(text="...", quick_reply=quick_reply)
# Attach to FlexMessage:
FlexMessage(alt_text="...", contents=container, quick_reply=quick_reply)
```

---

## SKN App Status Color Map

```python
STATUS_MAP = {
    "PENDING":           {"text": "รอดำเนินการ",     "color": "#F59E0B"},  # Amber
    "IN_PROGRESS":       {"text": "กำลังดำเนินงาน", "color": "#3B82F6"},  # Blue
    "AWAITING_APPROVAL": {"text": "รออนุมัติ",        "color": "#6366F1"},  # Indigo
    "COMPLETED":         {"text": "เสร็จสิ้น",        "color": "#10B981"},  # Emerald
    "REJECTED":          {"text": "ยกเลิก/ปฏิเสธ",   "color": "#EF4444"},  # Rose
}
status_info = STATUS_MAP.get(str(obj.status), {"text": str(obj.status), "color": "#999999"})
```

---

## LINE API Limits (Quick Reference)

| Constraint | Limit |
|---|---|
| Messages per API call | 5 max |
| Flex Message JSON size | 30 KB per bubble |
| Carousel bubbles | 10 max |
| Quick reply items | 13 max |
| Multicast recipients | 500 max |
| Reply token validity | 1 minute, single use |
| Send reply rate | 2,000 req/sec |
| Send push rate | 2,000 req/sec |

---

## LineService Methods (SKN App)

```python
from app.services.line_service import line_service

# Reply Flex (inside webhook handler, has reply_token)
await line_service.reply_flex(reply_token, alt_text, contents_dict)

# Push messages proactively (no reply_token)
await line_service.push_messages(line_user_id, [msg1, msg2])  # max 5

# Reply multiple messages
await line_service.reply_messages(reply_token, [msg1, msg2])  # max 5

# Push image
await line_service.push_image_message(line_user_id, image_url, preview_url)

# Show typing indicator
await line_service.show_loading_animation(chat_id, loading_seconds=20)
```

---

## File Reference Map

```
backend/app/
├── services/
│   ├── flex_messages.py          ← Add build_*() functions here
│   └── line_service.py           ← LineService singleton: reply_flex, push_messages
├── core/
│   └── line_client.py            ← get_line_bot_api() lazy singleton
└── api/v1/endpoints/
    └── webhook.py                ← Webhook handler — source of reply_token
```
