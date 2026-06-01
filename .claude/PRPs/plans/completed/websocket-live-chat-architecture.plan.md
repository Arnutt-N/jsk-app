# Feature: WebSocket Architecture for Live Chat

## Summary

Transform the live chat system from HTTP polling (5s conversations, 3s messages) to real-time WebSocket communication. This enables instant message delivery, typing indicators, presence awareness, and significantly reduces server load while improving user experience for operators handling multiple conversations.

## User Story

As an **admin/operator**
I want to **receive and send messages in real-time without page refreshes**
So that **I can respond faster to customers, see typing indicators, and handle multiple conversations efficiently**

## Problem Statement

The current polling-based architecture creates:
1. **3-5 second latency** - Messages appear delayed, hurting customer experience
2. **High server load** - Constant polling even when idle wastes resources
3. **No typing indicators** - Operators can't see when customers are typing
4. **No presence awareness** - Can't tell if operators are online/away
5. **Inefficient bandwidth** - Full data fetched even with no changes
6. **Poor multi-operator coordination** - No real-time updates when another operator claims a session

## Solution Statement

Implement a WebSocket-based real-time communication layer:
- **Connection Manager** with room-based architecture (per conversation)
- **Event-driven messaging** for instant delivery
- **Typing indicators** and **presence tracking**
- **Graceful fallback** to polling if WebSocket fails
- **JWT authentication** for secure connections
- Keep existing REST endpoints for non-real-time operations

## Metadata

| Field            | Value                                             |
| ---------------- | ------------------------------------------------- |
| Type             | ENHANCEMENT                                       |
| Complexity       | HIGH                                              |
| Systems Affected | backend/api, backend/services, frontend/live-chat |
| Dependencies     | FastAPI WebSocket, react-use-websocket (optional) |
| Estimated Tasks  | 12                                                |

---

## UX Design

### Before State
```
╔═══════════════════════════════════════════════════════════════════════════════╗
║                              CURRENT POLLING ARCHITECTURE                      ║
╠═══════════════════════════════════════════════════════════════════════════════╣
║                                                                               ║
║   ┌─────────────┐    every 5s    ┌─────────────┐         ┌─────────────┐     ║
║   │  Frontend   │ ─────────────► │  REST API   │ ──────► │  Database   │     ║
║   │  Live Chat  │ ◄───────────── │  /convos    │ ◄────── │  (Query)    │     ║
║   └─────────────┘  full data     └─────────────┘         └─────────────┘     ║
║         │                                                                     ║
║         │ every 3s (per selected chat)                                        ║
║         ▼                                                                     ║
║   ┌─────────────┐    GET         ┌─────────────┐         ┌─────────────┐     ║
║   │  Messages   │ ─────────────► │  /convos/id │ ──────► │  50 msgs    │     ║
║   │  Component  │ ◄───────────── │  (full)     │ ◄────── │  (always)   │     ║
║   └─────────────┘                └─────────────┘         └─────────────┘     ║
║                                                                               ║
║   PAIN_POINTS:                                                                ║
║   - 3-5 second latency on new messages                                        ║
║   - No typing indicators (operator blind)                                     ║
║   - Server processes ~720 requests/hour per idle operator                     ║
║   - Full data transfer even when nothing changed                              ║
║   - No presence awareness (who's online?)                                     ║
║   - Race conditions when multiple operators work                              ║
║                                                                               ║
╚═══════════════════════════════════════════════════════════════════════════════╝
```

### After State
```
╔═══════════════════════════════════════════════════════════════════════════════╗
║                              WEBSOCKET ARCHITECTURE                            ║
╠═══════════════════════════════════════════════════════════════════════════════╣
║                                                                               ║
║   ┌─────────────┐    WS connect   ┌─────────────────────────────────────┐     ║
║   │  Frontend   │ ═══════════════►│       WebSocket Manager             │     ║
║   │  Live Chat  │                 │  ┌─────────────────────────────┐   │     ║
║   └─────────────┘                 │  │ Connection Pool              │   │     ║
║         ║                         │  │  - operator_1 → [ws1, ws2]   │   │     ║
║         ║ bidirectional           │  │  - room_U123 → [ws1]         │   │     ║
║         ║ events                  │  └─────────────────────────────┘   │     ║
║         ║                         └─────────────────────────────────────┘     ║
║         ║                                       │                             ║
║         ▼                                       ▼                             ║
║   ┌─────────────────────────────────────────────────────────────────────┐     ║
║   │                         EVENT TYPES                                  │     ║
║   │                                                                      │     ║
║   │  CLIENT → SERVER:                SERVER → CLIENT:                    │     ║
║   │  ├─ join_room(line_user_id)     ├─ new_message(msg)                 │     ║
║   │  ├─ leave_room                   ├─ message_sent(msg)               │     ║
║   │  ├─ send_message(text)           ├─ typing(line_user_id, isTyping)  │     ║
║   │  ├─ typing(isTyping)             ├─ session_claimed(operator)       │     ║
║   │  ├─ claim_session                ├─ session_closed                   │     ║
║   │  └─ close_session                ├─ presence_update(operators[])    │     ║
║   │                                  └─ conversation_update(summary)     │     ║
║   └─────────────────────────────────────────────────────────────────────┘     ║
║                                                                               ║
║   VALUE_ADD:                                                                  ║
║   - Instant message delivery (<100ms)                                         ║
║   - Typing indicators for both user and operator                              ║
║   - ~95% reduction in API calls                                               ║
║   - Presence awareness (operators online/away/busy)                           ║
║   - Real-time session updates across operators                                ║
║   - Reconnection with message recovery                                        ║
║                                                                               ║
║   DATA_FLOW:                                                                  ║
║   LINE User → Webhook → DB → WS broadcast → All subscribed operators          ║
║   Operator → WS → Service → LINE API → User + DB → WS ack                     ║
║                                                                               ║
╚═══════════════════════════════════════════════════════════════════════════════╝
```

### Interaction Changes

| Location | Before | After | User Impact |
|----------|--------|-------|-------------|
| Message delivery | 3s polling delay | Instant (<100ms) | Faster response times |
| Conversation list | 5s polling | Real-time updates | See new chats immediately |
| Typing indicator | None | Live indicator | Know when user is typing |
| Session claim | Manual refresh | Instant broadcast | No conflicts between operators |
| Presence | Unknown | Live status | See which operators online |
| Connection loss | Silent failure | Reconnect + catch-up | Never miss messages |

---

## Mandatory Reading

**CRITICAL: Implementation agent MUST read these files before starting any task:**

