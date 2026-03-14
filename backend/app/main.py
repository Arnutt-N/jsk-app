import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from app.api.v1.api import api_router
from app.core.config import settings
from app.core.pubsub_manager import pubsub_manager
from app.core.redis_client import redis_client
from app.core.websocket_manager import ws_manager
from app.services.business_hours_service import business_hours_service
from app.tasks import start_cleanup_task, stop_cleanup_task

logger = logging.getLogger(__name__)

tags_metadata = [
    {"name": "line", "description": "Webhook endpoints for LINE Messaging API integration."},
    {"name": "liff", "description": "Endpoints serving data for LIFF (LINE Front-end Framework) applications."},
    {"name": "locations", "description": "Geography data (Provinces, Districts, Sub-districts)."},
    {"name": "media", "description": "Media upload and management."},
    {"name": "admin", "description": "Administrative management endpoints."},
]


@asynccontextmanager
async def lifespan(_: FastAPI):
    # Initialize Redis connection
    await redis_client.connect()

    # Initialize WebSocket manager with Pub/Sub
    await ws_manager.initialize()

    # Initialize database
    from sqlalchemy import text

    from app.db.session import AsyncSessionLocal, engine

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

    # Initialize default business hours
    async with AsyncSessionLocal() as db:
        await business_hours_service.initialize_defaults(db)
        logger.info("Business hours initialized.")

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
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    docs_url=f"{settings.API_V1_STR}/docs",
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

logger.info("Static files serving from: %s", UPLOADS_DIR)
os.makedirs(UPLOADS_DIR, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=UPLOADS_DIR), name="uploads")

app.include_router(api_router, prefix=settings.API_V1_STR)
