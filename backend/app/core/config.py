import os
from typing import List, Literal, Union
from pydantic import AnyHttpUrl, PostgresDsn, computed_field
from pydantic_settings import BaseSettings, SettingsConfigDict
from app.core.env import resolve_env_file

# Production guard thresholds — see docs/remediation/migration-controls.md
# ("P0.1 production startup guards") for the enforced-control table.
_MIN_SECRET_KEY_LENGTH = 32
_PLACEHOLDER_SECRET_KEYS = frozenset(
    {
        "change_this_to_a_secure_random_string",
        "changeme",
        "change_this",
        "secret",
        "secret_key",
    }
)

class Settings(BaseSettings):
    PROJECT_NAME: str = "JskApp"
    API_V1_STR: str = "/api/v1"
    ENVIRONMENT: str = "development"

    # Temporary migration controls. Keep compatibility defaults until the
    # corresponding rollout gates in docs/remediation/migration-controls.md pass.
    LIFF_STRICT_MODE: bool = False
    COOKIE_AUTH_MODE: Literal["bearer", "dual", "cookie"] = "bearer"

    # Explicit opt-in for dev auth bypass — must set DEV_AUTH_BYPASS=true in .env
    # Safe by default: missing env var = bypass disabled
    DEV_AUTH_BYPASS: bool = False

    # Admin URL for Telegram notification links
    ADMIN_URL: str = "/admin"
    
    # CORS
    BACKEND_CORS_ORIGINS: List[AnyHttpUrl] = []

    # Database
    DATABASE_URL: PostgresDsn

    # Security
    SECRET_KEY: str
    ENCRYPTION_KEY: str = ""
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30

    # LINE Messaging API
    LINE_CHANNEL_ACCESS_TOKEN: str = ""
    LINE_CHANNEL_SECRET: str = ""
    
    # LINE Login (LIFF)
    LINE_LOGIN_CHANNEL_ID: str = ""
    
    # Server Base URL (for LINE media URLs - must be HTTPS)
    # Set this to your ngrok/public domain, e.g., "https://abc123.ngrok.io"
    SERVER_BASE_URL: str = ""

    # WebSocket Rate Limiting
    WS_RATE_LIMIT_MESSAGES: int = 30   # Max messages per window
    WS_RATE_LIMIT_WINDOW: int = 60     # Window in seconds
    WS_MAX_MESSAGE_LENGTH: int = 5000  # Max message content length

    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"

    # Webhook Deduplication (seconds)
    WEBHOOK_EVENT_TTL: int = 300  # 5 minutes

    # SLA thresholds
    SLA_MAX_FRT_SECONDS: int = 120
    SLA_MAX_RESOLUTION_SECONDS: int = 1800
    SLA_MAX_QUEUE_WAIT_SECONDS: int = 300
    SLA_ALERT_TELEGRAM_ENABLED: bool = False

    model_config = SettingsConfigDict(
        env_ignore_empty=True,
        extra="ignore"
    )

    def enforce_production_guards(self) -> "Settings":
        """Fail closed on unsafe production configuration combinations.

        Only runs when ENVIRONMENT is production; development/test defaults
        remain untouched. Collects every violation so operators can fix them
        all at once, and never echoes the configured value into the error.

        Deliberately NOT a pydantic validator: a ``ValueError`` raised inside a
        ``model_validator`` gets wrapped in ``ValidationError``, whose string
        representation appends a truncated repr of the entire input dict
        (``input_value={...}``) — leaking fragments of SECRET_KEY, the
        DATABASE_URL password, or other secrets into startup logs. Raising a
        plain ``RuntimeError`` from an explicit method keeps the message limited
        to the violation list. Guards are enforced on the module singleton path
        below; any future direct ``Settings()`` construction in app code must
        call this method itself.
        """
        if self.ENVIRONMENT.strip().lower() != "production":
            return self

        violations: List[str] = []

        if self.DEV_AUTH_BYPASS:
            violations.append(
                "DEV_AUTH_BYPASS must be disabled in production — remove it from the environment."
            )

        secret_key = self.SECRET_KEY.strip()
        if len(secret_key) < _MIN_SECRET_KEY_LENGTH or secret_key.lower() in _PLACEHOLDER_SECRET_KEYS:
            violations.append(
                "SECRET_KEY is too weak for production — set a random value of at "
                "least 32 characters (e.g. openssl rand -hex 32)."
            )

        if not self.LINE_LOGIN_CHANNEL_ID.strip():
            violations.append(
                "LINE_LOGIN_CHANNEL_ID must be set in production for LIFF token verification."
            )

        if not self.ENCRYPTION_KEY.strip():
            violations.append(
                "ENCRYPTION_KEY must be set in production — generate a Fernet key."
            )

        if violations:
            raise RuntimeError(
                "Unsafe production configuration:\n"
                + "\n".join(f"- {v}" for v in violations)
            )

        return self

settings = Settings(_env_file=resolve_env_file()).enforce_production_guards()
