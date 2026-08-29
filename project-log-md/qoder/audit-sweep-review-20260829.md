# Audit Sweep Review — ทีม Agents 6 สำรวจ + 5 ซ่อม

**วันที่:** 2026-08-29 · **โดย:** Qoder (ทีม agents)
**Branch:** `fix/audit-sweep-20260829` (แยกจาก `main` ที่ `951b5d9`)
**สถานะ:** แก้ไขเสร็จ + ทุกด่านเขียว — รอคอมมิต/เปิด PR

---

## เฟส 1 — สำรวจ (read-only, 6 ทีม ขอบเขตไม่ทับกัน)

| ทีม | ขอบเขต | สกิลมาตรฐานที่ใช้อ้างอิง |
|-----|--------|--------------------------|
| A | frontend core (UI/Tailwind 4+/Next 16/React 19) | frontend_architecture, nextjs_enterprise, react_19_patterns |
| B | FastAPI security + perf | fastapi_enterprise, security_checklist, auth_rbac_security, api_development_standard, monitoring_logging |
| C | live chat (WS ทั้งสองฝั่ง) | websocket_live_chat, testing_standards |
| D | service request + kanban | testing_standards, api_development_standard |
| E | LINE API / webhook / pseudonym | line_integration, line_messaging_*, line_flex_message_builder |
| F | LIFF + mini app | liff_development, line_mini_app |

### ข้อค้นพบสำคัญ (ตรวจยืนยันด้วยมือก่อนซ่อมทุกรายการ)

- **[CRITICAL][LIFF]** อัปโหลดไฟล์ของพลเมืองพัง 100% — ฟอร์มทั้ง 3 หน้า POST ไป `/api/v1/media` ซึ่งต้องสิทธิ์ผู้ดูแล (`require_permission(KEY_MANAGE_FILES)`, media.py:460-464)
- **[CRITICAL][live chat]** `handle_join_room` (ws_session/handlers.py:41-63) ไม่มี authorization แยก — **ประเมินแล้ว: เป็นสอง-gate โดยออกแบบตาม AGENTS.md** (gate อยู่ที่การเปิดซ็อกเก็ตด้วย `access_live_chat`) → ไม่ซ่อมอัตโนมัติ รอผู้ใช้ตัดสินใจ
- **[HIGH][security]** `DEV_AUTH_BYPASS` สร้างผู้ใช้ผู้ดูแลเองเมื่อไม่มีใน DB (deps.py:67-74)
- **[HIGH][security]** ล็อกข้อมูลส่วนบุคคล (LINE ID/เบอร์โทร) แบบข้อความตรง 13+ จุด ขัดกับสัญญาการเข้ารหัสชื่อผู้ใช้จาก PR #199
- **[HIGH][bug]** ค่าปริยาย `{}` บนคอลัมน์ JSONB `location`/`details` (service_request.py:75,78) แชร์วัตถุเดียวกันข้ามแถว
- **[HIGH][perf]** ไม่มีดัชนี `assigned_agent_id` — kanban/workload ทำ sequential scan
- **[HIGH][bug]** `close_session` ไม่มี optimistic locking; `get_queue_position` โหลดทั้งตาราง
- **[HIGH][bug]** WS client ไม่จับ PONG หมดเวลา → ซอมบี้คอนเน็กชัน
- **[HIGH][perf]** analytics โหลดทั้งตารางคำนวณเปอร์เซ็นไทล์ในหน่วยความจำ *(ยังไม่ซ่อม — รายการเลื่อน)*
- **[MEDIUM]** LIKE wildcard ไม่ถูกหนีในสื่อ/ผู้ใช้/คำขอ, สถานะคำขอจาก LIFF เป็น `None`, นับถอยหลังในเบราว์เซอร์ภายนอก (2 หน้า), ลูกโซ่ที่อยู่กลืนข้อผิดพลาด, `AuthContext` ไม่ memo, theme toggle เขียน localStorage ผิดคีย์ ฯลฯ

## เฟส 2 — ซ่อม (5 เลน ขอบเขตไฟล์ไม่ทับกัน ไม่คอมมิตเอง)

