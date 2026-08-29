# Deep Review — Qoder Audit Sweep + Architecture Review

**วันที่:** 2026-08-29  
**ผู้ทบทวน:** Codex  
**Branch:** `fix/audit-sweep-20260829`  
**เอกสารต้นทาง:**

- `project-log-md/qoder/audit-sweep-review-20260829.md`
- `project-log-md/qoder/architecture-review-20260829-0111-en.html`

## คำตัดสิน

**ยังไม่ควร commit / เปิด PR / merge ชุด audit นี้ในสถานะปัจจุบัน** เพราะ critical fix หลักของ LIFF upload ยังใช้ไม่ได้เมื่อ `LIFF_STRICT_MODE=true` ซึ่งเป็นค่าเริ่มต้น ขณะที่รายงานระบุว่าปิด CRITICAL แล้วและ validation gates เขียวทั้งหมด

รายงานสถาปัตยกรรมค้นหา pain points ได้ดีหลายจุด แต่ top recommendation เรื่อง HTTP client ลดทอน blast radius มากเกินไป และข้อเสนอ LIFF form/boot อ้าง duplication ที่ไม่ตรงกับ working tree ปัจจุบัน จึงควรแก้รายงานและจัดลำดับใหม่ก่อนนำไปสร้าง PRD/PRP สำหรับ refactor

## สรุปความรุนแรง

| ระดับ | จำนวน | ประเด็นหลัก |
|---|---:|---|
| CRITICAL | 1 | LIFF upload ทั้ง 3 หน้าไม่ส่ง ID-token header |
| HIGH | 6 | ไม่มี regression test, ใช้ `AsyncSession` ข้าม task, PII ยังรั่ว, HTTP refactor ถูกประเมินต่ำ, LIFF form/boot diagnosis คลาดเคลื่อน |
| MEDIUM | 8 | false-success ของ LINE push, file count ผิด, architecture metrics/solution หลายจุดไม่แม่น |
| LOW | 1 | แนวทางแยก request-detail ควรแตกเป็นชิ้นเล็กกว่า mega-hook |

---

## A. Review — Audit Sweep

### A1 — CRITICAL: LIFF upload fix ยังพังใน strict mode

รายงานระบุว่าปิด CRITICAL แล้วด้วย `POST /api/v1/liff/media` และย้ายฟอร์มทั้ง 3 หน้าไป endpoint ใหม่ (`audit-sweep-review-20260829.md:35-37`) แต่ endpoint บังคับ `x-liff-id-token` เมื่อ strict mode เปิด (`backend/app/api/v1/endpoints/liff.py:67`, `backend/app/api/v1/endpoints/liff.py:71`, `backend/app/api/v1/endpoints/liff.py:73`) และ strict mode มีค่าเริ่มต้นเป็น `true` (`backend/app/core/config.py:48`).

fetch ทั้ง 3 จุดส่งเพียง `method` และ `body`:

- `frontend/app/liff/service-request/page.tsx:216`
- `frontend/app/liff/service-request-single/page.tsx:183`
- `frontend/app/liff/request-v2/page.tsx:170`

ทั้งสามหน้ามี `idToken` อยู่แล้ว จึงควรส่ง `X-Liff-Id-Token: ${idToken}` หรือรวมผ่าน LIFF API helper ที่มี contract ชัดเจน

### A2 — HIGH: ไม่มี regression test ของ upload contract ใหม่

ไม่พบ test ที่อ้าง `/liff/media` หรือ `upload_liff_media` แม้รายงานใช้ “LIFF tests 7” เป็นหลักฐาน validation (`audit-sweep-review-20260829.md:80`) ชุดทดสอบปัจจุบันจึงไม่ครอบคลุม multipart upload, missing token, invalid token, MIME, size limit และ success path

**ต้องเพิ่มอย่างน้อย:** 401 เมื่อไม่มี token ใน strict mode, verify token ถูกเรียก, upload สำเร็จพร้อม metadata, reject MIME/size และ client test ว่าส่ง header จริง

### A3 — HIGH: background Telegram task ใช้ `AsyncSession` เดียวกับ request พร้อมกัน

`initiate_handoff` สร้าง task แล้วส่ง request-scoped `db` เข้าไป (`backend/app/services/live_chat_service/handoff.py:137`, `backend/app/services/live_chat_service/handoff.py:144`, `backend/app/services/live_chat_service/handoff.py:149`) จากนั้น caller path commit/flush session เดิมทันที (`backend/app/services/live_chat_service/handoff.py:153`).

