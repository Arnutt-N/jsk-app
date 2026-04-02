---
name: enterprise_architecture_standards
description: >
  High-level architectural patterns and best practices for large-scale FastAPI and Next.js applications, synthesized from industry leaders.
  Reference standard for SKN App. Use when needing general guidance, 
  "อ้างอิง", "ดูคู่มือ", "standard".
compatibility: SKN App Project
metadata:
  category: reference
  tags: [reference, enterprise-architecture-standards]
---

# Enterprise Architecture Standards


## Context7 Docs

Context7 MCP is active. Always attempt to use `mcp__context7__resolve-library-id` for any libraries discussed in this standard to retrieve the most up-to-date documentation.

## 1. Backend (FastAPI) Engineering Standards

### 1.1 Domain-Driven Design (DDD)
Organize code by **Domain/Feature** instead of layer types to improve maintainability and reduce context switching.
- **Each Domain contains**: `router.py`, `schemas.py`, `models.py`, `service.py`, `dependencies.py`.
- **Infrastructure**: Shared logic (database, security, config) stays in a global `core/` or `shared/` package.

### 1.2 Resource-Based Dependencies
Perform common resource lookups (e.g., checking if an ID exists) in FastAPI dependencies to keep routers clean and DRY.
- Chain dependencies for hierarchical validation (e.g., `valid_owned_item` depends on `valid_item_id`).

### 1.3 Asynchronous Execution Strategy
- **I/O Bound**: Use `async def` and `await`.
- **Legacy Sync I/O**: Use standard `def`; let FastAPI handle the threadpool.
- **CPU Bound**: Offload to Background Tasks (simple) or distributed queues like Celery (complex).

### 1.4 Persistent Schema Standards
- Use **SQL-First** for complex data manipulation; leverage JSON aggregation in Postgres to return pre-formed data.
- Enforce strict Pydantic naming and data types (e.g., `ISO 8601` with timezone).
- Raise `ValueError` in Pydantic validators to automatically return `422 Unprocessable Entity` to clients.

## 2. Visual Design & UI Standards (Glassmorphism 7.0.0)

### 2.1 Design Philosophy
Implement a **Modern Enterprise "Glassmorphism"** aesthetic:
- **Surfaces**: Pure White (`#FFFFFF`) on Ultra-Light Gray (`#F8F8F9`) backgrounds.
- **Radii**: 6px (Atomic), 10px (Cards), 12px (Containers).
- **Depth**: Shadow-based elevation (Levels 1-4).

### 2.2 Color Palette (Semantic Tokens)
| Semantic | Hex Code | Tonal BG (12%) |
| :--- | :--- | :--- |
| **Primary** | `#7367F0` | `rgba(115, 103, 240, 0.12)` |
| **Success** | `#28C76F` | `rgba(40, 199, 111, 0.12)` |
| **Danger** | `#EA5455` | `rgba(234, 84, 85, 0.12)` |
| **Warning** | `#FF9F43` | `rgba(255, 159, 67, 0.12)` |
| **Info** | `#00CFE8` | `rgba(0, 207, 232, 0.12)` |

### 2.3 Typography & Components
- **Fonts**: Primary: `Noto Sans Thai`, Secondary: `Inter`.
- **Modals**: Backdrop blur (2px) with Scale/Fade-In animations.
- **Cards**: Use `--shadow-md` (0 4px 18px 0 rgba(34, 41, 47, 0.1)) for standard containers.

## 3. Frontend (Next.js) Engineering

### 1.1 Rendering Policy
- **Server-First**: Keep components as Server Components by default.
- **Granular Client Hydration**: Use `'use client';` only at the leaf nodes or where interactivity is strictly required.

### 1.2 Data Fetching & Waterfalls
- **Parallel Fetching**: Use `Promise.all()` for independent data fetches.
- **Streaming**: Utilize `Suspense` for heavy components to improve TTI (Time to Interactive).

### 1.3 UI/UX Best Practices
- **Accessibility (A11y)**: Must include `aria-labels`, semantic HTML tags, and keyboard navigation support.
- **Micro-animations**: Use compositor-friendly CSS properties (`transform`, `opacity`) to ensure 60fps animations.
- **Form UX**: Implement `autocomplete` attributes and clear inline validation feedback.

## 3. Deployment & Scalability
- **Static Assets**: Offload to CDN or S3-compatible storage.
- **Environment Parity**: Ensure `.env` structure is identical across Local, Staging, and Production.
- **Database Migrations**: Alembic migrations must be descriptive and versioned with timestamps for easy rollback.
