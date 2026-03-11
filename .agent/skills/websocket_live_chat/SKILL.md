---
name: websocket-live-chat
description: >
  Develops/modifies WebSocket real-time features for the Live Chat module in SKN App.
  Use when asked to "add WebSocket event", "modify real-time chat",
  "debug WebSocket", "create live chat notification",
  "เพิ่ม WebSocket event", "แก้ไข real-time", "debug websocket live chat".
compatibility: SKN App, WebSocket at /api/v1/ws/live-chat, Redis Pub/Sub
metadata:
  category: websocket
  tags: [websocket, redis, real-time, live-chat]
---

# WebSocket Live Chat Skill

Guidelines and standards for implementing real-time WebSocket communication in the SKN App using FastAPI and React/Zustand.

---

## CRITICAL: WebSocket Rules

1. **Room format:** always `conversation:{line_user_id}`
2. **Backend events:** add new events to the `elif` chain in `ws_live_chat.py`
3. **Frontend events:** subscribe in `useLiveChatSocket.ts`, dispatch to Zustand store
4. **Connections:** Clients must successfully authenticate using their JWT before joining rooms.

---

## Context7 Docs

Context7 MCP is active. Use before writing FastAPI WebSocket or SQLAlchemy async code.

| Library | Resolve Name | Key Topics |
|---|---|---|
| FastAPI | `"fastapi"` | websocket, WebSocket class, accept/send/receive |
| Starlette | `"starlette"` | WebSocketDisconnect, WebSocket state |
| SQLAlchemy | `"sqlalchemy"` | async session, AsyncSessionLocal pattern |

Usage: `mcp__context7__resolve-library-id libraryName="fastapi"` →
`mcp__context7__get-library-docs context7CompatibleLibraryID="..." topic="websocket" tokens=5000`

---

## Step 1: Adding a New Backend Event

File: `backend/app/api/v1/endpoints/ws_live_chat.py`

Look for the main `while True:` loop checking `event_type`.

```python
# In ws_live_chat.py — add to elif chain
elif event_type == "your_new_event":
    payload = data.get("payload", {})
    
    # Process logic (e.g. update db, construct response)
    result = {"status": "success", "event_id": payload.get("id")}
    
    # Send to the participant's room
    await manager.send_to_room(room_id, {
        "type": "your_response_event",
        "payload": result
    })
```

## Step 2: Adding a New Frontend Event

File: `frontend/hooks/useLiveChatSocket.ts`

```typescript
// Inside the useEffect where socket listeners are attached
socket.on('your_response_event', (data) => {
  useLiveChatStore.getState().handleYourEvent(data.payload)
})
```

## Step 3: Implement Frontend Store Updater

File: `frontend/_store/liveChatStore.ts`

```typescript
interface LiveChatState {
  // ... existing states
  handleYourEvent: (payload: any) => void
}

export const useLiveChatStore = create<LiveChatState>((set) => ({
  // ... existing values
  handleYourEvent: (payload) => set((state) => ({
    // Update state based on the payload safely
  })),
}))
```

---

## WebSocket Event Reference Map

**Client → Server:**
`auth`, `join_room`, `leave_room`, `send_message`, `typing_start`, `typing_stop`, `claim_session`, `close_session`, `ping`

**Server → Client:**
`auth_success`, `auth_error`, `new_message`, `message_sent`, `typing_indicator`, `session_claimed`, `session_closed`, `presence_update`, `conversation_update`, `operator_joined`, `operator_left`, `pong`, `error`

---

## Examples

### Example 1: Add a typing indicator event

**User says:** "เพิ่ม event สำหรับ typing indicator ใน websocket" (Add typing indicator event in websocket)

**Actions:**
1. Update `ws_live_chat.py` to listen for `typing_start` from client.
2. Broadcast `typing_indicator` event via `manager.send_to_room` to all other connections in that room.
3. Update `useLiveChatSocket.ts` on the frontend to listen for `typing_indicator`.
4. Add `isTyping` state toggle in `liveChatStore.ts`.

**Result:** A synchronized real-time typing indicator pipeline between admin and user.

---

## Common Issues

### BackgroundTask blocking Socket
**Cause:** Calling heavy async operations without `asyncio.create_task()` directly in the socket receive loop.
**Fix:** Keep the main event receiver loop fast. Dispatch off-thread or as background tasks if database queries are slow.

### `WebSocketDisconnect` handling
**Cause:** User closes browser tab without explicitly firing `leave_room`.
**Fix:** Ensure the `except WebSocketDisconnect:` block properly cleans up Redis room bindings in `websocket_manager.py`.

---

## Quality Checklist

Before finishing, verify:
- [ ] Backend events have corresponding frontend handlers
- [ ] Redis Pub/Sub correctly routes the message to the proper `conversation:{id}` channel
- [ ] Error handling prevents the socket from closing on a single bad message
