# Plan: Phase 6 — Operator UX (Multi-operator, Must) + Backend

## Summary

ปิด 4 finding ระดับ Must ของการทำงานหลาย operator บนหน้า `admin/live-chat` พร้อม backend dependency ที่ scope แคบ:

- **H2** — แทน `<input type="number">` ใน TransferDialog ด้วย **searchable operator picker** (ชื่อ, avatar, สถานะ online/away, จำนวน active chats) สำหรับ online operators (จาก presence) + offline operators (จาก roster endpoint); เก็บ raw numeric ID เป็น advanced fallback
- **M16** — claim contention UI: แสดง "X กำลังรับเรื่อง..." inline, disable Claim ของ operator อื่น, จัดการ already-claimed error ใน-context, ใส่ชื่อห้อง (display_name) ใน toast
- **M17** — ownership banner: ถ้า session ถูก operator คนอื่นถือ → composer แสดง "Claimed by X — take over?" banner แทนการพิมพ์ได้เงียบ ๆ
- **M15** — waiting-time badge บน ConversationItem (amber ≥5 นาที, red ≥15 นาที) จาก `session.started_at` + ตัวเลือก "sort by longest waiting"
- **Backend (scoped)** — (1) broadcast `presence_update` ตอน register/disconnect, (2) enrich `display_name` ใน presence payload, (3) roster endpoint สำหรับ offline operators (reuse `/admin/users/workload`), (4) ยืนยัน transfer error mapping → 400/403 (ส่วนใหญ่ทำแล้ว — เหลือ harden ที่ service)

ฐานสถาปัตยกรรม (WebSocket layer, Zustand store, claim atomic guard, `_require_active_session_owner`) แข็งแรงอยู่แล้ว — งานนี้คือ "wire presence + ขัดเงา UX + ปิดช่องโหว่"

## User Story

ในฐานะ operator ของหน่วยงานยุติธรรมชุมชนที่เปิด console พร้อมเพื่อนหลายคน ฉันต้องการ (1) เห็นว่าใครในคิวรอนานสุด, (2) รับสายโดยรู้ทันทีถ้าเพื่อน claim ไปแล้ว, (3) ไม่พิมพ์ข้อความลงห้องที่ไม่ใช่ของฉันโดยไม่รู้ตัว, และ (4) โอนสายโดยเลือกชื่อปลายทาง (ทั้ง online และ offline) แทนการจำ/พิมพ์ ID — เพื่อให้ลูกค้าได้รับการดูแลเร็ว ถูกคน และไม่มีใครตกหล่น

## Problem → Solution

| Finding | Problem (ปัจจุบัน) | Solution |
|---------|--------------------|----------|
| H2 | `TransferDialog.tsx:62` ใช้ `<input type="number" placeholder="Enter operator ID">` — ต้องจำ ID; `onPresenceUpdate` ไม่ถูก wire ใน `LiveChatContext` (callback มีใน hook signature `useLiveChatSocket.ts:32,73,133-136` แต่ไม่ถูกส่งเข้าไป) | Wire `onPresenceUpdate` → เก็บ online operators ใน context; เพิ่ม roster fetch สำหรับ offline; เปลี่ยน TransferDialog เป็น searchable picker (ชื่อ+avatar+status+active_chats) + advanced fallback เป็น numeric ID |
| M16 | `LiveChatContext.tsx:589-612` `claimSession` ตั้ง local `claiming` แล้วรอ `onSessionClaimed` broadcast — ไม่มี lock แสดงให้คนอื่น, ไม่มี already-claimed handling เฉพาะ; toast ที่ `408-412` generic (`Operator #N`) ไม่มีชื่อห้อง | เพิ่ม state `claimingByOperator` per-conversation (จาก SESSION_CLAIMED broadcast); SessionActions disable Claim + แสดง "X กำลังรับเรื่อง..." เมื่อมีคนอื่น claim; map WS error "already claimed" เป็น in-context toast พร้อม display_name |
| M17 | `MessageInput.tsx:188,206` composer gate แค่ `!isHumanMode\|\|sending` — session ที่ operator คนอื่นถืออยู่ก็ยังพิมพ์ได้ | เทียบ `currentChat.session.operator_id` กับ current user id; ถ้าไม่ใช่ owner → แสดง "Claimed by X — take over?" banner และ disable composer (take-over = transfer มาที่ตัวเอง) |
| M15 | `ConversationItem.tsx:78-80` แสดงแค่ relative last-message time — ไม่มีเวลารอในคิว; `session.started_at` มีอยู่ (`_types.ts:6`) | เพิ่ม waiting-time badge จาก `started_at` (amber ≥5 นาที, red ≥15 นาที) + ตัวเลือก sort "longest waiting" ใน ConversationList |
| BE-1 | `ws_live_chat.py:178-182` presence ส่งผ่าน `send_personal()` ครั้งเดียวตอน auth — ไม่ broadcast เมื่อมีคน register/disconnect | เพิ่ม `broadcast_to_all(presence_update)` ใน `register()`/`disconnect()` ของ `websocket_manager.py` |
| BE-2 | `websocket_manager.py:327-358` `get_online_admins()` คืนแค่ `{id,status,active_chats}` — ไม่มี `display_name` | enrich payload ด้วย `display_name` (lookup จาก DB / cache) |
| BE-3 | ไม่มี endpoint คืน operator offline สำหรับ picker | reuse `/admin/users/workload` (มี `id`, `display_name`, `role`, `active_tasks` แล้ว — `admin_users.py:215-283`) |
| BE-4 | `live_chat_service.py:375-378` `transfer_session` raise `ValueError` (→ 500 ถ้า caller ไม่ดัก) | REST endpoint `admin_live_chat.py:315-321` + WS handler `ws_live_chat.py:628-636` ดัก ValueError → 400/403/404 อยู่แล้ว; งานคือ **verify** + เพิ่มเทสยืนยัน mapping |

## Metadata

- **Complexity**: Large
- **Source PRD**: `D:/genAI/jsk-app/.claude/PRPs/prds/livechat-audit-remediation.prd.md`
- **PRD Phase**: Phase 6 — Operator UX (Multi-operator, Must)
- **Estimated Files**: 14 (FE: 8 changed/created; BE: 4 changed; tests: 2 created)
- **backendTouch**: true
- **Q2 default applied**: waiting SLA amber = 5 นาที (300s), red = 15 นาที (900s)
- **Q1 resolved**: รองรับ offline transfer = ใช่

## UX Design

### TransferDialog — Before/After (H2)

