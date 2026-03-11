---
name: liff_development
description: >
  Best practices for building LINE LIFF mini-apps with authentication, user context, and mobile-responsive UI.
  Reference standard for SKN App. Use when needing general guidance, 
  "อ้างอิง", "ดูคู่มือ", "standard".
compatibility: SKN App Project
metadata:
  category: reference
  tags: [reference, liff-development]
---

# LINE LIFF Development


## Context7 Docs

Context7 MCP is active. Always attempt to use `mcp__context7__resolve-library-id` for any libraries discussed in this standard to retrieve the most up-to-date documentation.

Standards for building LINE Frontend Framework (LIFF) mini-apps with secure authentication and mobile-first design.

## 1. LIFF App Types

| Type | Height | Use Case |
|------|--------|----------|
| `compact` | 50% screen | Quick actions, confirmations |
| `tall` | 75% screen | Forms, short workflows |
| `full` | 100% screen | Full applications, complex flows |

```typescript
// URL parameter: ?type=compact|tall|full
// Set in LINE Developers Console per LIFF app
```

## 2. Initialization & Authentication Flow

```typescript
// hooks/useLiff.ts
'use client';

import { useState, useEffect } from 'react';

interface LiffProfile {
  userId: string;
  displayName: string;
  pictureUrl?: string;
  statusMessage?: string;
}

interface UseLiffReturn {
  isLoggedIn: boolean;
  isReady: boolean;
  error: Error | null;
  profile: LiffProfile | null;
  idToken: string | null;
  login: () => void;
  logout: () => void;
}

export function useLiff(liffId: string): UseLiffReturn {
  const [isReady, setIsReady] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [profile, setProfile] = useState<LiffProfile | null>(null);
  const [idToken, setIdToken] = useState<string | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    // LIFF SDK must be loaded dynamically on client
    import('@line/liff').then((liff) => {
      liff.init({ liffId })
        .then(() => {
          setIsReady(true);
          
          if (liff.isLoggedIn()) {
            setIsLoggedIn(true);
            setIdToken(liff.getIDToken());
            
            liff.getProfile().then(setProfile);
          }
        })
        .catch((err) => {
          setError(err);
        });
    });
  }, [liffId]);

  const login = () => {
    if (typeof window !== 'undefined') {
      import('@line/liff').then((liff) => {
        liff.login();
      });
    }
  };

  const logout = () => {
    if (typeof window !== 'undefined') {
      import('@line/liff').then((liff) => {
        liff.logout();
        window.location.reload();
      });
    }
  };

  return { isReady, isLoggedIn, profile, idToken, error, login, logout };
}
```

## 3. ID Token Verification (CRITICAL)

**⚠️ Never trust `liff.getDecodedIDToken()` on client for sensitive operations. Always verify on backend.**

```python
# Backend endpoint (FastAPI)
import httpx
from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel

router = APIRouter()

class TokenVerifyRequest(BaseModel):
    id_token: str

LINE_CHANNEL_ID = "YOUR_CHANNEL_ID"
LINE_TOKEN_ENDPOINT = "https://api.line.me/oauth2/v2.1/verify"

@router.post("/auth/verify-liff-token")
async def verify_liff_token(
    request: TokenVerifyRequest,
    x_liff_id: str = Header(...)
):
    """
    Verify LIFF ID token with LINE API.
    Returns user profile if valid.
    """
    async with httpx.AsyncClient() as client:
        response = await client.post(
            LINE_TOKEN_ENDPOINT,
            data={
                "id_token": request.id_token,
                "client_id": LINE_CHANNEL_ID,
            }
        )
    
    if response.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid token")
    
    token_data = response.json()
    
    # Issue your own session JWT
    user = await get_or_create_user(
        line_user_id=token_data["sub"],
        name=token_data.get("name"),
        picture=token_data.get("picture")
    )
    
    return {
        "access_token": create_jwt(user.id),
        "user": user
    }
```

## 4. User Context

```typescript
// Get LIFF context (available without login)
import liff from '@line/liff';

const context = liff.getContext();
// {
//   type: 'utou' | 'room' | 'group' | 'none' | 'external',
//   viewType: 'compact' | 'tall' | 'full',
//   userId?: string,
//   utouId?: string,
//   roomId?: string,
//   groupId?: string,
// }

// For friend chat, get user's LINE profile
if (liff.isLoggedIn()) {
  const profile = await liff.getProfile();
  // { userId, displayName, pictureUrl?, statusMessage? }
}
```

## 5. Opening External Browsers

```typescript
// Open external browser (outside LINE in-app browser)
liff.openWindow({
  url: 'https://example.com/payment',
  external: true,  // Opens in OS default browser
});

// Open within LINE (default)
liff.openWindow({
  url: 'https://example.com/help',
  external: false,
});
```

