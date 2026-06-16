# Plan: Phase 4 PR1 — Chatbot Management Hardening (Must-fixes)

## Summary
ปิด CRITICAL/HIGH gaps ของโดเมน Chatbot Management ที่ทำให้ฟีเจอร์ "ดูเหมือนทำงานแต่ล้มเหลวเงียบ ๆ": (1) broadcast scheduler ที่ส่งจริง + idempotent, (2) wire ปุ่ม Export หน้า chat-histories ให้ดาวน์โหลด CSV จาก backend จริง, (3) แก้ rich menu compact ที่ hard-code height 1686 ให้เป็น 843 ตาม template, (4) แก้ label bug หน้า broadcast detail. ทั้งหมด **extend ไม่ replace** ตาม pattern ที่มีอยู่แล้วในโค้ด

## User Story
As a เจ้าหน้าที่ admin ของศูนย์ยุติธรรมชุมชน,
I want ตั้งเวลา broadcast แล้วระบบส่งจริงตามเวลา + export ประวัติแชตเป็น CSV + sync rich menu แบบ compact ได้ + เห็นปุ่ม/ป้ายถูกต้อง,
So that ให้บริการประชาชนได้โดยไม่ต้องกังวลว่าฟีเจอร์จะล้มเหลวเงียบ ๆ.

## Problem → Solution
- **ตอนนี้**: `schedule_broadcast()` แค่เซ็ต `status=SCHEDULED` + `scheduled_at` แต่ไม่มี worker poll → ข้อความตั้งเวลาไม่เคยถูกส่ง · ปุ่ม Export สร้าง `.txt` ฝั่ง client (backend CSV endpoint มีแต่ไม่ถูกเรียก) · `rich_menus.py` hard-code `height:1686` ทุก template → compact ถูก LINE reject · ปุ่ม "ส่ง" เขียน "ส่งแล้ว", ปุ่ม/modal "ยกเลิก" เขียน "ไม่พบข้อมูล"
- **เป้าหมาย**: in-process asyncio scheduler ส่ง SCHEDULED ที่ถึงเวลาภายใน ±1 นาที (idempotent) · ปุ่ม Export เรียก backend CSV จริง · height มาจาก `template_type` (compact=843, large=1686) · labels ถูกต้อง

## Metadata
- **Complexity**: Large
- **Source PRD**: `.claude/PRPs/prds/chatbot-system-utilities-audit.prd.md`
- **PRD Phase**: Phase 4 — Chatbot Management Hardening (PR1 = Must-fixes; Reply Objects = PR2 แยกภายหลัง; Could items narrowcast/multi-rich-menu เลื่อน)
- **Estimated Files**: ~12 (4 create, ~8 update)

---

## UX Design

### Before
```
ตั้งเวลา broadcast → status=SCHEDULED → ...เงียบ ไม่เคยส่ง ❌
[Export] → ดาวน์โหลด chat-xxx.txt (client-side)
สร้าง rich menu Compact → sync → LINE reject (height 1686 ≠ ภาพ 843) ❌
หน้า broadcast detail: ปุ่ม [ส่งแล้ว]  [ไม่พบข้อมูล]   modal "ไม่พบข้อมูล"
```

### After
```
ตั้งเวลา broadcast → status=SCHEDULED → scheduler poll ~30s → ถึงเวลา → ส่งจริง → COMPLETED ✅
[Export ▾] → CSV (backend) / TXT (client เดิม) → ดาวน์โหลด .csv UTF-8-SIG ✅
สร้าง rich menu Compact → height=843 → sync → LINE accept ✅
หน้า broadcast detail: ปุ่ม [ส่ง]  [ยกเลิกการส่ง]   modal "ยกเลิกการส่ง"
```

### Interaction Changes
| Touchpoint | Before | After | Notes |
|---|---|---|---|
| Scheduled broadcast | ไม่ส่ง | ส่งอัตโนมัติเมื่อ `scheduled_at<=now` | poll interval 30s |
| chat-histories Export | `.txt` client-only | เลือก CSV (backend) หรือ TXT | คง TXT เดิมไว้ไม่ทำลายของเดิม |
| Rich menu Compact | height 1686 (ผิด) | height 843 จาก template_type | large คง 1686 |
| Broadcast detail ปุ่มส่ง | "ส่งแล้ว" | "ส่ง" | label fix |
| Broadcast detail ปุ่ม/modal ยกเลิก | "ไม่พบข้อมูล" | "ยกเลิกการส่ง" | label fix |

