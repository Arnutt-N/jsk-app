from __future__ import annotations

import argparse
import asyncio
from pathlib import Path

import asyncpg

from _db_tools import LOCAL_ENV_PATH, REMOTE_ENV_PATH, get_database_url


CREATE_GEOGRAPHY_SQL = """
CREATE TABLE IF NOT EXISTS provinces (
    id INTEGER PRIMARY KEY,
    name_th VARCHAR NOT NULL,
    name_en VARCHAR
);

CREATE TABLE IF NOT EXISTS districts (
    id INTEGER PRIMARY KEY,
    province_id INTEGER REFERENCES provinces(id),
    name_th VARCHAR NOT NULL,
    name_en VARCHAR,
    code VARCHAR
);

CREATE TABLE IF NOT EXISTS sub_districts (
    id INTEGER PRIMARY KEY,
    district_id INTEGER REFERENCES districts(id),
    name_th VARCHAR NOT NULL,
    name_en VARCHAR,
    postal_code VARCHAR,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION
);

CREATE INDEX IF NOT EXISTS ix_provinces_name_th ON provinces (name_th);
CREATE INDEX IF NOT EXISTS ix_districts_province_id ON districts (province_id);
CREATE INDEX IF NOT EXISTS ix_districts_name_th ON districts (name_th);
CREATE INDEX IF NOT EXISTS ix_sub_districts_district_id ON sub_districts (district_id);
CREATE INDEX IF NOT EXISTS ix_sub_districts_name_th ON sub_districts (name_th);
"""


async def fetch_rows(conn: asyncpg.Connection, table: str) -> list[asyncpg.Record]:
    return await conn.fetch(f"SELECT * FROM {table} ORDER BY id")


async def ensure_remote_schema(remote_conn: asyncpg.Connection) -> None:
    await remote_conn.execute(CREATE_GEOGRAPHY_SQL)


async def sync_table(
    remote_conn: asyncpg.Connection,
    table: str,
    rows: list[asyncpg.Record],
) -> int:
    if not rows:
        return 0

    if table == "provinces":
        sql = """
            INSERT INTO provinces (id, name_th, name_en)
            VALUES ($1, $2, $3)
            ON CONFLICT (id) DO UPDATE
            SET name_th = EXCLUDED.name_th,
                name_en = EXCLUDED.name_en
        """
        values = [(row["id"], row["name_th"], row["name_en"]) for row in rows]
    elif table == "districts":
        sql = """
            INSERT INTO districts (id, province_id, name_th, name_en, code)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (id) DO UPDATE
            SET province_id = EXCLUDED.province_id,
                name_th = EXCLUDED.name_th,
                name_en = EXCLUDED.name_en,
                code = EXCLUDED.code
        """
        values = [
            (row["id"], row["province_id"], row["name_th"], row["name_en"], row["code"])
            for row in rows
        ]
    elif table == "sub_districts":
        sql = """
            INSERT INTO sub_districts (
                id,
                district_id,
                name_th,
                name_en,
                postal_code,
                latitude,
                longitude
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            ON CONFLICT (id) DO UPDATE
            SET district_id = EXCLUDED.district_id,
                name_th = EXCLUDED.name_th,
                name_en = EXCLUDED.name_en,
                postal_code = EXCLUDED.postal_code,
                latitude = EXCLUDED.latitude,
                longitude = EXCLUDED.longitude
        """
        values = [
            (
                row["id"],
                row["district_id"],
                row["name_th"],
                row["name_en"],
                row["postal_code"],
                row["latitude"],
                row["longitude"],
            )
            for row in rows
        ]
    else:
        raise ValueError(f"Unsupported table: {table}")

    await remote_conn.executemany(sql, values)
    return len(values)


async def fetch_counts(conn: asyncpg.Connection) -> dict[str, int]:
    counts: dict[str, int] = {}
    for table in ("provinces", "districts", "sub_districts"):
        exists = await conn.fetchval(
            """
            SELECT EXISTS (
                SELECT 1
                FROM information_schema.tables
                WHERE table_schema = 'public'
                  AND table_name = $1
            )
            """,
            table,
        )
        if not exists:
            counts[table] = 0
            continue

        counts[table] = await conn.fetchval(f"SELECT COUNT(*) FROM {table}")
    return counts


async def sync(local_env: Path, remote_env: Path, apply_changes: bool) -> int:
    local_url = get_database_url(local_env)
    remote_url = get_database_url(remote_env)

    local_conn = await asyncpg.connect(local_url)
    remote_conn = await asyncpg.connect(remote_url)

    try:
        before = await fetch_counts(remote_conn)
        local_rows = {
            "provinces": await fetch_rows(local_conn, "provinces"),
            "districts": await fetch_rows(local_conn, "districts"),
            "sub_districts": await fetch_rows(local_conn, "sub_districts"),
        }

        print("Local geography counts")
        for table, rows in local_rows.items():
            print(f"  - {table}: {len(rows)}")
        print()

        print("Remote geography counts before sync")
        for table, count in before.items():
            print(f"  - {table}: {count}")
        print()

        if not apply_changes:
            print("Dry run only. Re-run with --apply to create tables and upsert data on Supabase.")
            return 0

        await ensure_remote_schema(remote_conn)
        async with remote_conn.transaction():
            inserted = {}
            for table in ("provinces", "districts", "sub_districts"):
                inserted[table] = await sync_table(remote_conn, table, local_rows[table])

        after = await fetch_counts(remote_conn)

        print("Applied geography sync")
        for table, count in inserted.items():
            print(f"  - {table}: processed {count} rows")
        print()

        print("Remote geography counts after sync")
        for table, count in after.items():
            print(f"  - {table}: {count}")

        return 0
    finally:
        await local_conn.close()
        await remote_conn.close()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Create/upsert geography tables from local PostgreSQL into Supabase."
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
        help="Apply remote schema creation and upsert data. Without this flag the script is dry-run only.",
    )
    return parser.parse_args()


if __name__ == "__main__":
    args = parse_args()
    raise SystemExit(asyncio.run(sync(args.local_env, args.remote_env, args.apply)))