## 6. Closing LIFF App

```typescript
// Close the LIFF window (works for all view types)
liff.closeWindow();

// Use after successful action
async function handleSubmit() {
  await submitForm(data);
  liff.closeWindow();
}
```

## 7. Error Handling

```typescript
// components/LiffErrorBoundary.tsx
'use client';

import { useEffect, useState } from 'react';

interface Props {
  children: React.ReactNode;
  liffId: string;
}

export function LiffProvider({ children, liffId }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    import('@line/liff')
      .then((liff) => liff.init({ liffId }))
      .then(() => setIsLoading(false))
      .catch((err) => {
        setError(err.message);
        setIsLoading(false);
      });
  }, [liffId]);

  if (error) {
    return (
      <div className="p-4 text-center">
        <h2 className="text-red-600">Failed to initialize LIFF</h2>
        <p className="text-sm text-gray-600">{error}</p>
        <button 
          onClick={() => window.location.reload()}
          className="mt-2 px-4 py-2 bg-green-500 text-white rounded"
        >
          Retry
        </button>
      </div>
    );
  }

  if (isLoading) {
    return <div className="p-8 text-center">Loading...</div>;
  }

  return children;
}
```

## 8. Mobile-Responsive Design

```html
<!-- Required viewport meta for LIFF -->
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
```

```css
/* Safe area handling for notched devices */
.app-container {
  padding-top: env(safe-area-inset-top);
  padding-bottom: env(safe-area-inset-bottom);
  padding-left: env(safe-area-inset-left);
  padding-right: env(safe-area-inset-right);
}

/* Fixed bottom button with safe area */
.bottom-action {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 16px;
  padding-bottom: max(16px, env(safe-area-inset-bottom));
  background: white;
  border-top: 1px solid #e5e7eb;
}
```

## 9. LIFF with Next.js (Client-Only)

```typescript
// app/liff/booking/page.tsx
import { Suspense } from 'react';
import { BookingForm } from './BookingForm';

export default function BookingPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <BookingForm />
    </Suspense>
  );
}

// app/liff/booking/BookingForm.tsx
'use client';

import { useLiff } from '@/hooks/useLiff';
import { useState } from 'react';

const LIFF_ID = process.env.NEXT_PUBLIC_LIFF_ID!;

export function BookingForm() {
  const { isReady, isLoggedIn, profile, idToken, login, error } = useLiff(LIFF_ID);
  const [formData, setFormData] = useState({ name: '', date: '' });

  if (error) return <div>Error: {error.message}</div>;
  if (!isReady) return <div>Initializing...</div>;
  
  if (!isLoggedIn) {
    return (
      <div className="p-4 text-center">
        <p>Please login to continue</p>
        <button onClick={login} className="mt-2 px-4 py-2 bg-green-500 text-white rounded">
          Login with LINE
        </button>
      </div>
    );
  }

  const handleSubmit = async () => {
    const res = await fetch('/api/bookings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${idToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(formData),
    });
    
    if (res.ok) {
      import('@line/liff').then((liff) => liff.closeWindow());
    }
  };

  return (
    <form className="p-4 space-y-4">
      <div className="flex items-center gap-3">
        {profile?.pictureUrl && (
          <img src={profile.pictureUrl} alt="" className="w-10 h-10 rounded-full" />
        )}
        <span>Hello, {profile?.displayName}</span>
      </div>
      
      <input
        type="text"
        placeholder="Your name"
        value={formData.name}
        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
        className="w-full p-2 border rounded"
      />
      
      <button
        type="button"
        onClick={handleSubmit}
        className="w-full py-2 bg-green-500 text-white rounded"
      >
        Confirm Booking
      </button>
    </form>
  );
}
```

## 10. TypeScript Types for LIFF SDK

```typescript
// types/liff.d.ts
/// <reference types="@line/liff" />

// Or install: npm install @line/liff

// Extend with custom profile claims
interface CustomIdTokenClaims {
  sub: string;        // User ID
  name?: string;
  picture?: string;
  email?: string;
}

// Type-safe context
interface LiffContext {
  type: 'utou' | 'room' | 'group' | 'none' | 'external';
  viewType: 'compact' | 'tall' | 'full';
  userId?: string;
  utouId?: string;
  roomId?: string;
  groupId?: string;
}
```

## Quick Checklist

- [ ] LIFF ID stored in `NEXT_PUBLIC_LIFF_ID` env var
- [ ] ID token verified on backend before sensitive operations
- [ ] `use client` directive on all LIFF components
- [ ] Dynamic import for `@line/liff` SDK
- [ ] Safe area insets handled for mobile
- [ ] Loading states while `liff.init()` pending
- [ ] `liff.closeWindow()` after flow completion
- [ ] Graceful error handling for init failures
