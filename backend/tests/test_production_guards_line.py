"""B1: production guards must require the LINE webhook credentials.

Context: WebhookParser is built from LINE_CHANNEL_SECRET at import time, and
an empty secret makes webhook signatures attacker-computable. Booting a
production-like environment without the LINE credentials must fail closed.
"""
import pytest

from app.core.config import Settings

STRONG_SECRET = "a" * 40
TEST_DB_URL = "postgresql+asyncpg://postgres:password@127.0.0.1:5432/skn_app_db"


def _prod_settings(**overrides):
    base = dict(
        ENVIRONMENT="production",
        SECRET_KEY=STRONG_SECRET,
        DATABASE_URL=TEST_DB_URL,
        DEV_AUTH_BYPASS=False,
        LINE_LOGIN_CHANNEL_ID="1234567890",
        ENCRYPTION_KEY="test-fernet-key-not-real",
        LINE_ID_HMAC_KEY="test-hmac-key-not-real",
        LINE_CHANNEL_SECRET="test-channel-secret",
        LINE_CHANNEL_ACCESS_TOKEN="test-access-token",
        # F-032: production also requires a shared (non-loopback) Redis.
        REDIS_URL="rediss://redis.internal:6380/0",
    )
    base.update(overrides)
    return Settings(**base)


def test_empty_line_channel_secret_blocked_in_production():
    settings = _prod_settings(LINE_CHANNEL_SECRET="")
    with pytest.raises(RuntimeError, match="LINE_CHANNEL_SECRET"):
        settings.enforce_production_guards()


def test_blank_line_channel_secret_blocked_in_production():
    settings = _prod_settings(LINE_CHANNEL_SECRET="   ")
    with pytest.raises(RuntimeError, match="LINE_CHANNEL_SECRET"):
        settings.enforce_production_guards()


def test_empty_line_channel_access_token_blocked_in_production():
    settings = _prod_settings(LINE_CHANNEL_ACCESS_TOKEN="")
    with pytest.raises(RuntimeError, match="LINE_CHANNEL_ACCESS_TOKEN"):
        settings.enforce_production_guards()


def test_blank_line_channel_access_token_blocked_in_production():
    settings = _prod_settings(LINE_CHANNEL_ACCESS_TOKEN="   ")
    with pytest.raises(RuntimeError, match="LINE_CHANNEL_ACCESS_TOKEN"):
        settings.enforce_production_guards()


def test_configured_line_credentials_pass_production_guards():
    settings = _prod_settings()
    assert settings.enforce_production_guards() is settings


def test_empty_line_credentials_allowed_outside_production():
    settings = _prod_settings(
        ENVIRONMENT="development",
        LINE_CHANNEL_SECRET="",
        LINE_CHANNEL_ACCESS_TOKEN="",
    )
    assert settings.enforce_production_guards() is settings
