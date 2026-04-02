---
name: git-workflow
description: >
  Git workflow standards for SknApp including commit format, branching strategy, and PR practices.
  Use when asked to "create PR", "commit changes", "branch standard", "git rebase",
  "สร้าง branch", "commit code", "เปิด PR".
compatibility: SKN App, Git, GitHub
metadata:
  category: devops
  tags: [git, github, version-control, workflow, branching]
---

# Git Workflow & Standards Skill

Actionable standards for consistent, traceable version control and repository management across the SKN App project.

---

## CRITICAL: Git Rules

1. **Commit Message Format** — Commits MUST use conventional commits format: `<type>(<scope>): <description>`.
2. **Branch Naming Requirement** — Branches MUST follow `<type>/<short-description>` (e.g., `feature/live-chat`, `fix/login-crash`).
3. **No Direct Commits to Main** — All code must pass through a Pull Request branch review.

---

## Context7 Docs

Context7 MCP is active. Use before running destructive git commands or defining advanced github workflows.

| Library | Resolve Name | Key Topics |
|---|---|---|
| Git | `"git"` | rebase, merge, push --force-with-lease |

Usage: `mcp__context7__resolve-library-id libraryName="git"` →
`mcp__context7__get-library-docs context7CompatibleLibraryID="..." topic="rebase" tokens=5000`

---

## Step 1: Initialize the Work Branch

Always pull the latest main before branching.

```bash
git checkout main
git pull origin main
git checkout -b feature/[short-description]
```

## Step 2: Formulate Conventional Commits

Package logic into tight, logical commits rather than massive block updates.

**Types**: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`.

```bash
git add [specific files]
git commit -m "feat(api): add line webhook endpoint"
```

## Step 3: Rebase and Push

Sync with the target branch before opening the PR to resolve conflicts locally.

```bash
git fetch origin
git rebase origin/main

# If conflicts exist, resolve in editor, then:
git add .
git rebase --continue

git push -u origin feature/[short-description]
# (Use --force-with-lease only if rebasing a branch already pushed)
```

## Step 4: Construct the Pull Request

Every PR should contain a clear summary of changes.

```markdown
## Summary
Implemented the LINE webhook event router.

## Changes
- Added `/webhook` endpoint with signature validation.
- Created `BackgroundTasks` handler.

## Testing
- [x] Unit tests pass
- [x] Manual testing via ngrok
```

---

## Examples

### Example 1: Creating a Bug Fix PR

**User says:** "สร้าง PR แก้บั๊กเรื่อง websocket หยุดทำงาน" (Create PR to fix websocket crash bug)

**Actions:**
1. Execute `git checkout -b fix/websocket-crash`.
2. Apply the code fix to the error handler.
3. Commit with `fix(ws): handle WebSocketDisconnect gracefully`.
4. Ensure testing is completed.
5. Push branch and open GitHub PR.

**Result:** A cleanly formatted PR that clearly identifies the affected component (`ws`) and resolves the bug.

---

## Common Issues

### Accidental Push to Main
**Cause:** Forgetting to switch branches before working.
**Fix:** 
```bash
git branch feature/new-work  # Create branch pointing to current work
git reset --hard HEAD~1      # Roll back main branch locally (if unpushed)
git checkout feature/new-work # Switch to correct branch
```

### Stuck in Rebase Conflict
**Cause:** Conflicting edits on identical lines from the remote branch.
**Fix:** Use the IDE conflict resolver to accept/blend variations, add the resolved files, and run `git rebase --continue`. Avoid using `git commit` within a rebase state.

---

## Quality Checklist

Before finishing, verify:
- [ ] Large commits are broken down by component.
- [ ] No secrets or `.env` details are accidentally staged.
- [ ] The `commit --amend` command is utilized for fixing recent local typos instead of accumulating junk commits.
