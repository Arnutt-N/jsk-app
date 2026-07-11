# JskApp P0–P3 Remediation Plan: Consolidated 5-Agent Review

**Review Date:** 2026-07-12  
**Plan Document:** `2026-07-11-2329-gpt-5.6-sol-p0-p3-remediation.plan.md`  
**Reviewers:** 5 specialized agents (Architecture, Database, Security, FastAPI, React)  
**Overall Verdict:** ⚠️ **High-quality plan with CRITICAL execution gaps — requires 8 major adjustments before implementation**

---

## Executive Summary

แผน remediation มีโครงสร้างและ priority ที่ดีมาก แต่มี **underestimation ร้ายแรง** ใน 3 จุดสำคัญ:

1. **P1.1 Cookie Auth** = 3 weeks, 3 PRs (ไม่ใช่ 1 phase)
2. **P1.5 Inbox/Outbox** = over-engineering risk, ขาด retention/partition strategy
3. **P0.2 LIFF Rollout** = immediate production downtime risk ถ้าไม่มี feature flag

**Timeline Reality:**
- แผนบอก "PR-sized batches" แต่จริง = **14.5 weeks (3.5 months) สำหรับ 1 engineer**
- Accelerated (2 engineers) = **10 weeks (2.5 months)**

---

## Cross-Agent Findings Matrix

| Issue | Architect | Database | Security | FastAPI | React | Severity |
|-------|-----------|----------|----------|---------|-------|----------|
| **P1.1 scope underestimation** | 🔴 3 weeks | - | 🔴 CSRF missing | 🔴 Pattern missing | 🔴 State desync | **CRITICAL** |
| **P1.5 over-engineering** | 🟡 Merge P1.6 | 🔴 No retention | ⚠️ Evidence needed | 🔴 Task queue conflict | - | **CRITICAL** |
| **P0.2 rollout risk** | 🟡 Feature flag | - | 🔴 Production downtime | - | 🔴 Breaking change | **CRITICAL** |
| **P2.3 premature optimization** | 🟡 Defer | 🔴 No EXPLAIN | - | - | - | **HIGH** |
| **P1.3 media security** | - | - | 🔴 Missing 4 layers | - | - | **HIGH** |
| **Advisory lock async** | - | ✅ Ship | 🟡 Timeout missing | 🔴 Pattern missing | - | **HIGH** |
| **Transaction boundary** | - | 🟡 Unclear | - | 🔴 Webhook commit | - | **MEDIUM** |
| **Outbox processor** | 🟡 Architecture TBD | 🟡 Phase 2 only | - | 🔴 Worker missing | - | **MEDIUM** |

---

## 🚨 Top 8 Must-Fix Before Execution

### 1. P0.2 LIFF: Add Feature Flag Strategy (CRITICAL)

**Problem:** แผนบอก "deploy frontend before backend" แต่:
- Backend deploys strict validation → **ทุก LIFF form fail ทันที**
- Frontend deploys token → old backend accepts LIFF-unverified → **ช่องโหว่ยังเปิดอยู่**

**Solution:**
```python
# backend/app/core/config.py
LIFF_STRICT_MODE: bool = False  # env var, default false

# backend/app/api/v1/endpoints/liff.py
if settings.LIFF_STRICT_MODE:
    if not id_token:
        raise HTTPException(401, "LIFF token required")
else:
    # Warn but allow during transition
    if not id_token:
        logger.warning("LIFF_token_missing_transition_mode")
        return None  # Temporary fallback
```

**Rollout:**
1. Deploy frontend (ส่ง token แล้วแต่ backend ยังไม่บังคับ) → **backward compatible**
2. Deploy backend with `LIFF_STRICT_MODE=false` + monitoring
3. Monitor token submission rate → ควรเห็น 100% หลัง 1-2 days
4. Flip `LIFF_STRICT_MODE=true` via env var (no redeploy)
5. Remove fallback code ใน next release

**Rollback:** แค่ปิด flag, ไม่ต้อง redeploy

---

### 2. P1.1: Split into 3 Sequential PRs + Add Complete Patterns (CRITICAL)

**Problem:** แผนคาดหวัง 1 batch แต่จริงๆ มี 8 files และ 5 complex patterns:

**Missing patterns:**
- CSRF generation/validation logic
- Cookie extraction in FastAPI (ไม่มี built-in `HTTPCookie` scheme)
- WebSocket CSRF protection
- Session migration endpoint (Bearer → Cookie)
- Refresh token rotation + reuse detection

**Solution: Split into 3 PRs**

