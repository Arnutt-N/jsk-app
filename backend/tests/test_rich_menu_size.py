"""Tests for rich menu canvas size resolution (compact vs large)."""
import pytest

from app.api.v1.endpoints.rich_menus import (
    RICH_MENU_HEIGHT_COMPACT,
    RICH_MENU_HEIGHT_LARGE,
    RICH_MENU_WIDTH,
    resolve_rich_menu_size,
)


@pytest.mark.parametrize(
    "template_type,expected_height",
    [
        # Compact templates (frontend ids contain "compact") -> 843
        ("3-buttons-compact", RICH_MENU_HEIGHT_COMPACT),
        ("2-buttons-compact-cols", RICH_MENU_HEIGHT_COMPACT),
        ("2-buttons-compact-asym", RICH_MENU_HEIGHT_COMPACT),
        ("1-button-compact-full", RICH_MENU_HEIGHT_COMPACT),
        # Large templates -> 1686
        ("6-buttons", RICH_MENU_HEIGHT_LARGE),
        ("4-buttons", RICH_MENU_HEIGHT_LARGE),
        ("3-buttons-top", RICH_MENU_HEIGHT_LARGE),
        ("1-button-full", RICH_MENU_HEIGHT_LARGE),
        # Unknown/empty -> default large (always accepted by LINE)
        ("", RICH_MENU_HEIGHT_LARGE),
        ("something-new", RICH_MENU_HEIGHT_LARGE),
    ],
)
def test_resolve_rich_menu_size_height(template_type, expected_height):
    size = resolve_rich_menu_size(template_type)
    assert size["height"] == expected_height
    assert size["width"] == RICH_MENU_WIDTH


def test_resolve_rich_menu_size_none_defaults_to_large():
    size = resolve_rich_menu_size(None)
    assert size["height"] == RICH_MENU_HEIGHT_LARGE
    assert size["width"] == RICH_MENU_WIDTH


def test_resolve_rich_menu_size_is_case_insensitive():
    assert resolve_rich_menu_size("3-Buttons-COMPACT")["height"] == RICH_MENU_HEIGHT_COMPACT
