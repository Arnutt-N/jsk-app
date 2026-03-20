"""
Import data from CSV to auto_replies table.
Based on legacy Google Apps Script format (enhancedQAMessages.gs)
"""

from __future__ import annotations

import argparse
import asyncio
import csv
import sys
from pathlib import Path

from _cli_utils import BACKEND_DIR, ensure_backend_on_path

REPO_ROOT = BACKEND_DIR.parent
DEFAULT_CSV_FILE = REPO_ROOT / "examples" / "moj-skn-bot-examples.csv"

ensure_backend_on_path()

# NOTE: For Flex images, LINE requires HTTPS URLs accessible from LINE servers.
# We will store the original URLs directly in the payload.
# If storing locally, we'd need an absolute HTTPS URL to our media endpoint.


def resolve_csv_path(raw_path: str | None = None) -> Path:
    if not raw_path:
        return DEFAULT_CSV_FILE
    candidate = Path(raw_path).expanduser()
    if not candidate.is_absolute():
        candidate = Path.cwd() / candidate
    return candidate.resolve()


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Import auto-reply data from CSV.")
    parser.add_argument(
        "csv_file",
        nargs="?",
        help="Optional path to a CSV file. Defaults to examples/moj-skn-bot-examples.csv",
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Write changes to the active database. Without this flag the script runs in dry-run mode.",
    )
    return parser


def load_rows(csv_path: Path) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    with csv_path.open("r", encoding="utf-8-sig") as file_obj:
        reader = csv.DictReader(file_obj)
        for row in reader:
            rows.append(row)
    return rows


def summarize_rows(rows: list[dict[str, str]]) -> dict[str, int]:
    summary = {
        "total_rows": len(rows),
        "text_rows": 0,
        "flex_rows": 0,
        "skipped_rows": 0,
        "unknown_type_rows": 0,
    }

    for row in rows:
        intent = row.get("intent", "").strip()
        msg_type = row.get("msg_type", "").strip().lower()
        if not intent or not msg_type:
            summary["skipped_rows"] += 1
            continue
        if msg_type == "text":
            summary["text_rows"] += 1
            continue
        if msg_type == "flex":
            summary["flex_rows"] += 1
            continue
        summary["unknown_type_rows"] += 1

    return summary


def resolve_active_database_target() -> tuple[Path, str]:
    from app.core.env import resolve_env_file
    from scripts._db_tools import describe_database_url, get_database_url

    env_path = resolve_env_file().resolve()
    return env_path, describe_database_url(get_database_url(env_path))


def print_import_plan(
    csv_path: Path,
    summary: dict[str, int],
    env_path: Path,
    database_target: str,
    *,
    apply: bool,
) -> None:
    mode = "APPLY" if apply else "DRY RUN"
    print(f"Mode      : {mode}")
    print(f"CSV file  : {csv_path}")
    print(f"ENV file  : {env_path}")
    print(f"DB target : {database_target}")
    print(f"Rows      : {summary['total_rows']}")
    print(f"Text rows : {summary['text_rows']}")
    print(f"Flex rows : {summary['flex_rows']}")
    print(f"Skipped   : {summary['skipped_rows']}")
    print(f"Unknown   : {summary['unknown_type_rows']}")


def create_flex_bubble(image_url, alt_text, aspect_ratio="3:2", size="full", aspect_mode="cover"):
    """
    Create a single bubble for Flex Carousel (matches legacy createFlexImageCarousel bubble structure)
    """
    final_aspect_ratio = aspect_ratio if aspect_ratio else "3:2"

    return {
        "type": "bubble",
        "hero": {
            "type": "image",
            "url": image_url.strip(),
            "size": size or "full",
            "aspectMode": aspect_mode or "cover",
            "aspectRatio": final_aspect_ratio,
            "action": {
                "type": "uri",
                "uri": image_url.strip(),
            },
        },
    }


def create_flex_carousel_payload(
    image_urls: list,
    alt_text: str,
    aspect_ratio: str | None = None,
    size: str | None = None,
    aspect_mode: str | None = None,
):
    """
    Create Flex Carousel payload matching legacy structure.
    This is the "contents" field for a FlexMessage.
    Structure: {"type": "carousel", "contents": [bubbles]}
    """
    bubbles = []
    for url in image_urls:
        if url and url.strip():
            bubbles.append(create_flex_bubble(url, alt_text, aspect_ratio, size, aspect_mode))

    if not bubbles:
        return None

    if len(bubbles) == 1:
        return bubbles[0]

    return {
        "type": "carousel",
        "contents": bubbles,
    }


async def process_row(db, row, row_num):
    from sqlalchemy.future import select

    from app.models.auto_reply import AutoReply, MatchType, ReplyType

    intent = row.get("intent", "").strip()
    msg_type = row.get("msg_type", "").strip()
    response_text = row.get("response", "").strip()
    image_data = row.get("image_data", "").strip()
    full_size_urls_str = row.get("full_size_urls", "").strip()
    aspect_ratio = row.get("aspect_ratio", "3:2").strip()
    size = row.get("size", "full").strip()
    aspect_mode = row.get("aspect_mode", "cover").strip()

    if not intent or not msg_type:
        return

    print(f"[{row_num}] Processing: {intent} ({msg_type})")

    existing = await db.execute(select(AutoReply).filter(AutoReply.keyword == intent))
    if existing.scalars().first():
        print(f"       Skipped (Duplicate): {intent}")
        return

    if msg_type == "text":
        reply = AutoReply(
            keyword=intent,
            match_type=MatchType.EXACT,
            reply_type=ReplyType.TEXT,
            text_content=response_text,
        )
        db.add(reply)
        print("       + Added TEXT")
        return

    if msg_type == "flex":
        urls_str = full_size_urls_str or image_data
        if not urls_str:
            print("       ! Warning: No image URLs for flex, skipping")
            return

        image_urls = [url.strip() for url in urls_str.split(",") if url.strip()]
        payload = create_flex_carousel_payload(
            image_urls=image_urls,
            alt_text=intent,
            aspect_ratio=aspect_ratio,
            size=size,
            aspect_mode=aspect_mode,
        )

        if not payload:
            print("       ! Warning: Failed to create Flex payload")
            return

        reply = AutoReply(
            keyword=intent,
            match_type=MatchType.EXACT,
            reply_type=ReplyType.FLEX,
            text_content=response_text,
            payload=payload,
        )
        db.add(reply)
        print(f"       + Added FLEX ({len(image_urls)} images)")


async def run_import(csv_path: Path, *, apply: bool) -> int:
    try:
        rows = load_rows(csv_path)
    except Exception as exc:
        print(f"Error reading CSV: {exc}")
        return 1

    env_path, database_target = resolve_active_database_target()
    summary = summarize_rows(rows)
    print_import_plan(csv_path, summary, env_path, database_target, apply=apply)

    if not apply:
        print("\nDry run only. Re-run with --apply to write to the active database.")
        return 0

    from app.db.session import AsyncSessionLocal

    async with AsyncSessionLocal() as db:
        print(f"\nFound {len(rows)} rows. Importing...\n")

        for index, row in enumerate(rows, 1):
            await process_row(db, row, index)

        await db.commit()
        print("\nImport completed.")
        return 0


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    csv_path = resolve_csv_path(args.csv_file)

    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    return asyncio.run(run_import(csv_path, apply=args.apply))


if __name__ == "__main__":
    raise SystemExit(main())
