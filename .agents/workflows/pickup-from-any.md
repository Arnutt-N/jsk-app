---
description: Universal pickup workflow for any AI coding platform
---

# Workflow: Universal Pickup (Any Platform -> Any Platform)

## Purpose
Start work from the latest valid state and detect stale or contradictory handoff data early.

> **🛡️ CRITICAL SAFETY RULE (Prevents Wrong Directory Creation)**:
> 1. **Always use Absolute Paths via `PROJECT_ROOT`**: Before creating or modifying any handoff artifact, define `PROJECT_ROOT=$(git rev-parse --show-toplevel)`.
> 2. **Never rely on relative paths** (e.g., `.agents/...`) without verifying the current working directory first.
> 3. **Pre-flight Check**: Always run `cd "$PROJECT_ROOT"` before executing file creation commands.
> 4. **Subshell for Subdirectories**: If you must `cd` into a subdirectory (e.g., `frontend/`), use a subshell `(cd frontend && ...)` so the main working directory remains unchanged.

---

## Step 1: Locate Latest Handoff Artifacts (From ALL Platforms)

Run:
```bash
# Find latest handoff across ALL platforms
ls -lt .agents/state/checkpoints/handover-*.json | head -5

# Find latest session summary across ALL platforms
ls -lt project-log-md/*/*.md | head -10
```

**Read latest from ANY platform** (not just your own):
1. **Latest handover checkpoint JSON** (newest timestamp, any platform)
2. **Latest 3 session summaries** (from ANY platforms, not just yours)
3. **`.agents/state/SESSION_INDEX.md`** - Cross-platform session index
4. **`.agents/state/TASK_LOG.md`** - Complete task history
5. **`.agents/state/current-session.json`** - Current session state
6. **`.agents/PROJECT_STATUS.md`** - Project dashboard

> **⚠️ CRITICAL**: You MUST read session summaries from **OTHER platforms**, not just your own. Work history is distributed across all agent platforms.

---

## Step 2: Read Cross-Platform Context (REQUIRED)

### Read in This Order:

**A. Quick Overview (3 min)**
```bash
cat .agents/state/TASK_LOG.md | head -100
cat .agents/state/SESSION_INDEX.md | head -50
```

**B. Recent Summaries from ALL Platforms (5 min)**
```bash
# Read the 3 most recent summaries (from ANY platform)
ls -t project-log-md/*/*.md | head -3 | while read f; do
  echo "=== $f ==="
  cat "$f"
  echo ""
done
```

**C. Current State (2 min)**
```bash
cat .agents/state/current-session.json
cat .agents/PROJECT_STATUS.md | head -50
```

**D. Previous Agent's Handoff (if applicable)**
```bash
# Read the specific handoff checkpoint
ls -t .agents/state/checkpoints/handover-*.json | head -1 | xargs cat
```

---

## Step 3: Validate Consistency

Confirm:
- branch in `current-session.json` equals `git branch --show-current`
- `last_updated` in `current-session.json` is not older than latest handoff timestamp
- task count in `TASK_LOG.md` matches or exceeds checkpoint's expected count
- **Cross-platform consistency**: Latest summary from Platform A doesn't contradict Platform B

If mismatch exists:
- treat state as stale
- reconcile all files before coding
- add a "State Sync Reconciliation" entry to `TASK_LOG.md`

---

## Step 4: Verify Environment

Run:
```bash
git branch --show-current
git status --short
git diff --name-only
```

---

## Step 5: Update Session Ownership

Update `.agents/state/current-session.json` with:
- your `platform`
- your `agent_id`
- new `session_id`
- new `last_updated`
- `current_task` set to "new" or "continuing [task-id]"
- **append** new entry to `handoff_history` (don't overwrite)
- refreshed `next_steps`

Add to `handoff_history`:
```json
{
  "from": "previous_platform",
  "timestamp": "2026-02-14T04:30:00+07:00",
  "task": "What previous agent was working on",
  "status": "completed"
}
```

---

## Step 6: Start Working — No Manual Task Entry Needed

The v2 handoff system has **no manual task entry, no task numbering, and no hand-edited
index**. `TASK_LOG.md` and `SESSION_INDEX.md` are **generated** from checkpoint JSON.

- **Do not** create a "Task #N" entry — that convention is retired.
- **Do not** hand-edit `TASK_LOG.md` or `SESSION_INDEX.md` (your edits get overwritten).
- The record for your session is created **at the end** via the handoff command below.

When your work is done, run the single handoff command (see
`.agents/workflows/handoff-to-any.md`):

```bash
node .agents/scripts/handoff-new.cjs <platform> "<work summary>" ["<next step>" ...]
```

If another platform's work informed your session, capture it in your handoff's
`cross_platform_read` (optional) or mention it in the work summary.

---

## Step 7: Confirm Starting Point

Before coding, confirm in one short note:
- current branch
- current top priority task
- **last 3 agents who worked on this** (from TASK_LOG.md)
- **what each agent did** (from their session summaries)
- unresolved blockers

Example confirmation:
```
✅ Pickup Complete

Branch: fix/live-chat-redesign-issues
Reading from: 
- Kimi Code CLI (2026-02-14) - Workflow cleanup
- CodeX (2026-02-14) - UI polish
- Antigravity (2026-02-13) - CLI fixes

Current Task: [Your task here]
Blockers: None
Starting work now.
```

---

## Pickup Checklist

- [ ] **Read TASK_LOG.md** (last 5 entries)
- [ ] **Read SESSION_INDEX.md** (find recent summaries)
- [ ] **Read 3 latest session summaries** (from ANY platforms)
- [ ] latest handover JSON read
- [ ] `PROJECT_STATUS.md` read
- [ ] `current-session.json` updated for current agent
- [ ] **New task entry created in TASK_LOG.md**
- [ ] **SESSION_INDEX.md updated with new entry**
- [ ] git branch validated
- [ ] environment verified
- [ ] **Confirmation message posted**

---

## Understanding Cross-Platform History

### Why Read Other Platforms?
- **Work is distributed**: Claude Code might do design, Kimi does backend, Antigravity does fixes
- **Context is scattered**: Each platform has part of the story
- **Avoid duplicate work**: See what others have already done
- **Understand decisions**: Previous agents documented their reasoning

### Quick Stats Command
```bash
# Count total tasks
grep -c "^### Task #" .agents/state/TASK_LOG.md

# Count summaries per platform
for dir in project-log-md/*/; do
  count=$(ls "$dir"/*.md 2>/dev/null | wc -l)
  echo "$dir: $count summaries"
done

# Show recent summaries across all platforms
ls -lt project-log-md/*/*.md | head -10

# Show tasks by agent
grep "^\*\*Agent\*\*:" .agents/state/TASK_LOG.md | sort | uniq -c
```

### Task Numbering
- Tasks are numbered sequentially: #1, #2, #3, ...
- Numbers are permanent and never reused
- When creating new task: last_number + 1

---

## Rule
Do not start implementation until:
1. State is coherent across all files
2. New task entry is created in TASK_LOG.md
3. Session ownership is updated in current-session.json
4. **SESSION_INDEX.md is updated**
5. **At least 3 cross-platform summaries have been read**
