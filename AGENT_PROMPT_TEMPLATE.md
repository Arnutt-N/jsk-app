# 🤖 Universal Agent Entry Point - SknApp Project

> **Use this prompt when ANY AI agent starts working on this project**

---

## 📋 QUICK START PROMPT (Copy & Paste This)

```
You are working on the SknApp project (LINE Official Account system with LIFF integration).

FIRST - READ THESE FILES IN ORDER:
1. .agents/PROJECT_STATUS.md - Current project status and active tasks
2. .agents/workflows/pickup-from-any.md - How to pick up work from previous agent
3. .agents/skills/cross_platform_collaboration/SKILL.md - Collaboration standards
4. .agents/INDEX.md - Available skills and workflows

THEN - CHECK FOR PENDING HANDOFFS:
- Look in project-log-md/*/ for handover-* files
- Read the most recent session-summary-* file
- Check .agents/state/current-session.json

FINALLY - UPDATE PROJECT_STATE:
- Update .agents/state/current-session.json with your platform
- Confirm you understand the next task
- Begin work following the established patterns

PROJECT ROOT: D:/genAI/skn-app
TECH STACK: FastAPI (backend) + Next.js 16 (frontend) + PostgreSQL + Redis
```

---

## 🎯 For Different Scenarios

### Scenario 1: First Time on This Project

```
I'm starting fresh on the SknApp project. Please:

1. Read the project overview from .agents/PROJECT_STATUS.md
2. Understand the tech stack: FastAPI + Next.js 16 + PostgreSQL + Redis
3. Read the collaboration standards: .agents/skills/cross_platform_collaboration/SKILL.md
4. Check if there's any pending work:
   - List files in project-log-md/*/
   - Check .agents/state/task.md
   - Check .agents/state/current-session.json

5. If this is a NEW task (not continuing previous work):
   - Create a new task.md with the objective
   - Initialize current-session.json
   - Start working

6. If this is CONTINUING previous work:
   - Follow .agents/workflows/pickup-from-any.md
   - Read the latest handover/session-summary
   - Update session ownership
   - Continue work

Report back:
- What is the current project status?
- What task should I work on?
- Are there any blockers?
```

### Scenario 2: Picking Up From Previous Agent

