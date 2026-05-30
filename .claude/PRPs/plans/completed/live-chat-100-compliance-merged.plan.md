# JskApp Live Chat - 100% Compliance Implementation Plan (Merged)

> **Target:** Elevate overall compliance score from **69% to 100%**
> **Based on:** JskApp_LiveChat_Compliance_Analysis.md
> **Sources:** Claude Code Plan + Kimi Code Plan (Best of Both)

---

## Executive Summary

| Category | Current | Target | Gap | Priority |
|----------|---------|--------|-----|----------|
| Messaging API | 85% | 100% | +15% | High |
| Live Chat Architecture | 80% | 100% | +20% | High |
| Bot-to-Human Handoff | 70% | 100% | +30% | High |
| WebSocket Real-Time | 85% | 100% | +15% | Medium |
| Admin Dashboard | 65% | 100% | +35% | Medium |
| Operator Console UX | 70% | 100% | +30% | Medium |
| Security & Access | 60% | 100% | +40% | High |
| Performance Metrics | 40% | 100% | +60% | High |
| **Overall** | **69%** | **100%** | **+31%** | **Critical** |

---

## Phase 1: Critical Security & Core Infrastructure (Week 1-2)

### Task 1.1: Webhook Duplicate Event Detection
**Goal:** Achieve 100% Messaging API compliance
**Current Score:** 85% - Missing `webhookEventId` tracking

**Files to modify:**
- `backend/app/api/v1/endpoints/webhook.py`
- `backend/app/core/redis.py` (add helper)

**Implementation:**
```python
# backend/app/api/v1/endpoints/webhook.py
async def process_webhook_events(events: list, db: AsyncSession):
    for event in events:
        # Deduplicate using webhookEventId
        event_id = getattr(event, 'webhook_event_id', None)
        if event_id:
            redis_key = f"webhook:event:{event_id}"
            if await redis_client.exists(redis_key):
                logger.info(f"Duplicate event {event_id}, skipping")
                continue
            await redis_client.setex(redis_key, 300, "1")  # 5 min TTL

        # Route to appropriate handler
        if isinstance(event, MessageEvent):
            await handle_message_event(event, db)
        elif isinstance(event, FollowEvent):
            await handle_follow_event(event, db)
        # ... etc
```

**Acceptance Criteria:**
- [ ] Redis deduplication key exists for each event
- [ ] Duplicate events logged and skipped
- [ ] 5-minute TTL prevents unbounded growth
- [ ] Unit tests verify deduplication logic

---

### Task 1.2: Complete JWT Authentication Integration
**Goal:** Achieve 100% Security & Access compliance
**Current Score:** 60% - Frontend uses hardcoded admin_id

**Files to modify:**
- `frontend/hooks/useLiveChatSocket.ts`
- `frontend/app/admin/live-chat/page.tsx`
- `backend/app/api/v1/endpoints/ws_live_chat.py`
- `backend/app/core/security.py`

**Frontend Implementation:**
```typescript
// frontend/hooks/useLiveChatSocket.ts
import { useAuth } from '@/contexts/AuthContext';

export function useLiveChatSocket() {
    const { user, token } = useAuth();
    const wsRef = useRef<WebSocket | null>(null);

    const connect = useCallback(() => {
        const ws = new WebSocket(WS_URL);

        ws.onopen = () => {
            // Send JWT token for authentication
            ws.send(JSON.stringify({
                type: 'auth',
                payload: {
                    token: token,  // JWT instead of hardcoded admin_id
                    admin_id: user?.id
                }
            }));
        };

        wsRef.current = ws;
    }, [token, user?.id]);

    return { connect, ws: wsRef.current };
}
```

**Backend Implementation:**
```python
# backend/app/api/v1/endpoints/ws_live_chat.py
from app.core.security import verify_jwt_token

async def handle_auth(websocket: WebSocket, payload: dict, db: AsyncSession):
    token = payload.get('token')
    admin_id = payload.get('admin_id')

    # Verify JWT if provided
    if token:
        try:
            decoded = verify_jwt_token(token)
            admin_id = decoded.get('sub')
        except JWTError as e:
            await websocket.send_json({
                "type": "auth_error",
                "payload": {"message": "Invalid or expired token"}
            })
            return None

    # Validate admin exists and has permission
    admin = await get_admin_user(admin_id, db)
    if not admin or admin.role not in [UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.AGENT]:
        await websocket.send_json({
            "type": "auth_error",
            "payload": {"message": "Unauthorized"}
        })
        return None

    # Auth successful
    await ws_manager.register(str(admin_id), websocket)
    await websocket.send_json({
        "type": "auth_success",
        "payload": {"admin_id": str(admin_id), "username": admin.username}
    })

    return admin_id
```

**Acceptance Criteria:**
- [ ] Frontend uses JWT from auth context
- [ ] Backend validates JWT on WebSocket connect
- [ ] Token refresh mechanism implemented
- [ ] Role-based access enforced
- [ ] Graceful handling of expired tokens

---

### Task 1.3: Admin Action Audit Logging
**Goal:** Complete accountability and compliance tracking
**Priority:** High (moved from Phase 7 in Kimi plan)

**Files to create:**
- `backend/app/models/audit_log.py`
- `backend/alembic/versions/xxx_add_audit_logs.py`

**Files to modify:**
- `backend/app/services/live_chat_service.py`
- `backend/app/api/v1/endpoints/ws_live_chat.py`

**Model Implementation:**
```python
# backend/app/models/audit_log.py
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text
from sqlalchemy.dialects.postgresql import JSONB
from datetime import datetime
from app.db.base_class import Base

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    admin_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    action = Column(String(50), index=True)  # claim_session, close_session, send_message, transfer_session
    resource_type = Column(String(50))  # chat_session, message, user
    resource_id = Column(String(100))
    details = Column(JSONB, default={})
    ip_address = Column(String(50), nullable=True)
    user_agent = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
```

**Decorator for Auto-Logging:**
```python
# backend/app/core/audit.py
from functools import wraps
from app.models.audit_log import AuditLog

def audit_action(action: str, resource_type: str):
    """Decorator to automatically log admin actions"""
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            db = kwargs.get('db')
            admin_id = kwargs.get('admin_id') or kwargs.get('operator_id')

            # Execute the action
            result = await func(*args, **kwargs)

            # Log the action
            if db and admin_id:
                resource_id = str(result.id) if hasattr(result, 'id') else str(kwargs.get('line_user_id', ''))
                log = AuditLog(
                    admin_id=admin_id,
                    action=action,
                    resource_type=resource_type,
                    resource_id=resource_id,
                    details={"function": func.__name__, "kwargs_keys": list(kwargs.keys())}
                )
                db.add(log)
                await db.flush()  # Don't commit, let caller handle transaction

            return result
        return wrapper
    return decorator

# Usage in live_chat_service.py
class LiveChatService:
    @audit_action("claim_session", "chat_session")
    async def claim_session(self, line_user_id: str, operator_id: int, db: AsyncSession):
        # ... existing implementation
        pass

    @audit_action("close_session", "chat_session")
    async def close_session(self, line_user_id: str, closed_by: str, db: AsyncSession):
        # ... existing implementation
        pass

    @audit_action("send_message", "message")
    async def send_operator_message(self, line_user_id: str, admin_id: int, text: str, db: AsyncSession):
        # ... existing implementation
        pass
```

**Acceptance Criteria:**
- [ ] All admin actions logged (claim, close, send, transfer)
- [ ] IP address captured from WebSocket/HTTP headers
- [ ] Audit logs queryable by admin, action, date range
- [ ] 90-day retention policy configured
- [ ] Admin UI for viewing audit logs (Phase 6)

---

### Task 1.4: Session Timeout & Auto-Logout
**Goal:** Security hardening for admin sessions

**Files to create:**
- `frontend/components/admin/SessionTimeoutWarning.tsx`
- `frontend/hooks/useSessionTimeout.ts`

**Implementation:**
```typescript
// frontend/hooks/useSessionTimeout.ts
import { useEffect, useCallback, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';

const INACTIVITY_TIMEOUT = 30 * 60 * 1000; // 30 minutes
const WARNING_BEFORE = 5 * 60 * 1000; // 5 minutes warning

export function useSessionTimeout() {
    const { logout } = useAuth();
    const [showWarning, setShowWarning] = useState(false);
    const [remainingTime, setRemainingTime] = useState(0);
    const timeoutRef = useRef<NodeJS.Timeout>();
    const warningRef = useRef<NodeJS.Timeout>();
    const countdownRef = useRef<NodeJS.Timeout>();

    const resetTimer = useCallback(() => {
        // Clear existing timers
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        if (warningRef.current) clearTimeout(warningRef.current);
        if (countdownRef.current) clearInterval(countdownRef.current);

        setShowWarning(false);

        // Set warning timer
        warningRef.current = setTimeout(() => {
            setShowWarning(true);
            setRemainingTime(WARNING_BEFORE / 1000);

            // Start countdown
            countdownRef.current = setInterval(() => {
                setRemainingTime(prev => {
                    if (prev <= 1) {
                        clearInterval(countdownRef.current);
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);
        }, INACTIVITY_TIMEOUT - WARNING_BEFORE);

        // Set logout timer
        timeoutRef.current = setTimeout(() => {
            logout();
        }, INACTIVITY_TIMEOUT);
    }, [logout]);

    useEffect(() => {
        const events = ['mousemove', 'keypress', 'click', 'scroll', 'touchstart'];

        events.forEach(event => {
            window.addEventListener(event, resetTimer);
        });

        resetTimer(); // Initialize

        return () => {
            events.forEach(event => {
                window.removeEventListener(event, resetTimer);
            });
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
            if (warningRef.current) clearTimeout(warningRef.current);
            if (countdownRef.current) clearInterval(countdownRef.current);
        };
    }, [resetTimer]);

    const extendSession = useCallback(() => {
        resetTimer();
    }, [resetTimer]);

    return { showWarning, remainingTime, extendSession };
}
```

