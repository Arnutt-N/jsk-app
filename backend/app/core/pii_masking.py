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


def mask_email(v: str | None, role: UserRole | str) -> str | None:
    if not v:
        return v
    if _can_view_full(role):
        return v
    local, sep, domain = v.partition("@")
    if not sep:
        return "***"
    return (local[:1] + "***" if local else "***") + sep + domain


_VIEWER_MASKERS = {
    "line_user_id": mask_line_id,
    "phone_number": mask_phone,
    "email": mask_email,
}
_VIEWER_MASKED_FIELDS = frozenset(_VIEWER_MASKERS)


def viewer_search_columns(columns, role: UserRole | str):
    """Search columns visible to the caller, derived from the same fields the
    response masks for VIEWER."""
    if not is_readonly_viewer(role):
        return tuple(columns)
    return tuple(c for c in columns if c.key not in _VIEWER_MASKED_FIELDS)


def is_readonly_viewer(role: UserRole | str | None) -> bool:
    if role is None:
        return False
    value = role.value if isinstance(role, UserRole) else role
    return value == UserRole.VIEWER.value


def mask_viewer_contacts(payload: dict, role: UserRole | str) -> dict:
    """Mask contact PII in a response dict when the caller is VIEWER.

    Requests/bookings list+detail responses carry raw phone/email/LINE id
    for every staff role today; rather than changing that contract, VIEWER
    (the only contact-PII reader outside the staff set) gets masked copies.
    Non-VIEWER roles receive the payload unchanged.
    """
    if not is_readonly_viewer(role):
        return payload
    masked = dict(payload)
    for field, masker in _VIEWER_MASKERS.items():
        if masked.get(field):
            masked[field] = masker(masked[field], role)
    return masked
