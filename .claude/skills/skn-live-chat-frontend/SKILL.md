---
name: skn-live-chat-frontend
description: >
  Extends, modifies, or debugs the live-chat frontend in SKN App — the most complex
  frontend feature with Zustand store, LiveChatContext, WebSocket hook, and 15+
  React components. Use when asked to "add live chat feature", "modify chat UI",
  "add message type", "canned response picker", "typing indicator", "session transfer dialog",
  "fix WebSocket disconnect", "optimistic message", "เพิ่มฟีเจอร์ live chat", "แก้ไข chat UI",
  "เพิ่ม component ใน live chat", "ปัญหา WebSocket ใน live chat".
  Do NOT use for backend WebSocket events (skn-live-chat-ops), LINE webhook
  processing (skn-webhook-handler), or general admin component patterns (skn-admin-component).
license: MIT
compatibility: >
  Claude Code with SKN App project.
  Requires: Next.js 16, React 19, TypeScript, Tailwind CSS v4, Zustand 4, Lucide icons.
  Frontend on localhost:3000, backend WS at /api/v1/ws/live-chat.
metadata:
  author: SKN App Team
  version: 1.0.0
  project: skn-app
  category: frontend
  tags: [live-chat, websocket, zustand, react, frontend]
  related-skills:
    - skn-live-chat-ops
    - skn-admin-component
    - skn-operator-tools
  documentation: ./references/live_chat_frontend_reference.md
---

# skn-live-chat-frontend

The live-chat frontend is a full-screen, real-time operator panel built with Zustand
(state) + LiveChatContext (API methods) + WebSocket hook. Every piece of state lives in
the Zustand store; the Context exposes async operations. Components only touch state
via Zustand selectors and call operations via `useLiveChatContext()`.

---

## CRITICAL: Project-Specific Rules

1. **State lives in Zustand, methods in Context** — Never pass state via props through
   deep component trees. Read state directly: `useLiveChatStore((s) => s.field)`.
   Call operations: `const { sendMessage } = useLiveChatContext()`.

2. **`getStore()` for callbacks and effects** — Inside `useCallback` and `useEffect`,
   always read current Zustand state via `const getStore = () => useLiveChatStore.getState()`.
   Never close over `state.X` — it will be stale. This pattern exists throughout LiveChatContext.tsx.

3. **WebSocket + REST dual path** — Every write operation has two paths:
   - WS connected: send via socket (`wsStatusRef.current === 'connected'`)
   - WS disconnected: fall back to `fetch()` then refresh with `fetchChatDetail()` + `fetchConversations()`

4. **Optimistic messages use tempId** — On send, immediately add a `Message` with `temp_id`
   to the store. `pendingMessages: Set<string>` tracks in-flight IDs. WS ack removes from
   pending; WS fail moves to `failedMessages: Map<string, string>`. UI shows spinner on pending,
   error icon on failed.

5. **Picker mutual exclusion** — Only one of emoji/sticker/quickReplies can be open at once.
   The store's toggle actions close others automatically:
   ```ts
   toggleEmojiPicker: () => set((s) => ({
     showEmojiPicker: !s.showEmojiPicker,
     showStickerPicker: false,
     showQuickReplies: false,
   }))
   ```
   Call `closeAllPickers()` before opening a new overlay from outside MessageInput.

6. **`inputText === '/'` auto-triggers canned picker** — The store's `setInputText` action
   has embedded logic: `showCannedPicker: text === '/'`. Do not add this logic elsewhere.

7. **Room lifecycle** — `joinRoom(lineUserId)` after `selectedId` changes AND WS is connected.
   `leaveRoom()` on unmount or deselect. The effect in LiveChatContext handles this:
   ```ts
   useEffect(() => {
     if (!selectedId || wsStatus !== 'connected') return;
     joinRoom(selectedId);
     return () => leaveRoom();
   }, [joinRoom, leaveRoom, selectedId, wsStatus]);
   ```

8. **Conversation list sorted newest first with `unread_count`** — `handleConversationUpdate`
   always splices the updated conversation to index 0. `unread_count` is set to 0 when the
   conversation is selected (`selectConversation`). Do not sort the list in the component.

9. **History pagination uses cursor, not offset** — `fetchMessagesPage(id, beforeId?)` calls
   `GET /conversations/{id}/messages?limit=50&before_id=N`. `prependMessages()` adds older
   messages to front. `hasMoreHistory` is false when fewer than 50 messages returned.

10. **All components are `'use client'`** — Every file under `live-chat/` is a Client
    Component. The layout (`live-chat/layout.tsx`) wraps with `<LiveChatProvider>`.
    Never use server-side data fetching in this directory.

11. **Thai text classes** — Containers with Thai text need `className="thai-text"`. Use
    `thai-no-break` on badges and short strings to prevent mid-word breaks.

