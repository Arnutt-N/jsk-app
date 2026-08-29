"""Shared query-safety helpers for SQLAlchemy ilike/like patterns."""


def escape_ilike(value: str) -> str:
    """Escape SQL LIKE wildcards (%, _) and the escape char (\\) in user input.

    Use before interpolating into ``ilike(f"%{escape_ilike(q)}%", escape="\\\\")``
    so that literal % or _ in the search term are treated as characters, not
    wildcards. Mirrors the pattern at conversations.py:263-270.
    """
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