---

## Mandatory Reading

| Priority | File | Lines | Why |
|---|---|---|---|
| P0 | `backend/app/tasks/session_cleanup.py` | 1-23, 26-36, 176-197 | **Template หลักให้ mirror** — background task loop + start/stop + `create_audit_log` system action |
| P0 | `backend/app/services/broadcast_service.py` | 173-245 | `send_broadcast()` + `schedule_broadcast()` ที่ scheduler จะเรียก; status state machine |
| P0 | `backend/app/models/broadcast.py` | 9-15, 26-52 | `BroadcastStatus` enum + fields (`scheduled_at`, `status` indexed) |
| P0 | `backend/app/main.py` | 102-130 | `lifespan` — จุดเสียบ `start_/stop_broadcast_scheduler()` |
| P1 | `backend/app/db/session.py` | 16-22 | `AsyncSessionLocal()` pattern สำหรับ session นอก request |
| P1 | `backend/app/services/live_chat_service.py` | (get_active_session) | precedent ของ `.with_for_update()` |
| P0 | `frontend/app/admin/chat-histories/[lineUserId]/page.tsx` | 82,96-101,169-185,228-236 | export handler + auth headers ที่จะ wire |
| P0 | `frontend/app/admin/files/page.tsx` | 259-279 | **Pattern ให้ mirror** — fetch blob + auth + `<a>` download + toast error |
| P0 | `backend/app/api/v1/endpoints/admin_export.py` | 55-92 | CSV endpoint ปลายทาง (`GET /admin/export/conversations/{id}/csv`) |
| P0 | `backend/app/api/v1/endpoints/rich_menus.py` | 36-86 | จุด hard-code `height:1686` (create+update) + ใช้ `template_type` |
| P1 | `frontend/app/admin/rich-menus/new/page.tsx` | 61-173, 291-306 | template ids (`*-compact` vs large) ที่ backend ต้อง map |
| P0 | `frontend/app/admin/chatbot/broadcast/[id]/page.tsx` | 378-387, 417 | label bugs (ปุ่มส่ง/ยกเลิก/modal title) |
| P2 | `backend/app/api/v1/endpoints/admin_broadcast.py` | 169-204 | send/schedule endpoints (ใช้ตรวจ status flow) |

## External Documentation

| Topic | Source | Key Takeaway |
|---|---|---|
| LINE Rich Menu size | LINE Messaging API docs | full = 2500×1686, compact = 2500×843 (กว้างคงที่ 2500, ต่างที่ height) |
| Postgres SKIP LOCKED | Postgres docs / SQLAlchemy `with_for_update(skip_locked=True)` | claim row โดยไม่บล็อก poller อื่น → idempotent multi-instance |

> No further external research needed — scheduler/CSV/labels ใช้ established internal patterns; rich menu size เป็นค่าคงที่ตาม contract ด้านบน

---

## Patterns to Mirror

### BACKGROUND_TASK_LOOP
```python
# SOURCE: backend/app/tasks/session_cleanup.py:26-35, 176-196
_cleanup_task: asyncio.Task = None

async def cleanup_inactive_sessions():
    logger.info("Session cleanup task started")
    while True:
        try:
            async with AsyncSessionLocal() as db:
                await _process_inactive_sessions(db)
        except Exception as e:
            logger.error(f"Session cleanup error: {e}")
        await asyncio.sleep(CLEANUP_INTERVAL_SECONDS)

async def start_cleanup_task():
    global _cleanup_task
    _cleanup_task = asyncio.create_task(cleanup_inactive_sessions())

async def stop_cleanup_task():
    global _cleanup_task
    if _cleanup_task and not _cleanup_task.done():
        _cleanup_task.cancel()
        try:
            await _cleanup_task
        except asyncio.CancelledError:
            pass
    _cleanup_task = None
```

### SYSTEM_AUDIT_LOG
```python
# SOURCE: backend/app/tasks/session_cleanup.py:92-103
await create_audit_log(
    db=db,
    admin_id=None,                       # None = system action
    action="auto_close_session",
    resource_type="chat_session",
    resource_id=str(session.id),
    details={"reason": "inactivity", ...},
)
```

