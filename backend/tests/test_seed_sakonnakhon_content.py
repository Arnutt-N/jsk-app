"""Phase 1 tests: SakonNakhonBot Sheet1 import script.

Pure layer (no DB): classify / grouping / overlap gate / media classifier /
$-hygiene / determinism / payload builders.
DB layer (one integration test on the real test DB): apply twice converges,
then cleans up everything it created.
"""
import uuid

import pytest
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool

from scripts.seed_sakonnakhon_content import (
    AnsweredRow,
    SilentRow,
    build_flex_carousel_payload,
    build_plan,
    build_template_carousel_payload,
    classify_row,
    dollar_warnings,
    group_rows,
    is_selfhostable,
    load_rows,
)

HEADER = (
    "intent,response,imageType,imageData,imageAltText,aspectRatio,"
    "fullSizeUrls,previewUrls,size,aspectMode,backgroundColor\n"
)


def _write_csv(tmp_path, rows: list[str]):
    path = tmp_path / f"sheet-{uuid.uuid4().hex[:6]}.csv"
    path.write_text(HEADER + "".join(rows), encoding="utf-8-sig")
    return path


def _row(intent, response, image_type="", image_data=""):
    return f"{intent},{response},{image_type},{image_data},,,,,,,\n"


# --- classify ---


def test_classify_answered_row():
    row = classify_row(
        {"intent": "สวัสดี", "response": "สวัสดีค่ะ", "imageType": "none"}
    )
    assert isinstance(row, AnsweredRow)
    assert row.keyword == "สวัสดี" and row.image_type == "none"


def test_classify_silent_rows():
    for silent in ("line-oa", "LINE-OA", "no-action", "  ", ""):
        row = classify_row({"intent": "คีย์เมนู", "response": silent})
        assert isinstance(row, SilentRow), silent


def test_classify_junk_row():
    assert classify_row({"intent": "  ", "response": "text"}) is None
    assert classify_row({"intent": "", "response": ""}) is None


def test_classify_zero_keyword_refused():
    with pytest.raises(ValueError, match="behavior, not content"):
        classify_row({"intent": "0", "response": "staff"})


def test_load_rows_reads_csv(tmp_path):
    path = _write_csv(tmp_path, [_row("ก", "ข"), _row("เมนู", "line-oa"), ",,\n"])
    raws = load_rows(path)
    assert len(raws) == 3
    answered = [r for r in (classify_row(x) for x in raws) if isinstance(r, AnsweredRow)]
    assert [r.keyword for r in answered] == ["ก"]


def test_load_rows_quotes_and_embedded_newlines(tmp_path):
    """Stray quotes in Thai copy must not split rows (sniffer doublequote trap)."""
    import csv as _csv

    path = tmp_path / "q.csv"
    with path.open("w", encoding="utf-8-sig", newline="") as fh:
        w = _csv.writer(fh)
        w.writerow(HEADER.strip().split(","))
        w.writerow(["คดี", 'ตอบ "แบบนี้"\nบรรทัดสอง', "none", "", "", "auto", "", "", "", "", ""])
        w.writerow(["ต่อไป", "ปกติ", "none", "", "", "auto", "", "", "", "", ""])
    raws = load_rows(path)
    assert len(raws) == 2
    first = classify_row(raws[0])
    assert isinstance(first, AnsweredRow)
    assert first.answer == 'ตอบ "แบบนี้"\nบรรทัดสอง'


# --- grouping ---


def test_grouping_merges_identical_answers():
    rows = [
        AnsweredRow("ถาม1", "ตอบเดียวกัน", "none", "", "", "auto", "", "", "", "", ""),
        AnsweredRow("ถาม2", "ตอบเดียวกัน", "none", "", "", "auto", "", "", "", "", ""),
        AnsweredRow("ถาม3", "อีกคำตอบ", "none", "", "", "auto", "", "", "", "", ""),
    ]
    groups = group_rows(rows)
    assert len(groups) == 2
    merged = next(g for g in groups if g.answer == "ตอบเดียวกัน")
    assert merged.keywords == ("ถาม1", "ถาม2")


