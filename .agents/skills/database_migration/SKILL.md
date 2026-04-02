---
name: database-migration
description: >
  Manages infrastructure and database operations for SKN App.
  Use when asked to "migrate database", "debug docker", "set up environment",
  "run alembic", "fix migration", "migrate database", "สร้าง migration".
compatibility: SKN App, Docker Compose, PostgreSQL, Redis, Alembic
metadata:
  category: devops
  tags: [docker, postgresql, redis, alembic, migration]
---

# Database Migration & DevOps Skill

Guidelines for safe database schema evolution using Alembic with SQLAlchemy for PostgreSQL within the SKN App environment.

---

## CRITICAL: DevOps & Database Rules

1. **Always use Autogenerate** — never write migrations entirely by hand to prevent divergence between SQLAlchemy models and the database.
2. **Review before Upgrade** — always check the generated migration file before running `alembic upgrade head`.
3. **No destructive drops in production** — manual review required if Alembic attempts to drop tables or columns possessing data.

---

## Context7 Docs

Context7 MCP is active. Use before writing Alembic migrations or PostgreSQL operations.

| Library | Resolve Name | Key Topics |
|---|---|---|
| Alembic | `"alembic"` | autogenerate, async env, upgrade, downgrade |
| SQLAlchemy | `"sqlalchemy"` | async session, select, insert, update |
| PostgreSQL | `"postgresql"` | jsonb, array types, indexing |

Usage: `mcp__context7__resolve-library-id libraryName="alembic"` →
`mcp__context7__get-library-docs context7CompatibleLibraryID="..." topic="autogenerate" tokens=5000`

---

## Step 1: Verify Environment Configuration

Ensure your `backend/.env` is correctly pointing to the local database, typically run via Docker.

```
DATABASE_URL=postgresql+asyncpg://admin:password@localhost:5432/sknapp
```

## Step 2: Database and Docker Startup

If the database is not running, ensure you start the container services. Note: `db` runs the PostgreSQL database and `redis` supports the WebSocket/PubSub layer.

```bash
docker-compose up -d db redis
```

## Step 3: Run Alembic Commands

Run all migration commands from inside the `backend` directory.

```bash
cd backend
alembic current                              # Check current version
alembic revision --autogenerate -m "desc"    # Generate new migration based on model diff
```
*Wait: Review the newly generated file in `backend/alembic/versions/` before applying it.*
```bash
alembic upgrade head                         # Apply to database
```

---

## Examples

### Example 1: Add a new table properly

**User says:** "สร้าง migration สำหรับตาราง tags" (Create migration for tags table)

**Actions:**
1. Ensure `Tag` model is created and imported inside `backend/app/db/base.py`.
2. Run `alembic revision --autogenerate -m "add tags table"`.
3. Inspect generated python script to confirm it contains `create_table('tags', ...)`.
4. Run `alembic upgrade head`.

**Result:** Database syncs up with the new SQLAlchemy definitions.

---

## Common Issues

### "Target database is not up to date"
**Cause:** Attempting to autogenerate a migration when the database hasn't been upgraded to the latest existing revision.
**Fix:** Run `alembic upgrade head` first, then run `alembic revision --autogenerate`.

### Alembic doesn't detect new model
**Cause:** The model file is not imported in the declarative base aggregator.
**Fix:** Open `backend/app/db/base.py` and ensure an import like `from app.models.tag import Tag` exists there.

---

## Quality Checklist

Before finishing, verify:
- [ ] Database is accessible locally over `localhost:5432`
- [ ] No manual SQL execution unless explicitly required and verified
- [ ] `alembic current` matches `alembic history` head
