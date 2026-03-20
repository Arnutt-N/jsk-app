"""Seed a default admin user if no admin users exist."""

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


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Seed or update the default admin user.")
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Write changes to the active database.",
    )
    return parser


async def seed_admin(*, apply: bool) -> int:
    from sqlalchemy import select

    from app.core.security import get_password_hash
    from app.db.session import AsyncSessionLocal
    from app.models.user import User, UserRole

    print_script_header("Seed default admin user", apply=apply)
    password = os.getenv("ADMIN_DEFAULT_PASSWORD")
    print(f"Password  : {'configured' if password else 'missing'}")

    if not apply:
        print_dry_run_hint()
        return 0

    if not password:
        print("ADMIN_DEFAULT_PASSWORD is required.")
        return 1

    async with AsyncSessionLocal() as db:
        existing_admin = await db.scalar(select(User).where(User.username == "admin").limit(1))
        if existing_admin:
            existing_admin.display_name = existing_admin.display_name or "Administrator"
            existing_admin.role = existing_admin.role or UserRole.ADMIN
            existing_admin.is_active = True
            existing_admin.hashed_password = get_password_hash(password)
            await db.commit()
            print("Admin user updated.")
            return 0

        existing = await db.scalar(
            select(User.id).where(User.role.in_([UserRole.ADMIN, UserRole.SUPER_ADMIN])).limit(1)
        )
        if existing:
            print("Another admin user already exists, skipping.")
            return 0

        admin = User(
            username="admin",
            display_name="Administrator",
            role=UserRole.ADMIN,
            hashed_password=get_password_hash(password),
            is_active=True,
        )
        db.add(admin)
        await db.commit()
        print("Default admin user created.")
        return 0


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    return asyncio.run(seed_admin(apply=args.apply))


if __name__ == "__main__":
    raise SystemExit(main())
