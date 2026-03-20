from __future__ import annotations

import argparse
import os
import subprocess
import sys
from pathlib import Path

from _cli_utils import BACKEND_DIR

from show_active_db_target import describe_database_url, read_database_url


TARGET_ENV_FILES = {
    "remote": BACKEND_DIR / ".env",
    "local": BACKEND_DIR / "app" / ".env",
}


def get_target_env_path(target: str) -> Path:
    try:
        return TARGET_ENV_FILES[target].resolve()
    except KeyError as exc:
        raise ValueError(f"Unsupported target: {target}") from exc


def build_subprocess_env(target: str) -> dict[str, str]:
    env = os.environ.copy()
    env["ENV_FILE"] = str(get_target_env_path(target))
    return env


def run_command(args: list[str], target: str) -> int:
    completed = subprocess.run(
        args,
        cwd=BACKEND_DIR,
        env=build_subprocess_env(target),
        check=False,
    )
    return int(completed.returncode)


def cmd_show(target: str) -> int:
    env_path = get_target_env_path(target)
    database_url = read_database_url(env_path)
    print(f"Target    : {target}")
    print(f"ENV file  : {env_path}")
    print(f"DB target : {describe_database_url(database_url)}")
    return 0


def cmd_alembic(target: str, alembic_args: list[str]) -> int:
    if not alembic_args:
        raise SystemExit("Provide Alembic arguments, e.g.: alembic --target local current")
    return run_command([sys.executable, "-m", "alembic", *alembic_args], target)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Run backend DB-related commands against a named target."
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    show_parser = subparsers.add_parser("show", help="Show the env file and DB target.")
    show_parser.add_argument(
        "--target",
        choices=("local", "remote"),
        default="local",
        help="Database target to inspect.",
    )

    alembic_parser = subparsers.add_parser(
        "alembic",
        help="Run Alembic against the selected target.",
    )
    alembic_parser.add_argument(
        "--target",
        choices=("local", "remote"),
        default="local",
        help="Database target for the Alembic command.",
    )
    alembic_parser.add_argument(
        "alembic_args",
        nargs=argparse.REMAINDER,
        help="Arguments passed through to Alembic.",
    )

    return parser


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    return build_parser().parse_args(argv)


def main() -> int:
    args = parse_args()

    if args.command == "show":
        return cmd_show(args.target)

    if args.command == "alembic":
        return cmd_alembic(args.target, args.alembic_args)

    raise RuntimeError(f"Unhandled command: {args.command}")


if __name__ == "__main__":
    raise SystemExit(main())
