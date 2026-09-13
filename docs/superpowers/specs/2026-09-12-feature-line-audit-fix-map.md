# PRD: แผนแก้ไขผลตรวจ Audit — LINE / LiveChat / LIFF / Media / Settings (4 Critical + High Groups)

> Branch: feat/feature-line-audit-fix-map
> วันที่: 2026-09-12
> ประเภท: Research-only + แผนแก้ไขแบบแบ่ง Wave (ยังไม่ลงมือแก้โค้ด)
> ภาษา: คำอธิบายสำหรับผู้ใช้เป็นภาษาไทย, code / identifiers คงภาษาอังกฤษ

## Problem Statement

จากการตรวจ audit พบปัญหาด้านความปลอดภัยและความถูกต้องจำนวน 5 กลุ่มระดับ Critical (C1–C5) และปัญหาระดับ High อีกหลายกลุ่มที่กระทบงานประจำวันของผู้ใช้จริง:

- เจ้าหน้าที่โอนสายแชทพร้อมกันได้โดยไม่มีการป้องกัน (C1) ทำให้เคสหลุดจากเจ้าของตัวจริง เกิดการตอบซ้ำหรือเคสหาย
- โหมดผ่อนผันของ LIFF ยังเขียนข้อมูลลงฐานข้อมูลโดยไม่ยืนยันตัวตน (C2) ทำให้มีคำร้องขยะ ไม่ทราบตัวตนผู้ส่ง และเสี่ยงถูกสวมรอยเป็น LINE user คนอื่น
- ไฟล์ private ถูกเปิดดูได้โดยไม่ต้องมี token จริง (C3) เพราะการเปรียบเทียบค่าว่างกับค่าว่างถือว่าผ่าน ทำให้ข้อมูลอ่อนไหวรั่วไหล
- รหัสผ่าน / token ของระบบถูกเก็บเป็นข้อความธรรมดาใน SystemSetting (C4) ใครเข้าฐานข้อมูลได้ก็อ่านได้ทันที
- หน้าเช็กสุขภาพระบบเปิดให้ใครก็เรียกได้ และแสดงข้อความ error ดิบ (C5) ทำให้ผู้ไม่หวังดีเห็นโครงสร้างระบบ
- กลุ่ม High ทำให้ระบบช้า (แดชบอร์ดเรียก 15 queries, คำนวณ percentile ใน Python, Redis N+1), แชทมีผี (ghost push, presence storm), ส่งออกไฟล์ใหญ่แล้วหน่วยความจำหมด (OOM), ปุ่มสร้างข้อมูลชนกัน (409), ข้อความ broadcast ไม่มี dry-run, rich menu พรีวิวติด 403, รายงานมี PII หลุดใน CSV ฯลฯ

ถ้าไม่แก้ ความเชื่อมั่นของเจ้าหน้าที่และประชาชนจะลดลง งานค้าง ตรวจสอบย้อนหลังไม่ได้ และเสี่ยงผิดนโยบายคุ้มครองข้อมูล

## Solution

แก้เป็น 4 Wave ตามความเสี่ยง โดยยึดหลัก: ปิดรูรั่วความปลอดภัยก่อน แล้วค่อยแก้ความถูกต้อง แล้วจึงแก้ประสิทธิภาพและ UX ของฝั่ง admin / frontend

- **Wave A — Critical security (C2, C3, C5):** ปิดทางเขียนข้อมูลโดยไม่ยืนยันตัวตน, ปิดทางดูไฟล์ private โดยไม่มี token, ล็อกหน้า health + ซ่อน error ดิบ
- **Wave B — Critical correctness (C1, C4):** ทำให้การโอนสายแข่งกันได้อย่างปลอดภัยด้วย conditional UPDATE, ย้าย secrets จาก SystemSetting ไป Credential ที่เข้ารหัส Fernet พร้อมแนวทางย้ายข้อมูลเดิม
- **Wave C — High backend:** ประสิทธิภาพ analytics, ความทนทานของ live-chat / broadcast / intent / reply-objects / requests / booking / rich-menu scheduler / friends / users / reports
- **Wave D — Admin / frontend + Mediums:** ประสบการณ์ผู้ใช้ฝั่ง admin (pagination, export, canned responses, LIFF UX, rich-menu wizard, design tokens, สิทธิ์ credentials / business-hours)

ทุก Wave ต้องผ่าน test ก่อน merge และเคารพมาตรฐาน AGENTS.md: async FastAPI, Pydantic V2, Thai UI, SQLAlchemy select() style, HTTPException ตาม code เดิมของ repo

### ข้อจำกัดไฟล์ทับซ้อน (ต้องทำตามลำดับ)

