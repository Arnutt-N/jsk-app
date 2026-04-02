---
name: security-checklist
description: >
  Comprehensive security standards covering OWASP Top 10, rate limiting, input validation, and secrets management.
  Use when asked to "secure the app", "implement rate limit", "add CORS",
  "security audit", "prevent sql injection", "เพิ่ม security", "limit request".
compatibility: SKN App Backend, Python 3.11+, FastAPI, Pydantic v2, Redis
metadata:
  category: backend
  tags: [security, owasp, fastapi, rate-limit, cors]
---

# Security Checklist Skill

Actionable security workflows and implementations for safeguarding the SKN App backend, protecting against OWASP Top 10 vulnerabilities, brute force, and data exposure.

---

## CRITICAL: Security Rules

1. **Never trust user input** — Every incoming payload must be validated via strict Pydantic v2 schemas.
2. **Never build raw SQL** — Always use SQLAlchemy parameterized operations to prevent SQL Injection.
3. **Never hardcode secrets** — Use `pydantic-settings` to load secrets securely from `.env`.
4. **HTTPS only** — In production, never transmit authentications over HTTP.

---

## Context7 Docs

Context7 MCP is active. Use before writing FastAPI security middleware or Pydantic custom validators.

| Library | Resolve Name | Key Topics |
|---|---|---|
| FastAPI | `"fastapi"` | CORSMiddleware, Request, exception_handler |
| Pydantic | `"pydantic"` | field_validator, StringConstraints, SecretStr |
| Redis | `"redis"` | fastapi-limiter integration, async connection |

Usage: `mcp__context7__resolve-library-id libraryName="fastapi"` →
`mcp__context7__get-library-docs context7CompatibleLibraryID="..." topic="CORSMiddleware" tokens=5000`

---

## Step 1: Implement Input Validation & Sanitization

Use Pydantic v2 constraints to defend against injection and malformed data payloads.

File: `backend/app/schemas/[resource].py`

```python
from pydantic import BaseModel, Field, field_validator
import re

class SecureInputPayload(BaseModel):
    # Enforce strict length limits to prevent buffer overflow/dos
    description: str = Field(..., min_length=10, max_length=500)
    phone_number: str = Field(..., max_length=15)
    
    @field_validator('phone_number')
    def validate_phone(cls, v):
        # Allow only domestic phone format strictly
        if not re.match(r'^\d{10}$', v):
            raise ValueError('Invalid phone number format')
        return v
```

## Step 2: Implement Rate Limiting

Protect sensitive endpoints (e.g., login, password reset) from brute force attacks using Redis.

File: `backend/app/api/v1/endpoints/auth.py`

```python
from fastapi import APIRouter, Depends
from fastapi_limiter.depends import RateLimiter

router = APIRouter()

# Limit to 5 requests per 60 seconds per IP
@router.post("/login", dependencies=[Depends(RateLimiter(times=5, seconds=60))])
async def login(credentials: LoginSchema):
    # Logic to process login
    return {"status": "success"}
```

## Step 3: Configure strict CORS and Security Headers

Enforce rigid boundaries for cross-origin requests.

File: `backend/app/main.py`

```python
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

# 1. Strict origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://admin.sknapp.com"],  # Specific domains, NEVER "*"
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["*"],
)

# 2. Add security headers to every response
@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY" # Except for LIFF if needed
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response
```

---

## Examples

### Example 1: Securing a new endpoint

**User says:** "เพิ่ม API อัปเดตข้อมูลส่วนตัวให้ปลอดภัย" (Add a secure API to update personal data)

**Actions:**
1. Create a `UserUpdate` Pydantic model with strict `Field(max_length=...)` bounds.
2. Ensure the router utilizes `Depends(get_current_user)` to guarantee authorization.
3. Validate ownership inside the router, confirming `current_user.id == target_user_id` unless role is ADMIN.

**Result:** An endpoint impervious to Mass Assignment, Insecure Direct Object Reference (IDOR), and NoSQL/SQL injections.

---

## Common Issues

### CORS Error on Frontend
**Cause:** Attempting to access the API from a local dev server (e.g., `localhost:3000`) while it only permits production domains.
**Fix:** In development environments (`settings.ENVIRONMENT == "development"`), conditionally append `http://localhost:3000` to the `allow_origins` array.

### Redis Rate Limiting Connection Failure
**Cause:** `FastAPILimiter` was not initialized during application startup.
**Fix:** Ensure `await FastAPILimiter.init(redis_pool)` is called within the FastAPI lifespan context manager or generic startup event.

---

## Quality Checklist

Before finishing, verify:
- [ ] No `*` is used in CORS `allow_origins` for production deployments.
- [ ] No user-provided input is string concatinated into database queries.
- [ ] Sensitive settings like keys and passwords use Pydantic `SecretStr`.
