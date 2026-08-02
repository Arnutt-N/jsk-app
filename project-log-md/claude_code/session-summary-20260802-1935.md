# Session Summary — claude_code — 2026-08-02T19:35:00+07:00

**Branch**: `main`  **HEAD**: `6fb6982`
**Checkpoint**: `.agents/state/checkpoints/handover-claude_code-20260802-1935.json`
**ต่อจาก**: `session-summary-20260802-1833.md` (REV 3 — ปิด decision 4 ข้อ)

## Objective
ส่ง PRD + Phase-1 plan ให้ Codex review อย่างอิสระ แล้วแก้สิ่งที่เจอ

## Completed

**1. รัน Codex review แบบ read-only**
```bash
codex exec --sandbox read-only --skip-git-repo-check \
  -o codex-review-result.md - < codex-review-prompt.md
```
`@openai/codex@0.144.1` — `--sandbox read-only` กันไม่ให้แก้ไฟล์ในโปรเจกต์
prompt แบ่งเป็น 2 ส่วน: (ก) **ตรวจว่าการแก้ใน Changelog ถูกจริงไหม** โดยห้ามเชื่อเอกสาร
ให้ไปตรวจกับ repo และ spec เอง (ข) หาสิ่งที่รีวิว 2 รอบก่อนยังไม่เจอ
**จงใจไม่บอกว่ารอบก่อนเจออะไร** เพื่อไม่ให้ยืนยันตามแทนที่จะหาใหม่

**ผลลัพธ์**: verdict **NEEDS REWORK / 4/10** พร้อมยืนยันว่าการแก้ของ REV 2 **ถูกต้อง 21 ข้อ**
เก็บไว้ที่ `.claude/PRPs/reviews/rich-menu-image-generator-codex-review.md`

**2. ตรวจข้อกล่าวหาหลักด้วยตัวเองก่อนยอมรับ** — ยืนยันครบทุกข้อที่ตรวจ

**3. แก้เป็น REV 4** — commit `6fb6982`

## Key Findings

### 🔴 #1 — CSS font variable ให้ค่าต่างกันระหว่าง dev กับ prod (ทั้ง 4 agent รอบก่อนกับผมพลาดหมด)

```
dev  : --font-noto-thai: 'Noto Sans Thai', 'Noto Sans Thai Fallback', system-ui, sans-serif
prod : --font-noto-thai:"Noto Sans Thai",system-ui,sans-serif
```
quote คนละแบบ ช่องว่างคนละแบบ และ **prod ไม่มี `'Noto Sans Thai Fallback'`**
(ยืนยันเองด้วย `grep -rho '\-\-font-noto-thai:[^;}]*' .next/` เจอ 2 ค่า)

**ผลกระทบ**: REV 3 hardcode ค่า dev เป็น `FALLBACK_FONT_STACK` และสั่งให้ Task 6 assert ว่า
"ค่าต้องเหมือนเดิมทุกตัวอักษร" → **เขียวใน dev แล้วแดงทันทีบน production build**

**บทเรียนเชิงวิธีการ (สำคัญกว่าตัวบั๊ก)**: รอบก่อนผมกับ agent ไปอ่าน `.next/dev/` แล้วประกาศว่า
"ตรวจแล้ว นี่คือค่าจริง" ซึ่งฟังดูหนักแน่นกว่าการเดามาก **แต่ไม่เคยถามว่า "ของจริง" มีกี่เวอร์ชัน**
หลักฐานที่ตรวจแล้วบางส่วนให้ความมั่นใจเท่ากับที่ตรวจครบ แต่เชื่อถือได้ไม่เท่ากัน
→ REV 4 ถือค่านี้เป็น **opaque string** ส่งเข้า `ctx.font` ตรง ๆ ห้ามแยกส่วน ห้าม assert equality
เหลือเฉพาะ `"Noto Sans Thai"` (เสถียรทั้งสอง build) เป็น `THAI_FONT_CANONICAL_FAMILY`

### 🔴 #2 — guard ฟอนต์ของ REV 3 ผ่านได้ทั้งที่ใช้ฟอนต์ผิด

REV 3 เทียบความกว้างกับ font ที่ไม่มีจริง + monospace แต่ถ้า Noto ล้มแล้วตกไปใช้
**Leelawadee UI (Windows) / Thonburi (macOS)** ความกว้างก็ยังต่างจาก monospace → guard ผ่าน
→ เปลี่ยนไปตรวจ **`FontFace[]` ที่ `document.fonts.load()` คืนมา**
(`length === 0` หรือ `status !== 'loaded'` = throw) และแยกหน้าที่เป็น
`ensureFontsReady` + `assertCanvasFontApplied`