```
BEFORE                                  AFTER
┌─────────────────────────────┐        ┌──────────────────────────────────────┐
│ ⇄ Transfer Session          │        │ ⇄ Transfer Session                    │
│                             │        │ ┌──────────────────────────────────┐ │
│ Operator ID                 │        │ │ 🔍 Search operator...            │ │
│ ┌─────────────────────────┐ │        │ └──────────────────────────────────┘ │
│ │ Enter operator ID       │ │   →    │ ● [av] สมชาย ใจดี    online · 2 chats│ │
│ └─────────────────────────┘ │        │ ○ [av] สมหญิง ดี     away   · 0 chats│ │
│ Reason (optional)           │        │ ◌ [av] อนุชา (offline)               │ │
│ ┌─────────────────────────┐ │        │ ─────────────────────────────────────│ │
│ │ Why transfer?           │ │        │ Reason (optional) [____________]      │ │
│ └─────────────────────────┘ │        │ ▸ Advanced: enter ID manually [__]    │ │
│        [Cancel] [Transfer]  │        │              [Cancel] [Transfer]      │ │
└─────────────────────────────┘        └──────────────────────────────────────┘
```

### Claim contention (M16) — SessionActions inline

```
operator A's view (claimed it):  [✓ Claiming...]
operator B's view (after A claimed): [🔒 สมชาย กำลังรับเรื่อง...]  (Claim disabled)
operator B clicks Claim before broadcast → toast: "สมชาย รับเรื่อง 'คุณลูกค้า X' ไปแล้ว"
```

### Ownership banner (M17) — above MessageInput composer

```
┌────────────────────────────────────────────────────────┐
│ 🔒 Claimed by สมชาย ใจดี   ห้องนี้กำลังถูกดูแลโดยคนอื่น  [ รับช่วงต่อ ] │
└────────────────────────────────────────────────────────┘
[ composer disabled / grayscale ]
```

### Waiting-time badge (M15) — ConversationItem

```
[av] คุณลูกค้า X            2m       ← last-message time (unchanged)
     สวัสดีครับ...   [Bot] [⏱ 7m]    ← NEW amber badge (≥5m)
[av] คุณลูกค้า Y            1m
     ช่วยด้วย...    [Manual][⏱ 18m]   ← NEW red badge (≥15m)
```

## Mandatory Reading

| Priority | File | Lines | Why |
|----------|------|-------|-----|
| P0 | `frontend/app/admin/live-chat/_context/LiveChatContext.tsx` | 49-81, 368-445, 589-680, 759-791 | Context value shape, socket wiring (onPresenceUpdate missing), claim/transfer methods, value object — ทุก state ใหม่ต้องเพิ่มที่นี่ |
| P0 | `frontend/hooks/useLiveChatSocket.ts` | 20-37, 60-78, 133-164 | `onPresenceUpdate` callback มีแล้วใน signature แต่ไม่ถูกส่งจาก context; PRESENCE_UPDATE case แปลง payload.operators |
| P0 | `frontend/app/admin/live-chat/_components/TransferDialog.tsx` | ทั้งไฟล์ (1-73) | จุดแก้ H2; focus-trap + Escape pattern ที่ต้องคงไว้ |
| P0 | `frontend/lib/websocket/types.ts` | 118-124, 143-149 | `PresencePayload` (ต้องเพิ่ม display_name), `SessionTransferredPayload` |
| P0 | `frontend/app/admin/live-chat/_types.ts` | 1-34 | `Session.started_at`, `Session.operator_id` มีแล้ว; เพิ่ม operator roster type |
| P1 | `frontend/app/admin/live-chat/_components/MessageInput.tsx` | 25-39, 96-122, 180-213 | composer gate `!isHumanMode\|\|sending`; ต้องเพิ่ม ownership banner + gate |
| P1 | `frontend/app/admin/live-chat/_components/SessionActions.tsx` | ทั้งไฟล์ (1-43) | Claim/Transfer/Done buttons — จุดแก้ M16 (disable + label) |
| P1 | `frontend/app/admin/live-chat/_components/ConversationItem.tsx` | 17-31, 78-105 | badge area; เพิ่ม waiting-time badge |
| P1 | `frontend/app/admin/live-chat/_components/ConversationList.tsx` | 41-80, 121-135, 216-231 | filteredConversations memo, filterButtons, list render — จุดแก้ M15 sort |
| P1 | `frontend/app/admin/live-chat/_components/ChatHeader.tsx` | 30-49, 94-133 | ส่ง ownership info ผ่านไป SessionActions/composer |
| P1 | `frontend/app/admin/live-chat/_components/ChatArea.tsx` | 330-346 | MessageInput props wiring; เพิ่ม ownership props |
| P1 | `frontend/app/admin/live-chat/_components/LiveChatShell.tsx` | 11-28, 77-81 | TransferDialog mount + onTransfer wiring; ต้องส่ง operator lists เข้า dialog |
| P0 | `backend/app/core/websocket_manager.py` | 92-141, 327-358, 308-322 | `register`/`disconnect` (เพิ่ม broadcast), `get_online_admins` (enrich display_name), `broadcast_to_all` |
| P0 | `backend/app/api/v1/endpoints/ws_live_chat.py` | 166-191, 443-504, 569-647, 656-666 | auth presence send_personal, claim handler, transfer handler (ValueError→VALIDATION_ERROR แล้ว), disconnect call |
| P1 | `backend/app/services/live_chat_service.py` | 363-394 | `transfer_session` raises ValueError; logic ของ transfer |
| P1 | `backend/app/api/v1/endpoints/admin_live_chat.py` | 299-351 | REST transfer endpoint — ValueError→404/403/400 mapping (มีแล้ว) |
| P1 | `backend/app/api/v1/endpoints/admin_users.py` | 215-283 | `/admin/users/workload` — reuse เป็น roster (id, display_name, role, active_tasks) |
| P2 | `backend/app/models/user.py` | 39-48 | `User.display_name` (nullable) — ใช้ enrich presence |
| P2 | `frontend/lib/__tests__/timeline-merge.test.ts` | 1-40 | test structure (vitest, AAA, pure-function) ที่ต้อง mirror |

## Patterns to Mirror

### 1. Socket callback wiring (where onPresenceUpdate must be added)

```typescript
// SOURCE: LiveChatContext.tsx:380-431 — callbacks passed into useLiveChatSocket
const { joinRoom, leaveRoom, ... } = useLiveChatSocket({
  adminId,
  token: token ?? undefined,
  onNewMessage: handleNewMessage,
  onSessionClaimed: (lineUserId, operatorId) => { /* ... */ },
  onConversationUpdate: handleConversationUpdate,
  // NOTE: onPresenceUpdate is NOT here — must add it
});
```

