"""Refresh materialized views used by analytics."""

from __future__ import annotations

import argparse
import asyncio
from _cli_utils import ensure_backend_on_path

from sqlalchemy import text

from app.db.session import engine
from scripts._script_safety import print_dry_run_hint, print_script_header

ensure_backend_on_path()


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Refresh analytics materialized views.")
    parser.add_argument(
        "--no-concurrently",
        action="store_true",
        help="Use blocking refresh mode instead of CONCURRENTLY.",
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Execute the materialized-view refresh. Without this flag, the script only prints the plan.",
    )
    return parser


async def refresh_daily_message_stats(*, concurrently: bool, apply: bool) -> int:
    print_script_header("Refresh analytics materialized views", apply=apply)
    print(f"View      : daily_message_stats")
    print(f"Mode      : {'CONCURRENTLY' if concurrently else 'BLOCKING'}")
    if not apply:
        print_dry_run_hint()
        return 0

    clause = "CONCURRENTLY " if concurrently else ""
    sql = text(f"REFRESH MATERIALIZED VIEW {clause}daily_message_stats")
    async with engine.connect() as conn:
        autocommit_conn = conn.execution_options(isolation_level="AUTOCOMMIT")
        await autocommit_conn.execute(sql)
    print("Materialized view refresh complete.")
    return 0


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    return asyncio.run(
        refresh_daily_message_stats(
            concurrently=not args.no_concurrently,
            apply=args.apply,
        )
    )


if __name__ == "__main__":
    raise SystemExit(main())
