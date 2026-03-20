from __future__ import annotations

import argparse
import asyncio
from collections import defaultdict
from pathlib import Path

import asyncpg

from _db_tools import (
    LOCAL_ENV_PATH,
    REMOTE_ENV_PATH,
    describe_database_url,
    get_database_url,
    quote_ident,
)


async def fetch_alembic_version(conn: asyncpg.Connection) -> str | None:
    exists = await conn.fetchval(
        """
        SELECT EXISTS (
            SELECT 1
            FROM information_schema.tables
            WHERE table_schema = 'public'
              AND table_name = 'alembic_version'
        )
        """
    )
    if not exists:
        return None

    return await conn.fetchval("SELECT version_num FROM alembic_version LIMIT 1")


async def fetch_tables(conn: asyncpg.Connection) -> list[str]:
    rows = await conn.fetch(
        """
        SELECT tablename
        FROM pg_tables
        WHERE schemaname = 'public'
        ORDER BY tablename
        """
    )
    return [row["tablename"] for row in rows]


async def fetch_columns(conn: asyncpg.Connection) -> dict[str, list[str]]:
    rows = await conn.fetch(
        """
        SELECT table_name, column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
        ORDER BY table_name, ordinal_position
        """
    )
    columns: dict[str, list[str]] = defaultdict(list)
    for row in rows:
        columns[row["table_name"]].append(row["column_name"])
    return dict(columns)


async def fetch_row_counts(
    conn: asyncpg.Connection,
    tables: list[str],
) -> dict[str, int]:
    counts: dict[str, int] = {}
    for table in tables:
        counts[table] = await conn.fetchval(f"SELECT COUNT(*) FROM {quote_ident(table)}")
    return counts


def format_table_list(title: str, items: list[str]) -> None:
    print(title)
    if not items:
        print("  - none")
        return

    for item in items:
        print(f"  - {item}")


async def audit(local_env: Path, remote_env: Path, show_equal: bool) -> int:
    local_url = get_database_url(local_env)
    remote_url = get_database_url(remote_env)

    print("Database targets")
    print(f"  Local  : {describe_database_url(local_url)}")
    print(f"  Remote : {describe_database_url(remote_url)}")
    print()

    local_conn = await asyncpg.connect(local_url)
    remote_conn = await asyncpg.connect(remote_url)

    try:
        local_version, remote_version = await asyncio.gather(
            fetch_alembic_version(local_conn),
            fetch_alembic_version(remote_conn),
        )

        print("Alembic heads")
        print(f"  Local  : {local_version or '<missing>'}")
        print(f"  Remote : {remote_version or '<missing>'}")
        if local_version == remote_version:
            print("  Status : same revision")
        else:
            print("  Status : different revisions")
        print()

        local_tables, remote_tables = await asyncio.gather(
            fetch_tables(local_conn),
            fetch_tables(remote_conn),
        )
        local_table_set = set(local_tables)
        remote_table_set = set(remote_tables)
        common_tables = sorted(local_table_set & remote_table_set)
        local_only_tables = sorted(local_table_set - remote_table_set)
        remote_only_tables = sorted(remote_table_set - local_table_set)

        print("Schema differences")
        format_table_list("  Tables only on local", local_only_tables)
        format_table_list("  Tables only on remote", remote_only_tables)
        print()

        local_columns, remote_columns = await asyncio.gather(
            fetch_columns(local_conn),
            fetch_columns(remote_conn),
        )
        column_diffs: list[tuple[str, list[str], list[str]]] = []
        for table in common_tables:
            local_cols = local_columns.get(table, [])
            remote_cols = remote_columns.get(table, [])
            if local_cols != remote_cols:
                local_only = [col for col in local_cols if col not in remote_cols]
                remote_only = [col for col in remote_cols if col not in local_cols]
                column_diffs.append((table, local_only, remote_only))

        print("Column differences on shared tables")
        if not column_diffs:
            print("  - none")
        else:
            for table, local_only, remote_only in column_diffs:
                print(f"  - {table}")
                print(f"    local-only columns  : {', '.join(local_only) if local_only else 'none'}")
                print(f"    remote-only columns : {', '.join(remote_only) if remote_only else 'none'}")
        print()

        local_counts, remote_counts = await asyncio.gather(
            fetch_row_counts(local_conn, local_tables),
            fetch_row_counts(remote_conn, remote_tables),
        )
        union_tables = sorted(local_table_set | remote_table_set)

        print("Row count differences")
        rows_with_diff = 0
        for table in union_tables:
            local_count = local_counts.get(table)
            remote_count = remote_counts.get(table)
            counts_match = local_count == remote_count
            if counts_match and not show_equal:
                continue

            rows_with_diff += 1
            print(
                f"  - {table}: local={local_count if local_count is not None else 'missing'}, "
                f"remote={remote_count if remote_count is not None else 'missing'}"
            )

        if rows_with_diff == 0:
            print("  - none")
        print()

        local_data_only = sorted(
            table
            for table in union_tables
            if local_counts.get(table, 0) > remote_counts.get(table, 0)
        )
        remote_data_only = sorted(
            table
            for table in union_tables
            if remote_counts.get(table, 0) > local_counts.get(table, 0)
        )

        print("Migration summary")
        format_table_list("  More rows on local", local_data_only)
        format_table_list("  More rows on remote", remote_data_only)
        print()

        if local_only_tables or column_diffs or local_data_only:
            print("Conclusion")
            print("  Local still contains schema/data that has not been fully migrated to remote.")
            return 2

        print("Conclusion")
        print("  Local and remote appear aligned for the tables compared.")
        return 0
    finally:
        await local_conn.close()
        await remote_conn.close()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Compare the local PostgreSQL database against the Supabase target."
    )
    parser.add_argument(
        "--local-env",
        type=Path,
        default=LOCAL_ENV_PATH,
        help=f"Path to local env file (default: {LOCAL_ENV_PATH})",
    )
    parser.add_argument(
        "--remote-env",
        type=Path,
        default=REMOTE_ENV_PATH,
        help=f"Path to remote env file (default: {REMOTE_ENV_PATH})",
    )
    parser.add_argument(
        "--show-equal",
        action="store_true",
        help="Include tables whose row counts already match.",
    )
    return parser.parse_args()


if __name__ == "__main__":
    args = parse_args()
    raise SystemExit(asyncio.run(audit(args.local_env, args.remote_env, args.show_equal)))
