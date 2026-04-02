---
description: Universal handoff workflow for any AI coding platform
---

# Workflow: Universal Handoff (Any Platform -> Any Platform)

## Purpose
Guarantee clean cross-platform continuity with no stale state drift.

## Mandatory Handoff Contract
A handoff is **invalid** unless all 5 artifacts are updated/created in the same session:
1. `.agents/PROJECT_STATUS.md`
2. `.agents/state/current-session.json`
3. `.agents/state/TASK_LOG.md` ← **APPEND ONLY**
4. `.agents/state/checkpoints/handover-[platform]-[YYYYMMDD-HHMM].json`
5. `project-log-md/[platform]/session-summary-[YYYYMMDD-HHMM].md`

**Plus 2 cross-platform artifacts:**
6. `.agents/state/SESSION_INDEX.md` ← Update with your session
7. **Cross-platform notification** - Ensure next agent reads from all platforms

> **⚠️ CRITICAL**: `.agents/state/TASK_LOG.md` is **APPEND-ONLY**. Never overwrite existing entries. Always prepend new tasks to the top of the "Task History" section.

---

## Step 1: Capture Current Work
Run:
```bash
git branch --show-current
git status --short
git log -5 --oneline
```

---

## Step 2: Update Shared State (Required)

### 2a. Update PROJECT_STATUS.md
- `Last Updated` timestamp
- Active milestone progress
- Recent completion entry (append to list, don't overwrite)

### 2b. Update current-session.json
- `last_updated`, `platform`, `current_task`, `plan_status`, `next_steps`
- Append to `handoff_history` array (don't overwrite history)
- Add reference to cross-platform work read:
```json
"cross_platform_context": {
  "summaries_read": [
    "kimi_code/session-summary-20260214-0430.md",
    "claude_code/session-summary-20260213-0300.md"
  ],
  "key_insights": "Brief notes from other platforms"
}
```

### 2c. **APPEND to TASK_LOG.md** (CRITICAL - Never Overwrite)
```markdown
### Task #[N] - [YYYY-MM-DD HH:MM] - [Agent Platform]

**Task ID**: `task-[id]`
**Agent**: [platform]
**Status**: [completed|in_progress|blocked]
**Duration**: [time]

#### Cross-Platform Context
- Read summaries from: [List platforms]
- Key insights from other agents: [Notes]

#### Work Completed
- Item 1
- Item 2

#### Files Modified
- `path/to/file`

#### Session Summary
- Location: `project-log-md/[platform]/session-summary-[TIME].md`
- Checkpoint: `.agents/state/checkpoints/handover-[platform]-[TIME].json`

#### Blockers
- None / [description]

#### Next Steps
- Step 1

---
```

> **Important**: 
> - Read existing TASK_LOG.md first
> - Find the last task number (N)
> - Prepend your new task entry ABOVE the previous one
> - Never delete existing entries
> - **Reference cross-platform summaries you read**

---

## Step 3: Create Handoff Checkpoint JSON
Create:
`.agents/state/checkpoints/handover-[platform]-[YYYYMMDD-HHMM].json`

Minimum required fields:
- `handoff_version`
- `platform`
- `agent`
- `timestamp` (ISO-8601)
- `status`
- `work_summary`
- `priority_actions`
- `context_for_next_agent`
- `task_log_entry` (reference to TASK_LOG.md entry)
- `cross_platform_read` (array of summaries read from other platforms)

Example:
```json
{
  "cross_platform_read": [
    {
      "platform": "claude_code",
      "file": "session-summary-20260213-0300.md",
      "key_insight": "Sidebar fixes completed"
    },
    {
      "platform": "antigravity", 
      "file": "session-summary-20260213-2200.md",
      "key_insight": "CLI tools fixed"
    }
  ]
}
```

---

## Step 4: Create Session Summary Markdown
Create:
`project-log-md/[platform]/session-summary-[YYYYMMDD-HHMM].md`

Minimum required sections:
- **Objective** - What you set out to do
- **Cross-Platform Context** - What you read from other agents
- **Completed** - Detailed work done
- **In progress** - What's left
- **Blockers** - Any issues
- **Next steps** - For next agent
- **Session Artifacts** - Links to checkpoint, task log entry

Required cross-platform section:
```markdown
## Cross-Platform Context

### Summaries Read (Before My Work)
- [Platform A] `session-summary-[TIME].md` - [Key point]
- [Platform B] `session-summary-[TIME].md` - [Key point]

### For Next Agent
**You should read these summaries before continuing:**
1. [Platform X] `session-summary-[TIME].md` - [Why]
2. [Platform Y] `session-summary-[TIME].md` - [Why]

**Current project state across platforms:**
- [Platform A] status: [What they're working on]
- [Platform B] status: [What they're working on]
```

---

## Step 5: Update SESSION_INDEX.md

Add your session to `.agents/state/SESSION_INDEX.md`:

1. Find your platform's table
2. Add entry with all details
3. Update cross-reference mapping table
4. Update "Last Updated" timestamp
5. Update quick stats

Example entry:
```markdown
| 3 | `session-summary-20260214-0430.md` | 2026-02-14 04:30 | Workflow cleanup | ✅ COMPLETE |
```

---

## Step 6: Verification Gate (Do Not Skip)
Run:
```bash
# Verify all artifacts exist
ls .agents/state/checkpoints/handover-[platform]-*
ls project-log-md/[platform]/session-summary-*

# Verify cross-platform index updated
grep "session-summary-[TIME]" .agents/state/SESSION_INDEX.md

# Verify files are valid
cat .agents/state/current-session.json | head -20
cat .agents/state/TASK_LOG.md | head -50

# Count tasks in log (should increase)
grep -c "^### Task #" .agents/state/TASK_LOG.md

# Verify cross-platform summaries exist
echo "=== Recent summaries from ALL platforms ==="
ls -lt project-log-md/*/*.md | head -10
```

**Validation Checklist:**
- [ ] PROJECT_STATUS.md has new timestamp
- [ ] current-session.json has appended handoff_history
- [ ] current-session.json has cross_platform_context
- [ ] TASK_LOG.md has new entry prepended (task count increased by 1)
- [ ] Checkpoint JSON created with correct naming
- [ ] Session Summary MD created with cross-platform section
- [ ] SESSION_INDEX.md updated with new entry
- [ ] Cross-platform read references are valid

If any check fails, fix before handoff.

---

## Step 7: Cross-Platform Handoff Message

Notify that your work is available to ALL platforms:

```text
🤝 HANDOFF COMPLETE - CROSS-PLATFORM

From: [platform]
To: ANY platform (universal handoff)
Branch: [branch]

📁 Artifacts Created:
- Task Log: Task #[N] in .agents/state/TASK_LOG.md
- Checkpoint: handover-[platform]-[YYYYMMDD-HHMM].json
- Summary: project-log-md/[platform]/session-summary-[YYYYMMDD-HHMM].md
- Index: Updated .agents/state/SESSION_INDEX.md

📖 For Next Agent:
1. Read .agents/state/TASK_LOG.md (last 5 entries)
2. Read .agents/state/SESSION_INDEX.md
3. Read 3 latest summaries from ANY platforms:
   - Kimi Code: [if recent]
   - Claude Code: [if recent]
   - Antigravity: [if recent]
   - CodeX: [if recent]
   - etc.
4. Follow .agents/workflows/pickup-from-any.md

🔗 Cross-Platform Context:
- Summaries I read: [list]
- Current state: [brief]
- Recommended next read: [which platform's summary]

Next priority: [top next step]
```

---

## File Naming Convention
- `handover-[platform]-[YYYYMMDD-HHMM].json`
- `session-summary-[YYYYMMDD-HHMM].md`

---

## Task Numbering Convention
- Task numbers are sequential and permanent
- Format: `Task #1`, `Task #2`, `Task #3`, etc.
- Each agent reads the log, finds the highest number, increments by 1
- Never reuse task numbers
- Never renumber existing tasks

---

## Cross-Platform Best Practices

### When Picking Up
1. **Read summaries from ALL platforms**, not just your own
2. **Check SESSION_INDEX.md** for complete history
3. **Note which platforms are active** - they may have recent context
4. **Reference summaries you read** in your task log entry

### When Handing Off
1. **List summaries you read** in your checkpoint
2. **Recommend specific summaries** for next agent to read
3. **Summarize cross-platform state** - what's happening on each platform
4. **Update SESSION_INDEX.md** so others can find your summary

### Why Cross-Platform Matters
- Work is distributed across platforms
- Each platform has unique strengths
- Context is scattered - you need all pieces
- Avoid duplicating work done on other platforms
- Understand full project history

---

## Notes
- Never rely on chat memory alone; file state is the source of truth
- Do not claim completion for plan steps without matching code/test evidence
- **TASK_LOG.md is sacred** - it represents the complete project history
- **SESSION_INDEX.md is the map** - it shows where to find all summaries
- When in doubt, append more detail rather than less
- **Cross-platform awareness is mandatory** - never work in isolation
