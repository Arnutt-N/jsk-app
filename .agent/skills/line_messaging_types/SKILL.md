---
name: line_messaging_types
description: >
  Complete reference for LINE Messaging API message types, webhook events, and message structures. Use when implementing message handling, parsing webhooks, or constructing replies.
  Reference standard for SKN App. Use when needing general guidance, 
  "อ้างอิง", "ดูคู่มือ", "standard".
compatibility: SKN App Project
metadata:
  category: reference
  tags: [reference, line-messaging-types]
---

# LINE Messaging API - Message Types Reference


## Context7 Docs

Context7 MCP is active. Always attempt to use `mcp__context7__resolve-library-id` for any libraries discussed in this standard to retrieve the most up-to-date documentation.

> **Quick Reference**: This skill provides comprehensive specifications for all LINE Messaging API message types, webhook events, and common features. Use this when implementing message parsers, constructing replies, or handling webhook events.

---

## Table of Contents

1. [Overview](#overview)
2. [Message Type Summary](#message-type-summary)
3. [Incoming Message Types (Webhook)](#incoming-message-types-webhook)
4. [Outgoing Message Types](#outgoing-message-types)
5. [Webhook Event Types](#webhook-event-types)
6. [Common Features](#common-features)
7. [Rate Limits & Constraints](#rate-limits--constraints)
8. [Code Examples](#code-examples)

---

## Overview

### Architecture Flow

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│   LINE User │────▶│ LINE Platform│────▶│  Your Webhook   │
│             │     │              │     │    Server       │
└─────────────┘     └──────────────┘     └─────────────────┘
                                                │
                                                ▼
                                        ┌─────────────────┐
                                        │ Process Event   │
                                        │ Send Reply/Push │
                                        └─────────────────┘
```

### Key Concepts

| Concept | Description |
|---------|-------------|
| **Reply Token** | One-time token for sending reply messages (valid for 1 minute) |
| **User ID** | Unique identifier for LINE users (`U[0-9a-f]{32}`) |
| **Channel Access Token** | Authentication token for API calls |
| **Webhook Signature** | HMAC-SHA256 signature for security validation |

---

## Message Type Summary

### Incoming Messages (User → Bot)

| Type | Description | Key Fields |
|------|-------------|------------|
| `text` | Text messages with emojis/mentions | `text`, `emojis[]`, `mention` |
| `image` | JPEG/PNG images | `contentProvider`, `imageSet` |
| `video` | MP4 videos | `duration`, `contentProvider` |
| `audio` | Audio files | `duration`, `contentProvider` |
| `file` | Arbitrary files | `fileName`, `fileSize` |
| `location` | GPS coordinates | `title`, `address`, `latitude`, `longitude` |
| `sticker` | LINE stickers | `packageId`, `stickerId`, `stickerResourceType` |

### Outgoing Messages (Bot → User)

| Type | Description | Use Case |
|------|-------------|----------|
| `text` | Simple text messages | Quick responses |
| `text-v2` | Text with emoji/mention placeholders | Rich text formatting |
| `sticker` | Official LINE stickers | Expressive reactions |
| `image` | External image URLs | Visual content |
| `video` | External video URLs | Media content |
| `audio` | External audio URLs | Voice messages |
| `location` | Map coordinates | Location sharing |
| `imagemap` | Interactive image maps | Complex image interactions |
| `template` | Predefined layouts | Structured content |
| `flex` | Custom CSS-like layouts | Rich UI experiences |

---

## Incoming Message Types (Webhook)

### Text Message

```json
{
  "type": "message",
  "message": {
    "type": "text",
    "id": "14353798921116",
    "quoteToken": "q3Plxr4AgKd...",
    "markAsReadToken": "30yhdy232...",
    "text": "Hello @example Good Morning!! (love)",
    "emojis": [
      {
        "index": 29,
        "length": 6,
        "productId": "5ac1bfd5040ab15980c9b435",
        "emojiId": "001"
      }
    ],
    "mention": {
      "mentionees": [
        {
          "index": 6,
          "length": 8,
          "userId": "U49585cd0d5...",
          "type": "user",
          "isSelf": false
        }
      ]
    }
  },
  "timestamp": 1625665242211,
  "source": {
    "type": "user",
    "userId": "U80696558e1aa831..."
  },
  "replyToken": "757913772c4646b784d4b7ce46d12671",
  "mode": "active",
  "webhookEventId": "01FZ74A0TDDPYRVKNK77XKC3ZR",
  "deliveryContext": { "isRedelivery": false }
}
```

**Key Properties:**

| Property | Type | Description |
|----------|------|-------------|
| `text` | String | Message text (max 5000 chars) |
| `emojis[]` | Array | LINE emoji positions (optional) |
| `mention.mentionees[]` | Array | User mentions (optional) |
| `quoteToken` | String | Token for quoting this message |
| `markAsReadToken` | String | Token to mark message as read |

**Emoji Format:**
- Default emojis appear as `(hello)`, `(love)` in text
- Unicode emojis appear normally
- Check `emojis[]` array for LINE emoji details

### Image Message

```json
{
  "type": "image",
  "id": "354718705033693859",
  "quoteToken": "q3Plxr4AgKd...",
  "markAsReadToken": "30yhdy232...",
  "contentProvider": {
    "type": "line"
  },
  "imageSet": {
    "id": "E005D41A7288F41B65593ED38FF6E9834B046AB36A37921A56BC236F13A91855",
    "index": 1,
    "total": 2
  }
}
```

**Content Provider Types:**

| Type | Description |
|------|-------------|
| `line` | Image stored on LINE servers - use `Get content` API |
| `external` | External URL - use `contentProvider.originalContentUrl` |

**Image Set (Multiple Images):**
- Users can send up to 20 images simultaneously
- Each image has same `imageSet.id` with different `index`
- Webhooks may arrive in undefined order

### Video Message

```json
{
  "type": "video",
  "id": "325708",
  "quoteToken": "q3Plxr4AgKd...",
  "markAsReadToken": "30yhdy232...",
  "duration": 60000,
  "contentProvider": {
    "type": "external",
    "originalContentUrl": "https://example.com/original.mp4",
    "previewImageUrl": "https://example.com/preview.jpg"
  }
}
```

**Specifications:**
- Format: MP4
- Max size: 200 MB (for external URLs)
- `duration` in milliseconds (may not be included)

### Audio Message

```json
{
  "type": "audio",
  "id": "325708",
  "markAsReadToken": "30yhdy232...",
  "duration": 60000,
  "contentProvider": {
    "type": "line"
  }
}
```

### File Message

```json
{
  "type": "file",
  "id": "325708",
  "markAsReadToken": "30yhdy232...",
  "fileName": "document.pdf",
  "fileSize": 2138
}
```

### Location Message

```json
{
  "type": "location",
  "id": "325708",
  "markAsReadToken": "30yhdy232...",
  "title": "Tokyo Station",
  "address": "1 Chome Marunouchi, Chiyoda City, Tokyo 100-0005, Japan",
  "latitude": 35.681236,
  "longitude": 139.767125
}
```

### Sticker Message

```json
{
  "type": "sticker",
  "id": "1501597916",
  "quoteToken": "q3Plxr4AgKd...",
  "markAsReadToken": "30yhdy232...",
  "stickerId": "52002738",
  "packageId": "11537",
  "stickerResourceType": "ANIMATION",
  "keywords": ["cony", "sally", "hello", "wave"],
  "text": "Let's hang out this weekend!"
}
```

**Sticker Resource Types:**

| Type | Description |
|------|-------------|
| `STATIC` | Still image |
| `ANIMATION` | Animated sticker |
| `SOUND` | Sticker with sound |
| `ANIMATION_SOUND` | Animated with sound |
| `POPUP` | Pop-up/Effect sticker |
| `POPUP_SOUND` | Pop-up with sound |
| `CUSTOM` | Custom sticker (text not retrievable) |
| `MESSAGE` | Message sticker with user text |

**Important Notes:**
- Sticker images **cannot** be retrieved via API
- Use sticker list reference for available stickers
- Sticker arranging feature returns fixed IDs (packageId: 30563, stickerId: 651698630)

---

## Outgoing Message Types

### Text Message

```json
{
  "type": "text",
  "text": "Hello, World!"
}
```

**Limits:**
- Max length: 5000 characters
- Supports emojis and Unicode

### Text Message (v2) with Placeholders

```json
{
  "type": "textV2",
  "text": "Hello, {user_name}! {greeting_emoji}",
  "substitution": {
    "user_name": {
      "type": "mention",
      "mentionee": {
        "type": "user",
        "userId": "U850014438e..."
      }
    },
    "greeting_emoji": {
      "type": "emoji",
      "productId": "5ac1bfd5040ab15980c9b435",
      "emojiId": "001"
    }
  }
}
```

### Sticker Message

```json
{
  "type": "sticker",
  "packageId": "11537",
  "stickerId": "52002738"
}
```

**Available Stickers:**
- Check [LINE Sticker List](https://developers.line.biz/en/docs/messaging-api/sticker-list/)
- Only specific stickers can be sent by bots

### Image Message

```json
{
  "type": "image",
  "originalContentUrl": "https://example.com/original.jpg",
  "previewImageUrl": "https://example.com/preview.jpg"
}
```

**Requirements:**
- Formats: JPEG, PNG
- Max size: 20 MB (original), 1 MB (preview)
- Must use HTTPS (TLS 1.2+)
- Preview displayed in chat, original on tap

### Video Message

```json
{
  "type": "video",
  "originalContentUrl": "https://example.com/video.mp4",
  "previewImageUrl": "https://example.com/preview.jpg",
  "trackingId": "track-id"
}
```

**Requirements:**
- Format: MP4
- Max size: 200 MB
- `trackingId` optional for tracking views

### Audio Message

```json
{
  "type": "audio",
  "originalContentUrl": "https://example.com/audio.mp3",
  "duration": 60000
}
```

**Requirements:**
- Format: MP3, M4A
- `duration` in milliseconds (required)

### Location Message

```json
{
  "type": "location",
  "title": "Tokyo Station",
  "address": "Marunouchi, Chiyoda City, Tokyo",
  "latitude": 35.681236,
  "longitude": 139.767125
}
```

### Template Messages

#### Buttons Template

```json
{
  "type": "template",
  "altText": "This is a buttons template",
  "template": {
    "type": "buttons",
    "thumbnailImageUrl": "https://example.com/image.jpg",
    "imageAspectRatio": "rectangle",
    "imageSize": "cover",
    "imageBackgroundColor": "#FFFFFF",
    "title": "Menu",
    "text": "Please select",
    "defaultAction": {
      "type": "uri",
      "label": "View detail",
      "uri": "http://example.com/page/123"
    },
    "actions": [
      {
        "type": "postback",
        "label": "Buy",
        "data": "action=buy&itemid=123"
      },
      {
        "type": "postback",
        "label": "Add to cart",
        "data": "action=add&itemid=123"
      },
      {
        "type": "uri",
        "label": "View detail",
        "uri": "http://example.com/page/123"
      }
    ]
  }
}
```

#### Confirm Template

```json
{
  "type": "template",
  "altText": "This is a confirm template",
  "template": {
    "type": "confirm",
    "text": "Are you sure?",
    "actions": [
      {
        "type": "message",
        "label": "Yes",
        "text": "yes"
      },
      {
        "type": "message",
        "label": "No",
        "text": "no"
      }
    ]
  }
}
```

#### Carousel Template

```json
{
  "type": "template",
  "altText": "This is a carousel template",
  "template": {
    "type": "carousel",
    "columns": [
      {
        "thumbnailImageUrl": "https://example.com/item1.jpg",
        "imageBackgroundColor": "#FFFFFF",
        "title": "this is menu",
        "text": "description",
        "defaultAction": {
          "type": "uri",
          "uri": "https://example.com/page/111"
        },
        "actions": [
          {
            "type": "postback",
            "label": "Buy",
            "data": "action=buy&itemid=111"
          }
        ]
      }
    ],
    "imageAspectRatio": "rectangle",
    "imageSize": "cover"
  }
}
```

**Template Limits:**
- Buttons: 4 action buttons max
- Confirm: 2 action buttons only
- Carousel: 10 columns max
- Image carousel: 10 images max

### Flex Message

```json
{
  "type": "flex",
  "altText": "This is a Flex Message",
  "contents": {
    "type": "bubble",
    "header": {
      "type": "box",
      "layout": "vertical",
      "contents": [
        {
          "type": "text",
          "text": "Header text"
        }
      ]
    },
    "hero": {
      "type": "image",
      "url": "https://example.com/flex/images/image.jpg"
    },
    "body": {
      "type": "box",
      "layout": "vertical",
      "contents": [
        {
          "type": "text",
          "text": "Body text"
        }
      ]
    },
    "footer": {
      "type": "box",
      "layout": "vertical",
      "contents": [
        {
          "type": "button",
          "action": {
            "type": "uri",
            "label": "Go",
            "uri": "https://example.com"
          }
        }
      ]
    }
  }
}
```

**Flex Message Specs:**
- Max JSON size: 30 KB per bubble
- Container types: `bubble`, `carousel`
- Bubble sizes: `nano`(120px), `micro`(140px), `kilo`(210px), `mega`(300px), `giga`(500px)

---

## Webhook Event Types

### Message Event

Triggered when a user sends a message to your bot.

```json
{
  "type": "message",
  "timestamp": 1625665242211,
  "source": {
    "type": "user",
    "userId": "U80696558e1aa831..."
  },
  "replyToken": "757913772c4646b784d4b7ce46d12671",
  "message": { /* message object */ },
  "mode": "active",
  "webhookEventId": "01FZ74A0TDDPYRVKNK77XKC3ZR",
  "deliveryContext": { "isRedelivery": false }
}
```

### Follow Event

User adds your bot as a friend or unblocks.

```json
{
  "type": "follow",
  "timestamp": 1625665242211,
  "source": { "type": "user", "userId": "U4af4980629..." },
  "replyToken": "85cbe770fa8b4f45bbe077b1d4be4a36",
  "follow": { "isUnblocked": false },
  "mode": "active",
  "webhookEventId": "01HMQGW40RZJPJM3RAJP7BHC2Q"
}
```

### Unfollow Event

User blocks your bot.

```json
{
  "type": "unfollow",
  "timestamp": 1625665242211,
  "source": { "type": "user", "userId": "U4af4980629..." },
  "mode": "active",
  "webhookEventId": "01FZ74A0TDDPYRVKNK77XKC3ZR"
}
```

### Join Event

Bot joins a group chat or multi-person chat.

```json
{
  "type": "join",
  "timestamp": 1625665242211,
  "source": { "type": "group", "groupId": "C4af4980629..." },
  "replyToken": "nHuyWiB7yP5Zw52FIkcQobQuGDXCTA",
  "mode": "active"
}
```

### Leave Event

Bot leaves or is removed from a chat.

```json
{
  "type": "leave",
  "timestamp": 1625665242211,
  "source": { "type": "group", "groupId": "C4af4980629..." },
  "mode": "active"
}
```

### Member Join Event

Users join a group your bot is in.

```json
{
  "type": "memberJoined",
  "timestamp": 1625665242211,
  "source": { "type": "group", "groupId": "C4af4980629..." },
  "replyToken": "0f3779fba3b349968c5d07db31eabf65",
  "joined": {
    "members": [
      { "type": "user", "userId": "U4af4980629..." },
      { "type": "user", "userId": "U91eeaf62d9..." }
    ]
  }
}
```

### Member Leave Event

Users leave a group your bot is in.

```json
{
  "type": "memberLeft",
  "timestamp": 1625665242211,
  "source": { "type": "group", "groupId": "C4af4980629..." },
  "left": {
    "members": [
      { "type": "user", "userId": "U4af4980629..." }
    ]
  }
}
```

### Postback Event

User taps a postback button.

```json
{
  "type": "postback",
  "timestamp": 1625665242211,
  "source": { "type": "user", "userId": "U91eeaf62d..." },
  "replyToken": "b60d432864f44d079f6d8efe86cf404b",
  "postback": {
    "data": "storeId=12345",
    "params": {
      "datetime": "2017-12-25T01:00"
    }
  }
}
```

### Unsend Event

User unsends a message.

```json
{
  "type": "unsend",
  "timestamp": 1625665242211,
  "source": { "type": "group", "groupId": "Ca56f94637c..." },
  "unsend": {
    "messageId": "325708"
  }
}
```

### Video Play Complete Event

User finishes watching a tracked video.

```json
{
  "type": "videoPlayComplete",
  "timestamp": 1625665242211,
  "source": { "type": "user", "userId": "U4af4980629..." },
  "replyToken": "nHuyWiB7yP5Zw52FIkcQobQuGDXCTA",
  "videoPlayComplete": {
    "trackingId": "track-id"
  }
}
```

### Beacon Event

User enters beacon range.

```json
{
  "type": "beacon",
  "timestamp": 1625665242211,
  "source": { "type": "user", "userId": "U4af4980629..." },
  "replyToken": "nHuyWiB7yP5Zw52FIkcQobQuGDXCTA",
  "beacon": {
    "hwid": "d41d8cd98f",
    "type": "enter",
    "dm": "..."
  }
}
```

**Beacon Types:** `enter`, `banner`, `stay`

### Account Link Event

User links/unlinks their account.

```json
{
  "type": "accountLink",
  "timestamp": 1625665242211,
  "source": { "type": "user", "userId": "U91eeaf62d..." },
  "replyToken": "b60d432864f44d079f6d8efe86cf404b",
  "link": {
    "result": "ok",
    "nonce": "xxxxxxxxxxxxxxx"
  }
}
```

### Membership Event

User joins/renews/leaves membership.

```json
{
  "type": "membership",
  "source": { "type": "user", "userId": "U4af4980629..." },
  "replyToken": "nHuyWiB7yP5Zw52FIkcQobQuGDXCTA",
  "membership": {
    "type": "joined",
    "membershipId": 3189
  }
}
```

**Membership Types:** `joined`, `left`, `renewed`

---

## Common Features

### Quick Reply

Available on all message types. Shows buttons at the bottom of the chat.

```json
{
  "type": "text",
  "text": "Select your favorite food category!",
  "quickReply": {
    "items": [
      {
        "type": "action",
        "imageUrl": "https://example.com/sushi.png",
        "action": {
          "type": "message",
          "label": "Sushi",
          "text": "Sushi"
        }
      },
      {
        "type": "action",
        "action": {
          "type": "location",
          "label": "Send location"
        }
      },
      {
        "type": "action",
        "action": {
          "type": "camera",
          "label": "Open camera"
        }
      },
      {
        "type": "action",
        "action": {
          "type": "cameraRoll",
          "label": "Open camera roll"
        }
      },
      {
        "type": "action",
        "action": {
          "type": "datetimepicker",
          "label": "Select date",
          "data": "storeId=12345",
          "mode": "datetime"
        }
      }
    ]
  }
}
```

**Quick Reply Action Types:**
- `postback` - Send hidden data
- `message` - Send text message
- `uri` - Open URL
- `datetimepicker` - Select date/time
- `camera` - Open camera
- `cameraRoll` - Open photo gallery
- `location` - Send location

**Limits:**
- Max 13 items
- Each item can have optional `imageUrl` (24x24px recommended)

### Sender Property

Customize the bot's display name/icon for a specific message.

```json
{
  "type": "text",
  "text": "Hello!",
  "sender": {
    "name": "Support Bot",
    "iconUrl": "https://example.com/icon.png"
  }
}
```

### Quote Token

Reply to a specific message.

```json
{
  "type": "text",
  "text": "Replying to your message!",
  "quoteToken": "q3Plxr4AgKd..."
}
```

---

## Rate Limits & Constraints

### API Rate Limits

| Endpoint | Rate Limit |
|----------|------------|
| Send reply message | 2,000 req/sec |
| Send push message | 2,000 req/sec |
| Send multicast | 200 req/sec |
| Send broadcast | 60 req/hour |
| Send narrowcast | 60 req/hour |
| Get content | 2,000 req/sec |
| Rich menu operations | 100 req/hour |
| Webhook test | 60 req/hour |

### Message Limits

| Constraint | Limit |
|------------|-------|
| Messages per API call | 5 messages max |
| Text message length | 5,000 characters |
| Flex Message JSON size | 30 KB per bubble |
| Carousel columns | 10 max |
| Template buttons | 4 max |
| Quick reply items | 13 max |
| Multicast recipients | 500 max |

### Reply Token Constraints

- Valid for **1 minute** after webhook received
- Can be used **only once**
- Redelivered webhooks have new reply tokens
- Return 200 OK immediately when using reply tokens

---

## Code Examples

### Python: Webhook Parser

```python
from typing import Dict, Any, Optional
from enum import Enum

class MessageType(str, Enum):
    TEXT = "text"
    IMAGE = "image"
    VIDEO = "video"
    AUDIO = "audio"
    FILE = "file"
    LOCATION = "location"
    STICKER = "sticker"

class WebhookParser:
    """Parse LINE webhook events."""
    
    def parse_event(self, event: Dict[str, Any]) -> Dict[str, Any]:
        event_type = event.get("type")
        
        parsers = {
            "message": self._parse_message_event,
            "follow": self._parse_follow_event,
            "unfollow": self._parse_unfollow_event,
            "postback": self._parse_postback_event,
            "join": self._parse_join_event,
            "leave": self._parse_leave_event,
        }
        
        parser = parsers.get(event_type, self._parse_unknown_event)
        return parser(event)
    
    def _parse_message_event(self, event: Dict[str, Any]) -> Dict[str, Any]:
        message = event.get("message", {})
        return {
            "event_type": "message",
            "timestamp": event.get("timestamp"),
            "user_id": event.get("source", {}).get("userId"),
            "reply_token": event.get("replyToken"),
            "message_type": message.get("type"),
            "message_id": message.get("id"),
            "content": self._parse_message_content(message),
        }
    
    def _parse_message_content(self, message: Dict[str, Any]) -> Dict[str, Any]:
        msg_type = message.get("type")
        
        if msg_type == MessageType.TEXT:
            return {
                "text": message.get("text"),
                "emojis": message.get("emojis", []),
                "mention": message.get("mention"),
            }
        
        elif msg_type == MessageType.IMAGE:
            return {
                "content_provider": message.get("contentProvider"),
                "image_set": message.get("imageSet"),
            }
        
        elif msg_type == MessageType.LOCATION:
            return {
                "title": message.get("title"),
                "address": message.get("address"),
                "latitude": message.get("latitude"),
                "longitude": message.get("longitude"),
            }
        
        elif msg_type == MessageType.STICKER:
            return {
                "package_id": message.get("packageId"),
                "sticker_id": message.get("stickerId"),
                "resource_type": message.get("stickerResourceType"),
                "keywords": message.get("keywords", []),
            }
        
        return message
```

### Python: Message Builder

```python
from typing import Dict, Any, List, Optional

class LineMessageBuilder:
    """Build LINE message objects."""
    
    @staticmethod
    def text(text: str, quick_reply: Optional[Dict] = None) -> Dict[str, Any]:
        message = {"type": "text", "text": text}
        if quick_reply:
            message["quickReply"] = quick_reply
        return message
    
    @staticmethod
    def sticker(package_id: str, sticker_id: str) -> Dict[str, Any]:
        return {
            "type": "sticker",
            "packageId": package_id,
            "stickerId": sticker_id
        }
    
    @staticmethod
    def image(original_url: str, preview_url: str) -> Dict[str, Any]:
        return {
            "type": "image",
            "originalContentUrl": original_url,
            "previewImageUrl": preview_url
        }
    
    @staticmethod
    def video(video_url: str, preview_url: str, duration: int) -> Dict[str, Any]:
        return {
            "type": "video",
            "originalContentUrl": video_url,
            "previewImageUrl": preview_url,
            "duration": duration
        }
    
    @staticmethod
    def location(title: str, address: str, lat: float, lon: float) -> Dict[str, Any]:
        return {
            "type": "location",
            "title": title,
            "address": address,
            "latitude": lat,
            "longitude": lon
        }
    
    @staticmethod
    def quick_reply_item(
        action: Dict[str, Any],
        image_url: Optional[str] = None
    ) -> Dict[str, Any]:
        item = {"type": "action", "action": action}
        if image_url:
            item["imageUrl"] = image_url
        return item
    
    @staticmethod
    def quick_reply(items: List[Dict[str, Any]]) -> Dict[str, Any]:
        return {"items": items}
```

### JavaScript/TypeScript: Type Definitions

```typescript
// Message Types
export type MessageType = 
  | 'text' | 'image' | 'video' | 'audio' 
  | 'file' | 'location' | 'sticker' | 'template' | 'flex';

export interface TextMessage {
  type: 'text';
  text: string;
  emojis?: LineEmoji[];
  mention?: Mention;
  quoteToken?: string;
  markAsReadToken?: string;
}

export interface ImageMessage {
  type: 'image';
  id: string;
  contentProvider: ContentProvider;
  imageSet?: ImageSet;
  quoteToken?: string;
}

export interface ContentProvider {
  type: 'line' | 'external';
  originalContentUrl?: string;
  previewImageUrl?: string;
}

export interface ImageSet {
  id: string;
  index: number;
  total: number;
}

export interface LocationMessage {
  type: 'location';
  id: string;
  title?: string;
  address?: string;
  latitude: number;
  longitude: number;
}

export interface StickerMessage {
  type: 'sticker';
  id: string;
  packageId: string;
  stickerId: string;
  stickerResourceType: StickerResourceType;
  keywords?: string[];
  text?: string;
}

export type StickerResourceType = 
  | 'STATIC' | 'ANIMATION' | 'SOUND' | 'ANIMATION_SOUND'
  | 'POPUP' | 'POPUP_SOUND' | 'CUSTOM' | 'MESSAGE';

// Webhook Event Types
export type WebhookEventType = 
  | 'message' | 'follow' | 'unfollow' | 'join' | 'leave'
  | 'memberJoined' | 'memberLeft' | 'postback' | 'beacon'
  | 'accountLink' | 'unsend' | 'videoPlayComplete' | 'membership';

export interface WebhookEvent {
  type: WebhookEventType;
  timestamp: number;
  source: Source;
  mode: 'active' | 'standby';
  webhookEventId: string;
  deliveryContext: DeliveryContext;
  replyToken?: string;
}

export interface Source {
  type: 'user' | 'group' | 'room';
  userId?: string;
  groupId?: string;
  roomId?: string;
}

export interface DeliveryContext {
  isRedelivery: boolean;
}
```

---

## Quick Reference Tables

### Content Provider Handling

| Provider | Action |
|----------|--------|
| `line` | Call `GET /v2/bot/message/{messageId}/content` |
| `external` | Use `originalContentUrl` directly |

### Source Type Handling

| Source | userId Available | Additional ID |
|--------|------------------|---------------|
| `user` | Always | - |
| `group` | Only in message events | `groupId` |
| `room` | Only in message events | `roomId` |

### Event Replyability

| Event | Has Reply Token |
|-------|-----------------|
| message | ✅ |
| follow | ✅ |
| join | ✅ |
| memberJoined | ✅ |
| postback | ✅ |
| beacon | ✅ |
| videoPlayComplete | ✅ |
| accountLink | ✅ (if success) |
| membership | ✅ |
| unfollow | ❌ |
| leave | ❌ |
| memberLeft | ❌ |
| unsend | ❌ |

---

## Resources

- [LINE Messaging API Documentation](https://developers.line.biz/en/docs/messaging-api/)
- [Message Objects Reference](https://developers.line.biz/en/reference/messaging-api/#message-objects)
- [Webhook Event Objects](https://developers.line.biz/en/reference/messaging-api/#webhook-event-objects)
- [Sticker List](https://developers.line.biz/en/docs/messaging-api/sticker-list/)
- [Flex Message Simulator](https://developers.line.me/flex-simulator/)

---

*Last Updated: 2026-02-01*
