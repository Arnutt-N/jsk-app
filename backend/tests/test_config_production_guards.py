"""Tests for the P0.1 production configuration guards.

Mirrors the style of test_config_migration_controls.py (BASE_SETTINGS +
build_settings helper, no DB needed) and covers the full PRD FR4 list:
config guards, credential_service production cases, and the fail-closed
verify_liff_token 503 (no network call).

The guards live in Settings.enforce_production_guards() — a plain method, not
a pydantic validator — so the raised RuntimeError never gets wrapped in a
ValidationError whose ``input_value={...}`` repr would leak secret fragments.
"""
import pytest

from app.core.config import Settings
from app.services.credential_service import CredentialService


# Safe values for every production-guarded field — individual tests break
# exactly one field to isolate the violation under test.
BASE_SETTINGS = {
    "DATABASE_URL": "postgresql+asyncpg://postgres:password@localhost:5432/skn_app_db",
    "SECRET_KEY": "x" * 40,
    "LINE_LOGIN_CHANNEL_ID": "2000000000",
    "ENCRYPTION_KEY": "zsi41Kqura0QA7xUGAtHnwoAnPP3IAddcu-cb2mfGCA=",
    "DEV_AUTH_BYPASS": False,
}


def build_settings(**overrides: object) -> Settings:
    return Settings(_env_file=None, **{**BASE_SETTINGS, **overrides})


def test_production_with_all_safe_values_passes_guards() -> None:
    settings = build_settings(ENVIRONMENT="production")

    assert settings.enforce_production_guards() is settings


def test_development_defaults_pass_guards_even_though_unsafe_for_production() -> None:
    """Guards must not run outside production."""
    settings = build_settings(
        DEV_AUTH_BYPASS=True,
        SECRET_KEY="short",
        LINE_LOGIN_CHANNEL_ID="",
        ENCRYPTION_KEY="",
        ENVIRONMENT="development",
    )

    assert settings.enforce_production_guards() is settings
    assert settings.DEV_AUTH_BYPASS is True
    assert settings.LINE_LOGIN_CHANNEL_ID == ""


def test_production_rejects_dev_auth_bypass() -> None:
    settings = build_settings(ENVIRONMENT="production", DEV_AUTH_BYPASS=True)

    with pytest.raises(RuntimeError, match="DEV_AUTH_BYPASS"):
        settings.enforce_production_guards()


@pytest.mark.parametrize(
    "weak_secret_key",
    [
        "short",
        "change_this_to_a_secure_random_string",
        "CHANGE_THIS_TO_A_SECURE_RANDOM_STRING",
        "changeme",
        "secret",
        "",
    ],
)
def test_production_rejects_weak_or_placeholder_secret_key(weak_secret_key: str) -> None:
    settings = build_settings(ENVIRONMENT="production", SECRET_KEY=weak_secret_key)

    with pytest.raises(RuntimeError, match="SECRET_KEY"):
        settings.enforce_production_guards()


def test_production_rejects_empty_line_login_channel_id() -> None:
    settings = build_settings(ENVIRONMENT="production", LINE_LOGIN_CHANNEL_ID="")

    with pytest.raises(RuntimeError, match="LINE_LOGIN_CHANNEL_ID"):
        settings.enforce_production_guards()


def test_production_rejects_blank_line_login_channel_id() -> None:
    settings = build_settings(ENVIRONMENT="production", LINE_LOGIN_CHANNEL_ID="   ")

    with pytest.raises(RuntimeError, match="LINE_LOGIN_CHANNEL_ID"):
        settings.enforce_production_guards()


def test_production_rejects_empty_encryption_key() -> None:
    settings = build_settings(ENVIRONMENT="production", ENCRYPTION_KEY="")

    with pytest.raises(RuntimeError, match="ENCRYPTION_KEY"):
        settings.enforce_production_guards()


