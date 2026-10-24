"""Real-session test: DELETE auto-reply rule soft-hides instead of removing.

Policy: user decision 2026-10-23, see .agents/PRPs/2026-10-23-leave-confirm-soft-delete.prd.md.
"""
import pytest
from sqlalchemy import delete, select

from app.api.v1.endpoints import admin_auto_replies as admin_auto_replies_module
from app.models.auto_reply import AutoReply, MatchType, ReplyType
from tests.soft_delete_harness import (
    admin_client,
    fresh_engine,
    session_factory,
    unique_marker,
)


@pytest.mark.asyncio
async def test_delete_auto_reply_soft_hides_and_restores():
    marker = unique_marker("soft")
    keyword = f"{marker}-rule"
    engine = fresh_engine()
    Session = session_factory(engine)

    async with Session() as session:
        session.add(
            AutoReply(
                keyword=keyword,
                match_type=MatchType.CONTAINS,
                reply_type=ReplyType.TEXT,
                text_content="pytest fixture",
                is_active=True,
            )
        )
        await session.commit()
        rule_id = (
            await session.execute(
                select(AutoReply.id).where(AutoReply.keyword == keyword)
            )
        ).scalar_one()

    try:
        with admin_client(
            Session, admin_auto_replies_module.get_db
        ) as client:
            res = client.delete(f"/api/v1/admin/auto-replies/{rule_id}")
            assert res.status_code == 204, res.text

            async with Session() as session:
                row = await session.get(AutoReply, rule_id)
                assert row is not None
                assert row.is_active is False

            async with Session() as session:
                public_hit = (
                    await session.execute(
                        select(AutoReply.id).where(
                            AutoReply.keyword == keyword,
                            AutoReply.is_active.is_(True),
                        )
                    )
                ).scalar_one_or_none()
                assert public_hit is None

            res = client.put(
                f"/api/v1/admin/auto-replies/{rule_id}", json={"is_active": True}
            )
            assert res.status_code == 200, res.text

            async with Session() as session:
                public_hit = (
                    await session.execute(
                        select(AutoReply.id).where(
                            AutoReply.keyword == keyword,
                            AutoReply.is_active.is_(True),
                        )
                    )
                ).scalar_one_or_none()
                assert public_hit == rule_id
    finally:
        async with Session() as session:
            await session.execute(
                delete(AutoReply).where(AutoReply.keyword == keyword)
            )
            await session.commit()
        await engine.dispose()


@pytest.mark.asyncio
async def test_put_auto_reply_rename_to_existing_maps_to_409():
    marker = unique_marker("ren")
    engine = fresh_engine()
    Session = session_factory(engine)

    async with Session() as session:
        session.add_all(
            [
                AutoReply(
                    keyword=f"taken-{marker}",
                    match_type=MatchType.CONTAINS,
                    reply_type=ReplyType.TEXT,
                    text_content="taken",
                    is_active=True,
                ),
                AutoReply(
                    keyword=f"mine-{marker}",
                    match_type=MatchType.CONTAINS,
                    reply_type=ReplyType.TEXT,
                    text_content="mine",
                    is_active=True,
                ),
            ]
        )
        await session.commit()
        mine_id = (
            await session.execute(
                select(AutoReply.id).where(AutoReply.keyword == f"mine-{marker}")
            )
        ).scalar_one()

    try:
        with admin_client(
            Session, admin_auto_replies_module.get_db
        ) as client:
            res = client.put(
                f"/api/v1/admin/auto-replies/{mine_id}",
                json={"keyword": f"taken-{marker}"},
            )
            assert res.status_code == 409, res.text
            assert f"taken-{marker}" in res.json()["detail"]
    finally:
        async with Session() as session:
            await session.execute(
                delete(AutoReply).where(
                    AutoReply.keyword.in_([f"taken-{marker}", f"mine-{marker}"])
                )
            )
            await session.commit()
        await engine.dispose()


@pytest.mark.asyncio
async def test_repeat_delete_hidden_rule_stays_hidden():
    marker = unique_marker("rep")
    engine = fresh_engine()
    Session = session_factory(engine)

    async with Session() as session:
        session.add(
            AutoReply(
                keyword=f"kw-{marker}",
                match_type=MatchType.CONTAINS,
                reply_type=ReplyType.TEXT,
                text_content="pytest fixture",
                is_active=True,
            )
        )
        await session.commit()
        rule_id = (
            await session.execute(
                select(AutoReply.id).where(AutoReply.keyword == f"kw-{marker}")
            )
        ).scalar_one()

    try:
        with admin_client(
            Session, admin_auto_replies_module.get_db
        ) as client:
            first = client.delete(f"/api/v1/admin/auto-replies/{rule_id}")
            second = client.delete(f"/api/v1/admin/auto-replies/{rule_id}")
            assert first.status_code == 204, first.text
            assert second.status_code == 204, second.text
            async with Session() as session:
                row = await session.get(AutoReply, rule_id)
                assert row is not None
                assert row.is_active is False
    finally:
        async with Session() as session:
            await session.execute(
                delete(AutoReply).where(AutoReply.keyword == f"kw-{marker}")
            )
            await session.commit()
        await engine.dispose()
