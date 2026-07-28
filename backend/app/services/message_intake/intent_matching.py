"""Intent keyword matching and reply resolution.

Priority cascade: EXACT > STARTS_WITH > CONTAINS > REGEX, then legacy
AutoReply fallback. Pure query logic — no side effects beyond DB reads.
"""
import logging
import re

from sqlalchemy import select, func, literal
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.auto_reply import AutoReply
from app.models.intent import IntentCategory, IntentKeyword, IntentResponse, MatchType

logger = logging.getLogger(__name__)

MAX_REGEX_PATTERN_LENGTH = 256
MAX_REGEX_TEXT_LENGTH = 1000


def _intent_keyword_stmt(*filters):
    return (
        select(IntentKeyword)
        .options(
            selectinload(IntentKeyword.category).selectinload(
                IntentCategory.responses.and_(IntentResponse.is_active == True)
            )
        )
        .filter(*filters)
    )


async def find_intent_keyword(text: str, db: AsyncSession) -> IntentKeyword | None:
    """Match an IntentKeyword against the user's text.

    Priority: EXACT > STARTS_WITH > CONTAINS > REGEX — most specific first, so
    a broad CONTAINS/REGEX rule cannot shadow a precise one. All comparisons
    are case-insensitive. REGEX is evaluated in Python (not SQL) so an invalid
    pattern degrades to a logged skip instead of failing the whole query.
    """
    stmt = _intent_keyword_stmt(
        func.lower(IntentKeyword.keyword) == text.lower(),
        IntentKeyword.match_type == MatchType.EXACT,
    ).limit(1)
    match = (await db.execute(stmt)).scalars().first()
    if match:
        return match

    stmt = _intent_keyword_stmt(
        literal(text).ilike(func.concat(IntentKeyword.keyword, '%')),
        IntentKeyword.match_type == MatchType.STARTS_WITH,
    ).limit(1)
    match = (await db.execute(stmt)).scalars().first()
    if match:
        return match

    stmt = _intent_keyword_stmt(
        literal(text).ilike(func.concat('%', IntentKeyword.keyword, '%')),
        IntentKeyword.match_type == MatchType.CONTAINS,
    ).limit(1)
    match = (await db.execute(stmt)).scalars().first()
    if match:
        return match

    stmt = _intent_keyword_stmt(IntentKeyword.match_type == MatchType.REGEX)
    regex_keywords = (await db.execute(stmt)).scalars().all()
    probe = text[:MAX_REGEX_TEXT_LENGTH]
    for kw in regex_keywords:
        pattern = kw.keyword or ""
        if len(pattern) > MAX_REGEX_PATTERN_LENGTH:
            logger.warning(
                f"Skipping REGEX intent keyword {kw.id}: pattern longer than "
                f"{MAX_REGEX_PATTERN_LENGTH} chars"
            )
            continue
        try:
            if re.search(pattern, probe, re.IGNORECASE):
                return kw
        except re.error as exc:
            logger.warning(f"Skipping invalid REGEX intent keyword {kw.id}: {exc}")
    return None


async def _find_autoreply_rule(text: str, db: AsyncSession):
    """Legacy AutoReply lookup: active exact keyword, then active contains."""
    stmt = select(AutoReply).filter(
        AutoReply.keyword == text, AutoReply.is_active == True
    )
    rule = (await db.execute(stmt)).scalars().first()
    if rule:
        return rule
    stmt = select(AutoReply).filter(
        literal(text).ilike(func.concat('%', AutoReply.keyword, '%')),
        AutoReply.is_active == True,
    ).limit(1)
    return (await db.execute(stmt)).scalars().first()


async def resolve_reply_responses(text: str, db: AsyncSession):
    """Resolve which responses answer ``text`` (issue #122).

    Tries an IntentKeyword match first, using its category's responses only when
    the category is active AND has >=1 active response. Otherwise — no keyword, an
    inactive category, or a category with no active responses — falls through to
    legacy AutoReply (exact -> contains) so a matched-but-unserviceable intent
    never dead-ends the message.

    Returns ``(responses, category_name, keyword_match)``. ``keyword_match`` is
    None whenever the answer comes from AutoReply, so the caller labels the reply
    from the rule rather than the dead intent. Returns ``([], "", None)`` when
    nothing can answer — the bot stays silent, which is the correct default.
    """
    keyword_match = await find_intent_keyword(text, db)
    if keyword_match:
        category = keyword_match.category
        if category and category.is_active and category.responses:
            return list(category.responses), category.name, keyword_match
        logger.info(
            "Intent keyword '%s' matched but its category is unavailable "
            "(inactive or no active responses) — falling through to AutoReply.",
            keyword_match.keyword,
        )

    rule = await _find_autoreply_rule(text, db)
    if not rule:
        logger.info(f"No auto-reply or intent found for: {text}")
        return [], "", None

    responses = [{
        "reply_type": rule.reply_type,
        "text_content": rule.text_content,
        "payload": rule.payload,
        "keyword": rule.keyword,
    }]
    return responses, "Legacy", None
