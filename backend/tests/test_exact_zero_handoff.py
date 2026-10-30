"""Phase 3 tests: exact-"0" handoff + keyword guard.

Bare "0" must NEVER enter substring handoff matching (it would match every
message containing the digit 0). Exact-"0" is a separate branch with its own
kill-switch; the guard below drops a stray "0" even if an admin adds one.
"""
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool

from app.models.user import ChatMode
from app.services.handoff_service import (
    HANDOFF_KEYWORDS_SETTING_KEY,
    ZERO_HANDOFF_ENABLED_KEY,
    HandoffService,
    validate_handoff_keywords,
)


def test_validate_handoff_keywords_drops_bare_zero():
    assert validate_handoff_keywords(["help", "0", " 0 ", "เจ้าหน้าที่"]) == [
        "help",
        "เจ้าหน้าที่",
    ]
    assert validate_handoff_keywords(["help"]) == ["help"]
    assert validate_handoff_keywords([]) == []


def _engine():
    from app.core.config import settings

    engine = create_async_engine(str(settings.DATABASE_URL), poolclass=NullPool)
    return engine, sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


def _user(mode=ChatMode.BOT):
    return SimpleNamespace(id=999, chat_mode=mode)


async def _backup_settings(db, keys):
    from app.models.system_setting import SystemSetting

    rows = (
        await db.execute(select(SystemSetting).where(SystemSetting.key.in_(keys)))
    ).scalars().all()
    return {row.key: row.value for row in rows}


async def _restore_settings(db, backup, keys):
    from sqlalchemy import delete

    from app.models.system_setting import SystemSetting
    from app.services.settings_service import SettingsService

    for key in keys:
        if key in backup:
            await SettingsService.set_setting(db, key, backup[key])
        else:
            row = (
                await db.execute(
                    select(SystemSetting).where(SystemSetting.key == key)
                )
            ).scalar_one_or_none()
            if row is not None:
                await db.delete(row)
    await db.execute(
        delete(SystemSetting).where(
            SystemSetting.key.in_([k for k in keys if k not in backup])
        )
    )
    await db.commit()


KEYS = [ZERO_HANDOFF_ENABLED_KEY, HANDOFF_KEYWORDS_SETTING_KEY]


@pytest.mark.asyncio
async def test_exact_zero_triggers_handoff():
    from app.services.settings_service import SettingsService

    engine, Session = _engine()
    try:
        async with Session() as db:
            backup = await _backup_settings(db, KEYS)
        try:
            async with Session() as db:
                await SettingsService.set_setting(db, ZERO_HANDOFF_ENABLED_KEY, "true")
            svc = HandoffService()
            with patch(
                "app.services.handoff_service.live_chat_service.initiate_handoff",
                new=AsyncMock(),
            ) as initiate:
                async with Session() as db:
                    box: list = []
                    assert await svc.check_exact_zero(
                        "0", _user(), "tok", db, commit=False, outbox=box
                    ) is True
                initiate.assert_awaited_once()
                args, kwargs = initiate.call_args
                assert kwargs.get("outbox") is box
                assert kwargs.get("commit") is False
        finally:
            async with Session() as db:
                await _restore_settings(db, backup, KEYS)
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_exact_zero_negative_paths():
    from app.services.settings_service import SettingsService

    engine, Session = _engine()
    try:
        async with Session() as db:
            backup = await _backup_settings(db, KEYS)
        try:
            svc = HandoffService()
            with patch(
                "app.services.handoff_service.live_chat_service.initiate_handoff",
                new=AsyncMock(),
            ) as initiate:
                async with Session() as db:
                    await SettingsService.set_setting(
                        db, ZERO_HANDOFF_ENABLED_KEY, "true"
                    )
                # Non-zero texts never trigger.
                for text in ("10", "20", "01", "abc", ""):
                    async with Session() as db:
                        assert await svc.check_exact_zero(
                            text, _user(), "tok", db, outbox=[]
                        ) is False
                # HUMAN mode loses.
                async with Session() as db:
                    assert await svc.check_exact_zero(
                        "0", _user(ChatMode.HUMAN), "tok", db, outbox=[]
                    ) is False
                # Kill-switch off.
                async with Session() as db:
                    await SettingsService.set_setting(
                        db, ZERO_HANDOFF_ENABLED_KEY, "false"
                    )
                    assert await svc.check_exact_zero(
                        "0", _user(), "tok", db, outbox=[]
                    ) is False
                initiate.assert_not_awaited()
        finally:
            async with Session() as db:
                await _restore_settings(db, backup, KEYS)
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_exact_zero_failure_apologizes_and_holds_token():
    """Initiate failure queues the apology and returns True (no second reply)."""
    from app.services.settings_service import SettingsService

    engine, Session = _engine()
    try:
        async with Session() as db:
            backup = await _backup_settings(db, KEYS)
        try:
            async with Session() as db:
                await SettingsService.set_setting(db, ZERO_HANDOFF_ENABLED_KEY, "true")
            svc = HandoffService()
            with patch(
                "app.services.handoff_service.live_chat_service.initiate_handoff",
                new=AsyncMock(side_effect=RuntimeError("LINE down")),
            ):
                async with Session() as db:
                    box: list = []
                    assert await svc.check_exact_zero(
                        "0", _user(), "tok", db, commit=False, outbox=box
                    ) is True
                    assert len(box) == 1
        finally:
            async with Session() as db:
                await _restore_settings(db, backup, KEYS)
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_configurable_keywords_drop_bare_zero():
    """Even if an admin saves bare "0", the effective list excludes it."""
    from app.services.settings_service import SettingsService

    engine, Session = _engine()
    try:
        async with Session() as db:
            backup = await _backup_settings(db, KEYS)
        try:
            async with Session() as db:
                await SettingsService.set_setting(
                    db, HANDOFF_KEYWORDS_SETTING_KEY, '["0", "help"]'
                )
            svc = HandoffService()  # fresh instance: empty keyword cache
            async with Session() as db:
                effective = await svc.get_configurable_keywords(db)
            assert "0" not in effective
            assert "help" in effective
        finally:
            async with Session() as db:
                await _restore_settings(db, backup, KEYS)
    finally:
        await engine.dispose()
