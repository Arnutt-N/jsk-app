---
name: agent_handover
description: >
  Universal agent handoff for SKN App — create a handoff checkpoint when finishing work
  on any AI platform. Use when finishing a session / handing off, or on
  "handoff", "ส่งมอบงาน", "สรุป session", "อ้างอิงคู่มือ handoff", "standard".
compatibility: SKN App Project (JskApp)
metadata:
  category: reference
  tags: [reference, agent-handover, handoff-v2]
---

# Agent Handoff Skill (v2)

**Use this when:** you've finished work and need to hand off to the next agent
(same or different platform).

## The one command

```bash
node .agents/scripts/handoff-new.cjs <platform> "<work summary>" ["<next step>" ...]
# example:
node .agents/scripts/handoff-new.cjs claude_code "Merged PR #114: rich-menu R1/R2" "Smoke test on prod"
```

Canonical platforms: `claude_code`, `codex`, `kimi_code`, `antigravity`, `gemini_cli`,
`cline`, `kilo_code`, `open_code`, `qwen`, `qoder`.

## What it does for you (don't do these by hand)

1. Writes the **checkpoint JSON** — `.agents/state/checkpoints/handover-<platform>-<YYYYMMDD-HHMM>.json` (source of truth).
2. Writes a **session-summary stub** — `project-log-md/<platform>/session-summary-<YYYYMMDD-HHMM>.md`.
3. Syncs `current-session.json` (prepends `handoff_history`, refreshes `last_updated`).
4. Refreshes the `PROJECT_STATUS.md` `Last Updated` line + one `Recent Completions` entry.
5. Regenerates `TASK_LOG.md` + `SESSION_INDEX.md`.
6. Runs `validate_handoff_state.py` and prints PASS / FAIL / skipped.

## Then, by hand

1. **Flesh out** the generated `session-summary-*.md` (objective, what changed, next steps, blockers).
2. **Keep `PROJECT_STATUS.md` curated sections current** (the auto-update only touches 2 lines).
3. **`git add` + commit** the artifacts, and push.

## Hard rules

- ⛔ **Never hand-edit `TASK_LOG.md` or `SESSION_INDEX.md`** — they are generated from
  checkpoints; your edits get overwritten. To change them, edit/add a checkpoint and run
  `node .agents/scripts/gen-handoff-views.cjs`.
- The checkpoint timestamp is local time **with the real UTC offset** (e.g. `+07:00`), never `Z`.
- A Stop hook (`handoff-stop-check.cjs`) blocks session end until a fresh checkpoint exists
  and the tree is clean — so don't skip the handoff.

## Authority / details

The full procedure and checkpoint schema live in
[`.agents/workflows/handoff-to-any.md`](../../workflows/handoff-to-any.md). Pickup is
[`.agents/workflows/pickup-from-any.md`](../../workflows/pickup-from-any.md).
