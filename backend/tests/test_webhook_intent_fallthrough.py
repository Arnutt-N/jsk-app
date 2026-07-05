"""Intent → AutoReply fall-through in the LINE webhook (issue #122).

`resolve_reply_responses` must never let a matched-but-unserviceable intent
dead-end a message. When an IntentKeyword matches but its category is inactive
(Bug A) or the category is active with zero active responses (Bug B), the
resolver must fall through to legacy AutoReply (exact → contains) instead of
returning nothing — otherwise the bot silently swallows the user's message.

`keyword_match` in the returned tuple is None whenever the answer comes from
AutoReply, so the caller labels the reply from the rule (not the dead intent).
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from app.api.v1.endpoints.webhook import resolve_reply_responses


def _result(first=None):
    r = MagicMock()
    r.scalars.return_value.first.return_value = first
    return r


def _autoreply(keyword="hi", text="Hello!", reply_type="text", payload=None):
    rule = MagicMock()
    rule.keyword = keyword
    rule.text_content = text
    rule.reply_type = reply_type
    rule.payload = payload
    return rule


def _keyword_match(is_active=True, responses=None, cat_name="ราคา", keyword="ราคา"):
    kw = MagicMock()
    kw.keyword = keyword
    cat = MagicMock()
    cat.is_active = is_active
    cat.name = cat_name
    cat.responses = responses if responses is not None else []
    kw.category = cat
    return kw


def _patch_find(return_value):
    return patch(
        "app.api.v1.endpoints.webhook.find_intent_keyword",
        AsyncMock(return_value=return_value),
    )


@pytest.mark.asyncio
async def test_inactive_category_falls_through_to_autoreply():
    """Bug A: keyword matches but its category is inactive → must fall through to
    a legacy AutoReply so the user still gets a reply (was: silent return)."""
    kw = _keyword_match(is_active=False, responses=[MagicMock()])
    rule = _autoreply(keyword="ราคา", text="ราคาเริ่มต้น 100 บาท")
    db = AsyncMock()
    db.execute.side_effect = [_result(first=rule)]  # AutoReply exact hit

    with _patch_find(kw):
        responses, cat_name, keyword_match = await resolve_reply_responses("ราคา", db)

    assert keyword_match is None  # answered by AutoReply, not the dead intent
    assert cat_name == "Legacy"
    assert len(responses) == 1
    assert responses[0]["text_content"] == "ราคาเริ่มต้น 100 บาท"


@pytest.mark.asyncio
async def test_category_with_no_active_responses_falls_through():
    """Bug B: category active but 0 active responses (category.responses is []
    because selectinload filters is_active) → must fall through, not dead-end."""
    kw = _keyword_match(is_active=True, responses=[])
    rule = _autoreply()
    db = AsyncMock()
    db.execute.side_effect = [_result(first=rule)]

    with _patch_find(kw):
        responses, cat_name, keyword_match = await resolve_reply_responses("hi", db)

    assert keyword_match is None
    assert cat_name == "Legacy"
    assert len(responses) == 1


@pytest.mark.asyncio
async def test_active_category_with_responses_uses_intent():
    """Regression guard: an active category with active responses is answered by
    the intent itself — AutoReply must never be queried."""
    resp = MagicMock()
    kw = _keyword_match(is_active=True, responses=[resp], cat_name="ราคาสินค้า")
    db = AsyncMock()

    with _patch_find(kw):
        responses, cat_name, keyword_match = await resolve_reply_responses("ราคา", db)

    assert keyword_match is kw
    assert cat_name == "ราคาสินค้า"
    assert responses == [resp]
    db.execute.assert_not_awaited()


@pytest.mark.asyncio
async def test_keyword_match_with_no_category_falls_through():
    """Defensive: a keyword whose category is None (e.g. an orphaned row) must
    not raise on the ``category.is_active`` access — it is treated as
    unserviceable and falls through to AutoReply like Bug A."""
    kw = MagicMock()
    kw.keyword = "ราคา"
    kw.category = None
    rule = _autoreply(keyword="ราคา", text="ราคาเริ่มต้น 100 บาท")
    db = AsyncMock()
    db.execute.side_effect = [_result(first=rule)]

    with _patch_find(kw):
        responses, cat_name, keyword_match = await resolve_reply_responses("ราคา", db)

    assert keyword_match is None
    assert cat_name == "Legacy"
    assert len(responses) == 1


@pytest.mark.asyncio
async def test_no_keyword_match_uses_autoreply():
    """No intent keyword → legacy AutoReply path (existing behavior preserved)."""
    rule = _autoreply(keyword="สวัสดี", text="สวัสดีครับ")
    db = AsyncMock()
    db.execute.side_effect = [_result(first=rule)]

    with _patch_find(None):
        responses, cat_name, keyword_match = await resolve_reply_responses("สวัสดี", db)

    assert keyword_match is None
    assert cat_name == "Legacy"
    assert responses[0]["text_content"] == "สวัสดีครับ"


@pytest.mark.asyncio
async def test_no_keyword_uses_autoreply_contains_fallback():
    """No intent keyword and no exact AutoReply → contains AutoReply is tried
    (two DB queries) before giving up."""
    rule = _autoreply(keyword="ยาเสพติด", text="แจ้งเบาะแสได้ที่...")
    db = AsyncMock()
    db.execute.side_effect = [_result(first=None), _result(first=rule)]

    with _patch_find(None):
        responses, cat_name, keyword_match = await resolve_reply_responses(
            "อยากแจ้งยาเสพติด", db
        )

    assert cat_name == "Legacy"
    assert responses[0]["text_content"] == "แจ้งเบาะแสได้ที่..."
    assert db.execute.await_count == 2


@pytest.mark.asyncio
async def test_unserviceable_intent_and_no_autoreply_returns_empty():
    """Bug A with no AutoReply fallback either → returns empty so the bot stays
    silent (the correct default) instead of matching the dead intent."""
    kw = _keyword_match(is_active=False, responses=[MagicMock()])
    db = AsyncMock()
    db.execute.side_effect = [_result(first=None), _result(first=None)]

    with _patch_find(kw):
        responses, cat_name, keyword_match = await resolve_reply_responses("xyz", db)

    assert responses == []
    assert cat_name == ""
    assert keyword_match is None


@pytest.mark.asyncio
async def test_nothing_matches_returns_empty():
    """No keyword and no AutoReply → empty tuple (silent)."""
    db = AsyncMock()
    db.execute.side_effect = [_result(first=None), _result(first=None)]

    with _patch_find(None):
        responses, cat_name, keyword_match = await resolve_reply_responses("xyz", db)

    assert responses == []
    assert keyword_match is None
