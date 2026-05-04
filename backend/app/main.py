import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from app.api.v1.api import api_router
from app.core.connection_targets import describe_postgres_url, is_localhost_url
from app.core.config import settings
from app.core.pubsub_manager import pubsub_manager
from app.core.redis_client import redis_client
from app.core.websocket_manager import ws_manager
from app.services.business_hours_service import business_hours_service
from app.services.credential_service import credential_service
from app.tasks import start_cleanup_task, stop_cleanup_task

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

    # Warm the permission policy cache (degrades gracefully on failure)
    await _initialize_permission_policy()

    # Start background tasks
    await start_cleanup_task()
    logger.info("Background tasks started.")

    try:
        yield
    finally:
        await stop_cleanup_task()
        await pubsub_manager.disconnect()
        await redis_client.disconnect()

app = FastAPI(
    title=settings.PROJECT_NAME,
    description="Backend API for JskApp - Community Justice Services. Supports LINE OA integration and LIFF applications.",
    version="1.0.0",
    openapi_url=f"{settings.API_V1_STR}/openapi.json" if settings.ENVIRONMENT != "production" else None,
    docs_url=f"{settings.API_V1_STR}/docs" if settings.ENVIRONMENT != "production" else None,
    openapi_tags=tags_metadata,
    contact={
        "name": "JskApp Support Team",
        "email": "support@jsk-app.local",
    },
    lifespan=lifespan,
)

# Set all CORS enabled origins
# For local development, allow all origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=[str(origin).rstrip("/") for origin in settings.BACKEND_CORS_ORIGINS],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def root():
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
