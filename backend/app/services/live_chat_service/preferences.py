"""Per-operator conversation preferences (pin / mute / spam)."""
import logging
from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.operator_conversation_preference import OperatorConversationPreference
from app.services.user_identity_service import resolve_by_line_id

logger = logging.getLogger(__name__)

_PREF_FIELDS = ("is_pinned", "is_muted", "is_spam")


class PreferencesMixin:
    async def get_preferences_map(
        self,
        db: AsyncSession,
        operator_id: int,
        user_ids: list[int],
    ) -> dict[int, OperatorConversationPreference]:
        """Batch-load an operator's preferences for a set of customer user ids."""
        if not user_ids:
            return {}
        result = await db.execute(
            select(OperatorConversationPreference).where(
                OperatorConversationPreference.operator_id == operator_id,
                OperatorConversationPreference.user_id.in_(user_ids),
            )
        )
        return {pref.user_id: pref for pref in result.scalars().all()}

    async def upsert_preference(
        self,
        db: AsyncSession,
        operator_id: int,
        line_user_id: str,
        updates: dict[str, Any],
    ) -> Optional[OperatorConversationPreference]:
        """Create-or-update an operator's preference row for a conversation.

        ``updates`` may contain any of is_pinned / is_muted / is_spam. Resolves
        the conversation owner via the mode-aware identity helper; returns None
        if the user does not exist.
        """
        user = await resolve_by_line_id(db, line_user_id)
        if not user:
            return None

        result = await db.execute(
            select(OperatorConversationPreference).where(
                OperatorConversationPreference.operator_id == operator_id,
                OperatorConversationPreference.user_id == user.id,
            )
        )
        pref = result.scalar_one_or_none()
        if not pref:
            pref = OperatorConversationPreference(
                operator_id=operator_id,
                user_id=user.id,
                is_pinned=False,
                is_muted=False,
                is_spam=False,
            )
            db.add(pref)

        for field in _PREF_FIELDS:
            if field in updates and updates[field] is not None:
                setattr(pref, field, bool(updates[field]))

        if "is_pinned" in updates and updates["is_pinned"] is not None:
            pref.pinned_at = datetime.now(timezone.utc) if pref.is_pinned else None

        await db.commit()
        await db.refresh(pref)
        return pref