```typescript
// frontend/components/admin/SessionTimeoutWarning.tsx
'use client';

import { useSessionTimeout } from '@/hooks/useSessionTimeout';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogAction } from '@/components/ui/alert-dialog';

export function SessionTimeoutWarning() {
    const { showWarning, remainingTime, extendSession } = useSessionTimeout();

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    return (
        <AlertDialog open={showWarning}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Session Expiring Soon</AlertDialogTitle>
                    <AlertDialogDescription>
                        Your session will expire in {formatTime(remainingTime)} due to inactivity.
                        Click below to stay logged in.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogAction onClick={extendSession}>
                        Stay Logged In
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
```

**Acceptance Criteria:**
- [ ] 30-minute inactivity timeout
- [ ] Warning dialog 5 minutes before logout
- [ ] Countdown timer displayed
- [ ] "Stay Logged In" button resets timer
- [ ] Graceful WebSocket disconnection on logout

---

## Phase 2: Bot-to-Human Handoff Enhancement (Week 2-3)

### Task 2.1: Keyword-Based Handoff Triggers
**Goal:** Achieve 100% Bot-to-Human Handoff compliance
**Current Score:** 70% - No keyword detection

**Files to create:**
- `backend/app/services/handoff_service.py`

**Files to modify:**
- `backend/app/api/v1/endpoints/webhook.py`

**Implementation:**
```python
# backend/app/services/handoff_service.py
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.user import User, ChatMode
from app.services.live_chat_service import live_chat_service

# Configurable keywords - can be moved to database/settings later
HANDOFF_KEYWORDS_EN = [
    "agent", "human", "operator", "representative",
    "support", "help desk", "live person", "real person",
    "talk to someone", "speak to agent"
]

HANDOFF_KEYWORDS_TH = [
    "พูดกับเจ้าหน้าที่", "ติดต่อเจ้าหน้าที่", "คุยกับคน",
    "ขอคน", "ต้องการคน", "เจ้าหน้าที่", "ขอติดต่อแอดมิน",
    "ต้องการความช่วยเหลือ", "ขอความช่วยเหลือ", "ช่วยด้วย"
]

HANDOFF_KEYWORDS = HANDOFF_KEYWORDS_EN + HANDOFF_KEYWORDS_TH

class HandoffService:
    async def check_handoff_keywords(
        self,
        text: str,
        user: User,
        reply_token: str,
        db: AsyncSession
    ) -> bool:
        """
        Check if message contains handoff keywords.
        Returns True if handoff was initiated.
        """
        text_lower = text.strip().lower()

        # Check if any keyword matches
        if not any(kw in text_lower for kw in HANDOFF_KEYWORDS):
            return False

        # Only initiate if user is currently in BOT mode
        if user.chat_mode != ChatMode.BOT:
            return False

        # Initiate handoff
        await live_chat_service.initiate_handoff(user, reply_token, db)
        return True

    async def get_configurable_keywords(self, db: AsyncSession) -> list[str]:
        """Get keywords from database settings (future enhancement)"""
        # TODO: Load from SystemSettings table
        return HANDOFF_KEYWORDS

handoff_service = HandoffService()
```

**Integration in webhook.py:**
```python
# backend/app/api/v1/endpoints/webhook.py
from app.services.handoff_service import handoff_service

async def handle_message_event(event: MessageEvent, db: AsyncSession):
    line_user_id = event.source.user_id

    # Get or create user
    user = await friend_service.get_or_create_user(line_user_id, db)
    user.last_message_at = datetime.utcnow()

    # Handle text messages
    if isinstance(event.message, TextMessageContent):
        text = event.message.text

        # Check handoff keywords FIRST (before intent matching)
        if await handoff_service.check_handoff_keywords(text, user, event.reply_token, db):
            await db.commit()
            return

        # Continue with normal intent matching...
        if user.chat_mode == ChatMode.BOT:
            await process_bot_response(text, user, event.reply_token, db)
        else:
            # Route to live chat
            await route_to_operator(text, user, db)

    await db.commit()
```

**Acceptance Criteria:**
- [ ] Keyword detection in Thai and English
- [ ] Automatic handoff initiation
- [ ] Graceful transition message to user
- [ ] Keywords configurable via admin (future)
- [ ] Analytics tracking keyword-triggered handoffs

---

### Task 2.2: Queue Position & Wait Time Display
**Goal:** Enhance handoff transparency

**Files to modify:**
- `backend/app/services/live_chat_service.py`
- `backend/app/api/v1/endpoints/admin_live_chat.py`

**Implementation:**
```python
# backend/app/services/live_chat_service.py
from datetime import datetime, timedelta
from sqlalchemy import select, func

class LiveChatService:
    async def get_queue_position(self, line_user_id: str, db: AsyncSession) -> dict:
        """Get user's position in WAITING queue with estimated wait time"""

        # Get all waiting sessions ordered by creation time
        stmt = select(ChatSession).where(
            ChatSession.status == SessionStatus.WAITING
        ).order_by(ChatSession.created_at)

        result = await db.execute(stmt)
        waiting_sessions = result.scalars().all()

        # Find user's position
        position = next(
            (i + 1 for i, s in enumerate(waiting_sessions) if s.line_user_id == line_user_id),
            0
        )

        # Calculate average wait time from recent sessions
        avg_wait = await self._calculate_avg_wait_time(db)
        estimated_wait = position * avg_wait if position > 0 else 0

        return {
            "position": position,
            "total_waiting": len(waiting_sessions),
            "estimated_wait_seconds": estimated_wait,
            "estimated_wait_minutes": round(estimated_wait / 60, 1)
        }

    async def _calculate_avg_wait_time(self, db: AsyncSession, hours: int = 24) -> float:
        """Calculate average wait time from sessions claimed in last N hours"""

        stmt = select(
            func.avg(
                func.extract('epoch', ChatSession.claimed_at - ChatSession.created_at)
            )
        ).where(
            ChatSession.claimed_at.isnot(None),
            ChatSession.claimed_at > datetime.utcnow() - timedelta(hours=hours)
        )

        result = await db.execute(stmt)
        avg_seconds = result.scalar()

        return avg_seconds if avg_seconds else 120  # Default 2 minutes if no data

    async def send_queue_update(self, line_user_id: str, db: AsyncSession):
        """Send queue position update to user via LINE"""
        queue_info = await self.get_queue_position(line_user_id, db)

        if queue_info["position"] == 0:
            return

        flex_message = self._build_queue_flex(queue_info)
        await line_service.push_messages(line_user_id, [flex_message])

    def _build_queue_flex(self, queue_info: dict) -> FlexMessage:
        """Build queue status Flex Message"""
        return FlexMessage(
            alt_text="Queue Status",
            contents={
                "type": "bubble",
                "body": {
                    "type": "box",
                    "layout": "vertical",
                    "contents": [
                        {
                            "type": "text",
                            "text": "กำลังรอเจ้าหน้าที่",
                            "weight": "bold",
                            "size": "lg",
                            "color": "#1DB446"
                        },
                        {
                            "type": "separator",
                            "margin": "md"
                        },
                        {
                            "type": "box",
                            "layout": "horizontal",
                            "margin": "md",
                            "contents": [
                                {"type": "text", "text": "ตำแหน่งคิว:", "color": "#555555", "flex": 1},
                                {"type": "text", "text": f"{queue_info['position']}/{queue_info['total_waiting']}", "weight": "bold", "flex": 1, "align": "end"}
                            ]
                        },
                        {
                            "type": "box",
                            "layout": "horizontal",
                            "margin": "sm",
                            "contents": [
                                {"type": "text", "text": "เวลารอโดยประมาณ:", "color": "#555555", "flex": 2},
                                {"type": "text", "text": f"~{queue_info['estimated_wait_minutes']} นาที", "weight": "bold", "flex": 1, "align": "end"}
                            ]
                        }
                    ]
                }
            }
        )
```

**Acceptance Criteria:**
- [ ] Queue position calculated correctly (FIFO)
- [ ] Estimated wait time based on historical data
- [ ] Flex message sent to user in Thai
- [ ] Admin dashboard shows queue metrics
- [ ] Real-time updates when position changes

