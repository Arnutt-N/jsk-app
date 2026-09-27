# PRD: Handoff System Cleanup — 2026-09-26

**Created:** 2026-09-26
**Author:** Cline
**Branch:** `feat/handoff-system-cleanup-20260926`
**Status:** Draft → review before implement
**Trigger:** ผู้ใช้สั่ง "อ่าน handoff" แล้วได้ไฟล์เก่า `.agents/handoff.md` (28 ก.ค., PR #165) ทั้งที่ระบบจริงคือ checkpoint JSON + TASK_LOG/SESSION_INDEX (ล่าสุด 24 ก.ย. #232) + ผู้ใช้บอก "ระบบอ่าน handoff น่าจะทำงานไม่ถูกต้อง" ชี้ไฟล์ `project-log-md/cline/session-summary-20260924-0653.md`

---

## 1. Executive Summary

ระบบส่งงานต่อระหว่าง AI (handoff) มี 2 ชุดวางปนกัน: เล่มเก่า (ไฟล์เดียว `.agents/handoff.md`) กับระบบใหม่ (checkpoint JSON เป็นต้นฉบับ + สร้างสมุดรวมอัตโนมัติ) เอกสารคู่มือ 4 ฉบับยังเขียนขัดกันเอง (บอกทั้ง "ห้ามแก้ด้วยมือ" และ "จงเพิ่มรายการด้วยมือ") ทำให้ AI หยิบไฟล์เก่ามาอ่านและเล่าเรื่องเก่า 2 เดือน PRD นี้สั่งเก็บกวาดให้เหลือระบบเดียว + คู่มือพูดตรงกัน + ซ่อมไฟล์สถานะที่ค้าง + เติมรายชื่อแพลตฟอร์มที่หาย + เสริมโปรแกรมตรวจให้จับความเก่าได้

## 2. Goals / Non-goals

**Goals:**
- อ่าน handoff แล้วเจอเรื่องล่าสุดเสมอ (ไม่มีไฟล์เก่าหลอก)
- คู่มือทุกฉบับพูดตรงกัน: ต้นฉบับ = checkpoint JSON, สมุดรวมสร้างอัตโนมัติ ห้ามแก้ด้วยมือ
- ไฟล์สถานะ (`PROJECT_STATUS.md`, `task.md`, `current-session.json`) ตรงกับงานล่าสุด
- โปรแกรมตรวจ (`validate_handoff_state.py`) จับความเก่า/ขัดกันได้ ไม่ใช่แค่โครงไฟล์ครบ

**Non-goals:**
- ไม่เปลี่ยน schema checkpoint v2 (ไม่แตะ `handoff_version`, required keys)
- ไม่ย้ายตำแหน่งไฟล์ (path เดิมทั้งหมด)
- ไม่แตะโค้ด backend/frontend แอปจริง — งานนี้แก้เฉพาะเอกสาร + สคริปต์ handoff
- ไม่ลบประวัติเก่า (archive อย่างเดียว)

## 3. Acceptance Criteria

### AC-1: ไฟล์เก่าไม่หลอกอีก
- AC-1.1 `.agents/handoff.md` ต้องไม่อยู่ที่เดิมในสภาพ "ดูเหมือนของจริง" — ย้ายไป `project-log-md/archive/2026-07-28-handoff-pr165.md` (หรือโฟลเดอร์ archive ใต้ `.agents/`) เหลือไว้แค่ไฟล์ส่งต่อ (redirect stub) ที่บอกทางไประบบใหม่
- AC-1.2 ค้นคำว่า "handoff" ในคู่มือต้องเจอระบบใหม่เป็นคำตอบแรก

### AC-2: คู่มือพูดตรงกัน (contradiction = 0)
- AC-2.1 `QUICK_START_CARD.md`: ตอนจบงานต้องไม่สั่ง "APPEND TASK_LOG.md" ด้วยมือ — เปลี่ยนเป็น "รัน handoff-new.cjs (สร้าง checkpoint + สร้างสมุดรวมอัตโนมัติ)"
- AC-2.2 `pickup-from-any.md`: checklist ต้องไม่สั่ง "สร้าง task entry ใน TASK_LOG / อัปเดต SESSION_INDEX ด้วยมือ" — เปลี่ยนเป็นอ่านอย่างเดียว; ลบ section "Task Numbering / Task #N" ที่เลิกใช้แล้ว; ซ่อม Quick Stats commands ที่ grep `^### Task #` (ใช้ไม่ได้กับหัวข้อใหม่ `### YYYY-MM-DD — platform — status`)
- AC-2.3 `start-here.md`: One-Line Summary + Step 13 + Master Checklist + Ultra-Compact ต้องไม่สั่งสร้าง/แก้ TASK_LOG ด้วยมือ — เหลือแค่ "อ่าน TASK_LOG/SESSION_INDEX, บันทึกเกิดตอน handoff"
- AC-2.4 `AGENT_PROMPT_TEMPLATE.md`: ซ่อม 4 จุด — (1) ทางหา handoff ผิด (`project-log-md/*/` หา handover-* ไม่เจอ ของจริงอยู่ `.agents/state/checkpoints/`) (2) `PROJECT_ROOT: D:/genAI/skn-app` ผิด (ต้อง `D:/genAI/jsk-app`) (3) "5 artifacts MANDATORY" ล้าสมัย (ระบบใหม่ = checkpoint + summary + auto views) (4) Version 1.0/2026-02-13 → อัปเดต

### AC-3: ไฟล์สถานะตรงกับงานล่าสุด
- AC-3.1 `task.md`: เปลี่ยนจากงานเก่า `task-thai-date-standardization-20260904` เป็นงานปัจจุบัน (handoff-system-cleanup) พร้อม Overall Progress
- AC-3.2 `PROJECT_STATUS.md`: ส่วน Thai Summary ต้องเล่าเรื่อง 24 ก.ย. (#232 verify-after-deploy) ไม่ใช่ค้าง 4 ก.ย.
- AC-3.3 `current-session.json`: `cross_platform_context.summaries_read` ต้องตรงกับ `cross_platform_read` ใน checkpoint 24 ก.ย. (3 ไฟล์ที่อ่านจริง) ไม่ใช่ของเดือน มิ.ย.

### AC-4: เติมรายชื่อแพลตฟอร์ม + เสริมโปรแกรมตรวจ
- AC-4.1 `CANON` ใน `handoff-new.cjs` + `gen-handoff-views.cjs` ต้องรู้จัก `zcode` (+ `kilo-code`, `gemini`, `open-code` แบบมีขีด) และ `DISPLAY` ต้องมีชื่อแสดงของทุกแพลตฟอร์ม (รวม `zcode`)
- AC-4.2 `validate_handoff_state.py`: เพิ่ม warning (ไม่ fail) 3 ข้อ — (1) เจอ `.agents/handoff.md` ตัวเก่าค้างที่เดิม (2) `task.md` เก่ากว่า checkpoint ใหม่สุดเกิน N วัน (3) `cross_platform_context.summaries_read` ไม่ตรงกับ checkpoint `cross_platform_read`
- AC-4.3 สคริปต์ทดสอบ `test-handoff-system.sh` (ถ้ามี) ต้องยังผ่านหลังแก้

## 4. Risks / Rollback

- เสี่ยงแก้คู่มือแล้วขัดกับสคริปต์ → กันโดยรัน validator + test-handoff-system.sh หลังแก้ทุกครั้ง
- เสี่ยงย้ายไฟล์เก่าแล้วลิงก์พัง → กันโดยเหลือ redirect stub ที่เดิม + ค้น引用ทั้งรีโพก่อนลบ
- Rollback = revert commit บน branch นี้ (ยังไม่ merge จนกว่าผู้ใช้ตรวจ)
