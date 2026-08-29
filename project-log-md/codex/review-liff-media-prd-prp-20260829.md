## Verdict — NEEDS-REVISION

เอกสารระบุ root cause และแนวทาง frontend ได้ถูกต้องเป็นส่วนใหญ่ แต่ PRP ยังไม่ prompt-ready: test matrix ไม่ครอบคลุม endpoint contract ตามที่อ้าง, DB test approach บางส่วนใช้ fixture ที่ไม่มีจริง และ LINE verify spy ตามแผนยัง assert ไม่ได้ จึงควรแก้ docs ก่อนเริ่ม implementation

## Findings

1. **[BLOCKER] Test matrix ยังไม่ครอบคลุม full token contract**

   PRD ระบุว่าจะทดสอบ “full upload contract” ที่ `.claude/PRPs/prds/liff-media-upload-id-token.prd.md:38,86-98` แต่ขาดกรณีสำคัญ:

   - Non-strict + token present แต่ invalid ต้องยังได้ **401** เพราะ token ที่มีค่าจะถูก verify เสมอ ไม่ได้ bypass ตาม strict flag (`backend/app/api/v1/endpoints/liff.py:71-74`)
   - Token present + `LINE_LOGIN_CHANNEL_ID` ว่าง/whitespace ต้องได้ **503** และห้ามเขียน DB (`backend/app/api/v1/endpoints/liff.py:24-27`)
   - LINE ตอบ 200 แต่ไม่มี `sub` ต้องได้ **401** (`backend/app/api/v1/endpoints/liff.py:39-42`) แม้มี coverage ผ่าน service-request อยู่แล้วที่ `backend/tests/test_liff_token.py:245-259` ก็ควรระบุ explicitly ว่า reuse coverage นั้น หรือเพิ่ม media-route case
   - FR4 ระบุ `≤10MB` แต่ matrix ทดสอบเฉพาะ `>10MB`; ไม่มี exact-boundary acceptance case

2. **[BLOCKER] DB assertion approach อ้าง fixture ที่ไม่มีจริง และ success path ไม่ตรวจ persistence**

   Plan `.claude/PRPs/plans/liff-media-upload-id-token.plan.md:51-55` เสนอ “session fixture used in existing tests” แต่ `backend/tests/conftest.py:80-103` มีเพียง `app` และ `test_client` ไม่มี DB session fixture

   Pattern ที่ executable จริงคือ `_fresh_engine()` + `NullPool` + `sessionmaker` ใน `backend/tests/test_liff_token.py:37-44,96-140` เพื่อหลีกเลี่ยง cross-event-loop connection error

   นอกจากนี้ test success ที่ plan lines 56-59 ตรวจเพียง response แต่ FR4 กำหนดว่า `MediaFile persisted` (`.prd.md:80`) ขณะที่ endpoint commit จริงที่ `backend/app/api/v1/endpoints/liff.py:90-101` จึงต้อง:

   - Query row ด้วย fresh `NullPool` session
   - Assert filename/MIME/data/size หรืออย่างน้อย persisted ID
   - Delete successful rows ใน `finally` เพื่อไม่ pollute development DB
   - ห้ามใช้ข้อเสนอ “rely on the 401 path having no commit” แทน no-write assertion

3. **[BLOCKER] Existing LINE fake ไม่ได้ “record calls” ตามที่ plan อ้าง**

   Plan `.claude/PRPs/plans/liff-media-upload-id-token.plan.md:56-59` ต้องการ assert ว่า LINE verify ถูกเรียกและบอกว่า fake เดิม records calls แต่ `_patch_line_verify()` ที่ `backend/tests/test_liff_token.py:78-93` คืน `None` และใช้ plain async `_post` ซึ่งไม่เก็บ call history

   ต้องแก้ plan ให้ helper คืน `AsyncMock`/spy แล้ว assert อย่างน้อย:

   - Verify URL
   - `id_token`
   - `client_id`
   - จำนวนครั้งที่เรียก

4. **[SHOULD-FIX] Rate-limit claim ไม่ตรงกับเหตุผลที่ tests ผ่าน และไม่มี LIFF media wiring coverage**

   Plan `.claude/PRPs/plans/liff-media-upload-id-token.plan.md:28-29` บอกว่า test เดิมยิงประมาณ 7 POSTs ใน bucket เดียวแล้วผ่าน จึงปลอดภัย แต่ autouse fixture reset limiter ก่อนทุก test (`backend/tests/conftest.py:106-142`) ดังนั้น requests เหล่านั้นไม่ได้สะสมเป็น 7 requests ภายใน test/bucket เดียว

   ทั้ง `/media` และ `/service-requests` ใช้ scope `"liff-submit"` (`backend/app/api/v1/endpoints/liff.py:50-62,104-119`) โดย default 5/300 วินาที (`backend/app/core/config.py:100-101`) และ Redis key ใช้ scope เดียวกัน (`backend/app/core/http_rate_limit.py:79-84`) จึงแชร์ budget เมื่อ Redis ทำงาน ขณะที่ in-process fallback ใช้ limiter คนละ instance (`backend/app/core/http_rate_limit.py:59-70`)

   Existing wiring tests ครอบคลุม LIFF service request และ media router อื่น แต่ไม่ครอบคลุม `/liff/media` (`backend/tests/test_http_rate_limit.py:169-188`) ควรเพิ่มอย่างน้อย route-wiring assertion และระบุ isolation/429 behavior ให้ชัด

