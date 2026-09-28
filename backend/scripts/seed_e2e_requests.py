"""Seed E2E supervisor-spec requests (PENDING + COMPLETED) if none exist."""

from __future__ import annotations

import argparse
import asyncio
import sys
from datetime import datetime, timezone
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from scripts._script_safety import print_dry_run_hint, print_script_header


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Seed E2E supervisor-spec requests (PENDING + COMPLETED).")
    parser.add_argument("--apply", action="store_true", help="Write changes to the active database.")
    return parser


async def seed_e2e_requests(*, apply: bool) -> int:
    from sqlalchemy import select
    from app.db.session import AsyncSessionLocal
    from app.models.service_request import RequestStatus, ServiceRequest

    print_script_header("Seed E2E supervisor-spec requests", apply=apply)
    if not apply:
        print_dry_run_hint()
        return 0
    async with AsyncSessionLocal() as db:
        existing = await db.scalar(select(ServiceRequest.id).limit(1))
        if existing:
            print("requests already seeded, skipping.")
            return 0
        db.add(ServiceRequest(status=RequestStatus.PENDING, firstname="E2E",
                              lastname="Pending", topic_category="E2E",
                              description="e2e seed"))
        db.add(ServiceRequest(status=RequestStatus.COMPLETED, firstname="E2E",
                              lastname="Done", topic_category="E2E",
                              description="e2e seed",
                              completed_at=datetime.now(timezone.utc)))
        await db.commit()
        print("E2E requests seeded (PENDING + COMPLETED).")
        return 0


def main(argv=None) -> int:
    args = build_parser().parse_args(argv)
    return asyncio.run(seed_e2e_requests(apply=args.apply))


if __name__ == "__main__":
    raise SystemExit(main())
