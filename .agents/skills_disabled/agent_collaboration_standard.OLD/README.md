# Agent Collaboration Standard (Archived)

This archived document preserves the older collaboration guidance that predates the
current cross-platform workflow.

## Status

This is reference material only. The active standard lives in
`../cross_platform_collaboration/SKILL.md`.

## Core Principles

1. Context is king: never end a session without leaving a breadcrumb.
2. Explicit handover: use standardized summaries for the next agent.
3. State persistence: keep dynamic state such as tasks and sessions in tracked files.

## Session Lifecycle

### 1. Session Start (Pick-Up)

Every new agent session should start by:

- Reading `.agents/workflows/pick-up.md`
- Reading the latest file in `project-log-md/`
- Checking the status of `task.md`

### 2. During Work

- Maintain the `task.md` file in the artifacts directory
- Document significant technical decisions in `implementation_plan.md` or
  `walkthrough.md`

### 3. Session End (Handover)

Every agent session should end by:

- Running the `/agent-handover` workflow
- Ensuring all active tasks are marked correctly as in progress or done

## Historical Handover Format

```markdown
# HANDOVER: [Brief Subject]
Date: [ISO Timestamp]
Agent: [Agent Name]

## Current Mission
[Detailed objective]

## In Progress
- [Item 1]
- [Item 2]

## Completed in This Session
- [Item A]

## Blockers and Issues
- [Blocker 1]

## Next Steps for Incoming Agent
1. [Action 1]
2. [Action 2]
```

## Tooling Notes

- ANTIGRAVITY: uses task boundaries and artifacts
- CLAUDE CODE: uses CLI and terminal commands
- OPEN CODE: uses standard markdown logs
