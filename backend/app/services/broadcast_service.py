import logging
from datetime import datetime, timezone
from typing import Optional, List

from linebot.v3.messaging import (
    BroadcastRequest,
    MulticastRequest,
    TextMessage,
    ImageMessage,
    FlexMessage,
    FlexContainer,
)
from sqlalchemy import select, func, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.line_client import get_line_bot_api
from app.models.broadcast import Broadcast, BroadcastStatus, BroadcastType
from app.models.user import User

logger = logging.getLogger(__name__)


class BroadcastService:
    def __init__(self):
        self._api = None

    @property
    def api(self):
        if self._api is None:
            self._api = get_line_bot_api()
        return self._api

    # ------------------------------------------------------------------ #
    #  CRUD helpers
    # ------------------------------------------------------------------ #

    async def create_broadcast(
        self,
        db: AsyncSession,
        *,
        title: str,
        message_type: BroadcastType,
        content: dict,
        target_audience: str = "all",
        target_filter: Optional[dict] = None,
        created_by: Optional[int] = None,
    ) -> Broadcast:
        broadcast = Broadcast(
            title=title,
            message_type=message_type,
            content=content,
            target_audience=target_audience,
            target_filter=target_filter or {},
            status=BroadcastStatus.DRAFT,
            created_by=created_by,
        )
        db.add(broadcast)
        await db.commit()
        await db.refresh(broadcast)
        return broadcast

    async def get_broadcast(self, db: AsyncSession, broadcast_id: int) -> Optional[Broadcast]:
        result = await db.execute(select(Broadcast).where(Broadcast.id == broadcast_id))
        return result.scalar_one_or_none()

    async def list_broadcasts(
        self,
        db: AsyncSession,
        *,
        status: Optional[str] = None,
        skip: int = 0,
        limit: int = 50,
    ) -> tuple[List[Broadcast], int]:
        query = select(Broadcast)
        count_query = select(func.count(Broadcast.id))

        if status:
            query = query.where(Broadcast.status == status)
            count_query = count_query.where(Broadcast.status == status)

        total_result = await db.execute(count_query)
        total = total_result.scalar() or 0

        query = query.order_by(desc(Broadcast.created_at)).offset(skip).limit(limit)
        result = await db.execute(query)
        broadcasts = list(result.scalars().all())

        return broadcasts, total

    async def update_broadcast(
        self,
        db: AsyncSession,
        broadcast: Broadcast,
        **kwargs,
    ) -> Broadcast:
        for key, value in kwargs.items():
            if hasattr(broadcast, key):
                setattr(broadcast, key, value)
        await db.commit()
        await db.refresh(broadcast)
        return broadcast

    async def delete_broadcast(self, db: AsyncSession, broadcast: Broadcast) -> None:
        await db.delete(broadcast)
        await db.commit()

    # ------------------------------------------------------------------ #
    #  Message building
    # ------------------------------------------------------------------ #

    def _build_messages(self, broadcast: Broadcast) -> list:
        """Convert broadcast content JSONB into LINE message objects."""
        content = broadcast.content
        messages = []

        if broadcast.message_type == BroadcastType.TEXT:
            text = content.get("text", "")
            if text:
                messages.append(TextMessage(text=text))

        elif broadcast.message_type == BroadcastType.IMAGE:
            original_url = content.get("original_url", "")
            preview_url = content.get("preview_url", original_url)
            if original_url:
                messages.append(
                    ImageMessage(
                        original_content_url=original_url,
                        preview_image_url=preview_url,
                    )
                )

        elif broadcast.message_type == BroadcastType.FLEX:
            alt_text = content.get("alt_text", broadcast.title)
            flex_content = content.get("flex", {})
            if flex_content:
                container = FlexContainer.from_dict(flex_content)
                messages.append(FlexMessage(alt_text=alt_text, contents=container))

        elif broadcast.message_type == BroadcastType.MULTI:
            for item in content.get("messages", []):
                msg_type = item.get("type", "text")
                if msg_type == "text" and item.get("text"):
                    messages.append(TextMessage(text=item["text"]))
                elif msg_type == "image" and item.get("original_url"):
                    messages.append(
                        ImageMessage(
                            original_content_url=item["original_url"],
                            preview_image_url=item.get("preview_url", item["original_url"]),
                        )
                    )
                elif msg_type == "flex" and item.get("flex"):
                    container = FlexContainer.from_dict(item["flex"])
                    messages.append(
                        FlexMessage(alt_text=item.get("alt_text", "Flex Message"), contents=container)
                    )

        return messages[:5]  # LINE API limit

    # ------------------------------------------------------------------ #
    #  Send
    # ------------------------------------------------------------------ #

    async def send_broadcast(self, db: AsyncSession, broadcast: Broadcast) -> Broadcast:
        """Send a broadcast to all followers using LINE Broadcast API."""
        if broadcast.status not in (BroadcastStatus.DRAFT, BroadcastStatus.SCHEDULED):
            raise ValueError(f"Cannot send broadcast in status {broadcast.status}")

        messages = self._build_messages(broadcast)
        if not messages:
            raise ValueError("Broadcast has no valid messages to send")

        broadcast.status = BroadcastStatus.SENDING
        await db.commit()

        try:
            if broadcast.target_audience == "all":
                await self.api.broadcast(
                    BroadcastRequest(messages=messages)
                )
                broadcast.status = BroadcastStatus.COMPLETED
                broadcast.sent_at = datetime.now(timezone.utc)
            else:
                user_ids = broadcast.target_filter.get("user_ids", [])
                if not user_ids:
                    broadcast.status = BroadcastStatus.FAILED
                    broadcast.failure_count = 1
                    logger.error("Broadcast %s has no target user IDs", broadcast.id)
                else:
                    sent = 0
                    failed = 0
                    for i in range(0, len(user_ids), 500):
                        chunk = user_ids[i : i + 500]
                        try:
                            await self.api.multicast(
                                MulticastRequest(to=chunk, messages=messages)
                            )
                            sent += len(chunk)
                        except Exception as chunk_exc:
                            failed += len(chunk)
                            logger.error("Broadcast %s chunk %d failed: %s", broadcast.id, i // 500, chunk_exc)

                    broadcast.total_recipients = len(user_ids)
                    broadcast.success_count = sent
                    broadcast.failure_count = failed
                    broadcast.sent_at = datetime.now(timezone.utc)
                    broadcast.status = BroadcastStatus.COMPLETED if failed == 0 else BroadcastStatus.FAILED

            logger.info("Broadcast %s finished: success=%s, failed=%s", broadcast.id, broadcast.success_count, broadcast.failure_count)

        except Exception as exc:
            broadcast.status = BroadcastStatus.FAILED
            broadcast.failure_count = (broadcast.failure_count or 0) + 1
            logger.error("Broadcast %s failed: %s", broadcast.id, exc)

        await db.commit()
        await db.refresh(broadcast)
        return broadcast

    async def schedule_broadcast(
        self, db: AsyncSession, broadcast: Broadcast, scheduled_at: datetime
    ) -> Broadcast:
        if broadcast.status != BroadcastStatus.DRAFT:
            raise ValueError(f"Cannot schedule broadcast in status {broadcast.status}")

        now = datetime.now(timezone.utc)
        if scheduled_at.tzinfo is None:
            scheduled_at = scheduled_at.replace(tzinfo=timezone.utc)
        if scheduled_at <= now:
            raise ValueError("scheduled_at must be in the future")

        broadcast.status = BroadcastStatus.SCHEDULED
        broadcast.scheduled_at = scheduled_at
        await db.commit()
        await db.refresh(broadcast)
        return broadcast

    async def cancel_broadcast(self, db: AsyncSession, broadcast: Broadcast) -> Broadcast:
        if broadcast.status not in (BroadcastStatus.SCHEDULED, BroadcastStatus.DRAFT, BroadcastStatus.SENDING):
            raise ValueError(f"Cannot cancel broadcast in status {broadcast.status}")

        broadcast.status = BroadcastStatus.CANCELLED
        broadcast.scheduled_at = None
        await db.commit()
        await db.refresh(broadcast)
        return broadcast

    async def get_broadcast_stats(self, db: AsyncSession) -> dict:
        """Return aggregate stats across all broadcasts."""
        result = await db.execute(
            select(
                func.count(Broadcast.id).label("total"),
                func.count(Broadcast.id).filter(Broadcast.status == BroadcastStatus.DRAFT).label("draft"),
                func.count(Broadcast.id).filter(Broadcast.status == BroadcastStatus.SCHEDULED).label("scheduled"),
                func.count(Broadcast.id).filter(Broadcast.status == BroadcastStatus.COMPLETED).label("completed"),
                func.count(Broadcast.id).filter(Broadcast.status == BroadcastStatus.FAILED).label("failed"),
            )
        )
        row = result.one()
        return row._asdict()


broadcast_service = BroadcastService()