- liff.py ถูกใช้ร่วมโดย C2 และ H5 (LIFF hardening) — ให้ Wave A เป็นเจ้าของไฟล์ก่อน แล้ว Wave C ค่อยต่อ ห้ามแก้พร้อมกันสอง branch
- media.py ถูกใช้ร่วมโดย C3 และงานพรีวิว / imageless sync — ให้ Wave A ปิดรู security ก่อน แล้วค่อยทำ preview / sync ใน Wave C/D
- sessions.py มีเฉพาะ C1 — แยกทำได้อิสระ ไม่ชนกับใคร แต่ห้ามเปลี่ยน signature ของ claim / close พร้อมกัน

## User Stories

### Wave A — Critical security

1. As a ประชาชนผู้ยื่นคำร้องผ่าน LIFF, I want ระบบปฏิเสธคำร้องที่ไม่มี LIFF ID token ที่ถูกต้องเมื่อเปิด strict mode, so that ไม่มีใครสวมรอยเป็นฉันได้
2. As a เจ้าหน้าที่รับเรื่อง, I want คำร้องที่เข้ามามีตัวตน LINE ที่ยืนยันแล้วเท่านั้น, so that ฉันไม่ต้องเสียเวลาตามเคสขยะ
3. As a ผู้ดูแลระบบ, I want โหมดผ่อนผัน (LIFF_STRICT_MODE=false) ไม่เขียนข้อมูลจริงลงฐานข้อมูลอีกต่อไป แต่บันทึกเป็น log เพื่อติดตาม, so that ช่วงย้ายระบบไม่สร้างข้อมูลสกปรก
4. As a ผู้ดูแลระบบ, I want ตัวอย่าง env ทุกไฟล์มีค่า default เป็น strict (true) พร้อมคำอธิบายวิธี rollback, so that deploy ใหม่ไม่เผลอเปิดช่องโหว่
5. As a ประชาชนเจ้าของไฟล์แนบ, I want ไฟล์ private ของฉันเปิดดูไม่ได้ถ้าไม่มี token ที่ถูกต้อง, so that ข้อมูลส่วนตัวไม่รั่วไหล
6. As a ผู้ดูแลระบบ, I want token ว่างกับ token ว่างถือว่าไม่ผ่านเสมอ, so that ไม่มีทางลัดด้วย query ว่าง
7. As a ผู้ดูแลระบบ, I want หน้า health แบบละเอียดเรียกได้เฉพาะผู้มีสิทธิ์, so that คนภายนอกส่องสถานะระบบไม่ได้
8. As a ผู้ดูแลระบบ, I want ข้อความ error จาก health ไม่แสดงข้อความดิบ (str(e)) แต่บันทึก log ฝั่ง server แทน, so that ผู้โจมตีไม่เห็นชื่อ host / password / โครงสร้าง DB

### Wave B — Critical correctness

9. As a เจ้าหน้าที่ (operator A), I want เมื่อฉันโอนสายให้ operator B แล้ว การโอนซ้อนจากอีกคนต้องถูกปฏิเสธด้วย 409, so that เคสไม่ถูกแย่งกันโดยไม่รู้ตัว
10. As a เจ้าหน้าที่ปลายทาง (operator B), I want ฉันเห็นเฉพาะเคสที่โอนมาหาฉันจริง ไม่ใช่เคสที่ถูกโอนซ้ำไปหาคนอื่น, so that ฉันไม่ตอบผิดเคส
11. As a หัวหน้าทีม, I want ประวัติการโอน (transfer_count / transfer_reason / last_activity_at) ถูกต้องแม้มีการโอนพร้อมกัน, so that ตรวจสอบย้อนหลังได้
12. As a ผู้ดูแลระบบ, I want รหัส LINE / Telegram / N8N ถูกเก็บแบบเข้ารหัสใน Credential ไม่ใช่ข้อความธรรมดาใน SystemSetting, so that ฐานข้อมูลหลุดก็ยังอ่านรหัสไม่ได้
13. As a ผู้ดูแลระบบ, I want มีสคริปต์ย้ายค่า secret เดิมจาก SystemSetting ไป Credential ครั้งเดียวพร้อมสำรองข้อมูล, so that ย้ายระบบโดยไม่ทำรหัสหาย
14. As a ผู้ดูแลระบบ, I want หลังย้ายแล้ว key ลับเดิมใน SystemSetting ถูกห้ามใช้และมีคำเตือนชัดเจนในหน้า admin, so that ไม่มีใครเผลอกลับไปเก็บแบบเดิม

### Wave C — High backend