**PR #1: Backend Cookie Foundation (1 week)**
```python
# 1. Custom security class (FastAPI doesn't have HTTPCookie)
class CookieOrBearerAuth:
    async def __call__(self, request: Request) -> Optional[str]:
        token = request.cookies.get("access_token")
        if token: return token
        # Fallback to Bearer during migration
        auth = request.headers.get("authorization")
        if auth and auth.startswith("Bearer "): return auth[7:]
        return None

# 2. CSRF double-submit pattern
@app.post("/auth/login")
async def login(response: Response):
    csrf = secrets.token_urlsafe(32)
    response.set_cookie("csrf_token", csrf, httponly=True, samesite="strict")
    response.set_cookie("access_token", access_token, httponly=True, secure=True)
    return {"csrf_token": csrf}  # Frontend stores in memory

# 3. CSRF validation dependency
async def verify_csrf(
    request: Request,
    csrf_token: str = Header(None, alias="x-csrf-token")
):
    cookie_csrf = request.cookies.get("csrf_token")
    if not cookie_csrf or not secrets.compare_digest(cookie_csrf, csrf_token):
        raise HTTPException(403, "CSRF validation failed")

# 4. Apply to state-changing routes
@router.post("/", dependencies=[Depends(verify_csrf)])
async def create_resource(...): pass

# 5. Session migration endpoint
@router.post("/auth/migrate-to-cookies")
async def migrate_session(
    request: Request,
    response: Response,
    authorization: str = Header(...)
):
    token = authorization.replace("Bearer ", "")
    payload = verify_jwt(token)
    
    # Issue cookies
    access_token = create_access_token(payload["sub"])
    refresh_token = create_refresh_token(payload["sub"])
    set_auth_cookies(response, access_token, refresh_token)
    
    return {"migrated": True}

# 6. Refresh token rotation
@router.post("/auth/refresh")
async def refresh_token(request: Request, response: Response, db: AsyncSession):
    old_refresh = request.cookies.get("refresh_token")
    
    # Token reuse detection
    if await is_token_already_used(db, old_refresh):
        await revoke_all_user_sessions(db, user_id)
        raise HTTPException(401, "Token reuse detected - all sessions revoked")
    
    await mark_token_used(db, old_refresh)
    
    # Issue new tokens
    new_access = create_access_token(user_id)
    new_refresh = create_refresh_token(user_id)
    set_auth_cookies(response, new_access, new_refresh)
```

**PR #2: Frontend Migration (1 week)**
```typescript
// AuthContext.tsx
const login = async (username: string, password: string) => {
    const res = await fetch('/api/v1/auth/login', {
        method: 'POST',
        credentials: 'include',  // ✅ Send/receive cookies
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
    })
    
    const data = await res.json()
    
    // ✅ Store CSRF token in memory (not localStorage)
    setCsrfToken(data.csrf_token)
    
    // ✅ Don't store access_token (it's in HttpOnly cookie)
    localStorage.removeItem('auth_token')  // Clean up legacy
    
    setUser(data.user)
}

// authFetch.ts - update interceptor
const authFetch = async (url: string, options: RequestInit = {}) => {
    return fetch(url, {
        ...options,
        credentials: 'include',  // ✅ Always include cookies
        headers: {
            ...options.headers,
            'x-csrf-token': csrfToken,  // ✅ Add CSRF header
        }
    })
}
```

**PR #3: Remove Bearer Fallback + Hardening (1 week)**
- Remove `CookieOrBearerAuth` fallback → cookie-only
- Add SameSite=Strict enforcement
- Security audit + penetration testing

**Timeline:** 3 weeks total (not 1 phase)

---

### 3. P1.5: Staged Rollout + Add Missing Infrastructure (CRITICAL)

**Problem:** แผนต้องการ full inbox/outbox แต่:
- ❌ ไม่มี **retention policy** — table จะโตไม่หยุด
- ❌ ไม่มี **partition strategy**
- ❌ ไม่มี **performance baseline** (PostgreSQL write + fsync penalty)
- ❌ ไม่ระบุ **task queue** (ยังใช้ BackgroundTasks = ไม่มี crash recovery จริง)

**Solution: Phase it**

