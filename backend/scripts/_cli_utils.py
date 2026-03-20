from __future__ import annotations

import sys
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[1]


def ensure_backend_on_path() -> Path:
    if str(BACKEND_DIR) not in sys.path:
        sys.path.insert(0, str(BACKEND_DIR))
    return BACKEND_DIR


def resolve_output_path(raw_path: Path | None) -> Path | None:
    if raw_path is None:
        return None
    path = raw_path.expanduser()
    if not path.is_absolute():
        path = Path.cwd() / path
    return path.resolve()


def emit_report(lines: list[str], output_path: Path | None) -> str:
    report = "\n".join(lines)
    print(report)
    if output_path is not None:
        output_path.write_text(report + "\n", encoding="utf-8")
        print(f"\nSaved report to: {output_path}")
    return report