5. **[SHOULD-FIX] Task 3 ทำให้ alert behavior เปลี่ยนเกินเฉพาะ 401**

   Plan `.claude/PRPs/plans/liff-media-upload-id-token.plan.md:123-135` บอกว่าจะรักษา behavior เดิม แต่เสนอ:

   ```ts
   alert(err instanceof Error ? err.message : 'อัพโหลดไฟล์ไม่สำเร็จ')
   ```

   ปัจจุบันทั้งสามหน้าแสดงข้อความไทย generic เสมอ (`service-request/page.tsx:221,228-230`, `service-request-single/page.tsx:187,193-195`, `request-v2/page.tsx:175,182-184`)

   โค้ดที่เสนอจะเปลี่ยน 400/413/500 เป็น `Upload failed` และอาจแสดง network error เช่น `Failed to fetch` ต่อผู้ใช้ ต้องแยก session-expired error ด้วย exported constant, custom error class/code หรือ guarded comparison แล้วคง Thai generic message สำหรับ error อื่น

6. **[SHOULD-FIX] Claim ว่าทั้งสามหน้ามี “valid idToken” และ input ใช้ได้หลัง init เท่านั้น เป็นการกล่าวเกิน source**

   PRD `.claude/PRPs/prds/liff-media-upload-id-token.prd.md:24-25,112` และ plan line 21 ควรเปลี่ยนเป็น “มี access ถึง nullable `idToken`”

   `useLiffInit` ให้ค่า `string | null` (`frontend/hooks/useLiffInit.ts:38-44,57-58,90-105`) และหน้า single อนุญาตให้ไม่มี LIFF ID/ไม่ redirect login (`frontend/app/liff/service-request-single/page.tsx:41-45`) ส่วนหน้า main wizard ไม่มี `initDone` loading gate (`frontend/app/liff/service-request/page.tsx:55-60,119`) จึงไม่จริงว่า upload input ใช้ได้เฉพาะหลัง init เสร็จ

7. **[SHOULD-FIX] Frontend matrix ยังไม่พิสูจน์ FR1 ครบทั้งสาม integrations**

   PRD `.claude/PRPs/prds/liff-media-upload-id-token.prd.md:77,96` ต้องการพิสูจน์ทั้งสามหน้า แต่ test #7 ทดสอบเพียง helper และ grep ที่ plan line 146 ตรวจได้แค่ว่าไม่มี bare fetch ไม่ได้พิสูจน์ว่าแต่ละหน้าเรียก `uploadLiffMedia(file, idToken)`

   ควรเพิ่ม page/source-contract assertions หรืออย่างน้อย validation ที่ตรวจ exact call ในทั้งสามไฟล์ นอกจากนี้ FR8 ควร assert โดยตรงว่า `new Headers(init.headers).get('Content-Type') === null` พร้อมตรวจ `body instanceof FormData` และ `body.get('file') === file`

8. **[SHOULD-FIX] “Shared Thai message” ยังเป็น duplicated literal**

   Constant ปัจจุบันเป็น private ที่ `frontend/lib/liff/submit-service-request.ts:3-4` แต่ helper ใหม่ใน plan lines 82-83 copy string ซ้ำ จึงยังไม่ shared และมี drift risk ควร export/reuse constant หรือสร้าง shared LIFF auth error ซึ่งจะช่วยแก้ Task 3 ให้ surface เฉพาะ session-expired ได้ด้วย

9. **[NICE-TO-HAVE] Factual references เล็กน้อยควรแก้**

   - ค่า `LIFF_STRICT_MODE` declaration อยู่ `backend/app/core/config.py:50` ไม่ใช่ line 48; line 48 เป็น comment
   - PRD `.claude/PRPs/prds/liff-media-upload-id-token.prd.md:65-68` บอกว่า `LINE_LOGIN_CHANNEL_ID` “set per-test” แต่จริงเป็น session import-time default ใน `backend/tests/conftest.py:17-39`
   - Test path ที่สอดคล้องกับ colocated convention มากกว่าคือ `frontend/lib/liff/__tests__/upload-media.test.ts`; Vitest รองรับทั้งสองตำแหน่งตาม `frontend/vitest.config.ts:31-38`

ข้อเท็จจริงที่ตรวจแล้วถูกต้อง: endpoint/helper names, fetch line numbers `216/183/170`, MIME allowlist, 10MB cap, lower-case header pattern, raw `Response` behavior และการไม่กำหนด multipart `Content-Type` เอง Header casing ไม่ใช่ defect เพราะ HTTP headers case-insensitive

## Required doc edits

- [ ] เพิ่ม non-strict invalid-token, missing channel ID → 503, missing-`sub` coverage decision และ exact-size boundary
- [ ] ระบุ `NullPool` DB helper, persistence assertions และ cleanup ทุก success case
- [ ] เปลี่ยน LINE fake ให้เป็น spy/`AsyncMock` ที่ assert call ได้จริง
- [ ] เพิ่ม LIFF media rate-limit wiring/interaction coverage
- [ ] แก้ Task 3 ให้ surface เฉพาะ session-expired error
- [ ] เพิ่มหลักฐานว่า page ทั้งสามส่ง `idToken` และ assert ว่าไม่มี manual `Content-Type`
- [ ] แก้ nullable-token claims, config line และ `LINE_LOGIN_CHANNEL_ID` setup wording

ดำเนินการ review แบบ read-only; ไม่มีไฟล์ถูกแก้ไขครับ