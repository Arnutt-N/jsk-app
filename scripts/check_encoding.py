"""Scan source code for encoding artifacts that point to a UTF-8 / Windows-874
round-trip corruption.

Exits non-zero if any source file (other than this scanner and the
recovery tool itself) contains:
  - The mojibake signature "เน€เธ" (Thai consonants displaced by 1 byte
    after a UTF-8 -> CP874 -> UTF-8 chain)
  - The mojibake signature "เธขเธ" (the corrupted form of "©")
  - A U+FFFD replacement character (decoder-injected unknown byte)
  - A C0 control character outside \t \n \r
  - A C1 control character (U+0080 - U+009F) — these never appear in
    legitimate text, only after a botched encoding round-trip

Usage:
  python scripts/check_encoding.py                 # scan default roots
  python scripts/check_encoding.py path/to/file    # scan specific files
"""
from __future__ import annotations

import os
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent

PATTERNS = {
    "mojibake_เน€เธ": re.compile(r"เน€เธ"),
    "mojibake_เธขเธ": re.compile(r"เธขเธ"),
    "replacement_char": re.compile("�"),
}


def is_control(c: str) -> bool:
    o = ord(c)
    return (o < 0x20 and c not in "\t\n\r") or 0x80 <= o <= 0x9F


SOURCE_EXTS = {".tsx", ".ts", ".jsx", ".js", ".css", ".py", ".md", ".yml",
               ".yaml", ".json", ".html", ".sh"}

DEFAULT_ROOTS = ["frontend", "backend/app", "backend/scripts", "backend/tests",
                 "scripts", "docs", ".github"]

EXCLUDE_DIRS = {
    "node_modules", ".next", "venv", "venv_linux", "venv_win", "venv_test",
    "__pycache__", ".git", "dist", "build", "out", ".turbo", ".vercel",
    "lib64",
}

# Files that legitimately contain mojibake patterns (regex literals etc.)
ALLOWLIST = {
    "scripts/check_encoding.py",
    "scripts/fix_mojibake.py",
}


def iter_source_files(targets):
    files = []
    for target in targets:
        path = Path(target)
        if path.is_file():
            files.append(path)
            continue
        if not path.is_dir():
            continue
        for dirpath, dirnames, filenames in os.walk(path):
            dirnames[:] = [d for d in dirnames if d not in EXCLUDE_DIRS]
            for fn in filenames:
                fp = Path(dirpath) / fn
                if fp.suffix in SOURCE_EXTS:
                    files.append(fp)

    if not targets or targets == DEFAULT_ROOTS:
        for fn in os.listdir("."):
            fp = Path(fn)
            if fp.is_file() and fp.suffix == ".md":
                files.append(fp)
    return files


def normalize_path(fp):
    return str(fp).replace("\\", "/")


def scan_file(fp):
    try:
        text = fp.read_text(encoding="utf-8")
    except (UnicodeDecodeError, OSError):
        return {}

    issues = {}
    for name, pat in PATTERNS.items():
        n = len(pat.findall(text))
        if n:
            issues[name] = n

    control_count = sum(1 for c in text if is_control(c))
    if control_count:
        issues["control_chars"] = control_count
    return issues


def main(argv):
    targets = argv[1:] if len(argv) > 1 else DEFAULT_ROOTS

    bad = {}
    files = iter_source_files(targets)

    for fp in files:
        norm = normalize_path(fp)
        if norm in ALLOWLIST:
            continue
        issues = scan_file(fp)
        if issues:
            bad[norm] = issues

    if not bad:
        print(f"OK: {len(files)} files scanned, no encoding issues found.")
        return 0

    print(f"FAIL: {len(bad)} file(s) contain encoding artifacts:\n")
    for f, issues in sorted(bad.items()):
        print(f"  {f}")
        for k, v in issues.items():
            print(f"    - {k}: {v}")
    print()
    print("Likely cause: the file was opened in an editor that interpreted")
    print("UTF-8 bytes as Windows-874 (cp874) and re-saved as UTF-8.")
    print("Recovery tool: scripts/fix_mojibake.py")
    print("Prevention: keep .editorconfig and .gitattributes (UTF-8, LF).")
    return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
