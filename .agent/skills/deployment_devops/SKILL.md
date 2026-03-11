---
name: deployment-devops
description: >
  Docker, CI/CD, and deployment strategies for production-ready FastAPI and Next.js applications.
  Use when asked to "setup docker", "create github actions", "deploy app",
  "add healthcheck", "release to production", "deploy ขึ้น server".
compatibility: SKN App, Docker Compose, GitHub Actions, PostgreSQL, Redis
metadata:
  category: devops
  tags: [docker, ci-cd, deployment, github-actions, fastapi, nextjs]
---

# Deployment & DevOps Skill

Actionable instructions for containerizing the SKN App using Docker, orchestrating local development with Docker Compose, and deploying configurations via CI/CD pipelines.

---

## CRITICAL: DevOps & Deployment Rules

1. **Multi-stage Dockerfiles** — Production Dockerfiles must always use multi-stage builds to minimize image size and strip out build dependencies.
2. **Never commit `.env` files** — Rely strictly on CI runner secrets and deployment environment variables for production.
3. **Database health checks** — Ensure backend container waits for the database container to become healthy before startup.

---

## Context7 Docs

Context7 MCP is active. Use before writing GitHub Action YAMLs or Docker configurations to ensure syntax matches the latest specifications.

| Library | Resolve Name | Key Topics |
|---|---|---|
| Docker | `"docker"` | Compose v2, multi-stage builds, healthchecks |
| GitHub Actions | `"github-actions"` | workflows, jobs, secrets |
| FastAPI | `"fastapi"` | uvicorn deployment, standard lifespan |

Usage: `mcp__context7__resolve-library-id libraryName="docker"` →
`mcp__context7__get-library-docs context7CompatibleLibraryID="..." topic="Compose v2" tokens=5000`

---

## Step 1: Create Production FastAPI Dockerfile

File: `backend/Dockerfile`

```dockerfile
# Build stage
FROM python:3.11-slim as builder
WORKDIR /app
# Install build dependencies if needed (e.g., build-essential, libpq-dev)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Production stage
FROM python:3.11-slim
WORKDIR /app
# Copy installed packages from builder
COPY --from=builder /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin
# Copy application code
COPY . .

# Expose port and run server
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

## Step 2: Implement Application Healthcheck

File: `backend/app/api/v1/endpoints/health.py`

```python
from fastapi import APIRouter
from datetime import datetime

router = APIRouter()

@router.get("")
async def health_check():
    return {
        "status": "ok", 
        "service": "skn-backend",
        "timestamp": datetime.utcnow().isoformat()
    }
```
*Ensure this router is mounted in `api.py` without auth dependencies.*

## Step 3: Configure CI/CD Pipeline

File: `.github/workflows/deploy.yml`

```yaml
name: CI/CD Pipeline

on:
  push:
    branches: [main, develop]

jobs:
  test-backend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Setup Python
        uses: actions/setup-python@v4
        with:
          python-version: '3.11'
      - name: Install dependencies
        run: |
          cd backend
          pip install -r requirements.txt
          pip install pytest pytest-asyncio
      - name: Run Pytest
        env:
          DATABASE_URL: sqlite+aiosqlite:///:memory:
        run: |
          cd backend
          pytest

  test-frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'
      - name: Build Next.js
        run: |
          cd frontend
          npm ci
          npm run build
```

---

## Examples

### Example 1: Add a Health Check

**User says:** "เพิ่ม healthcheck ป้องกัน load balancer error" (Add healthcheck to prevent load balancer error)

**Actions:**
1. Generate the `/health` endpoint as shown in Step 2.
2. Ensure it returns an HTTP 200 standard JSON response.
3. Hook into `backend/app/api/v1/api.py`.

**Result:** A routable endpoint that deployment tools (AWS Target Groups, Docker Compose Healthchecks) can safely ping.

---

## Common Issues

### Frontend Container exits immediately
**Cause:** Attempting to `npm start` without running `npm run build` in the production multi-stage Dockerfile.
**Fix:** Validate that the Next.js builder stage successfully executes `npm run build` before the second stage copies the `.next` folder.

### PostgreSQL Connection Refused on docker-compose up
**Cause:** The backend starts faster than PostgreSQL can allocate resources.
**Fix:** Add a `healthcheck` block to the `db` service in `docker-compose.yml`, and mark the backend `depends_on: db: condition: service_healthy`.

---

## Quality Checklist

Before finishing, verify:
- [ ] No `.env` files are accidentally copied in Dockerfiles (check `.dockerignore`).
- [ ] `uvicorn` binds to `0.0.0.0` inside Docker, not `127.0.0.1`.
- [ ] Multi-stage builds correctly map the `site-packages` location depending on the base image.