def test_grouping_splits_on_media():
    rows = [
        AnsweredRow("ก", "ตอบ", "none", "", "", "auto", "", "", "", "", ""),
        AnsweredRow("ข", "ตอบ", "single", "https://x/y.jpg", "", "auto", "", "", "", "", ""),
    ]
    assert len(group_rows(rows)) == 2


def test_group_slug_stable():
    row = AnsweredRow("ก", "ตอบ", "none", "", "", "auto", "", "", "", "", "")
    assert group_rows([row])[0].slug == group_rows([row])[0].slug
    assert len(group_rows([row])[0].slug) == 12


# --- overlap gate + determinism ---


def _answered(keyword, answer="ตอบค่ะ"):
    return AnsweredRow(keyword, answer, "none", "", "", "auto", "", "", "", "", "")


def test_overlap_gate_blocks_and_force_passes():
    plan = build_plan([_answered("ซ้ำ")], 0, 0, {"ซ้ำ"}, set())
    assert plan.overlap and not plan.can_apply()
    assert plan.overlap_keywords == [("ซ้ำ", "intent")]
    assert plan.can_apply(force_with_overlap=True)
    plan2 = build_plan([_answered("ใหม่")], 0, 0, {"ซ้ำ"}, {"เก่า"})
    assert plan2.can_apply() and not plan2.overlap
    plan3 = build_plan([_answered("ซ้ำ")], 0, 0, set(), {"ซ้ำ"})
    assert plan3.overlap_keywords == [("ซ้ำ", "autoreply")]


def test_plan_deterministic():
    rows = [_answered("ก"), _answered("ข", "อีกคำตอบ")]
    assert build_plan(rows, 1, 2, set(), set()) == build_plan(rows, 1, 2, set(), set())


# --- media classifier + $-hygiene ---


def test_is_selfhostable():
    assert is_selfhostable("https://x/y.jpg")
    assert is_selfhostable("https://x/y.PNG?size=1")
    assert not is_selfhostable("https://x/y.gif")
    assert not is_selfhostable("https://x/y.webp")
    assert not is_selfhostable("https://x/y.mp4")
    assert not is_selfhostable("https://x/noext")
    assert not is_selfhostable("https://x/y.jpg", size_bytes=11 * 1024 * 1024)


def test_dollar_warnings():
    assert dollar_warnings("ราคา $100 บาท", "ราคา") != []
    assert dollar_warnings("ดู $skn_abc123 เพิ่ม", "ดู") == []


# --- payload builders ---


def test_flex_carousel_caps_and_uri_action():
    from scripts.seed_sakonnakhon_content import AnswerGroup

    group = AnswerGroup(
        name="n", keywords=("k",), answer="a", image_type="flex_carousel",
        image_urls=tuple(f"https://x/{i}.jpg" for i in range(15)),
        full_urls=(), preview_urls=(), alt_text="alt",
        aspect_ratio="legal", size="", aspect_mode="", background_color="",
        slug="abc123",
    )
    payload = build_flex_carousel_payload(group)
    assert payload["type"] == "carousel"
    assert len(payload["contents"]) == 12
    hero = payload["contents"][0]["hero"]
    assert hero["aspectRatio"] == "4:5" and hero["aspectMode"] == "fit"
    assert hero["action"] == {"type": "uri", "uri": "https://x/0.jpg"}


def test_template_carousel_column_cap():
    from scripts.seed_sakonnakhon_content import AnswerGroup

    group = AnswerGroup(
        name="n", keywords=("k",), answer="a", image_type="carousel",
        image_urls=tuple(f"https://x/{i}.jpg" for i in range(12)),
        full_urls=(), preview_urls=(), alt_text="รูป",
        aspect_ratio="auto", size="", aspect_mode="", background_color="",
        slug="abc123",
    )
    payload = build_template_carousel_payload(group)
    assert payload["template"]["type"] == "image_carousel"
    assert len(payload["template"]["columns"]) == 10


