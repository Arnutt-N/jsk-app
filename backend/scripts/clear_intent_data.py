"""Clear all intent data before re-migration"""
import asyncio
import os
from pathlib import Path

import asyncpg
from dotenv import load_dotenv

backend_dir = Path(__file__).resolve().parents[1]
load_dotenv(backend_dir / ".env")
load_dotenv(backend_dir / "app" / ".env")


def get_database_url() -> str:
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        raise RuntimeError("DATABASE_URL is required")
    return db_url.replace("postgresql+asyncpg://", "postgresql://")

async def clear_intent_data():
    db_url = get_database_url()
    
    conn = await asyncpg.connect(db_url)
    try:
        await conn.execute("DELETE FROM intent_responses")
        await conn.execute("DELETE FROM intent_keywords")
        await conn.execute("DELETE FROM intent_categories")
        print("✅ Cleared all intent data!")
    finally:
        await conn.close()

if __name__ == "__main__":
    asyncio.run(clear_intent_data())
