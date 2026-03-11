---
name: testing_standards
description: >
  Comprehensive testing patterns for Backend (Pytest) and Frontend (Jest/Playwright) to ensure quality and reliability.
  Reference standard for SKN App. Use when needing general guidance, 
  "อ้างอิง", "ดูคู่มือ", "standard".
compatibility: SKN App Project
metadata:
  category: reference
  tags: [reference, testing-standards]
---

# Testing Standards


## Context7 Docs

Context7 MCP is active. Always attempt to use `mcp__context7__resolve-library-id` for any libraries discussed in this standard to retrieve the most up-to-date documentation.

## 1. Testing Philosophy
- **Write Tests First** (TDD) for critical business logic.
- **Aim for 80%+ Coverage** on Services and Business Logic.
- **Test Behavior, Not Implementation**: Don't test internal details.

## 2. Backend Testing (Pytest)

### 2.1 Structure
```text
backend/tests/
├── conftest.py          # Fixtures (DB, Client, Auth)
├── unit/
│   ├── test_services.py # Business logic
│   └── test_utils.py
├── integration/
│   └── test_api.py      # Full request/response cycles
└── e2e/
    └── test_user_flow.py
```

### 2.2 Async Testing Pattern
```python
import pytest
from httpx import AsyncClient
from app.main import app

@pytest.mark.asyncio
async def test_create_service_request(client: AsyncClient, auth_headers):
    response = await client.post(
        "/api/v1/requests",
        json={"category": "Justice Fund", "description": "Test"},
        headers=auth_headers
    )
    assert response.status_code == 201
    data = response.json()
    assert data["success"] is True
```

### 2.3 Database Fixtures
Use a **separate test database** with automatic cleanup.
```python
# conftest.py
@pytest.fixture
async def db_session():
    async with AsyncSessionLocal() as session:
        yield session
        await session.rollback()  # Rollback after each test
```

### 2.4 Mocking External APIs (LINE API)
```python
from unittest.mock import AsyncMock, patch

@pytest.mark.asyncio
async def test_send_line_message(service):
    with patch("app.services.line_service.line_bot_api.push_message") as mock:
        mock.return_value = AsyncMock()
        await service.send_message("U123", "Hello")
        mock.assert_called_once()
```

## 3. Frontend Testing (Next.js)

### 3.1 Unit Tests (Jest + React Testing Library)
```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { ServiceRequestForm } from '@/components/ServiceRequestForm';

test('renders form and submits data', async () => {
  const handleSubmit = jest.fn();
  render(<ServiceRequestForm onSubmit={handleSubmit} />);
  
  fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'Justice Fund' } });
  fireEvent.click(screen.getByText('Submit'));
  
  expect(handleSubmit).toHaveBeenCalled();
});
```

### 3.2 E2E Tests (Playwright)
```typescript
import { test, expect } from '@playwright/test';

test('complete booking flow', async ({ page }) => {
  await page.goto('http://localhost:3000/liff/booking');
  await page.getByLabel('Service Type').selectOption('Legal Consultation');
  await page.getByLabel('Date').fill('2026-02-01');
  await page.getByRole('button', { name: 'Confirm' }).click();
  
  await expect(page.getByText('Booking Confirmed')).toBeVisible();
});
```

## 4. Coverage Requirements
- **Critical Paths (Auth, Payment, Data Mutations)**: 90%+
- **Services/Business Logic**: 80%+
- **LIFF Pages**: 60%+ (Focus on interactions)

## 5. CI/CD Integration
Run tests automatically on every PR:
```yaml
# .github/workflows/test.yml
- run: pytest --cov=app --cov-report=xml
- run: npm test -- --coverage
```
