---
name: skn-auth-security
description: >
  Security standards and actionable implementations for Authentication, Authorization (RBAC), and LINE Login integration.
  Use when asked to "add auth", "implement login", "create admin role",
  "JWT error", "implement RBAC", "เพิ่ม auth", "ทำระบบ login".
compatibility: SKN App Backend, Python 3.11+, FastAPI, python-jose, passlib
metadata:
  category: backend
  tags: [security, auth, jwt, rbac, fastapi]
---

# Authentication & RBAC Security Skill

Provides actionable steps to implement Authentication (JWT), LINE Login integration, and Role-Based Access Control (RBAC) securely in the SKN App backend.

---

## CRITICAL: Auth & Security Rules

1. **Never trust frontend claims** — Always verify LIFF ID Tokens on the backend via the LINE OAuth2 API before issuing app JWTs.
2. **Short-lived access tokens** — JWT expiry should be 15-30 minutes.
3. **Password Hashing** — Use `passlib` with `bcrypt`. Never store plain text passwords.
4. **Role checks via Dependencies** — RBAC must be implemented at the router level using FastAPI `Depends`.

---

## Context7 Docs

Context7 MCP is active. Use before writing JWT logic or verifying authentication payloads.

| Library | Resolve Name | Key Topics |
|---|---|---|
| FastAPI | `"fastapi"` | security, OAuth2PasswordBearer, Depends |
| python-jose | `"python-jose"` | JWT encode/decode, algorithms, jwk |
| passlib | `"passlib"` | CryptContext, hash, verify |

Usage: `mcp__context7__resolve-library-id libraryName="fastapi"` →
`mcp__context7__get-library-docs context7CompatibleLibraryID="..." topic="security" tokens=5000`

---

## Step 1: Implement Role Hierarchy Enforcer

File: `backend/app/api/deps.py`

```python
from fastapi import Depends, HTTPException, status
from app.models.user import User
# Assuming get_current_active_user is already implemented

class RoleChecker:
    def __init__(self, allowed_roles: list[str]):
        self.allowed_roles = allowed_roles

    def __call__(self, user: User = Depends(get_current_active_user)):
        if user.role not in self.allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, 
                detail="Not enough permissions"
            )
        return user
```

## Step 2: LINE Login Backend Verification

File: `backend/app/api/v1/endpoints/auth.py`

```python
import httpx
from fastapi import APIRouter, HTTPException, Depends
from app.core.config import settings
from app.api import deps
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter()

async def verify_line_token(id_token: str) -> dict:
    async with httpx.AsyncClient() as client:
        response = await client.post(
            "https://api.line.me/oauth2/v2.1/verify",
            data={
                "id_token": id_token,
                "client_id": settings.LINE_LOGIN_CHANNEL_ID
            }
        )
        if response.status_code != 200:
            raise HTTPException(status_code=401, detail="Invalid LINE token")
        return response.json()

@router.post("/line-login")
async def line_login(id_token: str, db: AsyncSession = Depends(deps.get_db)):
    payload = await verify_line_token(id_token)
    line_user_id = payload.get("sub")
    
    # Logic: Look up user in DB by line_user_id
    # If not exists, create.
    # Issue your own JWT access token representing this user.
    # Return JWT token.
```

## Step 3: Secure Route with RBAC

File: `backend/app/api/v1/endpoints/admin_users.py`

```python
from fastapi import APIRouter, Depends
from app.api.deps import RoleChecker

router = APIRouter()

# Only SUPER_ADMIN and ADMIN can access this endpoint
allow_admins = RoleChecker(["SUPER_ADMIN", "ADMIN"])

@router.delete("/{user_id}")
async def delete_user(user_id: int, current_user = Depends(allow_admins)):
    # Deletion logic here
    return {"status": "success"}
```

---

## Examples

### Example 1: Add a Super Admin isolated route

**User says:** "สร้าง API ที่เข้าได้เฉพาะ SUPER_ADMIN" (Create API accessible only by SUPER_ADMIN)

**Actions:**
1. Import `RoleChecker` from `app.api.deps`.
2. Define `super_admin_only = RoleChecker(["SUPER_ADMIN"])`.
3. Add `Depends(super_admin_only)` to the endpoint's parameter list.

**Result:** An endpoint that returns 403 Forbidden to any user lacking the exact `"SUPER_ADMIN"` role string in their User model.

---

## Common Issues

### Invalid Signature (PyJWT / python-jose)
**Cause:** Mismatched `SECRET_KEY` or wrong algorithm (e.g. HS256 vs RS256).
**Fix:** Validate that the environment variables match between the token generation and validation instances.

### 401 Unauthorized lacking WWW-Authenticate header
**Cause:** Raising a standard 401 without the required OAuth2 header.
**Fix:** Always include `headers={"WWW-Authenticate": "Bearer"}` in 401 exceptions when dealing with protected routes.

---

## Quality Checklist

Before finishing, verify:
- [ ] No hardcoded tokens or secrets (`settings.SECRET_KEY` used).
- [ ] PBKDF2, Argon2, or bcrypt is used for manual passwords.
- [ ] RBAC array precisely lists string matches that correspond to the Enum values used in the User schema.
