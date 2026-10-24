"""Admin canned responses API endpoints."""
from datetime import datetime

from app.api.deps import get_current_admin, get_current_admin_or_viewer, get_db
from app.models.user import User
from app.services.canned_response_service import canned_response_service, normalize_text
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter()


class CannedResponseCreate(BaseModel):
    shortcut: str
    title: str
    content: str
    category: str = "info"


class CannedResponseUpdate(BaseModel):
    shortcut: str | None = None
    title: str | None = None
    content: str | None = None
    category: str | None = None
    is_active: bool | None = None
    updated_at: datetime | None = None  # last-read timestamp — collision guard only


@router.get("")
async def list_canned_responses(
    category: str | None = Query(None, description="Filter by category"),
    include_inactive: bool = Query(False, description="Admin toggle view also needs disabled rows"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_admin_or_viewer)
):
    """List canned responses (active only by default; admin passes include_inactive)."""
    items = await canned_response_service.get_all(db, category=category, active_only=not include_inactive)
    return {
        "items": [
            {
                "id": r.id,
                "shortcut": r.shortcut,
                "title": r.title,
                "content": r.content,
                "category": r.category,
                "is_active": r.is_active,
                "updated_at": r.updated_at.isoformat() if r.updated_at is not None else None,
                "usage_count": r.usage_count,
            }
            for r in items
        ],
        "total": len(items)
    }


@router.post("")
async def create_canned_response(
    data: CannedResponseCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_admin)
):
    """Create a new canned response."""
    existing = await canned_response_service.get_by_shortcut(data.shortcut, db, active_only=False)
    if existing:
        raise HTTPException(status_code=409, detail=f"Shortcut '{data.shortcut}' already exists")

    # content duplicate check on normalized text (trim + collapse + casefold)
    # — spans inactive rows too, or recreating a disabled template 500s on the unique constraint.
    norm = normalize_text(data.content)
    for r in await canned_response_service.get_all(db, active_only=False):
        if normalize_text(str(r.content or "")) == norm:
            raise HTTPException(
                status_code=409,
                detail=f"ข้อความซ้ำกับรายการ {r.title} กรุณาใช้รายการเดิม",
            )

    response = await canned_response_service.create(
        {**data.model_dump(), "created_by": current_user.id},
        db
    )
    return {
        "id": response.id,
        "shortcut": response.shortcut,
        "title": response.title,
        "content": response.content,
        "category": response.category,
        "is_active": response.is_active,
    }


@router.put("/{response_id}")
async def update_canned_response(
    response_id: int,
    data: CannedResponseUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_admin)
):
    """Update a canned response."""
    # optimistic concurrency: a stale updated_at means someone else wrote first
    if data.updated_at is not None:
        current = await canned_response_service.get_by_id(response_id, db)
        stored_updated_at: datetime | None = getattr(current, "updated_at", None)
        if current is not None and stored_updated_at is not None and stored_updated_at != data.updated_at:
            raise HTTPException(
                status_code=409,
                detail="มีคนแก้ข้อความนี้ไปก่อนแล้ว กรุณารีเฟรช",
            )
    update_data = data.model_dump(exclude_unset=True)
    update_data.pop("updated_at", None)  # guard field only — never overwrite the real timestamp
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")

    response = await canned_response_service.update(response_id, update_data, db)
    if not response:
        raise HTTPException(status_code=404, detail="Canned response not found")

    return {
        "id": response.id,
        "shortcut": response.shortcut,
        "title": response.title,
        "content": response.content,
        "category": response.category,
        "is_active": response.is_active,
    }


@router.delete("/{response_id}")
async def delete_canned_response(
    response_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_admin)
):
    """Soft-delete a canned response."""
    deleted = await canned_response_service.delete(response_id, db)
    if not deleted:
        raise HTTPException(status_code=404, detail="Canned response not found")
    return {"status": "deleted", "id": response_id}
