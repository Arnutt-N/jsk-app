from __future__ import annotations

import sys
from pathlib import Path

import pytest

from app.core import env as env_module


BACKEND_DIR = Path(__file__).resolve().parents[1]
SCRIPTS_DIR = BACKEND_DIR / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

import _script_safety  # noqa: E402
import import_csv_intents  # noqa: E402
import migrate_line_to_credentials  # noqa: E402
import seed_admin  # noqa: E402
import fix_user_data  # noqa: E402


def configure_env_module(monkeypatch: pytest.MonkeyPatch, backend_dir: Path) -> None:
    monkeypatch.setattr(env_module, "BACKEND_DIR", backend_dir)
    monkeypatch.setattr(env_module, "DEFAULT_ENV", backend_dir / ".env")
    monkeypatch.setattr(env_module, "LEGACY_APP_ENV", backend_dir / "app" / ".env")


def test_script_safety_uses_resolved_env(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    backend_dir = tmp_path / "backend"
    app_dir = backend_dir / "app"
    app_dir.mkdir(parents=True)
    env_file = backend_dir / ".env"
    env_file.write_text(
        "DATABASE_URL=postgresql+asyncpg://user:secret@localhost:5432/skn_app_db\n",
        encoding="utf-8",
    )
    configure_env_module(monkeypatch, backend_dir)
    monkeypatch.delenv("ENV_FILE", raising=False)

    env_path, db_target = _script_safety.get_active_database_target()

    assert env_path == env_file
    assert db_target == "postgresql://localhost:5432/skn_app_db"


def test_guarded_scripts_default_to_dry_run() -> None:
    assert import_csv_intents.build_parser().parse_args([]).apply is False
    assert seed_admin.build_parser().parse_args([]).apply is False
    assert migrate_line_to_credentials.build_parser().parse_args([]).apply is False
    assert fix_user_data.build_parser().parse_args([]).apply is False


def test_import_csv_intents_parses_and_summarizes_csv(tmp_path: Path) -> None:
    csv_path = tmp_path / "intents.csv"
    csv_path.write_text(
        "intent_category,intent,msg_type,response\n"
        "General,hello,text,Hi\n"
        "General,hello,text,Hi again\n"
        "Support,help,text,How can I help?\n"
        ",,text,\n",
        encoding="utf-8",
    )

    categories, row_count, skipped_count = import_csv_intents.parse_csv(csv_path)

    assert row_count == 3
    assert skipped_count == 1
    assert set(categories) == {"General", "Support"}
    assert categories["General"]["keywords"] == {"hello"}
    assert categories["General"]["responses"] == {("text", "Hi"), ("text", "Hi again")}
