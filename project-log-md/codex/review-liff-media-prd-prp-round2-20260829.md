## Verdict — NEEDS-REVISION

REV 2 แก้ได้จริง 7/9 findings แต่ยังไม่ prompt-ready เพราะ:

- Round-1 BLOCKER #3 ยังปิดไม่สมบูรณ์: LINE spy ไม่มี executable return contract และอ้างรูปแบบ call ผิด
- B10 ไม่ได้พิสูจน์ FR8 เรื่อง exact `liff-submit` scope/shared budget และมี monkeypatch ที่ไม่มีผลแน่นอน

ตรวจ references กับ current dirty working tree บน branch `fix/audit-sweep-20260829` แล้ว โดยไม่มีการแก้ไขไฟล์

## Round-1 finding closure table

| Finding | Resolved? | Evidence |
|---|---|---|
| 1. Full token contract | ✅ Yes | เพิ่ม invalid token ใน non-strict, missing `sub`, exact boundary และ blank channel ID ครบที่ [PRD:111](D:/genAI/jsk-app/.claude/PRPs/prds/liff-media-upload-id-token.prd.md:111)–120; ตรงกับ behavior จริงที่ [liff.py:24](D:/genAI/jsk-app/backend/app/api/v1/endpoints/liff.py:24)–42 และ 71–86 |
| 2. DB fixture/persistence | ✅ Yes | เปลี่ยนเป็น `_fresh_engine()` + `NullPool`, direct persistence query และ `finally` cleanup ที่ [plan:33](D:/genAI/jsk-app/.claude/PRPs/plans/liff-media-upload-id-token.plan.md:33)–37, 55–74; pattern มีจริงที่ [test_liff_token.py:37](D:/genAI/jsk-app/backend/tests/test_liff_token.py:37)–44, 96–140 |
| 3. LINE verify spy | ❌ Partial — BLOCKER remains | [plan:38](D:/genAI/jsk-app/.claude/PRPs/plans/liff-media-upload-id-token.plan.md:38)–41 สร้าง `AsyncMock` ไว้ใน local `fake_client.post` แต่ไม่ระบุให้ return จึงไม่มี spy reference สำหรับ B2. อีกทั้ง production ส่ง URL แบบ positional ที่ [liff.py:29](D:/genAI/jsk-app/backend/app/api/v1/endpoints/liff.py:29)–34 ไม่ใช่ `url` kwarg ตาม plan |
| 4. Rate-limit claim/wiring | ❌ Partial | คำอธิบาย per-test reset แก้ถูกต้องที่ [plan:22](D:/genAI/jsk-app/.claude/PRPs/plans/liff-media-upload-id-token.plan.md:22) และตรงกับ [conftest.py:131](D:/genAI/jsk-app/backend/tests/conftest.py:131)–142 แต่ B10 ยิงเฉพาะ `/media` จึงไม่พิสูจน์ exact scope หรือ shared budget กับ `/service-requests` |
| 5. Alert behavior | ✅ Yes | Guarded comparison ที่ [plan:160](D:/genAI/jsk-app/.claude/PRPs/plans/liff-media-upload-id-token.plan.md:160)–182 รักษา generic Thai alert สำหรับ 400/413/500/network และแสดง session-expired เฉพาะ 401 |
| 6. Nullable token claims | ✅ Yes | แก้เป็น `string \| null` และระบุข้อจำกัดของแต่ละหน้าแล้วที่ [PRD:24](D:/genAI/jsk-app/.claude/PRPs/prds/liff-media-upload-id-token.prd.md:24)–30; ตรงกับ [useLiffInit.ts:38](D:/genAI/jsk-app/frontend/hooks/useLiffInit.ts:38)–44 |
| 7. Three-page integration/FR10 | ✅ Yes | P1 ตรวจ exact helper call ทั้งสามหน้าและ zero bare fetch ที่ [plan:190](D:/genAI/jsk-app/.claude/PRPs/plans/liff-media-upload-id-token.plan.md:190)–195; F1 ตรวจ `FormData`, file identity และไม่มี manual `Content-Type` |
| 8. Shared Thai message | ✅ Functionally | มี canonical `session-expired.ts` และให้ submit/upload import จากแหล่งเดียวที่ [plan:97](D:/genAI/jsk-app/.claude/PRPs/plans/liff-media-upload-id-token.plan.md:97)–112 แต่ identity-test wording ยังควรแก้ |
| 9. Factual references | ✅ Yes | `config.py:50`, import-time test default และ colocated Vitest path ถูกแก้ตรง current tree แล้ว |

## New findings

### Spec / contract

