# Feature: Apply Database Migrations in WSL Environment

## Summary

Apply pending Alembic database migrations in the WSL (Windows Subsystem for Linux) environment. This involves starting PostgreSQL via Docker, ensuring the correct virtual environment (`venv_linux`) is used, and applying all pending migrations including the merge migration and new sync_status columns for rich menus. The project requires WSL for both backend (Python/FastAPI) and frontend (Next.js) development.

## User Story

As a developer
I want to apply database migrations in the WSL environment
So that the database schema is up-to-date with the latest model changes for live chat, credentials, and rich menu sync features

## Problem Statement

The project has multiple pending database migrations that need to be applied:
1. **Merge migration head** (`157caa418be7`) - resolves branching between `add_system_settings` and `f1a2b3c4d5e6`
2. **Live chat and credentials** (`f1a2b3c4d5e6`) - adds chat_sessions, chat_analytics, credentials tables
3. **Rich menu sync status** (`add_sync_status_to_rich_menus`) - adds sync tracking columns
4. **Operator name** (`a9b8c7d6e5f4`) - adds operator_name to messages

The development environment requires WSL with a Linux virtual environment (`venv_linux`) for the backend.

## Solution Statement

Execute a systematic migration process:
1. Start PostgreSQL container via Docker in WSL
2. Verify database connectivity
3. Check current migration state
4. Apply all pending migrations using Alembic
5. Verify migration success by checking schema and data

## Metadata

| Field            | Value                                                                 |
| ---------------- | --------------------------------------------------------------------- |
| Type             | ENHANCEMENT                                                           |
| Complexity       | MEDIUM                                                                |
| Systems Affected | Database (PostgreSQL), Backend (Alembic), Docker                      |
| Dependencies     | Docker Desktop with WSL2, PostgreSQL 16, Python 3.12, Alembic 1.14+   |
| Estimated Tasks  | 6                                                                     |

---

## UX Design

### Before State

```
┌───────────────────────────────────────────────────────────────────────────────┐
│                              BEFORE STATE                                      │
╠═══════════════════════════════════════════════════════════════════════════════╣
│                                                                               │
│   ┌─────────────┐         ┌─────────────┐         ┌─────────────┐            │
│   │   Git Repo  │ ──────► │   Pending   │ ──────► │  App Fails  │            │
│   │   Branch    │         │  Migrations │         │   to Start  │            │
│   │             │         │  (11 files) │         │   (Schema   │            │
│   │ fix/live-   │         │             │         │  mismatch)  │            │
│   │ chat-redesign│         │ - Merge head│         │             │            │
│   │             │         │ - Live chat │         │ Missing:    │            │
│   │             │         │ - Credentials│         │ - chat_sessions│         │
│   │             │         │ - Rich menu │         │ - credentials │          │
│   │             │         │   sync      │         │ - sync_status │          │
│   └─────────────┘         └─────────────┘         └─────────────┘            │
│                                                                               │
│   DATA_FLOW:                                                                  │
│   1. App starts with models expecting new schema                              │
│   2. Database has old schema (missing tables/columns)                         │
│   3. SQLAlchemy queries fail with "relation does not exist"                   │
│   4. Backend cannot start or serve requests                                   │
│                                                                               │
│   PAIN_POINT:                                                                 │
│   - Cannot run backend locally                                                │
│   - Cannot test live chat features                                            │
│   - Cannot verify rich menu sync                                              │
│   - Database out of sync with codebase                                        │
│                                                                               │
╚═══════════════════════════════════════════════════════════════════════════════╝
```

### After State

