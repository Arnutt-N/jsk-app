# Performance Audit — Reference

Extracted from `backend/app/db/session.py`, the
`backend/app/services/live_chat_service/` package (split into handoff /
sessions / messaging / conversations / unread / analytics mixins in PR #137;
the `live_chat_service` import path and public API are unchanged),
`backend/app/services/analytics_service.py`, `backend/app/models/chat_session.py`,
and `backend/app/api/v1/endpoints/admin_live_chat.py`.

---

## Engine & Session Configuration

```python
# backend/app/db/session.py

engine = create_async_engine(
    str(settings.DATABASE_URL),
    echo=False,            # ← Set True to log all SQL (dev only)
    future=True,
    pool_size=5,           # Not set — uses default (5)
    max_overflow=10,       # Not set — uses default (10)
)

AsyncSessionLocal = sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False  # ✅ Already set — safe to access ORM attrs after commit
)
```

**Key defaults already correct:**
- `expire_on_commit=False` — no surprise lazy-loads after `await db.commit()`
- `future=True` — uses SQLAlchemy 2.0 engine behavior

---

## Identified Performance Hotspots

### 1. `live_chat_service.get_conversations()` — Partial N+1

**File:** `backend/app/services/live_chat_service/conversations.py` — `get_conversations()`

**Good:** Uses `row_number()` window functions for latest session and latest message per user
(no N+1 for those). Uses batch `IN` query for tags.

**Issue:** `get_unread_count()` still called per conversation in a loop:
```python
# Line ~493 — 1 Redis read + 1 DB COUNT per conversation
unread_count = await self.get_unread_count(
    line_user_id=user.line_user_id,
    admin_id=admin_id_str,
    db=db,
)
```

**Mitigation pattern:**
```python
# Batch all Redis reads using mget (requires adding mget() to RedisClient)
read_keys = [ConnectionManager.build_read_key(admin_id_str, uid) for uid in user_line_ids]
# Then use single DB query: SELECT line_user_id, COUNT(*) FROM messages
# WHERE line_user_id IN (...) AND created_at > read_at GROUP BY line_user_id
```

---

### 2. `live_chat_service.get_queue_position()` — Python-level scan

**File:** `backend/app/services/live_chat_service/handoff.py` — `get_queue_position()`

```python
# ❌ Loads all WAITING sessions into Python
result = await db.execute(stmt)
waiting_sessions = result.scalars().all()   # O(N) memory
position = next((i+1 for i, s in enumerate(waiting_sessions) ...), 0)  # O(N) scan
```

**Fix — SQL RANK:**
```python
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
```

---

### 3. `analytics_service.get_live_kpis()` — 9+ Sequential DB Queries

**File:** `backend/app/services/analytics_service.py:17`

All of these fire separately and sequentially:
1. `SELECT COUNT(*) WHERE status = 'WAITING'`
2. `SELECT COUNT(*) WHERE status = 'ACTIVE'`
3. `SELECT AVG(extract epoch ...) WHERE claimed_at > hour_ago`
4. `SELECT AVG(extract epoch ...) WHERE closed_at > today_start`
5. `SELECT AVG(score) WHERE created_at > day_ago`
6. `calculate_fcr_rate()` — 2 additional queries
7. `calculate_abandonment_rate()` — 2 additional queries
8. `calculate_sla_breach_events()` — 1 query
9. `SELECT COUNT(*) WHERE started_at > today_start`
10. `SELECT COUNT(*) WHERE chat_mode = 'HUMAN'`

**Can be parallelized with `asyncio.gather()`** — all are independent reads.

---

### 4. `webhook.py` Intent Matching — Correct selectinload Usage

**File:** `backend/app/api/v1/endpoints/webhook.py:210`

```python
# ✅ Correct — eager loads category + responses in one extra query
stmt = select(IntentKeyword).options(
    selectinload(IntentKeyword.category).selectinload(
        IntentCategory.responses.and_(IntentResponse.is_active == True)
    )
).filter(
    IntentKeyword.keyword == text,
    IntentKeyword.match_type == MatchType.EXACT
)
```

---

## SQLAlchemy 2.0 Async Query Patterns

### Basic SELECT
```python
result = await db.execute(select(Model).where(Model.field == value))
obj = result.scalar_one_or_none()   # Single row or None
objs = result.scalars().all()       # All rows as list
```

### Scalar shorthand (for aggregates)
```python
count = await db.scalar(select(func.count()).where(...))
avg = await db.scalar(select(func.avg(Model.field)).where(...))
```

### JOIN
```python
result = await db.execute(
    select(ModelA, ModelB)
    .join(ModelB, ModelB.a_id == ModelA.id)
    .where(ModelA.active == True)
)
for a, b in result.all():
    ...
```

### Relationship eager loading
```python
# selectinload — runs a second IN query (good for one-to-many)
stmt = select(Category).options(selectinload(Category.keywords))

# joinedload — JOIN in same query (good for many-to-one)
stmt = select(Keyword).options(joinedload(Keyword.category))
```

### Window functions (row_number for latest-per-group)
```python
from sqlalchemy import func, desc
from sqlalchemy.orm import aliased

subq = (
    select(
        Model,
        func.row_number().over(
            partition_by=Model.group_id,
            order_by=desc(Model.created_at)
        ).label("rn")
    ).subquery()
)
latest = aliased(Model, subq)
result = await db.execute(select(latest).where(subq.c.rn == 1))
```

