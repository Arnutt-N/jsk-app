# Error Catalog

Complete reference for all error codes used across the application.

## Format Legend

| Field | Description |
|-------|-------------|
| Code | Machine-readable error identifier (UPPER_SNAKE_CASE) |
| HTTP Status | Response status code |
| Description | When to use this error |
| User Message | Default message shown to users |

---

## Validation Errors (400-422)

| Code | HTTP | Description | User Message |
|------|------|-------------|--------------|
| `VALIDATION_ERROR` | 400 | Invalid input data format | "Please check your input and try again" |
| `INVALID_JSON` | 400 | Malformed JSON in request body | "Invalid request format" |
| `MISSING_FIELD` | 400 | Required field not provided | "Please fill in all required fields" |
| `INVALID_FORMAT` | 400 | Field format incorrect (e.g., email regex) | "Invalid format for {field}" |
| `VALUE_OUT_OF_RANGE` | 400 | Numeric value outside allowed range | "Value must be between {min} and {max}" |
| `STRING_TOO_SHORT` | 400 | String length below minimum | "{field} must be at least {min} characters" |
| `STRING_TOO_LONG` | 400 | String length exceeds maximum | "{field} must be no more than {max} characters" |
| `INVALID_ENUM_VALUE` | 400 | Value not in allowed enum set | "Invalid option selected" |

### Example Scenarios

```python
# Missing required field
raise ValidationError(
    "Email is required",
    details={"field": "email", "code": "MISSING_FIELD"}
)

# Invalid format
raise ValidationError(
    "Invalid email format",
    details={"field": "email", "value": user_input[:20]}
)

# Out of range
raise ValidationError(
    "Age must be between 18 and 120",
    details={"field": "age", "min": 18, "max": 120, "provided": data.age}
)
```

---

## Authentication Errors (401)

| Code | HTTP | Description | User Message |
|------|------|-------------|--------------|
| `AUTHENTICATION_ERROR` | 401 | Generic auth failure | "Please sign in to continue" |
| `TOKEN_EXPIRED` | 401 | JWT token has expired | "Your session has expired. Please sign in again" |
| `TOKEN_INVALID` | 401 | JWT signature or format invalid | "Invalid session. Please sign in again" |
| `TOKEN_MISSING` | 401 | No Authorization header | "Authentication required" |
| `CREDENTIALS_INVALID` | 401 | Wrong email/password | "Invalid email or password" |
| `ACCOUNT_LOCKED` | 401 | Too many failed login attempts | "Account temporarily locked. Try again later" |
| `ACCOUNT_DISABLED` | 401 | User account is disabled | "Account has been disabled. Contact support" |
| `MFA_REQUIRED` | 401 | Multi-factor auth needed | "Please complete two-factor authentication" |
| `MFA_INVALID` | 401 | Wrong MFA code | "Invalid verification code" |

### Example Scenarios

```python
# Login attempt with wrong password
raise AuthenticationError("Invalid email or password")

# Expired token detected in middleware
raise AuthenticationError(
    "Token has expired",
    code="TOKEN_EXPIRED"
)

# Account locked after failed attempts
raise AuthenticationError(
    "Account locked for 30 minutes",
    code="ACCOUNT_LOCKED",
    details={"retry_after": 1800}
)
```

---

## Authorization Errors (403)

| Code | HTTP | Description | User Message |
|------|------|-------------|--------------|
| `AUTHORIZATION_ERROR` | 403 | Generic permission denied | "You don't have permission to do this" |
| `INSUFFICIENT_PERMISSIONS` | 403 | User lacks required role/permission | "This action requires elevated permissions" |
| `RESOURCE_ACCESS_DENIED` | 403 | Cannot access specific resource | "You don't have access to this resource" |
| `OWNERSHIP_REQUIRED` | 403 | Must be resource owner | "You can only modify your own resources" |
| `ADMIN_REQUIRED` | 403 | Admin role required | "This action requires administrator privileges" |
| `FEATURE_NOT_AVAILABLE` | 403 | Feature disabled for plan/tier | "This feature is not available on your plan" |
| `IP_RESTRICTED` | 403 | Request from unauthorized IP | "Access denied from this location" |
| `TIME_RESTRICTED` | 403 | Action not allowed at this time | "This action is not available at this time" |