ชุดกัน garbage collection ป้องกัน task หายเท่านั้น ไม่ได้ทำให้ `AsyncSession` ใช้พร้อมกันหรืออยู่นานเกิน request ได้อย่างปลอดภัย ควรส่ง immutable payload ให้ background task แล้วเปิด session ใหม่ภายใน task หรือโหลด credentials ให้เสร็จก่อนสร้าง task

### A4 — HIGH: PII redaction ยังไม่ครบและมี plaintext LINE ID ใหม่

รายงานอ้างว่า mask ข้อมูล 13 จุด (`audit-sweep-review-20260829.md:47`) แต่ patch ใหม่ยัง interpolate `line_user_id` ตรง ๆ เมื่อ LINE push ล้มเหลว:

- `backend/app/services/live_chat_service/messaging.py:54`
- `backend/app/services/live_chat_service/messaging.py:152`

ควรใช้ `mask_line_id` และเพิ่ม test/lint-like scan ป้องกัน regression ของ log PII

### A5 — MEDIUM: LINE push ล้มเหลวแต่ API คืน success และ commit ต่อ

`send_message` และ `send_media_message` กลืน exception จาก LINE (`backend/app/services/live_chat_service/messaging.py:51`, `backend/app/services/live_chat_service/messaging.py:141`) แล้วคืน `success: true` (`backend/app/services/live_chat_service/messaging.py:66`, `backend/app/services/live_chat_service/messaging.py:160`). รายงานบอกว่า persist ก่อนส่งเพื่อ audit/retry (`audit-sweep-review-20260829.md:60`) แต่ไม่พบ delivery status หรือ retry queue ที่ทำให้ retry เกิดจริง

ต้องกำหนด semantics ให้ชัด: คืน partial failure พร้อมสถานะ `FAILED`, enqueue retry แบบ durable หรือ rollback ตาม product requirement ห้ามแสดงต่อ operator ว่าส่งสำเร็จเมื่อ LINE ไม่ได้รับ

### A6 — MEDIUM: inventory “35 files” ไม่ตรง working tree

รายงานระบุ 32 modified + 3 new = 35 (`audit-sweep-review-20260829.md:91`) แต่ code scope ปัจจุบันมี 35 tracked modified + 3 new backend files = **38 backend/frontend entries** รวม `frontend/next-env.d.ts` ที่ถูก build เปลี่ยนด้วย ควรระบุ snapshot SHA/เวลาและแยก generated file ออกจาก intentional change

### A7 — MEDIUM: validation claims ไม่มีหลักฐาน reproducible แนบไว้

ตัวเลข 1043 pytest, 564 Vitest, clean typecheck/build และ single Alembic head (`audit-sweep-review-20260829.md:76-85`) ไม่มี command transcript หรือ CI artifact ใน repository จึงตรวจยืนยันย้อนหลังไม่ได้ การที่ test ปัจจุบันไม่ครอบคลุม A1 แสดงว่า “เขียว” ไม่เท่ากับ production contract ถูกต้อง

ควรแนบคำสั่ง, commit/tree hash, timestamp และ output summary; rerun หลังแก้ A1-A5

---

## B. Review — Architecture Report

### B1 — HIGH: top recommendation ไม่ใช่ “lowest risk” ตามที่อ้าง

รายงานยก candidate 3 เป็น leverage สูงสุด/ความเสี่ยงต่ำสุด และบอกว่า 40+ call sites ดีขึ้นพร้อมกันโดยไม่เปลี่ยน behavior (`architecture-review-20260829-0111-en.html:264-270`) แต่ working tree มี raw `fetch(` ใน 57 TS/TSX files, local `const API_BASE` ใน 33 files และ `apiFetch` call ในเพียง 5 files

แต่ละกลุ่มมี auth contract ต่างกัน: admin อาศัย global `window.fetch` interceptor (`frontend/lib/authFetch.ts:156`), LIFF submission ส่ง `X-Liff-Id-Token` (`frontend/lib/liff/submit-service-request.ts:13`) และ booking มี wrapper ของตนเอง (`frontend/lib/booking.ts:156`). การรวม client จึงเป็น migration ของ auth/error/response contract ไม่ใช่ wrapper ต่ำความเสี่ยง และ A1 เป็นตัวอย่างตรงว่าพลาด header เพียงจุดเดียวทำ production flow พังได้

