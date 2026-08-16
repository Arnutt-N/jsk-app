from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Any, Optional
from app.api import deps
from app.api.deps import get_current_admin
from app.models.user import User
from app.schemas.friend import FriendListResponse, FriendResponse
from app.services.friend_service import friend_service
from app.services.rich_menu_service import RichMenuService
from app.schemas.friend_event import (
    FriendEventListResponse,
    FriendEventListWithUserResponse,
    FriendEventResponse,
    FriendStatsResponse,
)
import math

router = APIRouter()


@router.get("")
async def list_friends(
    status: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
    db: AsyncSession = Depends(deps.get_db),
    current_admin: User = Depends(get_current_admin),
) -> Any:
    """List all friends with status"""
    friends = await friend_service.list_friends(status, db, skip, limit)

    # Get total count for pagination
    from sqlalchemy import func as sa_func
    from app.models.user import User as UserModel
    from app.services.user_identity_service import decrypt_line_ids_for_users, user_identity_filter
    count_query = select(sa_func.count(UserModel.id)).where(user_identity_filter())
    if status:
        count_query = count_query.where(UserModel.friend_status == status)
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    # Batch-decrypt the raw LINE IDs for this page (friends are User rows).
    raw_by_user_id = await decrypt_line_ids_for_users(
        db, [f.id for f in friends if f.line_user_id_hash]
    )

    # Scope refollow counts to current page only (result keyed by raw LINE id).
    refollow_counts = await friend_service.get_user_refollow_counts(
        db, line_user_ids=list(raw_by_user_id.values())
    )
    # Current per-user rich menu binding per friend (same page scope, keyed by user id).
    rich_menu_links = await RichMenuService.get_current_links_for_users(
        db, [f.id for f in friends]
    )

    friend_list = []
    for friend in friends:
        data = FriendResponse.model_validate(friend).model_dump()
        raw_id = raw_by_user_id.get(friend.id)
        data["line_user_id"] = raw_id
        data["refollow_count"] = refollow_counts.get(raw_id, 0)
        link = rich_menu_links.get(friend.id)
        data["rich_menu_id"] = link["rich_menu_id"] if link else None
        data["rich_menu_name"] = link["rich_menu_name"] if link else None
        friend_list.append(data)
    return {
        "friends": friend_list,
        "total": total,
    }


@router.get("/history", response_model=FriendEventListWithUserResponse)
async def list_friend_history(
    line_user_id: Optional[str] = Query(None, description="Filter by LINE user ID"),
    event_type: Optional[str] = Query(None, description="Filter by event type (FOLLOW, UNFOLLOW, BLOCK, REFOLLOW)"),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(deps.get_db),
    current_admin: User = Depends(get_current_admin),
) -> Any:
    """Get paginated list of all friend events (newest first)"""
    events, total = await friend_service.get_all_friend_events(
        db=db,
        line_user_id=line_user_id,
        event_type=event_type,
        page=page,
        per_page=per_page,
    )
    total_pages = math.ceil(total / per_page) if per_page > 0 else 0
    return {
        "events": events,
        "total": total,
        "page": page,
        "per_page": per_page,
        "total_pages": total_pages,
    }


@router.get("/stats", response_model=FriendStatsResponse)
async def get_friend_stats(
    db: AsyncSession = Depends(deps.get_db),
    current_admin: User = Depends(get_current_admin),
) -> Any:
    """Get friend statistics summary"""
    return await friend_service.get_friend_stats(db)


@router.get("/{line_user_id}/events", response_model=FriendEventListResponse)
async def get_friend_events(
    line_user_id: str,
    db: AsyncSession = Depends(deps.get_db),
    current_admin: User = Depends(get_current_admin),
) -> Any:
    """Get friend history for a specific user"""
    events = await friend_service.get_friend_events(line_user_id, db)
    validated = [
        FriendEventResponse.model_validate(e).model_copy(
            update={"line_user_id": line_user_id}
        )
        for e in events
    ]
    return {"events": validated, "total": len(validated)}