### เลน 1 — LIFF (ปิด 1 CRITICAL)
- ใหม่: `POST /api/v1/liff/media` (backend/app/api/v1/endpoints/liff.py) — ยืนยันตัวตนด้วย LIFF ID token ตามรูปแบบที่มีอยู่, อนุญาตเฉพาะ image/jpeg, image/png, application/pdf, จำกัด 10MB, rate limit เดียวกับการยื่นคำขอ
- ฟอร์ม 3 หน้าชี้ไปที่ใหม่ (service-request:216, service-request-single:182, request-v2:169)
- `status=RequestStatus.PENDING` แทน `None` (liff.py:171)
- `frontend/lib/liff/location-cascade.ts` — ตรวจ `res.ok` ก่อน `.json()` ทั้งอำเภอและตำบล
- นับถอยหลังถูกกั้นด้วย `isInLineApp` ใน request-v2:232 และ service-request-single:291
- ปุ่ม "ยื่นคำขอ" ปิดระหว่างบันทึก (service-request:878)

> **บันทึกแก้ (2026-08-29)**: การชี้ฟอร์มไปที่เอนด์พอยต์ใหม่ในตอนแรก **ยังไม่ได้ปิด CRITICAL จริง** — ฟอร์มทั้ง 3 หน้ายัง `fetch` โดยไม่ส่งเฮดเดอร์ `x-liff-id-token` จึงโดน 401 ในโหมด `LIFF_STRICT_MODE=true` (ค่าปริยาย) อัปโหลดยังคงพัง (พบจาก Codex review: `project-log-md/codex/review-liff-media-prd-prp-round2-20260829.md`, finding A1) — **ปิดสมบูรณ์แล้ว** ตาม PRD/แผน REV 3 (`.claude/PRPs/prds/liff-media-upload-id-token.prd.md` + `.claude/PRPs/plans/liff-media-upload-id-token.plan.md`):
> - ใหม่: `frontend/lib/liff/upload-media.ts` (`uploadLiffMedia`) + `frontend/lib/liff/session-expired.ts` (ค่าคงที่ข้อความเซสชันหมดอายุร่วมกัน)
> - ฟอร์ม 3 หน้าเรียก `uploadLiffMedia(file, idToken)` — ส่งเฮดเดอร์เมื่อมีโทเคน และแจ้งข้อความไทยเมื่อ 401
> - ลดโค้ดซ้ำ: `frontend/lib/liff/submit-service-request.ts` นำเข้าค่าคงที่ร่วมแทนตัวท้องถิ่น
> - เทสถดถอย: หลังบ้าน `tests/test_liff_media_upload.py` (B1–B10, 11 เทส) + หน้าบ้าน `lib/liff/__tests__/upload-media.test.ts` (F1–F4, 6 เทส)
> - หลักฐานด่านตรวจสอบ: `.scratch/liff-media-fix/gates-20260829.txt`
> - เสริมหลัง review (วันเดียวกัน): จำกัดไฟล์แนบสูงสุด 3 ไฟล์ (`LIFF_MAX_ATTACHMENTS` กันถัง rate limit `liff-submit` หมดก่อนส่ง), แสดง `detail` ภาษาไทยจากแบ็กเอนด์เมื่ออัปโหลดล้มเหลว, เปลี่ยนการเทียบสตริงเป็น `SessionExpiredError` + `isSessionExpired`

### เลน 2 — ความปลอดภัยพื้นฐาน
- `app/api/deps.py:60-75` — ตัดเส้นทางสร้างผู้ใช้ผู้ดูแล; คืน 401 เมื่อไม่มีผู้ใช้
- `app/core/security.py` — เพิ่ม `get_password_hash_async` (run_in_executor); แก้ 3 จุดเรียกใน admin_users.py
- ใหม่: `app/core/query_utils.py` (`escape_ilike`) — ใช้ใน media.py + admin_users.py (admin_requests.py มีตัวช่วยท้องถิ่นของตัวเองในเลน 3)
- ใหม่: `app/core/logging_utils.py` (`mask_line_id`, `mask_phone`) — แดงข้อมูลออก 13 จุดใน friend_service, csat_service, webhook, commands, message_handler, postback_handler
- `app/main.py` — ตัวจัดการข้อยกเว้นกลาง (500 แบบไม่มีสแต็ก) + `root()` เป็นอะซิงก์

### เลน 3 — ความสมบูรณ์ของข้อมูลคำขอ
- `service_request.py:75,78` — `default=dict` (เรียกได้) ทั้งสองคอลัมน์
- ดัชนี `assigned_agent_id` + migration `r9s0t1u2v3w4` (ต่อจาก `q8r9s0t1u2v3`, head เดียว) — ข้าม `assigned_by_id` เพราะไม่มีจุดกรอง
- `_escape_ilike()` ใน admin_requests.py + `escape="\\"` ตามรูปแบบของ `conversations.py`
- `frontend/lib/diff-fields.ts` — แยก `null` ออกจากสตริงว่างตามเจตนาของ docstring; อัปเดตเทส (9/9 ผ่าน)

