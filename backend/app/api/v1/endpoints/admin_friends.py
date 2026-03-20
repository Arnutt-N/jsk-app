from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Any, Optional
from app.api import deps
from app.api.deps import get_current_admin
from app.models.user import User
from app.schemas.friend import FriendListResponse, FriendResponse
from app.services.friend_service import friend_service
from app.schemas.friend_event import (
    FriendEventListResponse,
    FriendEventListWithUserResponse,
    FriendStatsResponse,
)
import math

router = APIRouter()


@router.get("", response_model=FriendListResponse)
async def list_friends(
    status: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
    db: AsyncSession = Depends(deps.get_db),
    current_admin: User = Depends(get_current_admin),
) -> Any:
    """List all friends with status"""
    friends = await friend_service.list_friends(status, db, skip, limit)
    refollow_counts = await friend_service.get_user_refollow_counts(db)
    friend_list = []
    for friend in friends:
        data = FriendResponse.model_validate(friend).model_dump()
        data["refollow_count"] = refollow_counts.get(friend.line_user_id, 0)
        friend_list.append(data)
    return {
        "friends": friend_list,
        "total": len(friends),
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
    return {"events": events, "total": len(events)}
