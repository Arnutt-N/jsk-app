# 🎓 Agent Onboarding Guide - Complete

> **For**: Any AI agent joining the SknApp project  
> **Created**: 2026-02-13  
> **Maintained by**: All agents (update as needed)

---

## 📚 Onboarding Files Overview

We've created a complete onboarding system for any AI agent:

### 🎯 Entry Points (Choose Your Path)

| File | Location | Purpose | When to Use |
|------|----------|---------|-------------|
| **START_HERE.md** | Project root | Friendly greeting + quick links | **FIRST** - Land here |
| **AGENT_PROMPT_TEMPLATE.md** | Project root | Complete universal prompt | **SECOND** - Full guide |
| **QUICK_START_CARD.md** | `.agents/` | Quick reference card | **REFERENCE** - Keep visible |

---

## 🗺️ File Map

```
sk-app/                                 ← Project root
│
├── START_HERE.md                       ← 🚪 Entry door
├── AGENT_PROMPT_TEMPLATE.md            ← 📖 Complete guide
│
├── .agents/                             ← 🤖 Agent hub
│   ├── QUICK_START_CARD.md             ← 🎴 Quick reference
│   ├── PROJECT_STATUS.md               ← 📊 Project dashboard
│   ├── INDEX.md                        ← 📚 Skills & workflows index
│   ├── AGENT_ONBOARDING_GUIDE.md       ← 🎓 This file
│   │
│   ├── workflows/                      ← 🔄 Step-by-step procedures
│   │   ├── start-here.md               ← 🚀 FIRST - Universal entry
│   │   ├── pickup-from-any.md          ← 🟢 Start working
│   │   ├── handoff-to-any.md           ← 🔴 Finish working
│   │   └── ... (9 more workflows)
│   │
│   ├── skills/                         ← 🧠 Knowledge base
│   │   ├── cross_platform_collaboration/SKILL.md
│   │   ├── fastapi_enterprise/SKILL.md
│   │   ├── nextjs_enterprise/SKILL.md
│   │   └── ... (32 more skills)
│   │
│   └── state/                          ← 📁 Session tracking
│       ├── current-session.json        # Current session state
│       ├── task.md                     # Current task scratchpad
│       ├── **TASK_LOG.md**             # **APPEND-ONLY: All tasks from all agents**
│       ├── **SESSION_INDEX.md**        # **Cross-platform summary index**
│       └── checkpoints/                # Handoff checkpoints
│
└── project-log-md/                     ← 📝 Agent session logs
    ├── kimi_code/
    ├── claude_code/
    ├── codex/
    └── ... (other platforms)
```

---

## 🚀 Onboarding Paths

### Path A: "I'm new here, tell me everything"

**Follow this order:**

1. **START_HERE.md** (project root)
   - Friendly introduction
   - Quick TL;DR
   - Links to everything

2. **AGENT_PROMPT_TEMPLATE.md** (project root)
   - Complete universal guide
   - Platform-specific notes
   - Scenario-based prompts

3. **.agents/QUICK_START_CARD.md**
   - Print/keep visible
   - Daily reference

4. **.agents/PROJECT_STATUS.md**
   - Current project state
   - Active tasks

5. **Start working** using:
   - `.agents/workflows/pickup-from-any.md`

---

### Path B: "Just tell me the minimum"

**Quick start:**

1. Read `.agents/QUICK_START_CARD.md`
2. Read `.agents/PROJECT_STATUS.md`
3. Follow `.agents/workflows/pickup-from-any.md`
4. Start working

---

### Path C: "I'm switching from another agent"

**Handoff pickup:**

1. Read `.agents/workflows/pickup-from-any.md` **completely**
2. Read latest handoff in `project-log-md/*/`
3. Read `.agents/state/current-session.json`
4. Update session with your platform info
5. Continue work

---

### Path D: "I'm done, need to handoff"

**Handoff completion:**

1. Read `.agents/workflows/handoff-to-any.md` **completely**
2. Create/update all 5 mandatory artifacts
3. Verify all files
4. Report handoff complete

---

## 📋 What Each File Contains

### START_HERE.md (Project Root)
- 👋 Friendly welcome message
- 🚀 TL;DR immediate actions
- 📂 Project structure overview
- 🌐 Supported platforms list
- ✅ Pre-work checklist

**Use when:** Any agent first joins the project

---

### AGENT_PROMPT_TEMPLATE.md (Project Root)
- 📖 Universal prompt template
- 🎯 Scenario-based guides (4 scenarios)
- 📂 Essential files reference
- 🔧 Platform-specific notes
- 🚨 Critical rules
- 📞 Emergency contacts

**Use when:** Need complete understanding of how to work

---

### QUICK_START_CARD.md (.agents/)
- 🎴 One-page reference
- 🚀 Start/end work flow
- 📁 Key locations table
- 🔑 Platform codes
- ⚡ Common commands
- 🚨 Quick reminders

**Use when:** Actively working (keep visible)

---

### SESSION_INDEX.md (state/)
- 📑 **Cross-platform** index of ALL session summaries
- 🔍 Find summaries from ANY platform (Kimi, Claude, Antigravity, CodeX, etc.)
- 📊 Stats: summaries per platform, last updated, task mapping
- 🔗 Cross-references: Task # → Session Summary

**CRITICAL FOR PICKUP:**
- Read this BEFORE reading individual summaries
- Use to find which platforms have recent work
- Use to locate specific summaries by date/task

**Use when:**
- Starting work (find recent summaries from all platforms)
- Looking for specific agent's work
- Understanding project history across platforms

