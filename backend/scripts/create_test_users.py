"""Create test users for UAT testing."""

from __future__ import annotations

import argparse
import asyncio
import os
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from scripts._script_safety import print_dry_run_hint, print_script_header

TEST_USERS = [
    {"username": "admin", "role": "ADMIN", "display_name": "Admin Test"},
    {"username": "director", "role": "DIRECTOR", "display_name": "Director Test"},
    {"username": "head", "role": "HEAD", "display_name": "Head Test"},
    {"username": "staff", "role": "AGENT", "display_name": "Staff Test"},
    {"username": "user", "role": "USER", "display_name": "User Test"},
]


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Create test users for UAT.")
    parser.add_argument("--apply", action="store_true", help="Write changes to DB.")
    parser.add_argument("--password", default="test1234", help="Default password.")
    return parser


async def create_test_users(*, apply: bool, password: str) -> int:
    from sqlalchemy import select

    from app.core.security import get_password_hash
    from app.db.session import AsyncSessionLocal
    from app.models.user import User, UserRole

    print_script_header("Create test users", apply=apply)
    print(f"Password  : {'*' * len(password)}")

    if not apply:
        print_dry_run_hint()

    created = 0
    async with AsyncSessionLocal() as db:
        for user_data in TEST_USERS:
            username = user_data["username"]
            role = UserRole(user_data["role"])

            result = await db.execute(select(User).where(User.username == username))
            existing = result.scalar_one_or_none()

            if existing:
                print(f"  [skip] {username} already exists (role={existing.role.value})")
                continue

            if not apply:
                print(f"  [dry-run] Would create: {username} ({role.value})")
                created += 1
                continue

            new_user = User(
                username=username,
                hashed_password=get_password_hash(password),
                display_name=user_data["display_name"],
                role=role,
                is_active=True,
            )
            db.add(new_user)
            print(f"  [created] {username} ({role.value})")
            created += 1

        if apply and created > 0:
            await db.commit()
            print(f"\n✅ Created {created} test users")
        elif not apply:
            print(f"\n🔍 Would create {created} test users (run with --apply)")

    return created


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    return asyncio.run(create_test_users(apply=args.apply, password=args.password))


if __name__ == "__main__":
    raise SystemExit(main())
