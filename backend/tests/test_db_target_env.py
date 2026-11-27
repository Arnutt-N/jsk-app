import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

import db_target

from app.core.env import resolve_env_file


def test_diagnostic_and_child_use_the_same_effective_env(monkeypatch, capsys):
    monkeypatch.setenv("ENV_FILE", "remote-fixture.env")
    seen = {}

    def fake_read(path):
        seen["path"] = path
        return "postgresql://u:p@db/remote"

    monkeypatch.setattr(db_target, "read_database_url", fake_read)

    child_env = db_target.build_subprocess_env("local")
    db_target.cmd_show("local")
    output = capsys.readouterr().out

    assert child_env["ENV_FILE"].endswith("remote-fixture.env")
    assert Path(seen["path"]).name == "remote-fixture.env"
    assert "remote-fixture.env" in output
    assert seen["path"] != db_target.get_target_env_path("local")


def test_relative_env_file_resolves_like_child_command(monkeypatch, tmp_path, capsys):
    monkeypatch.setenv("ENV_FILE", "app/.env")
    monkeypatch.chdir(tmp_path)
    expected = resolve_env_file()
    seen = {}

    def fake_read(path):
        seen["path"] = path
        return "postgresql://u:p@app"

    monkeypatch.setattr(db_target, "read_database_url", fake_read)

    db_target.cmd_show("local")
    output = capsys.readouterr().out

    assert seen["path"] == expected
    assert str(expected) in output