```typescript
// SOURCE: useLiveChatSocket.ts:133-136 — PRESENCE_UPDATE already dispatches; just unused
case MessageType.PRESENCE_UPDATE:
  const presencePayload = data.payload as PresencePayload;
  onPresenceUpdate?.(presencePayload.operators);
  break;
```

### 2. Notification toast pattern (for already-claimed, M16)

```typescript
// SOURCE: LiveChatContext.tsx:604-608 — error → in-context toast
getStore().addNotification({
  title: 'Claim unavailable',
  message: error instanceof Error && error.message ? error.message : 'Failed to claim session.',
  type: 'system',
});
```
`addNotification` signature: `Omit<ToastNotification,'id'|'timestamp'>` with `type: 'message' | 'system'` (SOURCE: `liveChatStore.ts:14,86,193`).

### 3. Reading backend error message (claim/transfer)

```typescript
// SOURCE: LiveChatContext.tsx:116-137 — robust error extraction (JSON detail/message/error → text → fallback)
const readErrorMessage = async (response: Response, fallbackMessage: string): Promise<string> => {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try {
      const payload = await response.clone().json();
      if (typeof payload?.detail === 'string' && payload.detail.trim()) return payload.detail;
      // ...
    } catch { /* fall through */ }
  }
  // ...
  return fallbackMessage;
};
```

### 4. Dialog focus-trap + Escape (KEEP in new TransferDialog)

```typescript
// SOURCE: TransferDialog.tsx:16-41 — must preserve focus trap when swapping input → picker
useEffect(() => {
  if (!open) return;
  firstFieldRef.current?.focus();
  const trapFocus = (event: KeyboardEvent) => {
    if (event.key === 'Escape') { onClose(); return; }
    if (event.key !== 'Tab' || !dialogRef.current) return;
    const focusable = dialogRef.current.querySelectorAll<HTMLElement>('button, input');
    // ... wrap first/last
  };
  document.addEventListener('keydown', trapFocus);
  return () => document.removeEventListener('keydown', trapFocus);
}, [open, onClose]);
```

### 5. memo'd presentational component (ConversationItem badge area)

```tsx
// SOURCE: ConversationItem.tsx:86-97 — badge row where waiting badge goes
<div className="flex items-center gap-1.5 flex-shrink-0">
  <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-medium ${...}`}>
    {isBot ? <Bot className="w-2.5 h-2.5" /> : <User className="w-2.5 h-2.5" />}
    {isBot ? 'Bot' : 'Manual'}
  </span>
  {/* waiting badge inserted here */}
</div>
```

### 6. Backend presence broadcast helper (already exists — call it)

```python
# SOURCE: websocket_manager.py:308-322 — broadcast_to_all (Redis + local), call from register/disconnect
async def broadcast_to_all(self, data: dict, exclude_admin: Optional[str] = None):
    if self._pubsub_initialized:
        await pubsub_manager.publish(self.BROADCAST_CHANNEL, data)
    await self._broadcast_local(data, exclude_admin)
```

### 7. Backend transfer ValueError → HTTP mapping (already done — mirror for verification)

```python
# SOURCE: admin_live_chat.py:315-321 — ValueError → 404/403/400
except ValueError as e:
    detail = str(e)
    if "No active session found" in detail:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=detail)
    if "Only the current operator" in detail:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=detail)
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)
```

### 8. Backend roster endpoint to reuse (offline operators)

```python
# SOURCE: admin_users.py:215-283 — /admin/users/workload returns id, display_name, role, active_tasks
@router.get("/workload", response_model=List[UserWorkload])
async def list_user_workload(role: Optional[UserRole] = None, search: Optional[str] = None, ...):
    # returns UserWorkload(id, display_name, role, active_tasks, ...)
```

### 9. Test structure (vitest, AAA, pure function)

```typescript
// SOURCE: lib/__tests__/timeline-merge.test.ts:1-29
import { describe, it, expect } from 'vitest';
import { mergeTimeline } from '../timeline-merge';

