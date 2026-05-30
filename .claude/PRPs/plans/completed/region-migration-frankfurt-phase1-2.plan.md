# Plan: Region Migration — Phase 1 (Provision) + Phase 2 (Prepare)

## Summary
สร้าง Supabase + Upstash ใหม่ที่ Frankfurt, เตรียม env vars checklist, และ migrate schema + data จาก Mumbai ไป Frankfurt เพื่อให้พร้อมสำหรับ Phase 3-4 (ย้าย Koyeb + update env vars)

## User Story
As an admin/operator, I want the backend infrastructure colocated in one region, so that every page loads fast instead of waiting 2-4 seconds.

## Problem → Solution
Koyeb (Washington DC) ↔ Supabase (Mumbai) = ~500ms per DB roundtrip → Colocate in Frankfurt = <5ms

## Metadata
- **Complexity**: Medium (infrastructure, no code changes)
- **Source PRD**: `.claude/PRPs/prds/region-migration-frankfurt.prd.md`
- **PRD Phase**: Phase 1 (Provision Frankfurt) + Phase 2 (Prepare Migration)
- **Estimated Files**: 1 (backend/.env updated, no source code changes)

---

## UX Design

N/A — internal infrastructure change. No user-facing UX transformation.

---

## Mandatory Reading

| Priority | File | Lines | Why |
|---|---|---|---|
| P0 | `backend/scripts/db_target.py` | all | How local/remote DB targeting works |
| P0 | `backend/app/core/env.py` | all | How env files are resolved |
| P0 | `backend/scripts/_db_tools.py` | all | DB URL parsing, local/remote paths |
| P1 | `backend/.env.production.example` | all | Template for production env vars |
| P1 | `docs/examples/BACKEND_REMOTE_ENV_FILE.production.example` | all | GitHub secret template |
| P1 | `backend/scripts/seed_admin.py` | all | Admin seeding logic |
| P2 | `backend/scripts/sync_geography_to_supabase.py` | all | Geography data sync |
| P2 | `backend/scripts/sync_selected_tables_to_supabase.py` | 1-21 | Default tables to sync |

---

## Patterns to Mirror

### ENV_FILE_RESOLUTION
```python
# SOURCE: backend/app/core/env.py:12-23
# "remote" target uses backend/.env
# "local" target uses backend/app/.env
TARGET_ENV_FILES = {
    "remote": BACKEND_DIR / ".env",
    "local": BACKEND_DIR / "app" / ".env",
}
```

### DB_TARGET_COMMANDS
```bash
# SOURCE: backend/scripts/db_target.py
# Show target info
python scripts/db_target.py show --target remote

# Run Alembic against remote
python scripts/db_target.py alembic --target remote upgrade head
```

### SYNC_SCRIPT_PATTERN
```python
# SOURCE: backend/scripts/sync_selected_tables_to_supabase.py:12-21
# Scripts read from LOCAL_ENV_PATH, write to REMOTE_ENV_PATH
# Default tables synced:
DEFAULT_TABLES = [
    "users", "auto_replies", "media_files",
    "intent_categories", "intent_keywords", "intent_responses",
    "service_requests", "messages",
]
```

### DATABASE_URL_FORMAT
```env
# SOURCE: backend/.env.production.example:15
# Supabase Session pooler format (asyncpg driver)
DATABASE_URL=postgresql+asyncpg://postgres.PROJECT_REF:PASSWORD@aws-1-REGION.pooler.supabase.com:5432/postgres
```

---

## Files to Change

| File | Action | Justification |
|---|---|---|
| `backend/.env` | UPDATE | Point DATABASE_URL + REDIS_URL to Frankfurt services |

## NOT Building

- No application code changes
- No Alembic migration files (using existing migrations)
- No new scripts
- No Koyeb service move yet (Phase 4)
- No Vercel/GitHub env updates yet (Phase 5)

---

## Step-by-Step Tasks

### Task 1: Create Supabase Project in Frankfurt
- **ACTION**: Create new Supabase project in eu-central-1 (Frankfurt)
- **IMPLEMENT**: 
  1. Go to https://supabase.com/dashboard → New Project
  2. Name: `jsk-app-fra` (or similar)
  3. Database password: generate strong password
  4. Region: **Central EU (Frankfurt)**
  5. Wait for project to finish provisioning
- **GOTCHA**: Select **Session pooler** (not Transaction pooler) — the app uses SQLAlchemy async sessions
- **VALIDATE**: 
  1. Go to Connect → Session pooler → copy connection string
  2. Format: `postgresql+asyncpg://postgres.NEW_REF:PASSWORD@aws-1-eu-central-1.pooler.supabase.com:5432/postgres`
  3. Record this as `NEW_DATABASE_URL`

