# 🎴 Agent Quick Start Card

> **Print this out or keep it visible when working on SknApp**

---

## 🚀 STARTING WORK

```
READ → CHECK → UPDATE → WORK
```

**1. READ (Always)**
```
.agents/PROJECT_STATUS.md
```

**2. CHECK (If continuing work)**
```
ls project-log-md/*/
cat .agents/state/current-session.json
```

**3. UPDATE (Your session)**
```
Update .agents/state/current-session.json:
- platform: YOUR_PLATFORM
- agent_id: YOUR_NAME
- session_id: NEW_ID
- last_updated: NOW
```

**4. READ TASK HISTORY**
```
cat .agents/state/TASK_LOG.md  ← Read last 3-5 entries
```

**5. WORK**
```
Follow .agents/INDEX.md for skills
Update .agents/state/task.md regularly
```

---

## 🛑 ENDING WORK

```
UPDATE → CREATE → VERIFY → DONE
```

**1. UPDATE (5 files)**
- [ ] `.agents/PROJECT_STATUS.md`
- [ ] `.agents/state/current-session.json`
- [ ] `.agents/state/TASK_LOG.md` ← **APPEND your task entry**
- [ ] `.agents/state/task.md` (scratchpad)

**2. CREATE (2 files)**
- [ ] `.agents/state/checkpoints/handover-[PLATFORM]-[TIME].json`
- [ ] `project-log-md/[PLATFORM]/session-summary-[TIME].md`

**3. VERIFY**
```
ls .agents/state/checkpoints/
cat .agents/state/current-session.json
```

**4. DONE**
Report: "Handoff complete"

---

## 📁 KEY LOCATIONS

| What | Where |
|------|-------|
| Project status | `.agents/PROJECT_STATUS.md` |
| Session state | `.agents/state/current-session.json` |
| **Task history** | `.agents/state/TASK_LOG.md` ← **APPEND-ONLY** |
| Current task | `.agents/state/task.md` |
| Collaboration guide | `.agents/skills/cross_platform_collaboration/SKILL.md` |
| Pickup workflow | `.agents/workflows/pickup-from-any.md` |
| Handoff workflow | `.agents/workflows/handoff-to-any.md` |
| All skills | `.agents/INDEX.md` |
| Output logs | `project-log-md/[PLATFORM]/` |

---

## 🔑 PLATFORM CODES

| Platform | Code |
|----------|------|
| Claude Code | `claude-code` |
| Kimi Code | `kimi_code` |
| CodeX | `codex` |
| Antigravity | `antigravity` |
| Gemini | `gemini` |
| Qwen | `qwen` |
| Open Code | `open-code` |
| Kilo Code | `kilo_code` |
| Other | `other` |

---

## ⚡ COMMON COMMANDS

**Find latest handoff:**
```bash
ls -t .agents/state/checkpoints/handover-* | head -1
```

**Read current state:**
```bash
cat .agents/state/current-session.json
cat .agents/state/task.md
cat .agents/state/TASK_LOG.md | head -80      ← Last ~3 tasks
cat .agents/state/SESSION_INDEX.md | head -60 ← Cross-platform index
```

**Find latest summaries from ALL platforms:**
```bash
ls -lt project-log-md/*/*.md | head -10
```

**List recent activity:**
```bash
ls -lt project-log-md/*/
```

**Git status:**
```bash
git status
git log --oneline -5
```

---

## 🚨 REMEMBER

- ✅ **Always read PROJECT_STATUS.md first**
- ✅ **Always read TASK_LOG.md for context**
- ✅ **Handoff with one command:** `node .agents/scripts/handoff-new.cjs <platform> "<summary>"`
- ❌ **Never hand-edit TASK_LOG.md or SESSION_INDEX.md** (generated from checkpoints)
- ❌ **Never skip the handoff protocol** (a Stop hook enforces it)

---

## 🆘 NEED HELP?

**Full guide:** `AGENT_PROMPT_TEMPLATE.md`
**Collaboration:** `.agents/skills/cross_platform_collaboration/SKILL.md`
**Index:** `.agents/INDEX.md`

---

*Keep this card handy!*
