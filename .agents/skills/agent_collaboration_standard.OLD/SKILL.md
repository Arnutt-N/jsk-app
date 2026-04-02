# Agent Collaboration Standard

This skill defines the enterprise standards for multi-agent collaboration and session continuity.

## Core Principles

1.  **Context is King**: Never end a session without leaving a breadcrumb.
2.  **Explicit Handover**: Use standardized summaries for the next agent.
3.  **State Persistence**: Keep dynamic state (tasks, sessions) in tracked files.

## Session Lifecycle

### 1. Session Start (Pick-Up)
Every new agent session MUST start by:
- Reading `.agents/workflows/pick-up.md`.
- Reading the latest file in `project-log-md/`.
- Checking the status of `task.md`.

### 2. During Work
- Maintain the `task.md` file in the artifacts directory.
- Document significant technical decisions in the `implementation_plan.md` or `walkthrough.md`.

### 3. Session End (Handover)
Every agent session MUST end by:
- Running the `/agent-handover` workflow.
- Ensuring all active tasks are marked correctly (In-progress vs. Done).

## Handover Format

Handovers must follow this structure to be machine-parseable by other agents:

```markdown
# HANDOVER: [Brief Subject]
Date: [ISO Timestamp]
Agent: [Agent Name]

## 🎯 Current Mission
[Detailed objective]

## 🚧 In-Progress
- [Item 1]
- [Item 2]

## ✅ Completed in this session
- [Item A]

## 🛑 Blockers & Issues
- [Blocker 1]

## 📝 Next Steps for Incoming Agent
1. [Action 1]
2. [Action 2]
```

## Tooling
- **ANTIGRAVITY**: Uses task_boundary and artifacts.
- **CLAUDE CODE**: Uses CLI/terminal commands.
- **OPEN CODE**: Uses standard markdown logs.
