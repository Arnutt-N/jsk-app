"""Stage 1: Hardcoded role-based permissions for request workflow actions.

This module owns the SOURCE OF TRUTH for "who can do what" in the request
workflow, used by both backend endpoints (authorization) and frontend
(button visibility via /admin/permissions endpoint).

Stage 2 will replace these constants with a DB-backed lookup from a new
`permission_settings` table, configurable via the Settings UI at
/admin/settings/permissions. All call sites should already be using the
helper functions below (not the constants directly) so the swap is a
one-line change in this module.

Default policy (matches Q5 confirmation 2026-05-04):
  Role           Assign others   Self-assign   Edit settings
  -----------    -------------   -----------   -------------
  SUPER_ADMIN    YES             YES           YES
  ADMIN          YES             YES           YES
  DIRECTOR       YES             YES           NO
  HEAD           YES             YES           NO
  AGENT          NO              NO            NO
  USER           NO              NO            NO
"""
from __future__ import annotations

from app.models.user import UserRole

# Roles allowed to assign a request to another user (hand out work).
ASSIGN_ALLOWED_ROLES: frozenset[UserRole] = frozenset({
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.DIRECTOR,
    UserRole.HEAD,
})

# Roles allowed to self-assign (claim a PENDING request without supervisor).
SELF_ASSIGN_ALLOWED_ROLES: frozenset[UserRole] = frozenset({
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.DIRECTOR,
    UserRole.HEAD,
})

# Roles allowed to edit the permission_settings table itself.
# Intentionally narrower than the above -- only top-tier roles can change
# who is allowed to do what.
PERMISSION_SETTINGS_EDITOR_ROLES: frozenset[UserRole] = frozenset({
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
})


def can_assign(role: UserRole | str | None) -> bool:
    """Whether `role` can assign a request to another user."""
    if role is None:
        return False
    role_enum = role if isinstance(role, UserRole) else UserRole(role)
    return role_enum in ASSIGN_ALLOWED_ROLES


def can_self_assign(role: UserRole | str | None) -> bool:
    """Whether `role` can claim/self-assign a PENDING request."""
    if role is None:
        return False
    role_enum = role if isinstance(role, UserRole) else UserRole(role)
    return role_enum in SELF_ASSIGN_ALLOWED_ROLES


def can_edit_permission_settings(role: UserRole | str | None) -> bool:
    """Whether `role` can read/edit the permission_settings table."""
    if role is None:
        return False
    role_enum = role if isinstance(role, UserRole) else UserRole(role)
    return role_enum in PERMISSION_SETTINGS_EDITOR_ROLES


def get_permission_summary() -> dict[str, list[str]]:
    """Return current permission map as plain JSON-serialisable dict.

    Used by the GET /admin/permissions endpoint so the frontend can
    decide which buttons to render. Stage 2 will read this from DB.
    """
    return {
        "assign_allowed_roles": sorted(r.value for r in ASSIGN_ALLOWED_ROLES),
        "self_assign_allowed_roles": sorted(r.value for r in SELF_ASSIGN_ALLOWED_ROLES),
        "permission_settings_editor_roles": sorted(r.value for r in PERMISSION_SETTINGS_EDITOR_ROLES),
    }