### Example Scenarios

```python
# User tries to edit another user's profile
raise AuthorizationError(
    "You can only edit your own profile",
    code="OWNERSHIP_REQUIRED"
)

# Non-admin accessing admin endpoint
raise AuthorizationError(
    "Administrator access required",
    code="ADMIN_REQUIRED"
)

# Feature restricted by subscription tier
raise AuthorizationError(
    "API access requires Pro plan",
    code="FEATURE_NOT_AVAILABLE",
    details={"required_tier": "pro", "current_tier": "free"}
)
```

---

## Not Found Errors (404)

| Code | HTTP | Description | User Message |
|------|------|-------------|--------------|
| `NOT_FOUND` | 404 | Generic resource not found | "{resource} not found" |
| `USER_NOT_FOUND` | 404 | User ID/email doesn't exist | "User not found" |
| `RESOURCE_NOT_FOUND` | 404 | Generic entity not found | "Resource not found" |
| `ENDPOINT_NOT_FOUND` | 404 | API route doesn't exist | "Endpoint not found" |
| `FILE_NOT_FOUND` | 404 | Uploaded file missing | "File not found" |
| `RELATION_NOT_FOUND` | 404 | Related resource missing | "Associated resource not found" |

### Example Scenarios

```python
# User lookup by ID
raise NotFoundError("User")
# Response: {"message": "User not found", "code": "NOT_FOUND"}

# Specific resource type
raise NotFoundError("Project")
# Response: {"message": "Project not found", "code": "NOT_FOUND"}

# With additional context (for logging)
raise NotFoundError(
    "Invoice",
    details={"invoice_id": invoice_id, "user_id": user.id}
)
```

---

## Conflict Errors (409)

| Code | HTTP | Description | User Message |
|------|------|-------------|--------------|
| `CONFLICT` | 409 | Generic resource conflict | "Resource conflict detected" |
| `DUPLICATE_ENTRY` | 409 | Unique constraint violation | "This {resource} already exists" |
| `EMAIL_EXISTS` | 409 | Email already registered | "An account with this email already exists" |
| `USERNAME_TAKEN` | 409 | Username not available | "This username is already taken" |
| `CONCURRENT_MODIFICATION` | 409 | Resource modified by another request | "Resource was modified. Please refresh and try again" |
| `ALREADY_EXISTS` | 409 | Resource already exists | "{resource} already exists" |
| `STILL_IN_USE` | 409 | Cannot delete resource in use | "Cannot delete {resource} while in use" |

### Example Scenarios

```python
# Duplicate email registration
raise ConflictError("An account with this email already exists")

# Concurrent edit detection
raise ConflictError(
    "Resource was modified by another user",
    code="CONCURRENT_MODIFICATION",
    details={
        "last_modified": resource.updated_at,
        "your_version": client_timestamp
    }
)

# Cannot delete team with members
raise ConflictError(
    "Cannot delete team with active members",
    code="STILL_IN_USE",
    details={"active_members": member_count}
)
```

---

## Rate Limit Errors (429)

| Code | HTTP | Description | User Message |
|------|------|-------------|--------------|
| `RATE_LIMIT` | 429 | Generic rate limit exceeded | "Too many requests. Please wait" |
| `RATE_LIMIT_IP` | 429 | IP-based rate limiting | "Too many requests from this location" |
| `RATE_LIMIT_USER` | 429 | Per-user rate limiting | "Rate limit exceeded for your account" |
| `RATE_LIMIT_ENDPOINT` | 429 | Per-endpoint rate limiting | "Too many requests to this endpoint" |
| `QUOTA_EXCEEDED` | 429 | Monthly/daily quota exceeded | "API quota exceeded. Upgrade your plan" |

### Example Scenarios

```python
# Standard rate limiting
raise RateLimitError(retry_after=60)
# Response includes: Retry-After: 60 header

# Quota exceeded (different from burst rate limit)
raise RateLimitError(
    code="QUOTA_EXCEEDED",
    details={
        "quota_type": "monthly_requests",
        "limit": 10000,
        "used": 10000,
        "resets_at": "2024-02-01T00:00:00Z"
    }
)
```

