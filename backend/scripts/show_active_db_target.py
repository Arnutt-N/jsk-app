from __future__ import annotations

import argparse
from pathlib import Path
from urllib.parse import urlparse

from _cli_utils import BACKEND_DIR, ensure_backend_on_path

ensure_backend_on_path()

from app.core.env import resolve_env_file


def read_database_url(env_path: Path) -> str:
    for raw_line in env_path.read_text(encoding="utf-8", errors="ignore").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue

        key, value = line.split("=", 1)
        if key.strip() != "DATABASE_URL":
            continue

        return value.strip().strip('"').strip("'")

    raise RuntimeError(f"DATABASE_URL not found in {env_path}")


def describe_database_url(url: str) -> str:
    parsed = urlparse(url.replace("postgresql+asyncpg://", "postgresql://", 1))
    scheme = parsed.scheme or "<unknown>"
    host = parsed.hostname or "<unknown-host>"
    port = f":{parsed.port}" if parsed.port else ""
    database = parsed.path.lstrip("/") or "<unknown-db>"
    return f"{scheme}://{host}{port}/{database}"


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Show which env file and PostgreSQL target the backend will use."
    )
    parser.add_argument(
        "--env-file",
        type=Path,
        help="Optional env file override. Relative paths resolve from backend/.",
    )
    args = parser.parse_args()

    if args.env_file:
        env_path = args.env_file
        if not env_path.is_absolute():
            env_path = BACKEND_DIR / env_path
    else:
        env_path = resolve_env_file()

    env_path = env_path.resolve()
    database_url = read_database_url(env_path)

    print(f"ENV file  : {env_path}")
    print(f"DB target : {describe_database_url(database_url)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