12. **Bubble sides are fixed by direction** — In `MessageBubble.tsx` the customer
    (`INCOMING`) bubble sits LEFT (`justify-start`, avatar shown) and BOTH bot and
    operator (`OUTGOING`, any `sender_role`) sit RIGHT (`justify-end`, no avatar).
    Do NOT use `flex-row-reverse` — outgoing already justifies right. Bot vs operator
    differ only by bubble color (bot = subtle surface, operator = gradient-active).

13. **Presence dots use the shared helper** — status dots on the conversation list,
    chat header, customer panel, and profile dropdown all come from
    `lib/constants/live-chat-presence.ts` (`getSessionPresence()` for session-based
    surfaces, `getConnectionPresence()` for the operator's own wsStatus dot;
    `PRESENCE_DOT_CLASS` / `PRESENCE_LABEL`). Mapping: green=`bg-online` (ACTIVE/
    connected), amber=`bg-away` (WAITING/connecting), gray=`bg-offline` (none/
    disconnected). Position the dot on the avatar rim: wrapper `relative`, dot
    `absolute bottom-0 right-0 ring-2 ring-<surface>`. Never hardcode a dot color.

14. **Bot replies now store real per-message content** — the webhook saves each LINE
    send-object via `describe_line_message()` (backend `line_service.py`) with its true
    `message_type`/`content`/`payload` (was one `"Sent N messages for intent"` summary
    row). So `MessageBubble` renders actual text/image/video/audio/sticker/location/flex.

15. **CannedResponsePicker is a direct child of the input `<footer>`** — it is anchored
    `absolute bottom-full left-0 right-0` to span the full composer width. Do NOT nest it
    inside the emoji/sticker popups container (that box collapses to ~16px and squeezes
    the picker). It is theme-token styled (`bg-surface`, not `bg-white`).

---

## Context7 Docs

| Library | Resolve Name | Key Topics |
|---|---|---|
| React | `"react"` | useCallback, useMemo, useRef, createContext |
| Zustand | `"zustand"` | create, devtools, getState, subscribeWithSelector |
| Next.js | `"next.js"` | useSearchParams, Client Components, router |

---

## Component Architecture

```
live-chat/
├── layout.tsx              — wraps with <LiveChatProvider>
├── page.tsx                — renders <LiveChatShell>
├── analytics/page.tsx      — separate analytics subpage
├── _types.ts               — Conversation, CurrentChat, Session, ConversationTag
├── _store/
│   └── liveChatStore.ts    — Zustand store (ALL state)
├── _context/
│   └── LiveChatContext.tsx — Provider: API methods + WS wiring
└── _components/
    ├── LiveChatShell.tsx   — outer grid layout (3 columns: list | chat | panel)
    ├── ConversationList.tsx — left panel, search/filter + conversation items
    ├── ConversationItem.tsx — single conversation row with unread badge
    ├── ChatArea.tsx         — center panel: header + messages + input
    ├── ChatHeader.tsx       — top bar: user name, status badge, mode toggle
    ├── MessageBubble.tsx    — individual message with direction, sender, type
    ├── MessageInput.tsx     — bottom toolbar + textarea + send button
    ├── CustomerPanel.tsx    — right panel: user profile + tags + history
    ├── SessionActions.tsx   — claim / close / transfer buttons
    ├── TransferDialog.tsx   — operator picker modal for session transfer
    ├── TypingIndicator.tsx  — animated dots when user is typing
    ├── NotificationToast.tsx — toast overlay (top-right)
    ├── EmojiPicker.tsx      — emoji grid popup
    ├── StickerPicker.tsx    — LINE sticker pack popup
    └── QuickReplies.tsx     — horizontal quick reply buttons bar
```

---

## Step 1 — Read State from Zustand

Direct selector in any child component (no prop drilling):

```tsx
// Read single field
const messages = useLiveChatStore((s) => s.messages);

// Read derived data
const hasUnread = useLiveChatStore((s) =>
  s.conversations.some((c) => c.unread_count > 0)
);

// Read action
const closeAllPickers = useLiveChatStore((s) => s.closeAllPickers);
```

---

## Step 2 — Call API Methods from Context

```tsx
function MyComponent() {
  const {
    state,           // ChatState snapshot (for backward compat)
    wsStatus,        // 'connected' | 'disconnected' | 'connecting'
    isHumanMode,     // currentChat?.chat_mode === 'HUMAN'
    sendMessage,     // async (text: string) => void
    claimSession,    // async () => void
    closeSession,    // async () => void
    transferSession, // async (toOperatorId: number, reason?: string) => void
    toggleMode,      // async ('BOT' | 'HUMAN') => void
    loadOlderMessages, // scroll-up history
    selectConversation, // (id: string | null) => void
    formatTime,      // (isoString) => '5m' | '2h' | 'Yesterday'
  } = useLiveChatContext();
}
```

---

## Step 3 — Add a New Store Field

When adding a new UI toggle or state slice:

**3a — Add to `LiveChatState` interface:**
```ts
interface LiveChatState {
  // ... existing fields
  showNewPanel: boolean;
}
```

**3b — Add to `LiveChatActions`:**
```ts
interface LiveChatActions {
  toggleNewPanel: () => void;
}
```

