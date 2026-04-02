# WebSocket Error Codes Reference

Complete reference for WebSocket close codes and application error codes.

---

## WebSocket Close Codes

Standard WebSocket close codes used by the server.

| Code | Name | Description | Client Action |
|------|------|-------------|---------------|
| `1000` | Normal Closure | Clean, intentional close | No action needed |
| `1001` | Going Away | Server shutting down or navigating away | Reconnect optional |
| `1006` | Abnormal Closure | Connection dropped unexpectedly | Retry with backoff |
| `1008` | Policy Violation | Protocol violation (e.g., invalid message format) | Check implementation |
| `1011` | Server Error | Unexpected server error | Retry with backoff |
| `1012` | Service Restart | Server is restarting | Reconnect after delay |
| `1013` | Try Again Later | Server temporarily unavailable | Retry with backoff |

---

## Application Error Codes (4000-4999)

Custom error codes for application-level errors.

| Code | Name | Description | Retryable |
|------|------|-------------|-----------|
| `4001` | `AUTH_REQUIRED` | No auth message received within timeout | No (redirect to login) |
| `4002` | `INVALID_TOKEN` | JWT validation failed (expired, malformed) | No (refresh token) |
| `4003` | `UNAUTHORIZED` | User not authorized for this resource | No |
| `4004` | `CONVERSATION_NOT_FOUND` | Conversation ID does not exist | No |
| `4005` | `NOT_IN_ROOM` | Message sent before joining room | Yes (auto-join) |
| `4008` | `RATE_LIMITED` | Too many messages (limit: 30/min) | Yes (wait 1s) |
| `4009` | `MESSAGE_TOO_LARGE` | Message exceeds size limit (64KB) | No (split message) |
| `4010` | `INVALID_MESSAGE_FORMAT` | JSON parsing failed or schema invalid | No (fix payload) |
| `4011` | `MISSING_REQUIRED_FIELD` | Required field missing in payload | No (fix payload) |
| `4020` | `ALREADY_IN_ROOM` | Join request when already in room | No (ignore) |
| `4021` | `ROOM_FULL` | Room has reached participant limit | No |
| `4030` | `USER_BANNED` | User is banned from this conversation | No |
| `4100` | `SERVER_ERROR` | Internal server error | Yes (reconnect) |
| `4101` | `DATABASE_ERROR` | Database operation failed | Yes (reconnect) |
| `4102` | `REDIS_ERROR` | Redis connection issue | Yes (reconnect) |

---

## Error Message Format

```typescript
interface ErrorPayload {
  code: string;        // Error code from tables above
  message: string;     // Human-readable description
  retryable: boolean;  // Whether client should retry
  details?: unknown;   // Additional context (optional)
}

interface ErrorMessage {
  type: 'error';
  payload: ErrorPayload;
  timestamp: string;
}
```

**Example Error Messages:**

```json
// Authentication error (non-retryable)
{
  "type": "error",
  "payload": {
    "code": "INVALID_TOKEN",
    "message": "Authentication failed: token expired",
    "retryable": false
  },
  "timestamp": "2026-01-31T10:00:00Z"
}

// Rate limit error (retryable)
{
  "type": "error",
  "payload": {
    "code": "RATE_LIMITED",
    "message": "Too many messages. Please slow down.",
    "retryable": true,
    "details": {
      "retry_after_ms": 1000,
      "limit": 30,
      "window": "1m"
    }
  },
  "timestamp": "2026-01-31T10:00:00Z"
}

// Validation error (non-retryable)
{
  "type": "error",
  "payload": {
    "code": "MISSING_REQUIRED_FIELD",
    "message": "Missing required field: conversation_id",
    "retryable": false,
    "details": {
      "field": "conversation_id"
    }
  },
  "timestamp": "2026-01-31T10:00:00Z"
}
```

---

## Recovery Strategies

### By Error Category

#### Authentication Errors (`4001-4003`)
**Strategy:** Redirect to login

```typescript
if (error.code === 'INVALID_TOKEN' || error.code === 'AUTH_REQUIRED') {
  // Clear session
  await signOut();
  // Redirect to login
  router.push('/login?reason=session_expired');
}
```

