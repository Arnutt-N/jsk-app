# Cross-Platform Collaboration System

> **Version:** 1.0
> **Last Updated:** 2026-01-26
> **Purpose:** Enable seamless handoff between ANY AI coding platforms

---

## ระบบคืออะไร? (What is this?)

ระบบนี้ช่วยให้ **ทุก AI coding platforms** สามารถ:
- **ส่งมอบงาน** (Handoff) พร้อมบริบทครบถ้วน
- **รับงาน** (Pickup) และทำงานต่อได้ทันที
- **ติดตามสถานะ** (State) ของงานอย่างต่อเนื่อง

### Supported Platforms (ตัวอย่าง - สามารถเพิ่มได้)

| Platform | Code | Use When |
|----------|------|----------|
| **Claude Code** | `claude-code` | File operations, terminal work |
| **Antigravity** (Cursor) | `antigravity` | Feature implementation, complex tasks |
| **Open Code** (OpenAI) | `open-code` | Documentation, simple tasks |
| **Aider** | `aider` | CLI-based, git-aware workflows |
| **GitHub Copilot** | `copilot` | IDE integration, suggestions |
| **Tabby** | `tabby` | Self-hosted AI assistant |
| **Continue** | `continue` | Open-source AI assistant |
| **Codeium** | `codeium` | Free AI code completion |
| **Codium** | `codium` | AI-powered IDE |
| **Sweep** | `sweep` | GitHub AI dev bot |
| **CodeX** | `codex` | OpenAI Codex, CodeX variants |
| **Qwen** | `qwen` | Alibaba Qwen coding models |
| **Gemini** | `gemini` | Google Gemini Code Assistant |
| **Custom/New** | `[your-code]` | Any platform - define your own code |

---

## โครงสร้างไฟล์ (File Structure)

```
.agents/
├── state/
│   ├── README.md                    # ไฟล์นี้
│   ├── current-session.json         # สถานะปัจจุบัน (MACHINE-READABLE)
│   ├── task.md                      # งานปัจจุบัน (HUMAN-READABLE)
│   └── checkpoints/                 # บันทึกการส่งมอบงาน
│       ├── handover-*.json          # Handoff data
│       └── session-summary-*.md     # Session summary
│
├── skills/
│   └── cross_platform_collaboration/
│       └── SKILL.md                 # รายละเอียดมาตรฐาน
│
└── workflows/
    ├── handoff-to-any.md            # วิธีส่งมอบงาน
    └── pickup-from-any.md           # วิธีรับงาน
```

---

## วงจรการทำงาน (Workflow Cycle)

```
┌─────────────────────────────────────────────────────────────┐
│                    WORKFLOW CYCLE                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   ┌──────────┐     handoff      ┌──────────┐              │
│   │ Platform │ ───────────────► │ Platform │              │
│   │    A     │                  │    B     │              │
│   └──────────┘                  └──────────┘              │
│        │                            │                     │
│        │ work                       │ work                │
│        ▼                            ▼                     │
│   ┌──────────┐                 ┌──────────┐              │
│   │  Update  │                 │  Update  │              │
│   │  State   │                 │  State   │              │
│   └──────────┘                 └──────────┘              │
│        │                            │                     │
│        └────────────┬───────────────┘                     │
│                     ▼                                     │
│              ┌──────────┐                                 │
│              │ Pick Up   │ ◄─── เริ่มตรงนี้!            │
│              └──────────┘                                 │
└─────────────────────────────────────────────────────────────┘
```

---

## เริ่มต้นใช้งาน (Getting Started)

### สำหรับ Agent คนใหม่ (New Agent Pickup)

```bash
# 1. อ่าน README นี้
cat .agents/state/README.md

# 2. หา handoff ล่าสุด
ls -lt .agents/state/checkpoints/

# 3. อ่านไฟล์ state
cat .agents/state/current-session.json
cat .agents/state/task.md

# 4. อ่าน handoff ล่าสุด
cat .agents/state/checkpoints/handover-[LATEST].json
cat .agents/state/checkpoints/session-summary-[LATEST].md

# 5. ทำตาม workflow: pickup-from-any.md
```

---

## ไฟล์สำคัญ (Key Files)

### 1. current-session.json

ไฟล์ **Single Source of Truth** สำหรับ session ปัจจุบัน

```json
{
  "version": "1.0",
  "last_updated": "2026-01-26T10:30:00Z",
  "platform": "claude-code",
  "agent_id": "claude-opus-4-5",
  "session_id": "sess-20260126-103000",
  "project": { ... },
  "current_task": { ... },
  "context": { ... },
  "blockers": [ ... ],
  "next_steps": [ ... ]
}
```

**ต้องอัปเดตเมื่อ:**
- เริ่ม session ใหม่
- เปลี่ยน platform
- เสร็จงานสำคัญ
- พบ blocker ใหม่

### 2. task.md

ไฟล์ **Human-readable** สำหรับ tracking progress

```markdown
# Current Task

**Status:** In Progress
**Assigned:** Claude Code

## Objective
...

## Subtasks
- [x] Done
- [ ] Todo
```

### 3. checkpoints/handover-*.json

บันทึก **ทุกครั้ง** ที่มีการส่งมอบงาน

### 4. checkpoints/session-summary-*.md

สรุป **ทุก session** ที่ทำเสร็จ

---

## Platform Codes (รหัส Platform)

ใช้รหัสเหล่านี้ใน `current-session.json`:

