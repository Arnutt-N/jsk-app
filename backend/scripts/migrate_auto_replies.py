"""
Migration script to convert legacy auto_replies to intent_categories structure.
"""
import asyncio
import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

# Add backend directory to Python path
backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))

# Load environment variables
load_dotenv(backend_dir / ".env")
load_dotenv(backend_dir / "app" / ".env")

# Import models
from app.models.auto_reply import AutoReply
from app.models.intent import IntentCategory, IntentKeyword, IntentResponse, MatchType, ReplyType


def get_database_url() -> str:
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        raise RuntimeError("DATABASE_URL is required")
    return db_url


async def migrate_auto_replies():
    """Migrate auto_replies to intent_categories structure."""
    engine = create_async_engine(get_database_url(), echo=True)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as session:
        try:
            result = await session.execute(select(AutoReply))
            auto_replies = result.scalars().all()

            print(f"\nFound {len(auto_replies)} auto-replies to migrate\n")

            migrated_count = 0

            for idx, auto_reply in enumerate(auto_replies, 1):
                print(f"[{idx}/{len(auto_replies)}] Migrating: {auto_reply.keyword}")

                category = IntentCategory(
                    name=f"{auto_reply.keyword}",
                    description=f"Migrated from auto_reply ID {auto_reply.id}",
                    is_active=auto_reply.is_active,
                )
                session.add(category)
                await session.flush()

                keyword = IntentKeyword(
                    category_id=category.id,
                    keyword=auto_reply.keyword,
                    match_type=MatchType(auto_reply.match_type) if auto_reply.match_type else MatchType.CONTAINS,
                )
                session.add(keyword)

                response = IntentResponse(
                    category_id=category.id,
                    reply_type=ReplyType(auto_reply.reply_type) if auto_reply.reply_type else ReplyType.TEXT,
                    text_content=auto_reply.text_content,
                    payload=auto_reply.payload,
                    is_active=auto_reply.is_active,
                )
                session.add(response)

                migrated_count += 1

            await session.commit()
            print(f"\nMigration complete. Migrated {migrated_count} auto-replies")

        except Exception as e:
            await session.rollback()
            print(f"\nMigration failed: {e}")
            raise
        finally:
            await engine.dispose()


if __name__ == "__main__":
    print("Starting auto-reply migration...\n")
    asyncio.run(migrate_auto_replies())