**แก้ข้อเสนอ:** เขียน characterization tests ก่อน, นิยาม ownership ของ cookie/CSRF/LIFF token, migrate ทีละ vertical slice แล้วค่อยขยาย

### B2 — HIGH: candidate 4 ใช้คำว่า “wizard ×3” และ duplication ที่ล้าสมัย

รายงานบอก lifecycle ของ wizard, location cascade, upload, LIFF init และ countdown ซ้ำสามรอบ (`architecture-review-20260829-0111-en.html:144-155`) แต่มีเพียง `service-request/page.tsx` ที่เป็น step wizard ส่วนอีกสองหน้าเป็น single-page variants และทั้งสามแชร์อยู่แล้ว:

- `useLiffInit`
- `useAutoCloseCountdown`
- `fetchDistricts` / `fetchSubDistricts`
- `submitServiceRequest`

duplication ที่เหลือจริงคือ province fetch, upload, form state/schema/validation และ presentation บางส่วน ไม่ควรเริ่มด้วย mega-hook หรือ shell เดียว ควรดึง primitive เหล่านี้ทีละชิ้นแล้ววัดว่าลifecycle ยังเหมือนกันพอหรือไม่

### B3 — HIGH: candidate 7 รวม LIFF lifecycle ที่มีหน้าที่ต่างกัน

`LiffStateBoot` ใช้เฉพาะ landing page เพื่อรองรับ `liff.state` redirect ก่อน normal paint (`frontend/components/liff/LiffStateBoot.tsx:49`, `frontend/app/page.tsx:48`) ขณะที่ `useLiffInit` ดูแล login/profile/token ของหน้า form (`frontend/hooks/useLiffInit.ts:49`) และไม่ได้มี SDK polling/timeout ซ้ำตามที่รายงานอ้าง (`architecture-review-20260829-0111-en.html:218-228`). นอกจากนี้ booking ยังมี `waitForSdk`/init orchestration อีกเส้นทาง (`frontend/app/liff/booking/page.tsx:141`).

ควรรวมได้เฉพาะ SDK loader/init primitive โดยรักษา orchestration และ pre-hydration behavior แยกกัน มิฉะนั้นเสี่ยงทำ redirect recovery และ splash UX พัง

### B4 — MEDIUM-HIGH: candidate 1 วัดผิดและรวม policy มากเกินไป

รายงานอ้าง ~30 DB touches และ 6 Pydantic models (`architecture-review-20260829-0111-en.html:65-79`) แต่ working tree ปัจจุบันมีประมาณ 14 `select/db.execute` occurrences และ 7 `BaseModel` classes ใน `backend/app/api/v1/endpoints/admin_requests.py`.

การแยก use-case/query service เป็นแนวทางที่ดี แต่ไม่ควรย้าย workflow + permissions + audit ทั้งหมดเข้า service เดียว เพราะ workflow และ DB-configurable RBAC เป็น policy modules ที่มีขอบเขตชัดอยู่แล้ว (`backend/app/core/request_workflow.py:22`, `backend/app/core/permissions.py:300`). ให้ service depend on policy interfaces แทนการกลืน policy ทั้งหมด

### B5 — MEDIUM: candidate 5 อ้างว่า room logic ทดสอบแยกไม่ได้ ทั้งที่มี direct tests แล้ว

`ConnectionManager` เป็น multi-responsibility class จริง (`backend/app/core/websocket_manager.py:23`) และ facade decomposition มีเหตุผล แต่มี direct unit tests ที่ instantiate manager และทดสอบ rooms/broadcast/Redis อยู่แล้ว (`backend/tests/test_websocket_manager_redis.py:32`, `backend/tests/test_websocket_manager_redis.py:353`). Benefit ที่ถูกต้องคือ isolation และลด blast radius ไม่ใช่ปลดล็อก testability ที่ไม่มีอยู่

### B6 — MEDIUM: candidate 8 ไม่ใช่งาน “เสี่ยงต่ำ” และ value object ไม่เข้ากับ seam

`resolve_by_line_id` มี direct callers จำนวนมาก (graph พบ 38) และโมดูลกำหนด transaction ownership ชัดว่า caller เป็นผู้ถือ commit (`backend/app/services/user_identity_service.py:1`). การซ่อน async DB resolution/commit semantics ใน `UserIdentity.from_raw/resolve/for_storage` เสี่ยงทำ boundary คลุมเครือ

