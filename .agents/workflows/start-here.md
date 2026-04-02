---
description: Universal entry point for ANY AI agent starting work on SknApp
---

# 🚀 Workflow: Start Here (Universal Agent Entry)

> **Use this when ANY AI agent first starts working on SknApp**

---

## 🎯 One-Line Summary

```
Read START_HERE.md → AGENT_PROMPT_TEMPLATE.md → PROJECT_STATUS.md → TASK_LOG.md → SESSION_INDEX.md → Read 3 latest summaries (any platforms) → pickup-from-any.md → Update current-session.json → Create TASK_LOG.md entry → Start working
```

---

## Step-by-Step

### Step 1: Read Entry Point (2 min)
**File**: `START_HERE.md` (project root)

**What to do**:
```bash
cat START_HERE.md
```

**Why**: Friendly greeting + quick overview + essential links

**Checklist**:
- [ ] Understand this is a LINE Chatbot + LIFF project
- [ ] Know the tech stack (FastAPI + Next.js 16 + PostgreSQL + Redis)
- [ ] See supported platforms list

---

### Step 2: Read Complete Guide (10 min)
**File**: `AGENT_PROMPT_TEMPLATE.md` (project root)

**What to do**:
```bash
cat AGENT_PROMPT_TEMPLATE.md
```

**Why**: Complete universal guide with all rules, patterns, and templates

**Checklist**:
- [ ] Understand the 5-artifact handoff protocol
- [ ] Know your platform code (claude-code/kimi_code/codex/antigravity/gemini/qwen/etc)
- [ ] See scenario-based guides
- [ ] Note emergency contacts

---

### Step 3: Keep Quick Reference Handy (1 min)
**File**: `.agents/QUICK_START_CARD.md`

**What to do**:
```bash
cat .agents/QUICK_START_CARD.md
```

**Why**: Quick commands and reminders while working

**Action**: Keep this file visible during your session

---

### Step 4: Check Project Status (3 min)
**File**: `.agents/PROJECT_STATUS.md`

**What to do**:
```bash
cat .agents/PROJECT_STATUS.md
```

**Why**: Single source of truth for current project state

**Checklist**:
- [ ] Read Thai summary
- [ ] Check Active Milestones
- [ ] See what's In Progress
- [ ] Note any Blockers
- [ ] Understand what needs to be done next

---

### Step 5: Read Task History (2 min)
**File**: `.agents/state/TASK_LOG.md`

**What to do**:
```bash
cat .agents/state/TASK_LOG.md | head -100
```

**Why**: See what all previous agents have done - complete project history

**Checklist**:
- [ ] Read last 3-5 task entries
- [ ] Note the last task number
- [ ] Understand recent context
- [ ] See patterns from previous agents

> **Important**: TASK_LOG.md is **APPEND-ONLY**. Never overwrite existing entries.

---

### Step 6: Read Cross-Platform Session Index (2 min)
**File**: `.agents/state/SESSION_INDEX.md`

**What to do**:
```bash
cat .agents/state/SESSION_INDEX.md
```

**Why**: Find session summaries from ALL platforms (not just yours)

**Checklist**:
- [ ] See which platforms have contributed
- [ ] Note latest summaries from each platform
- [ ] Identify which summaries you should read
- [ ] Check cross-reference mapping

---

### Step 7: Read Recent Summaries from ALL Platforms (5 min)
**Files**: `project-log-md/*/*.md`

**What to do**:
```bash
# Read the 3 most recent summaries from ANY platform
ls -t project-log-md/*/*.md | head -3 | while read f; do
  echo "=== $f ==="
  head -100 "$f"
  echo ""
done
```

**Why**: 
- Work is distributed across platforms
- Each platform has part of the story
- You need full context from all agents

**Checklist**:
- [ ] Read at least 3 recent summaries
- [ ] Note which platform did what
- [ ] Understand current project state
- [ ] Identify any unresolved blockers