#### Resource Errors (`4004`, `4003`, `4021`, `4030`)
**Strategy:** Show error, disable functionality

```typescript
if (error.code === 'CONVERSATION_NOT_FOUND') {
  setError('This conversation no longer exists');
  setCanSendMessages(false);
}
```

#### Transient Errors (`4005`, `4008`, `4100-4102`)
**Strategy:** Retry with exponential backoff

```typescript
const RECOVERY_STRATEGIES: Record<string, { retry: boolean; delay: number }> = {
  NOT_IN_ROOM: { retry: true, delay: 0 },
  RATE_LIMITED: { retry: true, delay: 1000 },
  SERVER_ERROR: { retry: true, delay: 1000 },
  DATABASE_ERROR: { retry: true, delay: 2000 },
  REDIS_ERROR: { retry: true, delay: 2000 },
};
```

#### Validation Errors (`4009-4011`, `4020`)
**Strategy:** Fix and retry manually

```typescript
if (error.code === 'MESSAGE_TOO_LARGE') {
  // Split message or show error
  showToast('Message too long. Please shorten.');
} else if (error.code === 'INVALID_MESSAGE_FORMAT') {
  // Log for debugging
  logger.error('Invalid message format', error);
  showToast('Failed to send message. Please try again.');
}
```

---

## Reconnection Strategy

### Exponential Backoff

```
Attempt 1: immediate (0ms)
Attempt 2: 1s delay (1000ms)
Attempt 3: 2s delay (2000ms)
Attempt 4: 4s delay (4000ms)
Attempt 5: 8s delay (8000ms)
Attempt 6+: Stop, show manual reconnect button
```

### Implementation

```typescript
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_BASE_DELAY = 1000;

function getReconnectDelay(attempt: number): number {
  if (attempt >= MAX_RECONNECT_ATTEMPTS) return -1; // Stop
  return RECONNECT_BASE_DELAY * Math.pow(2, attempt);
}

// Do not reconnect on these codes
const NO_RECONNECT_CODES = [4001, 4002, 4003, 4021, 4030];

ws.onclose = (event) => {
  if (NO_RECONNECT_CODES.includes(event.code)) {
    // Fatal error, don't retry
    setError('Connection closed. Please login again.');
    return;
  }
  
  // Attempt reconnection
  const delay = getReconnectDelay(reconnectAttempts);
  if (delay >= 0) {
    setTimeout(connect, delay);
    reconnectAttempts++;
  } else {
    setError('Unable to reconnect. Please try again later.');
  }
};
```

---

## Error Handling Flow

```
┌─────────────────┐
│  Error Received │
└────────┬────────┘
         │
         ▼
┌─────────────────┐     ┌─────────────────┐
│ Is retryable?   │────▶│  Retry with     │
│   (check code)  │ No  │  backoff        │
└────────┬────────┘     └─────────────────┘
         │ Yes
         ▼
┌─────────────────┐
│ Fatal auth or   │────▶│ Redirect to     │
│ perms error?    │ No  │ login / Show    │
└────────┬────────┘     │ error UI        │
         │ Yes
         ▼
┌─────────────────┐
│ Show error &    │
│ disable feature │
└─────────────────┘
```

---

## Common Error Scenarios

### Scenario 1: Token Expires During Chat

```
1. Client sends message
2. Server detects expired token
3. Server sends error {code: 'INVALID_TOKEN', retryable: false}
4. Server closes connection with code 4001
5. Client shows "Session expired" message
6. Client redirects to login page
```

### Scenario 2: Rate Limit Hit

```
1. Client sends 31 messages in 1 minute
2. Server rejects 31st message
3. Server sends error {code: 'RATE_LIMITED', retryable: true, details: {retry_after_ms: 1000}}
4. Client queues message, waits 1 second
5. Client retries automatically
```

### Scenario 3: Server Restart

```
1. Server starts restart process
2. Server closes all connections with code 1012 (Service Restart)
3. Clients detect close code 1012
4. Clients wait 3 seconds, then reconnect
5. Clients re-authenticate and re-join rooms
```