15. As a หัวหน้าทีม, I want แดชบอร์ด analytics โหลดเร็วด้วย query รวมชุดเดียว + cache Redis + schema ตอบกลับที่กำหนดไว้, so that เปิดหน้าสถิติแล้วไม่ค้าง
16. As a ผู้ดูแลระบบ, I want ค่า percentile (p50 / p95) คำนวณในฐานข้อมูล ไม่ใช่ดึงทั้งตารางมาคำนวณใน Python, so that หน่วยความจำไม่พุ่ง
17. As a เจ้าหน้าที่ live-chat, I want พารามิเตอร์ lock ของ get_active_session ทำงานจริงหรือถูกถอดออกถ้าไม่ใช้, so that ไม่มี code หลอกว่าปลอดภัย
18. As a ประชาชนใน LINE, I want ไม่ได้รับข้อความผี (ghost push) หลัง session ปิดหรือถูกโอนไปแล้ว, so that ฉันไม่สับสน
19. As a เจ้าหน้าที่, I want สถานะ online (presence) ไม่อัปเดตถี่จนเกิด storm เมื่อมีหลาย tab เปิดพร้อมกัน, so that ระบบไม่หน่วง
20. As a เจ้าหน้าที่, I want ประวัติแชทใช้ pagination ฝั่ง server พร้อม cursor / limit ที่ตรวจแล้ว, so that เปิดเคสเก่าแล้วไม่ค้าง
21. As a หัวหน้าทีม, I want ส่งออกบทสนทนาไฟล์ใหญ่ทำแบบ stream ไม่โหลดทั้งก้อนจน OOM และ PDF ภาษาไทยฟอนต์ไม่แตก, so that ส่งมอบงานได้จริง
22. As a เจ้าหน้าที่, I want canned response ที่ข้อความซ้ำกันถูก normalize ก่อนตรวจซ้ำ และได้ 409 ที่อ่านรู้เรื่อง, so that ฉันไม่สร้าง shortcut ซ้ำโดยไม่ตั้งใจ
23. As a เจ้าหน้าที่, I want การอัปเดต canned response พร้อมกันไม่เขียนทับกันเงียบ (collision ถูกตรวจ), so that ข้อความมาตรฐานไม่เพี้ยน
24. As a ประชาชนผู้ยื่น LIFF, I want การเรียก LINE verify มี timeout และลองใหม่แบบจำกัด, so that กดส่งแล้วไม่ค้างนาน
25. As a ผู้ดูแลระบบ, I want LIFF GET มี rate-limit และ PATCH ที่ส่ง None ไม่ทำ server 500 แต่ได้ 422 ที่อ่านรู้เรื่อง, so that ระบบทนมือและ debug ง่าย
26. As a เจ้าหน้าที่ broadcast, I want มีปุ่ม dry-run / ตัวอย่างก่อนส่งจริง และรองรับ OBJECT_REF, so that ไม่ส่งผิดถึงประชาชนทั้งระบบ
27. As a เจ้าหน้าที่ broadcast, I want สถิติการส่งถูกต้อง, เวลา scheduled_at คิด timezone ตรงกัน, และ multicast ที่ล้มเหลวมี backoff, so that ส่งรอบดึกไม่พลาด
28. As a แอดมิน chatbot, I want intent regex ถูก compile ล่วงหน้า มีกัน ReDoS มี escape wildcard และเรียงลำดับชัดเจน, so that bot ตอบเร็วและไม่ค้างด้วย pattern พิษ
29. As a แอดมิน chatbot, I want reply object $name ตรวจรูปแบบเคร่งครัด และการอัปเดตมี validation, so that ไม่พังเพราะพิมพ์ $ ผิด
30. As a หัวหน้าทีม, I want การมอบหมายงาน (assignment) มี guard กันแย่งงาน และห้ามลบงานโดยไม่มี audit log, so that งานไม่หายไร้ร่องรอย
31. As a แอดมิน, I want enum ของสถานะคำร้องตรงกันทั้ง backend / frontend / DB, so that ไม่เจอสถานะผีที่หน้าเว็บแสดงไม่ได้
32. As a ประชาชนผู้จองคิว, I want เพดานจอง 62 วันกับค่า advance_days อธิบายตรงกันและตรวจที่เดียวกัน, so that ฉันไม่จองได้แต่ถูกยกเลิกทีหลัง
33. As a เจ้าหน้าที่คิว, I want สถานะ terminal (เช่น ยกเลิก / เสร็จ) เปลี่ยนย้อนกลับไม่ได้ และ PATCH ที่ส่ง None ได้ 422, so that คิวไม่กลับมามีชีวิตเอง
34. As a แอดมิน rich menu, I want พรีวิวเมนูที่ยังไม่มีรูปไม่ติด 403 แต่แสดง placeholder ที่เข้าใจได้, so that ฉันตรวจงานได้ก่อนอัปโหลดรูปจริง
35. As a แอดมิน rich menu, I want sync เมนูที่ไม่มีรูปถูกข้ามอย่างชัดเจน และ scheduler ล้มทีละเมนูไม่ล้มทั้งชุด พร้อมคิด timezone ตรง, so that ตั้งเวลาทั้งคืนไม่พังเพราะเมนูเดียว
36. As a แอดมิน friends, I want รายชื่อเพื่อนมี limit กันโหลดเกิน มี masking PII และ enum ตรงกัน, so that เปิดหน้าพันรายชื่อแล้วไม่ช้าและไม่เห็นข้อมูลเกินจำเป็น
37. As a แอดมิน users, I want ข้อมูล PII ถูก mask ตามสิทธิ์ RBAC, so that เจ้าหน้าที่ทั่วไปไม่เห็นเบอร์ / LINE ID เกินหน้าที่
38. As a ผู้ดูแลระบบ, I want งาน resize รูปมีกัน CSRF และ key หมดอายุ, so that ไม่มีใครยิงลิงก์แปลงรูปเล่นได้
39. As a หัวหน้าทีม, I want รายงาน CSV ไม่มี PII ดิบ และพารามิเตอร์ PDF ตรงกันทั้ง frontend / backend, so that ส่งออกให้ผู้บริหารได้อย่างปลอดภัย

