# Live Chat 100% Compliance Implementation Plan

> **Goal**: Achieve 100% compliance with LINE OA Live Chat best practices
> **Current Score**: 69% | **Target Score**: 100%
> **Reference**: `research/claude_code/JskApp_LiveChat_Compliance_Analysis.md`

---

## Executive Summary

This plan addresses all missing and partially implemented features identified in the compliance analysis. The implementation is organized into 6 phases, prioritized by impact and dependency order.

---

## Phase 1: Security & Authentication Hardening (Score Impact: +10%)

### Task 1.1: Complete JWT Authentication Integration
**Files to modify:**
- `frontend/app/admin/live-chat/page.tsx` - Get adminId from auth context
- `frontend/lib/websocket/client.ts` - Send JWT token on auth
- `backend/app/api/v1/endpoints/ws_live_chat.py` - Validate JWT token

**Implementation:**
```typescript
// Frontend: Replace hardcoded adminId
const { user } = useAuth();
const adminId = user?.id;

// WebSocket auth with JWT
ws.send(JSON.stringify({
    type: 'auth',
    payload: { token: user.accessToken }
}));
```

```python
# Backend: Validate JWT in auth handler
async def handle_auth(websocket, payload, db):
    token = payload.get("token")
    if token:
        admin = await verify_jwt_token(token, db)
        if not admin:
            await websocket.send_json({"type": "auth_error", "payload": {"message": "Invalid token"}})
            return
    # Continue with existing logic
```

### Task 1.2: Implement Audit Logging
**Files to create:**
- `backend/app/models/audit_log.py` - AuditLog model

**Files to modify:**
- `backend/app/services/live_chat_service.py` - Log admin actions
- `backend/alembic/versions/` - Migration for audit_log table

**Implementation:**
```python
# backend/app/models/audit_log.py
class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True)
    admin_id = Column(Integer, ForeignKey("users.id"))
    action = Column(String(50))  # claim_session, close_session, send_message, etc.
    resource_type = Column(String(50))  # chat_session, message, etc.
    resource_id = Column(String(100))
    details = Column(JSONB)
    ip_address = Column(String(50))
    created_at = Column(DateTime, default=datetime.utcnow)
```

### Task 1.3: Session Timeout & Auto-Logout
**Files to modify:**
- `frontend/hooks/useAuth.ts` - Add activity tracking
- `frontend/components/admin/SessionTimeoutWarning.tsx` - Create warning modal
- `backend/app/core/security.py` - Add token expiry validation

**Implementation:**
- Track last activity timestamp
- Show warning 5 minutes before timeout (30 min default)
- Auto-logout after inactivity threshold

---

## Phase 2: Enhanced Handoff Workflow (Score Impact: +12%)

### Task 2.1: Keyword-Based Handoff Triggers
**Files to modify:**
- `backend/app/api/v1/endpoints/webhook.py` - Add keyword detection
- `backend/app/services/live_chat_service.py` - initiate_handoff helper

**Implementation:**
```python
# webhook.py - Add before intent matching
HANDOFF_KEYWORDS = [
    "agent", "human", "operator", "staff",
    "พูดกับเจ้าหน้าที่", "ติดต่อเจ้าหน้าที่", "ขอคุยกับคน",
    "ต้องการความช่วยเหลือ", "ขอติดต่อแอดมิน"
]

async def handle_message_event(event: MessageEvent, db: AsyncSession):
    text = event.message.text.strip().lower()

    # Check for handoff request BEFORE intent matching
    if any(kw in text for kw in HANDOFF_KEYWORDS):
        user = await friend_service.get_or_create_user(line_user_id, db)
        if user.chat_mode == ChatMode.BOT:
            await live_chat_service.initiate_handoff(user, event.reply_token, db)
            return

    # Continue with existing intent matching...
```

### Task 2.2: Queue Position & Wait Time Display
**Files to modify:**
- `backend/app/services/live_chat_service.py` - Add queue position calculation
- `backend/app/api/v1/endpoints/admin_live_chat.py` - Add queue info endpoint
- `frontend/app/admin/live-chat/page.tsx` - Display queue position

