"""
Backfill LINE ID pseudonymization surrogate columns (PR B — Expand→Migrate).

Idempotent: safe to re-run. Populates:
  1. users.line_user_id_hash / line_user_id_encrypted / line_key_version
  2. child tables'.user_id FK (messages, chat_sessions, service_requests,
     friend_events, csat_responses, user_rich_menu_links)

Pre-flight: detects duplicate open chat_sessions per user (would break a
future partial-unique index) and reports without auto-deleting.

Usage:
  python scripts/backfill_line_id_pseudonym.py            # dry run
  python scripts/backfill_line_id_pseudonym.py --apply    # write to DB
  python scripts/backfill_line_id_pseudonym.py --apply --batch-size 500
"""

from __future__ import annotations

import argparse
import asyncio

from scripts._script_safety import print_dry_run_hint, print_script_header

BATCH_SIZE_DEFAULT = 200

CHILD_TABLES = [
    ("messages", "message"),
    ("chat_sessions", "chat_session"),
    ("service_requests", "service_request"),
    ("friend_events", "friend_event"),
    ("csat_responses", "csat_response"),
    ("user_rich_menu_links", "user_rich_menu_link"),
]


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Backfill LINE ID pseudonymization surrogate columns."
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Write backfilled data to the active database.",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=BATCH_SIZE_DEFAULT,
        help=f"Rows per batch (default {BATCH_SIZE_DEFAULT}).",
    )
    return parser


async def backfill(*, apply: bool, batch_size: int) -> int:
    from sqlalchemy import func, select, text, update

    from app.db.session import AsyncSessionLocal
    from app.models.user import User
    from app.services.user_identity_service import (
        CURRENT_LINE_KEY_VERSION,
        line_id_hash,
        _encrypt_line_id,
    )

    print_script_header("Backfill LINE ID pseudonymization", apply=apply)
    print(f"Batch size: {batch_size}")

    if not apply:
        print_dry_run_hint()

    async with AsyncSessionLocal() as db:
        # ── Pre-flight: duplicate open chat_sessions ──────────────
        dup_query = text("""
            SELECT line_user_id, COUNT(*) as cnt
            FROM chat_sessions
            WHERE status IN ('WAITING', 'ACTIVE')
            GROUP BY line_user_id
            HAVING COUNT(*) > 1
        """)
        dup_result = await db.execute(dup_query)
        dups = dup_result.fetchall()
        if dups:
            print(f"\n⚠ WARNING: {len(dups)} user(s) have duplicate open chat_sessions:")
            for row in dups[:10]:
                print(f"    {row[0]}: {row[1]} open sessions")
            if len(dups) > 10:
                print(f"    ... and {len(dups) - 10} more")
            print("  These must be resolved before adding a partial-unique index (PR C).")
            print("  This script does NOT auto-delete them.\n")

        # ── Phase 1: users surrogate columns ──────────────────────
        print("Phase 1: Backfilling users.line_user_id_hash / encrypted / key_version")
        total_users_filled = 0

        while True:
            result = await db.execute(
                select(User.id, User.line_user_id)
                .where(User.line_user_id_hash.is_(None))
                .where(User.line_user_id.isnot(None))
                .limit(batch_size)
            )
            rows = result.fetchall()
            if not rows:
                break

            if apply:
                for user_id, raw in rows:
                    h = line_id_hash(raw)
                    enc = _encrypt_line_id(raw)
                    await db.execute(
                        update(User)
                        .where(User.id == user_id)
                        .values(
                            line_user_id_hash=h,
                            line_user_id_encrypted=enc,
                            line_key_version=CURRENT_LINE_KEY_VERSION,
                        )
                    )
                await db.commit()

            total_users_filled += len(rows)
            print(f"  ... {total_users_filled} users processed")

        print(f"  Done: {total_users_filled} users backfilled.")

        # ── Phase 2: child table user_id FK ───────────────────────
        print("\nPhase 2: Backfilling child table user_id FKs")

        for table_name, _ in CHILD_TABLES:
            total_child_filled = 0
            while True:
                count_query = text(f"""
                    SELECT COUNT(*) FROM {table_name} c
                    WHERE c.user_id IS NULL
                      AND c.line_user_id IS NOT NULL
                      AND EXISTS (
                          SELECT 1 FROM users u
                          WHERE u.line_user_id = c.line_user_id
                      )
                    LIMIT :batch
                """)
                # Use a subquery-based UPDATE for efficiency
                if apply:
                    update_query = text(f"""
                        UPDATE {table_name}
                        SET user_id = (
                            SELECT u.id FROM users u
                            WHERE u.line_user_id = {table_name}.line_user_id
                            LIMIT 1
                        )
                        WHERE {table_name}.id IN (
                            SELECT c.id FROM {table_name} c
                            WHERE c.user_id IS NULL
                              AND c.line_user_id IS NOT NULL
                              AND EXISTS (
                                  SELECT 1 FROM users u
                                  WHERE u.line_user_id = c.line_user_id
                              )
                            LIMIT :batch
                        )
                    """)
                    result = await db.execute(update_query, {"batch": batch_size})
                    await db.commit()
                    affected = result.rowcount
                else:
                    count_q = text(f"""
                        SELECT COUNT(*) FROM {table_name} c
                        WHERE c.user_id IS NULL
                          AND c.line_user_id IS NOT NULL
                          AND EXISTS (
                              SELECT 1 FROM users u
                              WHERE u.line_user_id = c.line_user_id
                          )
                    """)
                    result = await db.execute(count_q)
                    affected = result.scalar() or 0
                    # In dry-run, report total and break
                    total_child_filled = affected
                    break

                if affected == 0:
                    break
                total_child_filled += affected
                print(f"  {table_name}: {total_child_filled} rows updated")

            print(f"  {table_name}: {total_child_filled} rows backfilled.")

        # ── Validation: remaining NULLs ───────────────────────────
        print("\nValidation: remaining NULL surrogate counts")
        users_null = await db.execute(
            select(func.count(User.id)).where(User.line_user_id_hash.is_(None))
        )
        print(f"  users.line_user_id_hash IS NULL: {users_null.scalar()}")

        for table_name, _ in CHILD_TABLES:
            q = text(f"SELECT COUNT(*) FROM {table_name} WHERE user_id IS NULL")
            r = await db.execute(q)
            print(f"  {table_name}.user_id IS NULL: {r.scalar()}")

    print("\nBackfill complete." if apply else "\nDry run complete. Re-run with --apply to write.")
    return 0


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    return asyncio.run(backfill(apply=args.apply, batch_size=args.batch_size))


if __name__ == "__main__":
    raise SystemExit(main())
