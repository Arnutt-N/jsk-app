---
name: skn-performance-audit
description: >
  Identifies and fixes performance issues in the SKN App (JskApp) backend —
  N+1 queries, missing indexes, slow analytics queries, async anti-patterns,
  and pagination issues. Use when asked to "optimize query", "fix N+1",
  "slow endpoint", "add index", "performance issue", "too many queries",
  "audit queries", "ปรับ query", "แก้ N+1", "endpoint ช้า", "ใส่ index".
  Do NOT use for adding new features or changing business logic.
license: MIT
compatibility: >
  Claude Code with SKN App project.
  Requires: FastAPI backend, SQLAlchemy 2.0 async, PostgreSQL.
metadata:
  author: SKN App Team
  version: 1.0.0
  project: skn-app
  category: backend
  tags: [performance, sqlalchemy, n+1, index, pagination, query-optimization]
---

# SKN Performance Audit

Provides patterns, checklists, and concrete fixes for identifying and resolving
database and async performance issues in the SKN App backend.

---

## CRITICAL: Project-Specific Rules

These rules are non-negotiable and must be followed every time:

1. **Enable SQL echo FIRST** — set `echo=True` in `backend/app/db/session.py` to see every
   SQL query in uvicorn logs. This is the primary diagnostic tool. Revert before committing.

2. **SQLAlchemy 2.0 async — no sync operations** — every DB call must be `await db.execute()`
   or `await db.scalar()`. Never use `.first()` (sync ORM pattern); use `.scalar_one_or_none()`
   or `.scalars().all()`.

3. **`expire_on_commit=False` is already set** — the project sessionmaker has
   `expire_on_commit=False`, so ORM objects are safe to access after `await db.commit()`.
   Do NOT add `await db.refresh(obj)` unless you specifically need fresh DB-generated values.

4. **Use `selectinload`, not lazy loading** — async sessions do NOT support implicit lazy
   loading. Use `selectinload()` or `joinedload()` in the query. Accessing a relationship
   without loading it will raise `MissingGreenlet` or return empty.

5. **`with_for_update()` for concurrent writes** — when two WebSocket events can claim
   the same session simultaneously, use `select(...).with_for_update()`. Already used in
   `live_chat_service.get_active_session(lock=True)`.

6. **`func.row_number().over()` for "latest per group"** — the project already uses this
   pattern in `get_conversations()` to avoid N+1 for sessions and messages. Replicate this
   pattern, do NOT use Python-level `max()` on fetched rows.

7. **`IN` clause for batch fetches, not loops** — never call `await db.get(Model, id)` inside
   a loop. Use `select(Model).where(Model.id.in_(ids))` to load all at once.

8. **Cursor-based pagination over offset** — `get_messages_paginated()` uses `id < before_id`
   cursor. Never use `.offset(N)` for large tables — it degrades as O(N) because the DB must
   scan and discard N rows.

9. **PostgreSQL-specific functions are acceptable** — this project uses `func.date_trunc()`,
   `func.extract()`, `func.row_number().over()`. These are PostgreSQL-only and intentional.
   Do not replace with portable alternatives.

10. **Indexes must be declared in migrations, not just models** — adding `index=True` to a
    Column definition does NOT add the index to the live DB. Generate and apply an Alembic
    migration (use `skn-migration-helper` skill).

---

## Context7 Docs

Context7 MCP is active in this project (`.mcp.json`). Use for SQLAlchemy async patterns.

| Library | Resolve Name | Key Topics |
|---|---|---|
| SQLAlchemy | `"sqlalchemy"` | async session, selectinload, window functions, subquery |
| FastAPI | `"fastapi"` | background tasks, dependencies, response models |
| Alembic | `"alembic"` | create_index, drop_index, op.execute |

---

## Step 1: Enable SQL Query Logging

**File:** `backend/app/db/session.py`

```python
engine = create_async_engine(
    str(settings.DATABASE_URL),
    echo=True,   # ← Change False → True
    future=True,
)
```

Restart uvicorn — every SQL statement now appears in the terminal:
```
INFO sqlalchemy.engine.Engine SELECT ...
INFO sqlalchemy.engine.Engine [cached since 0.002s ago] ()
```

**What to look for:**
- Repeated identical queries in a loop → N+1
- `SELECT *` on large tables without `LIMIT` → missing pagination
- Missing `WHERE` clause on indexed columns → full table scan
- `LIKE '%text%'` with leading wildcard → can't use B-tree index

