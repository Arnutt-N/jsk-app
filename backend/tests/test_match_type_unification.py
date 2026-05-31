"""Tests for MatchType enum consistency between auto_reply and intent models."""
from app.models.auto_reply import MatchType as AutoReplyMatchType
from app.models.intent import MatchType as IntentMatchType


def test_auto_reply_match_type_has_starts_with():
    """AutoReply MatchType should include STARTS_WITH."""
    assert hasattr(AutoReplyMatchType, 'STARTS_WITH')
    assert AutoReplyMatchType.STARTS_WITH.value == "starts_with"


def test_intent_match_type_has_starts_with():
    """Intent MatchType should include STARTS_WITH."""
    assert hasattr(IntentMatchType, 'STARTS_WITH')
    assert IntentMatchType.STARTS_WITH.value == "starts_with"


def test_both_match_types_have_same_values():
    """Both MatchType enums should have identical values."""
    auto_values = {e.value for e in AutoReplyMatchType}
    intent_values = {e.value for e in IntentMatchType}
    assert auto_values == intent_values, f"Mismatch: auto={auto_values}, intent={intent_values}"


def test_match_types_count():
    """Both MatchType enums should have 4 values."""
    assert len(AutoReplyMatchType) == 4
    assert len(IntentMatchType) == 4


def test_all_match_type_values():
    """Verify all expected match type values exist."""
    expected = {"exact", "contains", "regex", "starts_with"}
    auto_values = {e.value for e in AutoReplyMatchType}
    intent_values = {e.value for e in IntentMatchType}
    assert auto_values == expected
    assert intent_values == expected
