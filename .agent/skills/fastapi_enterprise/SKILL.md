---
name: fastapi_enterprise
description: >
  Best practices and standards for building enterprise-grade FastAPI applications.
  Reference standard for SKN App. Use when needing general guidance, 
  "อ้างอิง", "ดูคู่มือ", "standard".
compatibility: SKN App Project
metadata:
  category: reference
  tags: [reference, fastapi-enterprise]
---

# FastAPI Enterprise Development Standards


## Context7 Docs

Context7 MCP is active. Always attempt to use `mcp__context7__resolve-library-id` for any libraries discussed in this standard to retrieve the most up-to-date documentation.

## 1. Project Structure
Follow a modular, domain-driven structure to ensure scalability.

```text
backend/
  app/
    api/
      v1/
        endpoints/
          auth.py
          users.py
        api.py         # Router aggregation
      deps.py          # Dependency Injection (Auth, DB)
    core/
      config.py        # Pydantic Settings
      security.py      # JWT, Hashing
    db/
      base.py          # SQLAlchemy Base
      session.py       # Async Session Factory
    models/            # SQLAlchemy Models
    schemas/           # Pydantic Schemas (Request/Response)
    services/          # Business Logic Layer
    main.py            # App Entrypoint
  alembic/             # Migrations
  tests/
```

## 2. Coding Standards

### 2.1 Async by Default
- Use `async def` for all path operations and DB interactions.
- Use `await` for all I/O bound operations.

### 2.2 Strict Typing & Pydantic
- Use Pydantic V2 models for all Request Bodies and Response Models.
- **NEVER** return SQLAlchemy models directly; convert to Pydantic schemas using `model_validate` or `from_attributes=True`.

```python
# GOOD
@router.get("/users/{id}", response_model=UserResponse)
async def get_user(id: int, db: AsyncSession = Depends(get_db)):
    ...
```

### 2.3 Dependency Injection
- Use `Depends()` for Database Sessions, Current User, and Services.
- Do not instantiate Services globally; inject them.

### 2.4 Database (SQLAlchemy 2.0)
- Use `AsyncSession`.
- Use `select()`, `insert()`, `update()`, `delete()` constructs (Core expression language) instead of ORM methods where possible for clarity.
- **Always** use Alembic for schema changes.

## 3. Error Handling
- Use custom exception classes derived from `HTTPException`.
- Create a centralized exception handler in `main.py` if needed for custom formatting.

## 4. Documentation
- Add `summary` and `description` to all routes.
- Use `response_description` to clarify return values.
