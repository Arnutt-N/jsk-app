from __future__ import annotations

import os
import sys
from pathlib import Path
from unittest.mock import Mock

import pytest

from app.core import env as env_module


SCRIPTS_DIR = Path(__file__).resolve().parents[1] / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

import db_target  # noqa: E402
import show_active_db_target  # noqa: E402


def configure_env_module(monkeypatch: pytest.MonkeyPatch, backend_dir: Path) -> None:
    monkeypatch.setattr(env_module, "BACKEND_DIR", backend_dir)
    monkeypatch.setattr(env_module, "DEFAULT_ENV", backend_dir / ".env")
    monkeypatch.setattr(env_module, "LEGACY_APP_ENV", backend_dir / "app" / ".env")


def test_resolve_env_file_prefers_explicit_env_file(monkeypatch: pytest.MonkeyPatch, tmp_path: Path):
    backend_dir = tmp_path / "backend"
    app_dir = backend_dir / "app"
    app_dir.mkdir(parents=True)

    configure_env_module(monkeypatch, backend_dir)
    monkeypatch.setenv("ENV_FILE", "app/.env")

    assert env_module.resolve_env_file() == app_dir / ".env"


def test_resolve_env_file_uses_default_when_present(monkeypatch: pytest.MonkeyPatch, tmp_path: Path):
    backend_dir = tmp_path / "backend"
    app_dir = backend_dir / "app"
    app_dir.mkdir(parents=True)
    (backend_dir / ".env").write_text("DATABASE_URL=postgresql://default\n", encoding="utf-8")

    configure_env_module(monkeypatch, backend_dir)
    monkeypatch.delenv("ENV_FILE", raising=False)

    assert env_module.resolve_env_file() == backend_dir / ".env"


def test_resolve_env_file_falls_back_to_legacy_app_env(monkeypatch: pytest.MonkeyPatch, tmp_path: Path):
    backend_dir = tmp_path / "backend"
    app_dir = backend_dir / "app"
    app_dir.mkdir(parents=True)

    configure_env_module(monkeypatch, backend_dir)
    monkeypatch.delenv("ENV_FILE", raising=False)

    assert env_module.resolve_env_file() == app_dir / ".env"


def test_show_active_db_target_reads_and_describes_database_url(tmp_path: Path):
    env_file = tmp_path / ".env"
    env_file.write_text(
        "DATABASE_URL=postgresql+asyncpg://user:secret@localhost:5432/skn_app_db\n",
        encoding="utf-8",
    )

    database_url = show_active_db_target.read_database_url(env_file)

    assert database_url == "postgresql+asyncpg://user:secret@localhost:5432/skn_app_db"
    assert show_active_db_target.describe_database_url(database_url) == (
        "postgresql://localhost:5432/skn_app_db"
    )


def test_db_target_build_subprocess_env_sets_expected_env_file(monkeypatch: pytest.MonkeyPatch):
    fake_env = {"PATH": os.environ.get("PATH", "")}
    monkeypatch.setattr(db_target.os, "environ", fake_env)

    env = db_target.build_subprocess_env("local")

    assert env["ENV_FILE"].endswith(str(Path("backend") / "app" / ".env"))


def test_db_target_run_command_uses_backend_cwd(monkeypatch: pytest.MonkeyPatch):
    mock_run = Mock(return_value=Mock(returncode=0))
    monkeypatch.setattr(db_target.subprocess, "run", mock_run)

    exit_code = db_target.run_command(["python", "-m", "alembic", "current"], "remote")

    assert exit_code == 0
    mock_run.assert_called_once()
    _, kwargs = mock_run.call_args
    assert kwargs["cwd"] == db_target.BACKEND_DIR
    assert kwargs["env"]["ENV_FILE"].endswith(str(Path("backend") / ".env"))


def test_db_target_parser_defaults_to_local() -> None:
    show_args = db_target.parse_args(["show"])
    alembic_args = db_target.parse_args(["alembic", "current"])

    assert show_args.target == "local"
    assert alembic_args.target == "local"
