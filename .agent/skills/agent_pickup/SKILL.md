---
name: agent_pickup
description: >
  Universal agent pickup - automates workflow for resuming work from any previous AI agent or platform
  Reference standard for SKN App. Use when needing general guidance, 
  "อ้างอิง", "ดูคู่มือ", "standard".
compatibility: SKN App Project
metadata:
  category: reference
  tags: [reference, agent-pickup]
---

# Agent Pickup Skill


## Context7 Docs

Context7 MCP is active. Always attempt to use `mcp__context7__resolve-library-id` for any libraries discussed in this standard to retrieve the most up-to-date documentation.

## Overview

This skill automates the complete agent pickup workflow by orchestrating all the manual steps from the pickup-from-any.md and pick-up.md workflows into a single unified command.

**Use this skill when:** You're starting work and need to pick up where a previous agent left off.

---

## Prerequisites

1. `.agent/state/` directory exists
2. Previous agent created a handoff checkpoint
3. You're in the correct project directory

---

## Automated Pickup Steps

This skill automates the following workflow:

### Step 1: Locate Latest Handoff

**Action:** Find the most recent checkpoint file.

```bash
# List checkpoints to find latest
ls -lt .agent/state/checkpoints/ | head -10

# Or find only handoff files
ls -lt .agent/state/checkpoints/handover-*.json | head -5
```

**Files to read:**
1. `handover-{FROM}-{TO}-{TIMESTAMP}.json` (latest)
2. `session-summary-{TIMESTAMP}.md` (latest)
3. `.agent/state/current-session.json`
4. `.agent/state/task.md`

### Step 2: Read Handoff Checkpoint

**Action:** Read and understand the handoff state.

**What to check:**
| Field | Description |
|-------|-------------|
| `from_platform` | Platform that handed off |
| `to_platform` | Platform that should receive (should be you) |
| `summary` | Summary of what was done |
| `completed` | Items that are finished |
| `in_progress` | Items partially done |
| `next_actions` | What to do next |
| `blockers` | Any issues blocking progress |

### Step 3: Read Session Summary

**Action:** Read the session summary for full context.

**What to focus on:**
- ✅ **Completed** - What's already done
- 🚧 **In Progress** - What's partially done (note % complete)
- 🛑 **Blockers** - Problems to address
- ⏭️ **Next Steps** - Immediate actions to take

### Step 4: Verify Environment

**Action:** Verify you're in the correct environment.

```bash
# Check git branch
git branch --show-current

# Check git status
git status

# Verify it matches the checkpoint's branch
```

**If branch doesn't match:**
```bash
git checkout {branch-from-checkpoint}
```

### Step 5: Update Your Session

**Action:** Update `.agent/state/current-session.json` with your platform info.

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
    "branch": "{branch-from-checkpoint}"
  },

  "current_task": {
    "id": "{task-id-from-checkpoint}",
    "title": "{task-title-from-checkpoint}",
    "status": "in_progress",
    "priority": "{priority-from-checkpoint}"
  },

  "context": {
    "recent_files": [
      "{files-you-will-work-on}"
    ],
    "active_branch": "{branch-from-checkpoint}",
    "modified_files": []
  },

  "blockers": [
    {
      "issue": "{any-new-blockers}",
      "severity": "medium"
    }
  ],

  "next_steps": [
    "{first-thing-you-will-do}",
    "{second-thing}"
  ]
}
```

### Step 6: Update Task File

**Action:** Update `.agent/state/task.md` to reflect you're taking over.

**Template:**
```markdown
# Current Task

**Status:** In Progress
**Assigned:** {Your Name/Agent}
**Started:** {date}

---

## Objective

{objective-from-checkpoint}

---

## Subtasks

- [x] {completed-item-from-checkpoint}
- [x] {another-completed-item}
- [ ] {in-progress-item-continue-here}
- [ ] {pending-item-from-checkpoint}

---

## Progress Notes

### Session {date} ({Your Platform})
- Picked up work from {previous-platform}
- Continuing with {next-action}
- {any-notes-about-transition}

---

## Blockers

{blockers-from-checkpoint or new ones}

---

## Next Steps

1. {first-action-from-checkpoint}
   - {details}
