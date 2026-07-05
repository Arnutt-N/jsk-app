# Live Chat Frontend — Reference

Sources: `_store/liveChatStore.ts`, `_context/LiveChatContext.tsx`,
`hooks/useLiveChatSocket.ts`, `hooks/useWebSocket.ts`,
`_types.ts`, `lib/websocket/types.ts`

---

## File Locations

| File | Purpose |
|---|---|
| `frontend/app/admin/live-chat/_store/liveChatStore.ts` | Zustand store — ALL state |
| `frontend/app/admin/live-chat/_context/LiveChatContext.tsx` | Provider: async API methods + WS wiring |
| `frontend/app/admin/live-chat/_types.ts` | TypeScript types: Conversation, CurrentChat, Session |
| `frontend/app/admin/live-chat/layout.tsx` | Wraps with `<LiveChatProvider>` |
| `frontend/app/admin/live-chat/page.tsx` | Renders `<LiveChatShell>` |
| `frontend/app/admin/live-chat/_components/` | 15 React components |
| `frontend/hooks/useLiveChatSocket.ts` | WebSocket hook: event dispatch layer |
| `frontend/hooks/useWebSocket.ts` | Raw WebSocket connection + reconnect |
| `frontend/lib/websocket/types.ts` | MessageType enum + payload interfaces |
| `frontend/hooks/useNotificationSound.ts` | Sound notification hook |

---

## Domain Types (`_types.ts`)

```ts
interface Session {
  id: number;
  status: 'WAITING' | 'ACTIVE' | 'CLOSED';
  started_at?: string;
  operator_id?: number;
}

interface ConversationTag {
  id: number;
  name: string;
  color: string;   // '#RRGGBB'
}

interface Conversation {
  line_user_id: string;    // primary key — route param for all API calls
  display_name: string;
  picture_url: string;
  friend_status: string;   // 'ACTIVE' | 'BLOCKED' | 'DELETED'
  chat_mode: 'BOT' | 'HUMAN';
  session?: Session;
  last_message?: { content: string; created_at: string };
  unread_count: number;
  tags?: ConversationTag[];
}

interface CurrentChat extends Conversation {
  messages?: Message[];    // full message list, loaded separately
}
```

---

## Zustand Store — Full State Shape

```ts
interface LiveChatState {
  // Core data
  conversations:     Conversation[]
  selectedId:        string | null       // line_user_id of open conversation
  currentChat:       CurrentChat | null  // detail of selected conversation
  messages:          Message[]
  loading:           boolean
  backendOnline:     boolean
  filterStatus:      string | null       // 'WAITING' | 'ACTIVE' | null
  searchQuery:       string
  inputText:         string              // "/" triggers canned picker
  sending:           boolean
  claiming:          boolean
  showCustomerPanel: boolean
  activeActionMenu:  string | null
  showTransferDialog: boolean
  showCannedPicker:  boolean
  soundEnabled:      boolean
  pendingMessages:   Set<string>         // tempId set — in-flight messages
  failedMessages:    Map<string, string> // tempId → error string
  hasMoreHistory:    boolean
  isLoadingHistory:  boolean

  // UI extensions
  showEmojiPicker:   boolean
  showStickerPicker: boolean
  showQuickReplies:  boolean
  inputExpanded:     boolean
  notifications:     ToastNotification[]
}
```

### Key Actions

| Action | Effect |
|---|---|
| `setConversations(list)` | Replace full list |
| `selectChat(id)` | Set selectedId (does NOT reset messages) |
| `addMessage(msg)` | Append to messages array |
| `prependMessages(msgs)` | Prepend (for history load) |
| `addPending(tempId)` | Add to pendingMessages Set |
| `removePending(tempId)` | Remove from pendingMessages Set |
| `setFailed(tempId, err)` | Add to failedMessages Map |
| `clearFailed(tempId)` | Remove from failedMessages Map |
| `addNotification(n)` | Auto-assigns id + timestamp |
| `removeNotification(id)` | Filter from notifications array |
| `toggleEmojiPicker()` | Opens emoji, closes sticker+quickReplies |
| `toggleStickerPicker()` | Opens sticker, closes emoji+quickReplies |
| `toggleQuickReplies()` | Opens quickReplies, closes emoji+sticker |
| `closeAllPickers()` | Closes all three |
| `setInputText(text)` | Also sets `showCannedPicker = (text === '/')` |

---

## LiveChatContext — Method Reference

