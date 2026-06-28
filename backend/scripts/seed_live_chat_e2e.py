"""Seed an idempotent WAITING live-chat session for 2-client e2e tests.

Mirrors the end-state of a real handoff (live_chat_service.initiate_handoff):
a LINE customer User with chat_mode=HUMAN plus an unclaimed WAITING
ChatSession. A direct upsert is used instead of calling initiate_handoff so
the seed is deterministic (no LINE/Telegram side-effects, no business-hours
branch) and safe to re-run.

Run:
    python backend/scripts/seed_live_chat_e2e.py --apply

Default (no --apply) is a dry run, matching scripts/seed_admin.py.
"""

from __future__ import annotations

import argparse
import asyncio
import re
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from scripts._script_safety import print_dry_run_hint, print_script_header

# Deterministic LINE user id matching ^U[0-9a-f]{32}$ (built so the length is
# always correct regardless of hand-counting). The regex guard fails loudly if
# the construction ever drifts.
SEED_LINE_USER_ID = "U" + "e2e0c0ffee".ljust(32, "0")
SEED_DISPLAY_NAME = "E2E Waiting Customer"
SEED_INCOMING_TEXT = "ขอคุยกับเจ้าหน้าที่ค่ะ"

assert re.fullmatch(r"U[0-9a-f]{32}", SEED_LINE_USER_ID), SEED_LINE_USER_ID


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Seed an idempotent WAITING live-chat session for e2e tests.",
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Write changes to the active database.",
    )
    return parser


async def seed_live_chat_e2e(*, apply: bool) -> int:
    from sqlalchemy import select

    from app.db.session import AsyncSessionLocal
    from app.models.chat_session import ChatSession, SessionStatus
    from app.models.message import Message, MessageDirection, SenderRole
    from app.models.user import ChatMode, User, UserRole

    _env_path, database_target = print_script_header(
        "Seed e2e WAITING live-chat session", apply=apply
    )
    print(f"LINE user : {SEED_LINE_USER_ID}")
    print(f"Display   : {SEED_DISPLAY_NAME}")

    if not apply:
        print_dry_run_hint()
        return 0

    # Safety guard: this e2e seed must never run against a remote/production DB.
    # The default env file (backend/.env) points at Supabase PROD, so `--apply`
    # without ENV_FILE=app/.env would otherwise inject a fake WAITING session
    # (and trigger live operator notifications) into production. Default-deny:
    # refuse unless the resolved DB host is explicitly local.
    LOCAL_DB_MARKERS = ("localhost", "127.0.0.1", "::1")
    if not any(marker in database_target for marker in LOCAL_DB_MARKERS):
        print(f"\nERROR: Refusing --apply against a non-local database: {database_target}")
        print("Set ENV_FILE=app/.env to target the local Docker database.")
        return 1

    now = datetime.now(timezone.utc)
    # Keep started_at well within WAITING_ABANDONMENT_MINUTES (10) so the
    # session_cleanup background task does not auto-close this WAITING session
    # mid-test (it closes unclaimed WAITING rows whose started_at is older than
    # that threshold). 1 minute leaves ~9 min of headroom for a full e2e run.
    started_at = now - timedelta(minutes=1)
    last_activity_at = now

    async with AsyncSessionLocal() as db:
        # 1. Upsert the LINE customer (chat_mode=HUMAN, as a real handoff leaves it).
        user = await db.scalar(
            select(User).where(User.line_user_id == SEED_LINE_USER_ID)
        )
        if user is None:
            user = User(
                line_user_id=SEED_LINE_USER_ID,
                display_name=SEED_DISPLAY_NAME,
                role=UserRole.USER,
                is_active=True,
                chat_mode=ChatMode.HUMAN,
                friend_status="ACTIVE",
                last_message_at=last_activity_at,
            )
            db.add(user)
            print("  [created] customer user")
        else:
            user.display_name = SEED_DISPLAY_NAME
            user.chat_mode = ChatMode.HUMAN
            user.is_active = True
            user.friend_status = "ACTIVE"
            user.last_message_at = last_activity_at
            print("  [updated] customer user")

        # 2. Upsert a single non-closed session into the unclaimed WAITING state.
        #    Reset an already-claimed (ACTIVE) session back to WAITING so the
        #    e2e can re-run from a clean slate.
        session = await db.scalar(
            select(ChatSession)
            .where(ChatSession.line_user_id == SEED_LINE_USER_ID)
            .where(
                ChatSession.status.in_([SessionStatus.WAITING, SessionStatus.ACTIVE])
            )
            .order_by(ChatSession.started_at.desc())
            .limit(1)
        )
        if session is None:
            session = ChatSession(
                line_user_id=SEED_LINE_USER_ID,
                status=SessionStatus.WAITING,
                operator_id=None,
                started_at=started_at,
                last_activity_at=last_activity_at,
                is_archived=False,
            )
            db.add(session)
            print("  [created] WAITING session (unclaimed)")
        else:
            session.status = SessionStatus.WAITING
            session.operator_id = None
            session.claimed_at = None
            session.closed_at = None
            session.closed_by = None
            session.started_at = started_at
            session.last_activity_at = last_activity_at
            session.is_archived = False
            print("  [reset]   session -> WAITING (unclaimed)")

        # 3. Ensure one INCOMING message so the conversation row shows a preview
        #    and sorts by recency (last_message join is otherwise nullable).
        existing_message = await db.scalar(
            select(Message)
            .where(Message.line_user_id == SEED_LINE_USER_ID)
            .where(Message.direction == MessageDirection.INCOMING)
            .limit(1)
        )
        if existing_message is None:
            db.add(
                Message(
                    line_user_id=SEED_LINE_USER_ID,
                    direction=MessageDirection.INCOMING,
                    message_type="text",
                    content=SEED_INCOMING_TEXT,
                    sender_role=SenderRole.USER,
                    created_at=last_activity_at,
                )
            )
            print("  [created] incoming message")
        else:
            print("  [skip]    incoming message already exists")

        await db.commit()
        print("\nDone. WAITING conversation is ready for the 2-client e2e.")
        return 0


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    return asyncio.run(seed_live_chat_e2e(apply=args.apply))


if __name__ == "__main__":
    raise SystemExit(main())
