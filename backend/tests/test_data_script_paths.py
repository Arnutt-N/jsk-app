from __future__ import annotations

import asyncio
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
SCRIPTS_DIR = BACKEND_DIR / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

import import_data
import read_csv
import read_excel


def test_read_csv_uses_repo_example_by_default() -> None:
    assert read_csv.resolve_csv_path() == read_csv.DEFAULT_CSV_FILE


def test_read_excel_uses_repo_example_by_default() -> None:
    assert read_excel.resolve_excel_path() == read_excel.DEFAULT_EXCEL_FILE


def test_import_data_uses_repo_example_by_default() -> None:
    assert import_data.resolve_csv_path() == import_data.DEFAULT_CSV_FILE


def test_relative_cli_paths_resolve_from_cwd(monkeypatch, tmp_path: Path) -> None:
    sample_file = tmp_path / "data.csv"
    sample_file.write_text("intent,msg_type\nhello,text\n", encoding="utf-8")
    monkeypatch.chdir(tmp_path)

    assert read_csv.resolve_csv_path("data.csv") == sample_file.resolve()
    assert import_data.resolve_csv_path("data.csv") == sample_file.resolve()


def test_home_paths_expand(monkeypatch, tmp_path: Path) -> None:
    home_dir = tmp_path / "home"
    home_dir.mkdir()
    monkeypatch.setenv("USERPROFILE", str(home_dir))
    monkeypatch.setenv("HOME", str(home_dir))

    assert read_excel.resolve_excel_path("~/sheet.xlsx") == (home_dir / "sheet.xlsx").resolve()


def test_import_data_load_rows_reads_utf8_sig_csv(tmp_path: Path) -> None:
    csv_path = tmp_path / "sample.csv"
    csv_path.write_text("\ufeffintent,msg_type,response\nhi,text,hello\n", encoding="utf-8")

    rows = import_data.load_rows(csv_path)

    assert rows == [{"intent": "hi", "msg_type": "text", "response": "hello"}]


def test_import_data_parser_defaults_to_dry_run() -> None:
    args = import_data.build_parser().parse_args([])

    assert args.apply is False


def test_import_data_summarize_rows_counts_types() -> None:
    rows = [
        {"intent": "hello", "msg_type": "text"},
        {"intent": "promo", "msg_type": "flex"},
        {"intent": "", "msg_type": "text"},
        {"intent": "other", "msg_type": "image"},
    ]

    summary = import_data.summarize_rows(rows)

    assert summary == {
        "total_rows": 4,
        "text_rows": 1,
        "flex_rows": 1,
        "skipped_rows": 1,
        "unknown_type_rows": 1,
    }


def test_import_data_dry_run_reports_target_without_db_write(
    monkeypatch, tmp_path: Path, capsys
) -> None:
    csv_path = tmp_path / "sample.csv"
    csv_path.write_text("intent,msg_type,response\nhi,text,hello\n", encoding="utf-8")
    monkeypatch.setattr(
        import_data,
        "resolve_active_database_target",
        lambda: (tmp_path / ".env", "postgresql://localhost:5432/skn_app_db"),
    )

    exit_code = asyncio.run(import_data.run_import(csv_path, apply=False))

    captured = capsys.readouterr()
    assert exit_code == 0
    assert "Mode      : DRY RUN" in captured.out
    assert "DB target : postgresql://localhost:5432/skn_app_db" in captured.out
    assert "Dry run only." in captured.out
