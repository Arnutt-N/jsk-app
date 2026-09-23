from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.system_setting import SystemSetting
from app.core.config import settings

# B2: secrets live in encrypted Credential rows (credential_service), never
# in SystemSetting. Root keys (ENCRYPTION_KEY/LINE_ID_HMAC_KEY) are env-only.
SECRET_DENY_LIST: frozenset[str] = frozenset({
    "LINE_CHANNEL_ACCESS_TOKEN", "LINE_CHANNEL_SECRET",
    "TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID",
    "N8N_API_KEY", "N8N_WEBHOOK_SECRET",
    "ENCRYPTION_KEY", "LINE_ID_HMAC_KEY",
})


class SettingsService:
    @staticmethod
    async def get_setting(db: AsyncSession, key: str, default: str = "") -> str:
        query = select(SystemSetting.value).where(SystemSetting.key == key)
        result = await db.execute(query)
        db_value = result.scalar_one_or_none()

        if db_value is not None:
            return db_value

        # Fallback to env
        return getattr(settings, key, default)

    @staticmethod
    async def set_setting(db: AsyncSession, key: str, value: str, description: str = None) -> SystemSetting:
        if key in SECRET_DENY_LIST:
            raise ValueError("ห้ามเก็บรหัสลับใน SystemSetting — ใช้หน้า Credentials แทน")
        query = select(SystemSetting).where(SystemSetting.key == key)
        result = await db.execute(query)
        db_setting = result.scalar_one_or_none()

        if db_setting:
            db_setting.value = value
            if description:
                db_setting.description = description
        else:
            db_setting = SystemSetting(key=key, value=value, description=description)
            db.add(db_setting)

        await db.commit()
        await db.refresh(db_setting)
        return db_setting
