# Session Summary — zcode — 2026-08-31T01:57:00+07:00

**Branch**: `main`  **HEAD**: `59732ba`
**Checkpoint**: `.agents/state/checkpoints/handover-zcode-20260831-0157.json`

## Objective
แก้บั๊กที่ผู้ใช้เจอตอน device smoke ของ PR #212: กด Sync ที่ `/admin/rich-menus` แล้ว "ซิงค์ไม่สมบูรณ์" — เมนูถูกสร้างบน LINE แต่อัปโหลดรูปโดน `413 Request Entity Too Large` จาก `api-data.line.me/v2/bot/richmenu/{id}/content` ทำให้เมนูค้าง `FAILED` และ publish ไม่ได้ — แก้ตาม mandatory workflow ครบ: branch → PRD → PRP → self-review → implement → gates → PR → merge → deploy

## Root cause
- Backend ตั้ง `MAX_RICH_MENU_IMAGE_BYTES = 10 MB` (mirror media.py) แต่ **Messaging API จำกัดรูป rich menu ที่ 1 MB** — รูป 1–10MB ผ่าน upload endpoint ถูกเก็บลง media_files แล้วไปตายตอน sync push ทีหลัง (หลังสร้างเมนูบน LINE ไปแล้ว)
- **LINE OA Manager รับรูปใหญ่ได้เพราะมันย่อ client-side ก่อนอัปโหลดเอง** (ผู้ใช้ชี้ประเด็นนี้ — ยืนยันกับ docs แล้ว) — API ที่ backend เรียกตรง hard-cap 1 MB; error 413 ที่ prod เจอคือหลักฐาน
- error ที่โชว์เป็น raw httpx blob (`str(e)` ไม่มีทั้ง body ของ LINE และวิธีแก้) — `_line_error_detail` มีอยู่แต่ใช้เฉพาะที่ publish

## Completed
- **PRD + PRP** (`PRPs/2026-08-31-rich-menu-image-1mb.prd.md` / `.plan.md`) — self-review หา assumptions ก่อน implement (fail-fast ต้องครอบคลุม stale-recreate, ≤1MB ต้องผ่านโดยไม่ re-encode, browser ไร้ canvas ต้อง block ไม่ใช่ยิงไฟล์ที่จะตาย)
- **Backend** (commit `3e51fa2`):
  - `MAX_RICH_MENU_IMAGE_BYTES` → `LINE_IMAGE_LIMIT_BYTES` (1 MB) จาก service; 413 detail เป็นภาษาไทยที่บอกทางแก้
  - `upload_image_to_line` ครอบ `httpx.HTTPStatusError` → `RuntimeError` (413 → Thai guidance / อื่น ๆ → `LINE rejected image upload (code): <LINE detail>` ผ่าน `_line_error_detail`) — ทั้ง upload-endpoint push และ sync-endpoint push ได้ข้อความอ่านรู้เรื่องทันที รวมถึง `last_sync_error`
  - `sync_with_idempotency` **fail-fast ก่อน `create_on_line`**: รูปเก็บไว้เกิน 1 MB → `FAILED` + guidance โดยไม่ยิง LINE — ไม่สร้าง orphan menu อีกต่อไป (ครอบทั้ง create ใหม่และ stale-recreate)
  - pytest ใหม่ 4 ตัว: mapping 413/non-413, fail-fast (`create_on_line` ไม่ถูกเรียก), boundary 1 MB พอดีผ่าน
- **Frontend** (commit `b83c362`): `lib/rich-menu.ts` เพิ่ม `planRichMenuFit` (ladder scale×quality เรียง least-degradation ก่อน), `scaledToFit` (ย่อคงอัตราส่วนในกล่อง 2500×1686), `ensureRichMenuImage` — **ไฟล์ ≤1 MB ผ่านโดยไม่แตะ (PNG alpha รอด)**, เกิน → decode (createImageBitmap/Image fallback) → JPEG เติมพื้นขาว → หยุดที่ attempt แรกที่ ≤1 MB; browser ไร้ canvas → throw guidance แล้วหน้า block การอัปโหลด; หน้า new/edit wrap ทุกจุดอัปโหลด + toast info เมื่อย่อให้
- **Gates**: backend rich-menu 40/40 · suite เต็ม **1033 passed / 1 skipped** (exclude 3 websocket ไฟล์ Windows-hang, CI รันครบ) · vitest ใหม่ 9/9 + suite เต็ม clean (รอบแรกเจอ 3 timing flakes ในไฟล์อื่น รอบสองเขียวหมด) · tsc · eslint (ไฟล์ที่แก้) · `next build` ✓
- **Merge + deploy**: PR #213 CI/E2E เขียวทุกช่อง → squash `59732ba` → CD run `33329221730` success (migration no-op, Vercel + Koyeb smoke ผ่าน)

## Key decisions
- **Auto-fit ฝั่ง client คือคำตอบเดียวกับ OA Manager**: ผู้ใช้เลือกรูป 10 MB ได้เหมือนเดิม ระบบย่อให้เอง — ไม่บังคับไปย่อที่ `/admin/image-resize` เอง (แต่ยังอ้างไว้ใน message สำหรับกรณี browser ไร้ canvas)
- **Fail-fast ใน sync ก่อน create** ไม่ใช่แค่แปล error: ไม่งั้น legacy media row (รูป >1 MB ที่เก็บไว้ก่อน fix) จะสร้าง orphan menu ซ้ำได้ทุกครั้งที่กด Sync
- **≤1 MB ห้าม re-encode** — เลี่ยงการเสีย alpha ของ PNG ฟรี ๆ; เกินเท่านั้นค่อยแปลง JPEG
- ทุก attempt เกิน cap (แทบเป็นไปไม่ได้กับ JPEG 2500px) → ส่ง blob เล็กสุดให้ backend ตัดสิน (ตอนนี้ 413 อ่านรู้เรื่องแล้ว) — backend เป็น authority เสมอ

## Gotchas
- `gh run list` ตอน merge: CD run แรกที่เห็นเป็น `skipped` เพราะเป็นของ docs commit เก่า (`c19f60a`) — run จริงของ merge commit ต้องดูจาก headSha (`33329221730` = success)
- vitest suite เต็มบนเครื่องนี้มี timing flakes เป็นครั้งคราว (รอบแรก 3 fail ในไฟล์อื่น รอบสองเขียวหมด) — เช็คด้วยการ rerun + ดูว่าไฟล์ที่ fail ไม่ touch โค้ดที่แก้
- `test_upload_rejects_oversize_before_reading_body` monkeypatch cap อยู่แล้ว จึงไม่พังตอนเปลี่ยนค่าคงที่

## Next Steps
- User device smoke: เข้า edit ของเมนูค้าง `richmenu-affeb34dcdae0367c879eec35af1f219` → เลือกรูปใหม่ (auto-fit ย่อให้) → upload จะ push เข้า LINE ทันที (มี LINE id แล้ว) → Re-sync → Set Active — ไม่ต้องเก็บกวาด DB
- Follow-up PR: drop `rich_menus.image_path` (contract phase) เมื่อยืนยัน live แล้ว (ค้างจาก PR #212)

## Blockers
- _none_
