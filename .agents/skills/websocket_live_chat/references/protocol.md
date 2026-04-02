# WebSocket Message Protocol

Detailed specifications for all WebSocket message types used in the live chat system.

---

## Base Message Structure

```typescript
interface WSMessage {
  type: MessageType;
  payload: unknown;
  message_id?: string;   // UUID for ACK tracking
  timestamp: string;     // ISO 8601
}

type MessageType = 
  | 'auth' | 'join_room' | 'leave_room' | 'send_message' 
  | 'typing' | 'message_ack' | 'error' | 'ping' | 'pong'
  | 'new_message' | 'participant_joined' | 'participant_left';
```

---

## Client → Server Messages

### 1. Authentication

```typescript
interface AuthMessage {
  type: 'auth';
  payload: {
    token: string;  // JWT access token
  };
  message_id: string;
  timestamp: string;
}
```

**Example:**
```json
{
  "type": "auth",
  "payload": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  },
  "message_id": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2026-01-31T10:00:00Z"
}
```

---

### 2. Join Room

```typescript
interface JoinRoomMessage {
  type: 'join_room';
  payload: {
    conversation_id: string;
  };
  message_id: string;
  timestamp: string;
}
```

**Example:**
```json
{
  "type": "join_room",
  "payload": {
    "conversation_id": "conv-456"
  },
  "message_id": "550e8400-e29b-41d4-a716-446655440001",
  "timestamp": "2026-01-31T10:00:02Z"
}
```

---

### 3. Leave Room

```typescript
interface LeaveRoomMessage {
  type: 'leave_room';
  payload: {
    conversation_id: string;
  };
  message_id?: string;
  timestamp: string;
}
```

**Example:**
```json
{
  "type": "leave_room",
  "payload": {
    "conversation_id": "conv-456"
  },
  "timestamp": "2026-01-31T10:00:00Z"
}
```

---

### 4. Send Message

```typescript
interface SendMessagePayload {
  content: string;
  content_type?: 'text' | 'image' | 'file';
  reply_to?: string;  // message_id for threading
  conversation_id?: string;  // inferred from current room if not provided
}

interface SendMessage {
  type: 'send_message';
  payload: SendMessagePayload;
  message_id: string;
  timestamp: string;
}
```

**Examples:**

Text message:
```json
{
  "type": "send_message",
  "payload": {
    "content": "Hello, how can I help you?",
    "content_type": "text"
  },
  "message_id": "550e8400-e29b-41d4-a716-446655440002",
  "timestamp": "2026-01-31T10:00:10Z"
}
```

Reply to message:
```json
{
  "type": "send_message",
  "payload": {
    "content": "Thanks for the info!",
    "content_type": "text",
    "reply_to": "msg-123"
  },
  "message_id": "550e8400-e29b-41d4-a716-446655440003",
  "timestamp": "2026-01-31T10:00:15Z"
}
```

---

### 5. Typing Indicator

```typescript
interface TypingMessage {
  type: 'typing';
  payload: {
    conversation_id: string;
    is_typing: boolean;
  };
  timestamp: string;
}
```

**Examples:**
```json
// User started typing
{
  "type": "typing",
  "payload": {
    "conversation_id": "conv-456",
    "is_typing": true
  },
  "timestamp": "2026-01-31T10:00:20Z"
}

// User stopped typing
{
  "type": "typing",
  "payload": {
    "conversation_id": "conv-456",
    "is_typing": false
  },
  "timestamp": "2026-01-31T10:00:25Z"
}
```

---

### 6. Message Acknowledgment

```typescript
interface MessageAck {
  type: 'message_ack';
  payload: {
    message_id: string;
    status: 'received' | 'delivered' | 'read';
  };
  timestamp: string;
}
```

**Example:**
```json
{
  "type": "message_ack",
  "payload": {
    "message_id": "msg-789",
    "status": "read"
  },
  "timestamp": "2026-01-31T10:00:30Z"
}
```

---

### 7. Ping (Heartbeat)

```typescript
interface PingMessage {
  type: 'ping';
  timestamp: string;
}
```

**Example:**
```json
{
  "type": "ping",
  "timestamp": "2026-01-31T10:00:30Z"
}
```

---

## Server → Client Messages

### 1. Auth Response

```typescript
interface AuthResponse {
  type: 'auth';
  payload: {
    success: boolean;
    user_id: string;
    error?: string;
  };
  timestamp: string;
}
```

**Success Example:**
```json
{
  "type": "auth",
  "payload": {
    "success": true,
    "user_id": "u-123"
  },
  "timestamp": "2026-01-31T10:00:01Z"
}
```

**Error Example:**
```json
{
  "type": "auth",
  "payload": {
    "success": false,
    "user_id": null,
    "error": "INVALID_TOKEN"
  },
  "timestamp": "2026-01-31T10:00:01Z"
}
```

---

### 2. New Message Broadcast

