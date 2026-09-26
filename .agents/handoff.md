# Handoff — MOVED (this file is retired)

> **ไฟล์นี้เลิกใช้แล้ว (retired 2026-09-26)** — เนื้อหาเก่า (PR #165, ก.ค. 2026)
> ย้ายไป `project-log-md/archive/2026-07-28-handoff-pr165.md`
>
> **ระบบปัจจุบัน:** ต้นฉบับจริงคือ `.agents/state/checkpoints/handover-<platform>-<YYYYMMDD-HHMM>.json`
> - อ่านเรื่องล่าสุด: `.agents/state/TASK_LOG.md` (3 รายการบนสุด) + `project-log-md/<platform>/session-summary-*.md` ล่าสุด
> - ส่งงานต่อ: `node .agents/scripts/handoff-new.cjs <platform> "<summary>" ["<next step>" ...]`
> - คู่มือ: `.agents/workflows/handoff-to-any.md` (ส่งงาน) / `pickup-from-any.md` (รับงาน)