---

### Task 2.3: Business Hours Handling
**Goal:** Professional after-hours experience

**Files to create:**
- `backend/app/models/business_hours.py`
- `backend/alembic/versions/xxx_add_business_hours.py`

**Files to modify:**
- `backend/app/services/live_chat_service.py`
- `backend/app/api/v1/endpoints/admin_settings.py`

**Model Implementation:**
```python
# backend/app/models/business_hours.py
from sqlalchemy import Column, Integer, Time, Boolean, String
from app.db.base_class import Base

class BusinessHours(Base):
    __tablename__ = "business_hours"

    id = Column(Integer, primary_key=True)
    day_of_week = Column(Integer, index=True)  # 0=Monday, 6=Sunday
    day_name = Column(String(20))  # For readability
    open_time = Column(Time)
    close_time = Column(Time)
    is_active = Column(Boolean, default=True)

    @classmethod
    def get_default_hours(cls):
        """Default: Mon-Fri 08:00-17:00"""
        from datetime import time
        defaults = []
        day_names = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
        for i, name in enumerate(day_names):
            defaults.append(cls(
                day_of_week=i,
                day_name=name,
                open_time=time(8, 0),
                close_time=time(17, 0),
                is_active=(i < 5)  # Active Mon-Fri only
            ))
        return defaults
```

**Service Implementation:**
```python
# backend/app/services/business_hours_service.py
from datetime import datetime, time
import pytz
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.business_hours import BusinessHours

BANGKOK_TZ = pytz.timezone('Asia/Bangkok')

class BusinessHoursService:
    async def is_within_business_hours(self, db: AsyncSession) -> bool:
        """Check if current time is within business hours"""
        now = datetime.now(BANGKOK_TZ)
        day = now.weekday()  # 0=Monday
        current_time = now.time()

        stmt = select(BusinessHours).where(
            BusinessHours.day_of_week == day,
            BusinessHours.is_active == True
        )
        result = await db.execute(stmt)
        hours = result.scalar_one_or_none()

        if not hours:
            return False

        return hours.open_time <= current_time <= hours.close_time

    async def get_next_open_time(self, db: AsyncSession) -> str:
        """Get next available business hours"""
        now = datetime.now(BANGKOK_TZ)

        for days_ahead in range(7):
            check_day = (now.weekday() + days_ahead) % 7

            stmt = select(BusinessHours).where(
                BusinessHours.day_of_week == check_day,
                BusinessHours.is_active == True
            )
            result = await db.execute(stmt)
            hours = result.scalar_one_or_none()

            if hours:
                if days_ahead == 0 and now.time() < hours.open_time:
                    return f"Today at {hours.open_time.strftime('%H:%M')}"
                elif days_ahead > 0:
                    return f"{hours.day_name} at {hours.open_time.strftime('%H:%M')}"

        return "Next available time"

business_hours_service = BusinessHoursService()
```

**Integration in Handoff:**
```python
# backend/app/services/live_chat_service.py
async def initiate_handoff(self, user: User, reply_token: str, db: AsyncSession):
    """Initiate handoff with business hours check"""

    # Check business hours
    if not await business_hours_service.is_within_business_hours(db):
        next_open = await business_hours_service.get_next_open_time(db)

        await line_service.reply_text(
            reply_token,
            f"ขออภัยค่ะ ขณะนี้อยู่นอกเวลาทำการ\n"
            f"เวลาทำการ: จันทร์-ศุกร์ 08:00-17:00 น.\n"
            f"เปิดให้บริการอีกครั้ง: {next_open}\n\n"
            f"กรุณาฝากข้อความไว้ เจ้าหน้าที่จะติดต่อกลับค่ะ"
        )

        # Create offline ticket for follow-up
        await self._create_offline_ticket(user, db)
        return

    # Normal handoff flow...
    user.chat_mode = ChatMode.HUMAN
    session = await self._create_waiting_session(user.line_user_id, db)

    # Send confirmation to user
    await line_service.reply_text(
        reply_token,
        "กำลังเชื่อมต่อกับเจ้าหน้าที่ค่ะ กรุณารอสักครู่..."
    )

    # Notify operators
    await self._notify_operators(session, db)
```

**Acceptance Criteria:**
- [ ] Configurable business hours per day
- [ ] Thai language after-hours message
- [ ] Next open time displayed
- [ ] Offline ticket creation for follow-up
- [ ] Admin can toggle override for urgent cases

---

## Phase 3: Real-Time Infrastructure & Reliability (Week 3-4)

### Task 3.1: Redis Pub/Sub for Horizontal Scaling
**Goal:** Achieve 100% WebSocket scalability
**Current Score:** 85% - In-memory only (single server)

**Files to create:**
- `backend/app/core/pubsub_manager.py`

**Files to modify:**
- `backend/app/core/websocket_manager.py`
- `backend/app/core/config.py`

**Implementation:**
```python
# backend/app/core/pubsub_manager.py
import json
import asyncio
import logging
from typing import Callable, Optional
import aioredis
from app.core.config import settings

logger = logging.getLogger(__name__)

class PubSubManager:
    """Redis Pub/Sub manager for cross-server communication"""

    def __init__(self):
        self.redis: Optional[aioredis.Redis] = None
        self.pubsub: Optional[aioredis.client.PubSub] = None
        self._callbacks: dict[str, list[Callable]] = {}
        self._listener_task: Optional[asyncio.Task] = None

    async def connect(self):
        """Connect to Redis"""
        try:
            self.redis = await aioredis.from_url(
                settings.REDIS_URL,
                encoding='utf-8',
                decode_responses=True
            )
            self.pubsub = self.redis.pubsub()
            logger.info("Redis Pub/Sub connected")
        except Exception as e:
            logger.error(f"Failed to connect to Redis Pub/Sub: {e}")
            self.redis = None

    async def disconnect(self):
        """Disconnect from Redis"""
        if self._listener_task:
            self._listener_task.cancel()
        if self.pubsub:
            await self.pubsub.close()
        if self.redis:
            await self.redis.close()

    async def publish(self, channel: str, message: dict):
        """Publish message to channel"""
        if not self.redis:
            logger.warning("Redis not connected, skipping publish")
            return

        try:
            await self.redis.publish(channel, json.dumps(message))
        except Exception as e:
            logger.error(f"Failed to publish to {channel}: {e}")

    async def subscribe(self, channel: str, callback: Callable):
        """Subscribe to channel with callback"""
        if channel not in self._callbacks:
            self._callbacks[channel] = []
        self._callbacks[channel].append(callback)

        if self.pubsub:
            await self.pubsub.subscribe(channel)

            if not self._listener_task:
                self._listener_task = asyncio.create_task(self._listen())

    async def _listen(self):
        """Listen for messages on subscribed channels"""
        try:
            async for message in self.pubsub.listen():
                if message['type'] == 'message':
                    channel = message['channel']
                    data = json.loads(message['data'])

                    for callback in self._callbacks.get(channel, []):
                        try:
                            await callback(data)
                        except Exception as e:
                            logger.error(f"Callback error for {channel}: {e}")
        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.error(f"Pub/Sub listener error: {e}")

pubsub_manager = PubSubManager()
```

**Updated WebSocket Manager:**
```python
# backend/app/core/websocket_manager.py
from app.core.pubsub_manager import pubsub_manager

class ConnectionManager:
    BROADCAST_CHANNEL = "live_chat:broadcast"
    ROOM_CHANNEL_PREFIX = "live_chat:room:"

    async def initialize(self):
        """Initialize with Redis Pub/Sub"""
        await pubsub_manager.connect()
        await pubsub_manager.subscribe(
            self.BROADCAST_CHANNEL,
            self._handle_remote_broadcast
        )

    async def _handle_remote_broadcast(self, data: dict):
        """Handle broadcast from other servers"""
        # Only broadcast locally, don't re-publish to Redis
        await self._broadcast_local(data)

    async def broadcast_to_all(self, data: dict):
        """Broadcast to all connected admins across all servers"""
        # Publish to Redis for other servers
        await pubsub_manager.publish(self.BROADCAST_CHANNEL, data)
        # Broadcast locally
        await self._broadcast_local(data)

    async def _broadcast_local(self, data: dict):
        """Broadcast to local connections only"""
        for admin_id, connections in self.connections.items():
            for ws in connections:
                try:
                    await ws.send_json(data)
                except Exception as e:
                    logger.error(f"Failed to send to admin {admin_id}: {e}")

    async def broadcast_to_room(self, room_id: str, data: dict):
        """Broadcast to specific room across all servers"""
        channel = f"{self.ROOM_CHANNEL_PREFIX}{room_id}"
        await pubsub_manager.publish(channel, data)
        await self._broadcast_room_local(room_id, data)
```

**Acceptance Criteria:**
- [ ] Redis Pub/Sub integration working
- [ ] Cross-server message broadcasting
- [ ] Room-based channel isolation
- [ ] Graceful fallback to local-only mode
- [ ] Health check for Redis connection

---

