"""Runtime intent-keyword matching in the LINE webhook (issue #120).

find_intent_keyword must try EXACT > STARTS_WITH > CONTAINS via SQL, then
evaluate REGEX keywords in Python with ReDoS guards (pattern-length cap,
probe-length cap, invalid patterns skipped instead of raised).
"""
import pytest
from unittest.mock import AsyncMock, MagicMock

from app.api.v1.endpoints.webhook import (
    MAX_REGEX_PATTERN_LENGTH,
    find_intent_keyword,
)


def _result(first=None, all_=None):
    r = MagicMock()
    r.scalars.return_value.first.return_value = first
    r.scalars.return_value.all.return_value = all_ if all_ is not None else []
    return r


def _regex_kw(pattern: str, kw_id: int = 1):
    kw = MagicMock()
    kw.id = kw_id
    kw.keyword = pattern
    return kw


@pytest.mark.asyncio
async def test_exact_match_wins_first():
    match = MagicMock()
    db = AsyncMock()
    db.execute.side_effect = [_result(first=match)]

    assert await find_intent_keyword("ราคา", db) is match
    assert db.execute.await_count == 1


@pytest.mark.asyncio
async def test_starts_with_checked_after_exact():
    match = MagicMock()
    db = AsyncMock()
    db.execute.side_effect = [_result(), _result(first=match)]

    assert await find_intent_keyword("สอบถามเรื่องยาเสพติด", db) is match
    assert db.execute.await_count == 2


@pytest.mark.asyncio
async def test_contains_checked_third():
    match = MagicMock()
    db = AsyncMock()
    db.execute.side_effect = [_result(), _result(), _result(first=match)]

    assert await find_intent_keyword("ขอราคาหน่อยครับ", db) is match
    assert db.execute.await_count == 3


@pytest.mark.asyncio
async def test_regex_matches_in_python():
    kw = _regex_kw(r"^สวัสดี")
    db = AsyncMock()
    db.execute.side_effect = [_result(), _result(), _result(), _result(all_=[kw])]

    assert await find_intent_keyword("สวัสดีครับ", db) is kw


@pytest.mark.asyncio
async def test_regex_is_case_insensitive():
    kw = _regex_kw(r"^hello\b")
    db = AsyncMock()
    db.execute.side_effect = [_result(), _result(), _result(), _result(all_=[kw])]

    assert await find_intent_keyword("HELLO there", db) is kw


@pytest.mark.asyncio
async def test_invalid_regex_pattern_is_skipped_not_raised():
    broken = _regex_kw(r"([", kw_id=1)
    valid = _regex_kw(r"ติดต่อ", kw_id=2)
    db = AsyncMock()
    db.execute.side_effect = [_result(), _result(), _result(), _result(all_=[broken, valid])]

    assert (await find_intent_keyword("ขอติดต่อหน่อย", db)) is valid


@pytest.mark.asyncio
async def test_overlong_regex_pattern_is_skipped():
    overlong = _regex_kw("a" * (MAX_REGEX_PATTERN_LENGTH + 1))
    db = AsyncMock()
    db.execute.side_effect = [_result(), _result(), _result(), _result(all_=[overlong])]

    assert await find_intent_keyword("a" * 300, db) is None


@pytest.mark.asyncio
async def test_no_match_returns_none_after_all_four_stages():
    db = AsyncMock()
    db.execute.side_effect = [_result(), _result(), _result(), _result(all_=[])]

    assert await find_intent_keyword("ไม่มีคีย์เวิร์ดนี้", db) is None
    assert db.execute.await_count == 4