describe('mergeTimeline', () => {
  it('interleaves audits between comments in chronological order', () => {
    const comments = [/* arrange */];
    const audits = [/* arrange */];
    const result = mergeTimeline(comments, audits); // act
    expect(result.map((i) => i.kind)).toEqual(['comment', 'audit', 'comment']); // assert
  });
});
```

## Files to Change

| File | Action | Justification |
|------|--------|---------------|
| `frontend/lib/websocket/types.ts` | UPDATE | เพิ่ม `display_name`, `name` ใน `PresencePayload.operators[]` |
| `frontend/app/admin/live-chat/_types.ts` | UPDATE | เพิ่ม `OperatorOption` type (id, display_name, status, active_chats, online) |
| `frontend/lib/waiting-time.ts` | CREATE | pure helpers: `getWaitingSeconds(started_at)`, `getWaitingTier()` → 'normal'\|'amber'\|'red'; testable |
| `frontend/app/admin/live-chat/_context/LiveChatContext.tsx` | UPDATE | wire `onPresenceUpdate`; เก็บ `onlineOperators`, `claimingByOperator`; เพิ่ม `fetchRoster`, expose `currentUserId`, `onlineOperators`, `roster`, `claimContenders` ใน value |
| `frontend/app/admin/live-chat/_hooks/useOperatorRoster.ts` | CREATE | fetch + merge online (presence) + offline (`/admin/users/workload`) → `OperatorOption[]` |
| `frontend/app/admin/live-chat/_components/TransferDialog.tsx` | UPDATE | searchable operator picker + advanced numeric fallback (H2) |
| `frontend/app/admin/live-chat/_components/SessionActions.tsx` | UPDATE | disable Claim + "X กำลังรับเรื่อง..." inline (M16) |
| `frontend/app/admin/live-chat/_components/ConversationItem.tsx` | UPDATE | waiting-time badge จาก started_at (M15) |
| `frontend/app/admin/live-chat/_hooks/useConversations.ts` | UPDATE | เพิ่ม sort option 'longest-waiting' (M15) |
| `frontend/app/admin/live-chat/_components/ConversationList.tsx` | UPDATE | sort toggle UI + ส่ง sort เข้า useConversations (M15) |
| `frontend/app/admin/live-chat/_components/MessageInput.tsx` | UPDATE | ownership banner + composer gate by owner (M17) |
| `frontend/app/admin/live-chat/_components/ChatArea.tsx` | UPDATE | ส่ง ownership props (sessionOwnerId, ownerName, currentUserId) → MessageInput |
| `frontend/app/admin/live-chat/_components/LiveChatShell.tsx` | UPDATE | ส่ง `operators`/`roster` เข้า TransferDialog |
| `frontend/lib/__tests__/waiting-time.test.ts` | CREATE | unit tests สำหรับ tier thresholds (M15) |
| `backend/app/core/websocket_manager.py` | UPDATE | broadcast presence ตอน register/disconnect; enrich display_name ใน get_online_admins (BE-1, BE-2) |
| `backend/app/api/v1/endpoints/ws_live_chat.py` | UPDATE | trigger presence broadcast หลัง register/disconnect (BE-1) |
| `backend/app/services/live_chat_service.py` | UPDATE | (optional harden) ทำให้ ValueError messages match endpoint mapping keys (BE-4) |
| `backend/tests/test_transfer_session_errors.py` | CREATE | pytest ยืนยัน ValueError → 400/403/404 (BE-4) |

## NOT Building

- **ไม่ refactor backend นอก scope 4 ข้อ** — ไม่แตะ schema/migration/auth; ไม่เพิ่ม WebSocket message type ใหม่ (ใช้ `presence_update` เดิม)
- **ไม่สร้าง roster endpoint ใหม่** — reuse `/admin/users/workload` ที่มี `display_name`, `role`, `active_tasks` แล้ว
- **ไม่เพิ่ม presence heartbeat broadcast** — broadcast เฉพาะตอน state เปลี่ยน (register/disconnect) ตาม PRD risk mitigation; ไม่ broadcast ทุก ping
- **ไม่ทำ assignment auto-routing / load-balancing** — เกินขอบเขต remediation (Phase 7 Could)
- **ไม่ทำ a11y/motion/token งานของ Phase 2/3/4** — เฉพาะ semantics ที่จำเป็นต่อ feature ใหม่ (label, focus, disabled state) เท่านั้น
- **ไม่ทำ "take over" เป็น flow ใหม่** — take-over = เรียก `transferSession(currentUserId)` ที่มีอยู่ ไม่สร้าง endpoint ใหม่
- **ไม่แตะ message-list virtualization** — badge/banner อยู่นอก message list

## Step-by-Step Tasks

### Task 1 — [BE-2] Enrich presence payload with display_name

- **ACTION**: UPDATE `backend/app/core/websocket_manager.py` `get_online_admins()` (327-358)
- **IMPLEMENT**: หลังจากรวบ `admin_ids`/`admin_metadata` ให้ lookup `display_name` ต่อ admin. เพิ่ม in-memory cache `self.admin_display_names: dict[str,str]` ที่ populate ตอน `register()` (query `User.display_name` ครั้งเดียว ผ่าน `AsyncSessionLocal`). คืน field `display_name` (fallback = `f"Operator #{id}"`) และ alias `name` ในแต่ละ operator dict ทั้ง Redis path และ local path.
- **MIRROR**: payload shape เดิม `{"id","status","active_chats"}` (websocket_manager.py:339-345, 353-357) — เพิ่ม key เท่านั้น
- **IMPORTS**: `from app.db.session import AsyncSessionLocal` (เช็ค import path จริงใน ws_live_chat.py:455 `AsyncSessionLocal`); `from app.models.user import User`
- **GOTCHA**: `get_online_admins()` เป็น async และอาจถูกเรียกถี่ — อย่า query DB ในนั้น; ให้ cache display_name ตอน register แทน. `display_name` nullable (user.py:48) → ต้อง fallback. Redis path ใช้ `str(admin_id)` ระวัง type mismatch กับ cache key.
- **VALIDATE**: `cd backend && python -c "import app.core.websocket_manager"` (import ok) → `python -m pytest backend/tests -k presence -q` (ถ้ามี)

### Task 2 — [BE-1] Broadcast presence_update on register/disconnect

- **ACTION**: UPDATE `backend/app/core/websocket_manager.py` (`register` 92-110, `disconnect` 112-141) + `backend/app/api/v1/endpoints/ws_live_chat.py`
- **IMPLEMENT**: เพิ่ม method `async def broadcast_presence(self)` ใน manager ที่เรียก `await self.broadcast_to_all({"type": WSEventType.PRESENCE_UPDATE.value, "payload": {"operators": await self.get_online_admins()}, "timestamp": ...})`. เรียก `broadcast_presence()` ปลายของ `register()` และปลายของ `disconnect()`. (ทางเลือก: เรียกจาก ws_live_chat.py หลัง `ws_manager.register(...)` ที่บรรทัด 170 และก่อน/หลัง `ws_manager.disconnect(websocket)` ที่ 666 เพื่อเลี่ยง circular import ของ WSEventType — เลือกแบบที่ import สะอาดกว่า)
- **MIRROR**: `broadcast_to_all` (websocket_manager.py:308-315); presence payload shape (ws_live_chat.py:178-182)
- **IMPORTS**: ใน manager ต้องเข้าถึง `WSEventType` — ถ้าชนกับ import cycle ให้ใช้ string literal `"presence_update"` แทน enum
- **GOTCHA**: `disconnect()` ลบ admin ออกจาก `connections` ก่อน → ต้องเรียก `broadcast_presence()` **หลัง** cleanup เสร็จ เพื่อให้ list สะท้อนสถานะใหม่. broadcast ตอน register/disconnect เท่านั้น — ห้ามใส่ใน `touch_presence`/ping (PRD risk: loop/load). ใช้ try/except กัน broadcast ล้มทำให้ disconnect พัง
- **VALIDATE**: `cd backend && python -c "import app.api.v1.endpoints.ws_live_chat"`; manual 2-client (เปิด 2 WS, client B register → client A ได้ presence_update)

### Task 3 — [BE-3] Confirm /admin/users/workload usable as offline roster

- **ACTION**: READ-verify `backend/app/api/v1/endpoints/admin_users.py:215-283` (no code change unless gap found)
- **IMPLEMENT**: ยืนยันว่า endpoint คืน `id`, `display_name`, `role`, `active_tasks` และ auth = `get_current_admin`. ถ้า frontend ต้อง `status` (online/away) ให้ frontend คำนวณเองโดย merge กับ presence (ไม่แก้ backend). บันทึก decision: roster = workload endpoint (offline = ไม่อยู่ใน presence set)
- **MIRROR**: response shape `UserWorkload` (admin_users.py:267-279)
- **GOTCHA**: `get_current_admin` อาจ require role ADMIN+ — operator role AGENT อาจเข้าไม่ได้. เช็ค `deps.get_current_admin` vs `deps.get_current_staff`. ถ้า AGENT ต้องใช้ picker → อาจต้องผ่อน auth เป็น `get_current_staff` (เปลี่ยน 1 บรรทัดที่ admin_users.py:220) — **ยืนยันก่อนแก้**
- **VALIDATE**: `curl` (authed) `/api/v1/admin/users/workload` → array มี display_name

### Task 4 — [BE-4] Harden + test transfer_session error mapping

- **ACTION**: VERIFY `admin_live_chat.py:315-321` + `ws_live_chat.py:628-636`; CREATE `backend/tests/test_transfer_session_errors.py`
- **IMPLEMENT**: ตรวจว่า REST endpoint map ValueError → 404 ("No active session found"), 403 ("Only the current operator"), 400 (อื่น ๆ รวม "Cannot transfer to yourself", "Invalid target operator"). WS handler map → VALIDATION_ERROR (ws_live_chat.py:628-636) — OK. (Optional) ใน `live_chat_service.py:375-386` ทำให้ message strings เป็น constant เพื่อให้ mapping ไม่เปราะ. เพิ่มเทส pytest: mock service ให้ raise แต่ละ ValueError → assert status code ที่ถูกต้อง
- **MIRROR**: mapping block (admin_live_chat.py:315-321); pytest style ในโฟลเดอร์ `backend/tests/`
- **IMPORTS**: `import pytest`, `from fastapi import status`, `from httpx import AsyncClient` (ตามรูปแบบเทสที่มี)
- **GOTCHA**: service ใช้ `@audit_action` decorator (line 363) — เทสต้อง mock เลเยอร์ service ไม่ใช่ DB จริง. "Cannot transfer to yourself" (line 381) → 400 ถูกต้องแล้ว
- **VALIDATE**: `cd backend && python -m pytest tests/test_transfer_session_errors.py -q`

### Task 5 — [H2] Add presence types + wire onPresenceUpdate in context

- **ACTION**: UPDATE `frontend/lib/websocket/types.ts:118-124`; UPDATE `frontend/app/admin/live-chat/_types.ts`; UPDATE `LiveChatContext.tsx`
- **IMPLEMENT**:
  - types.ts: เพิ่ม `display_name?: string; name?: string;` ใน `PresencePayload.operators[]`
  - _types.ts: เพิ่ม `export interface OperatorOption { id: number; display_name: string; status: 'online'|'away'|'offline'; active_chats: number; online: boolean; }`
  - LiveChatContext.tsx: เพิ่ม `const [onlineOperators, setOnlineOperators] = React.useState<PresencePayload['operators']>([])`; ใน `useLiveChatSocket({...})` (380-431) เพิ่ม `onPresenceUpdate: (operators) => setOnlineOperators(operators)`; expose `onlineOperators` + `currentUserId: Number(user?.id ?? 0)` ใน value (759-791) + interface (49-81)
- **MIRROR**: callback wiring pattern (Pattern 1); state via React.useState (LiveChatContext.tsx:175-178)
- **IMPORTS**: `import type { PresencePayload } from '@/lib/websocket/types'` (เพิ่มใน import block 16-21)
- **GOTCHA**: `user.id` เป็น `string` (AuthContext.tsx:8) — operator_id ใน session เป็น `number`. แปลงด้วย `Number()` ให้สม่ำเสมอ. การเพิ่ม `onPresenceUpdate` จะทำให้ `handleMessage` deps ใน useLiveChatSocket เปลี่ยน — ใช้ stable callback (inline setState ok เพราะ setState identity stable)
- **VALIDATE**: `npx tsc --noEmit`

### Task 6 — [H2] Build operator roster hook (online + offline merge)

- **ACTION**: CREATE `frontend/app/admin/live-chat/_hooks/useOperatorRoster.ts`
- **IMPLEMENT**: hook รับ `onlineOperators: PresencePayload['operators']` + `currentUserId: number`; fetch `/api/v1/admin/users/workload` (offline source); merge: online set จาก presence (status='online'/'away' + active_chats), ส่วนที่อยู่ใน workload แต่ไม่อยู่ใน presence → `online:false, status:'offline'`. exclude `currentUserId` (ห้ามโอนให้ตัวเอง). คืน `{ operators: OperatorOption[], loading, error, refetch }`. sort: online ก่อน offline, แล้วตาม active_chats น้อย→มาก
- **MIRROR**: custom hook + fetch pattern (LiveChatContext.tsx:233-249); roster fields (admin_users.py:267-279)
- **IMPORTS**: `import { useState, useEffect, useCallback } from 'react'`; `import type { OperatorOption } from '../_types'`; `import type { PresencePayload } from '@/lib/websocket/types'`
- **GOTCHA**: workload `id` เป็น number, presence `id` เป็น string — normalize เป็น number ก่อน merge. `display_name` จาก presence อาจ undefined → fallback workload display_name → `Operator #id`. fetch เฉพาะตอน dialog เปิด (lazy) เพื่อเลี่ยง over-fetch
- **VALIDATE**: `npx tsc --noEmit` + `npx eslint app/admin/live-chat/_hooks/useOperatorRoster.ts`

