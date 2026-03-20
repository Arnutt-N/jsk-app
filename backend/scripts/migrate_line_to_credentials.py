"""
Migration script to move LINE credentials from system_settings/env to credentials table.
Run once during deployment.
"""

from __future__ import annotations

import argparse
import asyncio

from scripts._script_safety import print_dry_run_hint, print_script_header


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Migrate LINE credentials into the credentials table.")
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Write the migrated credential to the active database.",
    )
    return parser


async def migrate(*, apply: bool) -> int:
    from sqlalchemy import select

    from app.core.config import settings
    from app.db.session import AsyncSessionLocal
    from app.models.credential import Credential, Provider
    from app.models.system_setting import SystemSetting
    from app.services.credential_service import credential_service

    print_script_header("Migrate LINE credentials to credentials table", apply=apply)
    if not apply:
        print("Source    : system_settings first, then env fallback")
        print_dry_run_hint()
        return 0

    async with AsyncSessionLocal() as db:
        existing = await credential_service.get_default_credential(Provider.LINE, db)
        if existing:
            print("LINE credential already exists in credentials table. Skipping.")
            return 0

        token_result = await db.execute(
            select(SystemSetting.value).where(SystemSetting.key == "LINE_CHANNEL_ACCESS_TOKEN")
        )
        db_token = token_result.scalar_one_or_none()

        secret_result = await db.execute(
            select(SystemSetting.value).where(SystemSetting.key == "LINE_CHANNEL_SECRET")
        )
        db_secret = secret_result.scalar_one_or_none()

        access_token = db_token or settings.LINE_CHANNEL_ACCESS_TOKEN
        channel_secret = db_secret or settings.LINE_CHANNEL_SECRET

        if not access_token or not channel_secret:
            print("No LINE credentials found to migrate.")
            return 0

        encrypted = credential_service.encrypt_credentials(
            {
                "channel_access_token": access_token,
                "channel_secret": channel_secret,
            }
        )

        credential = Credential(
            name="Main LINE OA",
            provider=Provider.LINE,
            credentials=encrypted,
            metadata_json={
                "channel_id": getattr(settings, "LINE_CHANNEL_ID", ""),
                "liff_id": getattr(settings, "LIFF_ID", ""),
            },
            is_active=True,
            is_default=True,
        )
        db.add(credential)
        await db.commit()
        print("LINE credentials migrated successfully.")
        return 0


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    return asyncio.run(migrate(apply=args.apply))


if __name__ == "__main__":
    raise SystemExit(main())
