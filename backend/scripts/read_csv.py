from __future__ import annotations

import argparse
from pathlib import Path

from _cli_utils import BACKEND_DIR

REPO_ROOT = BACKEND_DIR.parent
DEFAULT_CSV_FILE = REPO_ROOT / "examples" / "moj-skn-bot-examples.csv"


def resolve_csv_path(raw_path: str | None = None) -> Path:
    if not raw_path:
        return DEFAULT_CSV_FILE
    candidate = Path(raw_path).expanduser()
    if not candidate.is_absolute():
        candidate = Path.cwd() / candidate
    return candidate.resolve()


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Preview CSV example data.")
    parser.add_argument(
        "csv_file",
        nargs="?",
        help="Optional path to a CSV file. Defaults to examples/moj-skn-bot-examples.csv",
    )
    return parser


def preview_csv(csv_path: Path) -> int:
    try:
        import pandas as pd

        df = pd.read_csv(csv_path, encoding="utf-8-sig")
        print("Successfully read CSV file.")
        print(f"Columns: {df.columns.tolist()}")
        print("\nSample Data (First 5 rows):")
        print(df.head().to_string())

        if "type" in df.columns or "message_type" in df.columns:
            type_col = "type" if "type" in df.columns else "message_type"
            print(f"\nMessage Types found: {df[type_col].unique().tolist()}")
        return 0
    except Exception as exc:
        print(f"Error reading CSV with pandas: {exc}")
        try:
            print("\nAttempting raw read...")
            with csv_path.open("r", encoding="utf-8-sig") as file_obj:
                for index, line in enumerate(file_obj):
                    if index >= 5:
                        break
                    print(line.strip())
            return 0
        except Exception as raw_exc:
            print(f"Error reading raw file: {raw_exc}")
            return 1


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    return preview_csv(resolve_csv_path(args.csv_file))


if __name__ == "__main__":
    raise SystemExit(main())