---

## External Service Errors (502, 503, 504)

| Code | HTTP | Description | User Message |
|------|------|-------------|--------------|
| `EXTERNAL_SERVICE_ERROR` | 503 | Generic external failure | "Service temporarily unavailable" |
| `DATABASE_ERROR` | 503 | Database connection issue | "Database temporarily unavailable" |
| `CACHE_ERROR` | 503 | Redis/cache service down | "Cache service error" |
| `PAYMENT_SERVICE_ERROR` | 503 | Payment processor failure | "Payment service temporarily unavailable" |
| `EMAIL_SERVICE_ERROR` | 503 | Email provider failure | "Email service temporarily unavailable" |
| `STORAGE_SERVICE_ERROR` | 503 | S3/blob storage failure | "File storage temporarily unavailable" |
| `THIRD_PARTY_TIMEOUT` | 504 | External API timeout | "External service timed out" |
| `THIRD_PARTY_ERROR` | 502 | External API error response | "Error from external service" |

### Example Scenarios

```python
# Database connection pool exhausted
raise ExternalServiceError(
    "Database",
    code="DATABASE_ERROR"
)

# Stripe payment failure
raise ExternalServiceError(
    "Payment processor",
    code="PAYMENT_SERVICE_ERROR",
    details={"provider": "stripe", "error_type": "card_error"}
)

# S3 upload failure
raise ExternalServiceError(
    "File storage",
    code="STORAGE_SERVICE_ERROR",
    details={"provider": "s3", "bucket": "uploads", "operation": "put_object"}
)
```

---

## Internal Server Errors (500)

| Code | HTTP | Description | User Message |
|------|------|-------------|--------------|
| `INTERNAL_ERROR` | 500 | Generic server error | "An unexpected error occurred. Please try again later" |
| `CONFIGURATION_ERROR` | 500 | Missing/invalid server config | "Server configuration error" |
| `UNEXPECTED_ERROR` | 500 | Catch-all for unhandled exceptions | "Something went wrong. Please try again" |
| `NOT_IMPLEMENTED` | 501 | Feature not yet implemented | "This feature is not yet available" |

### Important Notes

Internal errors should **never** expose implementation details to clients:

```python
# ❌ BAD - Leaks SQL details
return JSONResponse(
    status_code=500,
    content={"error": str(exception)}  # May contain SQL/stack traces
)

# ✅ GOOD - Generic message, detailed logging
logger.exception("Database query failed: %s", exc)
return JSONResponse(
    status_code=500,
    content={
        "success": False,
        "code": "INTERNAL_ERROR",
        "message": "An unexpected error occurred. Please try again later."
    }
)
```

---

## Frontend Error Mapping

Map error codes to user-facing messages and actions:

```typescript
// frontend/lib/errorMessages.ts
export const errorMessages: Record<string, { message: string; action?: string }> = {
  VALIDATION_ERROR: {
    message: "Please check your input",
    action: "review_form"
  },
  AUTHENTICATION_ERROR: {
    message: "Please sign in",
    action: "redirect_login"
  },
  AUTHORIZATION_ERROR: {
    message: "Access denied",
    action: "show_403"
  },
  NOT_FOUND: {
    message: "Resource not found",
    action: "show_404"
  },
  CONFLICT: {
    message: "This already exists",
    action: "refresh_data"
  },
  RATE_LIMIT: {
    message: "Too many requests",
    action: "show_retry_timer"
  },
  EXTERNAL_SERVICE_ERROR: {
    message: "Service temporarily unavailable",
    action: "auto_retry"
  },
  INTERNAL_ERROR: {
    message: "Something went wrong",
    action: "show_retry_button"
  }
};
```

---

## Adding New Error Codes

When adding new error codes:

1. **Use descriptive names**: `PAYMENT_FAILED` not `ERROR_42`
2. **Follow HTTP semantics**: Don't return 500 for client errors
3. **Include helpful details**: Context aids debugging
4. **Update this catalog**: Document the new code immediately
5. **Generate boilerplate**: Use the code generator script:
   ```bash
   python scripts/generate_error_types.py --name PaymentFailed --code PAYMENT_FAILED --status 402
   ```