### SEND_BROADCAST_STATUS_GUARD
```python
# SOURCE: backend/app/services/broadcast_service.py:173-185
async def send_broadcast(self, db, broadcast):
    if broadcast.status not in (BroadcastStatus.DRAFT, BroadcastStatus.SCHEDULED):
        raise ValueError(f"Cannot send broadcast in status {broadcast.status}")
    messages = await self._build_messages(broadcast, db)
    if not messages:
        raise ValueError("Broadcast has no valid messages to send")
    broadcast.status = BroadcastStatus.SENDING   # soft-lock ก่อนยิง API
    await db.commit()
    ...
```

### ROW_LOCK
```python
# SOURCE: backend/app/services/live_chat_service.py (get_active_session)
stmt = select(ChatSession).where(...).limit(1)
if lock:
    stmt = stmt.with_for_update()
result = await db.execute(stmt)
```

### FRONTEND_BLOB_DOWNLOAD
```typescript
// SOURCE: frontend/app/admin/files/page.tsx:259-279
const res = await fetch(`${API_BASE}/admin/media/${file.id}/download`, { headers });
if (res.ok) {
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.filename;
    a.click();
    URL.revokeObjectURL(url);
} else {
    const msg = await readErrorMessage(res, 'ดาวน์โหลดล้มเหลว');
    toast({ title: msg, variant: 'error' });
}
```

### FRONTEND_AUTH_HEADERS
```typescript
// SOURCE: frontend/app/admin/chat-histories/[lineUserId]/page.tsx:82,96-101
const { token } = useAuth();
const API_BASE = '/api/v1';
const authHeaders = useMemo(() => {
    if (!token) return {} as Record<string, string>;
    return { Authorization: `Bearer ${token}` };
}, [token]);
```

### BROADCAST_STATUS_LABELS
```typescript
// SOURCE: frontend/app/admin/chatbot/broadcast/[id]/page.tsx:47-62
const STATUS_CONFIG: Record<string, {variant; label; icon}> = {
    scheduled: { variant: 'info', label: 'ตั้งเวลาแล้ว', icon: <Clock .../> },
    ...
};
```

---

## Files to Change

| File | Action | Justification |
|---|---|---|
| `backend/app/tasks/broadcast_scheduler.py` | CREATE | background task ส่ง scheduled broadcast (mirror session_cleanup) |
| `backend/app/main.py` | UPDATE | เสียบ `start_/stop_broadcast_scheduler()` ใน lifespan |
| `backend/app/services/broadcast_service.py` | UPDATE | เพิ่ม `get_due_scheduled(db)` (claim ด้วย SKIP LOCKED) ให้ scheduler ใช้ |
| `backend/app/api/v1/endpoints/rich_menus.py` | UPDATE | derive height จาก `template_type` แทน hard-code 1686 (create+update) |
| `backend/app/core/rich_menu_sizes.py` หรือ helper ใน rich_menus.py | CREATE | map `template_type` → `{width,height}` (compact=843, large=1686) |
| `frontend/app/admin/chat-histories/[lineUserId]/page.tsx` | UPDATE | wire ปุ่ม Export → CSV (backend) + คง TXT |
| `frontend/app/admin/chatbot/broadcast/[id]/page.tsx` | UPDATE | แก้ label: "ส่งแล้ว"→"ส่ง", "ไม่พบข้อมูล"→"ยกเลิกการส่ง" (ปุ่ม+modal) |
| `backend/tests/test_broadcast_scheduler.py` | CREATE | unit test scheduler (time mock + idempotency) |
| `backend/tests/test_rich_menu_size.py` | CREATE | test template_type → height mapping |
| `frontend/lib/constants/...` (ถ้าจำเป็น) | UPDATE | ถ้าจะ central รูปแบบ export — optional |

## NOT Building
- **Reply Objects ครบ type + preview** (Template/Coupon/Text v2/Quick reply) → แยกเป็น **Phase 4 PR2**
- **Narrowcast/multicast UI, multi-rich-menu switching (`richmenuswitch`), response ordering UI** → Could items, เลื่อนออก
- **ย้าย file storage / object storage** → ตาม PRD เป็น tech debt
- **APScheduler / external cron** → ตัดสินใช้ in-process asyncio loop แล้ว
- **เพิ่ม broadcast message type ใหม่ใน backend** → นอก scope PR1

---

## Step-by-Step Tasks

