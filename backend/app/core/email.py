"""Canonical form for optional staff email addresses."""


def normalize_email(raw: str | None) -> str | None:
    if raw is None:
        return None
    value = raw.strip().lower()
    return value or None
