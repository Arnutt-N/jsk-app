"""Startup validation tests for application lifespan."""
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient

from app.main import _build_database_startup_error, app


def test_startup_fails_without_encryption_key_in_production():
    with pytest.MonkeyPatch.context() as mp:
        mp.setattr("app.services.credential_service.settings.ENVIRONMENT", "production")
        mp.setattr("app.services.credential_service.settings.DEV_AUTH_BYPASS", False)
        mp.setattr("app.services.credential_service.settings.ENCRYPTION_KEY", "")
        mp.setattr("app.main.redis_client.connect", AsyncMock())
        mp.setattr("app.main.ws_manager.initialize", AsyncMock())
        mp.setattr("app.main.start_cleanup_task", AsyncMock())
        mp.setattr("app.main.stop_cleanup_task", AsyncMock())
        mp.setattr("app.main.pubsub_manager.disconnect", AsyncMock())
        mp.setattr("app.main.redis_client.disconnect", AsyncMock())

        with pytest.raises(RuntimeError, match="ENCRYPTION_KEY must be set"):
            with TestClient(app):
                pass


def test_build_database_startup_error_includes_local_docker_hint():
    with pytest.MonkeyPatch.context() as mp:
        mp.setattr(
            "app.main.settings.DATABASE_URL",
            "postgresql+asyncpg://postgres:password@localhost:5432/skn_app_db",
        )

        message = _build_database_startup_error(
            ConnectionRefusedError("[Errno 111] Connection refused"),
            context="Database unavailable",
        )

    assert "postgresql://localhost:5432/skn_app_db" in message
    assert "docker compose up -d db redis" in message
