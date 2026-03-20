from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parent
SCRIPTS_DIR = BACKEND_DIR / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

import db_target


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Start the backend with an explicit DB target.")
    parser.add_argument(
        "--target",
        choices=("local", "remote"),
        default="local",
        help="Database target to use when booting the backend.",
    )
    parser.add_argument("--host", default="0.0.0.0", help="Host passed to uvicorn.")
    parser.add_argument("--port", type=int, default=8000, help="Port passed to uvicorn.")
    parser.add_argument(
        "--reload",
        dest="reload",
        action="store_true",
        default=True,
        help="Enable uvicorn auto-reload (default).",
    )
    parser.add_argument(
        "--no-reload",
        dest="reload",
        action="store_false",
        help="Disable uvicorn auto-reload.",
    )
    parser.add_argument(
        "uvicorn_args",
        nargs=argparse.REMAINDER,
        help="Additional arguments passed through to uvicorn.",
    )
    return parser


def build_uvicorn_command(args: argparse.Namespace) -> list[str]:
    command = [
        sys.executable,
        "-m",
        "uvicorn",
        "app.main:app",
        "--host",
        args.host,
        "--port",
        str(args.port),
    ]
    if args.reload:
        command.append("--reload")
    command.extend(args.uvicorn_args)
    return command


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    db_target.cmd_show(args.target)
    command = build_uvicorn_command(args)
    completed = subprocess.run(
        command,
        cwd=BACKEND_DIR,
        env=db_target.build_subprocess_env(args.target),
        check=False,
    )
    return int(completed.returncode)


if __name__ == "__main__":
    raise SystemExit(main())