```
┌───────────────────────────────────────────────────────────────────────────────┐
│                               AFTER STATE                                      │
╠═══════════════════════════════════════════════════════════════════════════════╣
│                                                                               │
│   ┌─────────────┐         ┌─────────────┐         ┌─────────────┐            │
│   │   Docker    │ ──────► │  Alembic    │ ──────► │  Database   │            │
│   │  PostgreSQL │         │  Upgrade    │         │   Current   │            │
│   │   Running   │         │   Head      │         │  (11 revs)  │            │
│   │             │         │             │         │             │            │
│   │ Port 5432   │         │ All 11      │         │ Tables:     │            │
│   │ skn_app_db  │         │ migrations  │         │ - users     │            │
│   │             │         │ applied     │         │ - chat_sessions│         │
│   │             │         │             │         │ - credentials │          │
│   │             │         │             │         │ - rich_menus  │          │
│   └─────────────┘         └─────────────┘         └─────────────┘            │
│                                   │                                           │
│                                   ▼                                           │
│                          ┌─────────────┐                                      │
│                          │   Backend   │  ◄── App starts successfully         │
│                          │   Starts    │                                      │
│                          └─────────────┘                                      │
│                                                                               │
│   USER_FLOW:                                                                  │
│   1. Start Docker containers (PostgreSQL, Redis)                              │
│   2. Activate WSL Linux virtual environment                                   │
│   3. Run alembic upgrade head                                                 │
│   4. Verify migrations applied successfully                                   │
│   5. Start backend server                                                     │
│   6. All features (live chat, credentials, rich menus) work                   │
│                                                                               │
│   DATA_FLOW:                                                                  │
│   1. Alembic reads migration files from backend/alembic/versions/             │
│   2. Connects to PostgreSQL using DATABASE_URL from .env                      │
│   3. Executes migrations in dependency order                                  │
│   4. Updates alembic_version table with current revision                      │
│   5. Schema now matches SQLAlchemy models                                     │
│                                                                               │
╚═══════════════════════════════════════════════════════════════════════════════╝
```

### Interaction Changes

| Location | Before | After | User Impact |
|----------|--------|-------|-------------|
| `backend/` | Cannot start - schema mismatch | Starts successfully | Can develop and test |
| `backend/app/models/` | Tables don't exist | All tables created | ORM queries work |
| Live Chat | Feature unavailable | Fully functional | Can test operator handoff |
| Rich Menus | No sync tracking | Sync status tracked | Can verify LINE API sync |
| Credentials | Table missing | Table with data | Can manage LINE tokens |

---

## Mandatory Reading

**CRITICAL: Implementation agent MUST read these files before starting any task:**

| Priority | File | Lines | Why Read This |
|----------|------|-------|---------------|
| P0 | `backend/alembic.ini` | 1-50 | Alembic configuration, database URL pattern |
| P0 | `backend/alembic/env.py` | 1-92 | Async migration environment setup |
| P0 | `backend/.env` | 1-22 | Database connection string |
| P1 | `docker-compose.yml` | 1-29 | PostgreSQL container configuration |
| P1 | `backend/alembic/versions/157caa418be7_merge_migration_heads.py` | 1-29 | Merge migration pattern |
| P1 | `backend/alembic/versions/f1a2b3c4d5e6_add_live_chat_and_credentials.py` | 1-102 | Complex migration with multiple tables |
| P2 | `CLAUDE.md` | 37-44 | Database migration commands reference |

