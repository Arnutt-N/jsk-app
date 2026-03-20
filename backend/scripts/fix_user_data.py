from __future__ import annotations

import argparse
import asyncio

from _cli_utils import ensure_backend_on_path

from scripts._script_safety import print_dry_run_hint, print_script_header

ensure_backend_on_path()


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Fill NULL user chat_mode/friend_status values.")
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Write updates to the active database.",
    )
    return parser


async def inspect_fix_counts() -> tuple[int, int]:
    from sqlalchemy import text

    from app.db.session import engine

    async with engine.connect() as conn:
        chat_mode_result = await conn.execute(
            text("SELECT COUNT(*) FROM users WHERE chat_mode IS NULL")
        )
        friend_status_result = await conn.execute(
            text("SELECT COUNT(*) FROM users WHERE friend_status IS NULL")
        )
        return int(chat_mode_result.scalar_one()), int(friend_status_result.scalar_one())


async def fix_data(*, apply: bool) -> int:
    from sqlalchemy import text

    from app.db.session import engine

    print_script_header("Fill NULL values in users table", apply=apply)
    chat_mode_nulls, friend_status_nulls = await inspect_fix_counts()
    print(f"chat_mode NULLs    : {chat_mode_nulls}")
    print(f"friend_status NULLs: {friend_status_nulls}")

    if not apply:
        print_dry_run_hint()
        return 0

    if chat_mode_nulls == 0 and friend_status_nulls == 0:
        print("No rows need updating.")
        return 0

    async with engine.begin() as conn:
        await conn.execute(text("UPDATE users SET chat_mode = 'BOT' WHERE chat_mode IS NULL"))
        await conn.execute(
            text("UPDATE users SET friend_status = 'ACTIVE' WHERE friend_status IS NULL")
        )
        print("Data fix complete.")
        return 0


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    return asyncio.run(fix_data(apply=args.apply))


if __name__ == "__main__":
    raise SystemExit(main())
