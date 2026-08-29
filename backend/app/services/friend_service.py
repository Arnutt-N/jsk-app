from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc, func, case
from sqlalchemy.exc import IntegrityError
from app.models.friend_event import FriendEvent, FriendEventType, EventSource
from app.models.user import User
from datetime import datetime, timezone
from typing import Dict, List, Optional, Tuple
import logging
from app.core.logging_utils import mask_line_id

logger = logging.getLogger(__name__)


class FriendService:
    async def get_or_create_user(self, line_user_id: str, db: AsyncSession, commit: bool = True) -> User:
        """Get existing user or create new one from LINE profile.

        Resolution is HMAC-hash only (plaintext column dropped in PR C).
        Populates the pseudonymization surrogate (hash + encrypted) on create.
        """
        from app.services.user_identity_service import resolve_by_line_id, populate_surrogate

        user = await resolve_by_line_id(db, line_user_id)
        if user:
            return user

        from app.core.line_client import get_line_bot_api
        try:
            profile = await get_line_bot_api().get_profile(line_user_id)
            user = User(
                display_name=profile.display_name,
                picture_url=profile.picture_url,
                friend_status="ACTIVE",
                friend_since=datetime.now(timezone.utc),
                profile_updated_at=datetime.now(timezone.utc),
            )
        except Exception as e:
            logger.warning("Failed to fetch LINE profile for %s: %s", mask_line_id(line_user_id), e)
            user = User(
                display_name="LINE User",
                friend_status="ACTIVE",
                friend_since=datetime.now(timezone.utc),
            )

        populate_surrogate(user, line_user_id)
        db.add(user)
        try:
            if commit:
                await db.commit()
                await db.refresh(user)
            else:
                await db.flush()
        except IntegrityError:
            await db.rollback()
            user = await resolve_by_line_id(db, line_user_id)
            if user is None:
                raise RuntimeError(
                    f"Race condition: user creation for {line_user_id} conflicted "
                    "but re-resolution found no user. Retry the request."
                ) from None

        return user

    async def refresh_profile(
        self,
        line_user_id: str,
        db: AsyncSession,
        force: bool = False,
        stale_after_hours: int = 24,
        commit: bool = True,
    ) -> Optional[User]:
        """Refresh LINE profile for a user when stale or forced."""
        from app.services.user_identity_service import resolve_by_line_id

        user = await resolve_by_line_id(db, line_user_id)
        if not user:
            return None

        now = datetime.now(timezone.utc)
        profile_updated_at = user.profile_updated_at
        if profile_updated_at and profile_updated_at.tzinfo is None:
            profile_updated_at = profile_updated_at.replace(tzinfo=timezone.utc)
        if (
            not force
            and profile_updated_at
            and (now - profile_updated_at).total_seconds() < stale_after_hours * 3600
        ):
            return user

        from app.core.line_client import get_line_bot_api

        try:
            profile = await get_line_bot_api().get_profile(line_user_id)
            user.display_name = profile.display_name or user.display_name
            user.picture_url = profile.picture_url or user.picture_url
            user.profile_updated_at = now
            if commit:
                await db.commit()
                await db.refresh(user)
            else:
                await db.flush()
        except Exception as exc:
            logger.warning("Failed to refresh LINE profile for %s: %s", mask_line_id(line_user_id), exc)

        return user

    async def _get_refollow_count(self, line_user_id: str, db: AsyncSession) -> int:
        """Count how many times a user has re-followed (REFOLLOW events)."""
        from app.services.user_identity_service import child_filter, resolve_by_line_id

        user = await resolve_by_line_id(db, line_user_id)
        result = await db.execute(
            select(func.count(FriendEvent.id))
            .where(
                child_filter(FriendEvent, line_user_id, user.id if user else None),
                FriendEvent.event_type == FriendEventType.REFOLLOW.value,
            )
        )
        return result.scalar() or 0

    async def handle_follow(self, line_user_id: str, db: AsyncSession, commit: bool = True):
        """Handle follow event"""
        from app.services.user_identity_service import resolve_by_line_id

        user = await resolve_by_line_id(db, line_user_id)

        event_type = FriendEventType.FOLLOW
        refollow_count = 0

        if user:
            if user.friend_status in ("UNFOLLOWED", "BLOCKED"):
                event_type = FriendEventType.REFOLLOW
                refollow_count = await self._get_refollow_count(line_user_id, db) + 1

            user.friend_status = "ACTIVE"
            user.is_active = True
            if not user.friend_since:
                user.friend_since = datetime.now(timezone.utc)

        event = FriendEvent(
            user_id=user.id if user else None,
            event_type=event_type.value,
            source=EventSource.WEBHOOK.value,
            refollow_count=refollow_count,
        )
        db.add(event)
        if commit:
            await db.commit()
        else:
            await db.flush()
        return event

    async def handle_unfollow(self, line_user_id: str, db: AsyncSession, commit: bool = True):
        """Handle unfollow event"""
        from app.services.user_identity_service import resolve_by_line_id

        user = await resolve_by_line_id(db, line_user_id)

        if user:
            user.friend_status = "UNFOLLOWED"

        event = FriendEvent(
            user_id=user.id if user else None,
            event_type=FriendEventType.UNFOLLOW.value,
            source=EventSource.WEBHOOK.value,
        )
        db.add(event)
        if commit:
            await db.commit()
        else:
            await db.flush()
        return event

    async def get_friend_events(
        self,
        line_user_id: str,
        db: AsyncSession,
        limit: int = 50
    ) -> List[FriendEvent]:
        """Get history for a specific user"""
        from app.services.user_identity_service import child_filter, resolve_by_line_id

        user = await resolve_by_line_id(db, line_user_id)
        result = await db.execute(
            select(FriendEvent)
            .where(child_filter(FriendEvent, line_user_id, user.id if user else None))
            .order_by(desc(FriendEvent.created_at))
            .limit(limit)
        )
        return list(result.scalars().all())

    async def get_all_friend_events(
        self,
        db: AsyncSession,
        line_user_id: Optional[str] = None,
        event_type: Optional[str] = None,
        page: int = 1,
        per_page: int = 20,
    ) -> Tuple[List[Dict], int]:
        """Get paginated friend events with user info."""
        from app.services.user_identity_service import child_join_condition

        query = (
            select(
                FriendEvent,
                User.display_name,
                User.picture_url,
            )
            .outerjoin(User, child_join_condition(User, FriendEvent))
        )

        if line_user_id:
            from app.services.user_identity_service import child_filter, resolve_by_line_id

            user = await resolve_by_line_id(db, line_user_id)
            query = query.where(child_filter(FriendEvent, line_user_id, user.id if user else None))
        if event_type:
            query = query.where(FriendEvent.event_type == event_type)

        # Count total
        count_query = select(func.count()).select_from(
            query.subquery()
        )
        total_result = await db.execute(count_query)
        total = total_result.scalar() or 0

        # Paginate
        query = query.order_by(desc(FriendEvent.created_at))
        query = query.offset((page - 1) * per_page).limit(per_page)

        result = await db.execute(query)
        rows = result.all()

        events = []
        event_rows = [row[0] for row in rows]
        from app.services.user_identity_service import decrypt_line_ids_for_users

        raw_by_user = await decrypt_line_ids_for_users(
            db, [e.user_id for e in event_rows if e.user_id]
        )
        for row in rows:
            event = row[0]
            events.append({
                "id": event.id,
                "line_user_id": raw_by_user.get(event.user_id),
                "event_type": event.event_type,
                "source": event.source,
                "refollow_count": event.refollow_count or 0,
                "event_data": event.event_data,
                "created_at": event.created_at,
                "display_name": row[1],
                "picture_url": row[2],
            })

        return events, total

    async def get_friend_stats(self, db: AsyncSession) -> Dict:
        """Get friend statistics summary."""
        from app.services.user_identity_service import child_column, user_identity_filter

        # Total followers (ACTIVE status)
        total_followers_result = await db.execute(
            select(func.count(User.id)).where(
                user_identity_filter(),
                User.friend_status == "ACTIVE",
            )
        )
        total_followers = total_followers_result.scalar() or 0

        # Total blocked
        total_blocked_result = await db.execute(
            select(func.count(User.id)).where(
                user_identity_filter(),
                User.friend_status == "BLOCKED",
            )
        )
        total_blocked = total_blocked_result.scalar() or 0

        # Total unfollowed
        total_unfollowed_result = await db.execute(
            select(func.count(User.id)).where(
                user_identity_filter(),
                User.friend_status == "UNFOLLOWED",
            )
        )
        total_unfollowed = total_unfollowed_result.scalar() or 0

        # Total unique users who re-followed
        total_refollows_result = await db.execute(
            select(func.count(func.distinct(child_column(FriendEvent)))).where(
                FriendEvent.event_type == FriendEventType.REFOLLOW.value,
            )
        )
        total_refollows = total_refollows_result.scalar() or 0

        # All users who ever existed (had LINE ID)
        total_all_result = await db.execute(
            select(func.count(User.id)).where(user_identity_filter())
        )
        total_all = total_all_result.scalar() or 0

        refollow_rate = (total_refollows / total_all * 100) if total_all > 0 else 0.0

        # Refollow breakdown: for each user, what's their max refollow_count
        breakdown_query = (
            select(
                func.max(FriendEvent.refollow_count).label("max_count"),
                func.count().label("user_count"),
            )
            .where(FriendEvent.event_type == FriendEventType.REFOLLOW.value)
            .group_by(child_column(FriendEvent))
        )
        breakdown_sub = breakdown_query.subquery()
        breakdown_result = await db.execute(
            select(
                breakdown_sub.c.max_count,
                func.count().label("users"),
            )
            .group_by(breakdown_sub.c.max_count)
            .order_by(breakdown_sub.c.max_count)
        )
        breakdown_rows = breakdown_result.all()
        refollow_breakdown = [
            {"count": row[0], "users": row[1]}
            for row in breakdown_rows
        ]

        return {
            "total_followers": total_followers,
            "total_blocked": total_blocked,
            "total_unfollowed": total_unfollowed,
            "total_refollows": total_refollows,
            "refollow_rate": round(refollow_rate, 1),
            "refollow_breakdown": refollow_breakdown,
        }

    async def get_user_refollow_counts(self, db: AsyncSession, line_user_ids: list[str] | None = None) -> Dict[str, int]:
        """Get max refollow count per user, optionally scoped to specific IDs."""
        from app.services.user_identity_service import child_column, resolve_many_by_line_id

        owner_col = child_column(FriendEvent)
        query = select(
            owner_col,
            func.max(FriendEvent.refollow_count).label("max_refollow"),
        ).where(
            FriendEvent.event_type == FriendEventType.REFOLLOW.value
        ).group_by(owner_col)

        id_to_user: Dict[str, int] = {}
        if line_user_ids:
            id_to_user = await resolve_many_by_line_id(db, line_user_ids)
            query = query.where(owner_col.in_(list(id_to_user.values())))

        result = await db.execute(query)
        user_to_id = {user_id: raw for raw, user_id in id_to_user.items()}
        return {user_to_id.get(row[0], row[0]): row.max_refollow for row in result.all()}

    async def list_friends(
        self,
        status: Optional[str],
        db: AsyncSession,
        skip: int = 0,
        limit: int = 100
    ) -> List[User]:
        """List users who are friends"""
        from app.services.user_identity_service import user_identity_filter

        query = select(User).where(user_identity_filter())
        if status:
            query = query.where(User.friend_status == status)

        query = query.order_by(desc(User.last_message_at)).offset(skip).limit(limit)
        result = await db.execute(query)
        return list(result.scalars().all())


friend_service = FriendService()
