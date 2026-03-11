---
name: error_handling
description: >
  Centralized error handling patterns for FastAPI backend and Next.js frontend.
  Reference standard for SKN App. Use when needing general guidance, 
  "อ้างอิง", "ดูคู่มือ", "standard".
compatibility: SKN App Project
metadata:
  category: reference
  tags: [reference, error-handling]
---

# Error Handling Patterns


## Context7 Docs

Context7 MCP is active. Always attempt to use `mcp__context7__resolve-library-id` for any libraries discussed in this standard to retrieve the most up-to-date documentation.

## Philosophy

- **Fail Fast**: Catch errors at the earliest possible point
- **Meaningful Messages**: Users get actionable error messages; developers get detailed logs
- **Don't Leak Internals**: Never expose stack traces or system details to clients

## Backend Error Hierarchy

```python
# backend/app/core/exceptions.py
from typing import Optional, Dict, Any

class AppError(Exception):
    """Base application error."""
    def __init__(
        self, message: str, code: str, status_code: int = 500,
        details: Optional[Dict[str, Any]] = None
    ):
        self.message = message
        self.code = code
        self.status_code = status_code
        self.details = details or {}
        super().__init__(message)

class ValidationError(AppError):
    """400 - Invalid input data."""
    def __init__(self, message: str = "Validation failed", details: Optional[Dict] = None):
        super().__init__(message, "VALIDATION_ERROR", 400, details)

class AuthenticationError(AppError):
    """401 - Not authenticated."""
    def __init__(self, message: str = "Authentication required"):
        super().__init__(message, "AUTHENTICATION_ERROR", 401)

class AuthorizationError(AppError):
    """403 - Not authorized."""
    def __init__(self, message: str = "Permission denied"):
        super().__init__(message, "AUTHORIZATION_ERROR", 403)

class NotFoundError(AppError):
    """404 - Resource not found."""
    def __init__(self, resource: str = "Resource"):
        super().__init__(f"{resource} not found", "NOT_FOUND", 404)

class ConflictError(AppError):
    """409 - Resource conflict."""
    def __init__(self, message: str = "Resource already exists"):
        super().__init__(message, "CONFLICT", 409)

class RateLimitError(AppError):
    """429 - Too many requests."""
    def __init__(self, retry_after: Optional[int] = None):
        details = {"retry_after": retry_after} if retry_after else {}
        super().__init__("Rate limit exceeded", "RATE_LIMIT", 429, details)

class ExternalServiceError(AppError):
    """503 - External service failure."""
    def __init__(self, service: str = "External service"):
        super().__init__(f"{service} unavailable", "EXTERNAL_SERVICE_ERROR", 503)
```

## FastAPI Exception Handlers

```python
# backend/app/main.py
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from app.core.exceptions import AppError

app = FastAPI()

@app.exception_handler(AppError)
async def app_error_handler(request: Request, exc: AppError):
    return JSONResponse(
        status_code=exc.status_code,
        content={"success": False, "code": exc.code, "message": exc.message, "details": exc.details}
    )

@app.exception_handler(RequestValidationError)
async def validation_error_handler(request: Request, exc: RequestValidationError):
    field_errors = {".".join(str(x) for x in e["loc"] if x != "body"): e["msg"] for e in exc.errors()}
    return JSONResponse(
        status_code=422,
        content={"success": False, "code": "VALIDATION_ERROR", "message": "Validation failed", 
                 "details": {"fields": field_errors}}
    )

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    import logging
    logging.getLogger(__name__).exception("Unhandled exception")
    return JSONResponse(
        status_code=500,
        content={"success": False, "code": "INTERNAL_ERROR", 
                 "message": "An unexpected error occurred. Please try again later."}
    )
```

## Error Response Format

```json
{
  "success": false,
  "code": "ERROR_CODE",
  "message": "Human-readable message",
  "details": {}
}
```

**Validation Error Example:**
```json
{
  "success": false,
  "code": "VALIDATION_ERROR",
  "message": "Validation failed",
  "details": {
    "fields": {
      "email": "Invalid email format",
      "password": "Minimum 8 characters required"
    }
  }
}
```

## Frontend Error Handling

