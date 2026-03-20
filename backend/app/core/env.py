from __future__ import annotations

import os
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[2]
LEGACY_APP_ENV = BACKEND_DIR / "app" / ".env"
DEFAULT_ENV = BACKEND_DIR / ".env"


def resolve_env_file() -> Path:
    env_file = os.getenv("ENV_FILE")
    if env_file:
        candidate = Path(env_file)
        if not candidate.is_absolute():
            candidate = BACKEND_DIR / candidate
        return candidate

    if DEFAULT_ENV.exists():
        return DEFAULT_ENV

    return LEGACY_APP_ENV
