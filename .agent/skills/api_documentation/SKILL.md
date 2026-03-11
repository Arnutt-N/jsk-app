---
name: api_documentation
description: >
  Best practices for creating clear, interactive, and maintainable API documentation using OpenAPI/Swagger.
  Reference standard for SKN App. Use when needing general guidance, 
  "อ้างอิง", "ดูคู่มือ", "standard".
compatibility: SKN App Project
metadata:
  category: reference
  tags: [reference, api-documentation]
---

# API Documentation Standards


## Context7 Docs

Context7 MCP is active. Always attempt to use `mcp__context7__resolve-library-id` for any libraries discussed in this standard to retrieve the most up-to-date documentation.

## 1. Auto-Generated Documentation
FastAPI automatically generates OpenAPI specs from your code. Enhance this with proper annotations.

### 1.1 Route Documentation
```python
@router.post(
    "/requests",
    response_model=ResponseBase[ServiceRequestOut],
    status_code=201,
    summary="Create a new service request",
    description="Allows users to submit a service request form. Requires LINE Login authentication.",
    response_description="The created service request object with ID and status.",
    tags=["Service Requests"]
)
async def create_request(request: ServiceRequestCreate, user: User = Depends(get_current_user)):
    ...
```

### 1.2 Schema Examples
Add realistic examples to your Pydantic models:
```python
class ServiceRequestCreate(BaseModel):
    category: str
    subcategory: str | None
    description: str
    
    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "category": "Justice Fund",
                    "subcategory": "Lawyer fees",
                    "description": "Need assistance with court representation"
                }
            ]
        }
    }
```

## 2. Custom Swagger UI
Customize the default docs for branding:
```python
app = FastAPI(
    title="SknApp API",
    description="LINE OA Backend API for Community Justice Services",
    version="1.0.0",
    openapi_tags=[
        {"name": "auth", "description": "Authentication endpoints"},
        {"name": "users", "description": "User management"},
    ],
    contact={
        "name": "Support Team",
        "email": "support@example.com",
    }
)
```

## 3. Versioning Documentation
When introducing v2 API:
```python
# Separate routers
app.include_router(api_v1_router, prefix="/api/v1")
app.include_router(api_v2_router, prefix="/api/v2")

# Mark deprecated endpoints
@router.get("/old-endpoint", deprecated=True)
```

## 4. External Documentation
For complex flows (like LINE Login), link to external markdown docs:
```python
@router.post(
    "/auth/line",
    summary="Authenticate via LINE Login",
    description="See [LINE Login Flow](../docs/line-login.md) for detailed steps."
)
```

## 5. Postman/Insomnia Export
Export OpenAPI JSON for API clients:
- Access at `/api/v1/openapi.json`
- Import into Postman Collections or Insomnia