1. **[BLOCKER] B10 ไม่พิสูจน์ FR8 และ settings monkeypatch ไม่มีผล**

   [Plan:80](D:/genAI/jsk-app/.claude/PRPs/plans/liff-media-upload-id-token.plan.md:80)–87 exhaust เฉพาะ `/liff/media`; test ยังผ่านแม้ scope ถูกเปลี่ยนเป็น `liff-media` จึงไม่ได้พิสูจน์ว่าแชร์ `liff-submit` budget กับ `/service-requests`.

   นอกจากนี้ค่า limit ถูก capture ตอน route decoration ที่ [liff.py:50](D:/genAI/jsk-app/backend/app/api/v1/endpoints/liff.py:50)–61 และ closure ใช้ค่าที่ capture แล้วที่ [http_rate_limit.py:59](D:/genAI/jsk-app/backend/app/core/http_rate_limit.py:59)–84 ดังนั้น patch `settings.LIFF_SUBMIT_RATE_LIMIT = 3` ภายหลังไม่มีผลแน่นอน ไม่ควรเขียนเป็น “if monkeypatching does not take effect”.

2. **[SHOULD-FIX] Rate-limit test ทิ้ง exhausted Redis bucket ได้**

   Fixture ล้าง bucket ก่อน test แต่ไม่มี teardown หลัง `yield` ที่ [conftest.py:131](D:/genAI/jsk-app/backend/tests/conftest.py:131)–142. เมื่อ B10 เป็น test สุดท้ายของ targeted run อาจทิ้ง `ratelimit:liff-submit:*` ไว้จน TTL 300 วินาที ควร cleanup ใน `finally` หรือผ่าน fixture teardown.

### Standards / executability

3. **[SHOULD-FIX] Async DB helper contract ยังไม่ explicit**

   [Plan:33](D:/genAI/jsk-app/.claude/PRPs/plans/liff-media-upload-id-token.plan.md:33)–37 ควรระบุว่า helpers เป็น `async def`, ต้อง `await`, tests ใช้ `@pytest.mark.asyncio` และเพิ่ม `_count_media_files()` สำหรับ B1/B9 โดยตรง.

4. **[SHOULD-FIX] Frontend global `fetch` mock ไม่มี cleanup**

   [Plan:139](D:/genAI/jsk-app/.claude/PRPs/plans/liff-media-upload-id-token.plan.md:139)–152 ไม่กำหนด reset/restore ขณะที่ [vitest.setup.ts:9](D:/genAI/jsk-app/frontend/vitest.setup.ts:9)–10 cleanup เฉพาะ React tree. ควรเพิ่ม `beforeEach` reset และ `afterEach` ที่เรียก `vi.restoreAllMocks()`/`vi.unstubAllGlobals()`.

5. **[SHOULD-FIX] “Shared constant identity” assertion ไม่ได้พิสูจน์ identity**

   `toThrow(SESSION_EXPIRED_MESSAGE)` ที่ [plan:150](D:/genAI/jsk-app/.claude/PRPs/plans/liff-media-upload-id-token.plan.md:150)–152 ตรวจ message value ไม่ใช่ import identity. อีกทั้ง re-export ที่ line 106 ไม่ถูกใช้ตามเหตุผลที่เขียน เพราะ Task 3 import canonical module โดยตรงที่ lines 165–166.

6. **[NICE-TO-HAVE] Import private helper จาก sibling test เปราะบาง**

   [Plan:29](D:/genAI/jsk-app/.claude/PRPs/plans/liff-media-upload-id-token.plan.md:29)–31 แนะนำ import `_FakeLineVerifyResponse` จาก `test_liff_token` ทั้งที่ `backend/tests` ไม่มี `__init__.py` และ helper เป็น private. ควรเก็บ fake ขนาดเล็กไว้ local หรือสร้าง shared test-support module.

7. **[NICE-TO-HAVE] “marker-based `_fetch_and_delete`” ไม่ตรง source**

   PRD/plan เรียก helper ว่า marker-based แต่ [test_liff_token.py:96](D:/genAI/jsk-app/backend/tests/test_liff_token.py:96)–127 query ด้วย primary key `request_id`; marker อยู่ใน request body helperคนละส่วน

## Final checklist

- [ ] กำหนด `_patch_line_verify_spy(...) -> AsyncMock` และ `return post_mock`
- [ ] ให้ B2 assert positional URL และ exact `data={"id_token": ..., "client_id": ...}`
- [ ] เปลี่ยน B10 ให้ assert exact `liff-submit` scope ของทั้งสอง routes หรือทดสอบ deterministic cross-route shared Redis budget
- [ ] เอา ineffective settings monkeypatch ออก
- [ ] เพิ่ม rate-limit cleanup หลัง test
- [ ] ระบุ async DB helper/test contract และ `_count_media_files()`
- [ ] เพิ่ม frontend fetch-mock reset/restore
- [ ] ทำ shared-constant import/re-export และ validation strategy ให้เป็นทางเดียวกัน

ไม่มีไฟล์ถูกแก้ไขในการ review นี้ครับ