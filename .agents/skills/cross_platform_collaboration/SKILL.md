---
name: cross_platform_collaboration
description: >
  Universal standard for handoff between Claude Code, Antigravity, and Open Code agents
  Reference standard for SKN App. Use when needing general guidance, 
  "อ้างอิง", "ดูคู่มือ", "standard".
compatibility: SKN App Project
metadata:
  category: reference
  tags: [reference, cross-platform-collaboration]
---

# Cross-Platform Collaboration Standard


## Context7 Docs

Context7 MCP is active. Always attempt to use `mcp__context7__resolve-library-id` for any libraries discussed in this standard to retrieve the most up-to-date documentation.

## Mandatory Sync Gate (Critical)

A handoff is invalid unless these artifacts are all updated in the same session:
1. `.agents/PROJECT_STATUS.md`
2. `.agents/state/current-session.json`
3. `.agents/state/task.md`
4. `.agents/state/checkpoints/handover-[platform]-[YYYYMMDD-HHMM].json`
5. `project-log-md/[platform]/session-summary-[YYYYMMDD-HHMM].md`

If any item is missing, do not finalize handoff.

## Overview

ระบบ collaboration ระหว่าง **ทุก AI coding platforms** ไม่จำกัด

### Known Platforms (ตัวอย่าง)

| Platform | Code | Capabilities |
|----------|------|--------------|
| **Claude Code** | `claude-code` | CLI tools, Read/Edit/Write, Bash |
| **Antigravity** (Google) | `antigravity` | AI pair programming, context-aware |
| **Open Code** (OpenAI) | `open-code` | Markdown logs, standard files |
| **GitHub Copilot** | `copilot` | VS Code integration, suggestions |
| **Tabby** | `tabby` | Self-hosted AI assistant |
| **Continue** | `continue` | Open-source AI code assistant |
| **Codeium** | `codeium` | Free AI code completion |
| **Codium** | `codium` | AI-powered IDE |
| **Aider** | `aider` | CLI-based coding assistant |
| **Sweep** | `sweep` | GitHub AI dev bot |
| **CodeX** | `codex` | OpenAI Codex, CodeX variants |
| **Qwen** | `qwen` | Alibaba Qwen coding models |
| **Gemini** | `gemini` | Google Gemini Code Assistant |
| **Kimi Code** | `kimi_code` | Long-context, versatile writing |
| **Kilo Code** | `kilo_code` | Internal Custom Platform |
| **Other/New** | `[custom-code]` | Use any custom platform code |

## Core Principle

**"State in Files, Not in Memory"**
- ทุกสถานะต้องถูกเก็บในไฟล์ (JSON/MD)
- ไฟล์ต้องเป็น machine-readable และ human-readable
- ทุก platform ต้องอ่าน-เขียนไฟล์เดียวกันได้

---

## Directory Structure

### Agent State & Configuration
```
.agents/
├── state/                      # Shared state directory
│   ├── current-session.json    # Session state (machine-readable)
│   ├── task.md                 # Current task (all platforms)
│   └── checkpoints/            # Handoff checkpoints
│       ├── handover-*.json     # Each handoff creates one
│       └── session-summary-*.md
├── skills/                     # Skills (all platforms)
└── workflows/                  # Workflows (all platforms)
```

### Agent-Specific Output Directories

All output directories share the same agent-specific subdirectory structure:

| Directory | Purpose |
|-----------|---------|
| `project-log-md/` | Session logs, handover summaries, git logs |
| `research/` | Research documents, technical notes |
| `PRPs/` | Project Request Proposals |

**Standard Subdirectory Structure:**
```
[output-directory]/
├── antigravity/    # Antigravity (Google) sessions
├── gemini_cli/     # Gemini CLI sessions
├── claude_code/    # Claude Code sessions
├── codeX/          # CodeX sessions
├── kilo_code/      # Kilo Code sessions
├── kimi_code/      # Kimi Code sessions
├── open_code/      # Open Code sessions
├── qwen/           # Qwen (Alibaba) sessions
├── other/          # Other platforms
└── archive/        # Archived/legacy files
```

**File Naming Convention:**
```
[output-directory]/[agent_platform]/[type]-[YYYYMMDD]-[HHMM].md

Examples:
- project-log-md/antigravity/session-summary-20260129-1930.md
- research/claude_code/liff-integration-notes.md
- PRPs/gemini_cli/feature-request-live-chat.md
```

---

## Universal State Format

### 1. current-session.json (REQUIRED)