### Task 2: Create Upstash Redis in Frankfurt
- **ACTION**: Create new Upstash Redis database in eu-central-1
- **IMPLEMENT**:
  1. Go to https://console.upstash.com → Create Database
  2. Name: `jsk-app-fra`
  3. Region: **EU-Central-1 (Frankfurt)**
  4. Type: Regional
  5. Copy the Redis URL
- **GOTCHA**: Use the `redis://` URL format (not `rediss://`) unless TLS is required
- **VALIDATE**: Record `NEW_REDIS_URL` — format: `redis://default:PASSWORD@HOST:PORT`

### Task 3: Prepare Environment Checklist
- **ACTION**: Document all places where DATABASE_URL, REDIS_URL, and backend URL are configured
- **IMPLEMENT**: Create/verify this checklist:

  **Env var locations to update (Phase 5):**
  
  | Location | Variable | Current Value (Mumbai) |
  |----------|----------|----------------------|
  | `backend/.env` | `DATABASE_URL` | `postgresql+asyncpg://...ap-south-1...` |
  | `backend/.env` | `REDIS_URL` | Current Upstash URL |
  | Koyeb service env | `DATABASE_URL` | Same as above |
  | Koyeb service env | `REDIS_URL` | Same as above |
  | Koyeb service env | `SERVER_BASE_URL` | `https://conservative-lusa-...koyeb.app` |
  | Koyeb service env | `BACKEND_CORS_ORIGINS` | `["https://jsk-app.vercel.app"]` |
  | GitHub secret `BACKEND_REMOTE_ENV_FILE` | Full .env content | Points to Mumbai |
  | GitHub variable `BACKEND_HEALTHCHECK_URL` | Health URL | `https://conservative-lusa-...koyeb.app/api/v1/health` |
  | GitHub variable `KOYEB_APP_NAME` | App name | `conservative-lusa` |
  | GitHub variable `KOYEB_SERVICE_NAME` | Service name | `jsk-app` |
  | Vercel env | `NEXT_PUBLIC_API_URL` | `https://conservative-lusa-...koyeb.app/api/v1` |
  | LINE Developers | Webhook URL | `https://conservative-lusa-...koyeb.app/api/v1/line/webhook` |

- **GOTCHA**: Koyeb URL **will change** when creating new service in Frankfurt — new random subdomain
- **VALIDATE**: Checklist covers all 12+ env var locations

### Task 4: Write New Remote .env
- **ACTION**: Update `backend/.env` with Frankfurt Supabase + Upstash URLs
- **IMPLEMENT**:
  ```bash
  # In WSL, edit backend/.env
  cd /mnt/d/genAI/jsk-app/backend
  # Update DATABASE_URL to new Supabase Frankfurt URL
  # Update REDIS_URL to new Upstash Frankfurt URL
  # Keep all other values (SECRET_KEY, LINE tokens, etc.) the same
  ```
- **MIRROR**: `ENV_FILE_RESOLUTION` — `backend/.env` is the "remote" target
- **GOTCHA**: Do NOT change `backend/app/.env` — that's the local dev target
- **VALIDATE**: `python scripts/db_target.py show --target remote` shows Frankfurt host

### Task 5: Run Alembic Migration on Frankfurt DB
- **ACTION**: Apply all 27 migrations to the new empty Frankfurt database
- **IMPLEMENT**:
  ```bash
  cd /mnt/d/genAI/jsk-app/backend
  source venv_linux/bin/activate
  
  # Verify target
  python scripts/db_target.py show --target remote
  # Should show: eu-central-1 host
  
  # Run migration
  python scripts/db_target.py alembic --target remote upgrade head
  ```
- **MIRROR**: `DB_TARGET_COMMANDS`
- **GOTCHA**: Must have `venv_linux` activated with all dependencies installed
- **VALIDATE**: 
  ```bash
  python scripts/db_target.py alembic --target remote current
  # Should show latest revision head
  ```

### Task 6: Seed Admin User
- **ACTION**: Create admin user in new Frankfurt database
- **IMPLEMENT**:
  ```bash
  cd /mnt/d/genAI/jsk-app/backend
  source venv_linux/bin/activate
  export ADMIN_DEFAULT_PASSWORD="adminjsk4p0"
  python scripts/seed_admin.py --apply
  ```
- **MIRROR**: Seed script reads from resolved env file (backend/.env for remote)
- **GOTCHA**: Script uses `resolve_env_file()` → will read `backend/.env` by default
- **VALIDATE**: Output says "Default admin user created." or "Admin user updated."

