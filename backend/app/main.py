import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from app.api.v1.api import api_router
from app.core.connection_targets import describe_postgres_url, is_localhost_url
from app.core.config import settings
from app.core.pubsub_manager import pubsub_manager
from app.core.redis_client import redis_client
from app.core.websocket_manager import ws_manager
from app.services.business_hours_service import business_hours_service
from app.services.canned_response_service import canned_response_service
from app.services.credential_service import credential_service
from app.tasks import (
    start_booking_reminder_scheduler,
    start_broadcast_scheduler,
    start_cleanup_task,
    start_health_watchdog,
    start_rich_menu_display_scheduler,
    stop_booking_reminder_scheduler,
    stop_broadcast_scheduler,
    stop_cleanup_task,
    stop_health_watchdog,
    stop_rich_menu_display_scheduler,
)

logger = logging.getLogger(__name__)

tags_metadata = [
    {"name": "line", "description": "Webhook endpoints for LINE Messaging API integration."},
    {"name": "liff", "description": "Endpoints serving data for LIFF (LINE Front-end Framework) applications."},
    {"name": "locations", "description": "Geography data (Provinces, Districts, Sub-districts)."},
    {"name": "media", "description": "Media upload and management."},
    {"name": "admin", "description": "Administrative management endpoints."},
]


def _build_database_startup_error(exc: Exception, *, context: str) -> str:
    database_target = describe_postgres_url(str(settings.DATABASE_URL))
    detail = str(exc).strip() or exc.__class__.__name__
    message = f"{context} for {database_target}: {detail}."
    if is_localhost_url(str(settings.DATABASE_URL)):
        message += " Start Docker Desktop and run `docker compose up -d db redis` from the repo root."
    return message


async def _initialize_database() -> None:
    from sqlalchemy import text

    from app.db.session import engine

    try:
        async with engine.begin() as conn:
            await conn.execute(text("""
                CREATE TABLE IF NOT EXISTS system_settings (
                    id SERIAL PRIMARY KEY,
                    key VARCHAR NOT NULL UNIQUE,
                    value TEXT,
                    description VARCHAR,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                    updated_at TIMESTAMP WITH TIME ZONE
                )
            """))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_system_settings_key ON system_settings (key)"))
            logger.info("Database initialized: system_settings table ensured.")
    except Exception as exc:
        raise RuntimeError(_build_database_startup_error(exc, context="Database unavailable")) from None


async def _initialize_business_hours() -> None:
    from app.db.session import AsyncSessionLocal

    try:
        async with AsyncSessionLocal() as db:
            await business_hours_service.initialize_defaults(db)
            logger.info("Business hours initialized.")
    except Exception as exc:
        raise RuntimeError(
            _build_database_startup_error(exc, context="Database bootstrap failed")
        ) from None


async def _initialize_canned_responses() -> None:
    """Seed the default canned responses when the table is empty.

    Non-critical: operators can author their own, so a failure here must
    never block startup (unlike business hours). Degrades gracefully.
    """
    from app.db.session import AsyncSessionLocal

    try:
        async with AsyncSessionLocal() as db:
            await canned_response_service.initialize_defaults(db)
    except Exception as exc:  # noqa: BLE001 -- intentional graceful degrade
        logger.warning("Could not seed default canned responses at startup: %s", exc)


async def _initialize_permission_policy() -> None:
    """Warm the permission_settings cache on startup.

    The cache is read by every authenticated request that touches an
    assign / self-assign / settings-edit check, so loading once here
    avoids a DB round-trip on the first such request. If the load
    fails (e.g. table not yet migrated) the helpers fall back to
    DEFAULT_POLICY -- never blocks startup.
    """
    from app.db.session import AsyncSessionLocal
    from app.core.permissions import ensure_seed_rows, load_policy

    try:
        async with AsyncSessionLocal() as db:
            # Self-heal: insert any missing DEFAULT_POLICY rows. Covers
            # fresh CI databases / wiped dev DBs / restored backups
            # where alembic's seed step never ran.
            await ensure_seed_rows(db)
            await load_policy(db)
            logger.info("Permission policy loaded into cache.")
    except Exception as exc:  # noqa: BLE001 -- intentional graceful degrade
        logger.warning(
            "Could not load permission policy at startup: %s; "
            "permission checks will use hardcoded DEFAULT_POLICY until next refresh",
            exc,
        )