```ts
interface LiveChatContextValue {
  // State snapshot (from Zustand subscriptions — use selectors instead)
  state: ChatState

  // WS + view state
  wsStatus: ConnectionState       // 'connected' | 'disconnected' | 'connecting'
  isMobileView: boolean           // window.matchMedia('(max-width: 767px)')
  typingUsersCount: number        // count of admins currently typing in room
  focusedMessageId: number | null // set by jumpToMessage()
  isHumanMode: boolean            // currentChat?.chat_mode === 'HUMAN'
  selectedConversation: Conversation | null // derived from conversations + selectedId

  // Simple setters (delegate to store)
  setSearchQuery(value: string): void
  setFilterStatus(value: string | null): void
  setInputText(value: string): void
  setShowCustomerPanel(value: boolean): void
  setActiveActionMenu(value: string | null): void
  setShowTransferDialog(value: boolean): void
  setShowCannedPicker(value: boolean): void
  setSoundEnabled(value: boolean): void   // also calls setEnabled() on sound hook

  // Navigation
  selectConversation(id: string | null): void  // sets selectedId + URL + resets unread
  jumpToMessage(lineUserId: string, messageId: number): void
  clearFocusedMessage(): void

  // Async API methods (WS preferred, REST fallback)
  fetchConversations(): Promise<void>
  fetchChatDetail(id: string, includeMessages?: boolean): Promise<void>
  sendMessage(text: string): Promise<void>
  sendMedia(file: File): Promise<void>
  claimSession(): Promise<void>
  closeSession(): Promise<void>
  transferSession(toOperatorId: number, reason?: string): Promise<void>
  toggleMode(mode: 'BOT' | 'HUMAN'): Promise<void>
  loadOlderMessages(): Promise<void>

  // WS control
  reconnect(): void
  retryMessage(tempId: string): void
  startTyping(lineUserId: string): void

  // Utility
  formatTime(value: string): string  // '5m' | '2h' | 'Yesterday' | 'Jan 15'
}
```

---

## API Endpoints Used by Context

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/admin/live-chat/conversations?status=X` | Conversation list |
| `GET` | `/admin/live-chat/conversations/{id}` | Chat detail (no messages) |
| `GET` | `/admin/live-chat/conversations/{id}/messages?limit=50&before_id=N` | History pagination |
| `POST` | `/admin/live-chat/conversations/{id}/messages` | REST fallback send |
| `POST` | `/admin/live-chat/conversations/{id}/media` | Media send (multipart) |
| `POST` | `/admin/live-chat/conversations/{id}/claim` | REST fallback claim |
| `POST` | `/admin/live-chat/conversations/{id}/close` | REST fallback close |
| `POST` | `/admin/live-chat/conversations/{id}/mode` | Toggle BOT/HUMAN |

WS endpoint: `ws(s)://<backend-host>/api/v1/ws/live-chat`. Build the URL with the
shared helper `getLiveChatWsUrl()` from `lib/websocket/wsUrl.ts` — do NOT rebuild it
inline from `window.location.host`. On production the frontend is on Vercel, whose
rewrite proxy strips the WebSocket upgrade headers, so the socket MUST connect
directly to the backend host derived from `NEXT_PUBLIC_API_URL` (absolute → e.g.
`wss://xxx.koyeb.app/api/v1/ws/live-chat`); it falls back to `window.location.host`
only when the env var is unset/relative (local dev via Next rewrites). Auth (JWT) is
sent in the first `auth` WS message, never in the URL.

---

## WebSocket Event Types (`lib/websocket/types.ts`)

### Client → Server

| MessageType | Payload |
|---|---|
| `auth` | `{ admin_id: string }` |
| `join_room` | `{ line_user_id: string }` |
| `leave_room` | `{}` |
| `send_message` | `{ text: string, temp_id?: string }` |
| `typing_start` | `{ line_user_id: string }` |
| `typing_stop` | `{ line_user_id: string }` |
| `claim_session` | `{}` |
| `close_session` | `{}` |
| `transfer_session` | `{ to_operator_id: number, reason?: string }` |
| `ping` | `{}` |

### Server → Client

| MessageType | Payload Type |
|---|---|
| `new_message` | `Message` |
| `message_sent` | `Message` (with `temp_id` for dedup) |
| `message_ack` | `MessageAckPayload` → `{ temp_id, message_id }` |
| `message_failed` | `MessageFailedPayload` → `{ temp_id, error }` |
| `typing_indicator` | `TypingIndicatorPayload` → `{ line_user_id, admin_id, is_typing }` |
| `session_claimed` | `SessionPayload` → `{ line_user_id, operator_id }` |
| `session_closed` | `SessionPayload` → `{ line_user_id }` |
| `session_transferred` | `SessionTransferredPayload` → `{ line_user_id, from_operator_id, to_operator_id }` |
| `conversation_update` | `ConversationUpdatePayload` (full conversation refresh) |
| `presence_update` | `PresencePayload` → `{ operators: [...] }` |
| `operator_joined` | `{ admin_id, room_id }` |
| `operator_left` | `{ admin_id, room_id }` |
| `error` | `ErrorPayload` → `{ message }` |
| `pong` | `{}` |

---

## useLiveChatSocket — Interface

