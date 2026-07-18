"""
Unit tests for canned_response_service._normalize_shortcut.

The stored shortcut must never contain the live-chat trigger prefix ``/`` —
the composer re-adds it at display time, so storing it here would render as
``//greeting`` in the admin table.
"""
import pytest

from app.services.canned_response_service import _normalize_shortcut


class TestNormalizeShortcut:
    @pytest.mark.parametrize(
        "raw, expected",
        [
            ("greeting", "greeting"),
            ("/greeting", "greeting"),
            ("//thanks", "thanks"),
            ("///wait", "wait"),
            ("  /wait  ", "wait"),
            ("  thanks  ", "thanks"),
            ("/  greeting  ", "greeting"),
            ("", ""),
            ("/", ""),
            ("//", ""),
            ("   ", ""),
        ],
    )
    def test_strips_leading_slash_and_whitespace(self, raw: str, expected: str):
        assert _normalize_shortcut(raw) == expected

    def test_does_not_strip_internal_slash(self):
        # A slash inside the shortcut (e.g. "hi/there") is preserved; only the
        # leading trigger prefix(es) are removed.
        assert _normalize_shortcut("/hi/there") == "hi/there"