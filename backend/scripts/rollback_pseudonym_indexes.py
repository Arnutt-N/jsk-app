"""
Rollback script for pseudonym prepare-indexes migration (d5e6f7g8h9i0).

Drops the two user_id-based unique indexes created by the prepare migration.
Use this if issues are discovered after applying the migration and you cannot
run `alembic downgrade -1` (e.g., later migrations depend on d5e6f7g8h9i0).

Safe to re-run: skips indexes that don't exist.

Usage:
  python scripts/rollback_pseudonym_indexes.py            # dry run
  python scripts/rollback_pseudonym_indexes.py --apply    # drop indexes
"""

from __future__ import annotations

import argparse
import asyncio
import sys

from _cli_utils import ensure_backend_on_path

ensure_backend_on_path()

from scripts._script_safety import get_active_database_target, print_dry_run_hint

IX_OPEN_SESSION = "uq_chat_sessions_one_open_per_user"
IX_RICH_MENU = "uq_user_rich_menu_links_user_id"

INDEXES = [
    (IX_RICH_MENU, "user_rich_menu_links"),
    (IX_OPEN_SESSION, "chat_sessions"),
]


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Rollback pseudonym prepare-indexes (drop user_id unique indexes)."
    )
    parser.add_argument(
        "--apply", action="store_true", help="Actually drop the indexes."
    )
    return parser


async def run(apply: bool) -> int:
    from sqlalchemy import text
    from app.db.session import AsyncSessionLocal

    env_path, db_desc = get_active_database_target()

    print("=" * 60)
    print("ROLLBACK: Pseudonym Prepare-Indexes (d5e6f7g8h9i0)")
    print("=" * 60)
    print(f"  ENV file : {env_path}")
    print(f"  DB target: {db_desc}")
    print(f"  Mode     : {'APPLY' if apply else 'DRY RUN'}")
    print()

    if not apply:
        print_dry_run_hint()
        print()

    async with AsyncSessionLocal() as db:
        for index_name, table_name in INDEXES:
            result = await db.execute(text(
                "SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = :name)"
            ), {"name": index_name})
            exists = result.scalar()

            if not exists:
                print(f"  [SKIP] {index_name} — does not exist")
                continue

            if apply:
                # CONCURRENTLY cannot run inside a transaction — use raw connection
                raw_conn = await db.connection()
                await raw_conn.execution_options(isolation_level="AUTOCOMMIT")
                await db.execute(text(f'DROP INDEX CONCURRENTLY IF EXISTS "{index_name}"'))
                print(f"  [DROPPED] {index_name} on {table_name}")
            else:
                print(f"  [WOULD DROP] {index_name} on {table_name}")

    print()
    if apply:
        print("Rollback complete. The line_user_id-based indexes are still intact.")
    else:
        print("Dry run complete. Re-run with --apply to drop indexes.")

    return 0


def main() -> None:
    args = build_parser().parse_args()
    exit_code = asyncio.run(run(args.apply))
    sys.exit(exit_code)


if __name__ == "__main__":
    main()