### 🔴 #3 — `truncateToWidth` ลบทั้งคำทิ้ง

REV 3 ตัดทีละหน่วยจาก `segmentText()` ซึ่งเป็นหน่วย **ระดับคำ** — ป้ายไทยสั้นอย่าง
"ประชาสัมพันธ์" เป็นคำเดียว ถ้ากว้างเกินเพราะ `…` แค่นิดเดียว → ลบหน่วยเดียวจบ
→ **เหลือแค่ `"…"`** ซึ่งขัดกับสิ่งที่ REV 2 แก้ไว้เอง → เปลี่ยนไปตัดด้วย `splitGraphemes()`

### 🔴 #4 — `fitTextToBox` ไม่ได้แก้กรณีล้นแนวสูง

`fits()` ล้มได้ 3 สาเหตุ แต่ทางแก้คือ "slice(0, MAX_LINES) + เติม `…`" เสมอ
→ (ก) ไม่แก้กรณีสูงเกิน (`clip()` แค่ซ่อน) (ข) เติม `…` ให้ป้าย 1 บรรทัดที่ครบถ้วนอยู่แล้ว
→ คำนวณ `maxLinesByHeight` จาก availH จริง + เติม `…` เฉพาะเมื่อ `omittedLines || lastTooWide`

### 🟠 #5 — หน้ายืนยันถูก scope ไปหน้าที่ไม่เคย publish

REV 3 สั่งให้ทำที่ `new/page.tsx:330-331` แต่หน้านั้นเรียกแค่ `/upload` และ `/sync` (บรรทัด 341)
ส่วน `POST /{id}/publish` อยู่ที่ **`frontend/app/admin/rich-menus/page.tsx:99`** (ยืนยันด้วย grep)
→ ย้ายไปที่ถูก + บันทึกว่า frontend-only **ข้ามได้ด้วยการเรียก API ตรง** เป็น UX friction ไม่ใช่ security control

### 🟠 #6 — Task 7 ที่ลบทิ้งคือการลบ safety net ตัวเดียวที่มี

ลบ harness แล้วจะไม่เหลืออะไรตรวจ `render.ts` เลยตลอดไป (font activation, canvas font parsing,
text metrics, Thai shaping, baseline, PNG, ขนาดภาพ, clip, ขนาดไฟล์) และ fake measure ที่ inject
ทำให้เทสต์เขียวได้ทั้งที่ฟีเจอร์พังจริง
→ **บังคับ + เก็บถาวรเป็น Playwright test** `frontend/e2e/rich-menu-render.spec.ts` พร้อม 6 assertion
→ และแก้คำอ้าง "pure logic เทสต์ได้ 100%" ให้ระบุว่าจริงเฉพาะกับ `text-layout.ts` ไม่ใช่ทั้งฟีเจอร์

### 🟡 อื่น ๆ ที่แก้ด้วย
- `??` ไม่จับ `NaN` → ใช้ `Number.isFinite()` ใน font-metric fallback
- invariant 7 ข้อ **ขัดกันเอง** (ข้อ 1/4 "ข้อมูลต้องครบ" vs ข้อ 6/7 "ตัดแล้วลงท้าย `…`")
  → แยกเป็นชุด A (`wrapText`) / B (`fitTextToBox`, ต้องเป็น prefix) / C (ขอบเขตจำนวนรอบที่วัดได้จริง)
  และเทียบ "ลำดับ" แทน "เซต" (เซตจับ `กกข` vs `กข` ไม่ได้)
- `initialFontSize` มีแค่ signature ไม่เคยให้สูตร → ให้แล้ว + `INITIAL_FONT_SIZE_COEFFICIENT = 0.28`
- `wrapText('')` ไม่ได้นิยาม → ถ้าคืน `[]` แล้ว `(lines.length-1)*lineHeight` เริ่มที่ติดลบ
  และ branch ตัดจะเขียน `lines[-1]` → นิยามชัดทั้ง `wrapText('')` และ `fitTextToBox('')`
- `toBreakableUnits` ไม่ครอบกรณี **อักขระต้องห้ามอยู่หน้าสุด** และการวนแตกหน่วยซ้ำ → ให้ pseudocode เต็ม
- PRD ค้างข้อความก่อน REV 3 อยู่ 4 จุด (Phase 1 goal, ตาราง phase 2 ยังมี color picker,
  phase 4 ไม่มี confirmation, MVP scope ขาด Must ใหม่ 3 ตัว)