**Commands:**
```bash
# View index
cat .agents/state/SESSION_INDEX.md

# Find latest summaries across all platforms
ls -lt project-log-md/*/*.md | head -10
```

---

### PROJECT_STATUS.md (.agents/)
- 📊 Live project dashboard
- 🎯 Active milestones
- ✅ Recent completions
- 🚧 In progress
- 🚫 Blocked items
- 📋 Backlog

**Use when:** Starting any session (read first)

---

### TASK_LOG.md (state/)
- 📜 **APPEND-ONLY** history of all tasks from all agents
- 🔢 Sequential task numbering (Task #1, #2, #3...)
- 📅 Timestamps and agent attribution
- 📝 Work completed, files modified, blockers, next steps
- 📊 Task statistics (total, by agent, completion rate)

**CRITICAL RULES:**
- **Never overwrite** - Always append new entries
- **Read first** - Check last task number before adding
- **Prepend** - Add new entries at the top (newest first)
- **Permanent** - This is the project history record

**Use when:** 
- Starting work (read last 3-5 entries for context)
- Finishing work (append your completed task)
- Looking for who did what

**Command:**
```bash
# View complete history
cat .agents/state/TASK_LOG.md

# View last 5 tasks
grep "^### Task #" .agents/state/TASK_LOG.md | head -5
```

---

### pickup-from-any.md (workflows/)
- 🟢 Step-by-step pickup procedure
- 🔍 How to find handoffs
- ✅ Validation checklist
- 📝 State update templates

**Use when:** Starting work (continuing from previous agent)

---

### handoff-to-any.md (workflows/)
- 🔴 Step-by-step handoff procedure
- 📦 5 mandatory artifacts
- ✅ Verification gates
- 📝 Templates for each artifact

**Use when:** Ending work (handing off to next agent)

---

### cross_platform_collaboration/SKILL.md (skills/)
- 🌐 Universal collaboration standard
- 📋 Platform-specific patterns
- 📝 File templates
- 🗣️ Communication format
- 🆘 Emergency recovery

**Use when:** Need to understand collaboration standards

---

## 🎓 Learning Paths

### New Agent → Productive

| Step | File | Time |
|------|------|------|
| 1 | `START_HERE.md` | 2 min |
| 2 | `.agents/workflows/start-here.md` | Follow step-by-step |
| 3 | Start working! | - |

**Alternative Path**:
| Step | File | Time |
|------|------|------|
| 1 | `START_HERE.md` | 2 min |
| 2 | `AGENT_PROMPT_TEMPLATE.md` | 10 min |
| 3 | `.agents/QUICK_START_CARD.md` | 1 min |
| 4 | `.agents/PROJECT_STATUS.md` | 3 min |
| 5 | Start working! | - |

**Total: ~16 minutes to full productivity**

---

### Specific Tasks

| Task | Read This |
|------|-----------|
| Frontend work | `skills/nextjs_enterprise/SKILL.md` |
| Backend API | `skills/fastapi_enterprise/SKILL.md` |
| LINE integration | `skills/line_integration/SKILL.md` |
| Database | `skills/database_postgresql_standard/SKILL.md` |
| Testing | `skills/testing_standards/SKILL.md` |
| Deployment | `skills/deployment_devops/SKILL.md` |
| Security | `skills/security_checklist/SKILL.md` |

---

## 🔄 Maintenance

### Who updates what?

| File | Updated By | Frequency |
|------|-----------|-----------|
| `PROJECT_STATUS.md` | Every agent | End of each session |
| `current-session.json` | Every agent | Start and end of session |
| `task.md` | Every agent | Throughout session |
| `INDEX.md` | Any agent | When adding new skills/workflows |
| `AGENT_PROMPT_TEMPLATE.md` | Any agent | When process changes |

---

## ✅ Quality Checklist

When new files are added:
- [ ] Added to `.agents/INDEX.md`
- [ ] Referenced in `PROJECT_STATUS.md` if important
- [ ] Follows naming conventions
- [ ] Has YAML frontmatter (for skills/workflows)
- [ ] Linked from relevant places

---

## 🆘 Troubleshooting

### "I don't know where to start"
→ Read `START_HERE.md`

### "I need the full guide"
→ Read `AGENT_PROMPT_TEMPLATE.md`

### "I just need a quick reminder"
→ Read `.agents/QUICK_START_CARD.md`

### "What should I work on?"
→ Read `.agents/PROJECT_STATUS.md`

### "How do I pickup from another agent?"
→ Read `.agents/workflows/pickup-from-any.md`

### "How do I handoff?"
→ Read `.agents/workflows/handoff-to-any.md`

---

## 🌍 Multi-Agent Compatibility

This onboarding system works for:
- Claude Code
- Kimi Code (me!)
- CodeX
- Antigravity/Cursor
- Gemini CLI
- Qwen
- Open Code
- Kilo Code
- Any future AI platforms

**All agents read the same files, follow the same protocols.**

---

## 📊 Stats

| Category | Count |
|----------|-------|
| Entry point files | 3 |
| Workflows | 12 |
| Skills | 35 |
| Total resources | 50+ |

---

## 🎉 Success Criteria

An agent has successfully onboarded when they can:
- [ ] Find and read `START_HERE.md`
- [ ] Understand the project from `PROJECT_STATUS.md`
- [ ] Pick up work using `pickup-from-any.md`
- [ ] Contribute using relevant skills
- [ ] Handoff using `handoff-to-any.md`

---

*This onboarding guide ensures ANY AI agent can successfully join and contribute to SknApp.*

**Questions?** Check `AGENT_PROMPT_TEMPLATE.md` or ask the previous agent in their handoff file.
