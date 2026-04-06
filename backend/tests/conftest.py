"""
Shared pytest fixtures for WebSocket and API tests.
"""
import os
from pathlib import Path

import pytest
from fastapi.testclient import TestClient


BACKEND_DIR = Path(__file__).resolve().parents[1]


def _configure_test_environment() -> None:
    """Default backend tests to local Docker services unless explicitly overridden."""
    os.environ.setdefault(
        "DATABASE_URL",
        "postgresql+asyncpg://postgres:password@127.0.0.1:5432/skn_app_db",
    )
    os.environ.setdefault("REDIS_URL", "redis://127.0.0.1:6379/0")
    os.environ.setdefault("SECRET_KEY", "pytest-secret-key")
    os.environ.setdefault(
        "ENCRYPTION_KEY",
        "zsi41Kqura0QA7xUGAtHnwoAnPP3IAddcu-cb2mfGCA=",
    )
    os.environ.setdefault("ENVIRONMENT", "development")
    os.environ.setdefault("LINE_CHANNEL_ACCESS_TOKEN", "pytest-access-token")
    os.environ.setdefault("LINE_CHANNEL_SECRET", "pytest-channel-secret")
    os.environ.setdefault("LINE_LOGIN_CHANNEL_ID", "2000000000")
    os.environ.setdefault("SERVER_BASE_URL", "http://localhost:8000")
    os.environ.setdefault("ADMIN_URL", "http://localhost:3000")
    os.environ.setdefault("BACKEND_CORS_ORIGINS", '["http://localhost:3000"]')
    os.environ.setdefault("ENV_FILE", str(BACKEND_DIR / "app" / ".env"))


_configure_test_environment()

from app.main import app


@pytest.fixture(scope="session")
def test_client():
    """Create a test client for API tests"""
    with TestClient(app) as client:
        yield client


def drain_auth_responses(websocket):
    """Helper to drain auth_success and presence_update after auth"""
    websocket.receive_json()  # auth_success
    websocket.receive_json()  # presence_update


def auth_websocket(websocket, admin_id: str = "1"):
    """Authenticate a WebSocket connection and drain responses"""
    websocket.send_json({"type": "auth", "payload": {"admin_id": admin_id}})
    drain_auth_responses(websocket)