### Task 3.2: WebSocket Health Monitoring
**Goal:** Production-ready reliability monitoring

**Files to create:**
- `backend/app/core/websocket_health.py`

**Files to modify:**
- `backend/app/api/v1/endpoints/health.py`

**Implementation:**
```python
# backend/app/core/websocket_health.py
import time
from dataclasses import dataclass, field
from typing import Optional
import asyncio

@dataclass
class WebSocketMetrics:
    total_connections: int = 0
    active_connections: int = 0
    messages_sent: int = 0
    messages_received: int = 0
    errors: int = 0
    avg_latency_ms: float = 0.0
    peak_connections: int = 0
    uptime_seconds: float = 0.0

class WebSocketHealthMonitor:
    def __init__(self):
        self.metrics = WebSocketMetrics()
        self._start_time = time.time()
        self._latencies: list[float] = []
        self._max_latency_samples = 1000

    def record_connection(self):
        self.metrics.total_connections += 1
        self.metrics.active_connections += 1
        if self.metrics.active_connections > self.metrics.peak_connections:
            self.metrics.peak_connections = self.metrics.active_connections

    def record_disconnection(self):
        self.metrics.active_connections = max(0, self.metrics.active_connections - 1)

    def record_message_sent(self, latency_ms: Optional[float] = None):
        self.metrics.messages_sent += 1
        if latency_ms:
            self._record_latency(latency_ms)

    def record_message_received(self):
        self.metrics.messages_received += 1

    def record_error(self):
        self.metrics.errors += 1

    def _record_latency(self, latency_ms: float):
        self._latencies.append(latency_ms)
        if len(self._latencies) > self._max_latency_samples:
            self._latencies.pop(0)
        self.metrics.avg_latency_ms = sum(self._latencies) / len(self._latencies)

    async def get_health_status(self) -> dict:
        self.metrics.uptime_seconds = time.time() - self._start_time

        error_rate = (
            self.metrics.errors / self.metrics.messages_sent
            if self.metrics.messages_sent > 0 else 0
        )

        status = "healthy"
        if error_rate > 0.05:
            status = "degraded"
        if error_rate > 0.1 or self.metrics.active_connections == 0:
            status = "unhealthy"

        return {
            "status": status,
            "metrics": {
                "active_connections": self.metrics.active_connections,
                "peak_connections": self.metrics.peak_connections,
                "total_connections": self.metrics.total_connections,
                "messages_sent": self.metrics.messages_sent,
                "messages_received": self.metrics.messages_received,
                "errors": self.metrics.errors,
                "error_rate": round(error_rate, 4),
                "avg_latency_ms": round(self.metrics.avg_latency_ms, 2),
                "uptime_seconds": round(self.metrics.uptime_seconds, 0)
            },
            "redis_connected": await self._check_redis()
        }

    async def _check_redis(self) -> bool:
        try:
            from app.core.pubsub_manager import pubsub_manager
            if pubsub_manager.redis:
                await pubsub_manager.redis.ping()
                return True
        except:
            pass
        return False

ws_health_monitor = WebSocketHealthMonitor()
```

**Health Endpoint:**
```python
# backend/app/api/v1/endpoints/health.py
from app.core.websocket_health import ws_health_monitor

@router.get("/health/websocket")
async def websocket_health():
    """WebSocket health check endpoint"""
    return await ws_health_monitor.get_health_status()
```

**Acceptance Criteria:**
- [ ] Real-time connection metrics
- [ ] Error rate tracking
- [ ] Latency monitoring
- [ ] Redis connection status
- [ ] Health endpoint for monitoring tools

---

### Task 3.3: Auto-Close Inactive Sessions
**Goal:** Prevent session pile-up

**Files to create:**
- `backend/app/tasks/session_cleanup.py`

**Files to modify:**
- `backend/app/models/chat_session.py`
- `backend/app/main.py` (add background task)

**Implementation:**
```python
# backend/app/tasks/session_cleanup.py
import asyncio
import logging
from datetime import datetime, timedelta
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import AsyncSessionLocal
from app.models.chat_session import ChatSession, SessionStatus
from app.models.user import User, ChatMode
from app.services.line_service import line_service
from app.core.websocket_manager import ws_manager
from app.models.audit_log import AuditLog

logger = logging.getLogger(__name__)

INACTIVE_TIMEOUT_MINUTES = 30
CLEANUP_INTERVAL_SECONDS = 300  # Run every 5 minutes

async def cleanup_inactive_sessions():
    """Background task to auto-close inactive sessions"""
    while True:
        try:
            async with AsyncSessionLocal() as db:
                threshold = datetime.utcnow() - timedelta(minutes=INACTIVE_TIMEOUT_MINUTES)

                # Find inactive ACTIVE sessions
                stmt = select(ChatSession).where(
                    ChatSession.status == SessionStatus.ACTIVE,
                    ChatSession.last_activity_at < threshold
                )
                result = await db.execute(stmt)
                inactive_sessions = result.scalars().all()

                for session in inactive_sessions:
                    logger.info(f"Auto-closing inactive session {session.id} for {session.line_user_id}")

                    # Close session
                    session.status = SessionStatus.CLOSED
                    session.closed_at = datetime.utcnow()
                    session.closed_by = "system_auto_close"

                    # Reset user to BOT mode
                    await db.execute(
                        update(User)
                        .where(User.line_user_id == session.line_user_id)
                        .values(chat_mode=ChatMode.BOT)
                    )

                    # Log the action
                    audit = AuditLog(
                        admin_id=None,
                        action="auto_close_session",
                        resource_type="chat_session",
                        resource_id=str(session.id),
                        details={"reason": "inactivity", "threshold_minutes": INACTIVE_TIMEOUT_MINUTES}
                    )
                    db.add(audit)

                    # Notify user
                    try:
                        await line_service.push_text(
                            session.line_user_id,
                            "การสนทนาได้สิ้นสุดลงเนื่องจากไม่มีการตอบกลับ\n"
                            "หากต้องการความช่วยเหลือเพิ่มเติม กรุณาส่งข้อความมาใหม่ค่ะ"
                        )
                    except Exception as e:
                        logger.error(f"Failed to notify user {session.line_user_id}: {e}")

                    # Notify operators via WebSocket
                    await ws_manager.broadcast_to_all({
                        "type": "session_closed",
                        "payload": {
                            "line_user_id": session.line_user_id,
                            "closed_by": "system_auto_close",
                            "reason": "inactivity"
                        }
                    })

                if inactive_sessions:
                    await db.commit()
                    logger.info(f"Auto-closed {len(inactive_sessions)} inactive sessions")

        except Exception as e:
            logger.error(f"Session cleanup error: {e}")

        await asyncio.sleep(CLEANUP_INTERVAL_SECONDS)

async def start_cleanup_task():
    """Start the cleanup background task"""
    asyncio.create_task(cleanup_inactive_sessions())
```

**Integration in main.py:**
```python
# backend/app/main.py
from app.tasks.session_cleanup import start_cleanup_task

@app.on_event("startup")
async def startup_event():
    # ... existing startup code
    await start_cleanup_task()
```

**Acceptance Criteria:**
- [ ] Sessions auto-close after 30 minutes of inactivity
- [ ] User notified of session closure
- [ ] User chat_mode reset to BOT
- [ ] Audit log entry created
- [ ] Operators notified via WebSocket

---

## Phase 4: Admin Dashboard & KPI Enhancement (Week 4-5)

### Task 4.1: Real-Time KPI Dashboard
**Goal:** Achieve 100% Admin Dashboard compliance
**Current Score:** 65% - Only basic counts

**Files to create:**
- `frontend/components/admin/LiveKPICards.tsx`
- `backend/app/api/v1/endpoints/admin_analytics.py`
- `backend/app/services/analytics_service.py`

