---
name: monitoring_logging
description: >
  Standards for observability, structured logging, error tracking, and performance monitoring.
  Reference standard for SKN App. Use when needing general guidance, 
  "อ้างอิง", "ดูคู่มือ", "standard".
compatibility: SKN App Project
metadata:
  category: reference
  tags: [reference, monitoring-logging]
---

# Monitoring & Logging Standards


## Context7 Docs

Context7 MCP is active. Always attempt to use `mcp__context7__resolve-library-id` for any libraries discussed in this standard to retrieve the most up-to-date documentation.

## 1. Structured Logging (JSON Format)

### 1.1 Backend (Python structlog)
```python
import structlog

logger = structlog.get_logger()

@app.middleware("http")
async def logging_middleware(request: Request, call_next):
    logger.info(
        "request_started",
        method=request.method,
        path=request.url.path,
        client_ip=request.client.host
    )
    response = await call_next(request)
    logger.info(
        "request_completed",
        status_code=response.status_code,
        duration_ms=...
    )
    return response
```

### 1.2 Log Levels
- **DEBUG**: Development only
- **INFO**: Normal operations (User login, Request created)
- **WARNING**: Unexpected but handled (Retry attempt, Rate limit approaching)
- **ERROR**: Exceptions and failures (DB connection lost, External API timeout)
- **CRITICAL**: System-level failures

## 2. Request Tracing (Correlation IDs)
Add a unique ID to each request to trace it across services:
```python
@app.middleware("http")
async def correlation_id_middleware(request: Request, call_next):
    correlation_id = request.headers.get("X-Correlation-ID", str(uuid.uuid4()))
    request.state.correlation_id = correlation_id
    
    response = await call_next(request)
    response.headers["X-Correlation-ID"] = correlation_id
    return response
```

## 3. Error Tracking (Sentry)
```python
import sentry_sdk

sentry_sdk.init(
    dsn=settings.SENTRY_DSN,
    environment=settings.ENVIRONMENT,
    traces_sample_rate=0.1,  # 10% of transactions
)

# Automatic error capture
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    sentry_sdk.capture_exception(exc)
    return JSONResponse(status_code=500, content={"error": "Internal server error"})
```

## 4. Performance Monitoring

### 4.1 Response Time Tracking
```python
import time

@app.middleware("http")
async def timing_middleware(request: Request, call_next):
    start = time.time()
    response = await call_next(request)
    duration = time.time() - start
    
    # Send to metrics system (e.g., Prometheus)
    metrics.histogram("http_request_duration_seconds", duration, tags={"path": request.url.path})
    return response
```

### 4.2 Database Query Monitoring
Log slow queries (> 100ms):
```python
# In SQLAlchemy events
@event.listens_for(Engine, "before_cursor_execute")
def before_cursor_execute(conn, cursor, statement, parameters, context, executemany):
    context._query_start_time = time.time()

@event.listens_for(Engine, "after_cursor_execute")
def after_cursor_execute(conn, cursor, statement, parameters, context, executemany):
    duration = time.time() - context._query_start_time
    if duration > 0.1:
        logger.warning("slow_query", duration=duration, query=statement[:200])
```

## 5. Alerts & Notifications
Set up alerts for critical events:
- Error rate > 5% for 5 minutes
- Response time P95 > 1 second
- Database connection pool exhausted
- LINE API rate limit approaching
