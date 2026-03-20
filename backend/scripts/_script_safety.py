from __future__ import annotations

import sys
from pathlib import Path

from _cli_utils import BACKEND_DIR, ensure_backend_on_path

ensure_backend_on_path()

from app.core.env import resolve_env_file
from scripts._db_tools import describe_database_url, get_database_url


def get_active_database_target() -> tuple[Path, str]:
    env_path = resolve_env_file().resolve()
    return env_path, describe_database_url(get_database_url(env_path))


def print_script_header(action: str, *, apply: bool) -> tuple[Path, str]:
    env_path, database_target = get_active_database_target()
    mode = "APPLY" if apply else "DRY RUN"
    print(f"Action    : {action}")
    print(f"Mode      : {mode}")
    print(f"ENV file  : {env_path}")
    print(f"DB target : {database_target}")
    return env_path, database_target


def print_dry_run_hint() -> None:
    print("\nDry run only. Re-run with --apply to write to the active database.")