**Revert before committing:**
```python
echo=False,  # Never commit echo=True — it floods production logs
```

---

## Step 2: Detect N+1 Queries

### Pattern: Python loop calling DB per iteration

```python
# ❌ N+1 — fires 1 query per session
sessions = (await db.execute(select(ChatSession))).scalars().all()
for session in sessions:
    user = await db.get(User, session.operator_id)  # 1 extra query each!
    print(user.display_name)

# ✅ Single query with join
result = await db.execute(
    select(ChatSession, User)
    .outerjoin(User, User.id == ChatSession.operator_id)
)
```

### Pattern: Relationship access without loading

```python
# ❌ MissingGreenlet error in async context
keyword = (await db.execute(select(IntentKeyword))).scalars().first()
print(keyword.category.name)  # Lazy load — will fail in async!

# ✅ selectinload in query
stmt = select(IntentKeyword).options(
    selectinload(IntentKeyword.category).selectinload(IntentCategory.responses)
)
```

### Pattern: "Latest per group" with Python max()

```python
# ❌ Loads all sessions then filters in Python
all_sessions = (await db.execute(select(ChatSession))).scalars().all()
latest = {s.line_user_id: max(group, key=lambda x: x.started_at)
          for s in all_sessions}  # O(N) memory + full table scan

# ✅ row_number() window function (already used in get_conversations())
subq = (
    select(
        ChatSession,
        func.row_number().over(
            partition_by=ChatSession.line_user_id,
            order_by=desc(ChatSession.started_at)
        ).label("rn")
    ).subquery()
)
latest = aliased(ChatSession, subq)
result = await db.execute(select(latest).where(subq.c.rn == 1))
```

### Known N+1 in this codebase

| Location | Issue | Fix |
|---|---|---|
| `live_chat_service.get_conversations()` | `get_unread_count()` called per conversation (1 Redis + 1 DB COUNT each) | Batch Redis reads first; use `func.count()` GROUP BY for DB counts |
| `live_chat_service.get_queue_position()` | Loads ALL waiting sessions then iterates in Python | Use `COUNT` + `RANK` window function |
| `analytics_service.get_live_kpis()` | 9+ separate DB queries executed sequentially | Use CTE or run in parallel with `asyncio.gather()` |

---

## Step 3: Fix get_queue_position() — Python-level N+1

**File:** `backend/app/services/live_chat_service/handoff.py`

Current code loads all WAITING sessions into Python then iterates — O(N) memory:

```python
# ❌ Current — loads all waiting sessions
result = await db.execute(stmt)
waiting_sessions = result.scalars().all()
position = next((i+1 for i, s in enumerate(waiting_sessions) if s.line_user_id == line_user_id), 0)
```

**Fix — use a single SQL RANK query:**

```python
# ✅ O(1) — single query returns position and total directly
rank_subq = (
    select(
        ChatSession.line_user_id,
        func.rank().over(order_by=ChatSession.started_at).label("position"),
        func.count().over().label("total_waiting"),
    )
    .where(ChatSession.status == SessionStatus.WAITING)
    .subquery()
)
row = (await db.execute(
    select(rank_subq.c.position, rank_subq.c.total_waiting)
    .where(rank_subq.c.line_user_id == line_user_id)
)).one_or_none()

position = int(row.position) if row else 0
total_waiting = int(row.total_waiting) if row else 0
```

---

## Step 4: Batch Analytics with asyncio.gather()

**File:** `backend/app/services/analytics_service.py`

`get_live_kpis()` fires 9+ sequential DB queries. Each is independent — run in parallel:

```python
# ✅ Parallel execution — total time = slowest query, not sum of all
import asyncio

(
    waiting,
    active,
    sessions_today,
    human_mode_users,
    avg_frt_result,
    avg_resolution_result,
    csat_result,
) = await asyncio.gather(
    db.scalar(select(func.count()).where(ChatSession.status == SessionStatus.WAITING)),
    db.scalar(select(func.count()).where(ChatSession.status == SessionStatus.ACTIVE)),
    db.scalar(select(func.count()).where(ChatSession.started_at > today_start)),
    db.scalar(select(func.count()).where(User.chat_mode == ChatMode.HUMAN)),
    db.execute(select(func.avg(func.extract('epoch', ChatSession.first_response_at - ChatSession.claimed_at)))
               .where(ChatSession.first_response_at.isnot(None), ChatSession.claimed_at > hour_ago)),
    db.execute(select(func.avg(func.extract('epoch', ChatSession.closed_at - ChatSession.started_at)))
               .where(ChatSession.status == SessionStatus.CLOSED, ChatSession.closed_at > today_start)),
    db.execute(select(func.avg(CsatResponse.score)).where(CsatResponse.created_at > day_ago)),
)
```