**Backend Analytics Service:**
```python
# backend/app/services/analytics_service.py
from datetime import datetime, timedelta
from sqlalchemy import select, func, case
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.chat_session import ChatSession, SessionStatus
from app.models.csat_response import CsatResponse

class AnalyticsService:
    async def get_live_kpis(self, db: AsyncSession) -> dict:
        """Get real-time KPIs for dashboard"""

        # Waiting/Active counts
        waiting = await db.scalar(
            select(func.count()).where(ChatSession.status == SessionStatus.WAITING)
        )
        active = await db.scalar(
            select(func.count()).where(ChatSession.status == SessionStatus.ACTIVE)
        )

        # Average First Response Time (last hour)
        hour_ago = datetime.utcnow() - timedelta(hours=1)
        avg_frt_result = await db.execute(
            select(
                func.avg(
                    func.extract('epoch', ChatSession.first_response_at - ChatSession.claimed_at)
                )
            ).where(
                ChatSession.first_response_at.isnot(None),
                ChatSession.claimed_at > hour_ago
            )
        )
        avg_frt = avg_frt_result.scalar() or 0

        # Average Resolution Time (today)
        today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
        avg_resolution_result = await db.execute(
            select(
                func.avg(
                    func.extract('epoch', ChatSession.closed_at - ChatSession.created_at)
                )
            ).where(
                ChatSession.status == SessionStatus.CLOSED,
                ChatSession.closed_at > today_start
            )
        )
        avg_resolution = avg_resolution_result.scalar() or 0

        # CSAT (last 24 hours)
        day_ago = datetime.utcnow() - timedelta(days=1)
        csat_result = await db.execute(
            select(func.avg(CsatResponse.score)).where(
                CsatResponse.created_at > day_ago
            )
        )
        csat_avg = csat_result.scalar() or 0

        # FCR Rate (last 7 days)
        fcr_rate = await self.calculate_fcr_rate(db, days=7)

        # Sessions today
        sessions_today = await db.scalar(
            select(func.count()).where(
                ChatSession.created_at > today_start
            )
        )

        return {
            "waiting": waiting or 0,
            "active": active or 0,
            "avg_first_response_seconds": round(avg_frt, 1),
            "avg_resolution_seconds": round(avg_resolution, 1),
            "csat_average": round(csat_avg, 2) if csat_avg else 0,
            "csat_percentage": round((csat_avg / 5) * 100, 1) if csat_avg else 0,
            "fcr_rate": round(fcr_rate, 1),
            "sessions_today": sessions_today or 0,
            "timestamp": datetime.utcnow().isoformat()
        }

    async def calculate_fcr_rate(self, db: AsyncSession, days: int = 30) -> float:
        """Calculate First Contact Resolution rate"""
        cutoff = datetime.utcnow() - timedelta(days=days)

        # Get closed sessions
        result = await db.execute(
            select(ChatSession).where(
                ChatSession.status == SessionStatus.CLOSED,
                ChatSession.closed_at > cutoff
            )
        )
        sessions = result.scalars().all()

        if not sessions:
            return 0

        fcr_count = 0
        for session in sessions:
            # Check if user reopened within 24 hours
            reopened = await db.scalar(
                select(func.count()).where(
                    ChatSession.line_user_id == session.line_user_id,
                    ChatSession.created_at > session.closed_at,
                    ChatSession.created_at < session.closed_at + timedelta(hours=24)
                )
            )

            if not reopened:
                fcr_count += 1

        return (fcr_count / len(sessions)) * 100

analytics_service = AnalyticsService()
```

**Frontend KPI Cards:**
```typescript
// frontend/components/admin/LiveKPICards.tsx
'use client';

import { useState, useEffect } from 'react';
import { Clock, MessageSquare, Timer, Star, Target, Users } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

interface KPIData {
    waiting: number;
    active: number;
    avg_first_response_seconds: number;
    avg_resolution_seconds: number;
    csat_average: number;
    csat_percentage: number;
    fcr_rate: number;
    sessions_today: number;
}

const formatDuration = (seconds: number): string => {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
    return `${Math.round(seconds / 3600)}h`;
};

interface KPICardProps {
    title: string;
    value: string | number;
    icon: React.ReactNode;
    subtitle?: string;
    target?: string;
    status?: 'good' | 'warning' | 'bad';
}

function KPICard({ title, value, icon, subtitle, target, status = 'good' }: KPICardProps) {
    const statusColors = {
        good: 'text-green-600 dark:text-green-400',
        warning: 'text-yellow-600 dark:text-yellow-400',
        bad: 'text-red-600 dark:text-red-400'
    };

    return (
        <Card>
            <CardContent className="p-4">
                <div className="flex items-center justify-between">
                    <div>
                        <p className="text-sm text-muted-foreground">{title}</p>
                        <p className={`text-2xl font-bold ${statusColors[status]}`}>{value}</p>
                        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
                        {target && <p className="text-xs text-muted-foreground">Target: {target}</p>}
                    </div>
                    <div className="text-muted-foreground">{icon}</div>
                </div>
            </CardContent>
        </Card>
    );
}

export function LiveKPICards() {
    const [kpis, setKpis] = useState<KPIData | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchKPIs = async () => {
            try {
                const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/admin/analytics/live-kpis`);
                if (res.ok) {
                    setKpis(await res.json());
                }
            } catch (error) {
                console.error('Failed to fetch KPIs:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchKPIs();
        const interval = setInterval(fetchKPIs, 30000); // Refresh every 30s
        return () => clearInterval(interval);
    }, []);

    if (loading || !kpis) {
        return (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {[...Array(6)].map((_, i) => (
                    <Card key={i}>
                        <CardContent className="p-4 h-24 animate-pulse bg-muted" />
                    </Card>
                ))}
            </div>
        );
    }

    const frtStatus = kpis.avg_first_response_seconds <= 60 ? 'good' : kpis.avg_first_response_seconds <= 120 ? 'warning' : 'bad';
    const csatStatus = kpis.csat_percentage >= 80 ? 'good' : kpis.csat_percentage >= 60 ? 'warning' : 'bad';
    const fcrStatus = kpis.fcr_rate >= 70 ? 'good' : kpis.fcr_rate >= 50 ? 'warning' : 'bad';

    return (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
            <KPICard
                title="Waiting"
                value={kpis.waiting}
                icon={<Clock className="h-5 w-5" />}
                status={kpis.waiting === 0 ? 'good' : kpis.waiting <= 3 ? 'warning' : 'bad'}
            />
            <KPICard
                title="Active"
                value={kpis.active}
                icon={<MessageSquare className="h-5 w-5" />}
            />
            <KPICard
                title="Avg FRT"
                value={formatDuration(kpis.avg_first_response_seconds)}
                icon={<Timer className="h-5 w-5" />}
                subtitle="First Response"
                target="< 60s"
                status={frtStatus}
            />
            <KPICard
                title="CSAT"
                value={`${kpis.csat_percentage.toFixed(0)}%`}
                icon={<Star className="h-5 w-5" />}
                subtitle={`${kpis.csat_average.toFixed(1)}/5`}
                target="> 80%"
                status={csatStatus}
            />
            <KPICard
                title="FCR"
                value={`${kpis.fcr_rate.toFixed(0)}%`}
                icon={<Target className="h-5 w-5" />}
                subtitle="First Contact Resolution"
                target="> 70%"
                status={fcrStatus}
            />
            <KPICard
                title="Today"
                value={kpis.sessions_today}
                icon={<Users className="h-5 w-5" />}
                subtitle="Sessions"
            />
        </div>
    );
}
```

**Acceptance Criteria:**
- [ ] 6 KPI cards displayed
- [ ] Real-time updates every 30 seconds
- [ ] Color-coded status indicators
- [ ] Target comparison
- [ ] Mobile responsive grid

---

### Task 4.2: Audit Log Admin View
**Goal:** Searchable audit trail for compliance

**Files to create:**
- `frontend/app/admin/audit/page.tsx`
- `backend/app/api/v1/endpoints/admin_audit.py`

**Backend Endpoint:**
```python
# backend/app/api/v1/endpoints/admin_audit.py
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload
from datetime import date, datetime
from typing import Optional
from app.api.deps import get_db, get_current_admin
from app.models.audit_log import AuditLog
from app.models.user import User

router = APIRouter()

@router.get("/audit-logs")
async def get_audit_logs(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    admin_id: Optional[int] = None,
    action: Optional[str] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_admin)
):
    """Get paginated audit logs with filters"""

    stmt = select(AuditLog).options(
        joinedload(AuditLog.admin)
    ).order_by(desc(AuditLog.created_at))

    # Apply filters
    if admin_id:
        stmt = stmt.where(AuditLog.admin_id == admin_id)
    if action:
        stmt = stmt.where(AuditLog.action == action)
    if start_date:
        stmt = stmt.where(AuditLog.created_at >= datetime.combine(start_date, datetime.min.time()))
    if end_date:
        stmt = stmt.where(AuditLog.created_at <= datetime.combine(end_date, datetime.max.time()))

    # Pagination
    offset = (page - 1) * page_size
    stmt = stmt.offset(offset).limit(page_size)

    result = await db.execute(stmt)
    logs = result.scalars().all()

    return {
        "items": [
            {
                "id": log.id,
                "admin_id": log.admin_id,
                "admin_username": log.admin.username if log.admin else "System",
                "action": log.action,
                "resource_type": log.resource_type,
                "resource_id": log.resource_id,
                "details": log.details,
                "ip_address": log.ip_address,
                "created_at": log.created_at.isoformat()
            }
            for log in logs
        ],
        "page": page,
        "page_size": page_size
    }

@router.get("/audit-logs/actions")
async def get_audit_actions(db: AsyncSession = Depends(get_db)):
    """Get distinct action types for filter dropdown"""
    result = await db.execute(
        select(AuditLog.action).distinct()
    )
    return [row[0] for row in result.all()]
```

**Acceptance Criteria:**
- [ ] Paginated audit log list
- [ ] Filter by admin, action, date range
- [ ] Export to CSV
- [ ] Mobile responsive table

---

## Phase 5: Operator Productivity Features (Week 5-6)

### Task 5.1: Canned Responses / Quick Replies
**Goal:** Achieve 100% Operator Console UX compliance
**Current Score:** 70% - No template feature

**Files to create:**
- `backend/app/models/canned_response.py`
- `backend/app/api/v1/endpoints/admin_canned_responses.py`
- `frontend/components/admin/CannedResponsePicker.tsx`

**Model:**
```python
# backend/app/models/canned_response.py
from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, ForeignKey
from datetime import datetime
from app.db.base_class import Base

