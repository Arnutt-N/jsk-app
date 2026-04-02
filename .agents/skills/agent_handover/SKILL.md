---
name: agent_handover
description: >
  Universal agent handoff - automates workflow orchestration for handing off work from any AI platform to any other platform
  Reference standard for SKN App. Use when needing general guidance, 
  "อ้างอิง", "ดูคู่มือ", "standard".
compatibility: SKN App Project
metadata:
  category: reference
  tags: [reference, agent-handover]
---

# Agent Handoff Skill


## Context7 Docs

Context7 MCP is active. Always attempt to use `mcp__context7__resolve-library-id` for any libraries discussed in this standard to retrieve the most up-to-date documentation.

## Overview

This skill automates the complete agent handoff workflow by orchestrating all the manual steps from the handoff-to-any.md, agent-handover.md, and session-summary.md workflows into a single unified command.

**Use this skill when:** You're finishing work on a task and need to hand off to another agent (same or different platform).

---

## Prerequisites

1. You have completed work that needs to be handed off
2. `.agents/state/` directory exists with current-session.json and task.md
3. You know which platform/agent you're handing off to

---

## Automated Handoff Steps

This skill automates the following workflow:

### Step 1: Update State Files

**Action:** Update `.agents/state/current-session.json` with your latest session state.

**Template:**
```json
{
  "version": "1.0",
  "last_updated": "{ISO_TIMESTAMP}",
  "platform": "{your-platform-code}",
  "agent_id": "{your-agent-id}",
  "session_id": "{unique-session-id}",

  "project": {
    "name": "SknApp",
    "root": "{project-root}",
    "branch": "{current-git-branch}"
  },

  "current_task": {
    "id": "{task-id}",
    "title": "{task-title}",
    "status": "{completed|in_progress|blocked}",
    "priority": "{high|medium|low}"
  },

  "context": {
    "recent_files": ["{list-of-files-worked-on}"],
    "active_branch": "{branch-name}",
    "modified_files": ["{files-modified}"]
  },

  "blockers": [
    {
      "issue": "{any-blocking-issues}",
      "severity": "{high|medium|low}"
    }
  ],

  "next_steps": [
    "{next-action-1}",
    "{next-action-2}"
  ]
}
```

### Step 2: Update Task File

**Action:** Update `.agents/state/task.md` with progress.

**Template:**
```markdown
# Current Task

**Status:** {completed|in_progress}
**Assigned:** {Your Name/Agent}
**Started:** {date}

---

## Objective

{task objective}

---

## Subtasks

- [x] {completed task 1}
- [x] {completed task 2}
- [ ] {pending task 1}
- [ ] {pending task 2}

---

## Progress Notes

{what you accomplished}

---

## Blockers

{any blockers or None}

---

## Next Steps

1. {next action 1}
2. {next action 2}
```

### Step 3: Update PROJECT_STATUS.md

**Action:** Update `.agents/PROJECT_STATUS.md` with completed milestones.

**What to update:**
- Mark completed tasks in "Active Milestones" with `[x]`
- Add completed items to "Recent Completions" with date and agent
- Update Thai summary at top with current focus

### Step 4: Create Handoff Checkpoint

**Action:** Create checkpoint file in `.agents/state/checkpoints/`

**File:** `handover-{FROM}-{TO}-{TIMESTAMP}.json`

**Template:**
```json
{
  "from_platform": "{your-platform}",
  "to_platform": "{target-platform}",
  "timestamp": "{ISO_TIMESTAMP}",
  "session_id": "{session-id}",
  "duration_minutes": {estimated-duration},

  "handover": {
    "summary": "{brief-summary-of-work-completed}",
    "completed": [
      "{completed-item-1}",
      "{completed-item-2}"
    ],
    "in_progress": [
      "{in-progress-item-with-percent-complete}"
    ]
  },

  "context": {
    "files_modified": [
      "{file-1}",
      "{file-2}"
    ],
    "files_to_review": [],
    "commits_made": [
      "{commit-hash-1}",
      "{commit-hash-2}"
    ]
  },

  "next_actions": [
    {
      "action": "{specific-next-action}",
      "priority": "high|medium|low",
      "estimated_effort": "{time-estimate}"
    }
  ],

  "blockers": [
    {
      "issue": "{any-blocking-issues}",
      "suggestion": "{suggested-solution}"
    }
  ],

  "notes": "{additional-context-or-notes}"
}
```

