from __future__ import annotations

import argparse
import asyncio

from _cli_utils import ensure_backend_on_path

ensure_backend_on_path()


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="List or delete LINE rich menus.")
    group = parser.add_mutually_exclusive_group()
    group.add_argument(
        "--delete-all",
        action="store_true",
        help="Delete every rich menu visible to the configured LINE channel.",
    )
    group.add_argument(
        "--delete",
        metavar="RICH_MENU_ID",
        help="Delete a specific rich menu by ID.",
    )
    parser.add_argument(
        "--unlink-known-users",
        action="store_true",
        help="When used with --delete-all, also unlink rich menus from LINE users found in the database.",
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Required to perform delete operations. Without this flag the script is list-only or dry-run.",
    )
    return parser


def validate_args(args: argparse.Namespace) -> None:
    if args.unlink_known_users and not args.delete_all:
        raise ValueError("--unlink-known-users can only be used together with --delete-all")


def print_action_header(args: argparse.Namespace) -> None:
    if args.delete_all:
        action = "Delete all rich menus"
    elif args.delete:
        action = f"Delete rich menu {args.delete}"
    else:
        action = "List rich menus"
    mode = "APPLY" if args.apply else "DRY RUN"
    print(f"Action    : {action}")
    print(f"Mode      : {mode}")


def describe_rich_menu(rich_menu) -> list[str]:
    return [
        f"   - ID: {rich_menu.rich_menu_id}",
        f"     Name: {rich_menu.name}",
        f"     Bar Text: {rich_menu.chat_bar_text}",
        "     -----------------------------",
    ]


async def fetch_rich_menus(line_bot_api) -> list:
    response = await line_bot_api.get_rich_menu_list()
    return list(response.richmenus or [])


async def unlink_known_users(line_bot_api) -> int:
    from sqlalchemy import distinct, select

    from app.db.session import AsyncSessionLocal
    from app.models.message import Message

    print("\nUnlinking from known users in DB...")
    unlinked = 0
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(distinct(Message.line_user_id)).filter(Message.line_user_id.isnot(None))
        )
        user_ids = result.scalars().all()

        for user_id in user_ids:
            try:
                await line_bot_api.unlink_rich_menu_from_user(user_id)
                print(f"     Unlinked from: {user_id}")
                unlinked += 1
            except Exception:
                pass
    return unlinked


async def run(args: argparse.Namespace) -> int:
    from app.core.config import settings
    from linebot.v3.messaging import AsyncApiClient, AsyncMessagingApi, Configuration

    validate_args(args)
    print_action_header(args)

    configuration = Configuration(access_token=settings.LINE_CHANNEL_ACCESS_TOKEN)
    async_api_client = AsyncApiClient(configuration)
    line_bot_api = AsyncMessagingApi(async_api_client)

    try:
        rich_menus = await fetch_rich_menus(line_bot_api)
        print(f"Found {len(rich_menus)} Rich Menus:")
        for rich_menu in rich_menus:
            for line in describe_rich_menu(rich_menu):
                print(line)

        if not args.delete_all and not args.delete:
            return 0

        if args.delete:
            target_id = args.delete
            if target_id not in {menu.rich_menu_id for menu in rich_menus}:
                print(f"Rich menu not found: {target_id}")
                return 1

            if not args.apply:
                print(f"\nDry run only. Re-run with --apply to delete {target_id}.")
                return 0

            await line_bot_api.delete_rich_menu(target_id)
            print(f"Deleted: {target_id}")
            return 0

        if not rich_menus:
            print("No Rich Menus found.")
            return 0

        if not args.apply:
            print("\nDry run only. Re-run with --apply to delete all rich menus.")
            if args.unlink_known_users:
                print("Would also attempt to unlink rich menus from known DB users.")
            return 0

        print("\nDeleting ALL Rich Menus...")
        try:
            await line_bot_api.cancel_default_rich_menu()
            print("     Unbound Default Rich Menu")
        except Exception as exc:
            print(f"     No default set or unable to cancel: {exc}")

        for rich_menu in rich_menus:
            await line_bot_api.delete_rich_menu(rich_menu.rich_menu_id)
            print(f"     Deleted: {rich_menu.rich_menu_id}")

        if args.unlink_known_users:
            count = await unlink_known_users(line_bot_api)
            print(f"Unlinked {count} known users.")

        print("Cleanup complete.")
        return 0
    except Exception as exc:
        print(f"Error: {exc}")
        return 1
    finally:
        await async_api_client.close()


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        return asyncio.run(run(args))
    except ValueError as exc:
        parser.error(str(exc))
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
