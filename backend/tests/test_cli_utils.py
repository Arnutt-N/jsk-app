from __future__ import annotations

import sys
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[1]
SCRIPTS_DIR = BACKEND_DIR / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

import _cli_utils  # noqa: E402


def test_resolve_output_path_returns_none_when_missing() -> None:
    assert _cli_utils.resolve_output_path(None) is None


def test_resolve_output_path_resolves_relative_to_cwd(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.chdir(tmp_path)

    assert _cli_utils.resolve_output_path(Path("report.txt")) == (tmp_path / "report.txt").resolve()


def test_emit_report_prints_and_optionally_writes(tmp_path: Path, capsys) -> None:
    output_path = tmp_path / "report.txt"

    report = _cli_utils.emit_report(["line 1", "line 2"], output_path)

    captured = capsys.readouterr()
    assert report == "line 1\nline 2"
    assert "line 1\nline 2" in captured.out
    assert output_path.read_text(encoding="utf-8") == "line 1\nline 2\n"