**Implementation:**
```python
# live_chat_service.py
async def get_queue_position(session_id: int, db: AsyncSession) -> dict:
    """Calculate queue position for a waiting session"""
    stmt = select(ChatSession).where(
        ChatSession.status == SessionStatus.WAITING,
        ChatSession.created_at <= select(ChatSession.created_at).where(ChatSession.id == session_id).scalar_subquery()
    ).order_by(ChatSession.created_at)
    result = await db.execute(stmt)
    sessions = result.scalars().all()

    position = next((i + 1 for i, s in enumerate(sessions) if s.id == session_id), 0)
    avg_wait_time = await self._calculate_avg_wait_time(db)

    return {
        "position": position,
        "estimated_wait_seconds": position * avg_wait_time
    }
```

### Task 2.3: Business Hours Handling
**Files to create:**
- `backend/app/models/business_hours.py` - BusinessHours model

**Files to modify:**
- `backend/app/services/live_chat_service.py` - Check business hours
- `backend/app/api/v1/endpoints/admin_settings.py` - CRUD for business hours

**Implementation:**
```python
# business_hours.py
class BusinessHours(Base):
    __tablename__ = "business_hours"

    id = Column(Integer, primary_key=True)
    day_of_week = Column(Integer)  # 0=Monday, 6=Sunday
    open_time = Column(Time)
    close_time = Column(Time)
    is_active = Column(Boolean, default=True)

# live_chat_service.py
async def is_within_business_hours(self, db: AsyncSession) -> bool:
    now = datetime.now(timezone('Asia/Bangkok'))
    day = now.weekday()
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
```

---

## Phase 3: Operator Productivity Features (Score Impact: +10%)

### Task 3.1: Canned Responses / Quick Replies
**Files to create:**
- `backend/app/models/canned_response.py` - CannedResponse model
- `backend/app/api/v1/endpoints/admin_canned_responses.py` - CRUD endpoints
- `frontend/components/admin/CannedResponsePicker.tsx` - UI component

**Files to modify:**
- `frontend/app/admin/live-chat/page.tsx` - Integrate picker

**Implementation:**
```python
# canned_response.py
class CannedResponse(Base):
    __tablename__ = "canned_responses"

    id = Column(Integer, primary_key=True)
    shortcut = Column(String(20), unique=True)  # e.g., "/greeting"
    title = Column(String(100))
    content = Column(Text)
    category = Column(String(50))
    is_active = Column(Boolean, default=True)
    created_by = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime, default=datetime.utcnow)
```

```typescript
// CannedResponsePicker.tsx
interface CannedResponsePickerProps {
    onSelect: (content: string) => void;
    filter?: string;
}

export function CannedResponsePicker({ onSelect, filter }: CannedResponsePickerProps) {
    const [responses, setResponses] = useState<CannedResponse[]>([]);
    const [searchTerm, setSearchTerm] = useState(filter || '');

    // Keyboard shortcut: "/" opens picker
    // Type shortcut like "/greeting" to quick-insert
}
```

### Task 3.2: Notification Sounds
**Files to create:**
- `frontend/public/sounds/new-message.mp3` - Sound file
- `frontend/hooks/useNotificationSound.ts` - Sound hook

**Files to modify:**
- `frontend/app/admin/live-chat/page.tsx` - Play sound on new message

**Implementation:**
```typescript
// useNotificationSound.ts
export function useNotificationSound() {
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const [enabled, setEnabled] = useState(true);

    useEffect(() => {
        audioRef.current = new Audio('/sounds/new-message.mp3');
        audioRef.current.volume = 0.5;
    }, []);

    const play = useCallback(() => {
        if (enabled && audioRef.current) {
            audioRef.current.currentTime = 0;
            audioRef.current.play().catch(() => {});
        }
    }, [enabled]);

    return { play, enabled, setEnabled };
}

// In live-chat page
const { play: playNotificationSound } = useNotificationSound();

const handleNewMessage = useCallback((data) => {
    if (data.direction === 'INCOMING' && data.line_user_id !== selectedIdRef.current) {
        playNotificationSound();
    }
}, [playNotificationSound]);
```

### Task 3.3: Operator Transfer / Reassignment
**Files to modify:**
- `backend/app/services/live_chat_service.py` - Add transfer_session method
- `backend/app/api/v1/endpoints/ws_live_chat.py` - Add transfer_session event
- `frontend/lib/websocket/types.ts` - Add TRANSFER_SESSION event
- `frontend/app/admin/live-chat/page.tsx` - Add transfer UI

