---
name: agent_pickup
description: >
  Universal agent pickup for SKN App — resume work from a previous agent/platform by
  reading the latest handoff state. Use when starting a session / resuming, or on
  "pickup", "รับช่วงงาน", "เริ่มงานต่อ", "อ่าน handoff ล่าสุด", "อ้างอิงคู่มือ pickup".
compatibility: SKN App Project (JskApp)
metadata:
  category: reference
  tags: [reference, agent-pickup, handoff-v2]
---

# Agent Pickup Skill (v2)

**Use this when:** you're starting work and need to pick up where a previous agent
(any platform) left off.

## Read, in order

1. `.agents/PROJECT_STATUS.md` — Thai summary, Active Milestones, Latest Pickup Status, Backlog.
2. `.agents/state/TASK_LOG.md` — newest-first handoff log (generated). Read the top few entries.
3. `.agents/state/SESSION_INDEX.md` — cross-platform index (generated). **Long file** —
   read only the Quick Stats table at the top; the per-platform tables are history and
   rarely needed for pickup.
4. The latest `project-log-md/<platform>/session-summary-*.md` for full detail.
5. (Optional) the newest checkpoint JSON in `.agents/state/checkpoints/` for the raw record.

```bash
# newest handoffs
ls -t .agents/state/checkpoints/handover-*.json | head -3
```

## Checkpoint schema you'll see (v2)

`handoff_version`, `platform`, `agent`, `timestamp` (local time **with offset**, e.g.
`+07:00`), `branch`, `head_commit`, `status`, `work_summary`, `priority_actions`,
`context_for_next_agent`, `session_summary`, `cross_platform_read`.

(If you find an old checkpoint with `from_platform`/`to_platform`, that's a legacy v1
record — read it for history, but new handoffs use the schema above.)

## Verify environment

```bash
git branch --show-current
git status
```

If your branch doesn't match the checkpoint's `branch`, `git checkout <branch>` (only if
that work is still in progress; completed work is usually merged to `main`).

## Confirm starting point (one short note)

State: current branch, top priority (from `priority_actions`), last 1-3 agents + what they
did, and any open blockers. Then start working.

## Do NOT do these (v1 habits, retired)

- ⛔ Don't pre-create a "Task #N" entry or hand-edit `TASK_LOG.md` / `SESSION_INDEX.md`
  (generated). The record is written **at handoff** by `handoff-new.cjs`.
- ⛔ Don't hand-edit `current-session.json` to "claim" the session — `handoff-new.cjs`
  maintains it for you when you hand off.

## First session (no checkpoint)

If `.agents/state/checkpoints/` is empty, just start working and create the first
checkpoint at the end with `node .agents/scripts/handoff-new.cjs <platform> "<summary>"`.

## Authority / details

Full pickup: [`.agents/workflows/pickup-from-any.md`](../../workflows/pickup-from-any.md).
Handoff (when you finish): [`.agents/skills/agent_handover/SKILL.md`](../agent_handover/SKILL.md).