# --- DB integration: supersede + apply twice converges ---


@pytest.mark.asyncio
async def test_supersede_deactivates_stale_overlap():
    """Overlapping stale rows are deactivated (never deleted), then import wins."""
    from app.core.config import settings
    from app.models.auto_reply import AutoReply
    from app.models.intent import (
        IntentCategory,
        IntentKeyword,
        IntentResponse,
        MatchType,
        ReplyType,
    )
    from scripts.seed_sakonnakhon_content import apply_plan, build_plan

    tag = uuid.uuid4().hex[:8]
    keyword = f"pytest-collide-{tag}"
    engine, Session = _engine_for_test(settings)
    try:
        async with Session() as db:
            stale_cat = IntentCategory(
                name=f"stale-{tag}", description="Imported from CSV"
            )
            db.add(stale_cat)
            await db.flush()
            db.add(IntentKeyword(category_id=stale_cat.id, keyword=keyword,
                                 match_type=MatchType.CONTAINS))
            db.add(IntentResponse(category_id=stale_cat.id,
                                  reply_type=ReplyType.TEXT,
                                  text_content="stale", is_active=True))
            db.add(AutoReply(keyword=keyword, match_type=MatchType.CONTAINS,
                             reply_type=ReplyType.TEXT,
                             text_content="stale auto", is_active=True))
            await db.commit()
            stale_cat_id = stale_cat.id

        answered = [_answered(keyword, f"fresh-{tag}")]
        async with Session() as db:
            live_kw = {r.lower() for r in await _all_keywords(db)}
            live_ar = {r.lower() for r in await _all_autoreplies(db)}
        plan = build_plan(answered, 0, 0, live_kw, live_ar)
        assert not plan.can_apply()
        async with Session() as db:
            report = await apply_plan(plan, db, deactivate_stale=True)
        assert report.superseded_categories >= 1
        assert report.superseded_autoreplies >= 1
        assert report.categories_created == 1
        async with Session() as db:
            stale = await db.get(IntentCategory, stale_cat_id)
            assert stale.is_active is False
            autos = await _autoreplies_for(db, keyword)
            assert autos and all(a.is_active is False for a in autos)
            # Cleanup: remove everything this test created.
            for cat in await _categories_named(db, (f"stale-{tag}",)):
                await db.delete(cat)
            for cat in await _categories_named(db, (keyword,)):
                await db.delete(cat)
            for auto_row in await _autoreplies_for(db, keyword):
                await db.delete(auto_row)
            await db.commit()
    finally:
        await engine.dispose()


def _engine_for_test(settings):
    from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
    from sqlalchemy.orm import sessionmaker
    from sqlalchemy.pool import NullPool

    engine = create_async_engine(str(settings.DATABASE_URL), poolclass=NullPool)
    return engine, sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def _all_keywords(db):
    from app.models.intent import IntentKeyword

    return (await db.execute(select(IntentKeyword.keyword))).scalars().all()


async def _all_autoreplies(db):
    from app.models.auto_reply import AutoReply

    return (
        await db.execute(
            select(AutoReply.keyword).where(AutoReply.is_active == True)  # noqa: E712
        )
    ).scalars().all()


async def _categories_named(db, names):
    from app.models.intent import IntentCategory

    return (
        await db.execute(
            select(IntentCategory).where(IntentCategory.name.in_(names))
        )
    ).scalars().all()


async def _autoreplies_for(db, keyword):
    from sqlalchemy import func

    from app.models.auto_reply import AutoReply

    return (
        await db.execute(
            select(AutoReply).where(func.lower(AutoReply.keyword) == keyword.lower())
        )
    ).scalars().all()


