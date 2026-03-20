import os
from typing import List, Union
from pydantic import AnyHttpUrl, PostgresDsn, computed_field
from pydantic_settings import BaseSettings, SettingsConfigDict
from app.core.env import resolve_env_file

class Settings(BaseSettings):
    PROJECT_NAME: str = "JskApp"
    API_V1_STR: str = "/api/v1"
    ENVIRONMENT: str = "development"
    
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

settings = Settings(_env_file=resolve_env_file())
