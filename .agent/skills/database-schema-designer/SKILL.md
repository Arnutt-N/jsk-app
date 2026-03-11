---
name: database-schema-designer
description: >
  Design robust, scalable database schemas for SQL and NoSQL databases.
  Provides normalization guidelines, indexing strategies, migration patterns, and constraints.
  Use when asked to "design schema", "database design", "create tables", "schema for",
  "ออกแบบ database", "สร้างตาราง", "แก้ schema".
compatibility: SKN App Project, PostgreSQL 16+, SQLAlchemy 2.0
metadata:
  category: devops
  tags: [database, schema, postgresql, sqlalchemy, design]
---

# Database Schema Designer Skill

Actionable workflows for designing production-ready database schemas in the SKN App using PostgreSQL and SQLAlchemy, focusing on normalization, constraints, and index optimization.

---

## CRITICAL: Database Rules

1. **Model the Domain** — Entity names should reflect business concepts, not UI elements.
2. **Data Integrity First** — Utilize strictly defined Types, Foreign Keys, and Constraints at the DB level, rather than relying solely on application logic.
3. **Always explicit FK indexes** — PostgreSQL does NOT index Foreign Keys by default. You MUST add `index=True` explicitly in SQLAlchemy models.

---

## Context7 Docs

Context7 MCP is active. Use before writing advanced SQLAlchemy models or PostgreSQL specific syntax.

| Library | Resolve Name | Key Topics |
|---|---|---|
| PostgreSQL | `"postgresql"` | JSONB, TSVECTOR, Indices, Constraints |
| SQLAlchemy | `"sqlalchemy"` | DeclarativeBase, mapped_column, relationships |

Usage: `mcp__context7__resolve-library-id libraryName="sqlalchemy"` →
`mcp__context7__get-library-docs context7CompatibleLibraryID="..." topic="mapped_column" tokens=5000`

---

## Step 1: Normalize to 3NF

Before writing models, ensure your logical data model eliminates redundancy.
* **1NF:** Atomic values (no comma-separated lists in a column).
* **2NF:** No partial dependencies (extract nested object properties to related tables).
* **3NF:** No transitive dependencies.

## Step 2: Define the SQLAlchemy Model

Write the schema mapping using SQLAlchemy Declarative definitions.

File: `backend/app/models/[domain_entity].py`

```python
from sqlalchemy import Integer, String, DateTime, ForeignKey, Enum, CheckConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func
import enum
from app.db.base import Base

class OrderStatus(str, enum.Enum):
    PENDING = "PENDING"
    COMPLETED = "COMPLETED"

class Order(Base):
    __tablename__ = "orders"
    
    # Primary Key
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    
    # Foreign Key (Must be Indexed)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    
    # Enums and Constraints
    status: Mapped[OrderStatus] = mapped_column(
        Enum(OrderStatus), default=OrderStatus.PENDING, nullable=False, index=True
    )
    total: Mapped[float] = mapped_column(nullable=False)
    
    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    
    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="orders")
    
    __table_args__ = (
        CheckConstraint('total >= 0', name='check_total_positive'),
    )
```

## Step 3: Implement Indexing Strategies

Identify access patterns (e.g. "We filter by user and status frequently"). 
Create composite indexes if necessary.

File: `backend/app/models/[domain_entity].py`

```python
from sqlalchemy import Index

class Order(Base):
    # ... previous columns ...

# Composite index for filtering orders by a specific user with a specific status
Index('idx_user_orders_by_status', Order.user_id, Order.status)
```

## Step 4: Validate Migration Strategy

Once the schema is defined:
1. Import the model in `backend/app/db/base.py`.
2. Generate the alembic script: `alembic revision --autogenerate -m "Add Orders schema"`.
3. Check the migration file for destructive operations (`DROP TABLE`, `DROP COLUMN`) before running `alembic upgrade head`.

---

## Examples

### Example 1: Design User Authentication Schema

**User says:** "design a schema for user authentication"

**Actions:**
1. Determine entities required (e.g., `User`, `UserSession`, `Role`).
2. Construct the `User` model using `mapped_column(String(255), unique=True, index=True)` for the email.
3. Construct `Role` enums and ensure the foreign keys map correctly with `index=True`.
4. Define constraints ensuring password hashes are sufficiently long.

**Result:** A fully normalized SQLAlchemy schema ready for alembic migration.

---

## Common Issues

### Slow JOIN queries
**Cause:** Missing indexes on Foreign Key columns.
**Fix:** Always ensure `index=True` is set on every `ForeignKey` column mapped in SQLAlchemy.

### Alembic doesn't recognize enum changes
**Cause:** SQLAlchemy/Alembic struggles to track changes within Python Enums natively.
**Fix:** You must manually write the raw SQL execution to `ALTER TYPE` within the alembic migration file, or use a string column with CheckConstraints instead of native PostgreSQL enums if frequent changes are expected.

---

## Quality Checklist

Before finishing, verify:
- [ ] Every table has a primary key (`id`).
- [ ] `created_at` timestamp is present on all entities.
- [ ] Appropriate cascade parameters (`ON DELETE CASCADE` or `RESTRICT`) are applied to FKs.
- [ ] The schema is normalized up to 3NF unless explicit denormalization is required for read performance.