**Implementation:**
```python
# live_chat_service.py
async def transfer_session(
    self,
    session_id: int,
    from_operator_id: int,
    to_operator_id: int,
    db: AsyncSession
) -> ChatSession:
    """Transfer session to another operator"""
    session = await self._get_session(session_id, db)

    if session.operator_id != from_operator_id:
        raise ValueError("Only current operator can transfer session")

    session.operator_id = to_operator_id
    session.transferred_at = datetime.utcnow()
    session.transfer_count = (session.transfer_count or 0) + 1

    await db.commit()

    # Notify both operators via WebSocket
    await ws_manager.broadcast_to_room(
        ws_manager.get_room_id(session.line_user_id),
        {"type": "session_transferred", "payload": {...}}
    )

    return session
```

---

## Phase 4: Metrics & Analytics (Score Impact: +15%)

### Task 4.1: CSAT Survey Collection
**Files to create:**
- `backend/app/models/csat_response.py` - CSATResponse model
- `backend/app/services/csat_service.py` - CSAT collection service

**Files to modify:**
- `backend/app/services/live_chat_service.py` - Send survey on close
- `backend/app/api/v1/endpoints/webhook.py` - Handle CSAT postback

**Implementation:**
```python
# csat_response.py
class CSATResponse(Base):
    __tablename__ = "csat_responses"

    id = Column(Integer, primary_key=True)
    session_id = Column(Integer, ForeignKey("chat_sessions.id"))
    line_user_id = Column(String(50))
    rating = Column(Integer)  # 1-5
    feedback = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

# live_chat_service.py - In close_session
async def close_session(self, ...):
    # ... existing close logic ...

    # Send CSAT survey via LINE
    csat_flex = build_csat_survey_flex(session.id)
    await line_service.push_messages(line_user_id, [csat_flex])

# webhook.py - Handle CSAT postback
async def handle_postback_event(event: PostbackEvent, db: AsyncSession):
    data = event.postback.data

    if data.startswith("csat_"):
        # Parse: csat_session_{id}_rating_{1-5}
        parts = data.split("_")
        session_id = int(parts[2])
        rating = int(parts[4])
        await csat_service.record_rating(session_id, line_user_id, rating, db)
        await line_service.reply_text(event.reply_token, "ขอบคุณสำหรับความคิดเห็นครับ")
        return
```

### Task 4.2: FCR (First Contact Resolution) Calculation
**Files to modify:**
- `backend/app/models/chat_session.py` - Add resolution tracking fields
- `backend/app/services/analytics_service.py` - FCR calculation

**Implementation:**
```python
# chat_session.py - Add fields
class ChatSession(Base):
    # ... existing fields ...
    is_first_contact_resolution = Column(Boolean, default=True)
    reopened_count = Column(Integer, default=0)

# analytics_service.py
async def calculate_fcr_rate(
    self,
    start_date: date,
    end_date: date,
    operator_id: Optional[int],
    db: AsyncSession
) -> float:
    """Calculate First Contact Resolution rate"""
    stmt = select(
        func.count(ChatSession.id).filter(ChatSession.is_first_contact_resolution == True),
        func.count(ChatSession.id)
    ).where(
        ChatSession.status == SessionStatus.CLOSED,
        ChatSession.closed_at >= start_date,
        ChatSession.closed_at <= end_date
    )

    if operator_id:
        stmt = stmt.where(ChatSession.operator_id == operator_id)

    result = await db.execute(stmt)
    fcr_count, total = result.one()

    return (fcr_count / total * 100) if total > 0 else 0
```

### Task 4.3: Real-Time Analytics Dashboard
**Files to create:**
- `frontend/app/admin/live-chat/analytics/page.tsx` - Analytics page
- `frontend/components/admin/LiveKPICards.tsx` - Real-time KPI display
- `backend/app/api/v1/endpoints/admin_analytics.py` - Analytics endpoints

