from __future__ import annotations

import argparse
import asyncio

from _cli_utils import ensure_backend_on_path

from scripts._script_safety import print_script_header

ensure_backend_on_path()


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Show the latest service requests.")
    parser.add_argument(
        "--limit",
        type=int,
        default=5,
        help="Number of requests to display.",
    )
    return parser


async def check_requests(limit: int) -> int:
    from sqlalchemy import desc, select

    from app.db.session import AsyncSessionLocal
    from app.models.service_request import ServiceRequest

    print_script_header("Inspect latest service requests", apply=False)
    async with AsyncSessionLocal() as db:
        print("\n--- Latest Service Requests ---")
        stmt = select(ServiceRequest).order_by(desc(ServiceRequest.created_at)).limit(limit)
        result = await db.execute(stmt)
        requests = result.scalars().all()

        if not requests:
            print("No requests found in database yet.")
            return 0

        print(f"Found {len(requests)} requests:")
        for request in requests:
            print(
                f"[{request.id}] Name: {request.requester_name}, "
                f"Phone: {request.phone_number}, "
                f"Type: {request.category}, "
                f"LINE ID: {request.line_user_id}"
            )
    return 0


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    return asyncio.run(check_requests(args.limit))


if __name__ == "__main__":
    raise SystemExit(main())
