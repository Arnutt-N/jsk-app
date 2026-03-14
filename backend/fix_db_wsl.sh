#!/bin/bash
set -euo pipefail

: "${PGHOST:=localhost}"
: "${PGUSER:=postgres}"
: "${PGDATABASE:=skn_app_db}"
: "${PGPASSWORD:?Set PGPASSWORD before running this script.}"

psql -h "$PGHOST" -U "$PGUSER" -d "$PGDATABASE" -c "CREATE TABLE IF NOT EXISTS system_settings (id SERIAL PRIMARY KEY, key TEXT UNIQUE, value TEXT, description TEXT, created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(), updated_at TIMESTAMP WITH TIME ZONE); CREATE INDEX IF NOT EXISTS ix_system_settings_key ON system_settings (key);"
echo "Done."
