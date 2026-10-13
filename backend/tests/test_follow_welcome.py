"""Phase 2 tests: follow-welcome rendering + follow hook wiring.

Pure template tests need no DB. Handler tests mock friend_service (which would
otherwise call the LINE profile API) and capture the reply closure; only the
settings read touches the real test DB (NullPool engine pattern).
"""
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool

from app.services.outbox import new_outbox
from app.services.welcome_service import (
    DEFAULT_WELCOME,
    WELCOME_TEMPLATE_KEY,
    fill_template,
    render_welcome,
)


def test_fill_template_placeholders():
    text = fill_template("สวัสดีคุณ{display_name} (เพื่อนคนที่ {follow_count})", "แอด", 3)
    assert text == "สวัสดีคุณแอด (เพื่อนคนที่ 3)"


def test_fill_template_unknown_braces_untouched():
    assert fill_template("โปร {xxx} ค่ะ", None, 1) == "โปร {xxx} ค่ะ"


def test_fill_template_missing_name():
    assert fill_template("สวัสดีคุณ{display_name}", None, 1) == "สวัสดีคุณ"


def _engine():
    from app.core.config import settings

    engine = create_async_engine(str(settings.DATABASE_URL), poolclass=NullPool)
    return engine, sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


@pytest.mark.asyncio
async def test_render_welcome_default_and_blank():
    from app.models.system_setting import SystemSetting

    engine, Session = _engine()
    try:
        async with Session() as db:
            backup = (
                await db.execute(
                    select(SystemSetting).where(
                        SystemSetting.key == WELCOME_TEMPLATE_KEY
                    )
                )
            ).scalar_one_or_none()
            backup_value = backup.value if backup else None
        try:
            async with Session() as db:
                if backup is not None:
                    await db.delete(backup)
                    await db.commit()
                assert await render_welcome(db, "แอด", 1) == DEFAULT_WELCOME
                from app.services.settings_service import SettingsService

                await SettingsService.set_setting(db, WELCOME_TEMPLATE_KEY, "   ")
                assert await render_welcome(db, "แอด", 1) is None
        finally:
            async with Session() as db:
                from app.services.settings_service import SettingsService

                if backup_value is None:
                    row = (
                        await db.execute(
                            select(SystemSetting).where(
                                SystemSetting.key == WELCOME_TEMPLATE_KEY
                            )
                        )
                    ).scalar_one_or_none()
                    if row is not None:
                        await db.delete(row)
                        await db.commit()
                else:
                    await SettingsService.set_setting(
                        db, WELCOME_TEMPLATE_KEY, backup_value
                    )
    finally:
        await engine.dispose()


def _fake_event():
    return SimpleNamespace(
        source=SimpleNamespace(user_id="Utestfollow123"),
        reply_token="test-reply-token",
    )


