from __future__ import annotations

import argparse
import asyncio
from pathlib import Path

from _cli_utils import emit_report, ensure_backend_on_path, resolve_output_path
from scripts._script_safety import print_script_header

ensure_backend_on_path()


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Verify core database tables and counts.")
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
                text("SELECT table_name FROM information_schema.tables WHERE table_schema='public'")
            )
            tables = [row[0] for row in result.fetchall()]
            output.append(f"Tables found: {tables}")

            if "auto_replies" in tables:
                count = await db.execute(text("SELECT count(*) FROM auto_replies"))
                output.append(f"Auto Replies: {count.scalar()} rows")
            else:
                output.append("Table 'auto_replies' NOT found.")

            if "media_files" in tables:
                count = await db.execute(text("SELECT count(*) FROM media_files"))
                output.append(f"Media Files: {count.scalar()} rows")
            else:
                output.append("Table 'media_files' NOT found.")
    except Exception as exc:
        output.append(f"Error: {exc}")
    return output


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    output_path = resolve_output_path(args.output)
    print_script_header("Verify core database tables", apply=False)
    emit_report(asyncio.run(collect_report_lines()), output_path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
