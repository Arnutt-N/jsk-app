"""Unit tests for the permission core helpers.

These tests exercise the DEFAULT_POLICY fallback path (no DB needed)
because _policy_cache starts as None in a fresh process.
"""
import pytest

from app.core.permissions import (
    can_revert_approval,
    can_edit_request_details,
    can_manage_users,
    get_effective_capabilities,
    get_permission_summary,
    keys_for_level,
    KEY_REVERT,
    KEY_EDIT_REQUEST_DETAILS,
    KEY_MANAGE_BROADCAST,
    KEY_MANAGE_AUTO_REPLIES,
    KEY_MANAGE_RICH_MENUS,
    KEY_MANAGE_REPLY_OBJECTS,
    KEY_EXPORT_CHAT,
    KEY_MANAGE_USERS,
    KEY_MANAGE_FILES,
    KEY_VIEW_REPORTS,
    KEY_VIEW_AUDIT_LOG,
    KEY_EDIT_SYSTEM_SETTINGS,
    KEY_IMAGE_RESIZE,
    ALL_PERMISSION_KEYS,
    DEFAULT_POLICY,
)
from app.models.user import UserRole


@pytest.mark.parametrize(
    "role,expected",
    [
        (UserRole.SUPER_ADMIN, True),
        (UserRole.ADMIN, True),
        (UserRole.DIRECTOR, False),  # default policy excludes
        (UserRole.HEAD, False),
        (UserRole.AGENT, False),
        (UserRole.USER, False),
        (None, False),
    ],
)
def test_can_revert_approval(role, expected):
    assert can_revert_approval(role) is expected


def test_can_revert_approval_string_input():
    """String role values are accepted for JSON round-trip safety."""
    assert can_revert_approval("ADMIN") is True
    assert can_revert_approval("DIRECTOR") is False
    with pytest.raises(ValueError):
        can_revert_approval("UNKNOWN_ROLE")


def test_get_permission_summary_includes_revert():
    summary = get_permission_summary()
    assert "revert_approval_allowed_roles" in summary
    assert summary["revert_approval_allowed_roles"] == ["ADMIN", "SUPER_ADMIN"]


def test_default_policy_has_revert_key():
    assert KEY_REVERT in DEFAULT_POLICY
    assert DEFAULT_POLICY[KEY_REVERT] == frozenset(
        {UserRole.SUPER_ADMIN, UserRole.ADMIN}
    )


@pytest.mark.parametrize(
    "role,expected",
    [
        (UserRole.SUPER_ADMIN, True),
        (UserRole.ADMIN, True),
        (UserRole.DIRECTOR, False),  # default policy excludes
        (UserRole.HEAD, False),
        (UserRole.AGENT, False),
        (UserRole.USER, False),
        (None, False),
    ],
)
def test_can_edit_request_details(role, expected):
    assert can_edit_request_details(role) is expected


def test_can_edit_request_details_string_input():
    """String role values are accepted for JSON round-trip safety."""
    assert can_edit_request_details("ADMIN") is True
    assert can_edit_request_details("AGENT") is False
    with pytest.raises(ValueError):
        can_edit_request_details("UNKNOWN_ROLE")


def test_get_permission_summary_includes_edit_request_details():
    summary = get_permission_summary()
    assert "edit_request_details_allowed_roles" in summary
    assert summary["edit_request_details_allowed_roles"] == ["ADMIN", "SUPER_ADMIN"]


def test_default_policy_has_edit_request_details_key():
    assert KEY_EDIT_REQUEST_DETAILS in DEFAULT_POLICY
    assert DEFAULT_POLICY[KEY_EDIT_REQUEST_DETAILS] == frozenset(
        {UserRole.SUPER_ADMIN, UserRole.ADMIN}
    )


# ---------------------------------------------------------------------------
# Phase 3 — module-based permission keys.
# Every new key defaults to {SUPER_ADMIN, ADMIN} except view_reports which
# also grants the two manager tiers (DIRECTOR/HEAD) read access.
# ---------------------------------------------------------------------------

# The 10 module keys whose default policy is exactly {SUPER_ADMIN, ADMIN}.
_ADMIN_ONLY_MODULE_KEYS = [
    KEY_MANAGE_BROADCAST,
    KEY_MANAGE_AUTO_REPLIES,
    KEY_MANAGE_RICH_MENUS,
    KEY_MANAGE_REPLY_OBJECTS,
    KEY_EXPORT_CHAT,
    KEY_MANAGE_USERS,
    KEY_MANAGE_FILES,
    KEY_VIEW_AUDIT_LOG,
    KEY_EDIT_SYSTEM_SETTINGS,
    KEY_IMAGE_RESIZE,
]


@pytest.mark.parametrize("key", _ADMIN_ONLY_MODULE_KEYS)
def test_new_module_key_defaults_to_admin_and_super_admin(key):
    assert key in DEFAULT_POLICY
    assert DEFAULT_POLICY[key] == frozenset(
        {UserRole.SUPER_ADMIN, UserRole.ADMIN}
    )


def test_view_reports_includes_director_and_head():
    assert KEY_VIEW_REPORTS in DEFAULT_POLICY
    assert DEFAULT_POLICY[KEY_VIEW_REPORTS] == frozenset(
        {
            UserRole.SUPER_ADMIN,
            UserRole.ADMIN,
            UserRole.DIRECTOR,
            UserRole.HEAD,
        }
    )


def test_can_manage_users_admin_true_agent_false():
    assert can_manage_users(UserRole.ADMIN) is True
    assert can_manage_users(UserRole.SUPER_ADMIN) is True
    assert can_manage_users(UserRole.AGENT) is False
    assert can_manage_users(UserRole.USER) is False


def test_effective_capabilities_public_user_all_false():
    caps = get_effective_capabilities(UserRole.USER)
    # The public USER role holds no module capabilities at all.
    assert caps  # non-empty registry projection
    assert all(value is False for value in caps.values())


def test_registry_parity_with_default_policy():
    """Every registered key must exist in DEFAULT_POLICY and vice versa."""
    assert set(ALL_PERMISSION_KEYS) == set(DEFAULT_POLICY)


def test_keys_for_level_manage_superset_of_view():
    """Higher level presets must include everything lower levels grant."""
    view_keys = keys_for_level("system", 1)
    manage_keys = keys_for_level("system", 3)
    assert set(view_keys).issubset(set(manage_keys))
