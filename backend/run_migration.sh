#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if [ ! -d "venv_linux" ]; then
  echo "venv_linux not found in $SCRIPT_DIR"
  exit 1
fi

source venv_linux/bin/activate

export PYTHONPATH=.
export ENV_FILE=app/.env

echo "Using local backend env..."
python3 scripts/db_target.py show --target local

echo "Running alembic upgrade head on local DB..."
python3 scripts/db_target.py alembic --target local upgrade head

echo "Verifying tables..."
psql -U postgres -d skn_app_db -c "\dt chat_sessions"