- metric วัดจริงไม่ได้ → เพิ่ม "นิยามปฏิบัติการ": เกณฑ์คัดผู้เข้าร่วม, โจทย์คงที่ 2 ข้อ, rubric 4 ข้อ,
  ตัวเศษ/ตัวส่วนของ tap rate, จุดเริ่มนับ 14 วัน (`RichMenu` ไม่มี `published_at`),
  และ **ข้อมูลไม่พอ = "สรุปไม่ได้" ไม่ใช่ "ผ่าน"**
- `MAX_LINES = 2` เป็น product constraint **ไม่ใช่ข้อจำกัดพื้นที่** (3 บรรทัด ~445px, 4 บรรทัด ~595px
  ยังพอดีใน 643px) และ 96px ≈ 15 CSS px คิดบนจอ 390pt เท่านั้น จอ 320pt เหลือ 12.3
  → ถอดคำอ้างว่า "รับประกันทุกป้ายอ่านออก"

### จุดที่ Codex เองผิด
โค้ดที่ Codex เสนอในข้อ #4 เขียน `lines.at(-1)! = ...` ซึ่งเป็น **SyntaxError**
(`Array.prototype.at()` คืนค่า ไม่ใช่ reference) — แผนใช้ `lines[lines.length - 1] = ...` แทน

## สถานะเอกสาร

- PRD → **REV 4** สถานะเปลี่ยนจาก "APPROVED" เป็น **Phase 1 = technical spike ที่ยังไม่ merge**
  เพราะ Open Questions ของ PRD เองระบุว่าถ้าอัตราการสร้างเมนู < 1 ครั้ง/เดือน ควรหยุดโครงการ
  แต่ REV 3 ประกาศอนุมัติโดยข้าม gate ของตัวเอง
- Plan → **REV 4** พร้อม implement (8 ไฟล์ Task 1-7, Task 7 บังคับและเก็บถาวร)

```
a1ec424  PRD + plan (REV 1)
81b4a17  REV 2 — แก้ตามรีวิว 4 agent ขนาน
756e174  handoff 1801
3d5f147  REV 3 — ปิด decision 4 ข้อ
68afa3d  handoff 1833
6fb6982  REV 4 — แก้ตามรีวิว Codex
```

## Next Steps

1. **⛔ เช็ค baseline ก่อนเขียนโค้ด** — query เดียวจบ:
   ```sql
   SELECT count(*), min(created_at), max(created_at) FROM rich_menus;
   ```
   **ถ้าอัตราจริง < 1 เมนู/เดือน → หยุดโครงการ** ไม่ต้องเขียนโค้ดเลย (ROI ไม่คุ้ม 5 เฟส)
   นี่คือขั้นที่คุ้มที่สุดตอนนี้ คุ้มกว่ารีวิวรอบที่ 4
2. ถ้าผ่าน gate: implement Phase 1 ตาม plan REV 4
   - Task 1-6 ใน `frontend/lib/rich-menu/` + **Task 7 (Playwright) บังคับ**
   - acceptance: `git diff` ต้องไม่แตะ `app/admin/rich-menus/new/` และ `backend/`
3. ก่อนเข้า Phase 2 ยังต้องปิด: คู่มือ branding ของ สธก. + ภาษาที่ต้องรองรับ

## Blockers
- **baseline gate** ยังไม่ได้เช็ค — บล็อกการ merge Phase 1 (แต่ไม่บล็อกการเริ่มเขียนในฐานะ spike)

## Notes
- ยังไม่ได้ push ทั้ง 7 commit (ผู้ใช้ยังไม่ได้สั่ง)
- Session นี้ยัง **ไม่มีการแก้โค้ดใด ๆ** — ส่งมอบเป็นเอกสาร 3 ไฟล์ (PRD, plan, review artifact)
- บทเรียนเรื่องรีวิว: การให้ผู้รีวิว **ตรวจ Changelog ของรอบก่อน** มีค่าสูงกว่าที่คาด เพราะ
  "การแก้ที่ผิด" อันตรายกว่าข้อผิดพลาดเดิม — มันถูกเขียนด้วยความมั่นใจและดูเหมือนเรื่องที่จบแล้ว
  และการขอให้ระบุ "อะไรตรวจแล้วถูก" ด้วย ทำให้แยกออกว่าอะไรคือ "ผ่าน" กับ "ไม่มีใครตรวจ"
