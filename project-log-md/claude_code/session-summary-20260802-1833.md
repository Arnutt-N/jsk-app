# Session Summary — claude_code — 2026-08-02T18:33:00+07:00

**Branch**: `main`  **HEAD**: `3d5f147`
**Checkpoint**: `.agents/state/checkpoints/handover-claude_code-20260802-1833.json`
**ต่อจาก**: `session-summary-20260802-1801.md` (REV 2 — แก้ข้อผิดพลาดที่รีวิวเจอ)

## Objective
อธิบาย 4 decision ที่ค้างให้เจ้าของงานตัดสิน แล้วปรับเอกสารตามคำตอบ

## Completed

**เจ้าของงานตัดสินครบทั้ง 4 ข้อ** → แก้ PRD + plan เป็น REV 3 (commit `3d5f147`)

| ข้อ | ตัดสินใจ | สิ่งที่เปลี่ยนในเอกสาร |
|---|---|---|
| 1 | `MIN_FONT_SIZE_PX = 96`, `MAX_LINES = 2` + เตือนตอนพิมพ์ | แก้ค่าคงที่ใน plan Task 3; เพิ่ม **Must** "เตือนความยาวป้ายตอนพิมพ์" เข้า Phase 3 |
| 2 | contrast guard = **Must** + เตือน **และ** บล็อกปุ่มบันทึก | ย้าย Should → Must ใน MoSCoW; **ปรับ Phase 2 เป็น logic ล้วน** ย้าย UI ไป Phase 3 |
| 3 | สำนักงาน**ไม่มีระเบียบ**บังคับอนุมัติ → ใส่หน้ายืนยันก่อน publish | เพิ่ม **Must** เข้า Phase 4 — frontend ล้วน ไม่แตะ backend ไม่เพิ่มเฟส |
| 4 | usability test แอดมินจริง 3 คน | เปลี่ยน primary metric + hypothesis; สัดส่วน generator ลดชั้นเป็น secondary |

**แถมจากรีวิวที่ยังค้าง 2 อย่าง**
- **Phase 2/3 ขนานกันไม่ได้จริงตามที่ REV 1 อ้าง** — "แตะไฟล์คนละชุด" เป็นเงื่อนไขจำเป็นแต่ไม่เพียงพอ
  Phase 2 เดิมมี color input + คำเตือนที่ต้องแสดงบนหน้าจอที่ Phase 3 สร้าง → success signal
  ของ Phase 2 ทดสอบไม่ได้จนกว่า Phase 3 เสร็จ **แก้แล้ว**: Phase 2 = `colors.ts` + contrast maths
  + unit test เท่านั้น
- **เพิ่มหัวข้อ Rollout & Rollback** พร้อม runbook กู้เมนูที่ publish ผิด (REV 1-2 ขาดไป ทั้งที่
  จับประเด็นเดียวกันนี้กับ line-bot-mcp-server ได้ถูกต้อง แต่ไม่ได้ย้อนมาตรวจระบบตัวเอง)

## เหตุผลของ decision 1 (ตัวเลขที่ต้องไม่ถูกลดในภายหลัง)

ภาพ Rich Menu กว้าง 2500px แต่จอมือถือ ~390pt → **ย่อ ~6.4 เท่า**
```
28 px ในภาพ  →  4.4 CSS px บนจอ   ← ค่าเดิม อ่านไทยไม่ออก
96 px ในภาพ  →   15 CSS px บนจอ   ← ค่าใหม่
```
ภาษาไทยแพ้ตรงนี้หนักกว่าอังกฤษ: ข/ช และ ผ/ฝ ต่างกันที่ "หัว" อันเดียว
วรรณยุกต์ ่/้/๊/๋ ต่างกันแค่จำนวนขีด → ที่ 4.4px กลายเป็นจุดเดียวกันหมด
"มีตัวหนังสือแต่อ่านไม่ออก" แย่กว่าถูกตัดด้วย "…"

