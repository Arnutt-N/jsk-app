<!-- Generated: 2026-03-26 | Files scanned: ~139 | Token estimate: ~800 -->
# Frontend Codemap

## Stack

Next.js 16.1.1 | React 19 | TypeScript 5 | Tailwind v4 | Zustand 5 | shadcn/ui

## Page Tree (67 pages)

```
/                           → app/page.tsx
/login                      → app/login/page.tsx

/admin                      → app/admin/page.tsx (dashboard home)
├── /analytics              → analytics/page.tsx
├── /audit                  → audit/page.tsx
├── /logs                   → logs/page.tsx
├── /chatbot                → chatbot/page.tsx (intent management)
│   ├── /friends            → chatbot/friends/page.tsx
│   ├── /history            → chatbot/history/page.tsx
│   └── /broadcast          → chatbot/broadcast/page.tsx
│       ├── /new            → broadcast/new/page.tsx
│       └── /[id]           → broadcast/[id]/page.tsx
├── /live-chat              → live-chat/page.tsx (full-screen chat)
│   └── /analytics          → live-chat/analytics/page.tsx
├── /requests               → requests/page.tsx
│   ├── /[id]               → requests/[id]/page.tsx
│   └── /kanban             → requests/kanban/page.tsx
├── /users                  → users/page.tsx
│   └── /[id]               → users/[id]/page.tsx
├── /friends                → friends/page.tsx
│   └── /history            → friends/history/page.tsx
├── /files                  → files/page.tsx
├── /reports                → reports/page.tsx
├── /auto-replies           → auto-replies/page.tsx
│   └── /[id]               → auto-replies/[id]/page.tsx
├── /reply-objects          → reply-objects/page.tsx
├── /rich-menus             → rich-menus/page.tsx
│   ├── /new                → rich-menus/new/page.tsx
│   └── /[id]/edit          → rich-menus/[id]/edit/page.tsx
├── /settings               → settings/page.tsx
│   ├── /line               → settings/line/page.tsx
│   ├── /telegram           → settings/telegram/page.tsx
│   ├── /n8n                → settings/n8n/page.tsx
│   └── /custom             → settings/custom/page.tsx
└── /design-system          → design-system/page.tsx

/liff                       → app/liff/layout.tsx
├── /test                   → liff/test/page.tsx
├── /close-test             → liff/close-test/page.tsx
├── /request-v2             → liff/request-v2/page.tsx
├── /service-request        → liff/service-request/page.tsx
└── /service-request-single → liff/service-request-single/page.tsx
```

## Component Hierarchy

```
components/
├── ui/ (32 files)             shadcn/ui design system
│   ├── Button, Card, Badge, Avatar, Alert
│   ├── Input, Textarea, Form, Label, Checkbox, RadioGroup, Select, Switch
│   ├── Modal, ModalAlert, Popover, Tooltip, DropdownMenu, Sheet
│   ├── Tabs, Table, Accordion, Pagination, Separator
│   ├── Chart (Recharts), Calendar, Toast, Progress, Skeleton, LoadingSpinner
│   └── Command (cmdk), ActionIconButton
├── admin/ (11 files)          Admin-specific components
│   ├── CredentialForm, AssignModal, PageAccessGuard
│   ├── AdminSearchFilterBar, AdminTableHead
│   ├── CannedResponsePicker, ConversationActionMenu
│   ├── BotStatusIndicator, SessionTimeoutWarning
│   ├── SidebarItem, TypingIndicator
│   └── index.ts
└── providers/ (2 files)
    ├── ThemeProvider.tsx
    └── index.tsx
```

## Live Chat Feature (isolated module)

```
app/admin/live-chat/
├── _store/liveChatStore.ts     Zustand store (primary state)
├── _context/LiveChatContext.tsx Context provider bridge
├── _hooks/useConversations.ts  Conversation data hook
├── _hooks/useMessages.ts       Message data hook
├── _types.ts                   Feature-scoped types
└── _components/ (15)           ChatArea, MessageBubble, ConversationList,
                                MessageInput, SessionActions, TransferDialog,
                                QuickReplies, EmojiPicker, StickerPicker, etc.
```

## State Management

```
Auth:      contexts/AuthContext.tsx → useAuth() hook
Live Chat: _store/liveChatStore.ts (Zustand) → LiveChatContext → components
Theme:     hooks/useTheme.ts → localStorage
```

## Hooks (5)

```
hooks/useLiveChatSocket.ts    WebSocket lifecycle for live chat
hooks/useWebSocket.ts         Base WebSocket abstraction
hooks/useSessionTimeout.ts    Auth session expiry detection
hooks/useNotificationSound.ts Audio alerts for new messages
hooks/useTheme.ts             Dark/light toggle
```

## WebSocket Client (lib/websocket/)

```
client.ts (269L)              WS client class (connect, send, handlers)
types.ts (149L)               Message types & payload interfaces
messageQueue.ts (75L)         Offline message queueing
reconnectStrategy.ts (38L)    Exponential backoff reconnection
```

## Config

```
next.config.js    API proxy: /api/v1/* → localhost:8000, Turbopack enabled
tsconfig.json     Strict, @/* path alias, ES2017 target
tailwind.config   v4 (CSS variables, minimal config)
```

## Stats

| Directory | Files | Lines |
|-----------|-------|-------|
| app/ | 67 | ~18,082 |
| components/ | 45 | ~5,320 |
| hooks/ | 5 | ~547 |
| lib/ | 9 | ~616 |
| contexts/ | 1 | ~250 |
| **Total** | **~139** | **~25,000** |