```ts
// Input options
interface UseLiveChatSocketOptions {
  adminId: string       // from auth context (required)
  token?: string        // JWT for WS auth message
  onNewMessage?: (message: Message) => void
  onMessageSent?: (message: Message) => void
  onMessageAck?: (tempId: string, messageId: number) => void
  onMessageFailed?: (tempId: string, error: string) => void
  onTyping?: (lineUserId: string, adminId: string, isTyping: boolean) => void
  onSessionClaimed?: (lineUserId: string, operatorId: number) => void
  onSessionClosed?: (lineUserId: string) => void
  onSessionTransferred?: (data: SessionTransferredPayload) => void
  onConversationUpdate?: (data: ConversationUpdatePayload) => void
  onPresenceUpdate?: (operators: PresencePayload['operators']) => void
  onConnectionChange?: (state: ConnectionState) => void
}

// Return value
interface UseLiveChatSocketReturn {
  status: ConnectionState
  isConnected: boolean
  joinRoom(lineUserId: string): void
  leaveRoom(): void
  sendMessage(text: string, tempId?: string): void
  retryMessage(tempId: string): void
  startTyping(lineUserId: string): void
  stopTyping(lineUserId: string): void
  claimSession(): void
  closeSession(): void
  transferSession(toOperatorId: number, reason?: string): void
  reconnect(): void
}
```

---

## Message Type (`lib/websocket/types.ts`)

```ts
interface Message {
  id: number              // 0 for optimistic messages
  line_user_id: string
  direction: 'INCOMING' | 'OUTGOING'
  content: string
  message_type: string    // 'text' | 'image' | 'sticker' | 'flex' | ...
  sender_role: 'USER' | 'BOT' | 'ADMIN' | 'SYSTEM'
  operator_name?: string
  created_at: string      // ISO 8601
  temp_id?: string        // set for optimistic messages
}
```

---

## Optimistic Message Flow

```
1. User hits Send
   → s.setSending(true)
   → tempId = `temp-${Date.now()}`
   → optimistic = { id: 0, temp_id: tempId, content: text, ... }
   → s.addMessage(optimistic)
   → s.addPending(tempId)

2a. WS connected path:
   → wsSendMessage(text, tempId)
   → Server sends back `message_sent` with temp_id
   → handleMessageSent() replaces optimistic with real message
   → handleMessageAck() removes from pending

2b. REST fallback path:
   → fetch(POST /conversations/{id}/messages)
   → fetchChatDetail() refreshes messages
   → handleMessageAck(tempId) clears pending

3. On WS error:
   → Server sends `message_failed` with temp_id
   → s.setFailed(tempId, error)
   → s.removePending(tempId)
   → UI shows error icon; user can retry via retryMessage(tempId)
```

---

## Connection Lifecycle

```
1. LiveChatProvider mounts
   → useLiveChatSocket({ adminId, token, ... }) creates WS connection
   → WS auto-sends auth message on connect
   → onConnectionChange fires

2. User selects conversation
   → selectConversation(lineUserId)
   → fetchChatDetail + fetchMessagesPage (parallel on mount)
   → joinRoom(lineUserId) — if WS connected

3. WS disconnects
   → setInterval fallback polls fetchConversations() every 5s
   → setInterval fallback polls fetchChatDetail(selectedId) every 3s
   → reconnect() can be called manually

4. User deselects / navigates away
   → leaveRoom() → cleans up room ref
   → setCurrentChat(null), setMessages([])
```

---

## Notification Toast Shape

```ts
interface ToastNotification {
  id: string        // auto-generated: `toast-${Date.now()}-${random}`
  title: string
  message: string
  avatar?: string
  type: 'message' | 'system'
  timestamp: number  // Date.now()
}

// Add from anywhere:
useLiveChatStore.getState().addNotification({
  title: 'Session Closed',
  message: 'Operator ended the session',
  type: 'system',
})
```

---

## Component Props Quick Reference

### MessageInput
```ts
interface MessageInputProps {
  inputText: string
  sending: boolean
  isHumanMode: boolean
  showCannedPicker: boolean
  soundEnabled: boolean
  onInputChange: (value: string) => void
  onSend: () => void
  onSendFile: (file: File) => void
  onToggleCannedPicker: () => void
  onSelectCanned: (content: string) => void
  onCloseCanned: () => void
  onToggleSound: () => void
  onTyping: () => void
}
// Also reads directly from Zustand:
// showEmojiPicker, showStickerPicker, showQuickReplies, inputExpanded
```

### ConversationItem
Rendered by `ConversationList`. Expects `Conversation` + `isSelected: boolean` +
event callbacks. Shows avatar, display name, last message preview, unread badge, session
status pill, and tag chips.

---

## Known Gaps

| ID | Gap | Severity | Fix |
|---|---|---|---|
| GAP-1 | `state.X` from context (not selectors) causes re-renders | Medium | Use `useLiveChatStore((s) => s.X)` directly |
| GAP-2 | `retryMessage` stores pending in `useRef` on hook (loses on remount) | Low | Move pending to Zustand store |
| GAP-3 | `sendMedia` has no REST fallback — fails silently if WS down | Medium | Add REST POST fallback for media |
| GAP-4 | Canned response `usage_count` not incremented in WS handler | Medium | Call `increment_usage()` after canned send |
| GAP-5 | No scroll-to-bottom after new message if user scrolled up | Low | Add `isAtBottom` ref + conditional scroll |