### Wave D — Admin / frontend + Mediums

40. As a เจ้าหน้าที่ admin, I want ปุ่ม (Button) ดีไซน์ใหม่ไม่กระทบทั้งระบบ (blast radius จำกัด) และ token สีตรงกัน, so that หน้าจอไม่เพี้ยนหลังอัปเกรด
41. As a ผู้ดูแลระบบ, I want สิทธิ์จัดการ credentials และเวลาทำการ (business-hours) อยู่ใน permission matrix ครบ, so that มอบหมายงานได้โดยไม่ต้องให้สิทธิ์ super admin เกินจำเป็น
42. As a เจ้าหน้าที่ใหม่, I want ทุกหน้าจอ admin เป็นภาษาไทยที่เข้าใจง่าย มีข้อความ error ภาษาไทย, so that ใช้งานได้โดยไม่ต้องถาม IT
43. As a หัวหน้าทีม, I want ทุก action สำคัญมี audit log ค้นได้, so that ตรวจสอบว่าใครทำอะไรเมื่อไรได้

## Implementation Decisions

### ภาพรวม Wave และลำดับ

- Wave A ทำก่อนและห้ามขนานกันบนไฟล์เดียวกัน: ปิดรู C2 / C3 / C5 ให้หมดก่อน แล้วค่อยแตะไฟล์นั้นใน Wave C/D
- Wave B ทำคู่ขนานกับ Wave A ได้เพราะไฟล์ไม่ชน (sessions vs liff / media / health) ยกเว้นต้องแชร์ migration window เดียวกัน
- Wave C แบ่งเป็น lane ย่อยตามโดเมน (analytics, live-chat runtime, chat history/export, canned, LIFF hardening, broadcast, intent/reply, requests/booking, rich-menu/friends/users/reports) แต่ละ lane มี API contract ของตัวเอง
- Wave D ทำท้ายสุดเพราะพึ่งพา API ที่นิ่งแล้วจาก Wave C

### D1 — LIFF transition mode (C2)

-  modules: LIFF submission flow, LIFF verification helper, env examples, migration-controls doc
-  decision: เมื่อไม่มี x-liff-id-token และ LIFF_STRICT_MODE=false ต้องไม่เขียน ServiceRequest / DebtMediationRequest / MediaFile ลง DB อีก ให้ตอบ 401 หรือ 202 แบบไม่สร้างข้อมูลตามนโยบายที่เลือก แล้วบันทึก metric / log ว่าเกิด fallback ขึ้น
-  decision: ค่า default ของ LIFF_STRICT_MODE ใน code คือ true (ยืนยันแล้ว) แต่ env examples ทุกไฟล์ยังเป็น false ให้แก้ examples เป็น true พร้อมคอมเมนต์วิธี rollback ชั่วคราว
-  API contract: POST /liff/service-requests, POST /liff/debt-mediation, POST /liff/media — ไม่มี token + strict=false → ไม่สร้าง row, response บอกว่าต้องยืนยันตัวตนก่อน (คง status code เดิมของ strict mode คือ 401 เพื่อให้ frontend จัดการทางเดียว)
-  decision-encoding snippet (จากพฤติกรรมเดิมที่ต้องเปลี่ยน):
  // BEFORE: unverified branch writes DB
  // AFTER: unverified branch must not write DB
  type LiffDecision = { mode: string; hasToken: boolean; writesDb: boolean };
  const after: LiffDecision = { mode: stringify(false), hasToken: false, writesDb: false };