**Phase 1: Inbox Only (ship now) — 1 week**
```sql
CREATE TABLE webhook_inbox (
    id BIGSERIAL PRIMARY KEY,
    signature_hash VARCHAR(64) NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL,
    event_type VARCHAR(50) NOT NULL,
    line_user_id VARCHAR(255),
    payload JSONB NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'received',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Deduplication constraint
    CONSTRAINT uq_webhook_dedup 
    UNIQUE (signature_hash, timestamp, event_type, line_user_id)
);

CREATE INDEX idx_webhook_timestamp ON webhook_inbox(timestamp);
CREATE INDEX idx_webhook_status ON webhook_inbox(status) 
WHERE status IN ('received', 'processing');

-- ✅ CRITICAL: Retention policy (cleanup old records)
CREATE OR REPLACE FUNCTION cleanup_old_webhooks()
RETURNS void AS $$
BEGIN
    DELETE FROM webhook_inbox 
    WHERE timestamp < NOW() - INTERVAL '90 days';
END;
$$ LANGUAGE plpgsql;

-- Schedule daily cleanup
SELECT cron.schedule('cleanup-webhooks', '0 2 * * *', 'SELECT cleanup_old_webhooks()');
```

```python
# Process synchronously (no outbox yet)
@router.post("/webhook")
async def webhook(request: Request, db: AsyncSession):
    events = await validate_and_parse(request)
    
    # Store in inbox + commit immediately
    inbox_records = [...]
    db.add_all(inbox_records)
    await db.commit()  # ✅ commit ก่อน return
    
    # Process inline (no crash recovery yet, but idempotent)
    for record in inbox_records:
        await process_event_inline(db, record)
    
    return {"status": "ok"}
```

**Phase 2: Outbox (only if evidence proves necessary) — 2 weeks**
- เมื่อมี **data loss incident** จริง
- หรือ **Redis unavailable** บ่อย
- หรือ **webhook volume** > 10K/day

---

### 4. P2.3: Evidence-First Approach (HIGH)

**Problem:** แผนบอก "add indexes when supported by measured plans" แต่ **ไม่มี EXPLAIN ANALYZE output**

**Solution:**
```bash
# 1. Enable pg_stat_statements in production
ALTER SYSTEM SET shared_preload_libraries = 'pg_stat_statements';
SELECT pg_reload_conf();

# 2. Collect 1 week of query stats
SELECT query, mean_exec_time, calls, total_exec_time
FROM pg_stat_statements
WHERE mean_exec_time > 500  -- Queries slower than 500ms
ORDER BY total_exec_time DESC
LIMIT 20;

# 3. Run EXPLAIN ANALYZE on slowest queries
EXPLAIN ANALYZE
SELECT * FROM service_requests 
WHERE status = 'pending' 
ORDER BY created_at DESC 
LIMIT 50;

# 4. Design indexes ONLY if EXPLAIN shows Seq Scan on large tables
# Example: if above shows "Seq Scan on service_requests (rows=50000)"
CREATE INDEX idx_requests_status_created 
ON service_requests(status, created_at DESC)
WHERE status IN ('pending', 'in_progress');
```

**Don't ship P2.3 until you have:**
- [ ] Production query plans (EXPLAIN output)
- [ ] Table sizes (SELECT COUNT(*) FROM each table)
- [ ] Before/after performance comparison

---

### 5. P1.3: Add Defense-in-Depth Layers (HIGH)

**Problem:** แผนบอก "MIME validation" แต่ขาด 4 security layers

**Solution:**
```python
from magic import Magic
import filetype

MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB
ALLOWED_MIMES = {"image/jpeg", "image/png", "application/pdf", "video/mp4"}

async def validate_upload(file: UploadFile) -> dict:
    """4-layer file validation"""
    
    # Layer 1: Size limit (before reading entire file)
    content = await file.read(MAX_FILE_SIZE + 1)
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(413, "File too large")
    
    # Layer 2: Magic byte detection (actual file type)
    detected_type = filetype.guess(content)
    if not detected_type or detected_type.mime not in ALLOWED_MIMES:
        raise HTTPException(400, f"File type not allowed: {detected_type}")
    
    # Layer 3: Verify declared vs actual MIME match
    if file.content_type != detected_type.mime:
        raise HTTPException(400, "MIME mismatch - potential spoofing")
    
    # Layer 4: Image-specific validation
    if detected_type.mime.startswith("image/"):
        from PIL import Image
        import io
        img = Image.open(io.BytesIO(content))
        
        if img.width > 10000 or img.height > 10000:
            raise HTTPException(400, "Image dimensions too large")
        
        img.verify()
    
    return {"mime": detected_type.mime, "size": len(content)}

# Signed URL generation with key rotation
SIGNING_KEYS = {
    "v1": settings.SIGNING_KEY_V1,
    "v2": settings.SIGNING_KEY_V2,  # For rotation
}

def generate_signed_url(file_id: str, expires_in: int = 3600) -> str:
    expires_at = int(time.time()) + expires_in
    payload = f"{file_id}|{expires_at}|v1"
    
    signature = hmac.new(
        SIGNING_KEYS["v1"].encode(),
        payload.encode(),
        hashlib.sha256
    ).hexdigest()
    
    return f"/media/public/{file_id}?expires={expires_at}&v=v1&sig={signature}"

# Thai filename support (RFC 5987)
def safe_content_disposition(filename: str) -> str:
    safe_name = filename.replace('"', '').replace('\n', '')
    utf8_name = quote(safe_name.encode('utf-8'))
    
    return (
        f'attachment; '
        f'filename="file.dat"; '
        f"filename*=UTF-8''{utf8_name}"
    )
```

