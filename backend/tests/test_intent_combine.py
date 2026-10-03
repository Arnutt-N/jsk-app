"""Combined intent SQL branches: 6 round trips → 3 (R3-M22)."""
import socket
from unittest.mock import AsyncMock, MagicMock
from urllib.parse import urlsplit
from uuid import uuid4

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool

from app.core.config import settings
from app.services.message_intake.intent_matching import (
    find_intent_keyword,
    resolve_reply_responses,
)


def _db_reachable() -> bool:
    u = urlsplit(str(settings.DATABASE_URL).replace("+asyncpg", ""))
    try:
        with socket.create_connection((u.hostname or "localhost", u.port or 5432), timeout=3):
            return True
    except OSError:
        return False


def _test_session():
    """Private NullPool engine — same foreign-loop rationale as T3."""
    engine = create_async_engine(str(settings.DATABASE_URL), poolclass=NullPool)
    return sessionmaker(engine, class_=AsyncSession, expire_on_commit=False), engine


def _result(first=None, all_=None):
    r = MagicMock()
    r.scalars.return_value.first.return_value = first
    r.scalars.return_value.all.return_value = all_ if all_ is not None else []
    return r


@pytest.mark.asyncio
async def test_no_match_anywhere_costs_three_queries():
    """Worst path: combined-intent + regex-all + autoreply = 3 (was 6)."""
    db = AsyncMock()
    db.execute = AsyncMock(side_effect=[_result(), _result(all_=[]), _result()])

    responses, name, kw = await resolve_reply_responses("zzz-no-such", db)

    assert (responses, name, kw) == ([], "", None)
    assert db.execute.await_count == 3


@pytest.mark.asyncio
async def test_exact_winner_resolves_in_one_query():
    match = MagicMock()
    db = AsyncMock()
    db.execute = AsyncMock(side_effect=[_result(first=match)])

    assert await find_intent_keyword("ราคา", db) is match
    assert db.execute.await_count == 1


@pytest.mark.asyncio
async def test_combined_statement_is_case_prioritized():
    db = AsyncMock()
    db.execute = AsyncMock(side_effect=[_result(first=MagicMock())])

    await find_intent_keyword("ราคา", db)

    sql = str(db.execute.call_args_list[0].args[0])
    assert "CASE" in sql
    assert "ORDER BY" in sql