### Task 1: เพิ่ม `get_due_scheduled()` ใน broadcast_service
- **ACTION**: เพิ่ม method ดึง broadcast ที่ `status=SCHEDULED AND scheduled_at <= now()` แบบ claim ด้วย row lock
- **IMPLEMENT**:
  ```python
  async def get_due_scheduled(self, db: AsyncSession, limit: int = 20) -> list[Broadcast]:
      now = datetime.now(timezone.utc)
      stmt = (
          select(Broadcast)
          .where(
              Broadcast.status == BroadcastStatus.SCHEDULED,
              Broadcast.scheduled_at.isnot(None),
              Broadcast.scheduled_at <= now,
          )
          .order_by(Broadcast.scheduled_at)
          .limit(limit)
          .with_for_update(skip_locked=True)
      )
      result = await db.execute(stmt)
      return list(result.scalars().all())
  ```
- **MIRROR**: ROW_LOCK (`live_chat_service.with_for_update`) + query style ใน broadcast_service
- **IMPORTS**: `from datetime import datetime, timezone` (มีแล้วในไฟล์), `select` (มีแล้ว)
- **GOTCHA**: `scheduled_at` เป็น timezone-aware → ใช้ `datetime.now(timezone.utc)` เทียบ; `with_for_update(skip_locked=True)` ต้องอยู่ในธุรกรรมเดียวกับการ process
- **VALIDATE**: unit test ส่ง broadcast 1 ตัว `scheduled_at` อดีต → คืน 1 ตัว; อนาคต → คืน 0

### Task 2: สร้าง `tasks/broadcast_scheduler.py`
- **ACTION**: สร้าง background loop poll due broadcasts แล้วเรียก `send_broadcast()`
- **IMPLEMENT**:
  ```python
  """Background task: send scheduled broadcasts when due."""
  import asyncio
  import logging
  from app.db.session import AsyncSessionLocal
  from app.core.audit import create_audit_log
  from app.services.broadcast_service import broadcast_service
  from app.models.broadcast import BroadcastStatus

  logger = logging.getLogger(__name__)
  SCHEDULER_INTERVAL_SECONDS = 30

  async def run_scheduled_broadcasts():
      logger.info("Broadcast scheduler task started")
      while True:
          try:
              async with AsyncSessionLocal() as db:
                  await _process_due_broadcasts(db)
          except Exception as e:
              logger.error(f"Broadcast scheduler error: {e}")
          await asyncio.sleep(SCHEDULER_INTERVAL_SECONDS)

  async def _process_due_broadcasts(db):
      due = await broadcast_service.get_due_scheduled(db)
      if not due:
          return
      logger.info("Scheduler found %s due broadcast(s)", len(due))
      for broadcast in due:
          bid = broadcast.id
          try:
              await broadcast_service.send_broadcast(db, broadcast)
              await create_audit_log(
                  db=db, admin_id=None, action="auto_send_broadcast",
                  resource_type="broadcast", resource_id=str(bid),
                  details={"status": broadcast.status.value,
                           "success": broadcast.success_count,
                           "failure": broadcast.failure_count},
              )
              await db.commit()
          except Exception as e:
              logger.error("Auto-send broadcast %s failed: %s", bid, e)

  _scheduler_task: asyncio.Task = None

  async def start_broadcast_scheduler():
      global _scheduler_task
      _scheduler_task = asyncio.create_task(run_scheduled_broadcasts())
      logger.info("Broadcast scheduler background task started")

  async def stop_broadcast_scheduler():
      global _scheduler_task
      if _scheduler_task and not _scheduler_task.done():
          _scheduler_task.cancel()
          try:
              await _scheduler_task
          except asyncio.CancelledError:
              pass
      _scheduler_task = None
  ```
- **MIRROR**: BACKGROUND_TASK_LOOP + SYSTEM_AUDIT_LOG
- **IMPORTS**: ดูในโค้ด; `broadcast_service` เป็น singleton instance (ยืนยันชื่อ instance ที่ export จาก broadcast_service.py)
- **GOTCHA**: `send_broadcast()` commit เองภายใน (SENDING→COMPLETED) — การ `get_due_scheduled` ใช้ `skip_locked` กัน double-claim; เมื่อ status เปลี่ยนเป็น SENDING แล้ว poller รอบถัดไป/instance อื่นจะ filter ออกด้วย `status==SCHEDULED` เอง
- **VALIDATE**: ดู log "Broadcast scheduler task started" ตอน start; unit test `_process_due_broadcasts` ส่ง due 1 ตัว → status กลายเป็น COMPLETED/SENDING