```typescript
interface NewMessage {
  type: 'new_message';
  payload: {
    message_id: string;
    sender_id: string;
    sender_name?: string;
    content: string;
    content_type: 'text' | 'image' | 'file';
    conversation_id: string;
    reply_to?: string;
    created_at: string;  // ISO 8601
  };
  timestamp: string;
}
```

**Example:**
```json
{
  "type": "new_message",
  "payload": {
    "message_id": "msg-789",
    "sender_id": "agent-1",
    "sender_name": "Support Agent",
    "content": "Hi there! How can I help you today?",
    "content_type": "text",
    "conversation_id": "conv-456",
    "created_at": "2026-01-31T10:00:15Z"
  },
  "timestamp": "2026-01-31T10:00:15Z"
}
```

---

### 3. Message Acknowledgment (Server)

Server acknowledges receipt of client messages.

```typescript
interface ServerMessageAck {
  type: 'message_ack';
  payload: {
    message_id: string;
    status: 'received' | 'delivered';
    server_time: string;
  };
  timestamp: string;
}
```

**Example:**
```json
{
  "type": "message_ack",
  "payload": {
    "message_id": "550e8400-e29b-41d4-a716-446655440002",
    "status": "received",
    "server_time": "2026-01-31T10:00:10.123Z"
  },
  "timestamp": "2026-01-31T10:00:10Z"
}
```

---

### 4. Participant Joined

```typescript
interface ParticipantJoined {
  type: 'participant_joined';
  payload: {
    user_id: string;
    user_name?: string;
    conversation_id: string;
    joined_at: string;
  };
  timestamp: string;
}
```

**Example:**
```json
{
  "type": "participant_joined",
  "payload": {
    "user_id": "agent-1",
    "user_name": "Support Agent",
    "conversation_id": "conv-456",
    "joined_at": "2026-01-31T10:00:05Z"
  },
  "timestamp": "2026-01-31T10:00:05Z"
}
```

---

### 5. Participant Left

```typescript
interface ParticipantLeft {
  type: 'participant_left';
  payload: {
    user_id: string;
    conversation_id: string;
    left_at?: string;
  };
  timestamp: string;
}
```

**Example:**
```json
{
  "type": "participant_left",
  "payload": {
    "user_id": "agent-1",
    "conversation_id": "conv-456",
    "left_at": "2026-01-31T10:05:00Z"
  },
  "timestamp": "2026-01-31T10:05:00Z"
}
```

---

### 6. Error

```typescript
interface ErrorMessage {
  type: 'error';
  payload: {
    code: string;         // Error code (see error_codes.md)
    message: string;      // Human-readable description
    retryable: boolean;   // Can client retry?
    details?: unknown;    // Additional context
  };
  timestamp: string;
}
```

**Example:**
```json
{
  "type": "error",
  "payload": {
    "code": "NOT_IN_ROOM",
    "message": "You must join the room before sending messages",
    "retryable": true
  },
  "timestamp": "2026-01-31T10:00:12Z"
}
```

---

### 7. Pong (Heartbeat Response)

```typescript
interface PongMessage {
  type: 'pong';
  payload?: {
    server_time: string;
  };
  timestamp: string;
}
```

**Example:**
```json
{
  "type": "pong",
  "payload": {
    "server_time": "2026-01-31T10:00:30.456Z"
  },
  "timestamp": "2026-01-31T10:00:30Z"
}
```

---

## Message Flow Examples

### Complete Chat Session

```
CLIENT                                          SERVER
  |                                               |
  |─── CONNECT ──────────────────────────────────>|
  |<─── CONNECTION ACCEPTED ─────────────────────|
  |                                               |
  |─── auth {token} ─────────────────────────────>|
  |<─── auth {success: true, user_id} ───────────|
  |                                               |
  |─── join_room {conversation_id} ──────────────>|
  |<─── message_ack {received} ──────────────────|
  |<─── participant_joined {user_id} (broadcast) |
  |                                               |
  |─── send_message {content} ───────────────────>|
  |<─── message_ack {received} ──────────────────|
  |<─── new_message {message} (broadcast) ───────|
  |─── message_ack {read} ───────────────────────>|
  |                                               |
  |─── typing {is_typing: true} ─────────────────>|
  |<─── typing {user_id, is_typing} (broadcast) ─|
  |                                               |
  |<─── new_message {from: other_user} ──────────|
  |─── message_ack {read} ───────────────────────>|
  |                                               |
  |─── leave_room ───────────────────────────────>|
  |<─── participant_left (broadcast) ────────────|
  |─── DISCONNECT ───────────────────────────────>|
```

---

## Content Types

| Type | Description | Payload Example |
|------|-------------|-----------------|
| `text` | Plain text message | `"content": "Hello world"` |
| `image` | Image URL | `"content": "https://cdn.example.com/img.jpg"` |
| `file` | File attachment | `"content": "https://cdn.example.com/doc.pdf"` |

---

## Message Size Limits

| Field | Max Size |
|-------|----------|
| Total message | 64 KB |
| `content` (text) | 4000 characters |
| `content` (URL) | 2048 characters |
| `message_id` | 36 characters (UUID) |
