# Plan: Region Migration Frankfurt — Phased Implementation

## Summary
Migrate Supabase + Upstash from Mumbai to Frankfurt to colocate with Koyeb (Washington DC → Frankfurt). Reduces DB roundtrip from ~500ms to <5ms. Infrastructure-only — no code changes.

## Metadata
- **Complexity**: Medium (infrastructure, no code changes)
- **Source PRD**: `region-migration-frankfurt.prd.md`, `region-migration-frankfurt-phase1-2.plan.md`
- **Estimated Files**: 1 (`backend/.env`)
- **Phases**: 5

---

## Phase 1: Provision Frankfurt Services
**Status**: pending
**Dependencies**: none
**Estimated**: 0.5 day (manual infra work)

### Tasks
1. **Create Supabase Frankfurt** — New project in eu-central-1, session pooler
   - Output: `NEW_DATABASE_URL`
2. **Create Upstash Redis Frankfurt** — New database in eu-central-1
   - Output: `NEW_REDIS_URL`

### Validation
- Supabase dashboard shows eu-central-1
- Upstash dashboard shows eu-central-1

---

## Phase 2: Prepare Migration
**Status**: pending
**Dependencies**: Phase 1
**Estimated**: 1 day

### Tasks
1. **Env Vars Checklist** — Document all 12+ locations where DATABASE_URL/REDIS_URL are configured
2. **Write New Remote .env** — Update `backend/.env` with Frankfurt URLs
3. **Run Alembic Migration** — Apply all 27 migrations to empty Frankfurt DB
4. **Seed Admin User** — Create admin in Frankfurt DB
5. **Sync Geography Data** — Copy provinces/districts/sub_districts
6. **Sync Selected Tables** — Copy intents, auto-replies, reference data
7. **Verify Frankfurt DB** — Run verify_db.py

### Validation
```bash
python scripts/db_target.py show --target remote  # Shows Frankfurt host
python scripts/db_target.py alembic --target remote current  # Shows head revision
python scripts/verify_db.py  # All checks pass
```

---

## Phase 3: Move Koyeb Service
**Status**: pending
**Dependencies**: Phase 2
**Estimated**: 0.5 day (manual infra work)

### Tasks
1. **Create New Koyeb Service** — Deploy to Frankfurt region
   - New random subdomain (will change)
2. **Verify Health** — Check `/api/v1/health` on new service

### Validation
- New Koyeb service responds to health check
- Backend connects to Frankfurt DB

---

## Phase 4: Update Environment Variables
**Status**: pending
**Dependencies**: Phase 3
**Estimated**: 0.5 day

### Tasks
1. **Koyeb Env** — DATABASE_URL, REDIS_URL, SERVER_BASE_URL, BACKEND_CORS_ORIGINS
2. **GitHub Secrets** — BACKEND_REMOTE_ENV_FILE, BACKEND_HEALTHCHECK_URL, KOYEB_APP_NAME, KOYEB_SERVICE_NAME
3. **Vercel Env** — NEXT_PUBLIC_API_URL → new Koyeb URL
4. **LINE Developers** — Webhook URL → new Koyeb URL

### Validation
- CI/CD pipeline passes
- LINE webhook receives events
- Frontend loads data from new backend

---

## Phase 5: Verify & Cleanup
**Status**: pending
**Dependencies**: Phase 4
**Estimated**: 0.5 day

### Tasks
1. **End-to-End Verification** — Login, create request, live chat, broadcast
2. **Monitor Latency** — Confirm <5ms DB roundtrip
3. **Decommission Mumbai** — Delete old Supabase + Upstash after 1 week monitoring

### Validation
- All admin pages load <1s
- Live chat works in real-time
- No errors in Koyeb logs for 24 hours

---

## Success Criteria
- [ ] Supabase + Upstash in Frankfurt
- [ ] All migrations applied
- [ ] Admin login works on new DB
- [ ] Geography + reference data synced
- [ ] Koyeb service running in Frankfurt
- [ ] All env vars updated
- [ ] LINE webhook working
- [ ] Frontend connecting to new backend
- [ ] Old Mumbai services decommissioned

## Risks
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Local Docker DB not running for sync | MEDIUM | Blocks Phase 2 | Start Docker first |
| Koyeb URL changes break LINE webhook | LOW | HIGH | Update LINE immediately after deploy |
| Supabase Frankfurt free tier unavailable | LOW | Blocks everything | Check dashboard before starting |
| Wrong env file edited | MEDIUM | Points to wrong DB | Always verify with db_target.py show |
