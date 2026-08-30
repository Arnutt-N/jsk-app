# Session Summary — zcode — 2026-08-30T23:29:00+07:00

**Branch**: `main`  **HEAD**: `ca25295`
**Checkpoint**: `.agents/state/checkpoints/handover-zcode-20260830-2329.json`

## Objective
แก้ 2 บั๊กที่ผู้ใช้แจ้งจากการใช้งานจริงบน `/admin/rich-menus` แบบยั่งยืน: (1) รูป preview ในตารางโหลด error ทั้งหมด และ (2) กด Set Active แล้ว LINE ตอบ 400 Bad Request ที่ endpoint set-default — ตาม mandatory workflow ครบทุกขั้น: branch → PRD → PRP → review PRD/PRP → implement → review → PR → merge → deploy

## Completed
- **PRD + PRP** (`PRPs/2026-08-30-rich-menu-media-publish.prd.md` / `.plan.md`): 진단 root cause 2 ชั้น — รูป rich menu เป็น admin feature สุดท้ายที่ยังเขียน disk (`uploads/rich_menus/`) โดยไม่มี route serve เลย (static mount ถูกลบ, Next rewrites ไม่ครอบ `/uploads/*`) และ publish ยิง LINE โดยไม่ verify พร้อม sync กลืน image-upload failure (เมนูได้ SYNCED ทั้งที่ publish ไม่ได้)
- **Review 4 skill ตามลำดับที่ผู้ใช้กำหนด** (review two-axis Standards+Spec → code-review five-axis → requesting-code-review senior reviewer → security-review): รวม **24 findings** ทุกข้อถูก fold กลับเข้าเอกสารก่อน implement (commit `7706b0b`)
- **Implement PR #212** (squash `ca25295`, 16 files +1123/−136):
  - Migration `s0t1u2v3w4x5` **additive-only**: เพิ่ม `rich_menus.image_media_id` (UUID FK → media_files, SET NULL) + best-effort backfill จาก disk (path resolve จากตำแหน่งไฟล์ migration + `basename()` กัน path escape) — **ไม่ drop `image_path`** ตาม expand-contract
  - Upload: เก็บลง media_files (rate limiter 20/60s แบบ media.py, เช็ค `file.size` **ก่อน** read กัน memory-DoS, sniff PNG/JPEG magic bytes ตัดสิน mime ที่เก็บ+ยิง LINE, 422/413), LINE push ล้ม → media row รอด + `sync_status=FAILED`
  - Sync: อ่าน bytes ผ่าน explicit `select(MediaFile)` (กัน MissingGreenlet), **stale-id recovery** — LINE 404 → clear `line_rich_menu_id` + recreate ต่อใน call เดียว (ปิด dead-end ที่ 409 บอกให้กด Sync แต่ sync ไม่เคยหาย), `image_upload_error` โชว์ใน response
  - Publish verify-then-act: 409 structured detail เมื่อเมนูหายจาก LINE / 503 token ว่าง / 502 + parsed LINE detail / success → PUBLISHED + audit log; delete ลบ media row + audit
  - Frontend: `lib/rich-menu.ts` (canPublish/parseSyncResult/constants), preview จาก `image_url`, ปุ่ม Set Active เฉพาะ SYNCED + Re-sync สำหรับ FAILED + badge SYNC FAILED + tooltip last_sync_error, แก้ bug `res.ok`-only ทั้ง list และ new page, edit page upload fail → error toast แล้วอยู่ต่อ (เดิม error+success toast พร้อมกันแล้ว redirect)
  - `RichMenuSyncStatus (str, Enum)` + AGENTS.md HTTP-status list refresh (402/413/429/502/503)
- **Verification**: rich-menu pytest 95/95 (test ใหม่ 15 ตัว) · suite เต็ม 1028 passed/1 skipped (exclude 3 websocket files — Windows-hang pattern, CI รันบน Linux) · migration round-trip upgrade→downgrade→upgrade บน local DB · vitest 3/3 · `next build` ✓ · ESLint 0 errors ในไฟล์ที่แก้ (185 errors ที่เจอคือ `playwright-report-2client/` generated artifacts ทั้งหมด)
- **Merge + deploy**: CI/E2E/CD เขียวบน main · prod migrations + smoke (frontend+backend health) ผ่านทั้งหมด · head pin ใน `test_booking_migration.py` อัปเดตเป็น `s0t1u2v3w4x5`

## Key decisions
- **Expand-contract**: drop `image_path` ย้ายไป follow-up PR เพราะ CD รัน migration ก่อน deploy + Koyeb rolling instances — drop ใน PR เดียวกันจะ 500 โค้ดเก่าช่วง rollout และ rollback พังทั้งสองทิศ (senior-review Critical) — precedent: PR C `q8r9s0t1u2v3`
- **Stale-id recreate ปลอดภัย**: recreate เกิดเฉพาะเมื่อ `get_from_line` 404 — เมนูเดิมพิสูจน์แล้วว่าหายจริง จึงสร้างซ้ำไม่ได้
- **Magic bytes ตัดสิน mime** (ไม่เชื่อ client Content-Type) เพราะ bytes ไหลไป LINE ภายใต้ชื่อเรา
- Model **ไม่มี relationship** ไป MediaFile — async traversal โดน MissingGreenlet; ใช้ explicit select ตาม FK แทน (`passive_deletes` บน many-to-one เป็น no-op — แก้จากแผนเดิม)

## Gotchas
- `python` ระบบ Windows เป็น 3.9 (`str | None` พังตอน import) — ใช้ `backend/venv/Scripts/python.exe` (3.12) เสมอ
- Suite เต็มบน Windows hang ที่ `test_websocket.py`, `test_websocket_manager_redis.py`, `test_ws_security.py` — exclude 3 ไฟล์นี้ตอนรัน local (CI รันครบ)
- `test_booking_migration.py::test_revision_history_has_exactly_one_head` **pin expected head** — PR ที่เพิ่ม migration ต้องอัปเดต pin (ครั้งนี้ → `s0t1u2v3w4x5`)
- `npm run lint` เต็มโปรเจกต์บนเครื่องนี้โดน `playwright-report-2client/` generated JS 185 errors — ไม่ใช่โค้ดจริง; ดูเฉพาะไฟล์ที่แก้
- `create_audit_log` เรียก `db.flush()` — fake db ใน `_SeqDB` ต้องมี `flush`/`get` ด้วย; และ sub-agent ที่ patch ตัวช่วยระดับ endpoint ต้องมี signature 2 args (`db, line_id`)
- asyncpg `fetchval()` ไม่รับ kwargs — ใช้ positional หรือ named params

## Next Steps
- Device/UI smoke on prod: login → /admin/rich-menus → preview renders + Set Active on a real menu
- Menus whose disk images were lost (Koyeb ephemeral FS) show No Image → one-time re-upload via edit page
- Follow-up PR: drop `rich_menus.image_path` (contract phase) once verified live
- Follow-ups จาก review: chat media migration (`persist_line_media` เขียน `/uploads/...` URL ที่ไม่มี route serve — ต้องวิเคราะห์ Flex payload), Cache-Control บน `/api/v1/media/{id}` + preview 429, อัปเดต `.claude/skills/skn-rich-menu-*` + image-generator PRD ที่อ้าง `image_path`

## Blockers
- _none_
