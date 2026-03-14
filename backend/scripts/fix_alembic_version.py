"""Fix alembic version in database"""
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

async def fix_alembic():
    db_url = get_database_url()
    
    conn = await asyncpg.connect(db_url)
    try:
        # Update alembic_version table
        await conn.execute("UPDATE alembic_version SET version_num = 'cd2257cee794'")
        print("✅ Fixed alembic version to cd2257cee794")
    finally:
        await conn.close()

if __name__ == "__main__":
    asyncio.run(fix_alembic())
