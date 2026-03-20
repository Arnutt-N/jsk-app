"""
Import intent data from CSV file.
CSV format: intent_category,intent,msg_type,response,...
"""

from __future__ import annotations

import argparse
import asyncio
import csv
import os
from pathlib import Path

from dotenv import load_dotenv
from _cli_utils import BACKEND_DIR, ensure_backend_on_path

from scripts._script_safety import print_dry_run_hint, print_script_header


REPO_ROOT = BACKEND_DIR.parent
DEFAULT_CSV_FILE = REPO_ROOT / "examples" / "moj-skn-bot-examples.csv"
ensure_backend_on_path()


def resolve_csv_path(raw_path: str | None = None) -> Path:
    if not raw_path:
        return DEFAULT_CSV_FILE
    candidate = Path(raw_path).expanduser()
    if not candidate.is_absolute():
        candidate = Path.cwd() / candidate
    return candidate.resolve()


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Replace intent tables from a CSV file.")
    parser.add_argument(
        "csv_file",
        nargs="?",
        help="Optional path to a CSV file. Defaults to examples/moj-skn-bot-examples.csv",
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Delete and replace existing intent data in the active database.",
    )
    return parser


def get_database_url() -> str:
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        raise RuntimeError("DATABASE_URL is required")
    return db_url


def parse_csv(csv_path: Path) -> tuple[dict[str, dict[str, set]], int, int]:
    categories_dict: dict[str, dict[str, set]] = {}
    row_count = 0
    skipped_count = 0

    with csv_path.open("r", encoding="utf-8-sig") as file_obj:
        reader = csv.DictReader(file_obj)
        for row in reader:
            category_name = row.get("intent_category", "").strip()
            keyword = row.get("intent", "").strip()
            msg_type = row.get("msg_type", "text").strip().lower()
            response_text = row.get("response", "").strip()

            if not category_name or not keyword:
                skipped_count += 1
                continue

            row_count += 1
            if category_name not in categories_dict:
                categories_dict[category_name] = {"keywords": set(), "responses": set()}

            categories_dict[category_name]["keywords"].add(keyword)
            if response_text:
                categories_dict[category_name]["responses"].add((msg_type, response_text))

    return categories_dict, row_count, skipped_count


def print_import_plan(
    csv_path: Path,
    categories_dict: dict[str, dict[str, set]],
    row_count: int,
    skipped_count: int,
    *,
    apply: bool,
) -> None:
    total_keywords = sum(len(data["keywords"]) for data in categories_dict.values())
    total_responses = sum(len(data["responses"]) for data in categories_dict.values())
    print(f"CSV file   : {csv_path}")
    print(f"Rows       : {row_count}")
    print(f"Skipped    : {skipped_count}")
    print(f"Categories : {len(categories_dict)}")
    print(f"Keywords   : {total_keywords}")
    print(f"Responses  : {total_responses}")
    if not apply:
        print("Effect     : would delete all intent categories, keywords, and responses before re-importing")


async def import_from_csv(csv_path: Path, *, apply: bool) -> int:
    from sqlalchemy import text
    from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
    from sqlalchemy.orm import sessionmaker

    from app.models.intent import IntentCategory, IntentKeyword, IntentResponse, MatchType, ReplyType

    env_path, _ = print_script_header("Replace intent tables from CSV", apply=apply)

    if not csv_path.exists():
        print(f"CSV file not found: {csv_path}")
        return 1

    try:
        categories_dict, row_count, skipped_count = parse_csv(csv_path)
    except Exception as exc:
        print(f"Failed to parse CSV: {exc}")
        return 1

    print_import_plan(csv_path, categories_dict, row_count, skipped_count, apply=apply)
    if not apply:
        print_dry_run_hint()
        return 0

    load_dotenv(env_path, override=True)
    engine = create_async_engine(get_database_url(), echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as session:
        try:
            print("\nClearing existing intent data...")
            await session.execute(text("DELETE FROM intent_responses"))
            await session.execute(text("DELETE FROM intent_keywords"))
            await session.execute(text("DELETE FROM intent_categories"))
            await session.commit()
            print("Existing data cleared.\n")

            for category_name, data in categories_dict.items():
                print(f"Creating category: {category_name}")
                category = IntentCategory(
                    name=category_name,
                    description="Imported from CSV",
                    is_active=True,
                )
                session.add(category)
                await session.flush()

                for keyword in data["keywords"]:
                    session.add(
                        IntentKeyword(
                            category_id=category.id,
                            keyword=keyword,
                            match_type=MatchType.CONTAINS,
                        )
                    )

                for idx, (msg_type, response_text) in enumerate(data["responses"]):
                    reply_type_map = {
                        "text": ReplyType.TEXT,
                        "flex": ReplyType.FLEX,
                        "image": ReplyType.IMAGE,
                        "sticker": ReplyType.STICKER,
                        "video": ReplyType.VIDEO,
                    }
                    reply_type = reply_type_map.get(msg_type, ReplyType.TEXT)
                    session.add(
                        IntentResponse(
                            category_id=category.id,
                            reply_type=reply_type,
                            text_content=response_text if msg_type == "text" else None,
                            payload=None,
                            order=idx,
                            is_active=True,
                        )
                    )

                print(f"  Added {len(data['keywords'])} keywords, {len(data['responses'])} responses")

            await session.commit()
            print(f"\nImport complete. Categories: {len(categories_dict)}. Rows processed: {row_count}")
            return 0
        except Exception as exc:
            await session.rollback()
            print(f"\nImport failed: {exc}")
            raise
        finally:
            await engine.dispose()


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    return asyncio.run(import_from_csv(resolve_csv_path(args.csv_file), apply=args.apply))


if __name__ == "__main__":
    raise SystemExit(main())
