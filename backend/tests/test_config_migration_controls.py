import pytest
from pydantic import ValidationError

from app.core.config import Settings


BASE_SETTINGS = {
    "DATABASE_URL": "postgresql+asyncpg://postgres:password@localhost:5432/skn_app_db",
    "SECRET_KEY": "test-secret-key",
}


def build_settings(**overrides: object) -> Settings:
    return Settings(_env_file=None, **BASE_SETTINGS, **overrides)


def test_migration_controls_default_to_compatibility_modes() -> None:
    settings = build_settings()

    assert settings.LIFF_STRICT_MODE is False
    assert settings.COOKIE_AUTH_MODE == "bearer"


@pytest.mark.parametrize("mode", ["bearer", "dual", "cookie"])
def test_cookie_auth_mode_accepts_documented_values(mode: str) -> None:
    settings = build_settings(COOKIE_AUTH_MODE=mode)

    assert settings.COOKIE_AUTH_MODE == mode


def test_liff_strict_mode_parses_environment_boolean() -> None:
    settings = build_settings(LIFF_STRICT_MODE="true")

    assert settings.LIFF_STRICT_MODE is True


@pytest.mark.parametrize(
    ("field", "value"),
    [("COOKIE_AUTH_MODE", "unknown"), ("LIFF_STRICT_MODE", "sometimes")],
)
def test_production_rejects_unknown_migration_control_values(
    field: str,
    value: str,
) -> None:
    with pytest.raises(ValidationError):
        build_settings(ENVIRONMENT="production", **{field: value})