**ตรวจแล้วว่าไม่บีบเกินไป**: ช่อง large 6 ปุ่ม = 833×843, padding `0.12 × 833 ≈ 100` → availH ≈ 643
ส่วน 2 บรรทัดที่ 96px ใช้ `1 × 150 + 102 + 43 ≈ 295` → เหลือที่อีกเท่าตัว

**การแก้ที่ต้นเหตุอยู่ใน Phase 3** — เตือนตอนพิมพ์ ไม่ใช่ย่อฟอนต์เงียบ ๆ แล้วไปเห็นตอนขึ้น LINE
ป้ายเมนู LINE ควรสั้นโดยธรรมชาติอยู่แล้ว ("แจ้งเบาะแส", "ติดต่อเรา")

## ทำไม decision 3 สำคัญกว่าที่ดู

ถ้าคำตอบคือ "มีระเบียบ" จะต้องแยกสิทธิ์ `publish` ออกจาก `manage` ในฝั่ง backend +
เพิ่ม state `REVIEW` เข้า `RichMenuStatus` + migration + deploy Koyeb →
**ทำลายข้อดีข้อใหญ่ที่สุดของ PRD นี้ ("ไม่แตะ backend เลย") ทันที**
คำตอบ "ไม่มีระเบียบ" จึงประหยัดไปทั้งเฟส

หน้ายืนยันแบบ **พิมพ์ชื่อเมนูซ้ำ** ถูกเลือกแทนปุ่ม "แน่ใจหรือไม่?" ธรรมดา เพราะปุ่มยืนยันทั่วไป
ถูกกดผ่านโดยไม่มองภายในครึ่งวินาที แต่การต้องพิมพ์ชื่อบังคับให้สายตากลับไปที่ภาพ
ซึ่งเป็นจุดที่คำผิดจะถูกจับได้ (pattern เดียวกับที่ GitHub ใช้ตอนลบ repository)

## สถานะเอกสาร

- `.claude/PRPs/prds/rich-menu-image-generator.prd.md` → **REV 3, APPROVED for implementation**
- `.claude/PRPs/plans/rich-menu-image-generator-phase1.plan.md` → **REV 3, พร้อม implement**
- ไม่มี `[DECISION-PENDING]` ที่ยัง live เหลืออยู่ (ที่ค้นเจอเป็น changelog entry ทั้งหมด)

```
a1ec424  PRD + plan (REV 1)
81b4a17  REV 2 — แก้ข้อผิดพลาดที่ 4 agent รีวิวเจอ
756e174  handoff checkpoint 1801
3d5f147  REV 3 — ปิด decision ครบ 4 ข้อ
```

## Next Steps

1. **Implement Phase 1** ตาม plan REV 3 — Task 1-6 ใน `frontend/lib/rich-menu/`
   (`types.ts` → `fonts.ts` → `text-layout.ts` → `render.ts` + 2 test files)
   - acceptance บังคับ: `git diff` ต้องไม่แตะ `app/admin/rich-menus/new/` และ `backend/`
   - `MIN_FONT_SIZE_PX = 96` และ `MAX_LINES = 2` **ห้ามลดลงระหว่างทาง**
   - Task 7 (dev harness) ใช้ชื่อ `dev-preview/` ไม่ใช่ `_dev-preview/` (Next.js private folder)
     และต้องลบก่อน commit
2. **ก่อนเข้า Phase 2** ยังต้องปิด: baseline การใช้งานจริง (`SELECT count(*), min(created_at),
   max(created_at) FROM rich_menus;` + สัมภาษณ์แอดมิน), คู่มือ branding ของ สธก., ภาษาที่ต้องรองรับ

## Blockers
- _none_ — decision ปิดครบแล้ว Phase 1 เริ่มได้ทันที

## Notes
- ยังไม่ได้ push ทั้ง 4 commit (ผู้ใช้ยังไม่ได้สั่ง)
- Session นี้ยัง **ไม่มีการแก้โค้ดใด ๆ** — ส่งมอบเป็นเอกสาร 2 ไฟล์เท่านั้น
