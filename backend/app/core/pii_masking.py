"""Role-based PII masking for API responses (D4).

Separate from logging_utils' mask helpers (different signature, log-only) —
this module is the single source for response/export masking. Full values
are only returned to SUPER_ADMIN/ADMIN; other staff roles see masked IDs.
"""
from app.models.user import UserRole

_FULL_PII_ROLES = frozenset({UserRole.SUPER_ADMIN, UserRole.ADMIN})


def _can_view_full(role: UserRole | str) -> bool:
    value = role.value if isinstance(role, UserRole) else role
    return any(value == allowed.value for allowed in _FULL_PII_ROLES)


def mask_line_id(v: str | None, role: UserRole | str) -> str | None:
    if not v:
        return v
    if _can_view_full(role):
        return v
    return v[:3] + "***" + v[-2:] if len(v) > 5 else "***"


def mask_phone(v: str | None, role: UserRole | str) -> str | None:
    if not v:
        return v
    if _can_view_full(role):
        return v
    return v[:3] + "****" + v[-2:] if len(v) > 5 else "***"
