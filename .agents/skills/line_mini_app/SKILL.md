---
name: line_mini_app
description: >
  Complete guide for LINE MINI App development including Service Messages, verification process, LIFF SDK API reference, and publishing guidelines.
  Reference standard for SKN App. Use when needing general guidance, 
  "อ้างอิง", "ดูคู่มือ", "standard".
compatibility: SKN App Project
metadata:
  category: reference
  tags: [reference, line-mini-app]
---

# LINE MINI App Development Guide


## Context7 Docs

Context7 MCP is active. Always attempt to use `mcp__context7__resolve-library-id` for any libraries discussed in this standard to retrieve the most up-to-date documentation.

> **Complete Reference**: LINE MINI App (formerly LIFF) development including SDK APIs, Service Messages, verification requirements, and publishing guidelines.

---

## Table of Contents

1. [Overview](#overview)
2. [MINI App vs LIFF](#mini-app-vs-liff)
3. [LIFF SDK API Reference](#liff-sdk-api-reference)
4. [Service Messages](#service-messages)
5. [Verification Process](#verification-process)
6. [Custom Features](#custom-features)
7. [Development Guidelines](#development-guidelines)
8. [Migration Guide](#migration-guide)
9. [Code Examples](#code-examples)

---

## Overview

### What is LINE MINI App?

LINE MINI App is a web application that runs within LINE, enabling users to enjoy services without installing a separate native app. It's built on the LIFF (LINE Frontend Framework) platform.

**Key Capabilities:**
- Access to LINE user data (with permission)
- Send messages on user's behalf
- Service Message notifications
- QR code scanning
- Share Target Picker
- Home screen shortcuts (verified apps)

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    LINE App                                  │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              LIFF Browser                            │   │
│  │  ┌───────────────────────────────────────────────┐  │   │
│  │  │           MINI App (Web App)                   │  │   │
│  │  │  ┌─────────┐  ┌─────────┐  ┌──────────────┐   │  │   │
│  │  │  │ LIFF SDK│  │ Service │  │   Backend    │   │  │   │
│  │  │  │  (@line/liff) │  │ Message │  │    API       │   │  │   │
│  │  │  └────┬────┘  │   API   │  └──────────────┘   │  │   │
│  │  │       │       └────┬────┘          │           │  │   │
│  │  └───────┼────────────┼───────────────┼───────────┘  │   │
│  └──────────┼────────────┼───────────────┼──────────────┘   │
└─────────────┼────────────┼───────────────┼──────────────────┘
              │            │               │
              ▼            ▼               ▼
        ┌─────────────────────────────────────────┐
        │           LINE Platform API             │
        │  (api.line.me / api-data.line.me)       │
        └─────────────────────────────────────────┘
```

---

## MINI App vs LIFF

### Terminology Evolution

| Term | Status | Description |
|------|--------|-------------|
| **LIFF** | Legacy | LINE Frontend Framework |
| **LINE MINI App** | Current | Official product name (includes LIFF) |

**Important**: As of February 2025, LIFF is being integrated into LINE MINI App as a single brand.

### MINI App Types

| Type | Description | Features Available |
|------|-------------|-------------------|
| **Unverified** | Default after creation | Basic LIFF features, 500 users/channel for testing |
| **Verified** | After passing review | All features including shortcuts, home tab display, search |

### Feature Comparison

| Feature | Unverified | Verified |
|---------|------------|----------|
| Basic LIFF functions | ✅ | ✅ |
| Service Messages | ✅ | ✅ |
| Home screen shortcuts | ❌ | ✅ |
| Custom Path | ❌ | ✅ |
| Channel consent simplification | ❌ | ✅ |
| Home tab display | ❌ | ✅ |
| LINE Search | ❌ | ✅ |
| Verified badge | ❌ | ✅ |

---

## LIFF SDK API Reference

### Initialization

```javascript
// Initialize LIFF app
liff.init({ 
  liffId: '1234567890-AbcdEfgh',
  // Auto-login for external browsers
  withLoginOnExternalBrowser: true 
})
.then(() => {
  console.log('LIFF initialized');
  console.log('LIFF ID:', liff.id);
})
.catch(err => {
  console.error('LIFF init failed:', err);
});

// Check if ready (can use before init completes)
await liff.ready;
```

**Important Rules for `liff.init()`:**
1. Must be called at endpoint URL or lower-level path
2. Must be called for both primary and secondary redirect URLs
3. URL changes must happen AFTER Promise resolves
4. Don't send primary redirect URL (contains access_token) to analytics

### Environment Information

```javascript
// Get OS (ios, android, web)
const os = liff.getOS();

// Get LINE app language
const appLang = liff.getAppLanguage(); // RFC 5646 format

// Get LIFF SDK version
const version = liff.getVersion();

// Get LINE app version
const lineVersion = liff.getLineVersion();

// Check if running in LIFF browser
const inClient = liff.isInClient();

// Get context
const context = liff.getContext();
// Returns: {
//   type: 'utou'|'group'|'room'|'external'|'none',
//   viewType: 'compact'|'tall'|'full',
//   userId: 'Uxxxxx...',
//   liffId: '1234567890-AbcdEfgh',
//   viewType: 'full',
//   availability: { shareTargetPicker, scanCodeV2, ... },
//   scope: ['openid', 'profile', 'chat_message.write']
// }
```

### Authentication

```javascript
// Check login status
const isLoggedIn = liff.isLoggedIn();

// Login (for external browsers)
if (!liff.isLoggedIn()) {
  liff.login({
    redirectUri: 'https://example.com/callback'
  });
}

// Get access token (valid 12 hours)
const accessToken = liff.getAccessToken();

// Get ID token (JWT)
const idToken = liff.getIDToken();

// Get decoded ID token payload
const payload = liff.getDecodedIDToken();
// Returns: { sub, name, picture, email, ... }

// Logout
liff.logout();
```

⚠️ **Security Warning**: Never trust `liff.getDecodedIDToken()` on client side for sensitive operations. Always verify the ID token on your backend.

### User Profile

```javascript
// Get user profile
const profile = await liff.getProfile();
// Returns: {
//   userId: 'Uxxxxx...',
//   displayName: 'John Doe',
//   pictureUrl: 'https://...',
//   statusMessage: 'Hello!'
// }

// Check friendship with LINE OA
const friendship = await liff.getFriendship();
// Returns: { friendFlag: true/false }
```

### Permissions

```javascript
// Get all granted scopes
const grantedScopes = await liff.permission.getGrantedAll();
// Returns: ['openid', 'profile', 'chat_message.write']

// Check specific permission
const status = await liff.permission.query('chat_message.write');
// Returns: { state: 'granted'|'prompt'|'unavailable' }

// Request all permissions (MINI Apps only, requires Channel consent simplification)
await liff.permission.requestAll();
```

### Messaging

```javascript
// Send messages to current chat
await liff.sendMessages([
  {
    type: 'text',
    text: 'Hello from MINI App!'
  },
  {
    type: 'flex',
    altText: 'Flex message',
    contents: { /* flex content */ }
  }
]);
// Limitations: max 5 messages, no emojis/quoteToken

// Share target picker
await liff.shareTargetPicker([
  {
    type: 'text',
    text: 'Share this with friends!'
  }
], {
  isMultiple: true // Allow multiple recipients
});
```

### QR Code Scanner

```javascript
// Modern scanCodeV2 (recommended)
// Requirements: iOS 14.3+, LINE 11.0+, Scan QR enabled in Console
const result = await liff.scanCodeV2();
console.log('Scanned:', result.value);

// Legacy scanCode (deprecated, Android only)
if (liff.scanCode) {
  const result = await liff.scanCode();
}
```

### Window Management

```javascript
// Open external browser
liff.openWindow({
  url: 'https://example.com',
  external: true
});

// Open in LINE in-app browser
liff.openWindow({
  url: 'https://example.com',
  external: false
});

// Close LIFF window
liff.closeWindow();

// Create home screen shortcut (verified apps only)
await liff.createShortcutOnHomeScreen({
  url: 'https://liff.line.me/1234567890-AbcdEfgh'
});
```

### Permanent Links

```javascript
// Get current page permanent link
const link = liff.permanentLink.createUrl();
// Format: https://liff.line.me/{liffId}/{path}?{query}#{fragment}

// Create permanent link for specific URL
const customLink = await liff.permanentLink.createUrlBy(
  'https://example.com/path?query=value'
);
```

### API Availability Check

```javascript
// Check if specific API is available
const canShare = liff.isApiAvailable('shareTargetPicker');
const canScan = liff.isApiAvailable('scanCodeV2');
const canTransition = liff.isApiAvailable('multipleLiffTransition');
```

---

## Service Messages

### Overview

Service Messages allow MINI Apps to send notification messages directly to users' LINE chat, even outside the 1-on-1 chat context.

**Use Cases:**
- Order confirmations
- Appointment reminders
- Status updates
- Promotional messages (with opt-in)

### Service Message Flow

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   MINI App  │────▶│   Backend    │────▶│ LINE Platform│────▶│  User Chat   │
│             │     │              │     │              │     │              │
└─────────────┘     └──────────────┘     └──────────────┘     └──────────────┘
                           │
                           ▼
                    ┌──────────────┐
                    │  Issue Token │
                    │  (1 hour)    │
                    └──────────────┘
```

### Implementation

```javascript
// MINI App: Request service notification token
const token = await liff.requestServiceNotificationToken();
```

```python
# Backend: Send service message
import httpx

async def send_service_message(notification_token: str, message: dict):
    """Send service message to user."""
    async with httpx.AsyncClient() as client:
        response = await client.post(
            'https://api.line.me/message/v3/notifier/send',
            headers={
                'Authorization': f'Bearer {CHANNEL_ACCESS_TOKEN}',
                'Content-Type': 'application/json'
            },
            params={'target': 'service'},
            json={
                'notificationToken': notification_token,
                'messages': [message]
            }
        )
        return response.status_code == 200

# Example usage
message = {
    "type": "template",
    "altText": "Order confirmed",
    "template": {
        "type": "buttons",
        "text": "Your order #12345 has been confirmed!",
        "actions": [
            {
                "type": "uri",
                "label": "View Order",
                "uri": "https://liff.line.me/1234567890-AbcdEfgh/order/12345"
            }
        ]
    }
}
```

### Service Message Templates

Allowed message types for Service Messages:
- Text message
- Sticker message
- Image message
- Video message
- Audio message
- Location message
- Template message
- Flex Message

### Logging Requirements

**Required logs to maintain:**

| Field | Description |
|-------|-------------|
| Timestamp | Time when API request was made |
| Request method | HTTP method (POST) |
| API endpoint | Full endpoint URL |
| Status code | Response status code |

Example log format:
```
Mon, 16 Jul 2021 10:20:23 GMT | POST | https://api.line.me/message/v3/notifier/send | 200
```

**Note**: LINE does not provide these logs. You must maintain them yourself for debugging.

---

## Verification Process

### Requirements for Verified MINI App

**Prerequisites:**
1. Complete MINI App functionality
2. Privacy Policy and Terms of Service
3. Proper error handling
4. Responsive design
5. No prohibited content (gambling, adult, etc.)

**Review Criteria:**

| Category | Requirements |
|----------|--------------|
| **Functionality** | App works as described, no crashes |
| **Design** | Professional UI, responsive |
| **Security** | Proper authentication, HTTPS |
| **Content** | Appropriate content, no violations |
| **User Experience** | Clear navigation, proper loading states |

### Submission Checklist

- [ ] App icon (1024x1024 PNG)
- [ ] Screenshots (minimum 3, recommended 5)
- [ ] App name and description
- [ ] Privacy Policy URL
- [ ] Terms of Service URL
- [ ] Support contact
- [ ] Category selection
- [ ] Test account credentials (if required)

### Review Timeline

- **Initial review**: 5-7 business days
- **Re-review**: 3-5 business days
- **Status tracking**: Available in LINE Developers Console

---

## Custom Features

### 1. Custom Path

Allows creating friendly URLs for MINI Apps.

**Format**: `https://miniapp.line.me/{customPath}`

Instead of: `https://liff.line.me/1234567890-AbcdEfgh`
Use: `https://miniapp.line.me/myapp`

**Benefits:**
- Easier to remember
- Better for marketing
- Professional appearance

### 2. Channel Consent Simplification

Skip the channel consent screen for returning users.

**Requirements:**
- Verified MINI App
- Enable in Developers Console
- Use `liff.permission.requestAll()` for permission requests

### 3. Home Screen Shortcuts

Allow users to add MINI App to device home screen.

```javascript
// Check if available
const canAdd = liff.isApiAvailable('createShortcutOnHomeScreen');

// Show add shortcut screen
await liff.createShortcutOnHomeScreen({
  url: 'https://liff.line.me/1234567890-AbcdEfgh'
});
```

**iOS Requirements:**
- iOS 16.4+ for Chrome
- Safari works on all versions

### 4. Action Button

Built-in sharing button in the header (full-size MINI Apps).

**Multi-tab View** (LINE 15.12.0+):
- Refresh
- Share permanent link
- Minimize browser
- Permission settings
- Recently used services (up to 50)

**Note**: Cannot hide action button in MINI Apps (Module mode not available).

---

## Development Guidelines

### Rate Limits

| API | Limit |
|-----|-------|
| LIFF SDK init | No specific limit |
| Service Message API | 429 on excessive requests |
| Mass testing | Use test environment, not production |

### Prohibited Actions

1. **Mass requests** for load testing
2. **Excessive LIFF scheme** access
3. **Ignoring rate limits** (429 responses)

### Deauthorization on Unregister

When user unregisters from your MINI App:

```python
# Call LINE Login deauthorize endpoint
async def deauthorize_user(line_user_id: str, access_token: str):
    """Deauthorize app when user unregisters."""
    async with httpx.AsyncClient() as client:
        response = await client.post(
            'https://api.line.me/oauth2/v2.1/revoke',
            data={
                'client_id': CHANNEL_ID,
                'client_secret': CHANNEL_SECRET,
                'access_token': access_token
            }
        )
        return response.status_code == 200
```

**Required disclosure in Terms:**
> "If you unsubscribe from the service, LY Corporation will be notified that you have unsubscribed and the link between the service and LINE app will be terminated."

### Security Best Practices

1. **Always verify ID tokens on backend**
2. **Don't log primary redirect URLs** (contain access tokens)
3. **Use HTTPS for all endpoints**
4. **Implement proper CORS policies**
5. **Store channel secrets securely**

---

## Migration Guide

### From Web App to MINI App

```
Existing Web App
      │
      ▼
┌─────────────────┐
│ 1. Create       │
│    MINI App     │
│    Channel      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 2. Add LIFF     │
│    to Channel   │
│    (Endpoint    │
│     URL)        │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 3. Integrate    │
│    LIFF SDK     │
│    (liff.init)  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 4. Add Features │
│    (Share,      │
│     QR Scan)    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 5. Submit for   │
│    Verification │
└─────────────────┘
```

### Key Changes

| From | To |
|------|-----|
| Standalone web app | LIFF SDK integration |
| Own login system | LINE Login |
| Email notifications | Service Messages |
| Direct URL access | Permanent links |

---

## Code Examples

### Complete MINI App Structure

```typescript
// types/miniapp.ts
export interface MiniAppConfig {
  liffId: string;
  channelId: string;
}

export interface UserProfile {
  userId: string;
  displayName: string;
  pictureUrl?: string;
  statusMessage?: string;
}
```

```typescript
// lib/liff-client.ts
import liff from '@line/liff';

export class LiffClient {
  private initialized = false;

  async init(liffId: string): Promise<void> {
    if (this.initialized) return;
    
    await liff.init({ liffId });
    this.initialized = true;
  }

  getProfile() {
    return liff.getProfile();
  }

  async sendServiceNotificationToken(): Promise<string> {
    return await liff.requestServiceNotificationToken();
  }

  closeWindow() {
    liff.closeWindow();
  }
}
```

```typescript
// hooks/useMiniApp.ts
'use client';

import { useEffect, useState } from 'react';
import type { Profile } from '@line/liff';

interface UseMiniAppReturn {
  isReady: boolean;
  isLoggedIn: boolean;
  profile: Profile | null;
  error: Error | null;
  context: ReturnType<typeof liff.getContext> | null;
}

export function useMiniApp(liffId: string): UseMiniAppReturn {
  const [state, setState] = useState<UseMiniAppReturn>({
    isReady: false,
    isLoggedIn: false,
    profile: null,
    error: null,
    context: null
  });

  useEffect(() => {
    import('@line/liff')
      .then((liff) => {
        return liff.init({ liffId }).then(() => liff);
      })
      .then((liff) => {
        const isLoggedIn = liff.isLoggedIn();
        const context = liff.getContext();
        
        setState(prev => ({
          ...prev,
          isReady: true,
          isLoggedIn,
          context
        }));

        if (isLoggedIn) {
          return liff.getProfile().then(profile => {
            setState(prev => ({ ...prev, profile }));
          });
        }
      })
      .catch((error) => {
        setState(prev => ({ ...prev, error }));
      });
  }, [liffId]);

  return state;
}
```

```typescript
// components/ServiceMessageButton.tsx
'use client';

import { useState } from 'react';

export function ServiceMessageButton() {
  const [sending, setSending] = useState(false);

  const handleSendNotification = async () => {
    setSending(true);
    try {
      const liff = await import('@line/liff');
      
      // Get notification token
      const token = await liff.default.requestServiceNotificationToken();
      
      // Send to your backend
      const response = await fetch('/api/send-notification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notificationToken: token,
          message: {
            type: 'text',
            text: 'Thanks for using our service!'
          }
        })
      });

      if (response.ok) {
        alert('Notification sent!');
      }
    } catch (error) {
      console.error('Failed to send:', error);
    } finally {
      setSending(false);
    }
  };

  return (
    <button 
      onClick={handleSendNotification}
      disabled={sending}
      className="btn-primary"
    >
      {sending ? 'Sending...' : 'Send Notification'}
    </button>
  );
}
```

```python
# backend/routers/miniapp.py
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Dict, Any
import httpx

router = APIRouter(prefix="/api")

class NotificationRequest(BaseModel):
    notificationToken: str
    message: Dict[str, Any]

class ServiceMessageLog(BaseModel):
    timestamp: str
    method: str
    endpoint: str
    status_code: int

@router.post("/send-notification")
async def send_notification(
    request: NotificationRequest,
    token: str = Depends(verify_auth_token)
):
    """Send service message via LINE Platform."""
    
    async with httpx.AsyncClient() as client:
        response = await client.post(
            "https://api.line.me/message/v3/notifier/send",
            headers={
                "Authorization": f"Bearer {settings.LINE_CHANNEL_ACCESS_TOKEN}",
                "Content-Type": "application/json"
            },
            params={"target": "service"},
            json={
                "notificationToken": request.notificationToken,
                "messages": [request.message]
            }
        )
    
    # Log for debugging (required by LINE guidelines)
    log_entry = ServiceMessageLog(
        timestamp=datetime.utcnow().strftime("%a, %d %b %Y %H:%M:%S GMT"),
        method="POST",
        endpoint="https://api.line.me/message/v3/notifier/send",
        status_code=response.status_code
    )
    await save_log(log_entry)
    
    if response.status_code != 200:
        raise HTTPException(
            status_code=500, 
            detail="Failed to send notification"
        )
    
    return {"success": True}
```

---

## Quick Reference Tables

### LIFF SDK Methods Summary

| Method | Description | Availability |
|--------|-------------|--------------|
| `liff.init()` | Initialize LIFF app | All |
| `liff.getOS()` | Get OS type | All |
| `liff.isInClient()` | Check LIFF browser | All |
| `liff.isLoggedIn()` | Check login status | All |
| `liff.login()` | LINE Login | External only |
| `liff.getProfile()` | Get user profile | Logged in |
| `liff.sendMessages()` | Send to chat | LIFF browser only |
| `liff.shareTargetPicker()` | Share to friends | Logged in |
| `liff.scanCodeV2()` | QR scanner | Full size + enabled |
| `liff.closeWindow()` | Close app | LIFF browser |
| `liff.createShortcutOnHomeScreen()` | Add to home | Verified apps |

### Scopes Reference

| Scope | Required For |
|-------|-------------|
| `openid` | ID token, `getIDToken()` |
| `profile` | `getProfile()`, `getFriendship()` |
| `email` | Email address in ID token |
| `chat_message.write` | `sendMessages()` |

### Error Codes

| Code | Description |
|------|-------------|
| `INIT_FAILED` | LIFF initialization failed |
| `INVALID_ARGUMENT` | Invalid parameter |
| `UNAUTHORIZED` | Not logged in |
| `FORBIDDEN` | Permission denied |
| `INVALID_CONFIG` | Configuration error |

---

## Resources

- [LINE MINI App Documentation](https://developers.line.biz/en/docs/line-mini-app/)
- [LIFF SDK Reference](https://developers.line.biz/en/reference/liff/)
- [Service Message API Reference](https://developers.line.biz/en/reference/line-mini-app/)
- [LIFF Playground](https://liff-playground.netlify.app/)
- [LINE Developers Console](https://developers.line.biz/console/)

---

*Last Updated: 2026-02-01*