**External Documentation:**
| Source | Section | Why Needed |
|--------|---------|------------|
| [Alembic Docs 1.14](https://alembic.sqlalchemy.org/en/latest/tutorial.html) | Creating and Running Migrations | Understanding upgrade/downgrade flow |
| [Alembic Async](https://alembic.sqlalchemy.org/en/latest/cookbook.html#using-asyncio-with-alembic) | Async support | Project uses async SQLAlchemy |
| [PostgreSQL ENUM](https://www.postgresql.org/docs/current/datatype-enum.html) | ALTER TYPE | Adding HANDOFF to replytype enum |

---

## Patterns to Mirror

**ALEMBIC CONFIGURATION:**
```ini
# SOURCE: backend/alembic.ini:1-10
# COPY THIS PATTERN:
[alembic]
script_location = %(here)s/alembic
prepend_sys_path = .
path_separator = os
sqlalchemy.url = postgresql+asyncpg://postgres:password@localhost/skn_app_db
```

**ASYNC MIGRATION ENVIRONMENT:**
```python
# SOURCE: backend/alembic/env.py:60-92
# COPY THIS PATTERN:
async def run_async_migrations() -> None:
    """Run migrations with async engine."""
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()

def run_migrations_online() -> None:
    """Run migrations in 'online' mode."""
    asyncio.run(run_async_migrations())
```

**MIGRATION FILE STRUCTURE:**
```python
# SOURCE: backend/alembic/versions/f1a2b3c4d5e6_add_live_chat_and_credentials.py:1-20
# COPY THIS PATTERN:
"""add_live_chat_and_credentials

Revision ID: f1a2b3c4d5e6
Revises: e3f4g5h6i7j8
Create Date: 2026-01-25

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = 'f1a2b3c4d5e6'
down_revision: Union[str, Sequence[str], None] = 'e3f4g5h6i7j8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    """Upgrade schema."""
    pass

def downgrade() -> None:
    """Downgrade schema."""
    pass
```

**IDEMPOTENT COLUMN ADDITION:**
```python
# SOURCE: backend/alembic/versions/a9b8c7d6e5f4_add_operator_name_to_messages.py:15-30
# COPY THIS PATTERN:
def upgrade() -> None:
    """Add operator_name column to messages table."""
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'messages' AND column_name = 'operator_name'
            ) THEN
                ALTER TABLE messages ADD COLUMN operator_name VARCHAR;
            END IF;
        END $$;
    """)
```

**DOCKER COMPOSE POSTGRES:**
```yaml
# SOURCE: docker-compose.yml:1-16
# COPY THIS PATTERN:
services:
  db:
    container_name: skn-postgres
    image: postgres:16-alpine
    restart: always
    environment:
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=password
      - POSTGRES_DB=skn_app_db
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
```

---

## Files to Change

| File | Action | Justification |
|------|--------|---------------|
| `backend/alembic/versions/157caa418be7_merge_migration_heads.py` | VERIFY | Merge migration already exists |
| `backend/alembic/versions/f1a2b3c4d5e6_add_live_chat_and_credentials.py` | VERIFY | Complex migration with 6 table operations |
| `backend/alembic/versions/add_sync_status_to_rich_menus.py` | VERIFY | Adds 3 columns to rich_menus |
| `backend/alembic/versions/a9b8c7d6e5f4_add_operator_name_to_messages.py` | VERIFY | Adds operator_name column |
| `backend/.env` | VERIFY | DATABASE_URL must point to localhost:5432 |
| `docker-compose.yml` | VERIFY | PostgreSQL container config |

---

## NOT Building (Scope Limits)

Explicit exclusions to prevent scope creep:

- **No new migrations**: Only apply existing migrations, don't create new ones
- **No data seeding**: Don't populate tables with test data
- **No production deployment**: Local development environment only
- **No migration squash**: Don't combine migrations into one
- **No rollback testing**: Don't test downgrade paths
- **No CI/CD changes**: Don't modify GitHub Actions or deployment scripts

---

## Step-by-Step Tasks

Execute in order. Each task is atomic and independently verifiable.

### Task 1: VERIFY WSL Environment and Docker

- **ACTION**: Verify WSL is running and Docker Desktop is accessible
- **IMPLEMENT**: Check `wsl -l -v` and `docker ps`
- **MIRROR**: Project requires WSL2 with Docker Desktop WSL integration
- **GOTCHA**: Docker Desktop must have WSL2 backend enabled in Settings > General
- **VALIDATE**: `docker ps` returns without error

**Commands:**
```bash
# In Windows PowerShell or CMD
wsl -l -v
# Should show: Ubuntu (or your distro) Running 2

wsl docker ps
# Should return empty list or running containers
```

---

### Task 2: START PostgreSQL Container

- **ACTION**: Start PostgreSQL and Redis containers via Docker Compose
- **IMPLEMENT**: Run `docker-compose up -d db redis` in WSL
- **MIRROR**: `docker-compose.yml:1-29` - services db and redis
- **IMPORTS**: None - uses existing docker-compose.yml
- **GOTCHA**:
  - Must run from project root in WSL
  - Port 5432 must not be in use by another PostgreSQL instance
  - Volume `postgres_data` persists between restarts
- **VALIDATE**: `docker ps` shows skn-postgres and skn-redis running

**Commands:**
```bash
# In WSL, from project root
cd /mnt/d/genAI/skn-app  # Adjust path for your WSL mount
docker-compose up -d db redis

# Verify containers are running
docker ps
# Should show:
# - skn-postgres (postgres:16-alpine)
# - skn-redis (redis:7-alpine)
```

---

### Task 3: VERIFY Database Connectivity

- **ACTION**: Test connection to PostgreSQL from WSL
- **IMPLEMENT**: Use psql or Python to connect
- **MIRROR**: DATABASE_URL pattern from `backend/.env:12`
- **IMPORTS**: None
- **GOTCHA**:
  - Default credentials: postgres/password
  - Database: skn_app_db
  - Host: localhost (from WSL perspective)
- **VALIDATE**: Can connect and list databases

**Commands:**
```bash
# In WSL
# Option 1: Using psql (if installed)
psql -h localhost -U postgres -d skn_app_db -c "\dt"

# Option 2: Using docker exec
docker exec -it skn-postgres psql -U postgres -d skn_app_db -c "\dt"

# Option 3: Using Python from backend venv
cd backend
source venv_linux/bin/activate
python -c "import asyncpg; import asyncio; async def test(): conn = await asyncpg.connect('postgresql://postgres:password@localhost:5432/skn_app_db'); print('Connected!'); await conn.close(); asyncio.run(test())"
```

---

### Task 4: CHECK Current Migration State

- **ACTION**: Check current Alembic version before upgrading
- **IMPLEMENT**: Run `alembic current` in WSL with venv_linux activated
- **MIRROR**: `backend/alembic.ini` configuration
- **IMPORTS**: None - uses existing Alembic setup
- **GOTCHA**:
  - Must activate `venv_linux` (not venv)
  - Must be in backend directory
  - Database must be running
- **VALIDATE**: Shows current revision or "None" for fresh database

**Commands:**
```bash
# In WSL
cd /mnt/d/genAI/skn-app/backend
source venv_linux/bin/activate

# Check current version
alembic current
# May show: 8a9b1c2d3e4f (head) or None if never migrated

# View history
alembic history --verbose
# Shows all 11 migration files and their dependencies
```

**Expected Migration Chain:**
```
8a9b1c2d3e4f (head) -> cd2257cee794 -> ... -> 1349087a4a24 (base)
add_sync_status_to_rich_menus -> add_system_settings
a9b8c7d6e5f4 -> 157caa418be7 -> (add_system_settings, f1a2b3c4d5e6)
f1a2b3c4d5e6 -> e3f4g5h6i7j8 -> ...
```

---

### Task 5: APPLY All Pending Migrations

- **ACTION**: Run Alembic upgrade to apply all pending migrations
- **IMPLEMENT**: Execute `alembic upgrade head` in WSL
- **MIRROR**: `backend/alembic/env.py:60-92` - async migration pattern
- **IMPORTS**: None - uses existing Alembic environment
- **GOTCHA**:
  - This will execute 11 migrations in dependency order
  - Merge migration `157caa418be7` resolves branch conflicts
  - Each migration runs in a transaction
  - If one fails, all are rolled back
- **VALIDATE**: `alembic current` shows latest revision

**Commands:**
```bash
# In WSL, from backend directory with venv_linux activated
cd /mnt/d/genAI/skn-app/backend
source venv_linux/bin/activate

# Apply all migrations
alembic upgrade head

# Expected output:
# INFO  [alembic.runtime.migration] Context impl PostgresqlImpl.
# INFO  [alembic.runtime.migration] Will assume transactional DDL.
# INFO  [alembic.runtime.migration] Running upgrade  -> 1349087a4a24, Initial tables
# INFO  [alembic.runtime.migration] Running upgrade 1349087a4a24 -> d2df2a419a56, Add messages table
# ... (more migrations)
# INFO  [alembic.runtime.migration] Running upgrade 157caa418be7 -> a9b8c7d6e5f4, add_operator_name_to_messages
# INFO  [alembic.runtime.migration] Running upgrade add_system_settings -> add_sync_status_to_rich_menus, add sync_status to rich_menus
```

**Migration Execution Order:**
1. `1349087a4a24` - Initial tables (organizations, users, service_requests)
2. `d2df2a419a56` - Add messages table
3. `9aef5616e35e` - Add auto_replies and media_files
4. `cd2257cee794` - Add reply_objects
5. `e3f4g5h6i7j8` - Add rich_menus table
6. `f1a2b3c4d5e6` - Add live_chat_and_credentials (chat_sessions, chat_analytics, credentials, friend_events)
7. `add_system_settings` - Add system_settings table
8. `157caa418be7` - Merge migration heads (combines add_system_settings and f1a2b3c4d5e6)
9. `a9b8c7d6e5f4` - Add operator_name to messages
10. `8a9b1c2d3e4f` - Add intent tables
11. `add_sync_status_to_rich_menus` - Add sync_status, last_synced_at, last_sync_error to rich_menus

---

### Task 6: VERIFY Migration Success

- **ACTION**: Verify all tables and columns were created correctly
- **IMPLEMENT**: Query database schema and check specific tables
- **MIRROR**: Migration patterns from `f1a2b3c4d5e6_add_live_chat_and_credentials.py`
- **IMPORTS**: None
- **GOTCHA**:
  - Must verify all new tables exist
  - Must verify columns have correct types
  - Check indexes were created
- **VALIDATE**: All expected tables and columns present

**Verification Commands:**
```bash
# In WSL, using docker exec

# 1. List all tables
docker exec -it skn-postgres psql -U postgres -d skn_app_db -c "\dt"

# Expected tables:
# - alembic_version (migration tracking)
# - organizations
# - users
# - service_requests
# - messages
# - auto_replies
# - media_files
# - reply_objects
# - rich_menus
# - chat_sessions
# - chat_analytics
# - credentials
# - friend_events
# - system_settings
# - intents
# - intent_patterns

# 2. Verify chat_sessions table structure
docker exec -it skn-postgres psql -U postgres -d skn_app_db -c "\d chat_sessions"

# Expected columns:
# - id (integer, PK)
# - line_user_id (character varying(50))
# - operator_id (integer, FK)
# - status (character varying(20))
# - started_at (timestamp with time zone)
# - claimed_at (timestamp with time zone)
# - closed_at (timestamp with time zone)
# - first_response_at (timestamp with time zone)
# - message_count (integer)
# - closed_by (character varying(20))

# 3. Verify credentials table structure
docker exec -it skn-postgres psql -U postgres -d skn_app_db -c "\d credentials"

# Expected columns:
# - id (integer, PK)
# - name (character varying(100))
# - provider (character varying(50))
# - credentials (text)
# - metadata (jsonb)
# - is_active (boolean)
# - is_default (boolean)
# - created_at (timestamp with time zone)
# - updated_at (timestamp with time zone)

# 4. Verify rich_menus sync columns
docker exec -it skn-postgres psql -U postgres -d skn_app_db -c "\d rich_menus"

# Expected columns include:
# - sync_status (character varying)
# - last_synced_at (timestamp with time zone)
# - last_sync_error (text)

# 5. Check current Alembic version
docker exec -it skn-postgres psql -U postgres -d skn_app_db -c "SELECT * FROM alembic_version;"

# Should show: add_sync_status_to_rich_menus (or 8a9b1c2d3e4f if that's head)
```

---

## Testing Strategy

### Verification Checklist

| Check | Command | Expected Result |
|-------|---------|-----------------|
| PostgreSQL running | `docker ps` | skn-postgres container up |
| Database accessible | `psql -h localhost -U postgres -d skn_app_db -c "SELECT 1"` | Returns 1 |
| Alembic version table exists | `\dt alembic_version` | Table found |
| All migrations applied | `alembic current` | Shows head revision |
| chat_sessions table exists | `\dt chat_sessions` | Table found |
| credentials table exists | `\dt credentials` | Table found |
| rich_menus has sync columns | `\d rich_menus` | sync_status, last_synced_at, last_sync_error present |
| messages has operator_name | `\d messages` | operator_name column present |

### Edge Cases Checklist

- [ ] **Fresh database**: All migrations apply cleanly on empty database
- [ ] **Partial migrations**: Resumes from current version without error
- [ ] **Duplicate run**: Running `alembic upgrade head` twice is idempotent
- [ ] **Connection failure**: Clear error if PostgreSQL not running
- [ ] **Wrong virtualenv**: Error if using Windows Python instead of venv_linux

---

## Validation Commands

### Level 1: CONTAINER_VALIDATION

```bash
# In WSL
docker ps --filter "name=skn-" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
```

**EXPECT**: Both skn-postgres and skn-redis show as "Up"

### Level 2: DATABASE_CONNECTIVITY

```bash
# In WSL
cd backend
source venv_linux/bin/activate
python -c "
import asyncio
import asyncpg

async def test():
    conn = await asyncpg.connect('postgresql://postgres:password@localhost:5432/skn_app_db')
    version = await conn.fetchval('SELECT version()')
    print(f'PostgreSQL version: {version}')
    await conn.close()

asyncio.run(test())
"
```

**EXPECT**: Prints PostgreSQL version without errors

### Level 3: ALEMBIC_CURRENT

```bash
# In WSL, from backend with venv_linux
cd backend
source venv_linux/bin/activate
alembic current
```

**EXPECT**: Shows current revision (e.g., `add_sync_status_to_rich_menus` or head)

### Level 4: SCHEMA_VERIFICATION

```bash
# In WSL
docker exec skn-postgres psql -U postgres -d skn_app_db -c "
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
"
```

**EXPECT**: Lists all expected tables (see Task 6)

### Level 5: COLUMN_VERIFICATION

```bash
# In WSL
docker exec skn-postgres psql -U postgres -d skn_app_db -c "
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'rich_menus'
AND column_name IN ('sync_status', 'last_synced_at', 'last_sync_error')
ORDER BY column_name;
"
```

**EXPECT**: Shows 3 rows with correct column names and types

### Level 6: APPLICATION_START

```bash
# In WSL, from backend with venv_linux
cd backend
source venv_linux/bin/activate
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

**EXPECT**: Server starts without "relation does not exist" errors

---

## Acceptance Criteria

- [ ] PostgreSQL container running in Docker (skn-postgres)
- [ ] Redis container running in Docker (skn-redis)
- [ ] All 11 Alembic migrations applied successfully
- [ ] `alembic current` shows the head revision
- [ ] All new tables exist (chat_sessions, chat_analytics, credentials, friend_events, system_settings, intents, intent_patterns)
- [ ] All new columns exist (operator_name in messages, sync columns in rich_menus)
- [ ] Backend can start without schema errors
- [ ] All Level 1-6 validation commands pass

---

## Completion Checklist

- [ ] All tasks completed in dependency order
- [ ] Each task validated immediately after completion
- [ ] Level 1: Container validation passes
- [ ] Level 2: Database connectivity passes
- [ ] Level 3: Alembic current shows head
- [ ] Level 4: Schema verification passes
- [ ] Level 5: Column verification passes
- [ ] Level 6: Application starts successfully
- [ ] All acceptance criteria met

---

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Port 5432 already in use | MEDIUM | HIGH | Stop local PostgreSQL: `sudo service postgresql stop` or change port in docker-compose.yml |
| Wrong virtual environment | HIGH | MEDIUM | Always activate `venv_linux` (not venv), verify with `which python` |
| WSL not running | LOW | HIGH | Start WSL: `wsl` or check Docker Desktop WSL integration |
| Database password mismatch | LOW | MEDIUM | Check `backend/.env` DATABASE_URL matches docker-compose.yml |
| Migration dependency conflict | LOW | HIGH | Run `alembic history` to visualize branch, may need merge migration |
| Data loss during migration | LOW | HIGH | Migrations are additive only (no destructive changes in this set) |

---

## Notes

### WSL Path Reference

```bash
# Windows path: D:\genAI\jsk-app
# WSL path: /mnt/d/genAI/skn-app

# Navigate in WSL
cd /mnt/d/genAI/skn-app

# Or use wslpath
wslpath 'D:\genAI\jsk-app'
```

### Virtual Environment

```bash
# IMPORTANT: Use venv_linux (Linux Python), NOT venv (Windows Python)
cd /mnt/d/genAI/skn-app/backend
source venv_linux/bin/activate

# Verify correct Python
which python
# Should show: /mnt/d/genAI/skn-app/backend/venv_linux/bin/python

# If venv_linux doesn't exist, create it:
# python3 -m venv venv_linux
# source venv_linux/bin/activate
# pip install -r requirements.txt
```

### Quick Reference Commands

```bash
# Start everything
cd /mnt/d/genAI/skn-app
docker-compose up -d db redis
cd backend
source venv_linux/bin/activate
alembic upgrade head
uvicorn app.main:app --reload

# Check status
docker ps
alembic current
alembic history --verbose

# Reset (WARNING: destroys data)
docker-compose down -v  # Remove volumes
docker-compose up -d db
alembic upgrade head
```

### Migration Files Summary

| File | Revision | Description |
|------|----------|-------------|
| 1349087a4a24_initial_tables.py | 1349087a4a24 | Initial schema (organizations, users, service_requests) |
| d2df2a419a56_add_messages_table.py | d2df2a419a56 | Add messages table |
| 9aef5616e35e_add_auto_replies_and_media_files.py | 9aef5616e35e | Add auto_replies, media_files |
| cd2257cee794_add_reply_objects_table.py | cd2257cee794 | Add reply_objects |
| e3f4g5h6i7j8_add_rich_menus_table.py | e3f4g5h6i7j8 | Add rich_menus with ENUM |
| f1a2b3c4d5e6_add_live_chat_and_credentials.py | f1a2b3c4d5e6 | Add chat_sessions, chat_analytics, credentials, friend_events |
| add_system_settings.py | add_system_settings | Add system_settings table |
| 157caa418be7_merge_migration_heads.py | 157caa418be7 | Merge add_system_settings and f1a2b3c4d5e6 branches |
| a9b8c7d6e5f4_add_operator_name_to_messages.py | a9b8c7d6e5f4 | Add operator_name to messages |
| 8a9b1c2d3e4f_add_intent_tables_manual.py | 8a9b1c2d3e4f | Add intents, intent_patterns |
| add_sync_status_to_rich_menus.py | add_sync_status_to_rich_menus | Add sync columns to rich_menus |

---

## Next Step

To execute this plan, run:
```
/prp-implement .claude/PRPs/plans/apply-database-migrations-wsl.plan.md
```

Or manually execute the commands in each task, validating after each step.