### Task 3: เสียบ scheduler ใน lifespan
- **ACTION**: เรียก `start_broadcast_scheduler()` หลัง `start_cleanup_task()` และ `stop_broadcast_scheduler()` ใน finally
- **IMPLEMENT**: ใน `backend/app/main.py:121-130`
  ```python
  await start_cleanup_task()
  await start_broadcast_scheduler()
  logger.info("Background tasks started.")
  try:
      yield
  finally:
      await stop_cleanup_task()
      await stop_broadcast_scheduler()
      await pubsub_manager.disconnect()
      await redis_client.disconnect()
  ```
- **MIRROR**: การเรียก start/stop_cleanup_task เดิม
- **IMPORTS**: `from app.tasks.broadcast_scheduler import start_broadcast_scheduler, stop_broadcast_scheduler` (วางใกล้ import ของ session_cleanup)
- **GOTCHA**: อย่าลืม stop ใน finally มิฉะนั้น task ค้างตอน reload
- **VALIDATE**: start backend → log ทั้ง 2 task; ไม่มี error ตอน shutdown

### Task 4: แก้ rich menu height จาก template_type
- **ACTION**: สร้าง helper map `template_type` → size แล้วใช้แทน hard-code 1686 ทั้ง create + update
- **IMPLEMENT**:
  ```python
  # helper (ในไฟล์ rich_menus.py หรือ backend/app/core/rich_menu_sizes.py)
  RICH_MENU_WIDTH = 2500
  RICH_MENU_HEIGHT_LARGE = 1686
  RICH_MENU_HEIGHT_COMPACT = 843

  def resolve_rich_menu_size(template_type: str) -> dict:
      is_compact = "compact" in (template_type or "").lower()
      height = RICH_MENU_HEIGHT_COMPACT if is_compact else RICH_MENU_HEIGHT_LARGE
      return {"width": RICH_MENU_WIDTH, "height": height}
  ```
  แล้วใน create/update: `"size": resolve_rich_menu_size(data.template_type),`
- **MIRROR**: โครง `line_config` เดิมใน `rich_menus.py:43-53`
- **IMPORTS**: ถ้าแยกไฟล์ → import helper
- **GOTCHA**: frontend ส่ง `template_type` เป็น id เช่น `3-buttons-compact`, `6-buttons` — เกณฑ์ "มีคำว่า compact" ครอบทุก compact template ที่ frontend นิยาม (`*-compact*`); ตรวจ list ที่ `rich-menus/new/page.tsx:133-172`
- **VALIDATE**: test `resolve_rich_menu_size("3-buttons-compact")["height"]==843`, `resolve_rich_menu_size("6-buttons")["height"]==1686`

### Task 5: Wire ปุ่ม Export → CSV ที่ chat-histories
- **ACTION**: เพิ่มทางเลือกดาวน์โหลด CSV จาก backend (คงปุ่ม TXT เดิม) เรียก `GET /admin/export/conversations/{lineUserId}/csv`
- **IMPLEMENT**: เพิ่ม handler ใหม่ mirror FRONTEND_BLOB_DOWNLOAD ใช้ `authHeaders` ที่มีอยู่:
  ```typescript
  const handleExportCsv = useCallback(async () => {
      try {
          const res = await fetch(
              `${API_BASE}/admin/export/conversations/${lineUserId}/csv`,
              { headers: authHeaders },
          );
          if (!res.ok) { /* readErrorMessage + toast error */ return; }
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `chat-${lineUserId}-${new Date().toISOString().slice(0,10)}.csv`;
          a.click();
          URL.revokeObjectURL(url);
      } catch (err) { /* logger.error + toast */ }
  }, [authHeaders, lineUserId, toast]);
  ```
  UI: เปลี่ยนปุ่ม Export เดิมเป็นเมนู/2 ปุ่ม (CSV + TXT) หรือ default CSV (ตัดสินตาม UI ที่กระชับ — แนะนำ dropdown เล็ก)
