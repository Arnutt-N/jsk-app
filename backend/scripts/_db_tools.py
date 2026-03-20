from __future__ import annotations

from urllib.parse import urlparse

from _cli_utils import BACKEND_DIR
from pathlib import Path

LOCAL_ENV_PATH = BACKEND_DIR / "app" / ".env"
REMOTE_ENV_PATH = BACKEND_DIR / ".env"


def parse_env_file(path: Path) -> dict[str, str]:
    if not path.exists():
        raise FileNotFoundError(f"Env file not found: {path}")

    values: dict[str, str] = {}
    for raw_line in path.read_text(encoding="utf-8", errors="ignore").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue

        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip()

        if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
            value = value[1:-1]

        values[key] = value

    return values


def get_database_url(path: Path) -> str:
    url = parse_env_file(path).get("DATABASE_URL", "").strip()
    if not url:
        raise RuntimeError(f"DATABASE_URL is missing in {path}")
    return url.replace("postgresql+asyncpg://", "postgresql://", 1)


def describe_database_url(url: str) -> str:
    parsed = urlparse(url)
    scheme = parsed.scheme or "<unknown>"
    host = parsed.hostname or "<unknown-host>"
    port = f":{parsed.port}" if parsed.port else ""
    database = parsed.path.lstrip("/") or "<unknown-db>"
    return f"{scheme}://{host}{port}/{database}"


def quote_ident(identifier: str) -> str:
    return '"' + identifier.replace('"', '""') + '"'