### Task 7 — [H2] Replace TransferDialog input with searchable picker

- **ACTION**: UPDATE `frontend/app/admin/live-chat/_components/TransferDialog.tsx`; UPDATE `LiveChatShell.tsx:77-81`
- **IMPLEMENT**:
  - เพิ่ม props: `operators: OperatorOption[]; loading?: boolean;` ใน `TransferDialogProps`
  - search box (filter ตาม display_name); list rows: avatar (ui-avatars fallback), display_name, status dot (online=`bg-online`, away=`bg-away`, offline=`bg-offline`), "N chats" / "(offline)"; คลิก row → set selected → enable Transfer
  - Reason input คงไว้
  - "▸ Advanced: enter ID manually" `<details>` ที่มี numeric input เดิมเป็น fallback
  - submit: ถ้ามี selected operator ใช้ id นั้น; ไม่งั้นใช้ advanced numeric (คง guard `operatorId > 0`); เรียก `onTransfer(id, reason)` แล้ว `onClose()`
  - KEEP focus-trap/Escape (16-41), `role="dialog" aria-modal` (46), `htmlFor`/`id` labels
  - LiveChatShell: ส่ง `operators` จาก `useOperatorRoster(...)` (เรียก hook ใน Shell ด้วย onlineOperators+currentUserId จาก context)
- **MIRROR**: focus-trap (Pattern 4); avatar fallback (ConversationItem.tsx:58); status dot colors (ConversationItem.tsx:62-66)
- **IMPORTS**: `import type { OperatorOption } from '../_types'`; lucide `Search`, keep `ArrowRightLeft`
- **GOTCHA**: focusable query `querySelectorAll('button, input')` (line 26) จะรวม row buttons + search → focus trap ยังทำงานแต่ลำดับเปลี่ยน — ทดสอบ Tab wrap. ห้ามให้ list ว่างทำให้ submit ส่ง NaN. รักษา advanced fallback ให้ใช้งานได้แม้ roster โหลดไม่ขึ้น (offline-resilient)
- **VALIDATE**: `npx tsc --noEmit` + `npx eslint app/admin/live-chat/_components/TransferDialog.tsx`; manual: เปิด Transfer → เห็นรายชื่อ → เลือก → โอน