- **MIRROR**: FRONTEND_BLOB_DOWNLOAD (files/page.tsx) + FRONTEND_AUTH_HEADERS
- **IMPORTS**: ใช้ของที่ import แล้วในไฟล์ (`useCallback`, `toast`, `logger`); ตรวจว่ามี `readErrorMessage` helper หรือ inline message
- **GOTCHA**: endpoint ต้องสิทธิ์ `KEY_EXPORT_CHAT` (SUPER_ADMIN/ADMIN) → role ต่ำกว่าได้ 403; แสดง toast error ให้ชัด (อย่า swallow); CSV เป็น UTF-8-SIG เปิด Excel ภาษาไทยได้
- **VALIDATE**: คลิก CSV → ดาวน์โหลด `.csv` header `timestamp,line_user_id,direction,sender,message_type,content`; role ไม่มีสิทธิ์เห็น error

### Task 6: แก้ label bug หน้า broadcast detail
- **ACTION**: แก้ 3 จุดใน `frontend/app/admin/chatbot/broadcast/[id]/page.tsx`
- **IMPLEMENT**:
  - บรรทัด ~380 ปุ่มเปิด send modal: `ส่งแล้ว` → `ส่ง`
  - บรรทัด ~386 ปุ่มเปิด cancel modal: `ไม่พบข้อมูล` → `ยกเลิกการส่ง`
  - บรรทัด ~417 modal title: `title="ไม่พบข้อมูล"` → `title="ยกเลิกการส่ง"`
- **MIRROR**: คำ label ภาษาไทยใน STATUS_CONFIG เดิม (โทนเดียวกัน)
- **IMPORTS**: ไม่มี
- **GOTCHA**: อย่าแก้ STATUS_CONFIG.completed (เป็น "ส่งสำเร็จ" ถูกแล้วในหน้านี้); ระวังแก้ผิดปุ่ม — ปุ่มส่งผูก `setSendModal(true)`, ปุ่มยกเลิกผูก `setCancelModal(true)`
- **VALIDATE**: เปิดหน้า broadcast detail สถานะ scheduled → ปุ่มอ่านว่า "ส่ง" และ "ยกเลิกการส่ง"; modal ยกเลิกหัวข้อถูก

### Task 7: เขียนเทสต์
- **ACTION**: unit tests สำหรับ scheduler + rich menu size
- **IMPLEMENT**:
  - `test_broadcast_scheduler.py`: (a) `get_due_scheduled` คืนเฉพาะ due+SCHEDULED, (b) `_process_due_broadcasts` เปลี่ยน status (mock `send_broadcast`/LINE API), (c) idempotency: broadcast ที่ status≠SCHEDULED ไม่ถูกหยิบ
  - `test_rich_menu_size.py`: mapping compact=843 / large=1686 / template_type ว่าง→large (default)
- **MIRROR**: TEST patterns ใน `backend/tests/test_admin_*` (pytest async, fixtures DB)
- **IMPORTS**: pytest, `pytest.mark`, async fixtures ที่ใช้ในไฟล์ test อื่น
- **GOTCHA**: ห้ามยิง LINE API จริง — mock `broadcast_service.api.broadcast`/`multicast`; ใช้ DB fixture เดียวกับ test ที่มีอยู่
- **VALIDATE**: `python -m pytest backend/tests/test_broadcast_scheduler.py backend/tests/test_rich_menu_size.py -v` ผ่าน

---

## Testing Strategy

### Unit Tests
| Test | Input | Expected Output | Edge Case? |
|---|---|---|---|
| due query (past) | SCHEDULED, scheduled_at=now-1m | คืน 1 | - |
| due query (future) | SCHEDULED, scheduled_at=now+1h | คืน 0 | ✓ |
| due query (wrong status) | DRAFT/SENDING/COMPLETED, due | คืน 0 | ✓ idempotency |
| process due | due 1 ตัว, mock API ok | status COMPLETED, audit log "auto_send_broadcast" | - |
| process due (api fail) | due 1 ตัว, mock API raise | status FAILED, ไม่ throw ออก loop | ✓ |
| rich size compact | "3-buttons-compact" | height 843 | - |
| rich size large | "6-buttons" | height 1686 | - |
| rich size empty | "" / None | height 1686 (default) | ✓ |

