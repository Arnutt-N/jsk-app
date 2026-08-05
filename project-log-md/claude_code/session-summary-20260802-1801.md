# Session Summary — claude_code — 2026-08-02T18:01:00+07:00

**Branch**: `main`  **HEAD**: `81b4a17`
**Checkpoint**: `.agents/state/checkpoints/handover-claude_code-20260802-1801.json`
**ต่อจาก**: `session-summary-20260802-0201.md` (สร้าง PRD + Phase-1 plan REV 1)

## Objective
รีวิว PRD และ Phase-1 plan ที่สร้างไว้ในรอบก่อน ด้วย agent ขนานหลายมุมมอง แล้วแก้สิ่งที่ผิด

## Completed

**1. รีวิวด้วย 4 agent ขนาน** (read-only, ไม่ให้แก้ไฟล์)

| Agent | ขอบเขต | Verdict |
|---|---|---|
| product (general-purpose) | PRD ในฐานะเอกสารผลิตภัณฑ์ — evidence, metric, hypothesis, scope, phase | ❌ NEEDS REWORK |
| Thai i18n (general-purpose) | ความถูกต้องของการเรนเดอร์ภาษาไทยล้วน | ❌ NO |
| typescript-reviewer | การออกแบบ TS ของ plan — signature, algorithm, contract | ⚠️ SHIP WITH FIXES (5/10) |
| citation-check (general-purpose) | ตรวจทุก `file:line` ที่เอกสารอ้าง ว่าตรงกับ repo จริงไหม | 4 WRONG, 9 IMPRECISE |