ไฟล์นี้คือ "Single Source of Truth" สำหรับทุก platform

```json
{
  "version": "1.0",
  "last_updated": "2026-01-26T10:30:00Z",
  "platform": "claude-code",
  "agent_id": "claude-opus-4-5",
  "session_id": "sess-20260126-103000",

  "project": {
    "name": "SknApp",
    "root": "D:/genAI/skn-app",
    "branch": "fix/live-chat-redesign-issues"
  },

  "current_task": {
    "id": "task-001",
    "title": "Fix live chat navigation issues",
    "status": "in_progress",
    "priority": "high"
  },

  "context": {
    "recent_files": [
      "frontend/app/admin/live-chat/page.tsx",
      "frontend/app/admin/layout.tsx"
    ],
    "active_branch": "fix/live-chat-redesign-issues",
    "modified_files": ["frontend/app/admin/live-chat/page.tsx"]
  },

  "blockers": [
    {
      "issue": "Sidebar overlap on mobile",
      "severity": "medium"
    }
  ],

  "next_steps": [
    "Fix sidebar CSS for mobile breakpoint",
    "Test navigation on actual device"
  ]
}
```

### 2. task.md (REQUIRED)

ไฟล์นี้ใช้สำหรับ task tracking ทุก platform ต้องอัปเดต

```markdown
# Current Task

**Status:** In Progress
**Assigned:** Claude Code
**Started:** 2026-01-26 10:30

## Objective
Fix live chat navigation and sidebar overlap issues

## Subtasks

- [x] Investigate navigation issues
- [ ] Fix sidebar CSS for mobile
- [ ] Test on actual device
- [ ] Create PR

## Notes
- Issue occurs on < 1024px breakpoint
- Sidebar doesn't collapse properly
```

---

## Handoff Protocol

### When Handing Off (Any Platform → Any Platform)

1. **Update State Files**
   ```bash
   # Update current-session.json with latest state
   # Update task.md with progress
   ```

2. **Create Handoff Checkpoint**
   ```json
   // .agents/state/checkpoints/handover-[FROM]-[TO]-[TIMESTAMP].json
   {
     "from_platform": "claude-code",
     "to_platform": "antigravity",
     "timestamp": "2026-01-26T10:30:00Z",
     "session_summary": "Fixed navigation structure, pending CSS fix",
     "files_modified": ["frontend/app/admin/live-chat/page.tsx"],
     "next_action": "Continue with sidebar CSS fix"
   }
   ```

3. **Create Session Summary**
   ```markdown
   // .agents/state/checkpoints/session-summary-[TIMESTAMP].md
   # Session Summary: Live Chat Navigation Fix

   **Platform:** Claude Code
   **Duration:** 45 minutes

   ## Completed
   - Fixed navigation structure
   - Identified sidebar overlap root cause

   ## In Progress
   - Sidebar CSS for mobile (40% done)

   ## Next Steps
   1. Fix sidebar CSS
   2. Test on device
   ```

### When Picking Up (Any Platform)

1. **Read State Files**
   ```
   1. Read .agents/state/current-session.json
   2. Read .agents/state/task.md
   3. Find latest handover file in checkpoints/
   ```

2. **Verify Environment**
   ```bash
   git branch
   git status
   ```

3. **Update Session**
   ```json
   // Update current-session.json
   {
     "platform": "antigravity",  // Your platform
     "agent_id": "cursor-agent",
     "last_updated": "[NOW]"
   }
   ```

---

## Platform-Specific Patterns

### Claude Code (`claude-code`)
**Strengths:** File operations, terminal commands
**Best for:** Refactoring, file modifications, terminal work
```markdown
# Handoff FROM Claude Code
1. Use Edit tool for file changes
2. Use Bash for terminal commands
3. Update state files before handing off
4. Create handover checkpoint
```

### Antigravity/Cursor (`antigravity`)
**Strengths:** Artifacts, task management, context
**Best for:** Feature implementation, complex tasks
```markdown
# Handoff FROM Antigravity
1. Save artifacts to .agents/state/artifacts/
2. Update task boundary
3. Export current task state
4. Create handover checkpoint
```

### Open Code/OpenAI (`open-code`)
**Strengths:** Standard markdown, simple workflows
**Best for:** Documentation, simple tasks
```markdown
# Handoff FROM Open Code
1. Save session summary to markdown
2. Update task.md manually
3. Create checkpoint file
```

