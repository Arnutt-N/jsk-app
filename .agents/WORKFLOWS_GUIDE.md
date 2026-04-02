# 🔄 Workflows Guide - Complete Reference

> **All 13 workflows for SknApp development**

---

## 🚀 For Agent Collaboration

| # | Workflow | File | Use When |
|---|----------|------|----------|
| 1 | **🚀 Start Here** | `workflows/start-here.md` | **ANY agent first joins the project** |
| 2 | **Pickup Universal** | `workflows/pickup-from-any.md` | Continuing work from previous agent |
| 3 | **Handoff Universal** | `workflows/handoff-to-any.md` | Finishing work, handing off to next agent |
| 4 | Session Summary | `workflows/session-summary.md` | Creating session summary (Thai + English) |

---

## 🖥️ For Development Operations

| # | Workflow | File | Use When |
|---|----------|------|----------|
| 5 | Run App | `workflows/run-app.md` | Starting backend + frontend in WSL |
| 6 | Sync & Run WSL | `workflows/sync-and-run-wsl.md` | Sync Windows→WSL then run |
| 7 | Migrate to WSL | `workflows/migrate-to-wsl.md` | One-time WSL setup |

---

## 🗄️ For Database Operations

| # | Workflow | File | Use When |
|---|----------|------|----------|
| 8 | DB Migration | `workflows/db-migration.md` | Running Alembic migrations |
| 9 | Backup & Restore | `workflows/backup-restore.md` | PostgreSQL backup/restore |

---

## 📦 For Application Management

| # | Workflow | File | Use When |
|---|----------|------|----------|
| 10 | Deploy Application | `workflows/deploy-application.md` | Deploying to production |
| 11 | Media Management | `workflows/media-management.md` | Managing media for Flex messages |
| 12 | LINE Test | `workflows/line-test.md` | Testing LINE webhook & messaging |

---

## 🌿 For Git Operations

| # | Workflow | File | Use When |
|---|----------|------|----------|
| 13 | Git Workflow | `workflows/git-workflow.md` | Complete Git with security checks |

---

## 🎯 Quick Decision Tree

```
STARTING WORK?
├── First time on project? → start-here.md
├── Continuing previous work? → pickup-from-any.md
└── Starting new task? → start-here.md → PROJECT_STATUS.md

ENDING WORK?
└── Handoff to next agent? → handoff-to-any.md

DEVELOPMENT?
├── Run the app? → run-app.md
├── Database migration? → db-migration.md
├── Deploy to production? → deploy-application.md
└── Git operations? → git-workflow.md

LINE SPECIFIC?
├── Test webhook? → line-test.md
└── Manage media? → media-management.md
```

---

## 📋 Workflow Relationships

```
┌─────────────────────────────────────────────────────────────┐
│                    AGENT LIFECYCLE                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  NEW AGENT                                                  │
│     │                                                       │
│     ▼                                                       │
│  ┌──────────────┐                                          │
│  │ START_HERE.md│                                          │
│  └──────┬───────┘                                          │
│         │                                                   │
│         ▼                                                   │
│  ┌──────────────┐                                          │
│  │ start-here.md│  ◄── Complete entry workflow            │
│  │  (workflow)  │                                          │
│  └──────┬───────┘                                          │
│         │                                                   │
│         ▼                                                   │
│     WORKING...                                              │
│         │                                                   │
│         │  ┌──────────────────┐                            │
│         └──┤ task-summary.md  │◄── Document progress       │
│            │ (as needed)      │                            │
│            └──────────────────┘                            │
│         │                                                   │
│         ▼                                                   │
│  ┌──────────────┐     ┌──────────────────┐                 │
│  │handoff-to-any│────►│ NEXT AGENT       │                 │
│  │   (workflow) │     │ pickup-from-any  │                 │
│  └──────────────┘     └──────────────────┘                 │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 🆚 Old vs New (After Cleanup)

| Old (Removed) | New (Current) | Why |
|---------------|---------------|-----|
| `agent-handover.md` | `handoff-to-any.md` | Universal version with validation |
| `pick-up.md` | `pickup-from-any.md` | Universal version with checklist |
| - | `start-here.md` | NEW - Complete entry workflow |

---

## 📊 Stats

| Category | Count |
|----------|-------|
| Agent Collaboration | 4 |
| Development Operations | 3 |
| Database Operations | 2 |
| Application Management | 3 |
| Git Operations | 1 |
| **Total** | **13** |

---

## 🔗 Related Files

- **All workflows indexed in**: `.agents/INDEX.md`
- **Skills available in**: `.agents/skills/`
- **Quick reference**: `.agents/QUICK_START_CARD.md`
- **Complete guide**: `AGENT_PROMPT_TEMPLATE.md`

---

*All workflows follow standard format with YAML frontmatter*
*Last updated: 2026-02-13*