### D2 — Media private bypass (C3)

-  modules: public file serving, private media gating, token issuance / revocation
-  decision: แยกทาง public กับ private ชัดเจน — private ต้องมี public_token ที่ไม่ว่างทั้งฝั่ง row และฝั่ง request และต้องตรงกันแบบ constant-time เท่านั้น ค่าว่างชนค่าว่างต้องถือว่าไม่ผ่าน
-  decision: revoke ต้องล้าง token + ตั้ง is_public=false ในทรานแซกชันเดียว, create ต้องสร้าง token ใหม่ด้วย UUID สุ่ม
-  API contract: GET /media/{id}?token=... — ไม่มี token / token ว่าง / token ไม่ตรง → 403 เสมอ ไม่แยกข้อความจนเดาได้ว่ามีไฟล์อยู่หรือไม่เกินจำเป็น
-  decision-encoding snippet:
  // private access passes only when both sides non-empty and equal
  type MediaGate = { stored: string; presented: string; allow: boolean };
  const rule: MediaGate = { stored: stringify(true), presented: stringify(true), allow: true };

### D3 — Health hardening (C5)

-  modules: basic health, detailed health, websocket health, pseudonym-gate status
-  decision: หน้า basic health คง public ได้แต่ห้ามมี error ดิบ, หน้า detailed / websocket ต้องผ่าน get_current_admin, หน้า pseudonym-gate คง admin-only ตามเดิม
-  decision: ทุก except ให้ log ฝั่ง server ด้วย logger.exception แล้วตอบข้อความกลาง เช่น database unavailable โดยไม่มี str(e) ปนใน response
-  API contract: GET /health → { status, database, redis } ไม่มีฟิลด์ *_error ที่มีข้อความดิบ, GET /health/detailed และ GET /health/websocket → 401 เมื่อไม่มีสิทธิ์

### D4 — Transfer race (C1)

-  modules: session lifecycle (claim / close / transfer), active-session loader
-  decision: transfer_session ต้องใช้ conditional UPDATE แบบเดียวกับ claim / close คือ UPDATE ... WHERE id AND status ACTIVE AND operator_id = from_operator_id แล้วตรวจ rowcount ถ้าไม่ใช่ 1 ให้ตอบ 409 / 404 ตามกรณี ไม่ใช่แก้ object ตรงตรง
-  decision: พารามิเตอร์ lock ของ get_active_session ที่ปัจจุบันไม่ถูกใช้ ให้ใช้ with_for_update ในทรานแซกชันของ transfer หรือถอดออกถ้าตกลงใช้ conditional UPDATE อย่างเดียว เพื่อไม่ให้มี code หลอกว่าล็อกแล้ว
-  decision: transfer_count / transfer_reason / last_activity_at ต้องอัปเดตใน UPDATE เดียวกัน ไม่แยกสองรอบ
-  API contract: POST transfer — สำเร็จ 200 พร้อม session ใหม่, ชนกัน 409 พร้อมข้อความไทยว่าเจ้าหน้าที่อีกคนรับไปแล้ว, session ไม่อยู่แล้ว 404
-  decision-encoding snippet:
  // atomic handoff: only the current owner in ACTIVE can move one row
  type TransferWhere = { id: number; status: string; owner: number };
  const where: TransferWhere = { id: 0, status: stringify(true), owner: 0 };

### D5 — Secrets migration (C4)

-  modules: SystemSetting store, Credential store (Fernet), settings admin API, startup guards
-  decision: ห้ามเก็บ secret ใหม่ใน SystemSetting.value อีก ให้ SystemSetting เก็บเฉพาะค่าทั่วไป ส่วน secret ทุกชนิดไป Credential.credentials ที่เข้ารหัสแล้ว
-  decision: มี migration ครั้งเดียวที่อ่าน SystemSetting key ที่เป็น secret, เข้ารหัสเข้า Credential, ตรวจว่าอ่านกลับได้, แล้วลบหรือ mask ค่าเดิม พร้อมสำรองข้อมูลก่อนเสมอ
-  decision: ENCRYPTION_KEY ต้องบังคับใน production (มี guard อยู่แล้ว) และมี production guard ห้าม seed secret แบบ plaintext
-  Schema: Credential(provider, name, credentials_encrypted, metadata_json, is_active, is_default) — SystemSetting ไม่เพิ่มคอลัมน์ใหม่ แต่เพิ่ม validation ฝั่ง service ว่า key ใน deny-list ต้องปฏิเสธ
-  API contract: GET /settings ซ่อนค่า secret (mask), POST /credentials รับค่าดิบครั้งเดียวแล้วเก็บแบบเข้ารหัส, PATCH ห้ามส่ง secret ผ่าน settings endpoint อีก

