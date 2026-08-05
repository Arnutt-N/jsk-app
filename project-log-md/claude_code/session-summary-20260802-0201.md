# Session Summary — claude_code — 2026-08-02T02:01:00+07:00

**Branch**: `main`  **HEAD**: `e52743c`
**Checkpoint**: `.agents/state/checkpoints/handover-claude_code-20260802-0201.json`

## Objective
ศึกษา/วิเคราะห์ [line/line-bot-mcp-server](https://github.com/line/line-bot-mcp-server) แล้วนำแนวคิดที่ใช้ได้จริง
มาทำเป็น PRD + implementation plan สำหรับ jsk-app

## Completed

**1. วิเคราะห์ line-bot-mcp-server** (clone มาอ่านทั้ง repo, ~1,400 บรรทัดใน `src/`, commit `6345bdf` 2026-08-01)
- 12 tools, stdio transport อย่างเดียว, single-tenant ผ่าน env `CHANNEL_ACCESS_TOKEN`, สถานะ preview
- **ของดีที่ใช้ได้**: `create_rich_menu` แปลง Markdown/Marp → HTML → screenshot ด้วย Puppeteer เป็นภาพ
  rich menu — เปลี่ยน "ปัญหาสร้างภาพ" เป็น "ปัญหาจัด layout" ที่คาดเดาผลได้
- **ข้อบกพร่องที่ต้องไม่ลอกมา**: `richmenuBounds()` (`createRichMenu.ts:257-338`) คำนวณพิกัดปุ่มแยกจาก CSS
  ในไฟล์ template คนละไฟล์ → แก้ที่เดียวแล้วปุ่มกดไม่ตรง ไม่มี test จับ; font stack เป็นญี่ปุ่นล้วน
  (`createRichMenu.ts:171`) + Dockerfile ลงเฉพาะฟอนต์ CJK → ข้อความไทยเสี่ยงเป็น ▯; flow 5 ขั้นไม่มี rollback;
  `broadcast_*` ยิงหาผู้ติดตามทุกคนโดยไม่มี dry-run/confirmation ฝั่ง server

**2. สำรวจ jsk-app เทียบเคียง** — พบว่า 2 ใน 3 ไอเดียที่ตั้งใจนำมาใช้ **มีอยู่แล้ว**
- Flex validator → `backend/app/schemas/reply_object_validation.py` มีอยู่แล้ว และคอมเมนต์ระบุว่า
  *"Flex stays free JSON by design"* คือจงใจปล่อยไว้ → ตัดออกจากขอบเขต
- MCP surface → เพิ่ม attack surface ให้ระบบภาครัฐโดยยังไม่มี use case → ตัดออก
- `rich_menu_service.py` (454 บรรทัด) มี alias/per-user link/bulk/insights/idempotent sync ครบกว่า MCP มาก
- **ช่องว่างจริงเหลือจุดเดียว: การสร้างภาพ** — `POST /{id}/upload` (`rich_menus.py:551`) รับได้แค่ไฟล์
  ที่ทำมาแล้ว และการมีหน้า `/admin/image-resize` ทั้งหน้าพร้อม preset `line-rich-large` (2500×1686)
  คือหลักฐานว่าขั้นเตรียมภาพเป็นจุดเจ็บจริง

**3. สร้าง `.claude/PRPs/prds/rich-menu-image-generator.prd.md`**
- 5 phase, MoSCoW, metric, risk table, decisions log, open questions 5 ข้อ
- ตัดสินใจสำคัญ: render ด้วย **Canvas ฝั่งเบราว์เซอร์** ไม่ใช่ Puppeteer ฝั่ง backend แบบ LINE MCP
  → ไม่ต้องลง Chromium ~400MB บน Koyeb, ไม่มี cold start, **ไม่แตะ backend เลย**
- ขอบเขต v1: ข้อความ + สีพื้น + สีตัวอักษร

**4. สร้าง `.claude/PRPs/plans/rich-menu-image-generator-phase1.plan.md`** (Phase 1: Render core + ฟอนต์ไทย)
- 7 tasks, 6 ไฟล์ใหม่ใน `frontend/lib/rich-menu/`, complexity Medium
- อัปเดตสถานะ Phase 1 ใน PRD → `in-progress` พร้อมลิงก์ไปแผน

## Key Findings (ที่กำหนดรูปของแผน)

| # | สิ่งที่พบ | ผลต่อแผน |
|---|---|---|
| 1 | `app/layout.tsx:6-13` โหลด `Noto_Sans_Thai` ผ่าน `next/font/google` ครบ weight 400/500/700 อยู่แล้ว | ความเสี่ยงฟอนต์ไทยลดลงมาก **แต่** next/font ตั้งชื่อ family แบบ hash → ต้องอ่านจาก CSS var `--font-noto-thai` ห้าม hardcode `"Noto Sans Thai"` |
| 2 | โปรเจกต์ **ไม่ได้ลง package `canvas`** และ vitest ใช้ `environment: 'jsdom'` → `getContext('2d')` คืน `null` | บังคับแยก `text-layout.ts` (pure, รับ `measure: MeasureTextFn` เป็นพารามิเตอร์ → เทสต์ได้ 100%) ออกจาก `render.ts` (วาดจริง, ตรวจด้วยตา) |
| 3 | `new/page.tsx:329-337` สร้าง `FormData` → POST `/upload` อยู่แล้ว | generator คืน `File` แล้วเสียบจุดเดิมได้ → **ไม่ต้องแก้ backend / migration / deploy Koyeb** |
| 4 | `new/page.tsx:68-180` `PRESET_TEMPLATES` 11 แบบมี `bounds` ครบที่ 2500×1686 / 2500×843 | ใช้ bounds ชุดเดียวกับที่ส่งให้ LINE เป็น source of truth → ภาพกับพื้นที่กดเพี้ยนกันไม่ได้เชิงโครงสร้าง (แก้ข้อบกพร่องของ LINE MCP โดยตรง) |
| 5 | ภาษาไทยไม่มีช่องว่าง — `text.split(' ')` ใช้ไม่ได้ | ต้องใช้ `Intl.Segmenter('th', { granularity: 'word' })` + fallback; ระวังตัดกลาง grapheme ("ปุ๊" = 3 code unit) และเคส `wrapText` วนไม่รู้จบเมื่อคำเดียวกว้างเกินกรอบ |

## Next Steps
- Implement Phase 1 ตาม `.claude/PRPs/plans/rich-menu-image-generator-phase1.plan.md`
  (acceptance บังคับว่า `git diff` ต้องไม่แตะ `app/admin/rich-menus/new/` และ `backend/` เลย)
- หา baseline การใช้งาน Rich Menu จาก audit log เพื่อยืนยัน metric ใน PRD
  (target 60% ที่ตั้งไว้ยังเป็นตัวเลขสมมติ)
- ตัดสินใจนโยบาย `fitTextToBox` ตอน implement: "ย่อฟอนต์จนสุดแล้วค่อยตัดท้าย" (ที่แผนตั้งไว้)
  vs "ตัดท้ายเลยโดยคงขนาดฟอนต์เท่ากันทุกช่อง" — ให้หน้าตาเมนูต่างกันชัดเจน

## Blockers
- _none_ — Phase 1 ไม่มี dependency ภายนอก ไม่ต้องลง package ใหม่

## Notes
- Session นี้ **ไม่มีการแก้โค้ดใด ๆ** — ส่งมอบเป็นเอกสาร 2 ไฟล์เท่านั้น
- repo ที่ clone มาวิเคราะห์อยู่ใน scratchpad ชั่วคราว ไม่ได้เพิ่มเข้า repo นี้
- ไม่ได้นำโค้ดหรือ dependency ใด ๆ จาก line-bot-mcp-server (Apache-2.0) มาใช้ — นำเฉพาะแนวคิด
