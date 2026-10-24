"""One shared composer for structured citizen names.

Both LIFF flows store a single composed string; only the column cap differs,
so each schema owns its cap while the all-or-nothing rule lives here once.
"""
from typing import Optional


def compose_person_name(
    prefix: Optional[str],
    firstname: Optional[str],
    lastname: Optional[str],
    *,
    max_length: int,
) -> Optional[str]:
    """Compose "prefix firstname lastname", or None when all parts are blank.

    A half-filled trio raises (callers surface it as 422); an oversize result
    raises instead of truncating.
    """
    cleaned = [(part or "").strip() for part in (prefix, firstname, lastname)]
    if not any(cleaned):
        return None
    if any(not part for part in cleaned):
        raise ValueError("prefix, firstname and lastname are required together.")
    composed = " ".join(cleaned)
    if len(composed) > max_length:
        raise ValueError(f"composed name exceeds {max_length} characters.")
    return composed