> **⚠️ CRITICAL**: You MUST read summaries from OTHER platforms, not just your own.

---

### Step 8: Find Your Task

**Option A: Continuing previous work**
→ Go to Step 6

**Option B: Starting new task**
→ Check `.agents/PROJECT_STATUS.md` Backlog section
→ Or check with user for specific task
→ Create/update `.agents/state/task.md`

---

### Step 9: Pick Up Work (If Continuing)
**File**: `.agents/workflows/pickup-from-any.md`

**What to do**:
```bash
cat .agents/workflows/pickup-from-any.md
```

**Then follow**:
1. Find latest handoff checkpoint
2. Read handoff JSON and session summary
3. Verify git branch matches
4. Validate state consistency

**Commands**:
```bash
# Find latest handoff
ls -t .agents/state/checkpoints/handover-*.json | head -1

# Read state files
cat .agents/state/current-session.json
cat .agents/state/task.md
```

---

### Step 10: Claim Session (REQUIRED)
**File**: `.agents/state/current-session.json`

**What to do**: Update with YOUR platform info

```json
{
  "version": "1.0",
  "last_updated": "2026-02-13T20:30:00+07:00",
  "platform": "YOUR_PLATFORM_CODE",
  "agent_id": "YOUR_AGENT_NAME",
  "session_id": "sess-20260213-203000",
  "project": {
    "name": "SknApp",
    "root": "D:/genAI/skn-app",
    "branch": "current-branch"
  },
  "current_task": {
    "id": "task-001",
    "title": "What you're working on",
    "status": "in_progress",
    "priority": "high"
  },
  "context": {
    "recent_files": [],
    "active_branch": "current-branch",
    "modified_files": []
  },
  "blockers": [],
  "next_steps": ["First action you'll take"]
}
```

**Platform Codes**:
- `claude-code` - Claude Code
- `kimi_code` - Kimi Code
- `codex` - CodeX
- `antigravity` - Antigravity/Cursor
- `gemini` - Gemini CLI
- `qwen` - Qwen
- `open-code` - Open Code
- `kilo_code` - Kilo Code
- `other` - Other platforms

---

### Step 11: Create Your Task Entry (Before Working)
**File**: `.agents/state/TASK_LOG.md`

**What to do**: Create your task entry BEFORE starting implementation

