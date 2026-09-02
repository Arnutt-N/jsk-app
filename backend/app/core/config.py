import os
from typing import List, Literal, Union
from pydantic import AnyHttpUrl, PostgresDsn, computed_field
from pydantic_settings import BaseSettings, SettingsConfigDict
from app.core.env import resolve_env_file

# Production guard thresholds — see docs/remediation/migration-controls.md
# ("P0.1 production startup guards") for the enforced-control table.
_MIN_SECRET_KEY_LENGTH = 32
# Recognized non-production environment names. Anything NOT in this allowlist
# (production, prod, staging, typos, blank-ish variants) is treated as
# production-like so the guards fail closed instead of silently skipping.
_NON_PRODUCTION_ENVIRONMENTS = frozenset(
    {
        "development",
        "dev",
        "test",
        "testing",
        "local",
    }
)
_PLACEHOLDER_SECRET_KEYS = frozenset(
    {
        "change_this_to_a_secure_random_string",
        "changeme",
        "change_this",
        "secret",
        "secret_key",
    }
)
# Database hosts that count as the developer's own machine. `db` is the
# docker-compose service name. Any other host is treated as remote so a
# development-configured process cannot silently write to hosted data.
_LOCAL_DATABASE_HOSTS = frozenset(
    {
        "localhost",
        "127.0.0.1",
        "::1",
        "db",
    }
)

class Settings(BaseSettings):
    PROJECT_NAME: str = "JskApp"
    API_V1_STR: str = "/api/v1"
    ENVIRONMENT: str = "development"

    # Migration controls. LIFF_STRICT_MODE defaults to True — all LIFF clients
    # send x-liff-id-token. Rollback: set LIFF_STRICT_MODE=false in env.
    LIFF_STRICT_MODE: bool = True
    # Cookie auth is unconditional since the auth mode-flag cleanup: the
    # former bearer/dual mode ladder and its env flag were removed. Auth is
    # cookie-only; rollback = redeploy a pre-cleanup image.
    # PR C contract phase: plaintext line_user_id columns are dropped, so the
    # app only ever runs the pseudonym path. The Literal is kept so an env
    # override stays parseable, but "plaintext"/"dual" are no longer valid
    # runtime states once the PR C migration has run.
    LINE_ID_STORAGE_MODE: Literal["plaintext", "dual", "pseudonym"] = "pseudonym"

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
    LINE_ID_HMAC_KEY: str = ""
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

    # HTTP Rate Limiting (public-facing REST endpoints)
    # Only enable TRUST_PROXY_HEADERS when behind a reverse proxy that sets
    # X-Forwarded-For — otherwise clients can spoof it to dodge the limits.
    TRUST_PROXY_HEADERS: bool = False
    LIFF_SUBMIT_RATE_LIMIT: int = 5        # Service-request submissions per window
    LIFF_SUBMIT_RATE_WINDOW: int = 300     # seconds
    MEDIA_UPLOAD_RATE_LIMIT: int = 20      # Uploads per window
    MEDIA_UPLOAD_RATE_WINDOW: int = 60     # seconds
    PUBLIC_FILE_RATE_LIMIT: int = 120      # Public file fetches per window
    PUBLIC_FILE_RATE_WINDOW: int = 60      # seconds

    # POST /auth/login attempts per (client IP + username) before 429 (M1).
    # The E2E workflow raises the limit: its whole suite shares one client IP
    # and the seeded admin username, and performs ~20 logins per run.
    AUTH_LOGIN_RATE_LIMIT: int = 5         # attempts per window (prod posture)
    AUTH_LOGIN_RATE_WINDOW: int = 60       # seconds

    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"

    # Webhook Deduplication (seconds)
    WEBHOOK_EVENT_TTL: int = 300  # 5 minutes

    # Health watchdog (background monitoring + alerting)
    HEALTH_WATCHDOG_ENABLED: bool = True
    HEALTH_CHECK_INTERVAL_SECONDS: int = 60
    HEALTH_ALERT_COOLDOWN_SECONDS: int = 900
    HEALTH_ALERT_TELEGRAM_ENABLED: bool = False

    # SLA thresholds
    SLA_MAX_FRT_SECONDS: int = 120
    SLA_MAX_RESOLUTION_SECONDS: int = 1800
    SLA_MAX_QUEUE_WAIT_SECONDS: int = 300
    SLA_ALERT_TELEGRAM_ENABLED: bool = False

    model_config = SettingsConfigDict(
        env_ignore_empty=True,
        extra="ignore"
    )

    @property
    def is_production_like(self) -> bool:
        """True unless ENVIRONMENT is a recognized non-production name.

        Deliberately fail-closed: only `development`, `dev`, `test`,
        `testing`, and `local` are treated as non-production. Unknown
        environment names (`prod`, `staging`, misspellings of `production`,
        etc.) are treated as production on purpose so the startup guards,
        the docs/OpenAPI gate, and the encryption-key fallback denial all
        apply rather than silently switching off.
        """
        return self.ENVIRONMENT.strip().lower() not in _NON_PRODUCTION_ENVIRONMENTS

    @property
    def is_remote_database(self) -> bool:
        """True when DATABASE_URL points somewhere other than this machine.

        `ENVIRONMENT` and `DATABASE_URL` are configured independently, so a
        development-configured process can be aimed at hosted data (an exported
        `DATABASE_URL`, or the remote env file). Callers use this to deny
        development fallbacks that would write values the production process
        cannot read back — see `user_identity_service._get_hmac_key`.

        `PostgresDsn` is a multi-host URL, so any non-local host in the list
        makes the target remote.
        """
        hosts = [
            (entry.get("host") or "").strip().strip("[]").lower()
            for entry in self.DATABASE_URL.hosts()
        ]
        return any(host and host not in _LOCAL_DATABASE_HOSTS for host in hosts)

    def enforce_production_guards(self) -> "Settings":
        """Fail closed on unsafe production configuration combinations.

        Only runs when ENVIRONMENT is production-like (see is_production_like
        — production, staging, and unknown names all enforce); recognized
        development/test defaults remain untouched. Collects every violation
        so operators can fix them all at once, and never echoes the
        configured value into the error.

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
        if not self.is_production_like:
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

        if not self.LINE_ID_HMAC_KEY.strip():
            violations.append(
                "LINE_ID_HMAC_KEY must be set in production — LINE user IDs are "
                "resolved via HMAC hash only (PR C pseudonym contract)."
            )

        if violations:
            raise RuntimeError(
                "Unsafe production configuration:\n"
                + "\n".join(f"- {v}" for v in violations)
            )

        return self

settings = Settings(_env_file=resolve_env_file()).enforce_production_guards()