### D6 — Analytics perf (High)

-  modules: live-kpis, operator-performance, hourly-stats, dashboard aggregate, Redis cache layer
-  decision: รวม dashboard จาก 15 queries เหลือ query รวมชุดเดียว (aggregate + window function) แล้ว cache ต่อ dashboard+days ด้วย TTL สั้น
-  decision: percentile คำนวณใน DB (percentile_cont / percentile_disc) ไม่ดึงทั้งตารางมา sort ใน Python
-  decision: แก้ Redis N+1 ด้วย pipeline / mget รอบเดียว และกำหนด Pydantic response schema ให้ dashboard เพื่อกัน field งอกไม่รู้ตัว
-  API contract: GET /analytics/dashboard?days=7 → { kpis, trends, funnel, heatmap, percentiles, generated_at } พร้อม header หรือ field บอก cache hit

### D7 — Live-chat runtime (High)

-  modules: ConnectionManager, session lifecycle, LINE push sender, presence tracker
-  decision: ใช้ lock / conditional UPDATE ให้ครบทุกทางเปลี่ยนเจ้าของ ไม่ใช่เฉพาะ claim / close
-  decision: ghost push — ก่อน push ไป LINE ต้องตรวจว่า session ยัง ACTIVE และ operator ยังเป็นเจ้าของอยู่ ถ้าไม่ใช่ให้ทิ้งพร้อม log
-  decision: presence storm — debounce / throttle การอัปเดต online ด้วย Redis expiry แทนการเขียน DB ทุก heartbeat
-  API contract: WebSocket event transfer / close / presence — ถ้า state ไม่ตรงให้ส่ง error event ภาษาไทยแล้วให้ client refresh แทนการค้าง

### D8 — Histories / export (High)

-  modules: chat history query, CSV export, PDF export (Thai font)
-  decision: ประวัติแชทบังคับ server pagination (limit / cursor / order) ห้าม client ดึงทั้งหมดแล้วแบ่งเอง
-  decision: export ใหญ่ทำแบบ streaming response (async generator) ไม่รวม string ทั้งก้อนในหน่วยความจำ
-  decision: PDF ฝังฟอนต์ไทย (เช่น Noto Sans Thai / TH Sarabun) ใน container / asset pipeline และมี test ตรวจว่าอักขระไทยไม่เป็นกล่องสี่เหลี่ยม
-  API contract: GET /live-chat/histories?cursor=...&limit=... → { items, next_cursor }, GET /export?format=csv|pdf → stream พร้อม Content-Disposition ภาษาไทยที่ encode ถูกต้อง

### D9 — Canned responses (High)

-  modules: canned CRUD, duplicate check, update collision guard
-  decision: normalize ข้อความ (trim / collapse space / lowercase ตามภาษา) ก่อนตรวจซ้ำ และตอบ 409 พร้อมชื่อรายการที่ชน
-  decision: update ใช้ optimistic concurrency (version / updated_at ตรวจ) ถ้าชนให้ 409 ไม่เขียนทับเงียบ
-  API contract: POST /canned → 201 หรือ 409 { conflicting_name }, PATCH /canned/{id} → 200 หรือ 409 หรือ 422

### D10 — LIFF hardening H5 (ต่อจาก C2)

-  modules: verify helper (httpx), rate-limit, validation schemas
-  decision: httpx ทุกครั้งต้องมี timeout (เช่น connect 3s / read 5s) + จำกัด retry และจับ error เป็น 502 ไม่ใช่ 500
-  decision: LIFF GET ต้องมี rate-limit เหมือน POST, PATCH ที่ได้ None ต้องตอบ 422 ผ่าน Pydantic exclude_none / required check ไม่ปล่อยให้ถึง DB แล้ว 500
-  decision: ปรับ service_request_liff schema กับ debt_mediation_liff schema ให้ตรงกับ DB (field mapping, phone format, attachments) ลด validation drift
-  API contract: คง path เดิม เพิ่ม 429 / 502 / 422 ที่ frontend จัดการได้ด้วยข้อความไทย

### D11 — Broadcast (High)

-  modules: broadcast composer, OBJECT_REF resolver, stats collector, scheduler (scheduled_at), multicast sender
-  decision: เพิ่ม dry-run ที่ validate + แสดงกลุ่มเป้าหมายโดยไม่ส่งจริง, OBJECT_REF ต้อง resolve + ตรวจสิทธิ์ก่อนส่ง
-  decision: stats นับ sent / failed / read แยกจริง ไม่รวมกันมั่ว, scheduled_at เก็บ UTC และแสดงตาม Asia_Bangkok ฝั่ง UI
-  decision: multicast ที่ล้มให้ backoff แบบ exponential + จำกัดรอบ แล้วบันทึก failed token เพื่อล้างรอบถัดไป
-  API contract: POST /broadcasts { content, targets, scheduled_at, dry_run } → dry_run=true ได้ preview ไม่สร้างงานจริง

