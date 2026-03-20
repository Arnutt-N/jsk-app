---
description: สรุปงานเป็น .md พร้อม timestamp เพื่อส่งต่อให้ Agent อื่นหรือเริมเซสชันใหม่
---

# Workflow: สรุปงาน (Session Summary)

## Purpose
สร้างไฟล์สรุปงานเพื่อความต่อเนื่อง (Continuity) ระหว่าง Antigravity, Claude Code และการสลับเซสชัน

## Steps

### 1. สร้างไฟล์สรุป
สร้างไฟล์ใหม่ที่ `project-log-md/[AGENT_PLATFORM]/session-summary-YYYYMMDD-HHMM.md`

**Agent Platforms:** `antigravity`, `gemini_cli`, `claude_code`, `codeX`, `kilo_code`, `open_code`, `other`

**Output Directories (เลือกตามประเภทเนื้อหา):**
| Directory | ใช้สำหรับ |
|-----------|----------|
| `project-log-md/` | Session logs, handover summaries |
| `research/` | Research documents, technical notes |
| `PRPs/` | Project Request Proposals |

ใช้ format:
```markdown
# 📝 Session Summary: [หัวข้อ]
Generated: [YYYY-MM-DD HH:MM]
Agent: [ชื่อ Agent]

## 🎯 Main Objectives
[สรุปเป้าหมายหลัก]

## ✅ Completed Tasks
[รายการงานที่เสร็จแล้ว - สอดคล้องกับ task.md]

## ⚡ Technical State & Decisions
- **Mode**: [Pro | Z-AI]
- **Modified**: [ไฟล์หลักที่แก้ไข]
- [การตัดสินใจที่สำคัญ]

## ⏳ Next Steps / Handover
[สิ่งที่ต้องทำต่อทันที หรือคำแนะนำสำหรับ Agent คนถัดไป]
```

### 3. อัปเดต Project Status
อ่านไฟล์ `.agent/PROJECT_STATUS.md` และดำเนินการดังนี้:
1. **Timestamp Check**:
   - ถ้า `Current Time > Last Updated` → อัปเดต Header Timestamp
   - ถ้า `Current Time < Last Updated` → **ห้าม** แก้ Header (ให้คงอันล่าสุดไว้)
2. **Merge History**:
   - เพิ่มรายการ "Recent Completions" ของเราเข้าไปเสมอ (ต่อท้ายหรือแทรกตามเวลา)
   - ห้ามลบรายการของ Agent อื่น
3. **Commit**: บันทึกไฟล์ที่แก้ไข

### 2. ตรวจสอบไฟล์
// turbo
```bash
dir "project-log-md" /B
```

## Connection to Handover
Workflow นี้ถือเป็นส่วนหนึ่งของ **Agent Collaboration Standard**. หากต้องการการส่งมอบงานที่ละเอียดกว่า (เช่น การย้ายระหว่างโปรเจกต์) ให้ใช้ `/agent-handover`.
