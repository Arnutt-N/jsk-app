"""
Admin API endpoints for Auto Replies management
"""
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_admin, get_db, require_permission
from app.core.permissions import KEY_MANAGE_AUTO_REPLIES
from app.core.query_utils import escape_ilike
from app.models.auto_reply import AutoReply, MatchType, ReplyType
from app.models.user import User
from app.schemas.auto_reply import AutoReplyCreate, AutoReplyResponse, AutoReplyUpdate

router = APIRouter()


@router.get("", response_model=List[AutoReplyResponse])
async def list_auto_replies(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=100),
    keyword: str = None,
    include_inactive: bool = Query(False),
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(get_current_admin)
):
    """List all auto-reply rules with optional filtering."""
    query = select(AutoReply).order_by(AutoReply.created_at.desc())
    if not include_inactive:
        query = query.where(AutoReply.is_active.is_(True))
    
    if keyword:
        query = query.filter(
            AutoReply.keyword.ilike(f"%{escape_ilike(keyword)}%", escape="\\")
        )
    
    query = query.offset(skip).limit(limit)
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/{reply_id}", response_model=AutoReplyResponse)
async def get_auto_reply(
    reply_id: int,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(get_current_admin)
):
    """Get a single auto-reply rule by ID."""
    result = await db.execute(
        select(AutoReply).filter(AutoReply.id == reply_id)
    )
    rule = result.scalars().first()
    if not rule:
        raise HTTPException(status_code=404, detail=f"Auto-reply rule {reply_id} not found")
    return rule


@router.post("", response_model=AutoReplyResponse, status_code=201)
async def create_auto_reply(
    data: AutoReplyCreate,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(require_permission(KEY_MANAGE_AUTO_REPLIES))
):
    """Create a new auto-reply rule."""
    # Check if keyword already exists (active rows only — hidden rows no
    # longer reserve their keyword since the partial unique policy).
    existing = await db.execute(
        select(AutoReply).filter(
            AutoReply.keyword == data.keyword,
            AutoReply.is_active.is_(True),
        )
    )
    if existing.scalars().first():
        raise HTTPException(
            status_code=400,
            detail=f"คีย์เวิร์ด '{data.keyword}' ถูกใช้แล้ว",
        )
    
    rule = AutoReply(
        keyword=data.keyword,
        match_type=MatchType(data.match_type.value),
        reply_type=ReplyType(data.reply_type.value),
        text_content=data.text_content,
        payload=data.payload
    )
    db.add(rule)
    await db.commit()
    await db.refresh(rule)
    return rule


@router.put("/{reply_id}", response_model=AutoReplyResponse)
async def update_auto_reply(
    reply_id: int,
    data: AutoReplyUpdate,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(require_permission(KEY_MANAGE_AUTO_REPLIES))
):
    """Update an existing auto-reply rule."""
    result = await db.execute(
        select(AutoReply).filter(AutoReply.id == reply_id)
    )
    rule = result.scalars().first()
    if not rule:
        raise HTTPException(status_code=404, detail=f"Auto-reply rule {reply_id} not found")
    
    # Update only provided fields
    update_data = data.model_dump(exclude_unset=True)
    new_keyword = update_data.get("keyword", rule.keyword)
    if isinstance(new_keyword, str) and new_keyword != rule.keyword:
        clash = await db.execute(
            select(AutoReply.id).filter(
                AutoReply.keyword == new_keyword,
                AutoReply.is_active.is_(True),
                AutoReply.id != reply_id,
            )
        )
        if clash.scalars().first() is not None:
            raise HTTPException(
                status_code=409,
                detail=f"คีย์เวิร์ด '{new_keyword}' ถูกใช้แล้ว",
            )
    for field, value in update_data.items():
        if field == "match_type" and value:
            value = MatchType(value)
        elif field == "reply_type" and value:
            value = ReplyType(value)
        setattr(rule, field, value)
    
    await db.commit()
    await db.refresh(rule)
    return rule


@router.delete("/{reply_id}", status_code=204)
async def delete_auto_reply(
    reply_id: int,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(require_permission(KEY_MANAGE_AUTO_REPLIES))
):
    """Soft-delete an auto-reply rule (hide only; restorable via PUT)."""
    result = await db.execute(
        select(AutoReply).filter(AutoReply.id == reply_id)
    )
    rule = result.scalars().first()
    if not rule:
        raise HTTPException(status_code=404, detail=f"Auto-reply rule {reply_id} not found")

    rule.is_active = False
    await db.commit()
    return None