| Priority | File | Lines | Why Read This |
|----------|------|-------|---------------|
| P0 | `backend/app/api/v1/endpoints/admin_live_chat.py` | 1-111 | Current REST endpoints to keep + patterns |
| P0 | `backend/app/services/live_chat_service.py` | 1-334 | Service layer to integrate with |
| P0 | `frontend/app/admin/live-chat/page.tsx` | 1-649 | Current polling implementation to replace |
| P1 | `backend/app/api/deps.py` | 1-10 | Dependency injection pattern |
| P1 | `backend/app/db/session.py` | 1-15 | AsyncSession pattern for WS |
| P1 | `backend/app/api/v1/endpoints/webhook.py` | 31-55 | BackgroundTasks pattern for broadcasts |
| P1 | `backend/app/models/message.py` | all | Message model for events |
| P2 | `backend/app/core/config.py` | all | Settings pattern |
| P2 | `frontend/components/admin/TypingIndicator.tsx` | all | Existing component to use |

**External Documentation:**

| Source | Section | Why Needed |
|--------|---------|------------|
| [FastAPI WebSocket Docs](https://fastapi.tiangolo.com/advanced/websockets/) | WebSocket endpoints | Official patterns |
| [FastAPI WebSocket Guide](https://betterstack.com/community/guides/scaling-python/fastapi-websockets/) | Connection Manager | Room-based architecture |
| [WebSocket Auth Medium](https://hexshift.medium.com/authenticating-websocket-clients-in-fastapi-with-jwt-and-dependency-injection-d636d48fdf48) | JWT + WebSocket | Query param auth pattern |
| [react-use-websocket npm](https://www.npmjs.com/package/react-use-websocket) | share, heartbeat | Client reconnection |

---

## Patterns to Mirror

**ASYNC_SESSION_PATTERN:**
```python
# SOURCE: backend/app/api/deps.py:4-6
# COPY THIS PATTERN for WebSocket DB access:
async def get_db() -> AsyncGenerator:
    async with AsyncSessionLocal() as session:
        yield session
```

**ROUTER_PATTERN:**
```python
# SOURCE: backend/app/api/v1/endpoints/admin_live_chat.py:12-20
# COPY THIS PATTERN for router setup:
router = APIRouter()

@router.get("/conversations", response_model=ConversationList)
async def list_conversations(
    status: Optional[str] = None,
    db: AsyncSession = Depends(deps.get_db)
) -> Any:
    """List all conversations for inbox"""
    return await live_chat_service.get_conversations(status, db)
```

**SERVICE_CALL_PATTERN:**
```python
# SOURCE: backend/app/services/live_chat_service.py:206-234
# COPY THIS PATTERN for sending messages through WebSocket:
async def send_message(self, line_user_id: str, text: str, operator_id: int, db: AsyncSession):
    """Send message from operator to user via LINE"""
    from linebot.v3.messaging import TextMessage

    operator_result = await db.execute(select(User).where(User.id == operator_id))
    operator = operator_result.scalar_one_or_none()
    operator_name = operator.display_name if operator else "Admin"

    await line_service.reply_messages_push(line_user_id, [TextMessage(text=text)])
    # ... save message and commit
```

**HTTP_EXCEPTION_PATTERN:**
```python
# SOURCE: backend/app/api/v1/endpoints/admin_live_chat.py:30,41,59
# Use this pattern for WebSocket error responses (send JSON, then close):
raise HTTPException(status_code=404, detail="User not found")
raise HTTPException(status_code=400, detail="Message text is required")
```

**FRONTEND_FETCH_PATTERN:**
```typescript
// SOURCE: frontend/app/admin/live-chat/page.tsx:67-82
// KEEP for fallback, replace interval with WebSocket:
const fetchConversations = async () => {
    try {
        const res = await fetch(`${API_BASE}/admin/live-chat/conversations${filterStatus ? `?status=${filterStatus}` : ''}`);
        if (res.ok) {
            const data = await res.json();
            setConversations(data.conversations || data || []);
            setBackendOnline(true);
        }
    } catch {
        setBackendOnline(false);
    }
};
```

**FRONTEND_STATE_PATTERN:**
```typescript
// SOURCE: frontend/app/admin/live-chat/page.tsx:47-58
// EXTEND this pattern with WebSocket state:
const [conversations, setConversations] = useState<Conversation[]>([]);
const [selectedId, setSelectedId] = useState<string | null>(null);
const [messages, setMessages] = useState<Message[]>([]);
const [backendOnline, setBackendOnline] = useState(true);
```

---

## Files to Change

| File | Action | Justification |
|------|--------|---------------|
| `backend/app/api/v1/endpoints/ws_live_chat.py` | CREATE | WebSocket endpoint and connection manager |
| `backend/app/services/ws_connection_manager.py` | CREATE | Connection pool and room management |
| `backend/app/schemas/ws_events.py` | CREATE | WebSocket event type definitions |
| `backend/app/api/v1/api.py` | UPDATE | Include WebSocket router |
| `backend/app/api/v1/endpoints/webhook.py` | UPDATE | Broadcast incoming LINE messages via WS |
| `backend/app/services/live_chat_service.py` | UPDATE | Integrate WS broadcasts on actions |
| `frontend/hooks/useWebSocket.ts` | CREATE | Custom WebSocket hook with reconnect |
| `frontend/hooks/useLiveChatSocket.ts` | CREATE | Live chat specific WebSocket logic |
| `frontend/app/admin/live-chat/page.tsx` | UPDATE | Replace polling with WebSocket |
| `frontend/components/admin/TypingIndicator.tsx` | UPDATE | Connect to WebSocket typing events |
| `backend/requirements.txt` | UPDATE | Add websockets dependency (if needed) |
| `frontend/package.json` | UPDATE | Add react-use-websocket (optional) |

---

## NOT Building (Scope Limits)

Explicit exclusions to prevent scope creep:

- **Redis Pub/Sub for horizontal scaling** - Single-server setup sufficient for now; add when scaling needed
- **Message persistence queue** - Messages already saved to DB; reconnect fetches from API
- **End-to-end encryption** - LINE handles user-side encryption; internal comms over HTTPS/WSS
- **Read receipts** - LINE doesn't support this; would add complexity without value
- **File/media transfer via WebSocket** - Keep using REST for uploads; WS only for events
- **Video/voice calls** - Out of scope; different infrastructure needed
- **WebSocket authentication system** - Use existing JWT; just verify on connect (mock operator_id=1 for now like REST)
- **Operator-to-operator chat** - Focus on operator-to-customer only
- **Mobile push notifications** - Different system; WebSocket is for active browser sessions

---

## Step-by-Step Tasks

Execute in order. Each task is atomic and independently verifiable.

### Task 1: CREATE `backend/app/schemas/ws_events.py`

- **ACTION**: CREATE WebSocket event type definitions
- **IMPLEMENT**:
  ```python
  from enum import Enum
  from pydantic import BaseModel
  from typing import Optional, Any, List
  from datetime import datetime

  class WSEventType(str, Enum):
      # Client → Server
      JOIN_ROOM = "join_room"
      LEAVE_ROOM = "leave_room"
      SEND_MESSAGE = "send_message"
      TYPING = "typing"
      CLAIM_SESSION = "claim_session"
      CLOSE_SESSION = "close_session"
      PING = "ping"

      # Server → Client
      NEW_MESSAGE = "new_message"
      MESSAGE_SENT = "message_sent"
      TYPING_INDICATOR = "typing_indicator"
      SESSION_CLAIMED = "session_claimed"
      SESSION_CLOSED = "session_closed"
      PRESENCE_UPDATE = "presence_update"
      CONVERSATION_UPDATE = "conversation_update"
      ERROR = "error"
      PONG = "pong"

  class WSEvent(BaseModel):
      type: WSEventType
      payload: Optional[Any] = None
      timestamp: datetime = None

      def __init__(self, **data):
          if 'timestamp' not in data or data['timestamp'] is None:
              data['timestamp'] = datetime.utcnow()
          super().__init__(**data)

  class MessagePayload(BaseModel):
      id: int
      line_user_id: str
      direction: str
      content: str
      message_type: str
      sender_role: Optional[str] = None
      operator_name: Optional[str] = None
      created_at: datetime

  class TypingPayload(BaseModel):
      line_user_id: str
      is_typing: bool
      operator_id: Optional[int] = None

  class SessionPayload(BaseModel):
      line_user_id: str
      session_id: int
      status: str
      operator_id: Optional[int] = None
      operator_name: Optional[str] = None

  class PresencePayload(BaseModel):
      operators: List[dict]  # [{id, name, status, active_chats}]

  class ConversationUpdatePayload(BaseModel):
      line_user_id: str
      display_name: str
      chat_mode: str
      session_status: Optional[str] = None
      last_message: Optional[dict] = None
      unread_count: int = 0
  ```
- **MIRROR**: `backend/app/schemas/live_chat.py` for Pydantic patterns
- **VALIDATE**: `cd backend && python -c "from app.schemas.ws_events import *; print('OK')"`

### Task 2: CREATE `backend/app/services/ws_connection_manager.py`

- **ACTION**: CREATE connection pool and room management
- **IMPLEMENT**:
  ```python
  from fastapi import WebSocket
  from typing import Dict, Set, Optional
  from datetime import datetime
  import json
  import logging

  logger = logging.getLogger(__name__)

  class ConnectionManager:
      """Manages WebSocket connections with room-based architecture"""

      def __init__(self):
          # operator_id → set of WebSocket connections
          self.operator_connections: Dict[int, Set[WebSocket]] = {}
          # room_id (line_user_id) → set of WebSocket connections
          self.room_connections: Dict[str, Set[WebSocket]] = {}
          # websocket → operator_id mapping for cleanup
          self.ws_to_operator: Dict[WebSocket, int] = {}
          # websocket → current room
          self.ws_to_room: Dict[WebSocket, Optional[str]] = {}
          # operator presence: operator_id → {status, last_seen, active_rooms}
          self.operator_presence: Dict[int, dict] = {}

      async def connect(self, websocket: WebSocket, operator_id: int):
          """Accept connection and register operator"""
          await websocket.accept()

          if operator_id not in self.operator_connections:
              self.operator_connections[operator_id] = set()
          self.operator_connections[operator_id].add(websocket)
          self.ws_to_operator[websocket] = operator_id
          self.ws_to_room[websocket] = None

          # Update presence
          self.operator_presence[operator_id] = {
              "status": "online",
              "last_seen": datetime.utcnow(),
              "active_rooms": set()
          }

          logger.info(f"Operator {operator_id} connected. Total connections: {len(self.operator_connections.get(operator_id, set()))}")

      async def disconnect(self, websocket: WebSocket):
          """Clean up connection on disconnect"""
          operator_id = self.ws_to_operator.get(websocket)
          current_room = self.ws_to_room.get(websocket)

          # Leave room if in one
          if current_room:
              await self.leave_room(websocket)

          # Remove from operator connections
          if operator_id and operator_id in self.operator_connections:
              self.operator_connections[operator_id].discard(websocket)
              if not self.operator_connections[operator_id]:
                  del self.operator_connections[operator_id]
                  # Mark offline if no connections left
                  if operator_id in self.operator_presence:
                      self.operator_presence[operator_id]["status"] = "offline"

          # Clean up mappings
          self.ws_to_operator.pop(websocket, None)
          self.ws_to_room.pop(websocket, None)

          logger.info(f"Operator {operator_id} disconnected")

      async def join_room(self, websocket: WebSocket, room_id: str):
          """Join a conversation room (line_user_id)"""
          operator_id = self.ws_to_operator.get(websocket)

          # Leave previous room if any
          current_room = self.ws_to_room.get(websocket)
          if current_room and current_room != room_id:
              await self.leave_room(websocket)

          # Join new room
          if room_id not in self.room_connections:
              self.room_connections[room_id] = set()
          self.room_connections[room_id].add(websocket)
          self.ws_to_room[websocket] = room_id

          # Update presence
          if operator_id and operator_id in self.operator_presence:
              self.operator_presence[operator_id]["active_rooms"].add(room_id)

          logger.info(f"Operator {operator_id} joined room {room_id}")

      async def leave_room(self, websocket: WebSocket):
          """Leave current room"""
          operator_id = self.ws_to_operator.get(websocket)
          room_id = self.ws_to_room.get(websocket)

          if room_id:
              if room_id in self.room_connections:
                  self.room_connections[room_id].discard(websocket)
                  if not self.room_connections[room_id]:
                      del self.room_connections[room_id]

              self.ws_to_room[websocket] = None

              # Update presence
              if operator_id and operator_id in self.operator_presence:
                  self.operator_presence[operator_id]["active_rooms"].discard(room_id)

              logger.info(f"Operator {operator_id} left room {room_id}")

      async def send_personal(self, websocket: WebSocket, data: dict):
          """Send message to specific connection"""
          try:
              await websocket.send_json(data)
          except Exception as e:
              logger.error(f"Error sending to websocket: {e}")

      async def broadcast_to_room(self, room_id: str, data: dict, exclude: Optional[WebSocket] = None):
          """Broadcast to all connections in a room"""
          if room_id not in self.room_connections:
              return

          disconnected = []
          for ws in self.room_connections[room_id]:
              if ws != exclude:
                  try:
                      await ws.send_json(data)
                  except Exception:
                      disconnected.append(ws)

          # Clean up disconnected
          for ws in disconnected:
              await self.disconnect(ws)

      async def broadcast_to_operator(self, operator_id: int, data: dict):
          """Broadcast to all connections of an operator"""
          if operator_id not in self.operator_connections:
              return

          disconnected = []
          for ws in self.operator_connections[operator_id]:
              try:
                  await ws.send_json(data)
              except Exception:
                  disconnected.append(ws)

          for ws in disconnected:
              await self.disconnect(ws)

      async def broadcast_to_all(self, data: dict, exclude: Optional[WebSocket] = None):
          """Broadcast to all connected operators"""
          for operator_id in list(self.operator_connections.keys()):
              for ws in list(self.operator_connections.get(operator_id, [])):
                  if ws != exclude:
                      try:
                          await ws.send_json(data)
                      except Exception:
                          await self.disconnect(ws)

      def get_room_operators(self, room_id: str) -> Set[int]:
          """Get operator IDs currently in a room"""
          operators = set()
          for ws in self.room_connections.get(room_id, []):
              op_id = self.ws_to_operator.get(ws)
              if op_id:
                  operators.add(op_id)
          return operators

      def get_online_operators(self) -> list:
          """Get list of online operators with their status"""
          result = []
          for op_id, presence in self.operator_presence.items():
              if presence["status"] == "online":
                  result.append({
                      "id": op_id,
                      "status": presence["status"],
                      "active_chats": len(presence["active_rooms"])
                  })
          return result


  # Singleton instance
  ws_manager = ConnectionManager()
  ```
- **MIRROR**: Singleton pattern from `backend/app/services/live_chat_service.py:333`
- **VALIDATE**: `cd backend && python -c "from app.services.ws_connection_manager import ws_manager; print('OK')"`

### Task 3: CREATE `backend/app/api/v1/endpoints/ws_live_chat.py`

- **ACTION**: CREATE WebSocket endpoint
- **IMPLEMENT**:
  ```python
  from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, Query
  from sqlalchemy.ext.asyncio import AsyncSession
  from typing import Optional
  import json
  import logging

  from app.db.session import AsyncSessionLocal
  from app.services.ws_connection_manager import ws_manager
  from app.services.live_chat_service import live_chat_service
  from app.schemas.ws_events import WSEventType, WSEvent
  from app.models.chat_session import ClosedBy

  logger = logging.getLogger(__name__)
  router = APIRouter()

  async def get_ws_db():
      """Get async session for WebSocket handlers"""
      async with AsyncSessionLocal() as session:
          yield session

  @router.websocket("/ws/live-chat")
  async def websocket_endpoint(
      websocket: WebSocket,
      token: Optional[str] = Query(None)  # JWT token for auth (future)
  ):
      """
      WebSocket endpoint for live chat real-time communication.

      Connect: ws://host/api/v1/ws/live-chat?token=<jwt>

      Events (Client → Server):
        - join_room: {"type": "join_room", "payload": {"line_user_id": "U123"}}
        - leave_room: {"type": "leave_room"}
        - send_message: {"type": "send_message", "payload": {"text": "Hello"}}
        - typing: {"type": "typing", "payload": {"is_typing": true}}
        - claim_session: {"type": "claim_session"}
        - close_session: {"type": "close_session"}
        - ping: {"type": "ping"}

      Events (Server → Client):
        - new_message, message_sent, typing_indicator, session_claimed,
          session_closed, presence_update, conversation_update, error, pong
      """
      # TODO: Implement JWT verification when auth is added
      # For now, mock operator_id = 1 like REST endpoints
      operator_id = 1

      await ws_manager.connect(websocket, operator_id)
      current_room: Optional[str] = None

      try:
          # Send initial presence update
          await ws_manager.send_personal(websocket, {
              "type": WSEventType.PRESENCE_UPDATE.value,
              "payload": {"operators": ws_manager.get_online_operators()}
          })

          while True:
              data = await websocket.receive_json()
              event_type = data.get("type")
              payload = data.get("payload", {})

              # Handle ping/pong for keepalive
              if event_type == WSEventType.PING.value:
                  await ws_manager.send_personal(websocket, {
                      "type": WSEventType.PONG.value
                  })
                  continue

              # Join room (select conversation)
              if event_type == WSEventType.JOIN_ROOM.value:
                  line_user_id = payload.get("line_user_id")
                  if line_user_id:
                      await ws_manager.join_room(websocket, line_user_id)
                      current_room = line_user_id

                      # Send current conversation state
                      async with AsyncSessionLocal() as db:
                          detail = await live_chat_service.get_conversation_detail(line_user_id, db)
                          if detail:
                              await ws_manager.send_personal(websocket, {
                                  "type": WSEventType.CONVERSATION_UPDATE.value,
                                  "payload": {
                                      "line_user_id": detail["line_user_id"],
                                      "display_name": detail["display_name"],
                                      "chat_mode": detail["chat_mode"],
                                      "session": detail["session"].__dict__ if detail["session"] else None,
                                      "messages": [
                                          {
                                              "id": m.id,
                                              "direction": m.direction.value if hasattr(m.direction, 'value') else m.direction,
                                              "content": m.content,
                                              "message_type": m.message_type,
                                              "sender_role": m.sender_role,
                                              "operator_name": m.operator_name,
                                              "created_at": m.created_at.isoformat()
                                          } for m in detail["messages"]
                                      ]
                                  }
                              })
                  continue

              # Leave room
              if event_type == WSEventType.LEAVE_ROOM.value:
                  await ws_manager.leave_room(websocket)
                  current_room = None
                  continue

              # Send message (requires being in a room)
              if event_type == WSEventType.SEND_MESSAGE.value:
                  if not current_room:
                      await ws_manager.send_personal(websocket, {
                          "type": WSEventType.ERROR.value,
                          "payload": {"message": "Not in a room"}
                      })
                      continue

                  text = payload.get("text", "").strip()
                  if not text:
                      await ws_manager.send_personal(websocket, {
                          "type": WSEventType.ERROR.value,
                          "payload": {"message": "Message text required"}
                      })
                      continue

                  async with AsyncSessionLocal() as db:
                      result = await live_chat_service.send_message(
                          current_room, text, operator_id, db
                      )

                      # Get the saved message for broadcast
                      messages = await live_chat_service.get_recent_messages(current_room, 1, db)
                      if messages:
                          msg = messages[0]
                          msg_data = {
                              "id": msg.id,
                              "line_user_id": current_room,
                              "direction": msg.direction.value if hasattr(msg.direction, 'value') else msg.direction,
                              "content": msg.content,
                              "message_type": msg.message_type,
                              "sender_role": msg.sender_role,
                              "operator_name": msg.operator_name,
                              "created_at": msg.created_at.isoformat()
                          }

                          # Confirm to sender
                          await ws_manager.send_personal(websocket, {
                              "type": WSEventType.MESSAGE_SENT.value,
                              "payload": msg_data
                          })

                          # Broadcast to others in room
                          await ws_manager.broadcast_to_room(current_room, {
                              "type": WSEventType.NEW_MESSAGE.value,
                              "payload": msg_data
                          }, exclude=websocket)
                  continue

              # Typing indicator
              if event_type == WSEventType.TYPING.value:
                  if current_room:
                      is_typing = payload.get("is_typing", False)
                      await ws_manager.broadcast_to_room(current_room, {
                          "type": WSEventType.TYPING_INDICATOR.value,
                          "payload": {
                              "line_user_id": current_room,
                              "is_typing": is_typing,
                              "operator_id": operator_id
                          }
                      }, exclude=websocket)
                  continue

              # Claim session
              if event_type == WSEventType.CLAIM_SESSION.value:
                  if current_room:
                      async with AsyncSessionLocal() as db:
                          session = await live_chat_service.claim_session(
                              current_room, operator_id, db
                          )
                          if session:
                              # Broadcast to all operators
                              await ws_manager.broadcast_to_all({
                                  "type": WSEventType.SESSION_CLAIMED.value,
                                  "payload": {
                                      "line_user_id": current_room,
                                      "session_id": session.id,
                                      "status": session.status.value,
                                      "operator_id": operator_id
                                  }
                              })
                  continue

              # Close session
              if event_type == WSEventType.CLOSE_SESSION.value:
                  if current_room:
                      async with AsyncSessionLocal() as db:
                          session = await live_chat_service.close_session(
                              current_room, ClosedBy.OPERATOR, db
                          )
                          if session:
                              await ws_manager.broadcast_to_all({
                                  "type": WSEventType.SESSION_CLOSED.value,
                                  "payload": {
                                      "line_user_id": current_room,
                                      "session_id": session.id
                                  }
                              })
                  continue

      except WebSocketDisconnect:
          logger.info(f"WebSocket disconnected for operator {operator_id}")
      except Exception as e:
          logger.error(f"WebSocket error: {e}")
      finally:
          await ws_manager.disconnect(websocket)
  ```
- **MIRROR**: `backend/app/api/v1/endpoints/admin_live_chat.py` for service calls
- **IMPORTS**: FastAPI WebSocket, AsyncSessionLocal, services
- **VALIDATE**: `cd backend && python -c "from app.api.v1.endpoints.ws_live_chat import router; print('OK')"`

### Task 4: UPDATE `backend/app/api/v1/api.py`

- **ACTION**: ADD WebSocket router to API
- **IMPLEMENT**: Add import and include_router for WebSocket endpoint
- **CHANGES**:
  ```python
  # Add import
  from app.api.v1.endpoints import ws_live_chat

  # Add router (after other includes)
  api_router.include_router(ws_live_chat.router, tags=["websocket"])
  ```
- **VALIDATE**: `cd backend && python -c "from app.api.v1.api import api_router; print('OK')"`

### Task 5: UPDATE `backend/app/api/v1/endpoints/webhook.py`

- **ACTION**: ADD WebSocket broadcast when LINE messages arrive
- **IMPLEMENT**: After saving incoming message, broadcast via ws_manager
- **CHANGES**: In `handle_message_event` function, after message is saved:
  ```python
  # Import at top
  from app.services.ws_connection_manager import ws_manager
  from app.schemas.ws_events import WSEventType

  # After saving message to DB, broadcast to room
  await ws_manager.broadcast_to_room(user.line_user_id, {
      "type": WSEventType.NEW_MESSAGE.value,
      "payload": {
          "id": saved_message.id,
          "line_user_id": user.line_user_id,
          "direction": "INCOMING",
          "content": message_content,
          "message_type": message_type,
          "sender_role": "USER",
          "created_at": saved_message.created_at.isoformat()
      }
  })
  ```
- **VALIDATE**: `cd backend && python -c "from app.api.v1.endpoints.webhook import router; print('OK')"`

### Task 6: CREATE `frontend/hooks/useWebSocket.ts`

- **ACTION**: CREATE custom WebSocket hook with reconnection
- **IMPLEMENT**:
  ```typescript
  import { useEffect, useRef, useState, useCallback } from 'react';

  export type WebSocketStatus = 'connecting' | 'connected' | 'disconnected' | 'reconnecting';

  interface UseWebSocketOptions {
      url: string;
      onMessage?: (data: any) => void;
      onOpen?: () => void;
      onClose?: () => void;
      onError?: (error: Event) => void;
      reconnect?: boolean;
      reconnectAttempts?: number;
      reconnectInterval?: number;
      heartbeatInterval?: number;
  }

  interface UseWebSocketReturn {
      status: WebSocketStatus;
      send: (data: any) => void;
      lastMessage: any | null;
      reconnect: () => void;
  }

  export function useWebSocket({
      url,
      onMessage,
      onOpen,
      onClose,
      onError,
      reconnect = true,
      reconnectAttempts = 5,
      reconnectInterval = 3000,
      heartbeatInterval = 25000,
  }: UseWebSocketOptions): UseWebSocketReturn {
      const wsRef = useRef<WebSocket | null>(null);
      const reconnectCount = useRef(0);
      const reconnectTimer = useRef<NodeJS.Timeout | null>(null);
      const heartbeatTimer = useRef<NodeJS.Timeout | null>(null);

      const [status, setStatus] = useState<WebSocketStatus>('disconnected');
      const [lastMessage, setLastMessage] = useState<any | null>(null);

      const clearTimers = useCallback(() => {
          if (reconnectTimer.current) {
              clearTimeout(reconnectTimer.current);
              reconnectTimer.current = null;
          }
          if (heartbeatTimer.current) {
              clearInterval(heartbeatTimer.current);
              heartbeatTimer.current = null;
          }
      }, []);

      const startHeartbeat = useCallback(() => {
          if (heartbeatTimer.current) clearInterval(heartbeatTimer.current);
          heartbeatTimer.current = setInterval(() => {
              if (wsRef.current?.readyState === WebSocket.OPEN) {
                  wsRef.current.send(JSON.stringify({ type: 'ping' }));
              }
          }, heartbeatInterval);
      }, [heartbeatInterval]);

      const connect = useCallback(() => {
          if (wsRef.current?.readyState === WebSocket.OPEN) return;

          clearTimers();
          setStatus('connecting');

          try {
              wsRef.current = new WebSocket(url);

              wsRef.current.onopen = () => {
                  setStatus('connected');
                  reconnectCount.current = 0;
                  startHeartbeat();
                  onOpen?.();
              };

              wsRef.current.onmessage = (event) => {
                  try {
                      const data = JSON.parse(event.data);
                      if (data.type === 'pong') return; // Ignore heartbeat response
                      setLastMessage(data);
                      onMessage?.(data);
                  } catch (e) {
                      console.error('Failed to parse WebSocket message:', e);
                  }
              };

              wsRef.current.onclose = () => {
                  setStatus('disconnected');
                  clearTimers();
                  onClose?.();

                  // Attempt reconnect
                  if (reconnect && reconnectCount.current < reconnectAttempts) {
                      setStatus('reconnecting');
                      reconnectCount.current++;
                      reconnectTimer.current = setTimeout(connect, reconnectInterval);
                  }
              };

              wsRef.current.onerror = (error) => {
                  onError?.(error);
              };
          } catch (error) {
              console.error('WebSocket connection error:', error);
              setStatus('disconnected');
          }
      }, [url, onMessage, onOpen, onClose, onError, reconnect, reconnectAttempts, reconnectInterval, clearTimers, startHeartbeat]);

      const send = useCallback((data: any) => {
          if (wsRef.current?.readyState === WebSocket.OPEN) {
              wsRef.current.send(JSON.stringify(data));
          } else {
              console.warn('WebSocket not connected, cannot send:', data);
          }
      }, []);

      const manualReconnect = useCallback(() => {
          reconnectCount.current = 0;
          if (wsRef.current) {
              wsRef.current.close();
          }
          connect();
      }, [connect]);

      useEffect(() => {
          connect();

          return () => {
              clearTimers();
              if (wsRef.current) {
                  wsRef.current.close();
                  wsRef.current = null;
              }
          };
      }, [connect, clearTimers]);

      return {
          status,
          send,
          lastMessage,
          reconnect: manualReconnect,
      };
  }
  ```
- **MIRROR**: React hook patterns from `frontend/hooks/useTheme.ts`
- **VALIDATE**: `cd frontend && npx tsc --noEmit hooks/useWebSocket.ts`

### Task 7: CREATE `frontend/hooks/useLiveChatSocket.ts`

- **ACTION**: CREATE live chat specific WebSocket logic
- **IMPLEMENT**:
  ```typescript
  import { useCallback, useEffect, useRef } from 'react';
  import { useWebSocket, WebSocketStatus } from './useWebSocket';

  export interface Message {
      id: number;
      direction: 'INCOMING' | 'OUTGOING';
      content: string;
      created_at: string;
      message_type: string;
      sender_role?: 'USER' | 'BOT' | 'ADMIN';
      operator_name?: string;
  }

  interface Session {
      id: number;
      status: 'WAITING' | 'ACTIVE' | 'CLOSED';
      operator_id?: number;
  }

  interface UseLiveChatSocketOptions {
      onNewMessage?: (message: Message) => void;
      onMessageSent?: (message: Message) => void;
      onTyping?: (lineUserId: string, isTyping: boolean, operatorId?: number) => void;
      onSessionClaimed?: (lineUserId: string, operatorId: number) => void;
      onSessionClosed?: (lineUserId: string) => void;
      onConversationUpdate?: (data: any) => void;
      onPresenceUpdate?: (operators: any[]) => void;
      onError?: (error: string) => void;
      onConnectionChange?: (status: WebSocketStatus) => void;
  }

  interface UseLiveChatSocketReturn {
      status: WebSocketStatus;
      joinRoom: (lineUserId: string) => void;
      leaveRoom: () => void;
      sendMessage: (text: string) => void;
      setTyping: (isTyping: boolean) => void;
      claimSession: () => void;
      closeSession: () => void;
      reconnect: () => void;
  }

  export function useLiveChatSocket(options: UseLiveChatSocketOptions = {}): UseLiveChatSocketReturn {
      const currentRoom = useRef<string | null>(null);
      const typingTimeout = useRef<NodeJS.Timeout | null>(null);

      // Determine WebSocket URL based on environment
      const wsUrl = typeof window !== 'undefined'
          ? `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/api/v1/ws/live-chat`
          : '';

      const handleMessage = useCallback((data: any) => {
          switch (data.type) {
              case 'new_message':
                  options.onNewMessage?.(data.payload);
                  break;
              case 'message_sent':
                  options.onMessageSent?.(data.payload);
                  break;
              case 'typing_indicator':
                  options.onTyping?.(
                      data.payload.line_user_id,
                      data.payload.is_typing,
                      data.payload.operator_id
                  );
                  break;
              case 'session_claimed':
                  options.onSessionClaimed?.(
                      data.payload.line_user_id,
                      data.payload.operator_id
                  );
                  break;
              case 'session_closed':
                  options.onSessionClosed?.(data.payload.line_user_id);
                  break;
              case 'conversation_update':
                  options.onConversationUpdate?.(data.payload);
                  break;
              case 'presence_update':
                  options.onPresenceUpdate?.(data.payload.operators);
                  break;
              case 'error':
                  options.onError?.(data.payload.message);
                  break;
          }
      }, [options]);

      const { status, send, reconnect } = useWebSocket({
          url: wsUrl,
          onMessage: handleMessage,
          onOpen: () => options.onConnectionChange?.('connected'),
          onClose: () => options.onConnectionChange?.('disconnected'),
      });

      // Notify parent of status changes
      useEffect(() => {
          options.onConnectionChange?.(status);
      }, [status, options]);

      const joinRoom = useCallback((lineUserId: string) => {
          currentRoom.current = lineUserId;
          send({ type: 'join_room', payload: { line_user_id: lineUserId } });
      }, [send]);

      const leaveRoom = useCallback(() => {
          currentRoom.current = null;
          send({ type: 'leave_room' });
      }, [send]);

      const sendMessage = useCallback((text: string) => {
          if (!currentRoom.current) {
              console.warn('Cannot send message: not in a room');
              return;
          }
          send({ type: 'send_message', payload: { text } });
      }, [send]);

      const setTyping = useCallback((isTyping: boolean) => {
          send({ type: 'typing', payload: { is_typing: isTyping } });

          // Auto-clear typing after 3 seconds
          if (typingTimeout.current) {
              clearTimeout(typingTimeout.current);
          }
          if (isTyping) {
              typingTimeout.current = setTimeout(() => {
                  send({ type: 'typing', payload: { is_typing: false } });
              }, 3000);
          }
      }, [send]);

      const claimSession = useCallback(() => {
          send({ type: 'claim_session' });
      }, [send]);

      const closeSession = useCallback(() => {
          send({ type: 'close_session' });
      }, [send]);

      // Cleanup typing timeout on unmount
      useEffect(() => {
          return () => {
              if (typingTimeout.current) {
                  clearTimeout(typingTimeout.current);
              }
          };
      }, []);

      return {
          status,
          joinRoom,
          leaveRoom,
          sendMessage,
          setTyping,
          claimSession,
          closeSession,
          reconnect,
      };
  }
  ```
- **VALIDATE**: `cd frontend && npx tsc --noEmit hooks/useLiveChatSocket.ts`

### Task 8: UPDATE `frontend/app/admin/live-chat/page.tsx`

- **ACTION**: REPLACE polling with WebSocket, keep REST fallback
- **IMPLEMENT**: Major changes to integrate WebSocket hook
- **CHANGES**:
  1. Import the new hook:
     ```typescript
     import { useLiveChatSocket, Message } from '@/hooks/useLiveChatSocket';
     ```

  2. Add new state for typing and WebSocket status:
     ```typescript
     const [userTyping, setUserTyping] = useState(false);
     const [wsStatus, setWsStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'reconnecting'>('disconnected');
     ```

  3. Initialize WebSocket hook:
     ```typescript
     const {
         status: socketStatus,
         joinRoom,
         leaveRoom,
         sendMessage: wsSendMessage,
         setTyping,
         claimSession: wsClaimSession,
         closeSession: wsCloseSession,
         reconnect,
     } = useLiveChatSocket({
         onNewMessage: (msg) => {
             setMessages(prev => [...prev, msg]);
             // Update conversation list
             fetchConversations();
         },
         onMessageSent: (msg) => {
             setMessages(prev => [...prev, msg]);
             setInputText('');
             setSending(false);
         },
         onTyping: (lineUserId, isTyping) => {
             if (lineUserId === selectedId) {
                 setUserTyping(isTyping);
             }
         },
         onSessionClaimed: () => {
             fetchChatDetail(selectedId!);
             fetchConversations();
         },
         onSessionClosed: () => {
             fetchChatDetail(selectedId!);
             fetchConversations();
         },
         onConversationUpdate: (data) => {
             setCurrentChat(data);
             setMessages(data.messages || []);
         },
         onConnectionChange: (status) => {
             setWsStatus(status);
             setBackendOnline(status === 'connected' || status === 'connecting');
         },
         onError: (error) => {
             console.error('WebSocket error:', error);
         },
     });
     ```

  4. Update useEffect for room joining (replace message polling):
     ```typescript
     useEffect(() => {
         if (!selectedId) return;

         // Join WebSocket room
         if (socketStatus === 'connected') {
             joinRoom(selectedId);
         }

         // Initial fetch (fallback if WS not connected)
         fetchChatDetail(selectedId);

         return () => {
             leaveRoom();
             setUserTyping(false);
         };
     }, [selectedId, socketStatus]);
     ```

  5. Remove the 3-second message polling interval (lines 104-109)

  6. Keep 5-second conversation polling as fallback but reduce frequency when WS connected:
     ```typescript
     useEffect(() => {
         fetchConversations();
         // Longer interval when WebSocket is connected
         const interval = setInterval(fetchConversations, socketStatus === 'connected' ? 30000 : 5000);
         return () => clearInterval(interval);
     }, [filterStatus, socketStatus]);
     ```

  7. Update handleSendMessage to use WebSocket:
     ```typescript
     const handleSendMessage = async (e: React.FormEvent) => {
         e.preventDefault();
         if (!inputText.trim() || !selectedId || sending) return;
         setSending(true);

         if (socketStatus === 'connected') {
             wsSendMessage(inputText);
             // Typing stops when message sent
             setTyping(false);
         } else {
             // Fallback to REST
             try {
                 const res = await fetch(`${API_BASE}/admin/live-chat/conversations/${selectedId}/messages`, {
                     method: 'POST',
                     headers: { 'Content-Type': 'application/json' },
                     body: JSON.stringify({ text: inputText })
                 });
                 if (res.ok) {
                     setInputText('');
                     fetchChatDetail(selectedId);
                 }
             } catch { }
             setSending(false);
         }
     };
     ```

  8. Add typing indicator trigger on input change:
     ```typescript
     const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
         setInputText(e.target.value);
         if (socketStatus === 'connected' && e.target.value.trim()) {
             setTyping(true);
         }
     };
     ```

  9. Update claim/close handlers:
     ```typescript
     const handleClaim = async () => {
         if (!selectedId) return;
         if (socketStatus === 'connected') {
             wsClaimSession();
         } else {
             // Fallback
             await fetch(`${API_BASE}/admin/live-chat/conversations/${selectedId}/claim`, { method: 'POST' });
             fetchChatDetail(selectedId);
         }
     };

     const handleClose = async () => {
         if (!selectedId) return;
         if (socketStatus === 'connected') {
             wsCloseSession();
         } else {
             await fetch(`${API_BASE}/admin/live-chat/conversations/${selectedId}/close`, { method: 'POST' });
             fetchChatDetail(selectedId);
         }
     };
     ```

  10. Add typing indicator display above messages:
      ```typescript
      {userTyping && (
          <div className="flex items-center gap-2 px-4 py-2">
              <img src={currentChat?.picture_url} className="w-6 h-6 rounded-full" alt="" />
              <div className="flex gap-1">
                  <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
              <span className="text-xs text-slate-500">typing...</span>
          </div>
      )}
      ```

  11. Update connection status indicator:
      ```typescript
      <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium ${
          wsStatus === 'connected' ? 'bg-emerald-50 text-emerald-600' :
          wsStatus === 'connecting' || wsStatus === 'reconnecting' ? 'bg-yellow-50 text-yellow-600' :
          'bg-red-50 text-red-500'
      }`}>
          <div className={`w-2 h-2 rounded-full ${
              wsStatus === 'connected' ? 'bg-emerald-500' :
              wsStatus === 'connecting' || wsStatus === 'reconnecting' ? 'bg-yellow-500 animate-pulse' :
              'bg-red-500'
          }`} />
          {wsStatus === 'connected' ? 'Live' : wsStatus === 'reconnecting' ? 'Reconnecting...' : 'Offline'}
      </div>
      ```

- **GOTCHA**: Keep REST fetch functions for initial load and fallback
- **VALIDATE**: `cd frontend && npm run lint && npm run build`

### Task 9: UPDATE `frontend/components/admin/TypingIndicator.tsx`

- **ACTION**: ENHANCE to support WebSocket events
- **IMPLEMENT**: The component already exists, verify it works with WebSocket state
- **CHANGES**: Ensure component accepts `isTyping` prop and displays correctly
- **VALIDATE**: `cd frontend && npx tsc --noEmit components/admin/TypingIndicator.tsx`

### Task 10: UPDATE `backend/app/main.py` (if needed)

- **ACTION**: VERIFY WebSocket support in CORS
- **IMPLEMENT**: WebSocket doesn't use CORS headers but ensure no blocking middleware
- **VALIDATE**: Start server and test WebSocket connection

### Task 11: CREATE Integration Test

- **ACTION**: CREATE test script for WebSocket functionality
- **IMPLEMENT**: `backend/tests/test_websocket.py`
  ```python
  import pytest
  import asyncio
  from fastapi.testclient import TestClient
  from fastapi.websockets import WebSocket
  import json

  from app.main import app

  def test_websocket_connect():
      client = TestClient(app)
      with client.websocket_connect("/api/v1/ws/live-chat") as websocket:
          # Should receive presence update on connect
          data = websocket.receive_json()
          assert data["type"] == "presence_update"

          # Test ping/pong
          websocket.send_json({"type": "ping"})
          pong = websocket.receive_json()
          assert pong["type"] == "pong"

  def test_websocket_join_room():
      client = TestClient(app)
      with client.websocket_connect("/api/v1/ws/live-chat") as websocket:
          # Skip presence update
          websocket.receive_json()

          # Join non-existent room (should not error)
          websocket.send_json({
              "type": "join_room",
              "payload": {"line_user_id": "U_TEST_123"}
          })

          # May receive conversation_update or nothing
          # Just verify no disconnect
  ```
- **VALIDATE**: `cd backend && python -m pytest tests/test_websocket.py -v`

### Task 12: UPDATE Documentation

- **ACTION**: UPDATE CLAUDE.md with WebSocket architecture
- **IMPLEMENT**: Add WebSocket section to CLAUDE.md
  ```markdown
  ### WebSocket Live Chat

  Real-time communication via WebSocket at `/api/v1/ws/live-chat`.

  **Connect**: `ws://host/api/v1/ws/live-chat?token=<jwt>`

  **Events (Client → Server)**:
  - `join_room`: Select conversation `{"type": "join_room", "payload": {"line_user_id": "U..."}}`
  - `leave_room`: Deselect conversation
  - `send_message`: Send to LINE user `{"type": "send_message", "payload": {"text": "..."}}`
  - `typing`: Typing indicator `{"type": "typing", "payload": {"is_typing": true}}`
  - `claim_session`: Operator claims waiting session
  - `close_session`: End session, return user to bot
  - `ping`: Keepalive

  **Events (Server → Client)**:
  - `new_message`: Incoming LINE message
  - `message_sent`: Confirmation of sent message
  - `typing_indicator`: User/operator typing
  - `session_claimed`: Session claimed by operator
  - `session_closed`: Session ended
  - `presence_update`: Online operators list
  - `conversation_update`: Full conversation state
  - `error`: Error message
  - `pong`: Keepalive response
  ```
- **VALIDATE**: Review CLAUDE.md is accurate

---

## Testing Strategy

### Unit Tests to Write

| Test File | Test Cases | Validates |
|-----------|------------|-----------|
| `backend/tests/test_ws_events.py` | Event serialization, enum values | Schema definitions |
| `backend/tests/test_connection_manager.py` | Connect, disconnect, rooms, broadcast | Connection Manager |
| `backend/tests/test_websocket.py` | Full WebSocket lifecycle | Integration |
| `frontend/__tests__/hooks/useWebSocket.test.ts` | Connect, reconnect, heartbeat | WebSocket hook |

### Edge Cases Checklist

- [ ] WebSocket connection fails → Falls back to polling
- [ ] WebSocket disconnects mid-conversation → Reconnects and rejoins room
- [ ] Multiple browser tabs → Each gets own connection, same operator
- [ ] Operator sends message while disconnected → Error shown, retry available
- [ ] Two operators claim same session simultaneously → Server handles race condition
- [ ] LINE message arrives when no operators in room → Stored in DB, available on join
- [ ] Very long message → Properly chunked or rejected with error
- [ ] Rapid message sending → Rate limiting (future enhancement)
- [ ] Browser tab goes to background → Heartbeat continues or reconnects on focus

---

## Validation Commands

### Level 1: STATIC_ANALYSIS

```bash
cd backend && python -c "from app.api.v1.endpoints.ws_live_chat import router; from app.services.ws_connection_manager import ws_manager; from app.schemas.ws_events import WSEventType; print('Backend imports OK')"
cd frontend && npm run lint && npx tsc --noEmit
```

**EXPECT**: Exit 0, no errors

### Level 2: UNIT_TESTS

```bash
cd backend && python -m pytest tests/test_websocket.py -v
cd frontend && npm test -- --testPathPattern="useWebSocket"
```

**EXPECT**: All tests pass

### Level 3: FULL_SUITE

```bash
cd backend && python -m pytest
cd frontend && npm run build
```

**EXPECT**: All tests pass, build succeeds

### Level 4: MANUAL_VALIDATION

1. Start backend: `cd backend && uvicorn app.main:app --reload`
2. Start frontend: `cd frontend && npm run dev`
3. Open browser console, verify WebSocket connects: `ws://localhost:3000/api/v1/ws/live-chat`
4. Select conversation → See messages load via WebSocket
5. Send message → See instant delivery (no 3s delay)
6. Open second browser tab → Both receive real-time updates
7. Disconnect network briefly → See reconnection attempt
8. Send LINE message (via test) → See instant appearance in UI

---

## Acceptance Criteria

- [ ] WebSocket endpoint `/api/v1/ws/live-chat` accepts connections
- [ ] Messages delivered in <500ms (compared to 3s polling)
- [ ] Typing indicators show when user/operator types
- [ ] Session claim/close broadcasts to all connected operators
- [ ] Reconnection works within 15 seconds of disconnect
- [ ] Fallback to REST polling works when WebSocket unavailable
- [ ] No increase in initial page load time
- [ ] Existing REST endpoints continue working unchanged

---

## Completion Checklist

- [ ] All tasks completed in dependency order
- [ ] Each task validated immediately after completion
- [ ] Level 1: Static analysis passes
- [ ] Level 2: Unit tests pass
- [ ] Level 3: Full test suite + build succeeds
- [ ] Level 4: Manual WebSocket testing passes
- [ ] All acceptance criteria met

---

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| WebSocket blocked by proxy/firewall | MEDIUM | HIGH | Keep REST polling as fallback; detect and auto-switch |
| Memory leak from unclosed connections | LOW | MEDIUM | Proper cleanup in disconnect handler; connection timeout |
| Race condition on session claim | LOW | MEDIUM | Server-side locking or optimistic concurrency |
| High connection count under load | LOW | HIGH | Future: Add Redis pub/sub for horizontal scaling |
| Browser compatibility | LOW | LOW | Native WebSocket API supported in all modern browsers |

---

## Notes

### Architecture Decisions

1. **Room-based vs Global broadcast**: Chose room-based to limit message scope and improve performance. Each conversation is a "room".

2. **Keep REST endpoints**: WebSocket is an enhancement, not replacement. REST provides fallback and is better for initial data load.

3. **Mock authentication**: Following existing pattern of `operator_id=1`. Real JWT auth should be added separately.

4. **No Redis for MVP**: Single-server setup is sufficient. Redis pub/sub can be added later for horizontal scaling.

5. **Heartbeat interval (25s)**: Chosen to stay under typical 30s proxy timeouts while minimizing traffic.

### Future Enhancements (Out of Scope)

- JWT authentication for WebSocket
- Redis pub/sub for multi-server deployment
- Read receipts
- Message reactions
- File upload progress via WebSocket
- Operator-to-operator chat
- Push notifications when tab inactive

### Sources

- [FastAPI WebSocket Docs](https://fastapi.tiangolo.com/advanced/websockets/)
- [Better Stack - FastAPI WebSockets Guide](https://betterstack.com/community/guides/scaling-python/fastapi-websockets/)
- [WebSocket Auth with JWT](https://hexshift.medium.com/authenticating-websocket-clients-in-fastapi-with-jwt-and-dependency-injection-d636d48fdf48)
- [react-use-websocket npm](https://www.npmjs.com/package/react-use-websocket)
- [Ably - WebSockets React Tutorial](https://ably.com/blog/websockets-react-tutorial)