### Aider (`aider`)
**Strengths:** CLI-based, git-aware
**Best for:** Terminal-first workflows
```markdown
# Handoff FROM Aider
1. Commit current work
2. Update state files via editor
3. Create handover checkpoint
4. Document in markdown
```

### GitHub Copilot (`copilot`)
**Strengths:** IDE integration, suggestions
**Best for:** Interactive coding
```markdown
# Handoff FROM Copilot
1. Save current files
2. Update state files manually
3. Create handover checkpoint
4. Document context
```

### CodeX (`codex`)
**Strengths:** OpenAI Codex, code generation
**Best for:** Code completion, generation, translation
```markdown
# Handoff FROM CodeX
1. Export session context
2. Update state files
3. Create handover checkpoint
4. Document decisions
```

### Qwen (`qwen`)
**Strengths:** Alibaba Qwen coding models
**Best for:** Chinese/English bilingual coding, multi-language support
```markdown
# Handoff FROM Qwen
1. Save conversation history
2. Update state files
3. Create handover checkpoint
4. Document context (中文/English)
```

### Gemini (`gemini`)
**Strengths:** Google Gemini Code Assistant
**Best for:** Multi-modal code understanding, large context
```markdown
# Handoff FROM Gemini
1. Export session context
2. Update state files
3. Create handover checkpoint
4. Document decisions
```

### Kimi Code (`kimi_code`)
**Strengths:** Long-context understanding, versatile writing
**Best for:** Documentation, analysis, complex reasoning
```markdown
# Handoff FROM Kimi Code
1. Export session context
2. Update state files
3. Create handover checkpoint
4. Document decisions
```

### Kilo Code (`kilo_code`)
**Strengths:** Internal customized workflows
**Best for:** Specialized internal tasks
```markdown
# Handoff FROM Kilo Code
1. Export internal state
2. Update state files (JSON/MD)
3. Create handover checkpoint
4. Document context
```

### Any Custom Platform (`[custom-code]`)
**Universal pattern:**
```markdown
# Handoff FROM Any Platform
1. Update current-session.json (JSON format)
2. Update task.md (Markdown format)
3. Create handover checkpoint (JSON)
4. Create session summary (Markdown)
```

**เพิ่ม Platform ใหม่:**
1. กำหนด `platform_code` ของตัวเอง
2. ใช้ format เดียวกัน
3. Document ใน README.md

---

## Communication Between Platforms

### Standard Message Format

เมื่อส่งมอบงาน ใช้ format นี้ใน checkpoint:

```markdown
# HANDOVER MESSAGE

**From:** Claude Code
**To:** Antigravity
**Time:** 2026-01-26 10:30:00 UTC

## Context
Working on live chat navigation fixes

## What I Did
- Fixed navigation structure in page.tsx
- Identified sidebar overlap CSS issue

## What You Need to Do
1. Fix sidebar collapse CSS for mobile
2. Test on actual device
3. Create PR when done

## Files Changed
- frontend/app/admin/live-chat/page.tsx
- frontend/app/admin/layout.tsx

## Blockers
None - ready to continue
```

---

## Best Practices

### DO ✅

1. **Always update state files** before handing off
2. **Create checkpoints** for every handoff
3. **Write clear summaries** in both English and Thai
4. **Test locally** before marking tasks complete
5. **Commit frequently** with clear messages

### DON'T ❌

1. **Don't rely on memory** - state must be in files
2. **Don't skip checkpoints** - they're the only link between sessions
3. **Don't mix platforms** on same task without handoff
4. **Don't ignore blockers** - document them clearly

---

## Emergency Recovery

หาก state files เสียหายหรือหาย:

```bash
# 1. Check git history
git log -- .agents/state/

# 2. Check latest checkpoint
ls -lt .agents/state/checkpoints/

# 3. Reconstruct from git commits
git log -10 --oneline
```

---

## File Templates

### Template: current-session.json

```json
{
  "version": "1.0",
  "last_updated": "",
  "platform": "",
  "agent_id": "",
  "session_id": "",
  "project": {
    "name": "SknApp",
    "root": "D:/genAI/skn-app",
    "branch": ""
  },
  "current_task": {
    "id": "",
    "title": "",
    "status": "",
    "priority": ""
  },
  "context": {
    "recent_files": [],
    "active_branch": "",
    "modified_files": []
  },
  "blockers": [],
  "next_steps": []
}
```

### Template: task.md

```markdown
# Current Task

**Status:** Pending
**Assigned:**
**Started:**

## Objective

## Subtasks

- [ ] Task 1
- [ ] Task 2

## Notes

```
