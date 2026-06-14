---
description: รูปแบบไฟล์ session-summary (narrative) สำหรับการส่งต่องานข้ามเซสชัน/แพลตฟอร์ม
---

# Workflow: Session Summary (รูปแบบ narrative)

## Purpose
กำหนด **รูปแบบ** ของไฟล์ narrative ที่อธิบายว่าเซสชันนี้ทำอะไรไปบ้าง เพื่อให้ Agent
ตัวถัดไป (Claude Code, Codex, Antigravity, Kimi ฯลฯ) อ่านแล้วทำงานต่อได้ทันที

> ℹ️ นี่เป็นแค่ **รูปแบบเนื้อหา** — ไม่ใช่ขั้นตอนการส่งมอบงานทั้งหมด
> การ orchestrate (สร้าง checkpoint + regenerate views + sync state) ทำโดย
> [`handoff-to-any.md`](./handoff-to-any.md) ผ่านคำสั่งเดียว `handoff-new.cjs`

---

## วิธีสร้าง (อย่าสร้างด้วยมือถ้าไม่จำเป็น)

ปกติไฟล์นี้ถูกสร้างให้อัตโนมัติโดย:

```bash
node .agents/scripts/handoff-new.cjs <platform> "<work summary>" ["<next step>" ...]
```

มันจะวางไฟล์ stub ที่ `project-log-md/<platform>/session-summary-<YYYYMMDD-HHMM>.md`
พร้อมหัวข้อครบ — หน้าที่คุณคือ **เติมรายละเอียด** ในแต่ละหัวข้อให้สมบูรณ์

`<platform>` ใช้ชื่อ canonical (lowercase_underscore): `claude_code`, `codex`,
`kimi_code`, `antigravity`, `gemini_cli`, `kilo_code`, `open_code`, `cline`

---

## รูปแบบไฟล์ (template)

```markdown
# Session Summary — <platform> — <YYYY-MM-DDTHH:MM:SSZ>

**Branch**: `main`  **HEAD**: `<short-sha>`
**Checkpoint**: `.agents/state/checkpoints/handover-<platform>-<YYYYMMDD-HHMM>.json`

## Objective
[เป้าหมายหลักของเซสชันนี้]

## Cross-Platform Context
- อ่าน summary จากแพลตฟอร์มไหนมาก่อนเริ่ม + insight ที่ได้
- แนะนำให้ Agent ถัดไปอ่าน summary ไฟล์ไหนต่อ

## Completed
- [รายการงานที่เสร็จ — ให้ตรงกับ commit/PR จริง]

## In Progress / Next Steps
- [สิ่งที่ค้าง หรือคำแนะนำสำหรับ Agent คนถัดไป]

## Blockers
- [ปัญหาที่ติด หรือ _none_]
```

---

## หลักการ (อย่าให้เนื้อหาขัดกับหลักฐานจริง)

- **File state = source of truth** — อย่าพึ่งความจำใน chat อย่างเดียว
- อย่าเคลม "เสร็จ" ถ้าไม่มี commit/test รองรับ
- เขียนละเอียดไว้ก่อน ดีกว่าเขียนน้อยเกินไป
- ไฟล์ checkpoint JSON คือแหล่งความจริง; `TASK_LOG.md` + `SESSION_INDEX.md`
  เป็น **generated** (อย่าแก้มือ) — สร้างใหม่ด้วย `node .agents/scripts/gen-handoff-views.cjs`

## เชื่อมกับ Handoff
ไฟล์นี้คือส่วน narrative ของการส่งมอบงาน — ภาพรวมขั้นตอนทั้งหมดดูที่
[`handoff-to-any.md`](./handoff-to-any.md). การรับงานต่อดูที่
[`pickup-from-any.md`](./pickup-from-any.md).