ควรแยกงานลบ dead config mode ออกจาก API redesign และใช้ service/protocol ที่รักษา explicit session/transaction ownership หากมี caller pain ที่พิสูจน์ได้

### B7 — MEDIUM: candidate 2 ถูกทิศ แต่ diagram รวม exception คนละ flow

services มี `HTTPException` leak จริง (`backend/app/services/live_chat_service/sessions.py:45`) และควรเปลี่ยนเป็น domain exceptions แต่ `ValueError` string mapping ใน endpoint เป็น transfer flow อีกเส้น (`backend/app/api/v1/endpoints/admin_live_chat.py:272`) ไม่ใช่การแปล exception เดียวกันสองรอบตามภาพ (`architecture-review-20260829-0111-en.html:90-101`).

ข้อเสนอ domain exception ยังเป็น candidate ที่แคบและปลอดภัยที่สุด แต่ควรทำ package-wide พร้อม contract tests ของ status/detail เดิม

### B8 — LOW: candidate 6 ถูก diagnosis แต่ `useRequestDetail` อาจกลายเป็น god hook

ไฟล์ 1,683 บรรทัดและ duplicated undo state เป็นปัญหาจริง (`architecture-review-20260829-0111-en.html:193-210`) แต่ไม่ควรย้าย loading/editing/transitions/permissions/optimistic state ทั้งหมดไป hook เดียว

ลำดับที่ปลอดภัยกว่า: แยก comment editor state → request API/state hook → presentational sections และให้ HTTP contract จาก candidate 3 เสถียรก่อน

---

## C. Contradictions ระหว่างสองรายงาน

1. Audit ระบุว่า LIFF upload CRITICAL ปิดแล้ว แต่ source แสดงว่า production-default strict mode ยังตอบ 401
2. Audit เลื่อน “รวม 3 ฟอร์ม” ไปอ้าง architecture candidate 4 (`audit-sweep-review-20260829.md:89`) แต่ candidate 4 ใช้ baseline ก่อน shared hooks/helpers ปัจจุบันและเรียก single-page variants ว่า wizard
3. Architecture ยก HTTP client เป็น low-risk แต่ audit เพิ่งแสดงความเสี่ยงของ auth-header contract โดยไม่รู้ตัว
4. ทั้งสองรายงานไม่มี immutable snapshot ของ tree; ตัวเลข line/file/test จึง drift และตรวจย้อนกลับยาก

## ลำดับงานที่แนะนำให้ Qoder ทำต่อ

### Blocker fixes

1. แก้ LIFF upload ทั้ง 3 หน้าให้ส่ง ID token และเพิ่ม endpoint/client regression tests
2. แก้ background Telegram task ไม่ให้แชร์ request `AsyncSession`
3. mask LINE ID logs ที่เหลือและกำหนด LINE push failure semantics + tests
4. rerun backend, frontend unit, typecheck, targeted lint, build และ Alembic head พร้อมบันทึก transcript
5. อัปเดต `audit-sweep-review-20260829.md` ให้ตรงผลจริงและ inventory 38 code entries

### Architecture corrections

1. ปรับ candidate 2 เป็นอันดับแรก: domain exceptions แบบ package-wide พร้อม compatibility tests
2. ปรับ candidate 3 เป็น staged migration ไม่ใช่ big-bang; ระบุ admin/LIFF auth contracts
3. แก้ candidate 4 ให้สะท้อน shared hooks/helpers ที่มีแล้วและเสนอ incremental primitives
4. แก้ candidate 7 ให้รักษา landing redirect boot แยกจาก authenticated form init และรวม booking path ใน analysis
5. แก้ metrics/benefits ของ candidates 1, 5, 8 และจัด sequence ใหม่: **2 → 3 characterization/vertical slice → 6 incremental → clarify 7 → 4 primitives → 1 → 5 → 8**

## Validation Scope ของ Review นี้

- ตรวจ static source/diff และ dependency graph ของ working tree
- ตรวจ file/call-site counts และ exact source spans
- ทำ review แยกสองแกน (audit correctness และ architecture correctness) แล้ว cross-check
- ไม่ rerun full pytest/Vitest/build; จึงจัด assertions เดิมเป็น “unverifiable” ไม่ใช่ “failed” ยกเว้น defect ที่พิสูจน์ได้จาก contract/source โดยตรง