**Steps**:
1. Read TASK_LOG.md to find the last task number (e.g., Task #7)
2. Create new entry at the TOP with next number (e.g., Task #8)
3. Set status as "🔄 IN PROGRESS"
4. Link to previous task if continuing

**Template**:
```markdown
### Task #[N] - [YYYY-MM-DD HH:MM] - [Your Platform]

**Task ID**: `task-[id]`
**Agent**: [platform]
**Status**: 🔄 IN PROGRESS
**Continues From**: Task #[N-1] (if applicable)

#### Work Planned
- [ ] Item 1
- [ ] Item 2

#### Blockers
- None yet

#### Notes
[Picking up from previous agent / Starting new task]

---
```

**Commands**:
```bash
# Find last task number
grep "^### Task #" .agents/state/TASK_LOG.md | head -1

# Edit TASK_LOG.md - prepend your entry
```

---

### Step 12: Start Working

**Find relevant skills**:
```bash
cat .agents/INDEX.md
```

**Common skills**:
- Frontend: `skills/nextjs_enterprise/SKILL.md`
- Backend: `skills/fastapi_enterprise/SKILL.md`
- LINE: `skills/line_integration/SKILL.md`
- Database: `skills/database_postgresql_standard/SKILL.md`

**Update progress regularly**:
- Update `.agents/state/task.md` every 30 minutes
- Check off completed subtasks
- Add progress notes
- Note any blockers

---

### Step 13: Handoff (When Done)
**File**: `.agents/workflows/handoff-to-any.md`

**What to do**:
```bash
cat .agents/workflows/handoff-to-any.md
```

**Create 5 mandatory artifacts**:
1. `.agents/PROJECT_STATUS.md` - Update status
2. `.agents/state/current-session.json` - Mark complete
3. **`.agents/state/TASK_LOG.md`** - **APPEND your completed task entry**
4. `.agents/state/checkpoints/handover-[PLATFORM]-[TIME].json` - Handoff checkpoint
5. `project-log-md/[PLATFORM]/session-summary-[TIME].md` - Session summary

**Plus 2 cross-platform artifacts**:
6. **`.agents/state/SESSION_INDEX.md`** - Add your session to the index
7. **Cross-platform references** - Link to summaries you read

> **CRITICAL**: TASK_LOG.md is append-only. Read existing entries, then prepend your new entry.
> **CRITICAL**: SESSION_INDEX.md must be updated so other agents can find your summary.

**Report**:
```
🤝 HANDOFF COMPLETE

From: [YOUR_PLATFORM]
Task: [TASK_NAME]
Status: [completed|in_progress|blocked]
Artifacts: 5 files updated/created
Next agent can use: .agents/workflows/pickup-from-any.md
```

---

## 🆘 Quick Help

| Problem | Solution |
|---------|----------|
| First time here? | Read `START_HERE.md` |
| Need full guide? | Read `AGENT_PROMPT_TEMPLATE.md` |
| Quick reminder? | Read `.agents/QUICK_START_CARD.md` |
| What to work on? | Read `.agents/PROJECT_STATUS.md` |
| How to pickup? | Read `.agents/workflows/pickup-from-any.md` |
| How to handoff? | Read `.agents/workflows/handoff-to-any.md` |
| Available skills? | Read `.agents/INDEX.md` |

---

## 📋 Master Checklist

### At Start
- [ ] Read `START_HERE.md`
- [ ] Read `AGENT_PROMPT_TEMPLATE.md`
- [ ] Read `.agents/QUICK_START_CARD.md`
- [ ] Read `.agents/PROJECT_STATUS.md`
- [ ] Read `.agents/state/TASK_LOG.md` (last 3-5 entries)
- [ ] Read `.agents/state/SESSION_INDEX.md`
- [ ] **Read 3 latest summaries from ANY platforms**
- [ ] Follow `.agents/workflows/pickup-from-any.md` (if continuing)
- [ ] Update `.agents/state/current-session.json` with my platform
- [ ] Create entry in `.agents/state/TASK_LOG.md`

### During Work
- [ ] Read relevant skill from `.agents/INDEX.md`
- [ ] Update `.agents/state/task.md` every 30 min
- [ ] Update your TASK_LOG.md entry with progress
- [ ] Test changes before marking complete
- [ ] Document blockers immediately

### At End
- [ ] Read `.agents/workflows/handoff-to-any.md`
- [ ] Update TASK_LOG.md entry to ✅ COMPLETED
- [ ] Create/update all 5 artifacts
- [ ] **Update `.agents/state/SESSION_INDEX.md`**
- [ ] Verify all files saved
- [ ] Report handoff complete

---

## ⚡ Ultra-Compact Version

```bash
# Start
cat START_HERE.md AGENT_PROMPT_TEMPLATE.md .agents/PROJECT_STATUS.md .agents/state/TASK_LOG.md
# Update session
# Edit .agents/state/current-session.json with your platform
# Create TASK_LOG.md entry
# Work
# Handoff
cat .agents/workflows/handoff-to-any.md
# Update TASK_LOG.md to COMPLETED
# Create 5 artifacts
```

---

## 🎯 Success Criteria

You've successfully started when:
- [ ] You've read the 3 essential files
- [ ] You've updated current-session.json
- [ ] You know what task you're working on
- [ ] You know how to handoff when done

---

*This workflow ensures ANY AI agent can successfully start working on SknApp.*