```
I'm picking up work from a previous agent on the SknApp project.

STEPS TO FOLLOW:

1. Read .agents/workflows/pickup-from-any.md completely

2. Locate latest handoff:
   ```bash
   ls -la .agents/state/checkpoints/handover-*.json | head -5
   ls -la project-log-md/*/session-summary-*.md | head -5
   ```

3. Read all state files:
   - .agents/state/current-session.json
   - .agents/state/task.md
   - .agents/PROJECT_STATUS.md
   - Latest handover JSON
   - Latest session summary MD

4. Validate consistency:
   - Does git branch match current-session.json?
   - Are task counters aligned?
   - Is there any stale state?

5. Update for your platform:
   - Update current-session.json with:
     * Your platform (claude-code/kimi_code/codex/etc.)
     * New session_id
     * Current timestamp
     * Your agent_id

6. Confirm understanding:
   - What was completed?
   - What is in progress?
   - What are the next steps?
   - Any blockers?

7. Begin work on the first next action

Report back your understanding before starting implementation.
```

### Scenario 3: Handing Off to Next Agent

```
I'm finishing work and need to hand off to the next agent on SknApp project.

STEPS TO FOLLOW:

1. Read .agents/workflows/handoff-to-any.md completely

2. Complete the Mandatory 5-Artifact Handoff:

   Artifact 1: Update PROJECT_STATUS.md
   - Add timestamp to "Last Updated"
   - Mark completed tasks in Active Milestones
   - Add entry to Recent Completions
   - Update Thai summary

   Artifact 2: Update current-session.json
   - Set status to "completed" or "in_progress"
   - Update last_updated timestamp
   - List all modified files
   - Add next_steps

   Artifact 3: Update task.md
   - Check off completed subtasks
   - Update progress notes
   - List any blockers
   - Specify next steps

   Artifact 4: Create handover checkpoint
   - File: .agents/state/checkpoints/handover-[YOUR_PLATFORM]-[TIMESTAMP].json
   - Include: summary, completed, in_progress, next_actions, blockers

   Artifact 5: Create session summary
   - File: project-log-md/[YOUR_PLATFORM]/session-summary-[TIMESTAMP].md
   - Include: Completed, In Progress, Next Steps (English + Thai)

3. Verify all artifacts:
   ```bash
   cat .agents/PROJECT_STATUS.md | head -20
   cat .agents/state/current-session.json
   cat .agents/state/task.md
   ls -la .agents/state/checkpoints/
   ```

4. Final handoff message:
   - State what was accomplished
   - List specific next actions
   - Note any blockers or warnings
   - Specify which agent should pick up next (if known)

Report: "Handoff complete, all 5 artifacts created"
```

### Scenario 4: Working on Specific Feature

```
I need to work on [FEATURE_NAME] for the SknApp project.

CONTEXT:
- Project: SknApp (LINE Chatbot with LIFF)
- Tech: FastAPI + Next.js 16 + PostgreSQL + Redis
- Feature: [DESCRIBE_FEATURE]

RESEARCH PHASE:
1. Check .agents/INDEX.md for relevant skills:
   - Backend? → fastapi_enterprise, api_development_standard
   - Frontend? → nextjs_enterprise, frontend_architecture
   - LINE? → line_integration, line_messaging_advanced
   - Database? → database_postgresql_standard

2. Check PRPs/ directory for existing proposals

3. Check if similar work exists:
   - Search project-log-md/ for related tasks
   - Check research/ for analysis

PLANNING PHASE:
4. Read relevant SKILL.md files completely

5. Create a plan following the skill's patterns

6. Update task.md with:
   - Objective
   - Subtasks
   - Dependencies

IMPLEMENTATION PHASE:
7. Follow the skill's coding standards
8. Update progress in task.md regularly
9. Test according to testing_standards skill

Report progress every 30 minutes or at milestones.
```

---

## 📂 ESSENTIAL FILES REFERENCE

### Must Read (Every Session)
| File | Purpose | When to Read |
|------|---------|--------------|
| `.agents/PROJECT_STATUS.md` | Project dashboard, active tasks | At start of EVERY session |
| `.agents/workflows/pickup-from-any.md` | How to pickup work | When continuing previous work |
| `.agents/workflows/handoff-to-any.md` | How to handoff work | When ending session |
| `.agents/skills/cross_platform_collaboration/SKILL.md` | Collaboration standards | First time on project |

### State Files (Read & Write)
| File | Purpose | Update Frequency |
|------|---------|------------------|
| `.agents/state/current-session.json` | Session state | At start and end of session |
| `.agents/state/task.md` | Task tracking | Throughout session |
| `.agents/PROJECT_STATUS.md` | Project status | At end of session |

### Output Locations
| Directory | Use For |
|-----------|---------|
| `project-log-md/[PLATFORM]/` | Session summaries, handovers |
| `research/[PLATFORM]/` | Research, analysis docs |
| `PRPs/[PLATFORM]/` | Project proposals, plans |

---

## 🔧 PLATFORM-SPECIFIC NOTES

### For Claude Code
- Use Edit tool for file modifications
- Use Bash tool for terminal commands
- Prefer reading files with Read tool
- Can use Glob for file discovery

### For Kimi Code (me)
- Use ReadFile, WriteFile, StrReplaceFile tools
- Use Shell for terminal commands
- Use Glob, Grep for file discovery
- Can spawn subagents with Task tool

### For Antigravity/Cursor
- Use artifacts for task management
- Export/import task boundaries
- Use standard file operations

### For CodeX
- Use terminal-based commands
- Git-aware operations
- Standard file I/O

### For Any Platform
- All platforms read/write the SAME files
- Use JSON for machine-readable state
- Use Markdown for human-readable docs
- Follow the same directory structure

---

## 🚨 CRITICAL RULES

1. **ALWAYS read PROJECT_STATUS.md first**
   - This is the single source of truth
   - Updated by every agent at end of session

2. **ALWAYS follow handoff-to-any.md when ending**
   - 5 artifacts are MANDATORY
   - Incomplete handoff = invalid handoff

3. **ALWAYS follow pickup-from-any.md when starting**
   - Validate state consistency
   - Don't start work until state is coherent

4. **NEVER modify locked files**
   - Check current-session.json for locked_files
   - Wait for other agents to complete

5. **ALWAYS update task.md progress**
   - Check off completed subtasks
   - Add progress notes
   - Note any blockers

---

## 📞 EMERGENCY CONTACTS

If something goes wrong:

1. **Check git history**
   ```bash
   git log --oneline -10
   git log -- .agents/state/ --oneline
   ```

2. **Check for checkpoints**
   ```bash
   ls -lt .agents/state/checkpoints/
   ```

3. **Reconstruct from latest checkpoint**
   - Read latest handover JSON
   - Read matching session summary
   - Reset to that state if needed

4. **Document the issue**
   - Add to PROJECT_STATUS.md under "Issues"
   - Create issue file in project-log-md/

---

## ✅ AGENT CHECKLIST

### At Start of Session
- [ ] Read PROJECT_STATUS.md
- [ ] Read pickup-from-any.md (if continuing)
- [ ] Check for pending handoffs
- [ ] Update current-session.json with my platform
- [ ] Confirm understanding of next task

### During Session
- [ ] Follow relevant SKILL.md patterns
- [ ] Update task.md progress every 30 min
- [ ] Test changes before marking complete
- [ ] Document any blockers immediately

### At End of Session
- [ ] Create/update all 5 handoff artifacts
- [ ] Verify all files are saved
- [ ] Optional: Commit checkpoint
- [ ] Report handoff complete

---

## 🌍 MULTILINGUAL SUPPORT

This project supports both **English** and **Thai**:

- Primary documentation: English
- Session summaries: English + Thai
- Code comments: English
- User-facing UI: Thai (primary), English (secondary)

When writing session summaries, include both languages:
```markdown
## Completed (สิ่งที่เสร็จแล้ว)
- Fixed navigation bug
- แก้ไขบั๊กการนำทาง
```

---

## 📚 LEARNING PATHS

### New to this project?
1. Read this file completely
2. Read .agents/PROJECT_STATUS.md
3. Read .agents/skills/cross_platform_collaboration/SKILL.md
4. Read .agents/INDEX.md
5. Check project-log-md/ for recent activity

### New to tech stack?
- FastAPI → `skills/fastapi_enterprise/SKILL.md`
- Next.js → `skills/nextjs_enterprise/SKILL.md`
- LINE API → `skills/line_integration/SKILL.md`
- Database → `skills/database_postgresql_standard/SKILL.md`

### New to collaboration?
- Read `skills/cross_platform_collaboration/SKILL.md`
- Read `workflows/handoff-to-any.md`
- Read `workflows/pickup-from-any.md`
- Practice with a small task first

---

*This template ensures ANY AI agent can successfully collaborate on SknApp.*
*Version: 1.0 | Last Updated: 2026-02-13*