**Implementation:**
```typescript
// LiveKPICards.tsx
interface KPIData {
    waiting_count: number;
    active_count: number;
    avg_first_response_seconds: number;
    avg_resolution_seconds: number;
    csat_average: number;
    fcr_rate: number;
}

export function LiveKPICards() {
    const [kpis, setKpis] = useState<KPIData | null>(null);

    useEffect(() => {
        const fetchKPIs = async () => {
            const res = await fetch(`${API_BASE}/admin/analytics/live-kpis`);
            setKpis(await res.json());
        };

        fetchKPIs();
        const interval = setInterval(fetchKPIs, 30000); // Refresh every 30s
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="grid grid-cols-6 gap-4">
            <KPICard title="Waiting" value={kpis?.waiting_count} icon={Clock} />
            <KPICard title="Active" value={kpis?.active_count} icon={MessageSquare} />
            <KPICard title="Avg FRT" value={formatDuration(kpis?.avg_first_response_seconds)} icon={Timer} />
            <KPICard title="Avg Resolution" value={formatDuration(kpis?.avg_resolution_seconds)} icon={CheckCircle} />
            <KPICard title="CSAT" value={`${kpis?.csat_average?.toFixed(1)}/5`} icon={Star} />
            <KPICard title="FCR" value={`${kpis?.fcr_rate?.toFixed(0)}%`} icon={Target} />
        </div>
    );
}
```

---

## Phase 5: Reliability & Scalability (Score Impact: +8%)

### Task 5.1: Duplicate Webhook Event Detection
**Files to modify:**
- `backend/app/api/v1/endpoints/webhook.py` - Add deduplication
- `backend/app/core/redis.py` - Redis helper for dedup

**Implementation:**
```python
# webhook.py
async def process_webhook_events(events):
    async with AsyncSessionLocal() as db:
        for event in events:
            # Deduplicate using webhookEventId
            event_id = getattr(event, 'webhook_event_id', None)
            if event_id:
                redis_key = f"webhook_event:{event_id}"
                if await redis_client.exists(redis_key):
                    logger.info(f"Duplicate event {event_id}, skipping")
                    continue
                await redis_client.setex(redis_key, 300, "1")  # 5 min TTL

            # Process event...
```

### Task 5.2: Redis Pub/Sub for Horizontal Scaling
**Files to create:**
- `backend/app/core/pubsub_manager.py` - Redis Pub/Sub manager

**Files to modify:**
- `backend/app/core/websocket_manager.py` - Integrate pub/sub

**Implementation:**
```python
# pubsub_manager.py
class PubSubManager:
    def __init__(self):
        self.redis = None
        self.pubsub = None

    async def connect(self):
        self.redis = await aioredis.from_url(settings.REDIS_URL)
        self.pubsub = self.redis.pubsub()

    async def publish(self, channel: str, message: dict):
        await self.redis.publish(channel, json.dumps(message))

    async def subscribe(self, channel: str, callback):
        await self.pubsub.subscribe(channel)
        async for message in self.pubsub.listen():
            if message['type'] == 'message':
                await callback(json.loads(message['data']))

# websocket_manager.py - Modify broadcast methods
class ConnectionManager:
    async def broadcast_to_all(self, data: dict):
        # Local broadcast
        for admin_id, connections in self.connections.items():
            for ws in connections:
                await ws.send_json(data)

        # Publish to Redis for other servers
        await pubsub_manager.publish("live_chat:broadcast", data)
```

### Task 5.3: Auto-Close Inactive Sessions
**Files to create:**
- `backend/app/tasks/session_cleanup.py` - Celery task for cleanup

**Files to modify:**
- `backend/app/core/celery_app.py` - Register task
- `backend/app/services/live_chat_service.py` - Add auto-close logic

**Implementation:**
```python
# session_cleanup.py
from celery import shared_task

@shared_task
async def cleanup_inactive_sessions():
    """Auto-close sessions inactive for more than 30 minutes"""
    async with AsyncSessionLocal() as db:
        threshold = datetime.utcnow() - timedelta(minutes=30)

        stmt = select(ChatSession).where(
            ChatSession.status == SessionStatus.ACTIVE,
            ChatSession.last_activity_at < threshold
        )
        result = await db.execute(stmt)
        inactive_sessions = result.scalars().all()

        for session in inactive_sessions:
            await live_chat_service.close_session(
                line_user_id=session.line_user_id,
                closed_by="system_auto_close",
                db=db
            )
            logger.info(f"Auto-closed inactive session {session.id}")
```

---

## Phase 6: Enhanced Admin Dashboard (Score Impact: +5%)

### Task 6.1: Comprehensive KPI Display
**Files to modify:**
- `frontend/app/admin/live-chat/page.tsx` - Add KPI header section