### API Types

```typescript
// frontend/types/api.ts
export interface ApiError {
  success: false;
  code: string;
  message: string;
  details?: Record<string, unknown>;
}
```

### Axios Interceptor

```typescript
// frontend/lib/api.ts
import axios, { AxiosError } from 'axios';
import { ApiError } from '@/types/api';

const api = axios.create({ baseURL: process.env.NEXT_PUBLIC_API_URL });

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError<ApiError>) => {
    const apiError = error.response?.data;
    if (!apiError) throw new Error('Network error');
    
    if (apiError.code === 'AUTHENTICATION_ERROR') {
      window.location.href = '/login';
    } else if (apiError.code === 'AUTHORIZATION_ERROR') {
      window.location.href = '/403';
    }
    throw apiError;
  }
);
```

### Error Hook

```typescript
// frontend/hooks/useApiError.ts
import { useCallback } from 'react';
import { toast } from 'sonner';
import { ApiError } from '@/types/api';

export function useApiError() {
  return useCallback((error: ApiError | Error) => {
    if ('code' in error) {
      switch (error.code) {
        case 'VALIDATION_ERROR': break; // Handled by form
        case 'RATE_LIMIT': toast.error('Too many requests. Please wait.'); break;
        default: toast.error(error.message);
      }
    } else {
      toast.error('Network error. Check your connection.');
    }
  }, []);
}
```

### Form Error Handler

```typescript
// frontend/hooks/useFormErrors.ts
import { useState, useCallback } from 'react';
import { ApiError } from '@/types/api';

export function useFormErrors<T extends Record<string, unknown>>() {
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const handleError = useCallback((error: ApiError) => {
    if (error.code === 'VALIDATION_ERROR' && error.details?.fields) {
      setFieldErrors(error.details.fields as Record<string, string>);
      setFormError(null);
    } else {
      setFormError(error.message);
      setFieldErrors({});
    }
  }, []);

  const clearErrors = useCallback(() => {
    setFieldErrors({});
    setFormError(null);
  }, []);

  return { fieldErrors, formError, handleError, clearErrors };
}
```

## Error Boundary

```typescript
// frontend/components/ErrorBoundary.tsx
'use client';
import { Component, ErrorInfo, ReactNode } from 'react';

interface Props { children: ReactNode; fallback?: ReactNode; }
interface State { hasError: boolean; }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };
  static getDerivedStateFromError(): State { return { hasError: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error(error, info); }
  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="p-8 text-center">
          <h2 className="text-xl font-semibold text-red-600">Something went wrong</h2>
          <button onClick={() => this.setState({ hasError: false })}
                  className="mt-4 px-4 py-2 bg-blue-600 text-white rounded">Try again</button>
        </div>
      );
    }
    return this.props.children;
  }
}
```

## Usage Example

```python
# backend/app/services/user_service.py
from app.core.exceptions import NotFoundError, ConflictError, ValidationError

class UserService:
    async def get_user(self, user_id: int) -> User:
        user = await self.db.get(User, user_id)
        if not user:
            raise NotFoundError("User")
        return user
    
    async def create_user(self, data: UserCreate) -> User:
        existing = await self.db.execute(select(User).where(User.email == data.email))
        if existing.scalar_one_or_none():
            raise ConflictError("User with this email already exists")
        if data.age < 18:
            raise ValidationError("User must be 18 or older", details={"field": "age"})
```

## Resources

- **Error Catalog**: See [references/error_catalog.md](references/error_catalog.md) for complete error code listing, HTTP status mappings, and usage scenarios
- **Code Generator**: Use [scripts/generate_error_types.py](scripts/generate_error_types.py) to scaffold new error types:
  ```bash
  python scripts/generate_error_types.py --name PaymentFailed --code PAYMENT_FAILED --status 402
  ```

## Checklist

- [ ] Custom exception classes defined for domain errors
- [ ] Global exception handlers registered in FastAPI
- [ ] Validation errors return field-level details
- [ ] 401 redirects to login page in frontend
- [ ] 403 shows permission denied page
- [ ] Network errors show user-friendly message
- [ ] No stack traces exposed to clients
- [ ] Error boundaries wrap page components
