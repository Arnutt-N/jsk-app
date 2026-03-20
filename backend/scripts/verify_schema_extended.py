from __future__ import annotations

import argparse
import asyncio
from pathlib import Path

from _cli_utils import emit_report, ensure_backend_on_path, resolve_output_path
from scripts._script_safety import print_script_header

ensure_backend_on_path()


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Verify service-request related schema additions.")
    parser.add_argument(
        "--output",
        type=Path,
        help="Optional path to write the verification report. Defaults to stdout only.",
    )
    return parser


async def collect_report_lines() -> list[str]:
    from sqlalchemy import text

    from app.db.session import AsyncSessionLocal

    output: list[str] = []
    try:
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                text(
                    "SELECT column_name FROM information_schema.columns "
                    "WHERE table_name='service_requests'"
                )
            )
            columns = [row[0] for row in result.fetchall()]
            output.append(f"service_requests columns: {columns}")

            for column in ["priority", "due_date", "completed_at", "assigned_by_id"]:
                if column in columns:
                    output.append(f"Column '{column}' exists.")
                else:
                    output.append(f"Column '{column}' is MISSING.")

            result = await db.execute(
                text("SELECT count(*) FROM information_schema.tables WHERE table_name='request_comments'")
            )
            if result.scalar() > 0:
                output.append("Table 'request_comments' exists.")
            else:
                output.append("Table 'request_comments' is MISSING.")
    except Exception as exc:
        output.append(f"Error during verification: {exc}")
    return output


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    output_path = resolve_output_path(args.output)
    print_script_header("Verify extended request schema", apply=False)
    emit_report(asyncio.run(collect_report_lines()), output_path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
