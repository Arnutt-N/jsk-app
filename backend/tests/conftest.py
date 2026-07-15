"""
Shared pytest fixtures for WebSocket and API tests.
"""
import os
import socket
from pathlib import Path
from urllib.parse import urlparse

import pytest
from fastapi.testclient import TestClient


BACKEND_DIR = Path(__file__).resolve().parents[1]
PROBE_TIMEOUT_SECONDS = 3


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


def _probe_tcp(host: str, port: int, timeout: float = PROBE_TIMEOUT_SECONDS) -> bool:
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except OSError:
        return False


def _fail_fast_if_services_down() -> None:
    """Give a clear error instead of hanging when Postgres/Redis are unreachable.

    Parses host/port from the same DATABASE_URL/REDIS_URL env vars set in
    `_configure_test_environment` (not hardcoded), so the message always
    reflects the target actually in use.
    """
    db_parsed = urlparse(
        os.environ["DATABASE_URL"].replace("postgresql+asyncpg://", "postgresql://", 1)
    )
    redis_parsed = urlparse(os.environ["REDIS_URL"])

    db_host, db_port = db_parsed.hostname or "127.0.0.1", db_parsed.port or 5432
    redis_host, redis_port = redis_parsed.hostname or "127.0.0.1", redis_parsed.port or 6379

    unreachable = []
    if not _probe_tcp(db_host, db_port):
        unreachable.append(f"PostgreSQL at {db_host}:{db_port}")
    if not _probe_tcp(redis_host, redis_port):
        unreachable.append(f"Redis at {redis_host}:{redis_port}")

    if unreachable:
        pytest.fail(
            f"{' and '.join(unreachable)} not reachable — start services "
            "(docker compose up -d db redis or "
            "service postgresql/redis-server start)",
            pytrace=False,
        )


@pytest.fixture(scope="session")
def app():
    """Lazily import the FastAPI app, failing fast if DB/Redis are down.

    Importing `app.main` at module level (the old behavior) blocks on
    Postgres/Redis with no connect timeout, which hangs every test in this
    directory when infra is degraded — even DB-independent tests that never
    request this fixture. Importing lazily here means tests that don't
    request `app`/`test_client` are unaffected by service availability.
    """
    _fail_fast_if_services_down()

    from app.main import app as fastapi_app

    return fastapi_app


@pytest.fixture(scope="session")
def test_client(app):
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
