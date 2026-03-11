---
name: line_messaging_advanced
description: >
  Advanced implementation patterns for High-Volume LINE OA, Flex Messages, and Rich Menus.
  Reference standard for SKN App. Use when needing general guidance, 
  "อ้างอิง", "ดูคู่มือ", "standard".
compatibility: SKN App Project
metadata:
  category: reference
  tags: [reference, line-messaging-advanced]
---

# LINE Messaging Advanced


## Context7 Docs

Context7 MCP is active. Always attempt to use `mcp__context7__resolve-library-id` for any libraries discussed in this standard to retrieve the most up-to-date documentation.

## 1. Webhook Architecture

### 1.1 Signature Validation
Security First. Middleware must reject requests with invalid signatures immediately.

### 1.2 Deduplication
LINE may resend webhooks if your server doesn't respond with 200 OK fast enough (< 1s).
- **Pattern**: 
    1. Receive Webhook.
    2. Check `x-line-webhook-event-id` in Redis.
    3. If exists -> Ignore (Duplicate).
    4. If new -> Save to Redis (TTL 1 min) -> Process.

### 1.3 Async Processing
- **Queueing**: Push events to a background job (Celery/BullMQ) immediately.
- **Ack Fast**: Return HTTP 200 OK to LINE immediately after pushing to queue. Do not wait for business logic or OpenAI processing.

## 2. Flex Message Design System

### 2.1 Template Architecture
Avoid "Code-as-UI". Treat Flex Messaging like Frontend Code.
- Store Templates in `json` files or Database.
- Use a `FlexRenderer` service to inject data.

```python
# Template (stored in DB/File)
{
  "type": "bubble",
  "body": {
    "type": "box",
    "contents": [
      { "type": "text", "text": "{{ ticket_title }}" },
      { "type": "text", "text": "{{ status }}", "color": "{{ status_color }}" }
    ]
  }
}

# Usage
renderer.render("ticket_template", {"ticket_title": "Fix PC", "status": "Pending", "status_color": "#ff0000"})
```

### 2.2 Adaptive Design
- Provide alternative texts (`altText`) that are meaningful.
- Test on both iOS and Android (Rendering can differ slightly).

## 3. Rich Menu Management
- **Dynamic Switching**: Change Rich Menu based on User State (e.g., Registered vs Unregistered).
- **Alias API**: Use Rich Menu Aliases to switch menus without re-uploading images.
- **Personalized Menu**: Link specific Rich Menu ID to specific User ID (`POST /user/{userId}/richmenu/{richMenuId}`).

## 4. User Profile & Data Sync
- **Follow Event**: The best time to capture `displayName` and `pictureUrl`.
- **Sync Routine**: Periodically (or on interaction) double-check if user profile updated.
- **Unblock**: Handle `follow` event again when user unblocks.

## 5. Large Broadcasting
- **Multicast**: Use `multicast` endpoint for sending to up to 500 users at once.
- **Narrowcast**: Use LINE's demographic filters if possible to save costs.
- **Rate Limit**: Respect the headers. If you hit 429, back off exponentially.