class CannedResponse(Base):
    __tablename__ = "canned_responses"

    id = Column(Integer, primary_key=True, index=True)
    shortcut = Column(String(30), unique=True, index=True)  # e.g., "/greeting"
    title = Column(String(100))
    content = Column(Text)
    category = Column(String(50), index=True)  # greeting, closing, escalation, info
    is_active = Column(Boolean, default=True)
    usage_count = Column(Integer, default=0)
    created_by = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
```

**Default Templates (Thai):**
```python
# backend/app/services/canned_response_service.py
DEFAULT_TEMPLATES = [
    {
        "shortcut": "/greeting",
        "title": "ทักทาย",
        "content": "สวัสดีค่ะ/ครับ ยินดีให้บริการค่ะ/ครับ มีอะไรให้ช่วยเหลือคะ?",
        "category": "greeting"
    },
    {
        "shortcut": "/closing",
        "title": "ปิดการสนทนา",
        "content": "ขอบคุณที่ใช้บริการค่ะ/ครับ หากมีข้อสงสัยเพิ่มเติมสามารถติดต่อได้ตลอดเวลาค่ะ/ครับ",
        "category": "closing"
    },
    {
        "shortcut": "/wait",
        "title": "รอสักครู่",
        "content": "รบกวนรอสักครู่นะคะ/ครับ กำลังตรวจสอบข้อมูลให้ค่ะ/ครับ",
        "category": "info"
    },
    {
        "shortcut": "/transfer",
        "title": "ส่งต่อเจ้าหน้าที่",
        "content": "กรุณารอสักครู่นะคะ/ครับ จะติดต่อเจ้าหน้าที่ที่เกี่ยวข้องมาช่วยเหลือค่ะ/ครับ",
        "category": "escalation"
    },
    {
        "shortcut": "/hours",
        "title": "เวลาทำการ",
        "content": "เวลาทำการของเรา: จันทร์-ศุกร์ 08:00-17:00 น. ค่ะ/ครับ",
        "category": "info"
    },
    {
        "shortcut": "/contact",
        "title": "ช่องทางติดต่อ",
        "content": "สามารถติดต่อเราได้ที่:\n📞 โทร: 02-xxx-xxxx\n📧 อีเมล: support@example.com\n🌐 เว็บไซต์: www.example.com",
        "category": "info"
    },
    {
        "shortcut": "/thanks",
        "title": "ขอบคุณ",
        "content": "ขอบคุณมากค่ะ/ครับ 🙏",
        "category": "closing"
    },
    {
        "shortcut": "/sorry",
        "title": "ขออภัย",
        "content": "ขออภัยในความไม่สะดวกค่ะ/ครับ ทางเราจะรีบดำเนินการแก้ไขให้เร็วที่สุดค่ะ/ครับ",
        "category": "info"
    }
]
```

**Frontend Component:**
```typescript
// frontend/components/admin/CannedResponsePicker.tsx
'use client';

import { useState, useEffect, useMemo } from 'react';
import { FileText, Search } from 'lucide-react';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

interface CannedResponse {
    id: number;
    shortcut: string;
    title: string;
    content: string;
    category: string;
}

interface CannedResponsePickerProps {
    onSelect: (content: string) => void;
}

const CATEGORY_COLORS: Record<string, string> = {
    greeting: 'bg-green-100 text-green-800',
    closing: 'bg-blue-100 text-blue-800',
    escalation: 'bg-orange-100 text-orange-800',
    info: 'bg-gray-100 text-gray-800'
};