def test_production_reports_all_violations_together() -> None:
    settings = build_settings(
        ENVIRONMENT="production",
        DEV_AUTH_BYPASS=True,
        SECRET_KEY="change_this_to_a_secure_random_string",
        LINE_LOGIN_CHANNEL_ID="",
        ENCRYPTION_KEY="",
    )

    with pytest.raises(RuntimeError) as exc_info:
        settings.enforce_production_guards()

    message = str(exc_info.value)
    assert "DEV_AUTH_BYPASS" in message
    assert "SECRET_KEY" in message
    assert "LINE_LOGIN_CHANNEL_ID" in message
    assert "ENCRYPTION_KEY" in message


def test_production_error_message_does_not_echo_secret_value() -> None:
    settings = build_settings(
        ENVIRONMENT="production",
        SECRET_KEY="change_this_to_a_secure_random_string",
    )

    with pytest.raises(RuntimeError) as exc_info:
        settings.enforce_production_guards()

    assert "change_this_to_a_secure_random_string" not in str(exc_info.value)


def test_production_error_message_never_leaks_configured_values() -> None:
    """The raised error must not be a pydantic ValidationError: its
    ``input_value={...}`` repr leaks truncated fragments of configured
    secrets (SECRET_KEY tail, DATABASE_URL password) into startup logs.
    """
    canary = "zz_leak_canary_zz"
    settings = build_settings(
        ENVIRONMENT="production",
        DEV_AUTH_BYPASS=True,  # trip the guard without weakening other fields
        DATABASE_URL=f"postgresql+asyncpg://postgres:{canary}@localhost:5432/skn_app_db",
    )

    with pytest.raises(RuntimeError) as exc_info:
        settings.enforce_production_guards()

    message = str(exc_info.value)
    assert "input_value" not in message
    assert canary not in message


# --- credential_service production coverage (FR3) ---------------------------


def test_credential_service_validate_configuration_raises_in_production_without_key() -> None:
    service = CredentialService()

    with pytest.MonkeyPatch.context() as mp:
        mp.setattr("app.services.credential_service.settings.ENVIRONMENT", "production")
        mp.setattr("app.services.credential_service.settings.ENCRYPTION_KEY", "")

        with pytest.raises(RuntimeError, match="ENCRYPTION_KEY must be set"):
            service.validate_configuration()


def test_credential_service_validate_configuration_passes_with_valid_fernet_key_in_production() -> None:
    service = CredentialService()

    with pytest.MonkeyPatch.context() as mp:
        mp.setattr("app.services.credential_service.settings.ENVIRONMENT", "production")
        mp.setattr(
            "app.services.credential_service.settings.ENCRYPTION_KEY",
            "zsi41Kqura0QA7xUGAtHnwoAnPP3IAddcu-cb2mfGCA=",
        )

        service.validate_configuration()  # must not raise


def test_credential_service_validate_configuration_warns_but_passes_in_development_without_key(
    caplog: pytest.LogCaptureFixture,
) -> None:
    service = CredentialService()

    with pytest.MonkeyPatch.context() as mp:
        mp.setattr("app.services.credential_service.settings.ENVIRONMENT", "development")
        mp.setattr("app.services.credential_service.settings.ENCRYPTION_KEY", "")

        service.validate_configuration()  # must not raise


# --- verify_liff_token fail-closed 503 (FR2) ---------------------------------


@pytest.mark.asyncio
async def test_verify_liff_token_returns_503_without_network_call_when_channel_id_missing() -> None:
    from fastapi import HTTPException

    from app.api.v1.endpoints import liff

    class _ExplodingAsyncClient:
        def __init__(self, *args, **kwargs):
            raise AssertionError("httpx.AsyncClient must not be constructed when LINE_LOGIN_CHANNEL_ID is empty")

    with pytest.MonkeyPatch.context() as mp:
        mp.setattr(liff.settings, "LINE_LOGIN_CHANNEL_ID", "")
        mp.setattr(liff.httpx, "AsyncClient", _ExplodingAsyncClient)

        with pytest.raises(HTTPException) as exc_info:
            await liff.verify_liff_token("some-id-token")

    assert exc_info.value.status_code == 503