2. {second-action}
```

### Step 7: Understand the Context

**Pre-work checklist:**
- [ ] Read and understand **Session Summary**
- [ ] Know what is **completed** and what is **in progress**
- [ ] Understand any **blockers** identified
- [ ] Know the **next steps** to take
- [ ] Verified you're on the correct **branch**
- [ ] Know which **files** were modified

### Step 8: Begin Work

**Action:** Start working on the first next action.

```bash
# Example: Open file to continue work
# Or start command that was suggested
```

### Step 9: Update Task Progress

**Action:** As you work, update `task.md` to track progress.

```markdown
## Progress Notes

### Session {date} ({Your Platform})
- [x] {completed action 1}
- [x] {completed action 2}
- [ ] {in progress action}
- [ ] {pending action}

### Issues Found
- {any new issues discovered}
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

## Pickup Complete Message

After completing all steps, send this message to confirm pickup:

```
✅ PICKUP COMPLETE

Platform: {Your Platform}
Task: {Task Name}
From: {Previous Platform}

Files updated:
- .agent/state/current-session.json
- .agent/state/task.md

Ready to continue work!

Next action: {first-thing-you-will-do}
```

---

## First Session (No Checkpoint)

If this is the first session and no checkpoint exists:

**Action:** Initialize new session files.

```bash
# Create state directory if needed
mkdir -p .agent/state/checkpoints

# Create current-session.json with template
# Create task.md with initial task
```

**Template for current-session.json:**
```json
{
  "version": "1.0",
  "last_updated": "{ISO_TIMESTAMP}",
  "platform": "{your-platform}",
  "agent_id": "{your-agent-id}",
  "session_id": "{unique-session-id}",
  "project": {
    "name": "SknApp",
    "root": "{project-root}",
    "branch": "{current-branch}"
  },
  "current_task": {
    "id": "task-{timestamp}",
    "title": "{initial-task}",
    "status": "in_progress",
    "priority": "medium"
  },
  "context": {
    "recent_files": [],
    "active_branch": "{current-branch}",
    "modified_files": []
  },
  "blockers": [],
  "next_steps": ["{first-action}"]
}
```

---

## Platform-Specific Pickup

### Claude Code (`claude-code`)
```bash
# 1. Read state files
cat .agent/state/current-session.json
cat .agent/state/task.md

# 2. Read latest checkpoint
LATEST=$(ls -t .agent/state/checkpoints/handover-*.json | head -1)
cat $LATEST

# 3. Update session for Claude Code (use Edit tool)
# 4. Begin work
```

### Antigravity/Cursor (`antigravity`)
```bash
# 1. Import task state
# 2. Read artifacts from previous session
# 3. Update task boundary
# 4. Begin work
```

### Open Code/OpenAI (`open-code`)
```bash
# 1. Read markdown files
cat .agent/state/task.md
cat .agent/state/checkpoints/session-summary-*.md | tail -100

# 2. Understand context
# 3. Update files manually
# 4. Begin work
```

### Kimi Code (`kimi_code`)
```bash
# 1. Read state files
cat .agent/state/current-session.json
cat .agent/state/task.md
cat .agent/state/checkpoints/session-summary-*.md | tail -50

# 2. Update session
# 3. Begin work
```

### Aider (`aider`)
```bash
# 1. Pull latest changes
git pull

# 2. Read state files
cat .agent/state/current-session.json
cat .agent/state/task.md

# 3. Add files to context
aider .agent/state/current-session.json .agent/state/task.md

# 4. Update and begin work
```

---

## Quick Pickup Checklist

```
□ Found latest handoff checkpoint
□ Read handoff JSON and session summary
□ Verified git branch matches checkpoint
□ Updated current-session.json
□ Updated task.md
□ Understand context and next steps
□ Ready to begin work
```

---

## Emergency Recovery

If no checkpoint files exist:

```bash
# 1. Check git history for state files
git log -- .agent/state/

# 2. Restore from git if available
git checkout {COMMIT-HASH} -- .agent/state/

# 3. Or reconstruct from git commits
git log -10 --oneline
```

---

## Related Workflows

- `.agent/workflows/pickup-from-any.md` - Detailed pickup workflow
- `.agent/workflows/pick-up.md` - Original pickup steps
- `.agent/workflows/handoff-to-any.md` - Corresponding handoff workflow

---

## Notes

- This skill preserves all existing workflow files - it's a wrapper/orchestrator
- If no checkpoint exists, this is a "first session" - initialize new state files
- The state files (`current-session.json`, `task.md`) are the single source of truth
- Always verify git branch matches the checkpoint before starting work