@pytest.mark.asyncio
@pytest.mark.skipif(not _db_reachable(), reason="PostgreSQL not reachable (CI runs this; local dev skips)")
async def test_db_equivalence_matrix():
    from sqlalchemy import delete

    from app.models.auto_reply import AutoReply
    from app.models.auto_reply import ReplyType as AutoReplyType
    from app.models.intent import (
        IntentCategory,
        IntentKeyword,
        IntentResponse,
        MatchType,
        ReplyType,
    )

    nonce = uuid4().hex[:8]
    Session, engine = _test_session()
    cat_ids: list[int] = []
    kw_ids: list[int] = []
    resp_ids: list[int] = []
    ar_ids: list[int] = []
    try:
        async with Session() as db:
            cat_a = IntentCategory(name=f"catA{nonce}", is_active=True)
            cat_b = IntentCategory(name=f"catB{nonce}", is_active=True)
            cat_off = IntentCategory(name=f"catOff{nonce}", is_active=False)
            db.add_all([cat_a, cat_b, cat_off])
            await db.flush()

            resp_a = IntentResponse(
                category_id=cat_a.id, reply_type=ReplyType.TEXT,
                text_content=f"respA{nonce}", is_active=True,
            )
            resp_b = IntentResponse(
                category_id=cat_b.id, reply_type=ReplyType.TEXT,
                text_content=f"respB{nonce}", is_active=True,
            )
            resp_off = IntentResponse(
                category_id=cat_off.id, reply_type=ReplyType.TEXT,
                text_content=f"respOff{nonce}", is_active=True,
            )
            db.add_all([resp_a, resp_b, resp_off])
            await db.flush()

            # (a) priority: exact + starts + contains + regex + autoreply
            # all match E — the intent EXACT must win.
            E = f"นัด{nonce}เช้า"
            kw_exact = IntentKeyword(
                category_id=cat_a.id, keyword=E, match_type=MatchType.EXACT)
            kw_starts = IntentKeyword(
                category_id=cat_a.id, keyword=f"นัด{nonce}",
                match_type=MatchType.STARTS_WITH)
            kw_contains = IntentKeyword(
                category_id=cat_a.id, keyword=f"{nonce}เช้า",
                match_type=MatchType.CONTAINS)
            kw_regex = IntentKeyword(
                category_id=cat_a.id, keyword=f"นัด.*{nonce}.*",
                match_type=MatchType.REGEX)
            ar_exact = AutoReply(
                keyword=E, reply_type=AutoReplyType.TEXT,
                text_content=f"arE{nonce}", is_active=True)

            # (b) tie: two CONTAINS match T2 — min(ids) wins.
            T2 = f"qz{nonce}qw{nonce}qx"
            kw_tie1 = IntentKeyword(
                category_id=cat_b.id, keyword=f"qz{nonce}qw",
                match_type=MatchType.CONTAINS)
            kw_tie2 = IntentKeyword(
                category_id=cat_b.id, keyword=f"{nonce}qw{nonce}",
                match_type=MatchType.CONTAINS)

            # (c) B9: STARTS_WITH equal to the full text (LOWER id) vs
            # EXACT equal to the text (HIGHER id) — EXACT-typed wins.
            S = f"sw{nonce}full"
            kw_sw = IntentKeyword(
                category_id=cat_b.id, keyword=S,
                match_type=MatchType.STARTS_WITH)
            db.add_all([kw_exact, kw_starts, kw_contains, kw_regex,
                        kw_tie1, kw_tie2, kw_sw, ar_exact])
            await db.flush()
            kw_exact_late = IntentKeyword(
                category_id=cat_b.id, keyword=S, match_type=MatchType.EXACT)
            db.add(kw_exact_late)
            await db.flush()
            assert kw_sw.id < kw_exact_late.id

            # (d) inactive-category intent falls through to autoreply.
            T4 = f"zz{nonce}zx"
            kw_off = IntentKeyword(
                category_id=cat_off.id, keyword=T4, match_type=MatchType.EXACT)
            ar_t4 = AutoReply(
                keyword=T4, reply_type=AutoReplyType.TEXT,
                text_content=f"arT4{nonce}", is_active=True)
            db.add_all([kw_off, ar_t4])
            await db.commit()

            cat_ids = [cat_a.id, cat_b.id, cat_off.id]
            kw_ids = [k.id for k in (kw_exact, kw_starts, kw_contains,
                                     kw_regex, kw_tie1, kw_tie2, kw_sw,
                                     kw_exact_late, kw_off)]
            resp_ids = [resp_a.id, resp_b.id, resp_off.id]
            ar_ids = [ar_exact.id, ar_t4.id]
            cat_a_name = cat_a.name

        async with Session() as db:
            # (a) intent EXACT beats starts/contains/regex/autoreply.
            responses, name, kw = await resolve_reply_responses(E, db)
            assert kw is not None and kw.id == kw_exact.id
            assert name == cat_a_name
            assert [r.text_content for r in responses] == [f"respA{nonce}"]

            # (b) tie → lowest id.
            _, _, kw = await resolve_reply_responses(T2, db)
            assert kw is not None
            assert kw.id == min(kw_tie1.id, kw_tie2.id)

            # (c) B9 guard: EXACT-typed row wins despite higher id.
            _, _, kw = await resolve_reply_responses(S, db)
            assert kw is not None and kw.id == kw_exact_late.id
            assert kw.match_type == MatchType.EXACT

            # (d) inactive category → autoreply fallback.
            responses, name, kw = await resolve_reply_responses(T4, db)
            assert kw is None
            assert name == "Legacy"
            assert responses[0]["text_content"] == f"arT4{nonce}"

            # (e) no match anywhere.
            assert await resolve_reply_responses(f"nomatch{nonce}zzz", db) == (
                [], "", None)
    finally:
        async with Session() as db:
            if resp_ids:
                await db.execute(
                    delete(IntentResponse).where(IntentResponse.id.in_(resp_ids)))
            if kw_ids:
                await db.execute(
                    delete(IntentKeyword).where(IntentKeyword.id.in_(kw_ids)))
            if cat_ids:
                await db.execute(
                    delete(IntentCategory).where(IntentCategory.id.in_(cat_ids)))
            if ar_ids:
                await db.execute(
                    delete(AutoReply).where(AutoReply.id.in_(ar_ids)))
            await db.commit()
        await engine.dispose()
