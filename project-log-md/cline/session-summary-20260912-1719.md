# Session Summary — cline — 2026-09-12T17:19:00+07:00

**Branch**: `chore/graphify-frontend-map`  **HEAD**: `9b52881`
**Checkpoint**: `.agents/state/checkpoints/handover-cline-20260912-1719.json`

## Objective

สร้าง "แผนที่โค้ด" (graphify — อ่านโค้ดเชิงโครงสร้าง ฟรี $0 ไม่ใช้ AI) ทั้งหลังบ้าน+หน้าบ้าน แล้วไล่ชื่อฟีเจอร์/ฟังก์ชันครบ **7 หมวด** ตามที่สั่ง: livechat · LINE LIFF · จัดการคำขอ · จัดการนัดหมาย · rich menu · จัดการไฟล์ · ตั้งค่าระบบ

## Completed

- **แผนที่หลังบ้าน**: 352 ไฟล์ → 5,100 จุด / 9,747 เส้น / 293 กลุ่ม (`graphify-out/graph.json` 5.8MB + `GRAPH_REPORT.md`)
- **แผนที่หน้าบ้าน**: 362 ไฟล์ → 1,904 จุด / 4,345 เส้น / 127 กลุ่ม (`graphify-out-fe/graph.json` 2.3MB + `GRAPH_REPORT.md`)
- **`.gitignore`** อัปเดต + commit 2 ครั้ง (ไม่เก็บ graphify-out ทุกตัว) — branch `chore/ignore-graphify-out` แล้วต่อด้วย `chore/graphify-frontend-map`
- **เทียบ handoff vs local vs remote vs graft vs graphify** — ตรงกันหมด HEAD `2a585e6` = origin/main ไม่มีงานค้าง
- **ไล่สาย `AnalyticsService`** (กลุ่ม 23) = จุดเชื่อมใหญ่สุด: ผู้เรียก = admin dashboard, `ws_live_chat.py:202`, choreography, session_cleanup, `get_kpi_trends`; ปลายทาง = `broadcast_analytics_update`
- **ไล่สาย `get_live_kpis()`** (`analytics_service.py:22`): เจอผู้เรียก 5 จุด → ส่ง FCR/abandoned/SLA แล้วเรียก `broadcast_analytics_update()`
- **ไล่ครบ 7 ฟีเจอร์** (แผนที่หลังบ้าน + หน้าบ้าน + `git grep` ชื่อไฟล์จริง) → ตาราง Feature Map ด้านล่าง

## Feature Map (ผลงานหลักของรอบนี้)

| ฟีเจอร์ | หลังบ้าน/หน้าบ้าน (จุด) | ประตูหลังบ้าน | ห้องเครื่อง | จอหลัก | ระวัง |
|---|---|---|---|---|---|
| Live Chat | 1,056 / 366 | `ws_live_chat.py`, `admin_live_chat.py` (43) | `websocket_manager.py` (`ConnectionManager` 46), `ws_session/handlers.py`, `live_chat_service/choreography.py` | `LiveChatContext.tsx` (41), `ChatArea.tsx`, `liveChatStore.ts` | แตะสายสด = กระทบทุกห้องที่คุยอยู่ |
| LINE LIFF | 204 / — | `liff.py` (21), `liff_bookings.py` (29) | schemas `service_request_liff.py`, `debt_mediation_liff.py` | `liff/booking/page.tsx` (49), `liff/service-request*`, `liff/debt-mediation` | เทส LIFF หนาแน่น (43/30/23) |
| จัดการคำขอ | 346 / 90 | `admin_requests.py` (43) | `core/request_workflow.py`, `models/service_request.py` (`RequestStatus`) | `admin/requests/[id]/page.tsx` (72), `kanban/page.tsx` | กฎสายพานอยู่ไฟล์เดียว |
| จัดการนัดหมาย | 590 / 113 | `liff_bookings.py`, `admin_bookings.py`, `admin_business_hours.py` | `services/booking_service.py` (48) + `booking_settings.py` + `business_hours_service.py` + `booking_notifications.py` | `liff/booking/page.tsx` (49), `lib/booking.ts` (46), `CalendarPickerTH.tsx` (30) | ใหญ่สุดอันดับ 2 + เทส `test_booking_*` 8 ไฟล์ |
| Rich Menu | 15 ไฟล์ / — | `rich_menus.py` | `rich_menu_service.py` (`RichMenuService` 37), `tasks/rich_menu_display_scheduler.py` | `lib/rich-menu.ts` (32), `rich-menus/{page,new,edit,insights,aliases}` | ผูก LINE ภายนอก + นาฬิกาเปลี่ยนเมนู |
| จัดการไฟล์ | 12 ไฟล์ / 90 | `media.py` | `models/media_file.py`, `rich_menu_service.py`, `live_chat_service/messaging.py` | `admin/files/page.tsx` (33), `admin/image-resize/*` (36/17/16), `FileUploadZone.tsx` | ไฟล์ถูกใช้ 3 ทาง (แชท/เมนู/LINE) |
| ตั้งค่าระบบ | กระจาย / 164 | `settings.py` + admin_settings/credentials/integrations/permissions | กระจาย ไม่มีศูนย์กลาง | `settings/permissions/page.tsx` (41), `lib/permissions.ts` (19), `permission-modules.ts` (19) | ไม่มีศูนย์กลาง แก้สิทธิ์ต้องเช็คคู่กัน |