export function CannedResponsePicker({ onSelect }: CannedResponsePickerProps) {
    const [responses, setResponses] = useState<CannedResponse[]>([]);
    const [search, setSearch] = useState('');
    const [open, setOpen] = useState(false);

    useEffect(() => {
        const fetchResponses = async () => {
            try {
                const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/admin/canned-responses`);
                if (res.ok) {
                    const data = await res.json();
                    setResponses(data.items || []);
                }
            } catch (error) {
                console.error('Failed to fetch canned responses:', error);
            }
        };
        fetchResponses();
    }, []);

    const filtered = useMemo(() => {
        if (!search) return responses;
        const lower = search.toLowerCase();
        return responses.filter(r =>
            r.shortcut.toLowerCase().includes(lower) ||
            r.title.toLowerCase().includes(lower) ||
            r.content.toLowerCase().includes(lower)
        );
    }, [responses, search]);

    const handleSelect = (content: string) => {
        onSelect(content);
        setOpen(false);
        setSearch('');
    };

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button variant="outline" size="icon" title="Quick Replies">
                    <FileText className="h-4 w-4" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-0" align="start">
                <div className="p-2 border-b">
                    <div className="relative">
                        <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Search templates..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="pl-8"
                        />
                    </div>
                </div>
                <div className="max-h-80 overflow-y-auto">
                    {filtered.length === 0 ? (
                        <p className="text-center text-muted-foreground py-4">No templates found</p>
                    ) : (
                        filtered.map((response) => (
                            <button
                                key={response.id}
                                onClick={() => handleSelect(response.content)}
                                className="w-full text-left px-3 py-2 hover:bg-accent border-b last:border-0"
                            >
                                <div className="flex items-center gap-2 mb-1">
                                    <code className="text-xs text-muted-foreground">{response.shortcut}</code>
                                    <Badge variant="secondary" className={CATEGORY_COLORS[response.category] || ''}>
                                        {response.category}
                                    </Badge>
                                </div>
                                <p className="font-medium text-sm">{response.title}</p>
                                <p className="text-xs text-muted-foreground line-clamp-2">{response.content}</p>
                            </button>
                        ))
                    )}
                </div>
            </PopoverContent>
        </Popover>
    );
}
```

**Acceptance Criteria:**
- [ ] 8+ default templates in Thai
- [ ] Shortcut system (/greeting, /closing, etc.)
- [ ] Searchable template picker
- [ ] Category badges
- [ ] Usage tracking
- [ ] Admin can create/edit templates

---

### Task 5.2: Notification Sounds
**Goal:** Alert operators to new messages

**Files to create:**
- `frontend/public/sounds/new-message.mp3`
- `frontend/hooks/useNotificationSound.ts`

**Files to modify:**
- `frontend/app/admin/live-chat/page.tsx`

**Implementation:**
```typescript
// frontend/hooks/useNotificationSound.ts
'use client';

import { useRef, useCallback, useEffect, useState } from 'react';

type SoundType = 'new_message' | 'new_session' | 'handoff_request';

const SOUNDS: Record<SoundType, string> = {
    new_message: '/sounds/new-message.mp3',
    new_session: '/sounds/new-session.mp3',
    handoff_request: '/sounds/handoff.mp3'
};

export function useNotificationSound() {
    const audioRefs = useRef<Map<SoundType, HTMLAudioElement>>(new Map());
    const [enabled, setEnabled] = useState(true);
    const [volume, setVolume] = useState(0.5);

    // Initialize audio elements
    useEffect(() => {
        // Load preference from localStorage
        const savedEnabled = localStorage.getItem('notification_sound_enabled');
        const savedVolume = localStorage.getItem('notification_sound_volume');

        if (savedEnabled !== null) setEnabled(savedEnabled === 'true');
        if (savedVolume !== null) setVolume(parseFloat(savedVolume));

        // Preload sounds
        Object.entries(SOUNDS).forEach(([type, path]) => {
            const audio = new Audio(path);
            audio.preload = 'auto';
            audioRefs.current.set(type as SoundType, audio);
        });

        return () => {
            audioRefs.current.forEach(audio => {
                audio.pause();
                audio.src = '';
            });
            audioRefs.current.clear();
        };
    }, []);

    // Update volume when changed
    useEffect(() => {
        audioRefs.current.forEach(audio => {
            audio.volume = volume;
        });
        localStorage.setItem('notification_sound_volume', volume.toString());
    }, [volume]);

    // Save enabled preference
    useEffect(() => {
        localStorage.setItem('notification_sound_enabled', enabled.toString());
    }, [enabled]);

    const play = useCallback((type: SoundType = 'new_message') => {
        if (!enabled) return;

        const audio = audioRefs.current.get(type);
        if (audio) {
            audio.currentTime = 0;
            audio.play().catch(err => {
                // Browser may block autoplay until user interaction
                console.warn('Sound playback blocked:', err);
            });
        }
    }, [enabled]);

    const playIfNotFocused = useCallback((type: SoundType = 'new_message') => {
        if (!document.hasFocus()) {
            play(type);
        }
    }, [play]);

    return {
        play,
        playIfNotFocused,
        enabled,
        setEnabled,
        volume,
        setVolume
    };
}
```

**Integration in Live Chat:**
```typescript
// In live-chat/page.tsx
const { playIfNotFocused, enabled: soundEnabled, setEnabled: setSoundEnabled } = useNotificationSound();

// In handleNewMessage callback
const handleNewMessage = useCallback((data: NewMessagePayload) => {
    // ... existing message handling

    // Play sound for incoming messages when not focused or not in this conversation
    if (data.direction === 'INCOMING' && data.line_user_id !== selectedIdRef.current) {
        playIfNotFocused('new_message');

        // Also show browser notification if permitted
        if (Notification.permission === 'granted') {
            new Notification('New Message', {
                body: data.content?.substring(0, 100),
                icon: '/favicon.ico'
            });
        }
    }
}, [playIfNotFocused]);

// Add sound toggle in header
<Button
    variant="ghost"
    size="icon"
    onClick={() => setSoundEnabled(!soundEnabled)}
    title={soundEnabled ? 'Mute notifications' : 'Enable notifications'}
>
    {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
</Button>
```

**Acceptance Criteria:**
- [ ] Sound toggle in UI
- [ ] Different sounds for different events
- [ ] Volume control
- [ ] Sound only when not focused or not in conversation
- [ ] Browser notification integration
- [ ] Preference persisted in localStorage

---

### Task 5.3: Operator Transfer / Reassignment
**Goal:** Allow transferring sessions between operators

**Files to modify:**
- `backend/app/services/live_chat_service.py`
- `backend/app/api/v1/endpoints/ws_live_chat.py`
- `backend/app/models/chat_session.py`
- `frontend/lib/websocket/types.ts`
- `frontend/app/admin/live-chat/page.tsx`

**Backend Implementation:**
```python
# backend/app/services/live_chat_service.py
from app.core.audit import audit_action

class LiveChatService:
    @audit_action("transfer_session", "chat_session")
    async def transfer_session(
        self,
        line_user_id: str,
        from_operator_id: int,
        to_operator_id: int,
        reason: str,
        db: AsyncSession
    ) -> ChatSession:
        """Transfer session to another operator"""

        # Get session
        session = await self._get_active_session(line_user_id, db)
        if not session:
            raise ValueError("No active session found")

        # Verify current operator
        if session.operator_id != from_operator_id:
            raise ValueError("Only the current operator can transfer the session")

        # Verify target operator exists and is online
        to_operator = await db.get(User, to_operator_id)
        if not to_operator or to_operator.role not in [UserRole.ADMIN, UserRole.AGENT]:
            raise ValueError("Invalid target operator")

        # Update session
        session.operator_id = to_operator_id
        session.transferred_at = datetime.utcnow()
        session.transfer_count = (session.transfer_count or 0) + 1
        session.transfer_reason = reason

        await db.commit()

        # Notify via WebSocket
        from_operator = await db.get(User, from_operator_id)

        await ws_manager.broadcast_to_room(
            ws_manager.get_room_id(line_user_id),
            {
                "type": "session_transferred",
                "payload": {
                    "line_user_id": line_user_id,
                    "from_operator": {
                        "id": from_operator_id,
                        "username": from_operator.username
                    },
                    "to_operator": {
                        "id": to_operator_id,
                        "username": to_operator.username
                    },
                    "reason": reason,
                    "transferred_at": session.transferred_at.isoformat()
                }
            }
        )

        # Notify target operator
        await ws_manager.send_to_admin(
            str(to_operator_id),
            {
                "type": "session_assigned",
                "payload": {
                    "line_user_id": line_user_id,
                    "from_operator": from_operator.username,
                    "reason": reason
                }
            }
        )

        return session
```

**WebSocket Event Handler:**
```python
# backend/app/api/v1/endpoints/ws_live_chat.py
elif event_type == "transfer_session":
    to_operator_id = payload.get("to_operator_id")
    reason = payload.get("reason", "")
    line_user_id = payload.get("line_user_id")

    if not to_operator_id or not line_user_id:
        await send_error(websocket, "Missing to_operator_id or line_user_id")
        continue

    try:
        await live_chat_service.transfer_session(
            line_user_id=line_user_id,
            from_operator_id=admin_id,
            to_operator_id=to_operator_id,
            reason=reason,
            db=db
        )
    except ValueError as e:
        await send_error(websocket, str(e))
```

**Acceptance Criteria:**
- [ ] Transfer button in chat UI
- [ ] Operator selection dropdown
- [ ] Optional transfer reason
- [ ] Both operators notified
- [ ] Audit log entry created
- [ ] Transfer count tracked

---

## Phase 6: Performance Metrics & CSAT (Week 6-7)

### Task 6.1: CSAT Survey Collection
**Goal:** Achieve 100% Performance Metrics compliance
**Current Score:** 40% - No post-chat survey

**Files to create:**
- `backend/app/models/csat_response.py`
- `backend/app/services/csat_service.py`
- `backend/alembic/versions/xxx_add_csat_responses.py`

**Files to modify:**
- `backend/app/services/live_chat_service.py`
- `backend/app/api/v1/endpoints/webhook.py`

**Model:**
```python
# backend/app/models/csat_response.py
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
from app.db.base_class import Base

class CsatResponse(Base):
    __tablename__ = "csat_responses"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("chat_sessions.id"), index=True)
    line_user_id = Column(String(50), index=True)
    score = Column(Integer)  # 1-5
    comment = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    session = relationship("ChatSession", back_populates="csat_response")
```

**CSAT Service:**
```python
# backend/app/services/csat_service.py
from linebot.v3.messaging import FlexMessage, FlexBubble, FlexBox, FlexText, FlexButton
from linebot.v3.messaging import PostbackAction
from app.models.csat_response import CsatResponse
from app.services.line_service import line_service

class CsatService:
    async def send_survey(self, line_user_id: str, session_id: int):
        """Send CSAT survey after session closes"""

        # Build star rating buttons
        star_buttons = []
        for i in range(1, 6):
            stars = "⭐" * i
            star_buttons.append({
                "type": "button",
                "style": "primary" if i >= 4 else "secondary",
                "height": "sm",
                "action": {
                    "type": "postback",
                    "label": stars,
                    "data": f"csat|{session_id}|{i}"
                }
            })

        flex_content = {
            "type": "bubble",
            "body": {
                "type": "box",
                "layout": "vertical",
                "contents": [
                    {
                        "type": "text",
                        "text": "ขอบคุณที่ใช้บริการค่ะ/ครับ",
                        "weight": "bold",
                        "size": "lg",
                        "align": "center"
                    },
                    {
                        "type": "text",
                        "text": "กรุณาให้คะแนนความพึงพอใจ",
                        "size": "sm",
                        "color": "#666666",
                        "align": "center",
                        "margin": "md"
                    }
                ]
            },
            "footer": {
                "type": "box",
                "layout": "vertical",
                "spacing": "sm",
                "contents": [
                    {
                        "type": "box",
                        "layout": "horizontal",
                        "spacing": "sm",
                        "contents": star_buttons[:3]
                    },
                    {
                        "type": "box",
                        "layout": "horizontal",
                        "spacing": "sm",
                        "contents": star_buttons[3:]
                    }
                ]
            }
        }

        flex_message = FlexMessage(
            alt_text="กรุณาให้คะแนนความพึงพอใจ",
            contents=flex_content
        )

        await line_service.push_messages(line_user_id, [flex_message])

    async def record_response(
        self,
        session_id: int,
        line_user_id: str,
        score: int,
        comment: str | None,
        db: AsyncSession
    ) -> CsatResponse:
        """Record CSAT response"""

        # Check if already responded
        existing = await db.scalar(
            select(CsatResponse).where(CsatResponse.session_id == session_id)
        )
        if existing:
            return existing

        response = CsatResponse(
            session_id=session_id,
            line_user_id=line_user_id,
            score=score,
            comment=comment
        )
        db.add(response)
        await db.commit()

        return response

csat_service = CsatService()
```

**Integration in Live Chat Close:**
```python
# backend/app/services/live_chat_service.py
async def close_session(self, line_user_id: str, closed_by: str, db: AsyncSession):
    # ... existing close logic ...

    # Send CSAT survey
    try:
        await csat_service.send_survey(line_user_id, session.id)
    except Exception as e:
        logger.error(f"Failed to send CSAT survey: {e}")

    return session
```

**Postback Handler:**
```python
# backend/app/api/v1/endpoints/webhook.py
async def handle_postback_event(event: PostbackEvent, db: AsyncSession):
    data = event.postback.data

    # Handle CSAT response
    if data.startswith("csat|"):
        parts = data.split("|")
        session_id = int(parts[1])
        score = int(parts[2])

        await csat_service.record_response(
            session_id=session_id,
            line_user_id=event.source.user_id,
            score=score,
            comment=None,
            db=db
        )

        # Thank user
        thank_messages = {
            1: "ขอบคุณสำหรับความคิดเห็นค่ะ เราจะนำไปปรับปรุงการบริการ",
            2: "ขอบคุณสำหรับความคิดเห็นค่ะ เราจะพยายามให้บริการที่ดีขึ้น",
            3: "ขอบคุณสำหรับความคิดเห็นค่ะ",
            4: "ขอบคุณมากค่ะ ยินดีให้บริการเสมอค่ะ",
            5: "ขอบคุณมากค่ะ ยินดีให้บริการเสมอค่ะ 🙏"
        }

        await line_service.reply_text(
            event.reply_token,
            thank_messages.get(score, "ขอบคุณสำหรับความคิดเห็นค่ะ")
        )
        return

    # ... other postback handlers
```

**Acceptance Criteria:**
- [ ] CSAT survey sent after session close
- [ ] 5-star rating UI in LINE Flex Message
- [ ] Response stored in database
- [ ] Thank you message personalized by score
- [ ] Duplicate responses prevented
- [ ] Analytics integration (Phase 4)

---

### Task 6.2: Analytics Export
**Goal:** Reporting capabilities for management

**Files to create:**
- `backend/app/api/v1/endpoints/admin_reports.py`
- `frontend/app/admin/reports/page.tsx`

**Backend Export Endpoint:**
```python
# backend/app/api/v1/endpoints/admin_reports.py
import csv
import io
from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from datetime import date, datetime
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from app.api.deps import get_db, get_current_admin
from app.models.chat_session import ChatSession, SessionStatus
from app.models.csat_response import CsatResponse
from app.models.user import User

router = APIRouter()

@router.get("/reports/sessions/export")
async def export_sessions_report(
    start_date: date,
    end_date: date,
    format: str = Query("csv", enum=["csv"]),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_admin)
):
    """Export session analytics as CSV"""

    # Query sessions with related data
    stmt = select(ChatSession).where(
        ChatSession.created_at >= datetime.combine(start_date, datetime.min.time()),
        ChatSession.created_at <= datetime.combine(end_date, datetime.max.time())
    ).order_by(ChatSession.created_at)

    result = await db.execute(stmt)
    sessions = result.scalars().all()

    # Build CSV
    output = io.StringIO()
    writer = csv.writer(output)

    # Header
    writer.writerow([
        "Session ID",
        "LINE User ID",
        "Status",
        "Operator ID",
        "Created At",
        "Claimed At",
        "First Response At",
        "Closed At",
        "Wait Time (s)",
        "First Response Time (s)",
        "Resolution Time (s)",
        "CSAT Score",
        "Transfer Count"
    ])

    # Data rows
    for session in sessions:
        # Get CSAT
        csat = await db.scalar(
            select(CsatResponse.score).where(CsatResponse.session_id == session.id)
        )

        # Calculate times
        wait_time = (
            (session.claimed_at - session.created_at).total_seconds()
            if session.claimed_at else None
        )
        frt = (
            (session.first_response_at - session.claimed_at).total_seconds()
            if session.first_response_at and session.claimed_at else None
        )
        resolution_time = (
            (session.closed_at - session.created_at).total_seconds()
            if session.closed_at else None
        )

        writer.writerow([
            session.id,
            session.line_user_id,
            session.status.value,
            session.operator_id,
            session.created_at.isoformat() if session.created_at else "",
            session.claimed_at.isoformat() if session.claimed_at else "",
            session.first_response_at.isoformat() if session.first_response_at else "",
            session.closed_at.isoformat() if session.closed_at else "",
            round(wait_time, 1) if wait_time else "",
            round(frt, 1) if frt else "",
            round(resolution_time, 1) if resolution_time else "",
            csat if csat else "",
            session.transfer_count or 0
        ])

    # Return CSV
    output.seek(0)
    filename = f"sessions_report_{start_date}_{end_date}.csv"

    return StreamingResponse(
        io.BytesIO(output.getvalue().encode('utf-8-sig')),  # BOM for Excel
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

@router.get("/reports/summary")
async def get_report_summary(
    start_date: date,
    end_date: date,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_admin)
):
    """Get summary statistics for date range"""

    start_dt = datetime.combine(start_date, datetime.min.time())
    end_dt = datetime.combine(end_date, datetime.max.time())

    # Total sessions
    total = await db.scalar(
        select(func.count()).where(
            ChatSession.created_at >= start_dt,
            ChatSession.created_at <= end_dt
        )
    )

    # By status
    status_counts = {}
    for status in SessionStatus:
        count = await db.scalar(
            select(func.count()).where(
                ChatSession.created_at >= start_dt,
                ChatSession.created_at <= end_dt,
                ChatSession.status == status
            )
        )
        status_counts[status.value] = count

    # Average CSAT
    avg_csat = await db.scalar(
        select(func.avg(CsatResponse.score)).where(
            CsatResponse.created_at >= start_dt,
            CsatResponse.created_at <= end_dt
        )
    )

    return {
        "period": {"start": start_date.isoformat(), "end": end_date.isoformat()},
        "total_sessions": total,
        "by_status": status_counts,
        "avg_csat": round(avg_csat, 2) if avg_csat else None,
        "csat_response_rate": None  # TODO: Calculate
    }
```

**Acceptance Criteria:**
- [ ] CSV export with all session data
- [ ] Date range filtering
- [ ] Summary statistics endpoint
- [ ] Excel-compatible encoding (UTF-8 BOM)
- [ ] Admin-only access

---

## Implementation Timeline (Gantt)

```
Week 1-2: Phase 1 - Security & Infrastructure
├── Task 1.1: Webhook Deduplication (3 days)
├── Task 1.2: JWT Integration (4 days)
├── Task 1.3: Audit Logging (3 days)
└── Task 1.4: Session Timeout (2 days)

Week 2-3: Phase 2 - Handoff Enhancement
├── Task 2.1: Keyword Triggers (3 days)
├── Task 2.2: Queue Position (3 days)
└── Task 2.3: Business Hours (2 days)

Week 3-4: Phase 3 - Reliability & Scaling
├── Task 3.1: Redis Pub/Sub (4 days)
├── Task 3.2: Health Monitoring (2 days)
└── Task 3.3: Auto-Close Sessions (2 days)

Week 4-5: Phase 4 - Dashboard & KPIs
├── Task 4.1: KPI Dashboard (4 days)
└── Task 4.2: Audit Log UI (2 days)

Week 5-6: Phase 5 - Operator Productivity
├── Task 5.1: Canned Responses (4 days)
├── Task 5.2: Notification Sounds (2 days)
└── Task 5.3: Operator Transfer (3 days)

Week 6-7: Phase 6 - Metrics & CSAT
├── Task 6.1: CSAT Survey (4 days)
└── Task 6.2: Analytics Export (2 days)

Week 7-8: Testing & Deployment
├── Integration Testing (3 days)
├── UAT (2 days)
└── Production Deployment (2 days)
```

---

## Database Migrations Summary

```bash
# Create all migrations
alembic revision --autogenerate -m "add_audit_logs_table"
alembic revision --autogenerate -m "add_business_hours_table"
alembic revision --autogenerate -m "add_canned_responses_table"
alembic revision --autogenerate -m "add_csat_responses_table"
alembic revision --autogenerate -m "add_session_transfer_fields"

# Apply
alembic upgrade head
```

---

## Risk Mitigation

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Redis dependency | High | Low | Fallback to local-only mode |
| JWT migration breaks existing sessions | Medium | Medium | Backward compatibility with admin_id for 2 weeks |
| Thai keyword NLP accuracy | Medium | Medium | Extensive testing, configurable keywords |
| Browser notification blocked | Low | High | Graceful degradation, in-app indicators |
| CSAT response rate low | Low | Medium | Gentle reminder, simple 1-tap rating |
| Performance impact of audit logging | Low | Low | Async writes, batch processing |

---

## Success Metrics

| Metric | Current | Target | Measurement |
|--------|---------|--------|-------------|
| Overall Compliance | 69% | 100% | Feature checklist |
| Messaging API | 85% | 100% | Webhook dedup + signature |
| Security & Access | 60% | 100% | JWT + audit + timeout |
| Bot-to-Human Handoff | 70% | 100% | Keywords + queue + hours |
| Performance Metrics | 40% | 100% | CSAT + FCR + export |
| WebSocket Scalability | 85% | 100% | Redis Pub/Sub |
| Test Coverage | ~44 tests | 80+ tests | pytest report |

---

## References

1. **Webhook Best Practices:** [dev.to - Stop Doing Business Logic in Webhook Endpoints](https://dev.to/elvissautet/stop-doing-business-logic-in-webhook-endpoints)
2. **LINE Webhook Security:** [LINE Developers Documentation](https://developers.line.biz/)
3. **Redis Pub/Sub Scaling:** [ably.com - Scaling Pub/Sub with WebSockets and Redis](https://ably.com/blog/scaling-pub-sub-with-websockets-and-redis)
4. **CSAT Best Practices:** [liveagent.com - Live Chat Surveys](https://www.liveagent.com/blog/chat-surveys/)
5. **Canned Responses:** [zendesk.com - 100+ Best Canned Responses](https://www.zendesk.com/blog/live-chat-canned-responses/)
6. **Chatbot-to-Human Handoff:** [spurnow.com - Complete Guide](https://www.spurnow.com/en/blogs/chatbot-to-human-handoff)

---

*Merged Plan - February 2026*
*Sources: Claude Code Plan + Kimi Code Plan*