**Warning:** `asyncio.gather()` with SQLAlchemy async sessions works ONLY if all coroutines
share the same connection. With `AsyncSession`, concurrent `await` on the same session instance
may conflict — test carefully, or use `run_sync` approach with separate read sessions.

---

## Step 5: Add Missing Indexes

**Check which columns need indexes:**

```sql
-- Run in psql to find sequential scans on large tables
EXPLAIN ANALYZE SELECT * FROM messages WHERE line_user_id = 'Uabc123';
-- If it says "Seq Scan" instead of "Index Scan", the column needs an index
```

**Key columns that are frequently filtered in WHERE/JOIN:**

| Table | Column | Current index | Add? |
|---|---|---|---|
| `messages` | `line_user_id` | Check model | High priority — used in every conversation query |
| `messages` | `created_at` | Check model | Used for time-range queries |
| `chat_sessions` | `line_user_id` | `index=True` in model ✅ | Already indexed |
| `chat_sessions` | `status` | Check model | Used in `WHERE status IN (...)` |
| `chat_sessions` | `started_at` | Check model | Used for time-range + ORDER BY |
| `users` | `line_user_id` | Check model | Used in every join |
| `intent_keywords` | `keyword` | Check model | EXACT match lookup |
| `intent_keywords` | `match_type` | Check model | Filter by type |
| `audit_logs` | `admin_id` | Check model | Filter by operator |
| `audit_logs` | `created_at` | Check model | Time-range queries |

**Add composite index via Alembic migration:**

```python
# In migration file
from sqlalchemy import Index

def upgrade() -> None:
    # Composite index for (line_user_id, created_at) — covers paginated message queries
    op.create_index(
        "ix_messages_line_user_id_created_at",
        "messages",
        ["line_user_id", "created_at"],
    )
    # Partial index for active/waiting sessions only
    op.execute("""
        CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_chat_sessions_active_waiting
        ON chat_sessions (line_user_id, started_at)
        WHERE status IN ('WAITING', 'ACTIVE')
    """)

def downgrade() -> None:
    op.drop_index("ix_messages_line_user_id_created_at", "messages")
    op.execute("DROP INDEX IF EXISTS ix_chat_sessions_active_waiting")
```

---

## Step 6: Cursor Pagination vs Offset

**File:** `backend/app/services/live_chat_service/conversations.py` — `get_messages_paginated()`

The project already uses cursor-based pagination correctly:

```python
# ✅ Already correct — cursor by id
query = select(Message).where(Message.line_user_id == line_user_id)
if before_id is not None:
    query = query.where(Message.id < before_id)   # cursor
query = query.order_by(desc(Message.id)).limit(safe_limit + 1)
```

**Pattern to replicate for new paginated endpoints:**

```python
async def get_audit_logs_paginated(
    db: AsyncSession,
    before_id: Optional[int] = None,
    limit: int = 50
) -> dict:
    safe_limit = max(1, min(limit, 100))
    query = select(AuditLog).order_by(desc(AuditLog.id))
    if before_id:
        query = query.where(AuditLog.id < before_id)
    query = query.limit(safe_limit + 1)

    result = await db.execute(query)
    rows = result.scalars().all()
    has_more = len(rows) > safe_limit
    return {
        "items": rows[:safe_limit],
        "has_more": has_more,
        "next_cursor": rows[safe_limit - 1].id if has_more else None,
    }
```

**Never use offset for production endpoints:**
```python
# ❌ Offset — degrades O(N) as pages increase
query.offset(page * limit).limit(limit)
```

---

## Step 7: Query Inspection with EXPLAIN ANALYZE

Run from `psql` or any PostgreSQL client:

```sql
-- See query plan and actual execution time
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT m.* FROM messages m
WHERE m.line_user_id = 'Uabc123'
ORDER BY m.id DESC
LIMIT 51;

-- Find slow queries (requires pg_stat_statements extension)
SELECT query, mean_exec_time, calls
FROM pg_stat_statements
WHERE mean_exec_time > 100  -- slower than 100ms
ORDER BY mean_exec_time DESC
LIMIT 20;
```

