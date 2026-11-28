"""Canonical form for optional staff email addresses."""

from sqlalchemy import ColumnElement, func

# PostgreSQL's one-argument btrim strips only spaces, while Python's strip()
# removes every ASCII whitespace character. Use the same explicit set on both
# sides so a lookup matches the stored canonical form (F16).
EMAIL_WHITESPACE = " \t\n\r\f\v"


def email_matches(column: ColumnElement[str], email: str | None) -> ColumnElement[bool]:
    """Case-insensitive, whitespace-insensitive match for a stored email."""
    return (
        func.lower(func.btrim(column, EMAIL_WHITESPACE)) == normalize_email(email)
    )


def normalize_email(raw: str | None) -> str | None:
    if raw is None:
        return None
    value = raw.strip().lower()
    return value or None
