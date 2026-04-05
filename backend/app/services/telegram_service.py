import html
import httpx
import logging
from typing import List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.credential import Provider
from app.services.credential_service import credential_service
from app.core.config import settings

logger = logging.getLogger(__name__)

class TelegramService:
    def __init__(self):
        self.bot_token = None
        self.chat_id = None

    async def load_credentials(self, db: AsyncSession):
        """Load Telegram credentials from database"""
        credential = await credential_service.get_default_credential(
            Provider.TELEGRAM, db
        )
        if credential:
            try:
                decrypted = credential_service.decrypt_credentials(credential.credentials)
                self.bot_token = decrypted.get("bot_token")
                # Admin chat ID might be in metadata or credentials
                self.chat_id = credential.metadata_json.get("admin_chat_id") if credential.metadata_json else None
                if not self.chat_id:
                    self.chat_id = decrypted.get("admin_chat_id")
            except Exception as e:
                logger.error(f"Failed to load Telegram credentials: {e}")
        
        # Fallback to env
        if not self.bot_token:
            self.bot_token = getattr(settings, "TELEGRAM_BOT_TOKEN", None)
        if not self.chat_id:
            self.chat_id = getattr(settings, "TELEGRAM_ADMIN_CHAT_ID", None)

    async def send_handoff_notification(
        self,
        user_display_name: str,
        user_picture_url: Optional[str],
        recent_messages: List[any],
        admin_panel_url: str,
        db: AsyncSession
    ) -> bool:
        """Send notification to Telegram admin group"""
        await self.load_credentials(db)

        if not self.bot_token or not self.chat_id:
            logger.warning("Telegram bot token or chat ID not configured")
            return False

        # Format messages
        messages_text = ""
        if recent_messages:
            # recent_messages are Message objects
            msgs = [f"• \"{html.escape(m.content)}\"" for m in recent_messages if m.content]
            messages_text = "\n" + "\n".join(msgs[:3])
        else:
            messages_text = "\n(No recent messages)"

        text = f"🔔 <b>ผู้ใช้ขอคุยกับเจ้าหน้าที่</b>\n\n" \
               f"👤 <b>ชื่อ:</b> {html.escape(user_display_name)}\n" \
               f"💬 <b>ข้อความล่าสุด:</b>{messages_text}\n\n" \
               f"🔗 <a href='{admin_panel_url}'>เปิดห้องแชทในระบบ Admin</a>"

        # Send to Telegram
        url = f"https://api.telegram.org/bot{self.bot_token}/sendMessage"
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(url, json={
                    "chat_id": self.chat_id,
                    "text": text,
                    "parse_mode": "HTML",
                    "disable_web_page_preview": False
                })
                if response.status_code == 200:
                    return True
                else:
                    logger.error(f"Telegram API error: {response.text}")
                    return False
        except Exception as e:
            logger.error(f"Failed to send Telegram notification: {e}")
            return False

    async def send_alert_message(self, text: str, db: AsyncSession) -> bool:
        """Send plain-text operational alert to configured Telegram chat."""
        await self.load_credentials(db)
        if not self.bot_token or not self.chat_id:
            logger.warning("Telegram bot token or chat ID not configured")
            return False

        url = f"https://api.telegram.org/bot{self.bot_token}/sendMessage"
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    url,
                    json={
                        "chat_id": self.chat_id,
                        "text": text,
                        "disable_web_page_preview": True,
                    },
                )
                if response.status_code == 200:
                    return True
                logger.error(f"Telegram API error: {response.text}")
                return False
        except Exception as e:
            logger.error(f"Failed to send Telegram alert: {e}")
            return False

telegram_service = TelegramService()