---

### 6. P0.3: Add Audit-of-Audit (HIGH)

**Problem:** Malicious SUPER_ADMIN สามารถลบ audit logs โดยไม่มี trail

**Solution:**
```python
# Option A: Audit log access tracking
class AuditLogAccess(Base):
    __tablename__ = "audit_log_access"
    
    id = Column(BigInteger, primary_key=True)
    accessor_id = Column(BigInteger, ForeignKey("users.id"), nullable=False)
    accessed_at = Column(DateTime(timezone=True), server_default=func.now())
    filter_params = Column(JSONB)
    record_count = Column(Integer)

@router.get("/admin/audit")
async def get_audit_logs(db: AsyncSession, current_user: User):
    results = await query_audit_logs(db, filters)
    
    # Log this audit access
    await db.execute(
        insert(AuditLogAccess).values(
            accessor_id=current_user.id,
            filter_params=filters,
            record_count=len(results)
        )
    )
    await db.commit()
    
    return results

# Option B: Immutable audit (better)
# 1. No DELETE permission on audit_logs table (DB-level)
ALTER TABLE audit_logs OWNER TO audit_owner;
REVOKE DELETE ON audit_logs FROM app_user;

# 2. Periodic backup to append-only storage
# (S3 Glacier, PostgreSQL archive)
```

---

### 7. P1.6: Add Advisory Lock Patterns (HIGH)

**Problem:** แผนบอก "use advisory locks" แต่ไม่แสดง async pattern

**Solution:**
```python
from sqlalchemy import text

async def acquire_scheduler_lock(db: AsyncSession, lock_id: int = 999001) -> bool:
    """Try to acquire session-level advisory lock (non-blocking)"""
    result = await db.execute(
        text("SELECT pg_try_advisory_lock(:id)"),
        {"id": lock_id}
    )
    return result.scalar()

async def release_scheduler_lock(db: AsyncSession, lock_id: int = 999001):
    """Release session-level advisory lock"""
    await db.execute(
        text("SELECT pg_advisory_unlock(:id)"),
        {"id": lock_id}
    )

# Integration with FastAPI lifespan
from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    db = AsyncSessionLocal()
    scheduler_lock_acquired = await acquire_scheduler_lock(db)
    
    if scheduler_lock_acquired:
        logger.info("Scheduler leadership acquired")
        scheduler.start()
    else:
        logger.info("Another instance owns scheduler")
    
    yield  # App runs
    
    # Shutdown
    if scheduler_lock_acquired:
        scheduler.shutdown()
        await release_scheduler_lock(db)
    await db.close()

app = FastAPI(lifespan=lifespan)

# Lock ID registry (prevent collision)
class AdvisoryLockID:
    BROADCAST_SCHEDULER = 999001
    SESSION_CLEANUP = 999002
```

**Critical:** Session-level locks ต้อง release ใน `finally` block หรือใช้ transaction-level locks แทน

---

### 8. P1.1 Frontend: Add State Migration (HIGH)

**Problem:** Cookie auth จะทำให้ React state desync