### Task 7: Sync Geography Data
- **ACTION**: Copy provinces/districts/sub_districts from local DB to Frankfurt
- **IMPLEMENT**:
  ```bash
  cd /mnt/d/genAI/jsk-app/backend
  source venv_linux/bin/activate
  
  # Sync geography (reads from local, writes to remote)
  python scripts/sync_geography_to_supabase.py --apply
  ```
- **MIRROR**: `SYNC_SCRIPT_PATTERN` — reads LOCAL_ENV_PATH, writes REMOTE_ENV_PATH
- **GOTCHA**: Local PostgreSQL + Docker must be running for source data
- **VALIDATE**: Check Supabase dashboard → Tables → provinces should have data

### Task 8: Sync Selected Tables (if data exists)
- **ACTION**: Copy intent categories, auto-replies, and other reference data
- **IMPLEMENT**:
  ```bash
  cd /mnt/d/genAI/jsk-app/backend
  source venv_linux/bin/activate
  
  # Preview what will be synced
  python scripts/sync_selected_tables_to_supabase.py
  
  # Apply sync
  python scripts/sync_selected_tables_to_supabase.py --apply
  ```
- **MIRROR**: `SYNC_SCRIPT_PATTERN`
- **GOTCHA**: 
  - Only syncs if local DB has data in these tables
  - Uses UPSERT (ON CONFLICT DO UPDATE) — safe to re-run
  - Requires local Docker DB running
- **VALIDATE**: Check key tables in Supabase dashboard have data

### Task 9: Verify Frankfurt Database
- **ACTION**: Run verification script against new database
- **IMPLEMENT**:
  ```bash
  cd /mnt/d/genAI/jsk-app/backend
  source venv_linux/bin/activate
  python scripts/verify_db.py
  ```
- **VALIDATE**: 
  - All tables exist
  - Admin user exists
  - Geography data present
  - No errors

---

## Testing Strategy

### Validation Commands

**Schema Verification**
```bash
cd backend
python scripts/db_target.py alembic --target remote current
```
EXPECT: Shows latest migration revision

**Database Verification**
```bash
cd backend
python scripts/verify_db.py
```
EXPECT: All checks pass

**Admin Login Test**
```bash
# Direct to new Supabase (via local backend pointing to Frankfurt DB)
cd backend
python run.py --target local  # temporarily point to Frankfurt
# Then test login
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"adminjsk4p0"}'
```
EXPECT: Returns JWT token

### Manual Validation
- [ ] Supabase dashboard shows project in eu-central-1
- [ ] Upstash dashboard shows database in eu-central-1
- [ ] `db_target.py show --target remote` shows Frankfurt host
- [ ] `alembic current` shows head revision
- [ ] Admin login returns token
- [ ] Geography tables have data (provinces > 0 rows)

---

## Acceptance Criteria
- [ ] Supabase project created in Frankfurt (eu-central-1)
- [ ] Upstash Redis created in Frankfurt (eu-central-1)
- [ ] All 27 Alembic migrations applied successfully
- [ ] Admin user seeded and login works
- [ ] Geography data synced
- [ ] Reference data synced (intents, auto-replies)
- [ ] Env vars checklist complete for Phase 5
- [ ] `NEW_DATABASE_URL` and `NEW_REDIS_URL` recorded

## Completion Checklist
- [ ] New DATABASE_URL recorded
- [ ] New REDIS_URL recorded
- [ ] backend/.env updated to Frankfurt
- [ ] Schema verified via Alembic current
- [ ] Admin login verified
- [ ] Data sync verified
- [ ] Checklist prepared for Phase 3-5 env updates

## Risks
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Local Docker DB not running for sync | M | Blocks Task 7-8 | Start Docker first: `docker-compose up -d db redis` |
| Supabase Frankfurt free tier unavailable | L | Blocks everything | Check Supabase dashboard before starting |
| Sync scripts fail on empty source tables | L | Partial data | Scripts handle empty tables gracefully |
| Wrong env file edited | M | Points to wrong DB | Always verify with `db_target.py show --target remote` |

## Notes
- **Do NOT change Koyeb yet** — Koyeb service still points to Mumbai. Phase 4 handles the Koyeb move.
- **Do NOT update Vercel/GitHub yet** — Phase 5 handles all env var updates after Koyeb is moved.
- **backend/.env is the only file changed** — this is the "remote" target used by db_target.py and sync scripts.
- After this phase, Frankfurt DB will be fully ready but not yet in use by production. Production still runs on Mumbai until Phase 4-5.
