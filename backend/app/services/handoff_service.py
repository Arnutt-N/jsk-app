import logging
import re
import time
from json import JSONDecodeError, loads

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import ChatMode, User
from app.services.live_chat_service import live_chat_service
from app.services.settings_service import SettingsService

logger = logging.getLogger(__name__)

# Configurable keywords - can be moved to database/settings later
HANDOFF_KEYWORDS_EN = [
    "agent", "human", "operator", "representative",
    "support", "help desk", "live person", "real person",
    "talk to someone", "speak to agent", "customer service",
    "need help", "talk to human", "connect to agent"
]

HANDOFF_KEYWORDS_TH = [
    "พูดกับเจ้าหน้าที่", "ติดต่อเจ้าหน้าที่", "คุยกับคน",
    "ขอคน", "ต้องการคน", "เจ้าหน้าที่", "ขอติดต่อแอดมิน",
    "ต้องการความช่วยเหลือ", "ขอความช่วยเหลือ", "ช่วยด้วย",
    "ติดต่อเจ้าหน้าที่", "คุยกับเจ้าหน้าที่", "ต้องการเจ้าหน้าที่",
    "ขอสาย", "ต่อสาย", "คุยสด", "เจ้าหน้าที่ให้คำปรึกษา"
]

HANDOFF_KEYWORDS = HANDOFF_KEYWORDS_EN + HANDOFF_KEYWORDS_TH
HANDOFF_KEYWORDS_SETTING_KEY = "HANDOFF_KEYWORDS"
HANDOFF_KEYWORDS_CACHE_TTL_SECONDS = 60.0


class HandoffService:
    """Service for handling bot-to-human handoff requests."""

    def __init__(self) -> None:
        self._keywords_cache: list[str] = []
        self._keywords_cache_expires_at = 0.0
        self._runtime_keywords: list[str] = []

    @staticmethod
    def _normalize_keywords(keywords: list[str]) -> list[str]:
        normalized_keywords: list[str] = []
        seen_keywords: set[str] = set()

        for keyword in keywords:
            keyword_lower = keyword.strip().lower()
            if keyword_lower and keyword_lower not in seen_keywords:
                normalized_keywords.append(keyword_lower)
                seen_keywords.add(keyword_lower)

        return normalized_keywords

    def _default_keywords(self) -> list[str]:
        return self._normalize_keywords(HANDOFF_KEYWORDS)

    def _parse_keywords_setting(self, raw_keywords: str) -> list[str]:
        value = raw_keywords.strip()
        if not value:
            return []

        parsed_keywords: list[str]

        if value.startswith("["):
            try:
                data = loads(value)
            except JSONDecodeError:
                logger.warning("Ignoring invalid %s setting: expected JSON array or delimited string", HANDOFF_KEYWORDS_SETTING_KEY)
                return []

            if not isinstance(data, list):
                logger.warning("Ignoring invalid %s setting: JSON value must be a list", HANDOFF_KEYWORDS_SETTING_KEY)
                return []

            parsed_keywords = [str(item) for item in data]
        else:
            parsed_keywords = re.split(r"[\n,;]+", value)

        return self._normalize_keywords(parsed_keywords)

    async def check_handoff_keywords(
        self,
        text: str,
        user: User,
        reply_token: str,
        db: AsyncSession
    ) -> bool:
        """
        Check if message contains handoff keywords.
        Returns True if handoff was initiated.
        
        Args:
            text: The message text from user
            user: The User model instance
            reply_token: LINE reply token for response
            db: Database session
            
        Returns:
            True if handoff was initiated, False otherwise
        """
        if not text:
            return False
             
        text_lower = text.strip().lower()
        handoff_keywords = await self.get_configurable_keywords(db)
        
        # Check if any keyword matches
        matched_keyword = None
        for keyword in handoff_keywords:
            if keyword in text_lower:
                matched_keyword = keyword
                break
        
        if not matched_keyword:
            return False
        
        # Only initiate if user is currently in BOT mode
        if user.chat_mode != ChatMode.BOT:
            logger.debug(f"User {user.line_user_id} already in {user.chat_mode} mode, skipping handoff")
            return False
        
        logger.info(f"Handoff keyword detected: '{matched_keyword}' for user {user.line_user_id}")
        
        # Initiate handoff
        try:
            await live_chat_service.initiate_handoff(user, reply_token, db)
            return True
        except Exception as e:
            logger.error(f"Failed to initiate handoff for user {user.line_user_id}: {e}")
            # Try to notify the user that handoff failed
            try:
                from app.services.line_service import line_service
                await line_service.reply_text(reply_token, "ขออภัย ไม่สามารถเชื่อมต่อเจ้าหน้าที่ได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง")
            except Exception:
                pass  # Best-effort notification
            return False
    
    async def get_configurable_keywords(self, db: AsyncSession) -> list[str]:
        """
        Get keywords from database settings with a cached fallback.
        
        Args:
            db: Database session
            
        Returns:
            List of handoff keywords
        """
        now = time.monotonic()
        if self._keywords_cache and now < self._keywords_cache_expires_at:
            return self._keywords_cache

        raw_keywords = await SettingsService.get_setting(db, HANDOFF_KEYWORDS_SETTING_KEY, "")
        configured_keywords = self._parse_keywords_setting(raw_keywords)
        effective_keywords = self._normalize_keywords(configured_keywords + self._runtime_keywords)

        if not effective_keywords:
            effective_keywords = self._normalize_keywords(self._default_keywords() + self._runtime_keywords)

        self._keywords_cache = effective_keywords
        self._keywords_cache_expires_at = now + HANDOFF_KEYWORDS_CACHE_TTL_SECONDS
        return self._keywords_cache
    
    def add_custom_keyword(self, keyword: str) -> None:
        """
        Add a custom keyword to the list (runtime only).
        
        Args:
            keyword: New keyword to add
        """
        keyword_lower = keyword.lower().strip()
        if keyword_lower and keyword_lower not in self._runtime_keywords:
            self._runtime_keywords.append(keyword_lower)
            self._keywords_cache_expires_at = 0.0
            logger.info(f"Added custom handoff keyword: {keyword}")


# Global handoff service instance
handoff_service = HandoffService()