@pytest.mark.asyncio
async def test_partial_plan_never_sweeps_unseen_pack_categories():
    """Regression: a single-group apply (tests, dev snippets) must not
    retire pack categories it did not see. A partial plan once swept all
    61 pack rows on dev; the sweep is now gated behind full_sync."""
    from app.core.config import settings
    from app.models.intent import IntentCategory
    from scripts.seed_sakonnakhon_content import apply_plan, build_plan

    tag = uuid.uuid4().hex[:8]
    engine, Session = _engine_for_test(settings)
    try:
        async with Session() as db:
            foreign = IntentCategory(
                name=f"foreign-pack-{tag}",
                description="source: sakonnakhon import (other sheet)",
                is_active=True,
            )
            db.add(foreign)
            from app.models.reply_object import ObjectType, ReplyObject

            foreign_obj = ReplyObject(
                object_id=f"$skn_foreign_{tag}", name=f"foreign {tag}",
                object_type=ObjectType.TEXT, payload={"text": "x"},
                is_active=True,
            )
            db.add(foreign_obj)
            await db.commit()
        plan = build_plan([_answered(f"pytest-only-{tag}")], 0, 0, set(), set())
        # Snapshot every pack row first: full_sync below retires ALL marked
        # categories absent from the 1-group plan, so restore them after.
        # (This test runs on the shared dev DB, not an isolated fixture DB.)
        from app.models.intent import IntentResponse

        async with Session() as db:
            marked = (
                await db.execute(
                    select(IntentCategory).where(
                        IntentCategory.description.startswith("source: sakonnakhon")
                    )
                )
            ).scalars().all()
            snapshot = {}
            for cat in marked:
                resp_ids = (
                    await db.execute(
                        select(IntentResponse.id).where(
                            IntentResponse.category_id == cat.id,
                            IntentResponse.is_active == True,  # noqa: E712
                        )
                    )
                ).scalars().all()
                snapshot[cat.id] = (cat.is_active, list(resp_ids))
        try:
            async with Session() as db:
                # Default apply (no full_sync): foreign pack row must survive.
                await apply_plan(plan, db)
            async with Session() as db:
                kept = await db.get(IntentCategory, foreign.id)
                assert kept is not None and kept.is_active is True
                kept_obj = (
                    await db.execute(
                        select(ReplyObject).where(
                            ReplyObject.object_id == f"$skn_foreign_{tag}"
                        )
                    )
                ).scalar_one()
                assert kept_obj.is_active is True
                # Full sync DOES retire it (declared full-sheet convergence).
                await apply_plan(plan, db, full_sync=True)
            async with Session() as db:
                retired = await db.get(IntentCategory, foreign.id)
                assert retired is not None and retired.is_active is False
                retired_obj = (
                    await db.execute(
                        select(ReplyObject).where(
                            ReplyObject.object_id == f"$skn_foreign_{tag}"
                        )
                    )
                ).scalar_one()
                assert retired_obj.is_active is False
        finally:
            async with Session() as db:
                for cat_id, (was_active, resp_ids) in snapshot.items():
                    cat = await db.get(IntentCategory, cat_id)
                    if cat is None:
                        continue
                    cat.is_active = was_active
                    if resp_ids:
                        resps = (
                            await db.execute(
                                select(IntentResponse).where(
                                    IntentResponse.id.in_(resp_ids)
                                )
                            )
                        ).scalars().all()
                        for resp in resps:
                            resp.is_active = True
                for cat in await _categories_named(
                    db, (f"pytest-only-{tag}", f"foreign-pack-{tag}")
                ):
                    await db.delete(cat)
                doomed = (
                    await db.execute(
                        select(ReplyObject).where(
                            ReplyObject.object_id == f"$skn_foreign_{tag}"
                        )
                    )
                ).scalar_one_or_none()
                if doomed is not None:
                    await db.delete(doomed)
                await db.commit()
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_apply_twice_converges_and_cleans_up(tmp_path):
    from app.core.config import settings
    from app.models.intent import IntentCategory, IntentResponse
    from app.models.reply_object import ReplyObject
    from app.models.system_setting import SystemSetting
    from scripts.seed_sakonnakhon_content import apply_plan

    tag = uuid.uuid4().hex[:8]
    path = _write_csv(
        tmp_path,
        [
            _row(f"pytest-สวัสดี-{tag}", f"สวัสดีค่ะ-{tag}"),
            _row(f"pytest-เมนู-{tag}", "line-oa"),
            _row(
                f"pytest-คดี-{tag}", f"คำตอบคดี-{tag}", "flex_carousel",
                "https://example.com/a.jpg,https://example.com/b.jpg",
            ),
        ],
    )
    raws = load_rows(path)
    answered, silent, junk = [], 0, 0
    for raw in raws:
        row = classify_row(raw)
        if row is None:
            junk += 1
        elif isinstance(row, SilentRow):
            silent += 1
        else:
            answered.append(row)
    plan = build_plan(answered, silent, junk, set(), set())
    assert plan.can_apply()
    assert len(plan.groups) == 2 and plan.silent_skipped == 1

    engine = create_async_engine(str(settings.DATABASE_URL), poolclass=NullPool)
    Session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    try:
        async with Session() as db:
            backup = {
                row.key: row.value
                for row in (
                    await db.execute(
                        select(SystemSetting).where(
                            SystemSetting.key.in_(
                                ["WELCOME_TEMPLATE", "ZERO_HANDOFF_ENABLED"]
                            )
                        )
                    )
                ).scalars().all()
            }
        try:
            async with Session() as db:
                first = await apply_plan(plan, db)
            assert first.categories_created == 2
            assert first.keywords_created == 2
            assert first.responses_created == 2
            assert first.objects_created == 1  # the flex carousel
            async with Session() as db:
                second = await apply_plan(plan, db)
            assert second.categories_created == 0
            assert second.keywords_created == 0
            assert second.responses_created == 0
            assert second.responses_updated == 0
            assert second.objects_created == 0
            assert second.objects_updated == 0
            async with Session() as db:
                cats = (
                    await db.execute(
                        select(IntentCategory).where(
                            IntentCategory.description.startswith("source: sakonnakhon")
                        )
                    )
                ).scalars().all()
                mine = [c for c in cats if tag in c.name]
                assert len(mine) == 2
                for cat in mine:
                    resps = (
                        await db.execute(
                            select(IntentResponse).where(
                                IntentResponse.category_id == cat.id,
                                IntentResponse.is_active == True,  # noqa: E712
                            )
                        )
                    ).scalars().all()
                    assert len(resps) == 1
                    assert "$skn_" in resps[0].text_content or tag in resps[0].text_content
        finally:
            async with Session() as db:
                objs = (
                    await db.execute(
                        select(ReplyObject).where(
                            ReplyObject.object_id.startswith("$skn_")
                        )
                    )
                ).scalars().all()
                for obj in objs:
                    await db.delete(obj)
                cats = (
                    await db.execute(select(IntentCategory))
                ).scalars().all()
                for cat in cats:
                    if tag in cat.name:
                        await db.delete(cat)
                for key, value in backup.items():
                    row = (
                        await db.execute(
                            select(SystemSetting).where(SystemSetting.key == key)
                        )
                    ).scalar_one_or_none()
                    if row is not None:
                        row.value = value
                missing = [
                    k for k in ("WELCOME_TEMPLATE", "ZERO_HANDOFF_ENABLED")
                    if k not in backup
                ]
                if missing:
                    await db.execute(
                        delete(SystemSetting).where(SystemSetting.key.in_(missing))
                    )
                await db.commit()
    finally:
        await engine.dispose()