### Batch IN lookup (avoid loop queries)
```python
# ✅ One query for N ids
result = await db.execute(
    select(Model).where(Model.id.in_(id_list))
)
objs_by_id = {obj.id: obj for obj in result.scalars().all()}
```

### Cursor-based pagination
```python
query = select(Model).order_by(desc(Model.id))
if before_id:
    query = query.where(Model.id < before_id)
query = query.limit(page_size + 1)

rows = (await db.execute(query)).scalars().all()
has_more = len(rows) > page_size
return rows[:page_size], has_more
```

### Upsert (INSERT ... ON CONFLICT)
```python
from sqlalchemy.dialects.postgresql import insert

stmt = insert(Model).values(**data)
stmt = stmt.on_conflict_do_update(
    index_elements=["unique_key"],
    set_={"field": stmt.excluded.field}
)
await db.execute(stmt)
await db.commit()
```

---

## Index Patterns

### Single-column index (in model)
```python
Column(String, index=True)   # Declares in model — MUST generate Alembic migration
```

### Add index in Alembic migration
```python
def upgrade():
    op.create_index("ix_table_column", "table_name", ["column_name"])

def downgrade():
    op.drop_index("ix_table_column", table_name="table_name")
```

### Composite index (covers multi-column WHERE)
```python
# Covers: WHERE line_user_id = ? ORDER BY id DESC
op.create_index(
    "ix_messages_user_id_id",
    "messages",
    ["line_user_id", "id"],
)
```

### Partial index (PostgreSQL — index subset of rows)
```python
# Index only active/waiting sessions
op.execute("""
    CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_chat_sessions_open
    ON chat_sessions (line_user_id, started_at)
    WHERE status IN ('WAITING', 'ACTIVE')
""")
```

### GIN index for JSONB search
```python
# Index JSONB column for @> containment queries
op.execute("""
    CREATE INDEX IF NOT EXISTS ix_messages_payload_gin
    ON messages USING GIN (payload)
""")
```

---

## Common Query Anti-Patterns

| Anti-Pattern | Fix |
|---|---|
| `for obj in objs: await db.get(Model, obj.fk)` | `select(Model).where(Model.id.in_(fk_ids))` |
| `obj.relationship_attr` in async (lazy load) | Add `selectinload(Model.relationship_attr)` to query |
| `.offset(N * page_size).limit(page_size)` | Cursor: `.where(id < before_id).limit(size)` |
| `result.scalars().first()` for existence check | `select(exists().where(...))` or `func.count()` |
| `echo=True` in production | Always `echo=False` in production |
| `await db.refresh(obj)` after every commit | Only needed for server-generated fields; `expire_on_commit=False` already set |
| Multiple `await db.scalar(...)` for independent counts | Wrap in `asyncio.gather()` |

---

## Diagnostic Commands

### Enable query logging (dev only)
```python
# db/session.py
echo=True
```

### EXPLAIN ANALYZE (psql)
```sql
EXPLAIN (ANALYZE, BUFFERS) SELECT ... ;
```

### Find missing indexes (pg_stat_user_tables)
```sql
SELECT
    schemaname, tablename,
    seq_scan, seq_tup_read,    -- high = needs index
    idx_scan, idx_tup_fetch    -- low relative to seq = index not used
FROM pg_stat_user_tables
WHERE schemaname = 'public'
ORDER BY seq_scan DESC;
```

### Find slow queries (pg_stat_statements)
```sql
-- Enable extension first: CREATE EXTENSION pg_stat_statements;
SELECT query, mean_exec_time, calls, total_exec_time
FROM pg_stat_statements
WHERE mean_exec_time > 50    -- ms
ORDER BY mean_exec_time DESC
LIMIT 20;
```

### Find unused indexes
```sql
SELECT indexrelname, idx_scan
FROM pg_stat_user_indexes
WHERE idx_scan = 0 AND indexrelname NOT LIKE 'pg_%'
ORDER BY indexrelname;
```

### Table size
```sql
SELECT
    relname AS table,
    pg_size_pretty(pg_total_relation_size(relid)) AS total_size
FROM pg_catalog.pg_statio_user_tables
ORDER BY pg_total_relation_size(relid) DESC;
```

---

## Key Files

| File | Performance relevance |
|---|---|
| `backend/app/db/session.py` | `echo=True/False`, engine pool settings |
| `backend/app/services/live_chat_service/` (package) | `get_conversations()` + pagination (conversations.py), `get_queue_position()` (handoff.py) |
| `backend/app/services/analytics_service.py` | `get_live_kpis()` — multiple sequential queries |
| `backend/app/api/v1/endpoints/webhook.py` | Intent matching — `selectinload` usage |
| `backend/app/models/*.py` | `index=True` declarations |
| `backend/alembic/versions/*.py` | Index creation migrations |

---

## Key Imports for Query Optimization

```python
from sqlalchemy import select, func, desc, exists, and_, text
from sqlalchemy.orm import selectinload, joinedload, aliased
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.dialects.postgresql import insert   # For upsert

import asyncio   # For asyncio.gather() parallel queries
```