@pytest.mark.asyncio
async def test_follow_handler_sends_welcome_once():
    """Hermetic: sets its own template (never relies on ambient DB state)."""
    from app.api.v1.endpoints import webhook as webhook_mod
    from app.models.system_setting import SystemSetting
    from app.services.settings_service import SettingsService

    engine, Session = _engine()
    try:
        async with Session() as db:
            backup = (
                await db.execute(
                    select(SystemSetting).where(
                        SystemSetting.key == WELCOME_TEMPLATE_KEY
                    )
                )
            ).scalar_one_or_none()
            backup_value = backup.value if backup else None
            await SettingsService.set_setting(
                db, WELCOME_TEMPLATE_KEY, "สวัสดีเพื่อนคนที่ {follow_count}"
            )
        try:
            fake_user = SimpleNamespace(display_name="แอด")
            fake_row = SimpleNamespace(refollow_count=0)
            with (
                patch.object(
                    webhook_mod.friend_service, "get_or_create_user",
                    new=AsyncMock(return_value=fake_user),
                ),
                patch.object(
                    webhook_mod.friend_service, "handle_follow",
                    new=AsyncMock(return_value=fake_row),
                ),
                patch(
                    "app.services.line_service.line_service.reply_text",
                    new=AsyncMock(),
                ) as reply_mock,
            ):
                async with Session() as db:
                    box = new_outbox()
                    await webhook_mod.handle_follow_event(_fake_event(), db, box)
                    assert len(box) == 1
                    await box[0]()
                reply_mock.assert_awaited_once()
                _, text = reply_mock.call_args.args
                assert text == "สวัสดีเพื่อนคนที่ 1"
        finally:
            async with Session() as db:
                if backup_value is None:
                    row = (
                        await db.execute(
                            select(SystemSetting).where(
                                SystemSetting.key == WELCOME_TEMPLATE_KEY
                            )
                        )
                    ).scalar_one_or_none()
                    if row is not None:
                        await db.delete(row)
                        await db.commit()
                else:
                    await SettingsService.set_setting(
                        db, WELCOME_TEMPLATE_KEY, backup_value
                    )
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_follow_handler_refollow_count_and_blank_template():
    from app.api.v1.endpoints import webhook as webhook_mod
    from app.models.system_setting import SystemSetting
    from app.services.settings_service import SettingsService

    engine, Session = _engine()
    try:
        async with Session() as db:
            backup = (
                await db.execute(
                    select(SystemSetting).where(
                        SystemSetting.key == WELCOME_TEMPLATE_KEY
                    )
                )
            ).scalar_one_or_none()
            backup_value = backup.value if backup else None
            await SettingsService.set_setting(
                db, WELCOME_TEMPLATE_KEY, "กลับมาแล้ว {follow_count} ครั้ง"
            )
        try:
            fake_user = SimpleNamespace(display_name="แอด")
            fake_row = SimpleNamespace(refollow_count=2)
            with (
                patch.object(
                    webhook_mod.friend_service, "get_or_create_user",
                    new=AsyncMock(return_value=fake_user),
                ),
                patch.object(
                    webhook_mod.friend_service, "handle_follow",
                    new=AsyncMock(return_value=fake_row),
                ),
                patch(
                    "app.services.line_service.line_service.reply_text",
                    new=AsyncMock(),
                ) as reply_mock,
            ):
                async with Session() as db:
                    box = new_outbox()
                    await webhook_mod.handle_follow_event(_fake_event(), db, box)
                    assert len(box) == 1
                    await box[0]()
                assert reply_mock.call_args.args[1] == "กลับมาแล้ว 3 ครั้ง"
        finally:
            async with Session() as db:
                if backup_value is None:
                    row = (
                        await db.execute(
                            select(SystemSetting).where(
                                SystemSetting.key == WELCOME_TEMPLATE_KEY
                            )
                        )
                    ).scalar_one_or_none()
                    if row is not None:
                        await db.delete(row)
                        await db.commit()
                else:
                    await SettingsService.set_setting(
                        db, WELCOME_TEMPLATE_KEY, backup_value
                    )
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_follow_handler_never_breaks_bookkeeping():
    """Render failure (or missing box) must not raise: friend rows come first."""
    from app.api.v1.endpoints import webhook as webhook_mod

    engine, Session = _engine()
    try:
        fake_user = SimpleNamespace(display_name="แอด")
        fake_row = SimpleNamespace(refollow_count=0)
        with (
            patch.object(
                webhook_mod.friend_service, "get_or_create_user",
                new=AsyncMock(return_value=fake_user),
            ),
            patch.object(
                webhook_mod.friend_service, "handle_follow",
                new=AsyncMock(return_value=fake_row),
            ),
            patch(
                "app.services.settings_service.SettingsService.get_setting",
                new=AsyncMock(side_effect=RuntimeError("db down")),
            ),
        ):
            async with Session() as db:
                box = new_outbox()
                # Must not raise even though rendering explodes.
                await webhook_mod.handle_follow_event(_fake_event(), db, box)
                assert len(box) == 0
                # And without an outbox at all.
                await webhook_mod.handle_follow_event(_fake_event(), db, None)
    finally:
        await engine.dispose()
