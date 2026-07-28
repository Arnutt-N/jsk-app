"""
Pre-flight validation for LINE ID pseudonym prepare-indexes migration.

Checks three conditions that must hold before applying
d5e6f7g8h9i0_line_id_pseudonym_prepare_indexes.py:

  1. Hash coverage  — every user with line_user_id has line_user_id_hash
  2. No duplicate open chat sessions per user_id
  3. No duplicate rich menu links per user_id

Read-only: never modifies data. Exit code 0 = safe to migrate, 1 = blockers.

Usage:
  python scripts/preflight_pseudonym_indexes.py
  python scripts/preflight_pseudonym_indexes.py --verbose
"""

from __future__ import annotations

import argparse
import asyncio
import sys

from _cli_utils import ensure_backend_on_path

ensure_backend_on_path()

from scripts._script_safety import get_active_database_target, print_dry_run_hint


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Validate readiness for pseudonym prepare-indexes migration."
    )
    parser.add_argument(
        "--verbose", "-v", action="store_true", help="Show sample rows for failures."
    )
    return parser


async def check_hash_coverage(db, verbose: bool) -> list[str]:
    from sqlalchemy import text

    issues: list[str] = []

    result = await db.execute(text(
        "SELECT COUNT(*) FROM users WHERE line_user_id IS NOT NULL AND line_user_id_hash IS NULL"
    ))
    missing = result.scalar()

    result = await db.execute(text(
        "SELECT COUNT(*) FROM users WHERE line_user_id IS NOT NULL"
    ))
    total = result.scalar()

    covered = total - missing
    pct = (covered / total * 100) if total > 0 else 100.0
    print(f"  Users with line_user_id: {total}")
    print(f"  Hash populated:          {covered} ({pct:.1f}%)")
    print(f"  Hash missing:            {missing}")

    if missing > 0:
        issues.append(f"{missing} user(s) have line_user_id but NULL line_user_id_hash")
        if verbose:
            result = await db.execute(text(
                "SELECT id, line_user_id, created_at FROM users "
                "WHERE line_user_id IS NOT NULL AND line_user_id_hash IS NULL "
                "ORDER BY id LIMIT 10"
            ))
            for row in result.fetchall():
                print(f"    user id={row[0]} line_user_id={row[1][:12]}... created={row[2]}")

    return issues


async def check_duplicate_open_sessions(db, verbose: bool) -> list[str]:
    from sqlalchemy import text

    issues: list[str] = []

    result = await db.execute(text(
        "SELECT user_id, COUNT(*) AS cnt FROM chat_sessions "
        "WHERE status IN ('WAITING', 'ACTIVE') AND user_id IS NOT NULL "
        "GROUP BY user_id HAVING COUNT(*) > 1 ORDER BY cnt DESC LIMIT 20"
    ))
    dupes = result.fetchall()

    result = await db.execute(text(
        "SELECT COUNT(*) FROM chat_sessions WHERE status IN ('WAITING', 'ACTIVE') AND user_id IS NOT NULL"
    ))
    total_open = result.scalar()

    result = await db.execute(text(
        "SELECT COUNT(*) FROM chat_sessions WHERE status IN ('WAITING', 'ACTIVE') AND user_id IS NULL"
    ))
    null_fk = result.scalar()

    print(f"  Open sessions (user_id set):  {total_open}")
    print(f"  Open sessions (user_id NULL): {null_fk}")
    print(f"  Duplicate user_id groups:     {len(dupes)}")

    if dupes:
        issues.append(f"{len(dupes)} user(s) have multiple open chat sessions")
        if verbose:
            for row in dupes[:10]:
                print(f"    user_id={row[0]} open_sessions={row[1]}")

    return issues


async def check_duplicate_rich_menu_links(db, verbose: bool) -> list[str]:
    from sqlalchemy import text

    issues: list[str] = []

    result = await db.execute(text(
        "SELECT user_id, COUNT(*) AS cnt FROM user_rich_menu_links "
        "WHERE user_id IS NOT NULL "
        "GROUP BY user_id HAVING COUNT(*) > 1 ORDER BY cnt DESC LIMIT 20"
    ))
    dupes = result.fetchall()

    result = await db.execute(text(
        "SELECT COUNT(*) FROM user_rich_menu_links WHERE user_id IS NOT NULL"
    ))
    total = result.scalar()

    result = await db.execute(text(
        "SELECT COUNT(*) FROM user_rich_menu_links WHERE user_id IS NULL"
    ))
    null_fk = result.scalar()

    print(f"  Rich menu links (user_id set):  {total}")
    print(f"  Rich menu links (user_id NULL): {null_fk}")
    print(f"  Duplicate user_id groups:       {len(dupes)}")

    if dupes:
        issues.append(f"{len(dupes)} user(s) have multiple rich menu links")
        if verbose:
            for row in dupes[:10]:
                print(f"    user_id={row[0]} links={row[1]}")

    return issues


async def check_existing_indexes(db) -> None:
    from sqlalchemy import text

    result = await db.execute(text(
        "SELECT indexname FROM pg_indexes WHERE indexname IN "
        "('uq_chat_sessions_one_open_per_user', 'uq_user_rich_menu_links_user_id')"
    ))
    existing = [row[0] for row in result.fetchall()]
    if existing:
        print(f"  Already exist (will be skipped): {', '.join(existing)}")
    else:
        print("  Target indexes do not exist yet (migration will create them)")


async def run(verbose: bool) -> int:
    from app.db.session import AsyncSessionLocal

    env_path, db_desc = get_active_database_target()

    print("=" * 60)
    print("PRE-FLIGHT: Pseudonym Prepare-Indexes Migration")
    print("=" * 60)
    print(f"  ENV file : {env_path}")
    print(f"  DB target: {db_desc}")
    print(f"  Mode     : READ-ONLY")
    print()

    all_issues: list[str] = []

    async with AsyncSessionLocal() as db:
        print("[1/3] Hash coverage (users.line_user_id_hash)")
        all_issues += await check_hash_coverage(db, verbose)
        print()

        print("[2/3] Duplicate open chat sessions per user_id")
        all_issues += await check_duplicate_open_sessions(db, verbose)
        print()

        print("[3/3] Duplicate rich menu links per user_id")
        all_issues += await check_duplicate_rich_menu_links(db, verbose)
        print()

        print("[info] Existing target indexes")
        await check_existing_indexes(db)
        print()

    print("=" * 60)
    if all_issues:
        print(f"RESULT: BLOCKED — {len(all_issues)} issue(s) found:")
        for i, issue in enumerate(all_issues, 1):
            print(f"  {i}. {issue}")
        print("\nFix these before running: alembic upgrade head")
        return 1
    else:
        print("RESULT: PASS — safe to apply migration d5e6f7g8h9i0")
        return 0


def main() -> None:
    args = build_parser().parse_args()
    exit_code = asyncio.run(run(args.verbose))
    sys.exit(exit_code)


if __name__ == "__main__":
    main()
