from datetime import datetime
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.api.deps import get_current_admin
from app.models.broadcast import BroadcastStatus, BroadcastType
from app.models.user import User
from app.services.broadcast_service import broadcast_service

router = APIRouter()


# ------------------------------------------------------------------ #
#  Schemas
# ------------------------------------------------------------------ #

class BroadcastCreate(BaseModel):
    title: str
    message_type: BroadcastType = BroadcastType.TEXT
    content: dict
    target_audience: str = "all"
    target_filter: Optional[dict] = None


class BroadcastUpdate(BaseModel):
    title: Optional[str] = None
    message_type: Optional[BroadcastType] = None
    content: Optional[dict] = None
    target_audience: Optional[str] = None
    target_filter: Optional[dict] = None


class BroadcastResponse(BaseModel):
    id: int
    title: str
    message_type: str
    content: dict
    target_audience: str
    target_filter: Optional[dict] = None
    scheduled_at: Optional[datetime] = None
    sent_at: Optional[datetime] = None
    status: str
    total_recipients: int
    success_count: int
    failure_count: int
    created_by: Optional[int] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class BroadcastListResponse(BaseModel):
    items: List[BroadcastResponse]
    total: int
    skip: int
    limit: int


class ScheduleRequest(BaseModel):
    scheduled_at: datetime


class BroadcastStatsResponse(BaseModel):
    total: int
    draft: int
    scheduled: int
    completed: int
    failed: int


# ------------------------------------------------------------------ #
#  Endpoints
# ------------------------------------------------------------------ #

@router.get("/stats", response_model=BroadcastStatsResponse)
async def get_broadcast_stats(
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    stats = await broadcast_service.get_broadcast_stats(db)
    return stats


@router.get("", response_model=BroadcastListResponse)
async def list_broadcasts(
    status: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    items, total = await broadcast_service.list_broadcasts(db, status=status, skip=skip, limit=limit)
    return BroadcastListResponse(
        items=[BroadcastResponse.model_validate(b) for b in items],
        total=total,
        skip=skip,
        limit=limit,
    )


@router.post("", response_model=BroadcastResponse, status_code=201)
async def create_broadcast(
    payload: BroadcastCreate,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    broadcast = await broadcast_service.create_broadcast(
        db,
        title=payload.title,
        message_type=payload.message_type,
        content=payload.content,
        target_audience=payload.target_audience,
        target_filter=payload.target_filter,
        created_by=current_admin.id,
    )
    return BroadcastResponse.model_validate(broadcast)


@router.get("/{broadcast_id}", response_model=BroadcastResponse)
async def get_broadcast(
    broadcast_id: int,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    broadcast = await broadcast_service.get_broadcast(db, broadcast_id)
    if not broadcast:
        raise HTTPException(status_code=404, detail="Broadcast not found")
    return BroadcastResponse.model_validate(broadcast)


@router.put("/{broadcast_id}", response_model=BroadcastResponse)
async def update_broadcast(
    broadcast_id: int,
    payload: BroadcastUpdate,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    broadcast = await broadcast_service.get_broadcast(db, broadcast_id)
    if not broadcast:
        raise HTTPException(status_code=404, detail="Broadcast not found")
    if broadcast.status != BroadcastStatus.DRAFT:
        raise HTTPException(status_code=400, detail="Can only update drafts")

    update_data = payload.model_dump(exclude_unset=True)
    broadcast = await broadcast_service.update_broadcast(db, broadcast, **update_data)
    return BroadcastResponse.model_validate(broadcast)


@router.delete("/{broadcast_id}", status_code=204)
async def delete_broadcast(
    broadcast_id: int,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    broadcast = await broadcast_service.get_broadcast(db, broadcast_id)
    if not broadcast:
        raise HTTPException(status_code=404, detail="Broadcast not found")
    if broadcast.status not in (BroadcastStatus.DRAFT, BroadcastStatus.CANCELLED):
        raise HTTPException(status_code=400, detail="Can only delete drafts or cancelled broadcasts")
    await broadcast_service.delete_broadcast(db, broadcast)


@router.post("/{broadcast_id}/send", response_model=BroadcastResponse)
async def send_broadcast(
    broadcast_id: int,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    broadcast = await broadcast_service.get_broadcast(db, broadcast_id)
    if not broadcast:
        raise HTTPException(status_code=404, detail="Broadcast not found")
    try:
        broadcast = await broadcast_service.send_broadcast(db, broadcast)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if broadcast.status == BroadcastStatus.FAILED:
        raise HTTPException(
            status_code=502,
            detail="Broadcast failed to send. Check server logs for details.",
        )
    return BroadcastResponse.model_validate(broadcast)


@router.post("/{broadcast_id}/schedule", response_model=BroadcastResponse)
async def schedule_broadcast(
    broadcast_id: int,
    payload: ScheduleRequest,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    broadcast = await broadcast_service.get_broadcast(db, broadcast_id)
    if not broadcast:
        raise HTTPException(status_code=404, detail="Broadcast not found")
    try:
        broadcast = await broadcast_service.schedule_broadcast(db, broadcast, payload.scheduled_at)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return BroadcastResponse.model_validate(broadcast)


@router.post("/{broadcast_id}/cancel", response_model=BroadcastResponse)
async def cancel_broadcast(
    broadcast_id: int,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    broadcast = await broadcast_service.get_broadcast(db, broadcast_id)
    if not broadcast:
        raise HTTPException(status_code=404, detail="Broadcast not found")
    try:
        broadcast = await broadcast_service.cancel_broadcast(db, broadcast)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return BroadcastResponse.model_validate(broadcast)
