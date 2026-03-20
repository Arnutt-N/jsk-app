# Backend Scripts

## Supported Database Tooling

- `show_active_db_target.py` - print the env file and DB target that backend commands will use
- `db_target.py` - run `show` and `alembic` commands against `local` or `remote`; defaults to `local`
- `audit_local_vs_supabase.py` - compare schema and row counts between local DB and Supabase
- `sync_geography_to_supabase.py` - dry-run/apply geography sync
- `sync_selected_tables_to_supabase.py` - dry-run/apply selected business-table sync
- `refresh_materialized_views.py [--apply]` - refresh analytics materialized views; defaults to dry-run
- `import_csv_intents.py [path] [--apply]` - replace intent tables from CSV; defaults to dry-run
- `seed_admin.py [--apply]` - seed/update the default admin user; defaults to dry-run
- `migrate_line_to_credentials.py [--apply]` - migrate LINE credentials into the credentials table; defaults to dry-run
- `fix_user_data.py [--apply]` - fill NULL user status fields; defaults to dry-run
- `manage_rich_menu.py [--delete-all|--delete ID] [--apply]` - inspect or delete LINE rich menus; destructive actions require `--apply`
- `check_requests.py [--limit N]` - inspect recent service requests without modifying data
- `test_webhook_logic.py [texts...]` - probe keyword-matching behavior against the DB
- `test_liff_api.py [--apply]` - preview or submit a sample LIFF service-request payload; defaults to dry-run

## Supported Data Utilities

- `read_csv.py [path]` - preview the default example CSV or a custom CSV file
- `read_excel.py [path]` - preview the default example Excel file or a custom workbook
- `import_data.py [path] [--apply]` - preview or import a CSV into `auto_replies`; defaults to dry-run and only writes when `--apply` is provided
- `verify_db.py [--output PATH]` - read-only verification of core DB tables and counts
- `verify_schema_extended.py [--output PATH]` - read-only verification of request-related schema additions
- `verify_api.py [URL] [--output PATH]` - simple HTTP GET probe for a backend endpoint
- `test_endpoint.py [--method ... --path ... --json ...]` - exercise a FastAPI endpoint with `TestClient`

## Supported Root Utilities

- `../run.py --target local|remote` - start the backend with an explicit DB target; defaults to `local`

## Removed Legacy Scripts

Older manual schema/data scripts were removed after the database state was aligned with
Alembic and the local-to-Supabase sync tooling.

Use the supported scripts above for routine work.
