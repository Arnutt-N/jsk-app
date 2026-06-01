# Feature: Live Chat UI Migration — Adopt Example Admin Chat Design

## Summary

Migrate the current live chat UI (`frontend/app/admin/live-chat/`) to match the premium design from `examples/admin-chat-system/`. The live chat remains a **standalone page** (separate from admin sidebar), but adopts the example's 4-panel layout, shadcn/ui-inspired component styling, CSS variable color system, and polished animations. All existing backend integrations (WebSocket, REST API, auth) are preserved — only the visual layer changes.

## User Story

As an **admin operator**
I want the live chat interface to have a modern, polished design with better visual hierarchy
So that I can manage conversations more efficiently with clearer status indicators and better UX

## Problem Statement

The current live chat has a functional but basic UI with:
- Minimal visual polish (flat colors, basic rounded corners)
- Dark purple conversation sidebar doesn't match the example's refined dark sidebar
- Simple message bubbles without read receipts, reactions, or animation
- Basic customer panel without stats, notes, or rich action buttons
- No emoji/sticker picker functionality
- Missing notification toasts and sound toggle UI

## Solution Statement

Adapt the example's design patterns while preserving all existing backend wiring:
1. **New Sidebar**: Replace the dark purple gradient sidebar with the example's icon-based `AdminSidebar` (dark slate, collapsible, with nav items and badges)
2. **Redesigned Conversation List**: Adopt the example's `UserListPanel` styling (search, status filters, user cards with avatars/badges/mode indicators)
3. **Enhanced Chat Room**: Add message animations, emoji/sticker pickers, read receipts, quick replies bar, expandable textarea
4. **Rich Customer Panel**: Adopt the example's profile layout with stats cards, contact info sections, internal notes, action buttons
5. **Notification Toasts**: Add toast notification system with sound toggle
6. **CSS Variables**: Migrate to the example's HSL CSS variable system for consistent theming

## Metadata

| Field            | Value                                               |
| ---------------- | --------------------------------------------------- |
| Type             | ENHANCEMENT                                         |
| Complexity       | HIGH                                                |
| Systems Affected | frontend/app/admin/live-chat/, frontend/app/globals.css |
| Dependencies     | None new (reuse existing lucide-react, tailwind)     |
| Estimated Tasks  | 14                                                  |

---

## UX Design

### Before State

```
┌─────────────────────────────────────────────────────────────────┐
│ Live Chat (standalone fullscreen)                                │
├──────────────┬──────────────────────────────┬───────────────────┤
│ Conversation │         Chat Area            │  Customer Panel   │
│ List (w-72)  │       (flex-1)               │    (w-64)         │
│              │                              │                   │
│ Dark purple  │  White header (h-14)         │  Basic info       │
│ gradient     │  bg-white/80 backdrop-blur   │  Avatar + name    │
│ #2B2840 →    │                              │  LINE ID          │
│ #1E1B33      │  Messages (bg-slate-100)     │  Session status   │
│              │  - User: white bg            │  Export buttons   │
│ Home button  │  - Bot: gray bg              │  Delete button    │
│ Search bar   │  - Admin: green bg           │                   │
│ Filter tabs  │                              │                   │
│ Conv items   │  Input footer                │                   │
│ Status bar   │  - Canned/Attach/Text/Send   │                   │
└──────────────┴──────────────────────────────┴───────────────────┘
```

