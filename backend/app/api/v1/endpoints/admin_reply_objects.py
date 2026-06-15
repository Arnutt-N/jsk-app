"""
Admin API endpoints for Reply Objects management
"""
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from typing import List

from app.api.deps import get_db, get_current_admin, require_permission
from app.core.permissions import KEY_MANAGE_REPLY_OBJECTS
from app.models.reply_object import ReplyObject, ObjectType
from app.models.user import User
from app.schemas.reply_object import (
    ReplyObjectCreate,
    ReplyObjectUpdate,
    ReplyObjectResponse
)

router = APIRouter()


@router.get("", response_model=List[ReplyObjectResponse])
async def list_reply_objects(
    skip: int = 0,
    limit: int = 100,
    category: str = None,
    object_type: str = None,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(get_current_admin)
):
    """List all reply objects with optional filtering."""
    query = select(ReplyObject).order_by(ReplyObject.created_at.desc())
    
    if category:
        query = query.filter(ReplyObject.category == category)
    if object_type:
        query = query.filter(ReplyObject.object_type == object_type)
    
    query = query.offset(skip).limit(limit)
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/{object_id}", response_model=ReplyObjectResponse)
async def get_reply_object(
    object_id: str,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(get_current_admin)
):
    """Get a single reply object by its object_id."""
    result = await db.execute(
        select(ReplyObject).filter(ReplyObject.object_id == object_id)
    )
    obj = result.scalars().first()
    if not obj:
        raise HTTPException(status_code=404, detail=f"Reply object '{object_id}' not found")
    return obj


@router.post("", response_model=ReplyObjectResponse, status_code=201)
async def create_reply_object(
    data: ReplyObjectCreate,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(require_permission(KEY_MANAGE_REPLY_OBJECTS))
):
    """Create a new reply object."""
    # Check if object_id already exists
    existing = await db.execute(
        select(ReplyObject).filter(ReplyObject.object_id == data.object_id)
    )
    if existing.scalars().first():
        raise HTTPException(status_code=400, detail=f"Object ID '{data.object_id}' already exists")
    
    obj = ReplyObject(
        object_id=data.object_id,
        name=data.name,
        category=data.category,
        object_type=ObjectType(data.object_type.value),
        payload=data.payload,
        alt_text=data.alt_text,
        preview_url=data.preview_url
    )
    db.add(obj)
    await db.commit()
    await db.refresh(obj)
    return obj


@router.put("/{object_id}", response_model=ReplyObjectResponse)
async def update_reply_object(
    object_id: str,
    data: ReplyObjectUpdate,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(require_permission(KEY_MANAGE_REPLY_OBJECTS))
):
    """Update an existing reply object."""
    result = await db.execute(
        select(ReplyObject).filter(ReplyObject.object_id == object_id)
    )
    obj = result.scalars().first()
    if not obj:
        raise HTTPException(status_code=404, detail=f"Reply object '{object_id}' not found")
    
    # Update only provided fields
    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        if field == "object_type" and value:
            value = ObjectType(value)
        setattr(obj, field, value)
    
    await db.commit()
    await db.refresh(obj)
    return obj


@router.delete("/{object_id}", status_code=204)
async def delete_reply_object(
    object_id: str,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(require_permission(KEY_MANAGE_REPLY_OBJECTS))
):
    """Delete a reply object."""
    result = await db.execute(
        select(ReplyObject).filter(ReplyObject.object_id == object_id)
    )
    obj = result.scalars().first()
    if not obj:
        raise HTTPException(status_code=404, detail=f"Reply object '{object_id}' not found")
    
    await db.delete(obj)
    await db.commit()
    return None