### Step 5: Create Session Summary

**Action:** Create session summary in `.agents/state/checkpoints/`

**File:** `session-summary-{TIMESTAMP}.md`

**Template:**
```markdown
# Session Summary: {Task Name}

**From Platform:** {Your Platform}
**To Platform:** {Target Platform}
**Date:** {YYYY-MM-DD HH:MM}
**Duration:** {minutes} minutes

---

## Objective (วัตถุประสงค์)

{task objective}

---

## Completed (สิ่งที่เสร็จแล้ว)

- [x] {completed-item-1}
- [x] {completed-item-2}

---

## In Progress (สิ่งที่อยู่ระหว่างดำเนินการ)

- [ ] {in-progress-item-1} ({percent}%)
- [ ] {in-progress-item-2}

---

## Files Modified (ไฟล์ที่แก้ไข)

| File | Change |
|------|--------|
| `{file-1}` | {description} |
| `{file-2}` | {description} |

---

## Technical Notes (บันทึกทางเทคนิค)

{important technical decisions or context}

---

## Next Steps (ขั้นตอนถัดไป)

1. **{first action}**
   - {details}

2. **{second action}**
   - {details}

---

## Branch Info

- **Branch:** `{branch-name}`
- **Latest Commit:** `{commit-hash}`
- **Test Status:** {test-status}
```

### Step 6: Verify Files Created

**Action:** Verify all state files and checkpoints exist.

```bash
# Check state files
cat .agents/state/current-session.json
cat .agents/state/task.md
cat .agents/PROJECT_STATUS.md

# List checkpoints
ls -la .agents/state/checkpoints/
```

### Step 7: (Optional) Commit Checkpoint

**Action:** Commit the checkpoint to git for permanent record.

```bash
git add .agents/state/
git commit -m "chore(handoff): checkpoint {FROM}->{TO} - {TASK_NAME}"
```

---

## Platform Codes

| Platform | Code |
|----------|------|
| Claude Code | `claude-code` |
| Antigravity/Cursor | `antigravity` |
| Open Code/OpenAI | `open-code` |
| Aider | `aider` |
| GitHub Copilot | `copilot` |
| Tabby | `tabby` |
| Continue | `continue` |
| Codeium | `codeium` |
| Codium | `codium` |
| Sweep | `sweep` |
| CodeX | `codex` |
| Qwen | `qwen` |
| Gemini | `gemini` |
| Kilo Code | `kilo_code` |
| Kimi Code | `kimi_code` |
| Other | `other` |

---

## Handoff Complete Message

After completing all steps, send this message to confirm handoff:

```
🤝 HANDOFF COMPLETE

From: {Your Platform}
To: {Target Platform}
Task: {Task Name}

Files updated:
- .agents/state/current-session.json
- .agents/state/task.md
- .agents/PROJECT_STATUS.md
- .agents/state/checkpoints/handover-{TIMESTAMP}.json
- .agents/state/checkpoints/session-summary-{TIMESTAMP}.md

Ready for pickup!

Next agent should use: /agent_pickup
```

---

## Quick Reference

**Output Directories:**
| Directory | Purpose |
|-----------|---------|
| `project-log-md/` | Session logs, handover summaries |
| `research/` | Research documents, technical notes |
| `PRPs/` | Project Request Proposals |

**Platform Subdirectories:**
```
[output-dir]/
├── antigravity/
├── claude_code/
├── gemini_cli/
├── codeX/
├── kilo_code/
├── kimi_code/
├── open_code/
└── other/
```

---

## Related Workflows

- `.agents/workflows/handoff-to-any.md` - Detailed handoff workflow
- `.agents/workflows/pickup-from-any.md` - Detailed pickup workflow
- `.agents/workflows/agent-handover.md` - Original handoff steps
- `.agents/workflows/session-summary.md` - Session summary format

---

## Notes

- This skill preserves all existing workflow files - it's a wrapper/orchestrator
- All files created use both JSON (machine-readable) and Markdown (human-readable) formats
- The state files (`current-session.json`, `task.md`) are the single source of truth for handoffs
- PROJECT_STATUS.md is the central dashboard for project-wide status tracking
