"""Follow-welcome template rendering. Pure helper; no new state.

The template lives in the `WELCOME_TEMPLATE` system setting so admins can edit
it without a deploy. Blank template = welcome disabled (silent follow, as before).
This function never raises: the follow path must not break friend creation.
"""
import logging

from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

WELCOME_TEMPLATE_KEY = "WELCOME_TEMPLATE"

DEFAULT_WELCOME = (
    "ยินดีต้อนรับสู่ LINE Official Account สำนักงานยุติธรรมจังหวัดสกลนคร! 🎉\n\n"
    "ขอบคุณที่เป็นเพื่อนกับเราค่ะ\n"
    "หากต้องการความช่วยเหลือ พิมพ์ 'เมนู' หรือ '1' เพื่อดูบริการต่างๆ"
)


def fill_template(template: str, display_name: str | None,
                  follow_count: int) -> str:
    """Fill {display_name}/{follow_count}. Unknown {placeholders} left as-is.

    Plain str.replace (not str.format) so stray braces in admin copy can never
    raise KeyError and break the follow flow.
    """
    text = template.replace("{follow_count}", str(follow_count))
    return text.replace("{display_name}", display_name or "")


async def render_welcome(db: AsyncSession, display_name: str | None,
                         follow_count: int) -> str | None:
    """Render the welcome text, or None when disabled/broken (fail silent)."""
    from app.services.settings_service import SettingsService

    try:
        template = await SettingsService.get_setting(
            db, WELCOME_TEMPLATE_KEY, DEFAULT_WELCOME
        )
    except Exception as exc:
        logger.warning("Welcome template unreadable, skipping welcome: %s", exc)
        return None
    if not (template or "").strip():
        return None
    try:
        return fill_template(template, display_name, follow_count)
    except Exception as exc:
        logger.warning("Welcome template render failed, skipping welcome: %s", exc)
        return None