### Task 8 — [M16] Claim contention UI + already-claimed handling

- **ACTION**: UPDATE `LiveChatContext.tsx` (claim path 398-414, 589-612), `SessionActions.tsx`, `ChatHeader.tsx:127-133`
- **IMPLEMENT**:
  - Context: เพิ่ม state `claimContenders: Record<string, {operatorId:number; name:string}>` (line_user_id → ใครกำลัง/ได้ claim). ใน `onSessionClaimed` (398-414) set contender ของ lineUserId พร้อม name (lookup จาก onlineOperators display_name, fallback `Operator #id`); แก้ toast (408-412) ให้ message รวม **ชื่อห้อง** = `currentChat?.display_name`/conversation display_name (เช่น `"สมชาย รับเรื่อง 'คุณลูกค้า X' ไปแล้ว"`)
  - WS error: เพิ่ม `onError` ใน useLiveChatSocket options (มี slot แล้ว, hook signature line 35) ที่ map ข้อความ "already claimed"/SESSION_NOT_FOUND → in-context toast พร้อม display_name; reset `claiming`
  - expose `claimContenders` + helper `getClaimContender(lineUserId)` ใน value
  - SessionActions: เพิ่ม props `claimedByOther?: {name:string}`; ถ้ามี → render `<button disabled>🔒 {name} กำลังรับเรื่อง...</button>` แทนปุ่ม Claim ปกติ
  - ChatHeader: ส่ง `claimedByOther` (จาก context contender ที่ operator_id !== currentUserId) เข้า SessionActions
- **MIRROR**: toast pattern (Pattern 2); onSessionClaimed structure (LiveChatContext.tsx:398-414); SessionActions disabled style (SessionActions.tsx:22-23)
- **IMPORTS**: lucide `Lock` ใน SessionActions
- **GOTCHA**: claim เป็น atomic ที่ backend (PRD: claim_session rowcount guard) → frontend แค่ "reflect" สถานะ, ห้ามทำ optimistic claim ที่ผิด. broadcast `session_claimed` มาถึงทุกคน <1s (success metric). ต้องเคลียร์ contender ตอน session_closed/transferred. `onError` ปัจจุบันไม่ถูกส่งจาก context (เช็ค 431) — เพิ่มเข้าไป
- **VALIDATE**: `npx tsc --noEmit`; 2-client manual: B เห็น "A กำลังรับเรื่อง..." <1s, ปุ่ม disabled

### Task 9 — [M17] Ownership banner + composer gate by owner

- **ACTION**: UPDATE `MessageInput.tsx` (props 25-39, gate 122/188/206), `ChatArea.tsx:330-346`
- **IMPLEMENT**:
  - MessageInput props: เพิ่ม `sessionOwnerId?: number; sessionOwnerName?: string; currentUserId: number; onTakeOver?: () => void;`
  - คำนวณ `isOwner = !sessionOwnerId || sessionOwnerId === currentUserId`
  - ถ้า `isHumanMode && !isOwner` → render banner เหนือ toolbar: `🔒 Claimed by {sessionOwnerName} — [รับช่วงต่อ]` (ปุ่มเรียก `onTakeOver`); และ gate composer (`disabled` textarea+send, เพิ่ม `!isOwner` ใน disabled conditions ที่ 188, 206; เพิ่ม `!isOwner` ใน wrapper opacity class ที่ 122)
  - ChatArea: ส่ง `sessionOwnerId={currentChat?.session?.operator_id}`, `sessionOwnerName` (lookup display_name จาก onlineOperators/contender), `currentUserId` (จาก context), `onTakeOver={() => transferSession(currentUserId)}`
- **MIRROR**: Bot-mode inline bar (MessageInput.tsx:99-104) — banner ใช้โครงเดียวกัน; gate class (MessageInput.tsx:122)
- **IMPORTS**: lucide `Lock` ใน MessageInput
- **GOTCHA**: backend บังคับ ownership อยู่แล้ว (`_require_active_session_owner` live_chat_service.py:343-361) → banner คือ UX-affordance ไม่ใช่ security gate. take-over = `transferSession(currentUserId)` — ต้องมั่นใจว่า from_operator (เจ้าของเดิม) ยอม/หรือ admin role; ถ้า transfer ถูกปฏิเสธ (403) → toast (มี mapping แล้ว). `sessionOwnerName` ตอน owner offline = ใช้ contender/roster fallback `Operator #id`
- **VALIDATE**: `npx tsc --noEmit`; manual: เปิดห้องที่ operator อื่นถือ → composer disabled + banner

### Task 10 — [M15] Waiting-time helpers + unit tests

- **ACTION**: CREATE `frontend/lib/waiting-time.ts` + `frontend/lib/__tests__/waiting-time.test.ts`
- **IMPLEMENT**:
  - `waiting-time.ts`: constants `WAITING_AMBER_SECONDS = 300`, `WAITING_RED_SECONDS = 900`; `getWaitingSeconds(startedAt: string, now?: Date): number`; `getWaitingTier(seconds: number): 'normal'|'amber'|'red'`; `formatWaiting(seconds: number): string` (เช่น "7m", "1h 3m")
  - test: tier boundaries (299→normal, 300→amber, 899→amber, 900→red), formatWaiting cases, getWaitingSeconds with injected `now`
- **MIRROR**: pure-function + AAA test (Pattern 9, timeline-merge.test.ts)
- **IMPORTS**: test: `import { describe, it, expect } from 'vitest'`
- **GOTCHA**: ใช้ named constants ไม่ใช่ magic numbers (coding-style). inject `now` param เพื่อให้ test deterministic (อย่าเรียก `Date.now()` ตรง ๆ ใน logic ที่เทส). ใช้ design tokens สำหรับสี (amber=`--color-warning`/`text-warning`, red=`--color-danger`/`text-danger`) ไม่ hardcode hex
- **VALIDATE**: `npx vitest run lib/__tests__/waiting-time.test.ts`

### Task 11 — [M15] Waiting badge on ConversationItem

