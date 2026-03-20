#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Stop any existing local uvicorn process if present.
pkill -f uvicorn || true

if [ ! -d "venv_linux" ]; then
  echo "venv_linux not found in $SCRIPT_DIR"
  exit 1
fi

source venv_linux/bin/activate

export PYTHONPATH=.
export ENV_FILE=app/.env

echo "Using local backend env..."
python3 scripts/db_target.py show --target local

echo "Installing backend dependencies..."
pip install -r requirements.txt

echo "Verifying Database..."
python3 - <<'PY'
import asyncio
from sqlalchemy import text

from app.db.session import engine


async def check() -> None:
    async with engine.begin() as conn:
        await conn.execute(text("SELECT 1 FROM chat_sessions LIMIT 1"))
        print("Database connection successful and chat_sessions table exists.")


asyncio.run(check())
PY

echo "Starting Uvicorn..."
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
