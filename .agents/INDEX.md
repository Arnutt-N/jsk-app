# Skills & Workflows Index

> **Last Updated:** 2026-04-02 (`.agent` renamed to `.agents`)
> **Purpose:** Quick navigation to all available skills and workflows for SknApp development

---

## Skills Directory (`.agents/skills/`)

### Backend Development

| Skill | File | When to Use |
|-------|------|-------------|
| **FastAPI Enterprise** | `fastapi_enterprise/SKILL.md` | Building backend APIs, project structure, async patterns |
| **API Development Standard** | `api_development_standard/SKILL.md` | Designing endpoints, response formats, error handling |
| **Database Standard (PostgreSQL)** | `database_postgresql_standard/SKILL.md` | Schema design, migrations, JSONB usage, indexes |
| **Auth & RBAC Security** | `auth_rbac_security/SKILL.md` | Implementing authentication, role-based access control |
| **Testing Standards** | `testing_standards/SKILL.md` | Writing tests (pytest, jest, playwright) |

### Frontend Development

| Skill | File | When to Use |
|-------|------|-------------|
| **Next.js Enterprise** | `nextjs_enterprise/SKILL.md` | Next.js 16 setup, App Router, React 19 features |
| **Frontend Architecture** | `frontend_architecture/SKILL.md` | Component structure, Server vs Client components, state management |

### LINE Integration

| Skill | File | When to Use |
|-------|------|-------------|
| **LINE Integration Standard** | `line_integration/SKILL.md` | Webhook security, LIFF auth, rate limiting |
| **LINE Messaging Advanced** | `line_messaging_advanced/SKILL.md` | Flex templates, rich menus, broadcasting, deduplication |

### Architecture & Standards

| Skill | File | When to Use |
|-------|------|-------------|
| **Enterprise Architecture Standards** | `enterprise_architecture_standards/SKILL.md` | DDD patterns, UI design system, deployment |
| **API Documentation** | `api_documentation/SKILL.md` | OpenAPI/Swagger documentation, versioning |
| **Security Checklist** | `security_checklist/SKILL.md` | OWASP Top 10, input validation, secrets management |
| **Monitoring & Logging** | `monitoring_logging/SKILL.md` | Structured logging, error tracking, performance monitoring |
| **Deployment & DevOps** | `deployment_devops/SKILL.md` | Docker, CI/CD, environment configuration |

### Agent Collaboration

| Skill | File | When to Use |
|-------|------|-------------|
| **Cross-Platform Collaboration** | `cross_platform_collaboration/SKILL.md` | Handoff between AI platforms |
| **Agent Handover Skill** | `agent_handover/SKILL.md` | Automated handoff with templates and checkpoints |
| **Agent Pickup Skill** | `agent_pickup/SKILL.md` | Automated pickup with validation steps |

---

## Workflows Directory (`.agents/workflows/`)

### Agent Collaboration Workflows

| Workflow | File | Purpose |
|----------|------|---------|
| **Start Here** | `start-here.md` | First entry point for any new agent |
| **Task Log** | `../state/TASK_LOG.md` | Append-only history of all tasks from all agents |
| **Session Index** | `../state/SESSION_INDEX.md` | Cross-platform index of all session summaries |
| **Task Summary** | `task-summary.md` | Template for documenting completed work |
| **Universal Pickup** | `pickup-from-any.md` | Start session and resume work from any previous agent/platform |
| **Universal Handoff** | `handoff-to-any.md` | End session and prepare context for the next agent/platform |
| **Session Summary** | `session-summary.md` | Create work summary for continuity |

### Development Operations

| Workflow | File | Purpose |
|----------|------|---------|
| **Run App** | `run-app.md` | Start backend and frontend in WSL |
| **Sync & Run WSL** | `sync-and-run-wsl.md` | Sync code from Windows to WSL and run |
| **Migrate to WSL** | `migrate-to-wsl.md` | One-time setup for WSL development environment |

### Database Operations

| Workflow | File | Purpose |
|----------|------|---------|
| **DB Migration** | `db-migration.md` | Run Alembic migrations |
| **Backup & Restore** | `backup-restore.md` | Backup and restore PostgreSQL database |

### Application Management

| Workflow | File | Purpose |
|----------|------|---------|
| **Deploy Application** | `deploy-application.md` | Deploy backend and frontend to production |
| **Media Management** | `media-management.md` | Manage media files in database for Flex Messages |
| **LINE Test** | `line-test.md` | Test LINE webhook and messaging API |

### Git Operations

| Workflow | File | Purpose |
|----------|------|---------|
| **Git Workflow** | `git-workflow.md` | Git commands with project workflow conventions |

---

## Quick Topic Lookup

| Goal | Use This Skill/Workflow |
|------|------------------------|
| **Start as new agent** | `workflows/start-here.md` |
| Add a new API endpoint | `api_development_standard/SKILL.md` |
| Create a database migration | `db-migration.md` |
| Set up LINE webhook | `line_integration/SKILL.md` |
| Create a Flex message | `line_messaging_advanced/SKILL.md` |
| Test LINE webhook | `line-test.md` |
| Deploy to production | `deploy-application.md` |
| Run the app locally | `run-app.md` |
| Hand off work | `handoff-to-any.md` |
| Resume work | `pickup-from-any.md` |
| Fix security vulnerability | `security_checklist/SKILL.md` |
| Add authentication | `auth_rbac_security/SKILL.md` |
| Set up monitoring/logging | `monitoring_logging/SKILL.md` |
| Write tests | `testing_standards/SKILL.md` |
| Create a new Next.js page | `frontend_architecture/SKILL.md` |
| Use React 19 / Next.js patterns | `nextjs_enterprise/SKILL.md` |

---

## File Structure

```text
.agents/
|- INDEX.md
|- PROJECT_STATUS.md
|- state/
|  |- README.md
|  |- current-session.json
|  |- task.md
|  |- TASK_LOG.md
|  |- SESSION_INDEX.md
|  `- checkpoints/
|- skills/
`- workflows/
```

---

## New Agent

Start here:

```bash
cat ../START_HERE.md
```

Then use:
- `workflows/start-here.md`
- `QUICK_START_CARD.md`
- `PROJECT_STATUS.md`
- `state/TASK_LOG.md`
- `state/SESSION_INDEX.md`
- `workflows/pickup-from-any.md`
- `workflows/handoff-to-any.md`
- `skills/cross_platform_collaboration/SKILL.md`

---

## Notes

- All skills follow the `SKILL.md` format with YAML frontmatter.
- All workflows have frontmatter with a `description` field.
- Universal collaboration workflows work across platforms.
- This index is the canonical entry point for `.agents` resources.
