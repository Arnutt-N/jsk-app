---
name: api_development_standard
description: >
  Enterprise-grade standards for building scalable, maintainable, and secure APIs using FastAPI.
  Reference standard for SKN App. Use when needing general guidance, 
  "อ้างอิง", "ดูคู่มือ", "standard".
compatibility: SKN App Project
metadata:
  category: reference
  tags: [reference, api-development-standard]
---

# API Development Standard (FastAPI)


## Context7 Docs

Context7 MCP is active. Always attempt to use `mcp__context7__resolve-library-id` for any libraries discussed in this standard to retrieve the most up-to-date documentation.

## 1. Philosophy & Architecture
We follow a **Domain-Driven Design (DDD)** inspired layered architecture. The goal is to decouple business logic from the HTTP transport layer and the database layer.

### 1.1 Layered Architecture
```text
backend/app/
├── api/                  # Interface Layer (Routes/Controllers)
│   ├── v1/
│   │   ├── endpoints/    # Route definitions
│   │   └── api.py        # Router aggregation
│   └── deps.py           # Dependency Injection
├── core/                 # Infrastructure Layer (Config, Security)
│   ├── config.py
│   └── security.py
├── db/                   # Persistence Layer
│   ├── base.py
│   └── session.py
├── models/               # Database Entities (SQLAlchemy)
├── schemas/              # Data Transfer Objects (Pydantic)
├── services/             # Application/Business Logic Layer
│   └── service_request_service.py
└── main.py               # Application Entrypoint
```

## 2. Configuration & Environment
- Use **Pydantic Settings** (`BaseSettings`).
- **NEVER** hardcode secrets. Use `.env` files.
- Group settings by domain (e.g., `db`, `jwt`, `line`).

```python
# core/config.py
class Settings(BaseSettings):
    PROJECT_NAME: str = "SknApp"
    API_V1_STR: str = "/api/v1"
    DATABASE_URL: PostgresDsn
    
    # JWT
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    
    # LINE
    LINE_CHANNEL_SECRET: str
    LINE_CHANNEL_ACCESS_TOKEN: str

    model_config = SettingsConfigDict(env_file=".env")
```

## 3. API Response Standard
All API endpoints MUST return a standardized envelope. This ensures the frontend always knows how to parse responses.

### 3.1 Generic Response Wrapper
```python
# schemas/response.py
from typing import Generic, TypeVar, Optional
from pydantic import BaseModel

T = TypeVar("T")

class ResponseBase(BaseModel, Generic[T]):
    success: bool
    message: str
    data: Optional[T] = None
    meta: Optional[dict] = None  # For pagination etc.
```

### 3.2 Usage in Endpoints
```python
@router.get("/users/{id}", response_model=ResponseBase[UserOut])
async def get_user(id: int, service: UserService = Depends(get_user_service)):
    user = await service.get_user(id)
    return ResponseBase(success=True, message="User found", data=user)
```

## 4. Error Handling
- **Centralized Exception Handling**: Do not let 500 server errors leak stack traces to the client.
- Use Custom Exceptions that map to HTTP Status Codes.

```python
# core/exceptions.py
class AppError(Exception):
    def __init__(self, message: str, code: str, status_code: int = 400):
        self.message = message
        self.code = code
        self.status_code = status_code

# main.py
@app.exception_handler(AppError)
async def app_error_handler(request: Request, exc: AppError):
    return JSONResponse(
        status_code=exc.status_code,
        content={"success": False, "message": exc.message, "code": exc.code}
    )
```

## 5. Database Interaction (Async SQLAlchemy 2.0)
- **Async Only**: Use `AsyncSession`.
- **Repository Pattern (Optional)**: For simple CRUD, use the Service layer directly. For complex queries, use Repositories.
- **Transactions**: Ensure atomic operations using `async with session.begin():`.

```python
# services/user_service.py
async def create_user(self, user_in: UserCreate) -> User:
    try:
        user = User(**user_in.model_dump())
        self.session.add(user)
        await self.session.commit()
        await self.session.refresh(user)
        return user
    except IntegrityError:
        await self.session.rollback()
        raise DuplicateError("User already exists")
```

## 6. Pagination & Filtering
- Use `limit` and `offset` (or `page` and `page_size`) query parameters globally.
- Return `meta` information with total count and current page.

```python
# schemas/common.py
class PaginationParams(BaseModel):
    page: int = 1
    page_size: int = 20
    
    @property
    def offset(self):
        return (self.page - 1) * self.page_size
```

## 7. Testing
- Use **Pytest** and **AsyncClient** (httpx).
- Use `conftest.py` to manage DB fixtures and override dependencies.
- **Coverage**: Aim for 80%+ coverage on Business Logic (Services).

## 8. Documentation
- **Docstrings**: Google Style Python Docstrings for all Services and Complex Helpers.
- **OpenAPI**: Add `summary`, `description`, and `response_description` to all routes.
- **Tags**: Organize routes by Controller/Resource.