**Implementation:**
```typescript
// Add to live-chat page header
<div className="grid grid-cols-4 gap-4 mb-6">
    <StatCard
        title="Waiting"
        value={stats.waiting}
        icon={<Clock />}
        trend={stats.waitingTrend}
    />
    <StatCard
        title="Active Chats"
        value={stats.active}
        icon={<MessageSquare />}
    />
    <StatCard
        title="Avg First Response"
        value={formatTime(stats.avgFRT)}
        icon={<Timer />}
        target="< 60s"
    />
    <StatCard
        title="Today's CSAT"
        value={`${stats.csat.toFixed(1)}/5`}
        icon={<Star />}
    />
</div>
```

### Task 6.2: Analytics Export
**Files to create:**
- `backend/app/api/v1/endpoints/admin_reports.py` - Report generation
- `frontend/app/admin/reports/page.tsx` - Reports page

**Implementation:**
```python
# admin_reports.py
@router.get("/reports/export")
async def export_analytics(
    start_date: date,
    end_date: date,
    format: str = "csv",
    db: AsyncSession = Depends(get_db)
):
    """Export analytics data as CSV or Excel"""
    data = await analytics_service.get_report_data(start_date, end_date, db)

    if format == "csv":
        return StreamingResponse(
            generate_csv(data),
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename=report_{start_date}_{end_date}.csv"}
        )
    elif format == "xlsx":
        return StreamingResponse(
            generate_excel(data),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f"attachment; filename=report_{start_date}_{end_date}.xlsx"}
        )
```

---

## Database Migrations Required

```bash
# Create migrations for new tables
alembic revision --autogenerate -m "add_audit_logs_table"
alembic revision --autogenerate -m "add_business_hours_table"
alembic revision --autogenerate -m "add_canned_responses_table"
alembic revision --autogenerate -m "add_csat_responses_table"
alembic revision --autogenerate -m "add_session_fcr_fields"

# Apply all migrations
alembic upgrade head
```

---

## Testing Requirements

### Unit Tests
- `test_handoff_keywords.py` - Test keyword detection
- `test_business_hours.py` - Test hours validation
- `test_csat_service.py` - Test CSAT recording
- `test_fcr_calculation.py` - Test FCR metrics
- `test_audit_logging.py` - Test action logging

### Integration Tests
- `test_full_handoff_flow.py` - End-to-end handoff with keywords
- `test_session_transfer.py` - Operator transfer flow
- `test_csat_collection.py` - Survey flow via LINE

### Load Tests
- WebSocket connection scaling
- Redis Pub/Sub performance
- Concurrent session handling

---

## Implementation Order

| Phase | Tasks | Est. Effort | Dependencies |
|-------|-------|-------------|--------------|
| 1 | Security & Auth | 3 days | None |
| 2 | Handoff Workflow | 3 days | Phase 1 |
| 3 | Operator Features | 2 days | Phase 1 |
| 4 | Metrics & Analytics | 4 days | Phase 2, 3 |
| 5 | Reliability | 3 days | Phase 4 |
| 6 | Dashboard Enhancements | 2 days | Phase 4 |

---

## Compliance Score Projection

| Category | Current | After Implementation |
|----------|---------|---------------------|
| Messaging API | 85% | 95% |
| Live Chat Architecture | 80% | 95% |
| Bot-to-Human Handoff | 70% | 100% |
| WebSocket Real-Time | 85% | 100% |
| Admin Dashboard | 65% | 95% |
| Operator Console UX | 70% | 100% |
| Security & Access | 60% | 95% |
| Performance Metrics | 40% | 100% |
| **Overall** | **69%** | **97%** |

Note: 100% is aspirational. Some features like MFA may be deferred based on business requirements. The plan achieves near-complete compliance with all critical features.

---

## Success Criteria

- [ ] All keyword handoff triggers working
- [ ] JWT auth fully integrated frontend-to-backend
- [ ] Audit logs capturing all admin actions
- [ ] CSAT surveys sent and responses recorded
- [ ] Real-time KPI dashboard operational
- [ ] Canned responses usable by operators
- [ ] Notification sounds playing for new messages
- [ ] Session transfer between operators working
- [ ] Business hours enforced for handoff
- [ ] FCR and other metrics calculated accurately
- [ ] Redis Pub/Sub enabling horizontal scaling
- [ ] Duplicate webhook events filtered
- [ ] Analytics export functional

---

*Plan created: February 5, 2026*
*Reference: JskApp_LiveChat_Compliance_Analysis.md*