### After State

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Live Chat (standalone fullscreen — NEW DESIGN)                          │
├────────┬──────────────┬───────────────────────────────┬─────────────────┤
│ Admin  │ Conversation │          Chat Room            │  User Profile   │
│ Side-  │ List (w-80)  │        (flex-1)               │  Panel (w-72)   │
│ bar    │              │                               │                 │
│ (68-   │ Card header  │  Header (h-16)                │  Avatar + name  │
│ 220px) │ w/ counters  │  - Avatar + status dot        │  Status + tags  │
│        │              │  - Bot/Manual toggle           │  Quick actions  │
│ Dark   │ Search input │  - Call/Profile/More buttons   │  Stats cards    │
│ slate  │ Status pills │                               │  Contact info   │
│ bg     │ (all/online/ │  Messages area                │  - Email, Phone │
│        │  away/busy/  │  - Date separator             │  - Location     │
│ Logo   │  offline)    │  - Animated bubbles (slide)   │  Activity info  │
│ Nav    │              │  - Read receipts (✓/✓✓)       │  Internal notes │
│ items  │ User cards   │  - Reactions overlay          │  Admin actions  │
│ w/     │ - Avatar     │  - Image/File/Sticker render  │                 │
│ badges │ - Status dot │  - Typing indicator           │                 │
│        │ - VIP star   │                               │                 │
│ Admin  │ - Mode badge │  Quick replies bar            │                 │
│ profile│ - Unread     │                               │                 │
│        │ - Menu       │  Input area                   │                 │
│ Colla- │              │  - Toolbar (emoji/sticker/    │                 │
│ pse    │ Summary bar  │    image/file/quick/expand)   │                 │
│ toggle │              │  - Emoji grid picker          │                 │
│        │              │  - Sticker grid picker        │                 │
│        │              │  - Textarea + Send button     │                 │
├────────┴──────────────┴───────────────────────────────┴─────────────────┤
│ Toast Notifications (top-right)  │  Sound Toggle (bottom-right)         │
└──────────────────────────────────┴──────────────────────────────────────┘
```

### Interaction Changes

| Location | Before | After | User Impact |
|----------|--------|-------|-------------|
| Sidebar | Home button only | Full icon nav sidebar with collapse | Quick access to other admin sections |
| Conversation list | 3 filter tabs | Status pill filters (all/online/away/busy/offline) + mode counters | Better filtering by user status |
| User cards | Basic text + unread badge | Rich cards with avatar, status dot, VIP star, Bot/Manual badge, typing indicator | Instant visual context per user |
| Chat header | Simple avatar + mode text | Avatar with status dot, Bot/Manual toggle button, call buttons, profile toggle | More actions at fingertips |
| Messages | Plain bubbles, no animation | Slide-in animations, read receipts, reactions | Polished feel, message status |
| Input area | Single line input with 4 buttons | Expandable textarea with toolbar (emoji/sticker/image/file/quick replies) | Rich messaging capabilities |
| Customer panel | Basic info (LINE ID, status, export) | Profile with stats, contact info, notes, action buttons | Complete customer context |
| Notifications | None | Toast notifications with sound toggle | Never miss incoming messages |

---

## Mandatory Reading

**CRITICAL: Implementation agent MUST read these files before starting any task:**

| Priority | File | Why Read This |
|----------|------|---------------|
| P0 | `examples/admin-chat-system/components/admin-sidebar.tsx` | Sidebar pattern to ADAPT |
| P0 | `examples/admin-chat-system/components/user-list-panel.tsx` | Conversation list design to MIRROR |
| P0 | `examples/admin-chat-system/components/chat-room.tsx` | Chat room UI to ADAPT |
| P0 | `examples/admin-chat-system/components/user-profile-panel.tsx` | Customer panel design to MIRROR |
| P0 | `examples/admin-chat-system/components/notification-toast.tsx` | Toast system to ADAPT |
| P0 | `examples/admin-chat-system/app/globals.css` | CSS variables and animations to PORT |
| P0 | `examples/admin-chat-system/lib/mock-data.ts` | Data types for reference |
| P1 | `frontend/app/admin/live-chat/_context/LiveChatContext.tsx` | ALL backend wiring — DO NOT MODIFY logic |
| P1 | `frontend/app/admin/live-chat/_types.ts` | Current data types — map to example |
| P1 | `frontend/app/admin/live-chat/_hooks/useChatReducer.ts` | State shape — wire new UI to this |
| P1 | `frontend/hooks/useLiveChatSocket.ts` | WebSocket hook — use as-is |
| P1 | `frontend/hooks/useNotificationSound.ts` | Sound hook — integrate with toast |
| P2 | `frontend/app/globals.css` | Current CSS variables — merge example's |
| P2 | `frontend/components/admin/CannedResponsePicker.tsx` | Keep existing — restyle only |

---

## Patterns to Mirror

**COMPONENT STRUCTURE** (from example):
```tsx
// SOURCE: examples/admin-chat-system/components/admin-sidebar.tsx:46-50
// Every component is "use client" with named export
"use client"
export function AdminSidebar() {
  const [isCollapsed, setIsCollapsed] = useState(false)
  // ...
}
```

**CSS VARIABLE COLOR SYSTEM** (from example):
```css
/* SOURCE: examples/admin-chat-system/app/globals.css:16-55 */
:root {
  --primary: 217 91% 60%;
  --sidebar-background: 222 47% 11%;
  --online: 142 71% 45%;
  --away: 38 92% 50%;
  /* Usage: hsl(var(--primary)) */
}
```

**ANIMATION CLASSES** (from example):
```css
/* SOURCE: examples/admin-chat-system/app/globals.css:103-165 */
.msg-in { animation: slide-in-left 0.3s ease-out; }
.msg-out { animation: slide-in-right 0.3s ease-out; }
.fade-in { animation: fade-in 0.3s ease-out; }
.scale-in { animation: scale-in 0.2s ease-out; }
.toast-slide { animation: toast-slide 0.4s ease-out; }
.blink-badge { animation: blink-badge 1s ease-in-out infinite; }
```

**BACKEND WIRING PATTERN** (current — PRESERVE):
```tsx
// SOURCE: frontend/app/admin/live-chat/_context/LiveChatContext.tsx:62-63
// Provider wraps shell, provides state+dispatch+ws methods
export function LiveChatProvider({ children }) {
  const [state, dispatch] = useChatReducer();
  const { user, token } = useAuth();
  // WebSocket setup, fetch methods, etc.
}
```

**STATE ACCESS PATTERN** (current — PRESERVE):
```tsx
// SOURCE: frontend/app/admin/live-chat/_components/LiveChatShell.tsx:13-20
// Components consume context via useLiveChatContext()
const { state, isMobileView, fetchConversations, ... } = useLiveChatContext();
```

---

## Files to Change

### New Files

| File | Action | Purpose |
|------|--------|---------|
| `frontend/app/admin/live-chat/_components/AdminSidebar.tsx` | CREATE | Icon nav sidebar (adapted from example) |
| `frontend/app/admin/live-chat/_components/EmojiPicker.tsx` | CREATE | Emoji grid picker |
| `frontend/app/admin/live-chat/_components/StickerPicker.tsx` | CREATE | Sticker grid picker |
| `frontend/app/admin/live-chat/_components/QuickReplies.tsx` | CREATE | Quick reply pills bar |
| `frontend/app/admin/live-chat/_components/NotificationToast.tsx` | CREATE | Toast notification provider |

### Updated Files

| File | Action | Scope |
|------|--------|-------|
| `frontend/app/globals.css` | UPDATE | Add example's CSS variables (sidebar-*, online/away/busy/offline, animations) |
| `frontend/app/admin/live-chat/_components/LiveChatShell.tsx` | UPDATE | Add AdminSidebar, wrap with NotificationToast |
| `frontend/app/admin/live-chat/_components/ConversationList.tsx` | UPDATE | Restyle to match UserListPanel (status dots, mode badges, VIP stars, summary bar) |
| `frontend/app/admin/live-chat/_components/ConversationItem.tsx` | UPDATE | Restyle card (avatar status dot, typing indicator, mode badge, action menu) |
| `frontend/app/admin/live-chat/_components/ChatArea.tsx` | UPDATE | Add message animations, date separator, connection status redesign |
| `frontend/app/admin/live-chat/_components/ChatHeader.tsx` | UPDATE | Restyle header (status dot, Bot/Manual toggle button, call/profile buttons) |
| `frontend/app/admin/live-chat/_components/MessageBubble.tsx` | UPDATE | Restyle bubbles (rounded-2xl, animations, read receipts, reactions) |
| `frontend/app/admin/live-chat/_components/MessageInput.tsx` | UPDATE | Add toolbar, emoji/sticker/quick-reply buttons, expandable textarea |
| `frontend/app/admin/live-chat/_components/CustomerPanel.tsx` | UPDATE | Full redesign with stats cards, contact sections, notes, action buttons |

---

## NOT Building (Scope Limits)

- **Video call modal** — The example has a `VideoCallModal` but we have no backend video call support. Skip entirely.
- **Zustand migration** — The example uses Zustand store. We keep our existing `useChatReducer` + Context pattern.
- **Mock data** — The example uses mock data. We keep real backend API calls and WebSocket.
- **shadcn/ui component library** — The example uses full shadcn/ui with Radix. We adapt the visual styling without adding 40+ shadcn/ui packages.
- **Dark mode** — The example has no dark mode. We preserve existing dark mode from `globals.css` but don't extend it.
- **Backend changes** — Zero backend modifications. All changes are frontend UI only.
- **Analytics page** — Already exists, not part of this migration.
- **Auth changes** — Keep current AuthContext as-is.

---

## Step-by-Step Tasks

### Task 1: ADD CSS variables and animations to globals.css

- **ACTION**: MERGE example's CSS variables into existing `frontend/app/globals.css`
- **IMPLEMENT**:
  - Add sidebar CSS variables: `--sidebar-background`, `--sidebar-foreground`, `--sidebar-primary`, `--sidebar-accent`, `--sidebar-border`, `--sidebar-muted`
  - Add status color variables: `--online`, `--away`, `--busy`, `--offline`
  - Add animation keyframes: `slide-in-left`, `slide-in-right`, `typing-bounce`, `blink-badge`, `pulse-ring`, `toast-slide`, `scale-in`
  - Add utility classes: `.msg-in`, `.msg-out`, `.typing-dot`, `.blink-badge`, `.scale-in`, `.toast-slide`, `.custom-scrollbar`
- **SOURCE**: `examples/admin-chat-system/app/globals.css:16-165`
- **GOTCHA**: Don't overwrite existing CSS variables. ADD new ones alongside. Use `@layer base` for variable definitions and `@layer utilities` for custom classes. Current file uses Tailwind 4 `@theme` syntax — add new vars inside existing structure.
- **VALIDATE**: `cd frontend && npm run build`

### Task 2: CREATE AdminSidebar component

- **ACTION**: CREATE `frontend/app/admin/live-chat/_components/AdminSidebar.tsx`
- **IMPLEMENT**: Adapt `examples/admin-chat-system/components/admin-sidebar.tsx` but:
  - Replace generic nav items with actual admin routes (Dashboard, Live Chat active, Chatbot, Settings)
  - Use Next.js `Link` for navigation (not button onClick)
  - Add `Live Chat` as active/highlighted item
  - Keep collapsible behavior (68px ↔ 220px)
  - Add admin profile section at bottom
  - Use simple tooltips (title attribute or custom) instead of importing shadcn Tooltip
  - Wire "Home" link to `/admin`
- **MIRROR**: `examples/admin-chat-system/components/admin-sidebar.tsx:46-183`
- **DATA**: Use `useLiveChatContext()` for conversation counts in badges
- **VALIDATE**: `cd frontend && npx tsc --noEmit`

### Task 3: CREATE EmojiPicker component

- **ACTION**: CREATE `frontend/app/admin/live-chat/_components/EmojiPicker.tsx`
- **IMPLEMENT**: Grid of emoji buttons, fires `onSelect(emoji: string)` callback
  - 30 common emojis in 10-column grid
  - `scale-in` animation on open
  - Hover scale effect on each emoji
  - Rounded border container
- **MIRROR**: `examples/admin-chat-system/components/chat-room.tsx:440-452` (emoji picker section)
- **VALIDATE**: `cd frontend && npx tsc --noEmit`

### Task 4: CREATE StickerPicker component

- **ACTION**: CREATE `frontend/app/admin/live-chat/_components/StickerPicker.tsx`
- **IMPLEMENT**: Grid of animated sticker GIFs from Google Noto Emoji
  - 12 stickers in 6-column grid
  - `scale-in` animation on open
  - Hover scale + bg effect
  - Fire `onSelect(stickerUrl: string)` callback
- **MIRROR**: `examples/admin-chat-system/components/chat-room.tsx:455-467` (sticker picker section)
- **NOTE**: Stickers are visual-only for admin interface. Backend sends as text message with sticker URL.
- **VALIDATE**: `cd frontend && npx tsc --noEmit`

### Task 5: CREATE QuickReplies component

- **ACTION**: CREATE `frontend/app/admin/live-chat/_components/QuickReplies.tsx`
- **IMPLEMENT**: Horizontal scrollable pill bar with quick reply options
  - 6 predefined quick replies (Greeting, Thanks, Hold, Transfer, Resolved, Follow up)
  - Each pill is a rounded-full button
  - Clicking fills the input textarea
  - `scale-in` animation on open
  - Border-top separator
- **MIRROR**: `examples/admin-chat-system/components/chat-room.tsx:372-388` (quick replies section)
- **NOTE**: This is separate from the existing CannedResponsePicker (which loads from API). QuickReplies are hardcoded fast-access pills.
- **VALIDATE**: `cd frontend && npx tsc --noEmit`

### Task 6: CREATE NotificationToast provider

- **ACTION**: CREATE `frontend/app/admin/live-chat/_components/NotificationToast.tsx`
- **IMPLEMENT**: Adapt `examples/admin-chat-system/components/notification-toast.tsx` but:
  - Wire to existing `useNotificationSound` hook instead of creating new AudioContext
  - Remove demo notifications (no setTimeout auto-fire)
  - Export `useToast()` hook for adding toasts from LiveChatContext
  - Toast types: message, system
  - Auto-dismiss after 5 seconds
  - Fixed position top-right
  - Sound toggle button bottom-right (use existing soundEnabled state)
- **MIRROR**: `examples/admin-chat-system/components/notification-toast.tsx:16-150`
- **VALIDATE**: `cd frontend && npx tsc --noEmit`

### Task 7: UPDATE ConversationList — restyle to match example

- **ACTION**: REWRITE visual layer of `frontend/app/admin/live-chat/_components/ConversationList.tsx`
- **IMPLEMENT**:
  - **Header**: Replace `h-14` dark header with example's style — show "Conversations" title + online/total counter + Bot/Manual mode counter + filter toggle button
  - **Search**: Keep existing search logic, restyle input to match example (rounded-lg, border, focus ring)
  - **Status filters**: Replace 3-tab bar (All/Waiting/Active) with 5 status pills (All/Online/Away/Busy/Offline) — map to backend session statuses: Online=ACTIVE, Busy=WAITING, Offline=no session
  - **User cards**: Delegate to updated ConversationItem (next task)
  - **Summary bar**: Add bottom status summary bar with colored dots and counts
  - **Empty state**: Add Search icon + "No conversations found" message
  - **Background**: Keep dark sidebar bg using `bg-sidebar` (CSS variable)
- **PRESERVE**: All existing data fetching, search API calls, keyboard navigation, jumpToMessage
- **GOTCHA**: Map backend `Conversation` type to the visual states. `session.status === 'ACTIVE'` → online dot, `'WAITING'` → orange/busy dot, no session → offline dot.
- **VALIDATE**: `cd frontend && npm run build`

### Task 8: UPDATE ConversationItem — restyle card

- **ACTION**: REWRITE visual layer of `frontend/app/admin/live-chat/_components/ConversationItem.tsx`
- **IMPLEMENT**:
  - **Avatar**: `w-10 h-10 rounded-full` with status dot (`-bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card`)
  - **Name row**: Name (truncate, font-semibold) + VIP star (if tagged) + NEW badge (if new user)
  - **Message preview**: Show typing indicator dots when typing, otherwise last message text
  - **Status message**: Optional italic sub-text line
  - **Right column**: Time ago + unread badge (rounded-full, blink-badge) + Bot/Manual mode indicator
  - **Action menu**: Three-dot button on hover (opacity-0 → group-hover:opacity-100)
  - **Selected state**: `bg-primary/10 ring-1 ring-primary/20` instead of current `bg-primary/15 border-primary/30`
- **PRESERVE**: All existing props interface, memo optimization, onClick/onMenuClick handlers
- **MIRROR**: `examples/admin-chat-system/components/user-list-panel.tsx:56-181` (UserCard)
- **VALIDATE**: `cd frontend && npx tsc --noEmit`

### Task 9: UPDATE ChatHeader — restyle with toggle and action buttons

- **ACTION**: REWRITE `frontend/app/admin/live-chat/_components/ChatHeader.tsx`
- **IMPLEMENT**:
  - **Height**: Change from `h-14` to `h-16` to match example
  - **Left section**: Avatar with status dot + name + mode text ("Manual Mode" / "Bot Mode")
  - **Bot/Manual toggle**: Inline pill button (not ChatModeToggle component) — colored accent for bot, primary for manual, with icon inside circle
  - **VIP badge**: Show if conversation has VIP tag
  - **Right section**: Phone button, Video button (placeholder), Profile toggle, More menu (dropdown with Clear/Export/Transfer/Block)
  - **Session actions**: Keep Claim/Transfer/Done from SessionActions component but restyle as the example's button patterns
- **PRESERVE**: All existing props and callbacks (onClaim, onClose, onTransfer, onToggleMode, onToggleCustomerPanel, onBackToList)
- **MIRROR**: `examples/admin-chat-system/components/chat-room.tsx:251-348` (chat header section)
- **VALIDATE**: `cd frontend && npx tsc --noEmit`

### Task 10: UPDATE MessageBubble — add animations, receipts, reactions

- **ACTION**: REWRITE visual layer of `frontend/app/admin/live-chat/_components/MessageBubble.tsx`
- **IMPLEMENT**:
  - **Animation**: Add `msg-in` class for incoming, `msg-out` for outgoing messages
  - **Bubble styling**: `rounded-2xl px-4 py-2.5 text-sm leading-relaxed` — incoming: `rounded-tl-sm bg-muted`, outgoing: `rounded-tr-sm bg-primary text-primary-foreground`
  - **Avatar**: Show user avatar for incoming (7x7 rounded-full), bot/admin icon for outgoing
  - **Sender label**: `text-[10px] text-muted-foreground` above bubble
  - **Read receipts**: Single check (sent) vs double check (read) — use `Check` and `CheckCheck` from lucide
  - **Timestamp**: `text-[10px] text-muted-foreground` below bubble
  - **Image messages**: `max-h-48 rounded-lg object-cover` in overflow-hidden container
  - **File messages**: File icon + name + size in `bg-background/10 p-3 rounded-lg`
  - **Pending/Failed**: Keep existing RefreshCw spinner / AlertCircle + Retry logic
  - **Max width**: `max-w-[65%]` instead of current `max-w-[60%]`
- **PRESERVE**: memo optimization, all props, message type rendering logic, pending/failed state
- **MIRROR**: `examples/admin-chat-system/components/chat-room.tsx:54-146` (MessageBubble)
- **VALIDATE**: `cd frontend && npx tsc --noEmit`

### Task 11: UPDATE MessageInput — add toolbar and pickers

- **ACTION**: REWRITE `frontend/app/admin/live-chat/_components/MessageInput.tsx`
- **IMPLEMENT**:
  - **Layout**: Two-row footer — toolbar row on top, textarea + send on bottom
  - **Toolbar buttons**: Emoji, Sticker, Image upload, File attach, Quick replies, Expand/Minimize toggle
  - **Textarea**: Replace `<input>` with `<textarea>` — auto-resize (min 40px, max 120px), expandable mode (150px)
  - **Emoji picker**: Toggle `EmojiPicker` component, append selected emoji to input
  - **Sticker picker**: Toggle `StickerPicker` component, send sticker as message
  - **Quick replies**: Toggle `QuickReplies` bar above input, fill textarea on click
  - **Send button**: Rounded-xl, gradient when active, muted when empty
  - **Bot mode overlay**: Show "Bot is handling" label above when not in HUMAN mode
  - **Canned responses**: Keep existing `CannedResponsePicker` integration
- **PRESERVE**: All existing callbacks (onSend, onSendFile, onToggleCannedPicker, onToggleSound, onTyping), disabled states
- **MIRROR**: `examples/admin-chat-system/components/chat-room.tsx:390-512` (input area)
- **VALIDATE**: `cd frontend && npx tsc --noEmit`

### Task 12: UPDATE CustomerPanel — full redesign with stats and sections

- **ACTION**: REWRITE `frontend/app/admin/live-chat/_components/CustomerPanel.tsx`
- **IMPLEMENT**:
  - **Width**: Change from `w-64` to `w-72` (300px)
  - **Header**: "User Profile" title + close button (h-16)
  - **Avatar section**: Larger avatar (w-20 h-20) with ring-4 + status dot, name, status label, tags
  - **Quick actions**: Video call button (primary), mute button, block button
  - **Stats cards**: 3-column grid — Chats count, Rating, Joined date (with icons)
  - **Contact info**: Email (copyable), Phone (copyable), Location, Timezone — each in InfoRow with icon + label + value
  - **Activity section**: Joined date, Last Active, Conversations count, Assigned Agent
  - **Internal notes**: Textarea for agent notes
  - **Admin actions**: Manage Tags, Change Role, View Full Profile buttons
  - **Export**: Keep existing CSV/PDF download functionality
  - **Delete**: Keep existing delete button at bottom
- **PRESERVE**: All existing API calls (downloadExport, refreshProfile), auth token usage
- **MIRROR**: `examples/admin-chat-system/components/user-profile-panel.tsx:80-235`
- **GOTCHA**: Current data model (`CurrentChat`) has limited fields compared to example. Use available data: `display_name`, `picture_url`, `line_user_id`, `session`, `chat_mode`. Show "N/A" for missing fields like email/phone/location.
- **VALIDATE**: `cd frontend && npx tsc --noEmit`

### Task 13: UPDATE LiveChatShell — integrate sidebar and toasts

- **ACTION**: UPDATE `frontend/app/admin/live-chat/_components/LiveChatShell.tsx`
- **IMPLEMENT**:
  - Wrap entire layout with `NotificationToastProvider`
  - Add `AdminSidebar` as leftmost panel
  - Layout becomes: `AdminSidebar | ConversationList | ChatArea | CustomerPanel`
  - Keep existing connection-lost banner logic
  - Keep existing mobile responsive logic
  - Keep existing TransferDialog
- **PRESERVE**: All existing state wiring, mobile view logic, transfer dialog
- **VALIDATE**: `cd frontend && npm run build`

### Task 14: UPDATE ChatArea — polish messages area and connection status

- **ACTION**: UPDATE visual elements of `frontend/app/admin/live-chat/_components/ChatArea.tsx`
- **IMPLEMENT**:
  - **Empty state**: Match example's welcome screen (icon in rounded-2xl primary/10 bg, title, subtitle)
  - **Connection status**: Pill badge in header (colored dot + label)
  - **Date separator**: Horizontal lines with date text in center (like example's `Today` separator)
  - **Messages container**: Add `custom-scrollbar` class, keep existing virtual scrolling
  - **Background**: `bg-background` instead of `bg-slate-100`
- **PRESERVE**: ALL existing logic — virtual scrolling, IntersectionObserver, history loading, focused message scroll, viewport resize observer. DO NOT TOUCH any useEffect or data logic.
- **VALIDATE**: `cd frontend && npm run build`

---

## Testing Strategy

### Visual Verification

| Check | Expected |
|-------|----------|
| Sidebar renders and collapses | 68px collapsed, 220px expanded, smooth transition |
| Conversation list shows users with status dots | Green/orange/gray dots based on session |
| Messages animate on send/receive | slide-in-left for incoming, slide-in-right for outgoing |
| Emoji picker opens and appends | Grid overlay, emoji appended to textarea |
| Customer panel shows profile | Avatar, stats, contact info sections |
| Toast notifications appear | Top-right slide-in, auto-dismiss after 5s |
| Mobile responsive | Sidebar hidden, panels stack vertically |

### Functional Verification

- [ ] WebSocket connects and authenticates
- [ ] Selecting conversation loads messages from API
- [ ] Sending message via WebSocket works
- [ ] Sending message via REST fallback works
- [ ] Claim/Close/Transfer session actions work
- [ ] Bot/Manual mode toggle works
- [ ] Canned responses picker works
- [ ] File upload works
- [ ] Sound notification toggle works
- [ ] Older message loading (infinite scroll) works
- [ ] Message search works
- [ ] Keyboard navigation in conversation list works

### Edge Cases Checklist

- [ ] Empty conversation list (no conversations)
- [ ] No selected conversation (welcome screen)
- [ ] Very long display names (truncation)
- [ ] Very long messages (word wrap)
- [ ] Image messages render correctly
- [ ] File messages with download link
- [ ] Pending/failed message states
- [ ] Connection lost/reconnecting states
- [ ] Mobile viewport (<768px)

---

## Validation Commands

### Level 1: STATIC_ANALYSIS

```bash
cd frontend && npx tsc --noEmit && npm run lint
```

**EXPECT**: Exit 0, no type errors, no lint errors

### Level 2: BUILD

```bash
cd frontend && npm run build
```

**EXPECT**: Build succeeds without errors

### Level 3: VISUAL_VALIDATION

```bash
cd frontend && npm run dev
# Open http://localhost:3000/admin/live-chat
```

**EXPECT**: 4-panel layout renders, sidebar collapses, conversations list loads, messages display

---

## Acceptance Criteria

- [ ] 4-panel layout: AdminSidebar | ConversationList | ChatArea | CustomerPanel
- [ ] AdminSidebar collapses from 220px to 68px with icon-only mode
- [ ] Conversation cards show avatar with status dot, VIP indicator, Bot/Manual badge
- [ ] Message bubbles have slide-in animations and read receipt indicators
- [ ] Emoji picker and sticker picker functional
- [ ] Quick replies bar fills textarea on click
- [ ] Customer panel shows stats cards, contact info, internal notes
- [ ] Toast notifications appear for incoming messages
- [ ] ALL existing WebSocket + REST API functionality preserved
- [ ] `npm run build` succeeds
- [ ] `npx tsc --noEmit` passes

---

## Completion Checklist

- [ ] Task 1: CSS variables and animations added
- [ ] Task 2: AdminSidebar created
- [ ] Task 3: EmojiPicker created
- [ ] Task 4: StickerPicker created
- [ ] Task 5: QuickReplies created
- [ ] Task 6: NotificationToast created
- [ ] Task 7: ConversationList restyled
- [ ] Task 8: ConversationItem restyled
- [ ] Task 9: ChatHeader restyled
- [ ] Task 10: MessageBubble restyled
- [ ] Task 11: MessageInput restyled with toolbar
- [ ] Task 12: CustomerPanel redesigned
- [ ] Task 13: LiveChatShell integrated
- [ ] Task 14: ChatArea polished
- [ ] Level 1: `npx tsc --noEmit && npm run lint` passes
- [ ] Level 2: `npm run build` succeeds
- [ ] Level 3: Visual validation in browser

---

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Breaking WebSocket wiring during restyle | MED | HIGH | Never modify LiveChatContext.tsx or hooks. Only change component render/JSX. |
| CSS variable conflicts with existing theme | LOW | MED | Add new variables alongside existing ones. Namespace sidebar vars with `--sidebar-` prefix. |
| Mobile layout breaks with 4 panels | MED | MED | AdminSidebar hidden on mobile. Keep existing mobile responsive logic. |
| Performance regression from animations | LOW | LOW | Use CSS animations (GPU-accelerated), not JS. Keep existing memo optimizations. |
| Tailwind class conflicts (v3 example vs v4 current) | MED | MED | The example uses Tailwind 3 config syntax. Our project uses Tailwind 4 `@theme`. Convert example classes to work with our setup. |

---

## Notes

### Key Differences Between Example and Current App

1. **State management**: Example uses Zustand with mock data. Current uses useReducer + Context + real WebSocket/REST API. We keep current approach.
2. **Data model**: Example `User` has many fields (email, phone, location, satisfaction). Current `Conversation` has only `line_user_id`, `display_name`, `picture_url`, `session`, `chat_mode`. CustomerPanel will show "N/A" for unavailable fields.
3. **Tailwind version**: Example uses Tailwind 3.4 with `tailwind.config.ts`. Current uses Tailwind 4 with `@theme` in CSS. Must convert example's utility patterns.
4. **UI library**: Example uses full shadcn/ui (Radix primitives). Current has custom Button, Avatar, Tooltip. We style components directly without importing Radix.
5. **Message model**: Example has `reactions`, `isRead` per message. Current has `pending`/`failed` states but no reactions/read status from backend. Read receipts will be visual-only based on `direction === 'OUTGOING'`.

### Implementation Order Rationale

Tasks 1-6 create foundations (CSS, new components) with no risk of breaking existing UI.
Tasks 7-12 restyle existing components one-by-one — each independently verifiable.
Tasks 13-14 integrate everything and polish.