**2. ตรวจยืนยันข้อกล่าวหาหลักด้วยตัวเอง** — ไม่รับรายงาน agent มาทั้งดุ้น ยืนยันครบทุกข้อ:
- อ่าน `.next/dev/static/css/app/layout.css` ที่ Next generate จริง
- `grep -ci audit backend/app/api/v1/endpoints/rich_menus.py` → 0
- `git log --diff-filter=A -- frontend/app/admin/image-resize/` → `79fae00` (PR #106)
- `ls frontend/app/admin/live-chat/_*` → ยืนยัน convention private folder

**3. แก้เอกสารกลุ่ม A (ข้อเท็จจริงล้วน)** — commit `81b4a17`
- `plan` เขียนใหม่ทั้งไฟล์เป็น REV 2 (แก้ 21 จุด + Changelog table)
- `prd` แก้ 12 จุด + เพิ่ม Changelog + Gate ก่อน Phase 2

## Key Findings — สิ่งที่ REV 1 ผิด (ยืนยันด้วยการรันจริงแล้วทุกข้อ)

### 🔴 ฟอนต์ไทยจะไม่ถูกใช้เลย และไม่มีอะไรเตือน

**ค่าจริงของ CSS variable** (จาก `.next/dev/static/css/app/layout.css`):
```
--font-noto-thai: 'Noto Sans Thai', 'Noto Sans Thai Fallback', system-ui, sans-serif
```
REV 1 อ้างว่า `next/font` hash ชื่อ family — **ผิด** สิ่งที่ hash คือชื่อ *คลาส* (`.__variable_xxxxxx`)
พฤติกรรม hash family เป็นของ Next 12/13 โปรเจกต์นี้ใช้ Next 16.1.1
→ คำสั่งใน REV 1 ที่ให้ "ลอก quote ออก" จะได้ quote ไม่บาลานซ์ → `ctx.font` invalid
→ **canvas spec สั่งว่า "must be ignored"** → คงค่า default `10px sans-serif` ทั้งที่ layout คำนวณบน 96px

**`@font-face` ถูกแยกตาม unicode-range — ไทยกับ latin คนละไฟล์**:
```
unicode-range: U+02D7, U+0303, U+0331, U+0E01-0E5B, U+200C-200D, U+25CC   ← ไฟล์ไทย
unicode-range: U+0000-00FF, ..., U+2000-206F, ...                         ← ไฟล์ latin (มี U+0020, U+2026)
```
`document.fonts.load(font)` มี **default text = `" "` (U+0020)** ซึ่งอยู่ใน range ของ latin
→ ไฟล์ไทยไม่เคยถูก request และ `await document.fonts.ready` ก็ไม่ช่วย เพราะไม่นับเป็น pending
→ `ctx.fillText` เป็น sync วาดด้วยฟอนต์ที่มี ณ วินาทีนั้น → ตกไป `'Noto Sans Thai Fallback'`
   (`src: local("Arial")` — Arial ไม่มี glyph ไทย) → `system-ui` → **ภาพต่างกันตามเครื่องแอดมิน**

**บทเรียนเชิงโครงสร้าง**: การแยก pure logic ออกจาก canvas ทำให้ตรรกะเทสต์ได้ 100% แต่ย้าย
ความเสี่ยงเรื่องฟอนต์ทั้งหมดไปกองใน `render.ts` ซึ่งไม่มี test เลย → **ความล้มเหลวนี้ทำให้
unit test 16 เคสเขียวหมดแต่ภาพผิด** วิธีแก้คือ runtime guard ไม่ใช่เทสต์เพิ่ม
REV 2 จึงเพิ่ม `assertThaiFontActive()` guard 3 ชั้น (round-trip `ctx.font` + `fonts.check` +
width probe เทียบกับ family ที่จงใจไม่มี เพราะ `check()` คืน true เมื่อไม่มี face ไหน match ด้วย)

### 🔴 Metric 3 ใน 4 ตัววัดจากสิ่งที่ไม่มีอยู่

`rich_menus.py` **ไม่เขียน audit log เลย** (grep = 0) แม้ `core/audit.py` + `models/audit_log.py`
จะมีอยู่ และการไปเพิ่มจะ **ขัดกับเสาหลัก "ไม่แตะ backend" ของ PRD เอง**
→ เปลี่ยนไปใช้ `RichMenu.image_path` ที่ persist อยู่แล้ว (sanitizer ปล่อย prefix `generated_` ผ่าน):
```sql
SELECT count(*) FILTER (WHERE image_path LIKE '%\_generated\_%') * 100.0 / count(*)
FROM rich_menus WHERE created_at > '<release_date>';
```
ถอด 2 metric ที่วัดไม่ได้ (ไม่มี `image_uploaded_at`; `image_path` เป็น state ไม่ใช่ event history)
เพิ่ม guardrail จาก `GET /{id}/insights/daily` ที่มีอยู่แล้ว — ตัวเดียวที่จับได้ว่า
"แอดมินทำเมนูได้เร็วขึ้น แต่ได้เมนูที่คนกดน้อยลง"

### 🟠 ภาษาไทยต้องการมากกว่า `Intl.Segmenter`

- สระหน้า **เ แ โ ใ ไ** เป็นอักขระ *spacing* ไม่ใช่ combining mark → `granularity:'grapheme'`
  ยังแยกออก (`'เก'` → `["เ","ก"]`) → บรรทัดจบด้วยสระลอย
- `Intl.Segmenter` ให้ UAX #29 (word) **ไม่ใช่ UAX #14 (line break)** → "ๆ" และ "." ขึ้นต้นบรรทัดได้
- ผลตัดคำต่างกันข้ามเอนจิน: ICU4C (Chrome) / ICU-Apple (Safari) / **ICU4X** (Firefox 125+)
  → PNG จากป้ายเดียวกันขึ้นบรรทัดไม่เหมือนกัน → REV 2 รองรับ `\n` เป็น break hint ที่ deterministic
- `actualBoundingBox*` **ผูกกับสตริง** → ใช้จัดกึ่งกลางจะทำให้แต่ละช่องลอยไม่เท่ากันตามว่าคำนั้น
  มีวรรณยุกต์หรือไม่ → **แย่กว่าเอียงเท่ากันทั้งกริด** เปลี่ยนไปใช้ `fontBoundingBox*`
- `LINE_HEIGHT_RATIO=1.35` ต่ำกว่า metrics ของฟอนต์เอง (ascent 1.061 + descent 0.450 = **1.511 em**)
  → วรรณยุกต์บรรทัดล่างชนสระล่างบรรทัดบน → 1.55

### 🟡 อื่น ๆ
- Test strategy เดิม assert `measure(line) <= maxWidth` ด้วย measure ตัวเดียวกับที่ใช้ตัดบรรทัด
  = **tautology ผ่านเสมอโดยนิยาม** และ fake measure จำลองไทยผิด (combining mark มี advance = 0
  แต่ `Array.from` นับเป็นตัวเต็ม → ประเมินเกินจริง 2-3×) → REV 2 ใช้ 3 fakes + 7 invariants
  + fixtures จริงจาก `lib/constants/categories.ts`
- `_dev-preview/` = Next.js **private folder ไม่ถูก route → 404**; และ `/admin` มี `useAuth()`
  ครอบอยู่แล้ว เหตุผลที่ต้องลบคือ "scratch code" ไม่ใช่ "ไม่มี auth"
- เหตุผลห้าม `import type` ใน REV 1 **ผิดทางเทคนิค** — type import ถูก erase ตอน compile
  เหตุผลจริงคือ Phase 1 ห้ามแตะ `new/page.tsx` (เป็น debt + TODO ให้ลบใน Phase 3)
- `/admin/image-resize` มาจาก PR #106 "Rename & Restructure" มี 5 preset → ไม่ใช่หลักฐาน
  ความเจ็บปวดของผู้ใช้ ลดชั้นเป็น "สัญญาณแวดล้อม" และยอมรับตรง ๆ ว่ายังไม่มีหลักฐานตรง

## Next Steps

**⛔ ปิด `[DECISION-PENDING-1..4]` ก่อน implement** (ทำเครื่องหมายไว้ในเอกสารทั้ง 2 ไฟล์แล้ว):

| ID | เรื่อง | ทำไมต้องให้คนตัดสิน |
|---|---|---|
| 1 | `MIN_FONT_SIZE_PX` 28 → 96, `MAX_LINES` 3 → 2 | 28px บนภาพ 2500px = **4.4 CSS px** บนจอ 390pt (REV 1 คำนวณผิดหน่วยเป็น 12px) แต่แก้แล้วป้ายยาวถูกตัดด้วย "…" เร็วขึ้นมาก = เปลี่ยนพฤติกรรมฟีเจอร์ |
| 2 | contrast guard Should → Must, เตือน → บล็อก | ให้เลือกสีเองได้ (Must) แต่ guard ตัดออกได้ = เครื่องมือผลิตเมนูอ่านไม่ออกได้เร็วขึ้น |
| 3 | publish confirmation / approval gate ใน v1 | `KEY_MANAGE_RICH_MENUS` ตัวเดียวครอบตั้งแต่ create ถึง publish → คนเดียวส่งถึงประชาชนได้ ฟีเจอร์นี้กำลังลบ friction ธรรมชาติ (ต้องรอคนทำกราฟิก) ทิ้ง |
| 4 | target "≥60% ใน 60 วัน" | พิสูจน์ผิดไม่ได้ + ตัวหารน่าจะ 1-5 เมนู |

จากนั้น: implement Phase 1 ตาม plan REV 2
(acceptance บังคับ `git diff` ต้องไม่แตะ `app/admin/rich-menus/new/` และ `backend/`)

ควรปิดก่อน Phase 2 ด้วย: baseline การใช้งานจริง, มีข้อกำหนดเรื่องสีบังคับหรือไม่, ภาษาที่ต้องรองรับ

## Blockers
- _none_ ทางเทคนิค — แต่ 4 decision ข้างบนบล็อกการ implement อยู่

## Notes
- Session นี้ **ไม่มีการแก้โค้ดใด ๆ** — ส่งมอบเป็นเอกสาร 2 ไฟล์เท่านั้น
- บทเรียนเรื่อง agent: ตัวที่มีค่าที่สุดคือตัวที่ไป **รันของจริง** (อ่าน CSS ที่ build ออกมา)
  ไม่ใช่ตัวที่อ่าน source เก่งที่สุด — `layout.tsx` เขียนแค่ `Noto_Sans_Thai({...})`
  ผลลัพธ์จริงอยู่ในไฟล์ที่ generate; และ citation-checker ที่ดูน่าเบื่อที่สุดกลับเจอ
  property path ที่ไม่มีจริง (`PRESET_TEMPLATES[].areas`) + ความขัดแย้งระหว่าง PRD กับ plan