**Solution:**
```typescript
// AuthContext.tsx
const [authMode, setAuthMode] = useState<'cookie' | 'bearer'>('bearer')

// Detect mode from backend
useEffect(() => {
    fetch('/api/v1/auth/mode')
        .then(r => r.json())
        .then(data => setAuthMode(data.use_cookie_auth ? 'cookie' : 'bearer'))
}, [])

const login = async (username: string, password: string) => {
    const res = await fetch('/api/v1/auth/login', {
        method: 'POST',
        credentials: authMode === 'cookie' ? 'include' : 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
    })
    
    const data = await res.json()
    
    if (authMode === 'bearer') {
        // Legacy: store token
        setToken(data.access_token)
        localStorage.setItem('auth_token', data.access_token)
    } else {
        // Cookie: no token in state
        setToken(null)  // Signal: authenticated but no token
        localStorage.removeItem('auth_token')
    }
    
    setUser(data.user)
}

// Session migration
const migrateToCookie = async () => {
    const oldToken = localStorage.getItem('auth_token')
    if (oldToken && authMode === 'cookie') {
        try {
            await fetch('/api/v1/auth/migrate-session', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${oldToken}` },
                credentials: 'include'
            })
            localStorage.removeItem('auth_token')
        } catch (err) {
            logout()  // Migration failed → force re-login
        }
    }
}
```

---

## Recommended Execution Order (Revised)

### ✅ **Phase 0: Pre-Flight (1 week)**
- [ ] Implement P0.2 feature flag (frontend + backend)
- [ ] Write P1.1 design doc (cookie + CSRF architecture)
- [ ] Audit P1.5: มี data loss evidence หรือไม่?
- [ ] Collect P2.3 baseline (pg_stat_statements)

### 🔴 **Phase 1: Critical Security (2 weeks)**
- [ ] P0.1 Production guards → staging
- [ ] P0.2a Frontend LIFF token transmission → production
- [ ] P0.2b Backend strict mode (flag OFF) → production
- [ ] Monitor 3-5 days → enable flag
- [ ] P0.3 Audit coverage + audit-of-audit → production

**Checkpoint:** LIFF forms working, audit logs complete

### 🟡 **Phase 2: Auth & Durability (3-4 weeks)**
- [ ] P1.4 Alembic ownership
- [ ] P1.2 RBAC unification
- [ ] P1.3 Secure media (4 layers + signed URLs)
- [ ] P1.5 Phase 1: Inbox only + retention policy
- [ ] P1.6 Advisory locks (with timeout pattern)
- [ ] P1.1a Cookie auth backend (PR #1)
- [ ] P1.1b Cookie auth frontend (PR #2)
- [ ] P1.1c Remove Bearer fallback (PR #3)

**Checkpoint:** Cookie auth live, multi-instance safe, media secure

### 🟢 **Phase 3: Consolidation (2-3 weeks)**
- [ ] P2.1 Intent migration (reversible)
- [ ] P2.2 Reports consolidation
- [ ] P2.3 Indexes (evidence-driven only)
- [ ] P2.4 Audit consistency
- [ ] **SKIP P2.5** (defer image resize)
- [ ] P2.6 E2E coverage

**Checkpoint:** Data consolidated, performance validated

### 🔵 **Phase 4: Cleanup (1-2 weeks)**
- [ ] P3.1 Skill refresh
- [ ] P3.2 Skill dedup
- [ ] P3.3 Design-system cleanup
- [ ] P3.4 Deprecation log (no removal yet)
- [ ] P3.5 Naming consistency

**Checkpoint:** Documentation accurate, deprecation tracked

**Total: 9-12 weeks**

---

## Risk Summary

| Phase | CRITICAL Risks | Mitigation |
|-------|----------------|------------|
| P0.2 | Production downtime if deployed wrong | Feature flag + atomic deploy |
| P1.1 | Session loss, state desync | 3 PRs + migration endpoint + dual-mode |
| P1.5 | Over-engineering, no retention | Phase 1 only (inbox) + 90-day cleanup |
| P2.3 | Premature optimization | Evidence-first: pg_stat_statements → EXPLAIN → index |
| P1.3 | File upload vulnerabilities | 4-layer validation + signed URLs + key rotation |

---

## Final Verdict

| Aspect | Rating | Comment |
|--------|--------|---------|
| **Structure** | ⭐⭐⭐⭐⭐ | Excellent priority + checkpoints |
| **Scope Estimation** | ⭐⭐☆☆☆ | P1.1/P1.5 severely underestimated |
| **Security Depth** | ⭐⭐⭐☆☆ | Good coverage but missing implementation details |
| **Rollout Strategy** | ⭐⭐⭐☆☆ | Has checkpoints but lacks feature flags + canary |
| **Technical Patterns** | ⭐⭐☆☆☆ | High-level only, missing FastAPI/React patterns |
| **Evidence-Based** | ⭐⭐☆☆☆ | P2.3 has no query plans, P1.5 has no data loss proof |

**Overall: 7/10 — Solid foundation, needs 8 critical adjustments**

---

## Next Steps

1. ✅ **ปรับแผน** ตาม 8 must-fix ข้างต้น
2. ✅ **เพิ่ม concrete patterns** สำหรับ FastAPI + React
3. ✅ **Collect evidence** สำหรับ P1.5 (data loss?) และ P2.3 (query plans)
4. ✅ **Split P1.1** เป็น 3 PRs พร้อม timeline 3 weeks
5. ✅ **Add feature flags** สำหรับ P0.2 และ P1.1
6. ✅ **Phase P1.5** → Inbox only ก่อน, Outbox เมื่อมี evidence

**หลังจากปรับแล้ว → แผนพร้อม execute ได้เลย 🚀**
