from __future__ import annotations

import argparse
from pathlib import Path

from _cli_utils import BACKEND_DIR

REPO_ROOT = BACKEND_DIR.parent
DEFAULT_EXCEL_FILE = REPO_ROOT / "examples" / "moj-skn-bot-examples.xlsx"


def resolve_excel_path(raw_path: str | None = None) -> Path:
    if not raw_path:
        return DEFAULT_EXCEL_FILE
    candidate = Path(raw_path).expanduser()
    if not candidate.is_absolute():
        candidate = Path.cwd() / candidate
    return candidate.resolve()


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Preview Excel example data.")
    parser.add_argument(
        "excel_file",
        nargs="?",
        help="Optional path to an Excel file. Defaults to examples/moj-skn-bot-examples.xlsx",
    )
    return parser


def preview_excel(excel_path: Path) -> int:
    try:
        import pandas as pd

        workbook = pd.ExcelFile(excel_path)
        print(f"Sheets found: {workbook.sheet_names}")

        df = workbook.parse(workbook.sheet_names[0])
        print(f"\nSample data from '{workbook.sheet_names[0]}':")
        print(df.head().to_string())
        print("\nColumns:", df.columns.tolist())
        return 0
    except Exception as exc:
        print(f"Error reading Excel: {exc}")
        return 1


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    return preview_excel(resolve_excel_path(args.excel_file))


if __name__ == "__main__":
    raise SystemExit(main())
