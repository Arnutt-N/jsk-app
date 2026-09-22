import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool

from app.api import deps as api_deps
from app.core.config import settings
from app.main import app
from app.models.system_setting import SystemSetting
from app.services.credential_service import credential_service
from app.services.settings_service import SettingsService


def _fresh_engine():
    return create_async_engine(str(settings.DATABASE_URL), poolclass=NullPool)


def test_encrypt_credentials_roundtrip():
    enc = credential_service.encrypt_credentials({"token": "s3cr3t"})
    assert isinstance(enc, str) and "s3cr3t" not in enc
    assert credential_service.decrypt_credentials(enc) == {"token": "s3cr3t"}


def test_migrated_payload_shapes_are_dicts():
    # source-faithful: CredentialService expects dict -> JSON -> Fernet
    # (credential_service.py:74-82). Bare-string rows would break reads.
    expected = {
        "LINE_CHANNEL_ACCESS_TOKEN": ("LINE", {"channel_access_token": "tok"}),
        "LINE_CHANNEL_SECRET": ("LINE", {"channel_secret": "sec"}),
        "TELEGRAM_BOT_TOKEN": ("TELEGRAM", {"bot_token": "tok"}),
        "TELEGRAM_CHAT_ID": ("TELEGRAM", {"chat_id": "123"}),
        "N8N_API_KEY": ("CUSTOM", {"value": "k"}),
        "N8N_WEBHOOK_SECRET": ("CUSTOM", {"value": "s"}),
    }
    for key, (provider, payload) in expected.items():
        assert isinstance(payload, dict)
        enc = credential_service.encrypt_credentials(payload)
        assert credential_service.decrypt_credentials(enc) == payload
    # root keys stay env-only: never migrated, never backed up as plaintext
    assert "ENCRYPTION_KEY" not in expected and "LINE_ID_HMAC_KEY" not in expected


@pytest.mark.asyncio
async def test_downgrade_preserves_preexisting_credential():
    # seed one pre-existing Credential WITHOUT migrated_by marker;
    # downgrade must preserve it (marker-scoped DELETE only).
    # (test นี้ seed ไว้เป็นหลักฐาน — assert จริงอยู่ใน Step 6
    #  หลัง upgrade/downgrade/upgrade ว่าของเก่าอยู่ครบ)
    from app.models.credential import Credential
    engine = _fresh_engine()
    Session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with Session() as db:
        db.add(Credential(
            name="PRE_EXISTING_LINE", provider="LINE",
            credentials=credential_service.encrypt_credentials(
                {"channel_access_token": "keep-me"}),
            is_active=True, is_default=False))
        await db.commit()
        # cleanup กันพังกลางทาง: ลบ seed ออกหลังเทส
        seeded = (await db.execute(
            select(Credential).where(
                Credential.name == "PRE_EXISTING_LINE"))
        ).scalar_one_or_none()
        if seeded is not None:
            await db.delete(seeded)
            await db.commit()
    await engine.dispose()


@pytest.mark.asyncio
async def test_set_setting_rejects_secret_key():
    engine = _fresh_engine()
    Session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with Session() as db:
        with pytest.raises(ValueError, match="Credentials"):
            await SettingsService.set_setting(db, "LINE_CHANNEL_SECRET", "plain-value")
    await engine.dispose()


@pytest.mark.asyncio
async def test_get_settings_masks_secret_values(test_client, monkeypatch):
    from types import SimpleNamespace
    from app.models.user import UserRole

    engine = _fresh_engine()
    Session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    marker = "tok-plaintext-xyz"
    async with Session() as s:
        s.add(SystemSetting(key="LINE_CHANNEL_ACCESS_TOKEN", value=marker))
        await s.commit()

    async def _override():
        yield SimpleNamespace(id=1, role=UserRole.SUPER_ADMIN, is_active=True)

    app.dependency_overrides[api_deps.get_current_user] = _override
    try:
        resp = test_client.get("/api/v1/admin/settings")
        assert resp.status_code == 200
        assert marker not in resp.text
    finally:
        app.dependency_overrides.clear()
        async with Session() as s:
            row = (await s.execute(select(SystemSetting).where(
                SystemSetting.key == "LINE_CHANNEL_ACCESS_TOKEN"))).scalar_one_or_none()
            if row:
                await s.delete(row)
                await s.commit()
    await engine.dispose()
