"""Check that an Alembic `current` report names exactly one expected revision.

Reads Alembic output from stdin. Exits 0 only when the reported revision set is
exactly {expected}. Prints revision identifiers and status only, never raw
driver output or connection strings. Run with --self-test for the local check.
"""
from __future__ import annotations

import re
import sys

USAGE = "usage: verify_migration_revision.py <expected-revision>  (Alembic output on stdin)"


LOG_WORDS = {"info", "warning", "warn", "error", "debug", "critical", "rev"}


def extract_revisions(text: str) -> list[str]:
    """Return revision IDs from Alembic `current` output.

    A revision line starts with a bare alnum token ("a3b4c5d6e7f8 (head)").
    Revision IDs here are not always hex ("z2a3b4c5d6e7" is valid), so accept
    any lowercase alnum token containing a digit. Log lines start with a word
    such as "INFO" or carry no digit, so they are ignored.
    """
    clean = re.sub(r"\x1b\[[0-9;]*[A-Za-z]", "", text)
    revisions: list[str] = []
    for line in clean.splitlines():
        parts = line.strip().split()
        if not parts:
            continue
        token = parts[0].lower()
        if token in LOG_WORDS or len(token) < 6 or not any(c.isdigit() for c in token):
            continue
        if re.fullmatch(r"[0-9a-z]+", token):
            revisions.append(token)
    return revisions


def verify(text: str, expected: str) -> tuple[bool, str]:
    expected = expected.lower()
    revisions = extract_revisions(text)
    if not revisions:
        return False, "no revision reported by Alembic current"
    found = ", ".join(sorted(set(revisions)))
    if set(revisions) != {expected}:
        return False, f"got [{found}], expected [{expected}]"
    return True, f"revision {expected} confirmed"


def self_test() -> int:
    cases = [
        ("a3b4c5d6e7f8 (head)\n", True),
        ("INFO driver noise\na3b4c5d6e7f8 (head)\n", True),
        ("z2a3b4c5d6e7 (head)\n", False),
        ("", False),
        ("\x1b[32ma3b4c5d6e7f8 (head)\x1b[0m\n", True),
        ("a3b4c5d6e7f8 (head)\nz2a3b4c5d6e7\n", False),
        # Driver noise mentioning a URL must not become a false revision.
        ("INFO Connecting postgresql://user:pw@host/db\na3b4c5d6e7f8 (head)\n", True),
    ]
    for text, expected_ok in cases:
        ok, _ = verify(text, "a3b4c5d6e7f8")
        assert ok is expected_ok, f"unexpected result for {text!r}"
    print(f"self-test passed: {len(cases)} cases")
    return 0


def main() -> int:
    if len(sys.argv) == 2 and sys.argv[1] == "--self-test":
        return self_test()
    if len(sys.argv) != 2:
        print(USAGE, file=sys.stderr)
        return 2
    ok, detail = verify(sys.stdin.read(), sys.argv[1])
    if ok:
        print(f"Migration gate passed: {detail}")
        return 0
    print(f"Migration gate failed: {detail}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