- **ACTION**: UPDATE `frontend/app/admin/live-chat/_components/ConversationItem.tsx:86-105`
- **IMPLEMENT**: ถ้า `conversation.session?.status === 'WAITING' && conversation.session.started_at` → คำนวณ `tier = getWaitingTier(getWaitingSeconds(started_at))`; render badge `⏱ {formatWaiting(...)}` ในแถว badge (หลัง Mode badge): amber → `bg-warning/15 text-warning-text`, red → `bg-danger/15 text-danger-text`. ใช้ `useState`+`setInterval(30s)` หรือ rely on existing 5s poll re-render ให้ badge อัปเดต (เลือก interval 30s ในคอมโพเนนต์เพื่อความสด โดยเคลียร์ตอน unmount)
- **MIRROR**: badge markup (ConversationItem.tsx:88-97); status token colors (globals.css:32-36, 64-66)
- **IMPORTS**: `import { Clock } from 'lucide-react'`; `import { getWaitingSeconds, getWaitingTier, formatWaiting } from '@/lib/waiting-time'`
- **GOTCHA**: component เป็น `memo` (line 17) — interval ภายในต้องเคลียร์ใน cleanup. badge เฉพาะ WAITING (ไม่ใช่ ACTIVE/CLOSED). ห้ามคำนวณใน render loop หนัก ๆ — getWaitingSeconds ถูกมาก ok. ถ้า started_at ขาด → ไม่ render badge (graceful)
- **VALIDATE**: `npx tsc --noEmit` + `npx eslint app/admin/live-chat/_components/ConversationItem.tsx`

### Task 12 — [M15] Sort by longest waiting

- **ACTION**: UPDATE `frontend/app/admin/live-chat/_hooks/useConversations.ts`; UPDATE `ConversationList.tsx:41-80, 121-135`
- **IMPLEMENT**:
  - useConversations: เพิ่ม param `sortBy: 'recent'|'longest-waiting' = 'recent'`. ถ้า 'longest-waiting' → sort `filtered` ให้ WAITING ที่ `started_at` เก่าสุดมาก่อน (มากสุด waiting), conversations ที่ไม่มี session ไปท้าย. คืน sorted array. default 'recent' = คงพฤติกรรมเดิม (ไม่ sort, prepend by most-recent ตามที่ context จัดมา)
  - ConversationList: เพิ่ม `const [sortBy, setSortBy] = useState<'recent'|'longest-waiting'>('recent')`; ส่งเข้า `useConversations(conversations, searchQuery, sortBy)`; เพิ่มปุ่ม toggle เล็ก ๆ ข้าง filterButtons (121-135) เช่น icon `ArrowDownWideNarrow` สลับ sort
- **MIRROR**: useConversations return shape (useConversations.ts:23); filterButtons row (ConversationList.tsx:121-135)
- **IMPORTS**: ConversationList: lucide `ArrowDownWideNarrow` (หรือ `Clock`)
- **GOTCHA**: อย่า mutate input array — ใช้ `[...filtered].sort()` (coding-style immutability). sort เสถียร: tiebreak ด้วย last_message time. การ sort ต้องไม่พัง keyboard nav (ConversationList.tsx:153-164 ใช้ filteredConversations index — ยังทำงานเพราะ index จาก array เดียวกัน)
- **VALIDATE**: `npx tsc --noEmit` + `npx eslint app/admin/live-chat/_hooks/useConversations.ts`; manual: toggle sort → คิวรอนานสุดขึ้นบน

### Task 13 — Integration wiring + regression pass

- **ACTION**: VERIFY ทุก prop chain (Context → Shell/ChatArea/ChatHeader → child); run full validation matrix
- **IMPLEMENT**: ยืนยัน `currentUserId`, `onlineOperators`, `claimContenders` ไหลจาก context ถึงปลายทาง; ไม่มี prop ที่ลืมส่ง; ไม่มี hardcoded `slate-*`/hex ในไฟล์ที่แก้ (เคารพ design-token PRD metric)
- **MIRROR**: existing prop drilling (ChatArea.tsx:330-346, ChatHeader.tsx:127-133, LiveChatShell.tsx:77-81)
- **GOTCHA**: การเพิ่ม value keys ใน LiveChatContext (เป็น object literal 759-791, ยังไม่ memo — เป็นงาน H3 Phase 1) จะเพิ่ม re-render — Phase 6 รัน **หลัง** Phase 1 (DEPENDS 2,3,5 ซึ่งตามหลัง 1) ดังนั้น value ถูก memoize แล้ว; ถ้ายังไม่ ให้คง pattern เดิม ไม่ทำให้แย่ลง
- **VALIDATE**: `npx tsc --noEmit && npx eslint app/admin/live-chat && npm run build && npx vitest run`

## Testing Strategy

### Unit Test Table

| Test File | Target | Cases |
|-----------|--------|-------|
| `frontend/lib/__tests__/waiting-time.test.ts` | `getWaitingTier`, `getWaitingSeconds`, `formatWaiting` | 299s→normal; 300s→amber; 899s→amber; 900s→red; getWaitingSeconds with injected now; formatWaiting "7m"/"1h 3m"/"now" |
| `backend/tests/test_transfer_session_errors.py` | transfer REST mapping | "No active session found"→404; "Only the current operator"→403; "Cannot transfer to yourself"→400; "Invalid target operator"→400 |

### Edge-case checklist

- [ ] Transfer picker เมื่อ roster fetch ล้ม → advanced numeric fallback ยังใช้ได้
- [ ] Transfer ตัวเองถูก exclude จาก picker (currentUserId filtered)
- [ ] Offline operator แสดง "(offline)" + status dot `bg-offline`
- [ ] presence display_name = null → fallback `Operator #id` (ทั้ง BE และ FE)
- [ ] 2 operator claim พร้อมกัน → คนแพ้เห็น already-claimed toast พร้อมชื่อห้อง <1s, claiming reset
- [ ] composer ของ operator ที่ไม่ใช่ owner = disabled + banner; take-over → transfer มาตัวเอง
- [ ] take-over ถูกปฏิเสธ (403) → toast error (ไม่เงียบ)
- [ ] waiting badge เฉพาะ WAITING + started_at มีค่า; ขาด started_at → ไม่ render
- [ ] sort 'longest-waiting' ไม่ mutate, keyboard nav ยังทำงาน, conversations ไม่มี session ไปท้าย
- [ ] presence broadcast ตอน register/disconnect เท่านั้น (ไม่ใช่ทุก ping) — ตรวจ log
- [ ] disconnect broadcast หลัง cleanup (list ไม่รวมคนที่เพิ่งออก)
- [ ] backend import ok (ไม่มี circular import จาก WSEventType ใน manager)

## Validation Commands

รันจาก `D:/genAI/jsk-app/frontend` (เว้นแต่ระบุ backend):