**3c — Add to `initialState`:**
```ts
const initialState: LiveChatState = {
  // ...
  showNewPanel: false,
};
```

**3d — Add setter in `create()`:**
```ts
toggleNewPanel: () => set((s) => ({ showNewPanel: !s.showNewPanel })),
```

**3e — Use in component:**
```tsx
const showNewPanel = useLiveChatStore((s) => s.showNewPanel);
const toggleNewPanel = useLiveChatStore((s) => s.toggleNewPanel);
```

---

## Step 4 — Add a New Context Method

When adding a new async API operation:

**4a — Add to `LiveChatContextValue` interface:**
```ts
interface LiveChatContextValue {
  // ...
  archiveConversation: (lineUserId: string) => Promise<void>;
}
```

**4b — Implement in `LiveChatProvider`:**
```ts
const archiveConversation = useCallback(async (lineUserId: string) => {
  const res = await fetch(`${API_BASE}/admin/live-chat/conversations/${lineUserId}/archive`, {
    method: 'POST',
  });
  if (res.ok) {
    // Remove from list optimistically
    const updated = getStore().conversations.filter(
      (c) => c.line_user_id !== lineUserId
    );
    getStore().setConversations(updated);
  }
}, []);
```

**4c — Include in `value` object at bottom of Provider.**

---

## Step 5 — Handle a New WS Server Event

If the backend sends a new WebSocket event (e.g. `csat_submitted`):

**5a — Add to `MessageType` in `lib/websocket/types.ts`:**
```ts
export enum MessageType {
  // ... existing
  CSAT_SUBMITTED = 'csat_submitted',
}
```

**5b — Add callback option to `UseLiveChatSocketOptions`:**
```ts
onCsatSubmitted?: (lineUserId: string, score: number) => void;
```

**5c — Add case in `handleMessage` switch in `useLiveChatSocket.ts`:**
```ts
case MessageType.CSAT_SUBMITTED:
  const csatPayload = data.payload as { line_user_id: string; score: number };
  onCsatSubmitted?.(csatPayload.line_user_id, csatPayload.score);
  break;
```

**5d — Wire callback in `LiveChatContext.tsx` useLiveChatSocket options:**
```ts
onCsatSubmitted: (lineUserId, score) => {
  getStore().addNotification({
    title: 'CSAT Received',
    message: `User rated: ${score}/5`,
    type: 'system',
  });
},
```

---

## Step 6 — Add a New Component

All live-chat components follow the same pattern:

```tsx
'use client';

import { useLiveChatStore } from '../_store/liveChatStore';
import { useLiveChatContext } from '../_context/LiveChatContext';

interface NewPanelProps {
  // Only pass primitive props — never the full store/context
}

export function NewPanel({ }: NewPanelProps) {
  // State: from Zustand directly
  const someState = useLiveChatStore((s) => s.someField);

  // Actions: from context
  const { someMethod } = useLiveChatContext();

  return (
    <div className="bg-surface border-l border-border-default thai-text">
      {/* ... */}
    </div>
  );
}
```

---

## Common Issues

### WS message handler sees stale state
**Cause:** Closed over `conversations` inside a `useCallback` that doesn't update.
**Fix:** Use `getStore().conversations` instead of the subscribed value:
```ts
const list = [...getStore().conversations];
```

### New message appears twice
**Cause:** Both WS `new_message` and REST fallback `fetchChatDetail` returned the message.
**Fix:** `handleNewMessage` checks for duplicate by `m.id === message.id || m.temp_id === message.temp_id`. Ensure the backend sends the real `id` in the WS event so dedup works.

### Canned picker opens on every keystroke
**Cause:** Checking `text.startsWith('/')` instead of `text === '/'`.
**Fix:** The store already handles this correctly — `showCannedPicker: text === '/'`. Do not add extra logic.

### History load scrolls to top unexpectedly
**Cause:** `setMessages` replaces the full array, triggering a scroll reset.
**Fix:** Use `prependMessages()` (not `setMessages`) when loading older history. The component must capture scroll position before and restore it after prepend.

---

## Quality Checklist

Before finishing, verify:
- [ ] State reads use `useLiveChatStore((s) => s.field)` selectors (not `state.X` from context)
- [ ] Async operations use `getStore()` inside callbacks (not closed-over reactive values)
- [ ] WS path AND REST fallback path exist for write operations
- [ ] New store fields added to interface + initialState + create()
- [ ] New context methods added to LiveChatContextValue interface + value object
- [ ] New WS events added to MessageType enum + useLiveChatSocket switch + context callback
- [ ] Components are `'use client'` with no server-side data fetching
- [ ] Thai text uses `thai-text` / `thai-no-break` utility classes
- [ ] Picker mutual exclusion preserved (closeAllPickers before opening new overlay)
- [ ] Optimistic tempId pattern used for send operations

## Additional Resources

For detailed type definitions, full API endpoint table, WS event payloads, and
component prop interfaces — see `references/live_chat_frontend_reference.md`.
