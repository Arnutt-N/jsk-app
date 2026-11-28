from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.system_setting import SystemSetting

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
    async def get_many(db: AsyncSession, keys) -> dict[str, str]:
        """Read several settings in one query, with the same env fallback.

        One query keeps a multi-key reader from observing a half-written save
        spread across separate reads (F07).
        """
        keys = list(keys)
        result = await db.execute(
            select(SystemSetting.key, SystemSetting.value).where(
                SystemSetting.key.in_(keys)
            )
        )
        stored = {key: value for key, value in result.all()}
        return {
            key: stored[key] if key in stored else getattr(settings, key, "")
            for key in keys
        }

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

    @staticmethod
    async def set_many(db: AsyncSession, values: dict[str, str], description: str = None) -> None:
        """Upsert several settings in one transaction, without committing.

        The caller owns the commit so the settings and any audit row land
        together; a failure partway leaves every old value untouched (F07).
        """
        for key in values:
            if key in SECRET_DENY_LIST:
                raise ValueError("ห้ามเก็บรหัสลับใน SystemSetting — ใช้หน้า Credentials แทน")
        result = await db.execute(
            select(SystemSetting).where(SystemSetting.key.in_(list(values)))
        )
        existing = {row.key: row for row in result.scalars().all()}
        for key, value in values.items():
            row = existing.get(key)
            if row is not None:
                row.value = value
                if description:
                    row.description = description
            else:
                db.add(SystemSetting(key=key, value=value, description=description))
        await db.flush()