```bash
npx tsc --noEmit
# EXPECT: 0 errors

npx eslint app/admin/live-chat lib/waiting-time.ts lib/__tests__/waiting-time.test.ts
# EXPECT: 0 errors/warnings

npx vitest run
# EXPECT: all pass incl. waiting-time.test.ts (existing 29 tests still green)

npm run build
# EXPECT: build succeeds (tsc + next build)

npx playwright test
# EXPECT: existing smoke tests pass (dev server running); no regression
```

Backend (รันจาก `D:/genAI/jsk-app/backend`, WSL venv_linux):

```bash
python -c "import app.core.websocket_manager; import app.api.v1.endpoints.ws_live_chat"
# EXPECT: no import error (no circular import)

python -m pytest tests/test_transfer_session_errors.py -q
# EXPECT: all pass

python -m pytest -q
# EXPECT: no regression
```

> หมายเหตุ: GitHub Actions ปิดอยู่ (free minutes หมด) — ต้องรัน matrix นี้ครบในเครื่องก่อน push/merge

## Acceptance Criteria

- **H2**: Transfer dialog แสดงรายชื่อ operator (online จาก presence + offline จาก workload) พร้อม avatar/status/active_chats; เลือกจากชื่อโอนได้; advanced numeric fallback ยังมี; presence_update ถูก wire (operators เปลี่ยนเมื่อมีคน connect/disconnect)
- **M16**: ใน 2-client test operator คนที่ 2 เห็น "X กำลังรับเรื่อง..." + ปุ่ม Claim disabled ภายใน <1s; ถ้ากด Claim ทัน → toast already-claimed พร้อมชื่อห้อง; claiming reset
- **M17**: composer ของห้องที่ operator อื่นถือ = disabled + banner "Claimed by X — รับช่วงต่อ"; ปุ่มรับช่วงต่อ → transfer มาตัวเอง
- **M15**: ConversationItem แสดง waiting badge (amber ≥5m, red ≥15m) จาก started_at; sort "longest waiting" จัดคิวรอนานสุดขึ้นบน
- **BE**: presence broadcast ตอน register/disconnect; payload มี display_name; roster endpoint ใช้งานได้; transfer ValueError → 400/403/404 (มีเทสยืนยัน)
- **Gate**: tsc/eslint/vitest/build/pytest เขียวทั้งหมด; ไม่มี hardcoded `slate-*`/hex ในไฟล์ที่แก้

## Completion Checklist

- [ ] Task 1 — BE enrich display_name
- [ ] Task 2 — BE broadcast presence on register/disconnect
- [ ] Task 3 — BE roster endpoint verified (auth role confirmed)
- [ ] Task 4 — BE transfer error mapping verified + pytest
- [ ] Task 5 — FE presence types + onPresenceUpdate wired
- [ ] Task 6 — FE useOperatorRoster hook
- [ ] Task 7 — FE TransferDialog picker (H2)
- [ ] Task 8 — FE claim contention UI (M16)
- [ ] Task 9 — FE ownership banner (M17)
- [ ] Task 10 — FE waiting-time helpers + tests (M15)
- [ ] Task 11 — FE waiting badge on ConversationItem (M15)
- [ ] Task 12 — FE sort by longest waiting (M15)
- [ ] Task 13 — integration wiring + full validation matrix
- [ ] 2-client manual test (claim contention + transfer picker) passed
- [ ] All validation commands green

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Circular import `WSEventType` ใน websocket_manager | M | build break | ใช้ string literal `"presence_update"` ใน manager หรือ trigger broadcast จาก ws_live_chat.py แทน |
| Presence broadcast เพิ่ม load / loop | M | perf | broadcast เฉพาะ register/disconnect (ไม่ใช่ ping); try/except กันล้ม; PRD risk mitigation #2 |
| `/admin/users/workload` auth = admin-only กัน AGENT ใช้ picker | M | feature ใช้ไม่ได้บาง role | ยืนยัน role ก่อน (Task 3); ผ่อนเป็น get_current_staff ถ้าจำเป็น (1 บรรทัด) |
| id type mismatch (presence string vs session/workload number) | H | wrong operator / NaN | normalize เป็น number ทุกจุด merge; Number() ที่ context |
| context value ยังไม่ memo (H3 ของ Phase 1) ตอน Phase 6 เริ่ม | L | re-render เพิ่ม | Phase 6 DEPENDS Phase 1; ถ้ายังไม่ memo คง pattern เดิม ไม่ทำแย่ลง |
| focus-trap เปลี่ยนพฤติกรรมเมื่อ input→list buttons | M | a11y regression ใน dialog | คง querySelectorAll('button, input'); ทดสอบ Tab wrap manual |
| take-over (transfer to self) ถูกปฏิเสธโดย backend ownership | M | UX สับสน | toast error ผ่าน mapping ที่มี; ระบุชัดในข้อความ |
| waiting badge interval ไม่เคลียร์ใน memo component | L | memory leak | cleanup setInterval ใน useEffect return |

## Notes

- **transfer error mapping ส่วนใหญ่ทำเสร็จแล้ว**: REST `admin_live_chat.py:315-321` และ WS `ws_live_chat.py:628-636` ดัก ValueError อยู่แล้ว — งาน BE-4 คือ **verify + เพิ่มเทส** + (optional) harden message constants ที่ service เพื่อให้ mapping ไม่เปราะ ไม่ใช่เขียน mapping ใหม่
- **`onPresenceUpdate` มีครบในเลเยอร์ hook แล้ว** (`useLiveChatSocket.ts:32,73,133-136`) แต่ `LiveChatContext` ไม่เคยส่ง callback เข้าไป — นี่คือสาเหตุที่ presence "ไม่ถูก wire" ตาม finding H2
- **roster reuse `/admin/users/workload`** ตามที่ PRD อนุญาต ("หรือ reuse `/admin/users`") — endpoint นี้คืน `display_name`, `role`, `active_tasks` พร้อม search/role filter อยู่แล้ว (admin_users.py:215-283) จึงเหมาะกว่า `/admin/users` ทั่วไป
- **Q2 SLA defaults** (amber 300s / red 900s) เป็น placeholder จนกว่าหน่วยงานยืนยัน — เก็บเป็น named constants ใน `lib/waiting-time.ts` เพื่อแก้จุดเดียว
- **take-over = transfer to self**: ไม่สร้าง flow/endpoint ใหม่ ใช้ `transferSession(currentUserId)` ที่มีอยู่ (LiveChatContext.tsx:636) ตาม "user decision: offline transfer IS supported"
- File ownership ตาม PRD: `MessageInput.tsx` owner = Phase 1 → Phase 6 rebase หลัง P1 merge ก่อนแก้ M17