### D12 — Intent / reply objects (High)

-  modules: intent matcher, reply-object store
-  decision: compile regex ตอนโหลดครั้งเดียว ไม่ compile ต่อข้อความ, มี timeout / ความยาว pattern จำกัดกัน ReDoS, wildcard ต้อง escape ก่อนแปลงเป็น regex, order_by ชัดเจน (priority แล้ว created_at)
-  decision: reply object $name ใช้ regex เข้ม (เช่น ตัวอักษร / ตัวเลข / underscore ความยาวจำกัด) ไม่ใช่ $100 แบบกว้างที่ตีความผิดได้ และ update มี validation เต็มรูปแบบ
-  API contract: POST /intents { pattern, priority } → 201 หรือ 422 พร้อมเหตุผล, GET /intents?order=priority → เรียงตรงตามที่ matcher ใช้จริง

### D13 — Requests / booking / rich-menu / friends / users / reports / design / permissions

-  requests: assignment guard (เฉพาะเจ้าของหรือหัวหน้าถึงย้ายงานได้), delete ต้องมี audit log เสมอ, enum สถานะรวมศูนย์ที่เดียว
-  booking: รวมเพดาน 62 วันกับ advance_days เป็นกติกาชุดเดียว (min / max ตรวจที่ schema เดียวกัน), terminal transition ห้ามย้อน (CANCELLED / DONE เป็นปลายทาง), PATCH None → 422
-  rich-menu: preview ไม่ใช้ 403 พร่ำเพรื่อ (imageless ได้ placeholder), sync ข้ามเมนูที่ไม่มีรูปพร้อมเหตุผล, scheduler ลองทีละเมนู (per-menu try) ไม่ล้มทั้งชุด, TZ เก็บ UTC แสดง Asia_Bangkok
-  friends: list มี limit / pagination, mask เบอร์ / LINE ID ตามสิทธิ์, enum event ตรงกัน
-  users: PII mask ตาม RBAC (ดูเต็มได้เฉพาะ role ที่กำหนด), admin list ไม่ส่ง password hash / token
-  image resize: ต้องมี auth + CSRF + signed key หมดอายุ ไม่ใช่ URL เดาได้
-  reports: CSV ตัด PII ดิบออกหรือ mask, พารามิเตอร์ PDF (orientation / font / locale) ตรงกันทั้งสองฝั่ง
-  design: Button ใหม่ทำแบบ opt-in / codemod ทีละหน้า ไม่เปลี่ยน global ทีเดียว, token สีรวมศูนย์
-  permissions: เพิ่ม key ขาด (จัดการ credentials, แก้ business-hours) เข้า permission matrix พร้อม DEFAULT_POLICY ชัดเจน

## Testing Decisions

- หลัก: ทดสอบพฤติกรรมภายนอก (status code / response shape / DB state / ข้อความไทยที่ user เห็น) ไม่ทดสอบ implementation detail ภายใน
- Wave A ต้องมี regression test ก่อนแก้ (red) แล้วเขียวหลังแก้:
  -  C2: POST LIFF โดยไม่มี token ใน strict=false ต้องไม่มี row ใหม่ใน ServiceRequest / DebtMediationRequest / MediaFile (นับ row ก่อนหลัง)
  -  C3: GET private media ด้วย token ว่าง / ไม่ส่ง token / token ผิด → 403 ทั้งสามกรณี, token ถูก → 200
  -  C5: GET detailed / websocket health โดยไม่มีสิทธิ์ → 401/403 และ response ไม่มีข้อความดิบของ exception
- Wave B:
  -  C1: ยิง transfer ชนกันสองครั้งพร้อมกัน (asyncio.gather) ต้องมีแค่ครั้งเดียวสำเร็จ อีกครั้ง 409/404 และ transfer_count เพิ่มแค่ 1
  -  C4: ตั้งค่า secret ใหม่ต้องอ่านจาก Credential ถอดรหัสได้, ตาราง SystemSetting ไม่มี plaintext, test ตรวจว่า key deny-list ถูกปฏิเสธ