**Reading EXPLAIN output:**

| Term | Meaning |
|---|---|
| `Seq Scan` | Full table scan — add an index |
| `Index Scan` | Using an index — good |
| `Index Only Scan` | Only reads index, no heap access — best |
| `Hash Join` | Good for large tables |
| `Nested Loop` | Watch for N+1 in the plan |
| `actual time=X..Y` | Actual start..end time in ms |
| `rows=X` | Actual rows returned |

---

## Examples

### Example 1: "Conversations endpoint is slow"

**Diagnosis:**
1. Enable `echo=True`, reload, hit `GET /admin/live-chat/conversations`
2. Count how many SQL queries appear per request
3. If >5 queries, look for N+1 pattern
4. Check `get_unread_count()` — it fires 1 Redis + 1 DB query **per conversation**

**Current bottleneck:**
```python
# In get_conversations() — called N times for N conversations
unread_count = await self.get_unread_count(
    line_user_id=user.line_user_id,
    admin_id=admin_id_str,
    db=db,
)
```

**Quick fix (batch the Redis reads):**
```python
# Pre-fetch all Redis read_at values for this admin
import asyncio

user_ids = [user.line_user_id for user, _, _ in rows]
read_keys = [ConnectionManager.build_read_key(admin_id_str, uid) for uid in user_ids]
# Note: redis_client only exposes .get() one at a time — add mget() method for batching
```

### Example 2: "KPI dashboard takes 500ms+"

**Cause:** `get_live_kpis()` runs ~9 sequential DB queries.

**Quick diagnostic:**
```python
import time
start = time.time()
kpis = await analytics_service.get_live_kpis(db)
print(f"KPIs took {(time.time()-start)*1000:.0f}ms")
```

**Fix:** Wrap independent queries in `asyncio.gather()` (see Step 4).

### Example 3: "Queue position endpoint is slow with many users"

**Cause:** `get_queue_position()` loads ALL WAITING sessions into memory.

**Fix:** Use SQL RANK window function (see Step 3).

### Example 4: "Add pagination to audit logs endpoint"

**Actions:**
1. Add `before_id: Optional[int] = None` and `limit: int = 50` query params
2. Use cursor pattern: `AuditLog.id < before_id`, `ORDER BY id DESC`, `LIMIT limit+1`
3. Return `{"items": [...], "has_more": bool, "next_cursor": id or null}`
4. Add `index=True` to `AuditLog.created_at` if querying by time

---

## Common Issues

### `MissingGreenlet` error when accessing relationship
**Cause:** Async session doesn't support implicit lazy loading.
**Fix:** Add `selectinload()` to the query:
```python
stmt = select(Model).options(selectinload(Model.relationship_name))
```

### `UNION` query returns wrong column count
**Cause:** SQLAlchemy CTE/subquery column labels must match exactly.
**Fix:** Use `.label("name")` on all selected columns; verify with `echo=True`.

### `asyncio.gather()` raises `MissingGreenlet` or session conflicts
**Cause:** Two coroutines sharing the same `AsyncSession` running concurrently.
**Fix:** Each coroutine needs its own `AsyncSessionLocal()` context, OR keep queries sequential.

### `CREATE INDEX` blocks table writes
**Cause:** Plain `CREATE INDEX` locks the table during build.
**Fix:** Use `CREATE INDEX CONCURRENTLY` (requires Alembic `op.execute()` not `op.create_index()`).

### Query faster in dev but slow in production
**Cause:** Dev DB has small data; production has millions of rows. Test with representative data.
**Fix:** Run `EXPLAIN ANALYZE` on production data (read replica) before optimizing.

---

## Quality Checklist

Before finishing any performance fix, verify:
- [ ] `echo=False` restored in `db/session.py` (never commit `echo=True`)
- [ ] No Python-level loops doing DB calls — all batch fetched with `IN` clause
- [ ] All relationship accesses in async context use `selectinload()` or `joinedload()`
- [ ] Pagination uses cursor (`id < before_id`) not offset
- [ ] New indexes added via Alembic migration (not just `index=True` in model)
- [ ] `EXPLAIN ANALYZE` checked — no `Seq Scan` on frequently-queried columns
- [ ] `asyncio.gather()` tested for session conflicts if used
- [ ] `with_for_update()` added for any concurrent-write paths
