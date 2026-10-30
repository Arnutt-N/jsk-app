"""Backfill `users.line_user_id_hash` from the plaintext column.

The pseudonymization expand migration added the hash column but the migrate
phase's backfill is not in the tree any more, so a database that never ran it
has plaintext rows with a NULL hash. `d5e6f7g8h9i0` refuses to build the
pseudonym indexes until that count reaches zero.

Dry run by default; `--apply` writes. Uses the application's own
`line_id_hash()` so the value matches what the running process computes —
a hash written with a different key would be unresolvable later.

    python scripts/backfill_line_id_hash.py            # report only
    python scripts/backfill_line_id_hash.py --apply    # write
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

from _cli_utils import BACKEND_DIR

if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from sqlalchemy import text  # noqa: E402

from app.core.config import settings  # noqa: E402
from app.db.session import AsyncSessionLocal  # noqa: E402
from app.services.user_identity_service import line_id_hash  # noqa: E402


async def _report(session) -> list[tuple[int, str]]:
    rows = await session.execute(
        text(
            """
            SELECT id, line_user_id
            FROM users
            WHERE line_user_id IS NOT NULL
              AND line_user_id_hash IS NULL
            ORDER BY id
            """
        )
    )
    return [(r.id, r.line_user_id) for r in rows]


async def main(apply: bool) -> int:
    print(f"target: {str(settings.DATABASE_URL).split('@')[-1]}")
    print(f"storage mode: {settings.LINE_ID_STORAGE_MODE}")

    async with AsyncSessionLocal() as session:
        pending = await _report(session)
        print(f"users needing a hash: {len(pending)}")
        if not pending:
            return 0

        # Collision check first: a duplicate hash would violate the unique
        # index the migration is about to build, and it also means two rows
        # share a LINE ID — worth seeing before writing anything.
        hashes = {uid: line_id_hash(raw) for uid, raw in pending}
        dupes = {h for h in hashes.values() if list(hashes.values()).count(h) > 1}
        if dupes:
            print(f"ABORT: {len(dupes)} duplicate hash(es) among the pending rows")
            return 1

        for uid, raw in pending:
            print(f"  id={uid} hash={hashes[uid][:12]}…")

        if not apply:
            print("\ndry run — pass --apply to write")
            return 0

        for uid in hashes:
            await session.execute(
                text("UPDATE users SET line_user_id_hash = :h WHERE id = :i"),
                {"h": hashes[uid], "i": uid},
            )
        await session.commit()
        print(f"\nwrote {len(hashes)} hash(es)")

        remaining = await _report(session)
        print(f"remaining without hash: {len(remaining)}")
        return 0 if not remaining else 1


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="write the hashes")
    args = parser.parse_args()
    sys.exit(asyncio.run(main(args.apply)))
