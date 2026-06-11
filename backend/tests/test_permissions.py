"""Unit tests for the permission core helpers.

These tests exercise the DEFAULT_POLICY fallback path (no DB needed)
because _policy_cache starts as None in a fresh process.
"""
import pytest

from app.core.permissions import (
    can_revert_approval,
    can_edit_request_details,
    get_permission_summary,
    KEY_REVERT,
    KEY_EDIT_REQUEST_DETAILS,
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
