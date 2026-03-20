from __future__ import annotations

import argparse
import asyncio
from pathlib import Path

import asyncpg

from _db_tools import LOCAL_ENV_PATH, REMOTE_ENV_PATH, quote_ident, get_database_url


DEFAULT_TABLES = [
    "users",
    "auto_replies",
    "media_files",
    "intent_categories",
    "intent_keywords",
    "intent_responses",
    "service_requests",
    "messages",
]


async def fetch_columns(conn: asyncpg.Connection, table: str) -> list[str]:
    rows = await conn.fetch(
        """
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = $1
        ORDER BY ordinal_position
        """,
        table,
    )
    return [row["column_name"] for row in rows]


async def fetch_primary_key_columns(conn: asyncpg.Connection, table: str) -> list[str]:
    rows = await conn.fetch(
        """
        SELECT a.attname AS column_name
        FROM pg_index i
        JOIN pg_attribute a
          ON a.attrelid = i.indrelid
         AND a.attnum = ANY(i.indkey)
        WHERE i.indrelid = $1::regclass
          AND i.indisprimary
        ORDER BY array_position(i.indkey, a.attnum)
        """,
        table,
    )
    return [row["column_name"] for row in rows]


async def fetch_rows(
    conn: asyncpg.Connection,
    table: str,
    columns: list[str],
) -> list[asyncpg.Record]:
    column_sql = ", ".join(quote_ident(column) for column in columns)
    return await conn.fetch(f"SELECT {column_sql} FROM {quote_ident(table)} ORDER BY id")


async def fetch_count(conn: asyncpg.Connection, table: str) -> int:
    return await conn.fetchval(f"SELECT COUNT(*) FROM {quote_ident(table)}")


async def sync_table(
    local_conn: asyncpg.Connection,
    remote_conn: asyncpg.Connection,
    table: str,
) -> tuple[int, int, list[str]]:
    local_columns = await fetch_columns(local_conn, table)
    remote_columns = await fetch_columns(remote_conn, table)
    pk_columns = await fetch_primary_key_columns(remote_conn, table)

    if not pk_columns:
        raise RuntimeError(f"Table {table} has no primary key on remote.")

    if pk_columns != ["id"]:
        raise RuntimeError(f"Table {table} has unsupported primary key columns: {pk_columns}")

    common_columns = [column for column in local_columns if column in remote_columns]
    if not common_columns:
        raise RuntimeError(f"Table {table} has no common columns between local and remote.")

    rows = await fetch_rows(local_conn, table, common_columns)
    before_count = await fetch_count(remote_conn, table)

    if rows:
        column_sql = ", ".join(quote_ident(column) for column in common_columns)
        placeholders = ", ".join(f"${index}" for index in range(1, len(common_columns) + 1))
        update_columns = [column for column in common_columns if column != "id"]
        update_sql = ", ".join(
            f"{quote_ident(column)} = EXCLUDED.{quote_ident(column)}" for column in update_columns
        )
        sql = (
            f"INSERT INTO {quote_ident(table)} ({column_sql}) VALUES ({placeholders}) "
            f"ON CONFLICT ({quote_ident('id')}) DO UPDATE SET {update_sql}"
        )
        await remote_conn.executemany(sql, [tuple(row[column] for column in common_columns) for row in rows])
        await reset_sequence_if_needed(remote_conn, table)

    after_count = await fetch_count(remote_conn, table)
    return before_count, after_count, common_columns


async def reset_sequence_if_needed(remote_conn: asyncpg.Connection, table: str) -> None:
    sequence_name = await remote_conn.fetchval(
        "SELECT pg_get_serial_sequence($1, 'id')",
        table,
    )
    if not sequence_name:
        return

    await remote_conn.execute(
        f"""
        SELECT setval(
            {quote_literal(sequence_name)},
            COALESCE((SELECT MAX(id) FROM {quote_ident(table)}), 1),
            true
        )
        """
    )


def quote_literal(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


async def sync(
    local_env: Path,
    remote_env: Path,
    tables: list[str],
    apply_changes: bool,
) -> int:
    local_url = get_database_url(local_env)
    remote_url = get_database_url(remote_env)

    local_conn = await asyncpg.connect(local_url)
    remote_conn = await asyncpg.connect(remote_url)

    try:
        print("Tables selected")
        for table in tables:
            print(f"  - {table}")
        print()

        if not apply_changes:
            print("Dry run only. Re-run with --apply to upsert rows on Supabase.")
            for table in tables:
                local_count, remote_count = await asyncio.gather(
                    fetch_count(local_conn, table),
                    fetch_count(remote_conn, table),
                )
                print(f"  - {table}: local={local_count}, remote={remote_count}")
            return 0

        async with remote_conn.transaction():
            for table in tables:
                before_count, after_count, common_columns = await sync_table(
                    local_conn,
                    remote_conn,
                    table,
                )
                print(
                    f"  - {table}: remote {before_count} -> {after_count} rows "
                    f"using {len(common_columns)} columns"
                )

        return 0
    finally:
        await local_conn.close()
        await remote_conn.close()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Upsert selected local PostgreSQL tables into Supabase."
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
        "--apply",
        action="store_true",
        help="Apply upserts on Supabase. Without this flag the script is dry-run only.",
    )
    parser.add_argument(
        "--tables",
        nargs="+",
        default=DEFAULT_TABLES,
        help="Ordered list of tables to sync.",
    )
    return parser.parse_args()


if __name__ == "__main__":
    args = parse_args()
    raise SystemExit(
        asyncio.run(
            sync(
                local_env=args.local_env,
                remote_env=args.remote_env,
                tables=args.tables,
                apply_changes=args.apply,
            )
        )
    )
