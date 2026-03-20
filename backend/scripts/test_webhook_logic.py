from __future__ import annotations

import argparse
import asyncio

from _cli_utils import ensure_backend_on_path

from scripts._script_safety import print_script_header

ensure_backend_on_path()


DEFAULT_TEXTS = [
    "สวัสดี",
    "ขอสวัสดีครับ",
    "ราคาเท่าไหร่",
    "test",
]


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Probe keyword-matching logic against the DB.")
    parser.add_argument(
        "texts",
        nargs="*",
        help="Optional user texts to test. Defaults to a small sample set.",
    )
    return parser


async def test_keyword_logic(user_text: str) -> None:
    from sqlalchemy import func, literal, select
    from sqlalchemy.orm import selectinload

    from app.db.session import AsyncSessionLocal
    from app.models.intent import IntentKeyword, MatchType

    print(f"\n--- Testing User Text: '{user_text}' ---")
    async with AsyncSessionLocal() as db:
        stmt = (
            select(IntentKeyword)
            .options(selectinload(IntentKeyword.category))
            .filter(
                IntentKeyword.keyword == user_text,
                IntentKeyword.match_type == MatchType.EXACT,
            )
        )
        result = await db.execute(stmt)
        match = result.scalars().first()

        if match:
            print(f"EXACT MATCH: keyword='{match.keyword}' -> category='{match.category.name}'")
            return

        print("Checking CONTAINS match...")
        stmt = (
            select(IntentKeyword)
            .options(selectinload(IntentKeyword.category))
            .filter(
                literal(user_text).ilike(func.concat("%", IntentKeyword.keyword, "%")),
                IntentKeyword.match_type == MatchType.CONTAINS,
            )
            .limit(1)
        )
        result = await db.execute(stmt)
        match = result.scalars().first()

        if match:
            print(
                f"CONTAINS MATCH: keyword='{match.keyword}' (in user text) -> category='{match.category.name}'"
            )
            return

        print("NO MATCH found in Intent system.")


async def main_async(texts: list[str]) -> int:
    print_script_header("Probe webhook keyword logic", apply=False)
    for text_value in texts:
        await test_keyword_logic(text_value)
    return 0


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    texts = args.texts or list(DEFAULT_TEXTS)
    return asyncio.run(main_async(texts))


if __name__ == "__main__":
    raise SystemExit(main())