**God nodes หลังบ้าน**: `app()` 61 · `create_audit_log()` 50 · `_FakeDB` 47 · `ConnectionManager` 46 · `RichMenuService` 37 · `AnalyticsService` 26
**God nodes หน้าบ้าน**: `cn()` 61 · `Button` 53 · `logger` 44 · `LoadingSpinner()` 36 · `Card` 29 · `Badge` 26 · `Input` 23 · `WebSocketClient` 28 · `useToast()` 27

## Key decisions

1. ใช้ graphify (AST/structural ฟรี) แทนการอ่านไฟล์ทีละไฟล์ — เร็วและไม่กินโควตา AI
2. ไล่ฟีเจอร์ด้วย **ชื่อโหนด + ชื่อไฟล์** ไม่ดูแค่ชื่อโฟลเดอร์ เพราะฟีเจอร์ไทยกระจายข้ามโฟลเดอร์ (เช่น ตั้งค่าการจองไปโผล่ในโฟลเดอร์ settings)
3. งานเกิน 30 วิ → ย้ายไป **teammate async run** (`feat-scout` รัน batch เขียนผลลงไฟล์ แล้วอ่านกลับ)
4. **แก้ตามระบบ**: ลบ handoff ที่เขียนมือ (1715) แล้วรัน `handoff-new.cjs` จริง (1719) — พร้อม restash context กลับเข้าไป

## Gotchas (ใหม่)

1. **`||` และ `2>nul` ใช้ไม่ได้** — shell นี้เป็น PowerShell; ต้องใช้ `cmd /c "..."` หรือ `powershell -NoProfile -Command`
2. **`rmdir` โฟลเดอร์ checkpoints อันตราย** — checkpoints ถูก track ใน git; ลบแล้วต้อง `git checkout -- .agents/state/checkpoints` ก่อน ไม่งั้น `handoff-new.cjs` ล้มด้วย ENOENT
3. **Nested quotes ใน PowerShell พัง** — งานที่ต้อง quote หลายชั้นให้เขียนเป็น `.bat` แล้วเรียกไฟล์นั้น
4. **Multiprocessing ของ graphify ล้มบน Windows** — ต้องรันเรียงลำดับ (`parallel=False`) chunk ละ 41 ไฟล์ = 9 chunk ต่อฝั่ง
5. `handoff-new.cjs` เรียก validator ด้วย `python3`/`python`/`py` ซึ่งหาไม่เจอใน shell ปกติ → รายงาน FAIL หลอกๆ; รันเองด้วย `python .agents/scripts/validate_handoff_state.py --platform cline` → **PASS**
6. temp helper scripts อยู่ที่ `C:\Users\arnutt.n\AppData\Local\Temp\`: `gmerge.py`, `gfmerge.py`, `gfchunk2.py`, `gfdetect.py`, `gtrace.py`, `ganalyze.py`, `gfsize.py`, `gfeatures.py`, `gfeatures2.py`, `gstash.py`, `gputctx.py` (+ `.bat`) — ไม่ได้ commit

## Next Steps

1. เจาะสายยาวเส้นเดียว: **กดจองคิวใน LINE → LIFF → `booking_service` → `booking_notifications` → เตือนก่อนนัด**
2. แก้ 3 orphan node หน้าบ้าน (`KPIData`, `OperatorPerformance`, `DashboardData`) — มีนิยามแต่ไม่มีเส้นเชื่อม
3. วัด blast radius ของ `Button` (53 เส้น / 27 กลุ่ม) ก่อนแก้ UI กลาง
4. ยืนยันว่า `AnalyticsService` จุดเปราะ (3 dashboard พังพร้อมกัน) ควรแยกหรือไม่
5. `graft build` รีเฟรชกราฟ graft (ยังไม่ได้รันหลัง graphify)

## Blockers

- _none_

## Sensitive Info

- ไม่มี secret ในเอกสารนี้; helper scripts เป็นไฟล์ชั่วคราวใน Temp ของเครื่อง ไม่ได้ commit

