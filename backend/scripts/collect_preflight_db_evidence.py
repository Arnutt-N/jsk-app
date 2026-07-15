"""
Read-only Phase 0 pre-flight DB evidence collector.

Connects to the selected target (local/remote) with a bounded timeout, issues
only SELECT statements against catalog/statistics views, and reports
aggregate evidence (schema, alembic revision, extension status, table sizes,
slow-statement fingerprints, ORM/live-schema presence gaps). Never prints
database URLs, hostnames, credentials, query text, bind values, or row data.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import asyncpg

from _cli_utils import emit_report, ensure_backend_on_path, resolve_output_path
from db_target import TARGET_ENV_FILES, get_target_env_path
from show_active_db_target import read_database_url

ensure_backend_on_path()

CONNECT_TIMEOUT_SECONDS = 10
DEFAULT_LIMIT = 20


class UsageError(Exception):
    """Raised for configuration/usage problems (maps to exit code 2)."""


def to_asyncpg_dsn(database_url: str) -> str:
    """Convert a SQLAlchemy-style DATABASE_URL into a plain asyncpg DSN."""
    return database_url.replace("postgresql+asyncpg://", "postgresql://", 1)


def get_orm_table_names(target: str) -> set[str]:
    """Import ORM models (without app.main) to list declared table names."""
    import os

    os.environ["ENV_FILE"] = str(get_target_env_path(target))

    from app.db.base import Base
    import app.models  # noqa: F401  (registers models on Base.metadata)

    return set(Base.metadata.tables.keys())


async def fetch_schema_and_version(conn: asyncpg.Connection) -> dict[str, str]:
    row = await conn.fetchrow("SELECT current_schema() AS schema, version() AS version")
    return {"schema": row["schema"], "server_version": row["version"]}


async def fetch_alembic_revisions(conn: asyncpg.Connection) -> list[str]:
    exists = await conn.fetchval(
        """
        SELECT EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = 'alembic_version'
        )
        """
    )
    if not exists:
        return []
    rows = await conn.fetch("SELECT version_num FROM alembic_version")
    return [row["version_num"] for row in rows]


async def fetch_pg_stat_statements_status(conn: asyncpg.Connection) -> dict[str, object]:
    version = await conn.fetchval(
        "SELECT extversion FROM pg_extension WHERE extname = 'pg_stat_statements'"
    )
    return {"installed": version is not None, "version": version}


async def fetch_top_tables(conn: asyncpg.Connection, limit: int) -> list[dict[str, object]]:
    rows = await conn.fetch(
        """
        SELECT
            c.relname AS table_name,
            pg_total_relation_size(c.oid) AS total_bytes,
            pg_size_pretty(pg_total_relation_size(c.oid)) AS total_size,
            c.reltuples::bigint AS estimated_rows
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relkind = 'r' AND n.nspname = 'public'
        ORDER BY pg_total_relation_size(c.oid) DESC
        LIMIT $1
        """,
        limit,
    )
    return [
        {
            "table_name": row["table_name"],
            "total_size": row["total_size"],
            "total_bytes": row["total_bytes"],
            "estimated_rows": row["estimated_rows"],
        }
        for row in rows
    ]


async def fetch_slow_statements(
    conn: asyncpg.Connection, limit: int, extension_installed: bool
) -> list[dict[str, object]]:
    if not extension_installed:
        return []
    # Deliberately select only queryid/calls/timing columns — never `query`.
    rows = await conn.fetch(
        """
        SELECT queryid, calls, total_exec_time, mean_exec_time
        FROM pg_stat_statements
        ORDER BY total_exec_time DESC
        LIMIT $1
        """,
        limit,
    )
    return [
        {
            "queryid": str(row["queryid"]),
            "calls": row["calls"],
            "total_exec_time_ms": row["total_exec_time"],
            "mean_exec_time_ms": row["mean_exec_time"],
        }
        for row in rows
    ]


async def fetch_live_table_names(conn: asyncpg.Connection) -> set[str]:
    rows = await conn.fetch(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'"
    )
    return {row["table_name"] for row in rows}


async def collect_evidence(target: str, limit: int) -> dict[str, object]:
    env_path = get_target_env_path(target)
    try:
        database_url = read_database_url(env_path)
    except (FileNotFoundError, RuntimeError) as exc:
        raise UsageError(
            f"cannot resolve DATABASE_URL for target '{target}' "
            f"(env file missing or malformed): {exc.__class__.__name__}"
        ) from exc
    dsn = to_asyncpg_dsn(database_url)

    try:
        conn = await asyncio.wait_for(
            asyncpg.connect(dsn, timeout=CONNECT_TIMEOUT_SECONDS),
            timeout=CONNECT_TIMEOUT_SECONDS,
        )
    except Exception as exc:  # noqa: BLE001 - redact, never surface DSN/stack
        raise ConnectionError(
            f"cannot connect to target '{target}' database within "
            f"{CONNECT_TIMEOUT_SECONDS}s"
        ) from exc

    try:
        try:
            await conn.execute("SET default_transaction_read_only = on")
        except Exception:
            # Defense in depth only; some managed/replica connections may
            # already be read-only or disallow SET — never fatal.
            pass

        schema_info = await fetch_schema_and_version(conn)
        alembic_revisions = await fetch_alembic_revisions(conn)
        pg_stat_statements = await fetch_pg_stat_statements_status(conn)
        top_tables = await fetch_top_tables(conn, limit)
        slow_statements = await fetch_slow_statements(
            conn, limit, bool(pg_stat_statements["installed"])
        )
        live_tables = await fetch_live_table_names(conn)
    finally:
        await conn.close()

    # ORM import can fail (e.g. incomplete env file -> settings validation
    # error) and such exceptions may echo env-file values. Degrade gracefully
    # and report only the exception class name — never the message.
    try:
        orm_tables = get_orm_table_names(target)
    except Exception as exc:  # noqa: BLE001 - redact, never surface values
        missing_from_live = None
        orm_comparison = f"unavailable ({exc.__class__.__name__})"
    else:
        missing_from_live = sorted(orm_tables - live_tables)
        orm_comparison = "ok"

    return {
        "target": target,
        "collected_at_utc": datetime.now(timezone.utc).isoformat(),
        "schema": schema_info,
        "alembic_revisions": alembic_revisions,
        "pg_stat_statements": pg_stat_statements,
        "top_tables": top_tables,
        "slow_statements": slow_statements,
        "orm_comparison": orm_comparison,
        "orm_tables_missing_from_live": missing_from_live,
    }


def render_markdown(evidence: dict[str, object]) -> str:
    lines: list[str] = []
    lines.append("# Pre-Flight DB Evidence")
    lines.append("")
    lines.append(f"- Target        : {evidence['target']}")
    lines.append(f"- Collected (UTC): {evidence['collected_at_utc']}")
    lines.append("")

    schema = evidence["schema"]
    lines.append("## Schema & Server")
    lines.append(f"- Current schema : {schema['schema']}")
    lines.append(f"- Server version : {schema['server_version']}")
    lines.append("")

    revisions = evidence["alembic_revisions"]
    lines.append("## Alembic Revision")
    if revisions:
        for rev in revisions:
            lines.append(f"- {rev}")
    else:
        lines.append("- not stamped (no `alembic_version` table found)")
    lines.append("")

    pgss = evidence["pg_stat_statements"]
    lines.append("## pg_stat_statements")
    if pgss["installed"]:
        lines.append(f"- Installed, version {pgss['version']}")
    else:
        lines.append("- not installed")
    lines.append("")

    top_tables = evidence["top_tables"]
    lines.append(f"## Top {len(top_tables)} Tables by Size (public schema)")
    if top_tables:
        lines.append("| Table | Total Size | Estimated Rows |")
        lines.append("| --- | --- | --- |")
        for row in top_tables:
            lines.append(
                f"| {row['table_name']} | {row['total_size']} | {row['estimated_rows']} |"
            )
    else:
        lines.append("- no tables found in `public` schema")
    lines.append("")

    slow_statements = evidence["slow_statements"]
    lines.append("## Slow Statements (pg_stat_statements)")
    if not pgss["installed"]:
        lines.append("- skipped: pg_stat_statements not installed")
    elif slow_statements:
        lines.append("| Query ID | Calls | Total Exec (ms) | Mean Exec (ms) |")
        lines.append("| --- | --- | --- | --- |")
        for row in slow_statements:
            lines.append(
                f"| {row['queryid']} | {row['calls']} | "
                f"{row['total_exec_time_ms']:.2f} | {row['mean_exec_time_ms']:.2f} |"
            )
    else:
        lines.append("- no statements recorded")
    lines.append("")

    missing = evidence["orm_tables_missing_from_live"]
    lines.append("## ORM Tables Missing From Live Schema")
    if missing is None:
        lines.append(f"- comparison {evidence['orm_comparison']}")
    elif missing:
        for name in missing:
            lines.append(f"- {name} (declared in ORM metadata, not found on live schema)")
    else:
        lines.append("- none: all ORM-declared tables are present")
    lines.append("")

    return "\n".join(lines)


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Collect read-only Phase 0 pre-flight DB evidence "
            "(schema, alembic revision, extension status, table sizes, "
            "slow-statement fingerprints, ORM/live-schema presence gaps)."
        )
    )
    parser.add_argument(
        "--target",
        choices=sorted(TARGET_ENV_FILES.keys()),
        default="local",
        help="Database target to inspect.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=DEFAULT_LIMIT,
        help=f"Max rows for top-tables and slow-statements sections (default {DEFAULT_LIMIT}).",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Emit machine-readable JSON instead of markdown.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        help="Optional path to also write the report to.",
    )
    return parser.parse_args(argv)


def main() -> int:
    args = parse_args()

    if args.limit < 1:
        print("error: --limit must be a positive integer", file=sys.stderr)
        return 2

    output_path = resolve_output_path(args.output)

    try:
        evidence = asyncio.run(collect_evidence(args.target, args.limit))
    except ConnectionError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    except (UsageError, ValueError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2
    except Exception as exc:  # noqa: BLE001 - global no-stack-trace guarantee
        print(f"error: unexpected failure ({exc.__class__.__name__})", file=sys.stderr)
        return 1

    if args.json:
        report = json.dumps(evidence, indent=2, default=str)
    else:
        report = render_markdown(evidence)

    emit_report([report], output_path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