@asynccontextmanager
async def lifespan(_: FastAPI):
    credential_service.validate_configuration()

    # Initialize Redis connection
    await redis_client.connect()

    # Initialize WebSocket manager with Pub/Sub
    await ws_manager.initialize()

    # Initialize database
    await _initialize_database()

    # Initialize default business hours
    await _initialize_business_hours()

    # Seed default canned responses if the table is empty (non-blocking)
    await _initialize_canned_responses()

    # Warm the permission policy cache (degrades gracefully on failure)
    await _initialize_permission_policy()

    # Start background tasks
    await start_cleanup_task()
    await start_broadcast_scheduler()
    await start_booking_reminder_scheduler()
    await start_health_watchdog()
    await start_rich_menu_display_scheduler()
    logger.info("Background tasks started.")

    try:
        yield
    finally:
        await stop_cleanup_task()
        await stop_broadcast_scheduler()
        await stop_booking_reminder_scheduler()
        await stop_health_watchdog()
        await stop_rich_menu_display_scheduler()
        await pubsub_manager.disconnect()
        await redis_client.disconnect()

app = FastAPI(
    title=settings.PROJECT_NAME,
    description="Backend API for JskApp - Community Justice Services. Supports LINE OA integration and LIFF applications.",
    version="1.0.0",
    openapi_url=f"{settings.API_V1_STR}/openapi.json" if not settings.is_production_like else None,
    docs_url=f"{settings.API_V1_STR}/docs" if not settings.is_production_like else None,
    openapi_tags=tags_metadata,
    contact={
        "name": "JskApp Support Team",
        "email": "support@jsk-app.local",
    },
    lifespan=lifespan,
)

# Set all CORS enabled origins.
#
# P1.1a FR5: allow_credentials=True together with wildcard methods/headers is
# the exact forbidden combination the remediation plan flags -- a
# credentialed CORS response with `*` methods/headers lets any origin in
# BACKEND_CORS_ORIGINS (env-controlled) probe with arbitrary verbs/headers.
# Explicit lists close that regardless of what origins are configured.
# Wildcard origins ("*") are already rejected by the pydantic
# List[AnyHttpUrl] type on BACKEND_CORS_ORIGINS -- "*" fails URL validation,
# so that half of FR5 is satisfied by the type system, not a runtime guard
# (see test_cookie_auth.py FR8 test 10 / PR body deviation note).
app.add_middleware(
    CORSMiddleware,
    allow_origins=[str(origin).rstrip("/") for origin in settings.BACKEND_CORS_ORIGINS],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["authorization", "content-type", "x-csrf-token", "x-liff-id-token"],
)

@app.get("/")
async def root():
    return {"message": "Welcome to JskApp API"}

# Find 'uploads' directory relative to the current working directory or main.py
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(BASE_DIR)
# Try both app parent and current CWD for flexibility
UPLOADS_DIR = os.path.join(ROOT_DIR, "uploads")
if not os.path.exists(UPLOADS_DIR):
    UPLOADS_DIR = os.path.join(os.getcwd(), "uploads")

logger.info("Uploads directory: %s", UPLOADS_DIR)
os.makedirs(UPLOADS_DIR, exist_ok=True)
# Static file mount removed — media served through /api/v1/media/{id} with access control
# app.mount("/uploads", StaticFiles(directory=UPLOADS_DIR), name="uploads")

app.include_router(api_router, prefix=settings.API_V1_STR)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Catch-all for unhandled exceptions.

    Logs the full traceback server-side for debugging but returns a
    sanitised 500 response so stack traces never leak to clients.
    """
    logger.exception("Unhandled exception on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal Server Error"},
    )