### Edge Cases Checklist
- [ ] scheduled_at เป็น naive datetime (ต้อง treat เป็น utc) — ยืนยัน `schedule_broadcast` แปลงแล้ว
- [ ] due หลายตัวพร้อมกัน → ส่งครบ ไม่ค้าง
- [ ] LINE API ล้ม → FAILED, loop ไม่ตาย
- [ ] รัน 2 instance → SKIP LOCKED + status guard กัน double-send
- [ ] Export role ไม่มี `KEY_EXPORT_CHAT` → 403 + toast (ไม่ silent)
- [ ] Compact template ทุกตัว (`*-compact`) → 843

---

## Validation Commands

### Static Analysis
```bash
cd frontend && npx tsc --noEmit && npx eslint app/admin/chat-histories/[lineUserId]/page.tsx app/admin/chatbot/broadcast/[id]/page.tsx
```
EXPECT: Zero type/lint errors

### Unit Tests (backend)
```bash
cd backend && python -m pytest tests/test_broadcast_scheduler.py tests/test_rich_menu_size.py -v
```
EXPECT: All pass

### Full Backend Suite
```bash
cd backend && python -m pytest
```
EXPECT: No regressions (broadcast/rich menu/export endpoints เดิมยังเขียว)

### Frontend Unit (local เท่านั้น — CI ไม่รัน vitest)
```bash
cd frontend && npx vitest run
```
EXPECT: No regressions

### Manual Validation
- [ ] ตั้งเวลา broadcast +1 นาที → รอ → status COMPLETED ภายใน ±1 นาที + ข้อความถึง LINE
- [ ] Export CSV จาก chat-histories → เปิด Excel ภาษาไทยอ่านได้
- [ ] สร้าง rich menu Compact → sync LINE สำเร็จ (ไม่ reject)
- [ ] หน้า broadcast detail (scheduled) → ปุ่ม/modal labels ถูก

---

## Acceptance Criteria
- [ ] Scheduled broadcast ส่งจริงภายใน ±1 นาที (manual + unit)
- [ ] Export CSV ดาวน์โหลดได้จาก backend (auth + permission ถูก)
- [ ] Rich menu compact height=843, large=1686 (unit + manual sync)
- [ ] Labels broadcast detail ถูกทั้ง 3 จุด
- [ ] tests เขียว, ไม่มี type/lint error, ไม่ regress endpoint เดิม

## Completion Checklist
- [ ] โค้ดตาม pattern ที่ค้นพบ (session_cleanup / files download / status guard)
- [ ] Error handling ตาม style เดิม (log + ไม่ swallow ฝั่ง UI)
- [ ] Logging ตาม convention (`logger.info/error`)
- [ ] Tests ตาม pytest async pattern
- [ ] ไม่มี hardcoded height ตกค้าง
- [ ] ไม่เพิ่ม scope (Reply Objects/Could items แยก)

## Risks
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| scheduler ส่งซ้ำ (multi-instance/restart กลางคัน) | M | H | SKIP LOCKED claim + status guard `SCHEDULED→SENDING` ก่อนยิง API |
| poll interval ทำให้ส่งช้าเกิน ±1 นาที | L | M | interval 30s << 60s tolerance |
| `template_type` มีรูปแบบใหม่ที่ไม่มี "compact" | L | M | default = large (ปลอดภัยกับ template ปัจจุบันทั้งหมด) + test |
| Export endpoint path/permission ไม่ตรง | L | M | ยืนยันแล้ว `GET /admin/export/conversations/{id}/csv` + `KEY_EXPORT_CHAT` |
| แก้ผิดปุ่ม (send vs cancel) | L | L | ผูกตาม handler `setSendModal`/`setCancelModal` |

## Notes
- **Decision (PRD Open Question)**: Broadcast scheduler = **in-process asyncio loop** (mirror `session_cleanup.py`), ไม่ใช้ APScheduler/Vercel cron — เพราะ backend เป็น long-running uvicorn process และมี pattern พร้อมแล้ว (ยืนยันโดย user 2026-06-16)
- **Scope split**: Phase 4 = PR1 (นี้, Must-fixes) + PR2 (Reply Objects ครบ type + preview, แยกภายหลัง) — สอดคล้องวิธี Phase 3 (#107 backend / #108 frontend)
- **audit log "auto_send_broadcast"** เป็นจุดเริ่มต้นที่ดีให้ Phase 5 (audit coverage expansion) ต่อยอด
- ยืนยัน instance name ของ broadcast service ที่ export จาก `broadcast_service.py` ก่อน import (เช่น `broadcast_service`) — ตรวจท้ายไฟล์