- Wave C/D (High):
  -  analytics: assert จำนวน query ต่อ dashboard ลดลง (ใช้ query counter), percentile ตรงกับค่าที่ DB คำนวณ, cache hit รอบสองไม่ยิง DB ซ้ำ
  -  live-chat: test ghost push (ปิด session แล้ว push ต้องไม่ส่ง), presence burst (heartbeat 100 ครั้งใน 10 วินาทีต้องเขียน DB ไม่เกิน threshold)
  -  histories/export: ขอ limit เกิน max ถูก clamp, export 10k rows ต้อง stream โดยหน่วยความจำไม่พุ่ง, PDF ไทยเปิดอ่านได้
  -  canned: สร้างข้อความซ้ำต่างกันแค่ space/case ต้อง 409, update ชน version ต้อง 409
  -  LIFF: mock LINE verify ให้ timeout ต้องได้ 502 ไม่ใช่ 500, PATCH None ได้ 422
  -  broadcast: dry_run ไม่สร้างงานจริง, scheduled_at ข้าม timezone ยังตรง, multicast ล้มมี retry ตาม backoff
  -  intent: pattern อันตราย (เช่น nested quantifier ยาว) ถูกปฏิเสธ 422, wildcard escape ตรง, order_by ตรงกับ matcher
  -  booking: จองเกิน 62 วัน / เกิน advance_days ได้ 422 ข้อความไทย, terminal ย้อนกลับได้ 409/422
  -  rich-menu: preview ไม่มีรูปได้ 200 + placeholder, scheduler ล้มเมนูเดียวไม่ล้มทั้งชุด
  -  reports/friends/users: CSV ไม่มีเบอร์ดิบเมื่อสิทธิ์ไม่พอ, PDF param ผิดได้ 422
- prior art ใน repo: ทำตาม backend/tests/test_liff_token.py (toggle LIFF_STRICT_MODE + fake LINE verify), test_config_migration_controls.py (assert default true), และ live-chat WebSocket helpers (drain_auth_responses / auth_websocket) สำหรับ test concurrency
- ทุก Wave รัน: python -m pytest (backend), npm run test:unit + tsc + lint (frontend) และ Alembic upgrade/downgrade อย่างน้อยหนึ่งรอบเมื่อมี migration

## Out of Scope

- ไม่เปลี่ยน LINE SDK รุ่น / ไม่ย้ายจาก httpx ไป lib อื่น
- ไม่ redesign หน้า admin ทั้งระบบ (Wave D ทำเฉพาะจุดที่ audit ชี้)
- ไม่ทำ multi-tenant / ไม่แยก DB ตามสาขา
- ไม่เปลี่ยน auth จาก cookie-only กลับเป็น bearer/dual
- ไม่ลบ SystemSetting ทิ้งทั้งตาราง (แค่ห้ามเก็บ secret + ย้ายค่าออก)
- ไม่ทำ full-text search ใหม่ให้ friends / requests (แค่ limit + pagination + enum ให้ตรง)
- ไม่ทำ mobile app แยกจาก LIFF
- ไม่ปรับโครงสร้าง WebSocket protocol ใหม่ทั้งหมด (แก้เฉพาะ lock / ghost push / presence)

## Further Notes

- ความจริงที่ยืนยันจากการอ่าน code วันที่ 2026-09-12:
  -  transfer_session แก้ object ตรงตรงโดยไม่มี conditional UPDATE จริง ขณะที่ claim / close มีแล้ว
  -  liff.py มีสาม endpoint ที่เขียน DB ในโหมดผ่อนผันจริง (service-requests / debt-mediation / media)
  -  config.py default LIFF_STRICT_MODE=true แล้ว แต่ env examples สามไฟล์ยังเป็น false (สอดคล้องกับ audit ที่ว่า default false หมายถึงตัวอย่าง deploy)
  -  media.py ใช้ secrets.compare_digest กับค่าว่างทั้งสองฝั่งได้ผล true จริง จึง bypass ได้
  -  health.py สาม endpoint ไม่มี auth (ยกเว้น pseudonym-gate) และมี str(e) ใน response จริง
  -  SystemSetting มีแค่ key/value/description ไม่มีเข้ารหัส ขณะที่ Credential มีแล้วแต่ยังไม่ถูกใช้แทน
- ความเสี่ยงหลัก: ไฟล์ทับซ้อน (liff.py / media.py) — ต้องใช้เจ้าของไฟล์ทีละ Wave ตามที่ระบุข้างต้น
- ข้อเสนอ rollout: Wave A + B ขึ้น staging ก่อน 1 รอบ ให้ user ทดสอบใน LINE จริง (ยื่น LIFF 3 ฟอร์ม / โอนสายชนกัน / เปิดไฟล์ private / เปิด health) แล้วค่อยขึ้น production
- เอกสารที่ต้องอัปเดตคู่กัน: migration-controls.md (ปิด transition mode), env examples, permission matrix, skill skn-* ที่อ้างพฤติกรรมเดิม
- ไม่รวม code snippet แบบ file:line ตามกฎ PRD นี้ — snippet ที่มีเป็น decision-encoding สั้นสั้นเท่านั้น