| Platform | Code | Notes |
|----------|------|-------|
| Claude Code | `claude-code` | Anthropic's CLI tool |
| Antigravity | `antigravity` | Cursor's agent |
| Open Code | `open-code` | OpenAI/others |
| Aider | `aider` | CLI-based assistant |
| GitHub Copilot | `copilot` | Microsoft's assistant |
| Tabby | `tabby` | Self-hosted |
| Continue | `continue` | Open-source extension |
| Codeium | `codeium` | Free AI coding |
| Codium | `codium` | AI-powered IDE |
| Sweep | `sweep` | GitHub bot |
| CodeX | `codex` | OpenAI Codex |
| Qwen | `qwen` | Alibaba Qwen |
| Gemini | `gemini` | Google Gemini |
| **Custom** | `[kebab-case]` | Use lowercase, hyphens |

### เพิ่ม Platform ใหม่ (Adding New Platforms)

หากคุณใช้ platform อื่นที่ไม่อยู่ในรายการ:

1. **กำหนด Platform Code:**
   - ใช้ `kebab-case` (ตัวพิมพ์เล็ก, เชื่อมด้วยยี่ห้อย)
   - ตัวอย่าง: `my-custom-agent`, `new-ai-assistant`

2. **อัปเดต README:**
   ```markdown
   | My Custom Agent | `my-custom-agent` | Description |
   ```

3. **ใช้งาน:**
   ```json
   {
     "platform": "my-custom-agent",
     "agent_id": "my-agent-v1"
   }
   ```

---

## การส่งมอบงาน (Handoff)

### เมื่อจะส่งมอบงาน:

```bash
# 1. อ่าน workflow
cat .agents/workflows/handoff-to-any.md

# 2. อัปเดต state files
# - current-session.json
# - task.md

# 3. สร้าง checkpoint
# - handover-[FROM]-[TO]-[TIMESTAMP].json
# - session-summary-[TIMESTAMP].md

# 4. ตรวจสอบ
ls -lt .agents/state/checkpoints/
```

---

## การรับงาน (Pickup)

### เมื่อจะรับงาน:

```bash
# 1. อ่าน workflow
cat .agents/workflows/pickup-from-any.md

# 2. หา handoff ล่าสุด
ls -lt .agents/state/checkpoints/

# 3. อ่านทุกไฟล์ state
cat .agents/state/current-session.json
cat .agents/state/task.md
cat .agents/state/checkpoints/handover-[LATEST].json

# 4. อัปเดต session ของคุณ
# แก้ current-session.json

# 5. เริ่มทำงาน
```

---

## การตั้งชื่อไฟล์ (File Naming)

### Handoff Checkpoint
```
handover-[FROM]-[TO]-[YYYYMMDD]-[HHMM].json
```

ตัวอย่าง:
```
handover-claude-code-antigravity-20260126-103000.json
handover-antigravity-open-code-20260126-113000.json
```

### Session Summary
```
session-summary-[YYYYMMDD]-[HHMM].md
```

ตัวอย่าง:
```
session-summary-20260126-103000.md
```

---

## Best Practices

### DO ✅

1. **อัปเดต state files ก่อนส่งมอบเสมอ**
2. **สร้าง checkpoint ทุกครั้งที่ส่งมอบ**
3. **เขียน summary ชัดเจน** (ทั้ง EN/TH)
4. **Commit state files ไปด้วย** (optional)
5. **ตรวจสอบ git branch** ก่อนเริ่มงาน

### DON'T ❌

1. **อย่าพึ่ง memory** - ต้องเขียนลงไฟล์
2. **อย่าข้าม checkpoint** - มันคือลิงก์ระหว่าง session
3. **อย่าใช้ platform ผสมกัน** โดยไม่ handoff
4. **อย่าลบ checkpoint files**

---

## Troubleshooting

### ปัญหา: State file ไม่มีอยู่

**Solution:**
```bash
# สร้างจาก template
cp .agents/state/current-session.json.template .agents/state/current-session.json
cp .agents/state/task.md.template .agents/state/task.md
```

### ปัญหา: ไม่พบ checkpoint

**Solution:**
```bash
# ตรวจสอบ git history
git log -- .agents/state/checkpoints/

# หรือ restore จาก git
git checkout [COMMIT] -- .agents/state/
```

### ปัญหา: JSON format invalid

**Solution:**
```bash
# ตรวจสอบด้วย jq
jq . .agents/state/current-session.json

# หรือ online validator
# https://jsonlint.com/
```

---

## Quick Reference

| ต้องการ... | ไฟล์ที่อ่าน | ไฟล์ที่อัปเดต |
|--------------|---------------|-----------------|
| เริ่ม session ใหม่ | `task.md` | `current-session.json` |
| ส่งมอบงาน | `current-session.json` | `handover-*.json`, `session-summary-*.md` |
| รับงาน | `handover-*.json`, `session-summary-*.md`, `task.md` | `current-session.json` |
| ตรวจสอบ progress | `task.md` | - |
| ดู blockers | `current-session.json` | - |

---

## Additional Resources

- **Skill Details:** `.agents/skills/cross_platform_collaboration/SKILL.md`
- **Handoff Workflow:** `.agents/workflows/handoff-to-any.md`
- **Pickup Workflow:** `.agents/workflows/pickup-from-any.md`
- **Main Index:** `.agents/INDEX.md`

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-01-26 | Initial release |