### เลน 4 — เสถียรภาพแชทสด
- `close_session` — `UPDATE ... WHERE status=ACTIVE` + ตรวจ `rowcount`, รีเฟรชก่อนคืนค่า, แพ้เรซคืน `None` (จุดเรียกทั้งสองจัดการ `None` อยู่แล้ว)
- `get_queue_position` — `COUNT(*)` สองตัวแทนโหลดทั้งตาราง
- ส่งแบบสำรวจความพึงพอใจ/การแจ้งเตือนแบบพื้นหลัง (`asyncio.create_task` + ชุดกัน GC)
- `send_message`/`send_media_message` — บันทึกก่อนส่งไปยัง LINE; รวมกรรมสิทธิ์การคอมมิตเป็นของผู้เรียก
- `lib/websocket/client.ts` — ตัวนับ PONG พลาด ≥2 ครั้ง = บังคับเชื่อมต่อใหม่
- `messageQueue.ts` — เต็มแล้วคืน `false` + เตือนครั้งเดียว ไม่ทิ้งเงียบ
- `useConversationSync` — รวมข้อความแง่ดีแทนเขียนทับทั้งรายการ
- แดงข้อมูลออก 4 จุดในล็อกด้วย `maskLineUserId`

### เลน 5 — เล็กน้อยหน้าบ้าน
- `AuthContext` — memo ค่า `value`; ใช้ `readErrorMessage` จาก `lib/api-error.ts` แทนตัวซ้ำซ้อน
- `Modal` — `aria-describedby` ผ่าน `useId()` เมื่อมีคำอธิบาย
- `CommandPalette` — ใช้ `useTheme().toggleTheme` (แก้คีย์ `'jsk-theme'` ผิด)
- `app/layout.tsx` — เอา `suppressHydrationWarning` ออกจาก `<body>`

### งานที่ผมทำเองหลังทีมส่ง
- แก้ `tests/test_live_chat_service.py::test_close_active_session` ให้เข้ากับล็อกใหม่ + เพิ่ม `test_close_session_race_lost`
- อัปเดต `tests/test_booking_migration.py` ให้หัวที่คาดหวังเป็น `r9s0t1u2v3w4`

## เฟส 3 — ด่านตรวจสอบ (ทั้งหมดเขียว)

| ด่าน | ผล |
|------|-----|
| แบ็กเอนด์เต็มชุด (ผ่าน WSL, `DATABASE_URL` ชี้ `127.0.0.1:5434`) | **1043 ผ่าน** + เทส LIFF 7 + migration 9 |
| วิเทสต์หน้าบ้าน | **564/564** (65 ไฟล์) |
| `tsc --noEmit` | สะอาด |
| อีเอสลินต์ไฟล์ที่เปลี่ยน | ไม่มีข้อผิดพลาด (ข้อผิดพลาด 185 ตัวใน `npm run lint` ทั้งโปรเจกต์เป็นหนี้เดิมของ `main`) |
| การสร้าง | สำเร็จ |
| อะเล็มบิก | หัวเดียว `r9s0t1u2v3w4` |

## การตัดสินใจที่ค้างกับผู้ใช้
1. **การอนุญาตเข้าห้องแชท** — เพิ่มด่านที่สองระดับห้อง หรือคงสองเกตตามออกแบบ
2. **รายการที่เลื่อน** — ตัวคอมไพล์รีแอกต์ + แคชคอมโพเนนต์ (ต้องรื้อการจำค่าทั้งหมด), หน้าผู้ดูแลเป็นองค์ประกอบเซิร์ฟเวอร์, รวม 3 ฟอร์มเป็นโมดูลเดียว (ดูรายงานสถาปัตยกรรม ผู้สมัครข้อ 4), ตัวจำกัดอัตราข้ามเครื่องผ่านเรดิส, ชั้นดีดัฟที่สองของเว็บฮุค, เปอร์เซ็นต์ไทล์แบบฝั่งเซิร์ฟเวอร์

## ไฟล์ที่เปลี่ยน (35 ไฟล์)
- ดัดแปลง 32 + ใหม่ 3 (`logging_utils.py`, `query_utils.py`, migration `r9s0t1u2v3w4`)
- ยังไม่ถูกจัดขั้น — รอผู้ใช้สั่งคอมมิต/เปิดคำขอดึง
