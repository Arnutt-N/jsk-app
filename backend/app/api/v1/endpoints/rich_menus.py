from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional
import json
import logging
import os
import shutil
from app.db.session import get_db
from app.api.deps import get_current_admin
from app.models.rich_menu import RichMenu, RichMenuStatus
from app.models.user import User
from app.schemas.rich_menu import RichMenuResponse, RichMenuCreate
from app.services.rich_menu_service import RichMenuService
from sqlalchemy import select

router = APIRouter()
logger = logging.getLogger(__name__)

UPLOAD_DIR = "uploads/rich_menus"
os.makedirs(UPLOAD_DIR, exist_ok=True)

@router.get("", response_model=List[RichMenuResponse])
async def list_rich_menus(db: AsyncSession = Depends(get_db), current_admin: User = Depends(get_current_admin)):
    result = await db.execute(select(RichMenu).order_by(RichMenu.created_at.desc()))
    return result.scalars().all()

@router.get("/{id}", response_model=RichMenuResponse)
async def get_rich_menu(id: int, db: AsyncSession = Depends(get_db), current_admin: User = Depends(get_current_admin)):
    result = await db.execute(select(RichMenu).where(RichMenu.id == id))
    rich_menu = result.scalar_one_or_none()
    if not rich_menu:
        raise HTTPException(status_code=404, detail="Rich Menu not found")
    return rich_menu

@router.put("/{id}", response_model=RichMenuResponse)
async def update_rich_menu(id: int, data: RichMenuCreate, db: AsyncSession = Depends(get_db), current_admin: User = Depends(get_current_admin)):
    result = await db.execute(select(RichMenu).where(RichMenu.id == id))
    rich_menu = result.scalar_one_or_none()
    if not rich_menu:
        raise HTTPException(status_code=404, detail="Rich Menu not found")
    
    # Update fields
    rich_menu.name = data.name
    rich_menu.chat_bar_text = data.chat_bar_text
    
    # Update config
    line_config = {
        "size": {"width": 2500, "height": 1686},
        "selected": False,
        "name": data.name,
        "chatBarText": data.chat_bar_text,
        "areas": [area.model_dump() for area in data.areas]
    }
    rich_menu.config = line_config
    
    await db.commit()
    await db.refresh(rich_menu)
    return rich_menu

@router.post("", response_model=RichMenuResponse)
async def create_rich_menu(
    data: RichMenuCreate,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(get_current_admin)
):
    # Construct LINE config object
    line_config = {
        "size": {"width": 2500, "height": 1686},
        "selected": False,
        "name": data.name,
        "chatBarText": data.chat_bar_text,
        "areas": [area.model_dump() for area in data.areas]
    }
    
    # Save locally as DRAFT first
    rich_menu = RichMenu(
        name=data.name,
        chat_bar_text=data.chat_bar_text,
        config=line_config,
        status=RichMenuStatus.DRAFT
    )
    db.add(rich_menu)
    await db.commit()
    await db.refresh(rich_menu)
    return rich_menu

@router.post("/{id}/upload")
async def upload_rich_menu_image(
    id: int,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(get_current_admin)
):
    result = await db.execute(select(RichMenu).where(RichMenu.id == id))
    rich_menu = result.scalar_one_or_none()
    if not rich_menu:
        raise HTTPException(status_code=404, detail="Rich Menu not found")
        
    # Save local file
    file_path = os.path.join(UPLOAD_DIR, f"{id}_{file.filename}")
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    
    rich_menu.image_path = file_path
    
    # If already has LINE ID, sync image now. Otherwise, wait for explicit sync.
    if rich_menu.line_rich_menu_id:
        with open(file_path, "rb") as f:
            img_bytes = f.read()
        try:
            await RichMenuService.upload_image_to_line(
                db, 
                rich_menu.line_rich_menu_id, 
                img_bytes, 
                file.content_type
            )
        except Exception as e:
            await db.commit() # Save local path anyway
            raise HTTPException(status_code=400, detail=f"Image saved locally, but LINE Upload failed: {str(e)}")
    
    await db.commit()
    return {"message": "Image saved", "path": file_path}

@router.post("/{id}/sync")
async def sync_rich_menu(id: int, db: AsyncSession = Depends(get_db), current_admin: User = Depends(get_current_admin)):
    """
    Sync rich menu to LINE with idempotency.
    If already synced, verifies existence on LINE.
    If not synced, creates on LINE and stores the ID.
    """
    result = await db.execute(select(RichMenu).where(RichMenu.id == id))
    rich_menu = result.scalar_one_or_none()
    if not rich_menu:
        raise HTTPException(status_code=404, detail="Rich Menu not found")

    try:
        # Use idempotent sync
        sync_result = await RichMenuService.sync_with_idempotency(db, id)

        # If sync was successful and we have a local image, upload it
        if sync_result.get("success") and rich_menu.image_path and os.path.exists(rich_menu.image_path):
            with open(rich_menu.image_path, "rb") as f:
                img_bytes = f.read()

            # Simple content type detection based on extension
            ext = os.path.splitext(rich_menu.image_path)[1].lower()
            content_type = "image/png" if ext == ".png" else "image/jpeg"

            await RichMenuService.upload_image_to_line(
                db,
                sync_result.get("line_rich_menu_id") or rich_menu.line_rich_menu_id,
                img_bytes,
                content_type
            )

        return sync_result
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Sync failed: {str(e)}")

@router.get("/{id}/sync-status")
async def get_sync_status(id: int, db: AsyncSession = Depends(get_db), current_admin: User = Depends(get_current_admin)):
    """Get the current sync status of a rich menu."""
    status_info = await RichMenuService.get_sync_status(db, id)
    if "success" in status_info and not status_info["success"]:
        raise HTTPException(status_code=404, detail=status_info.get("message", "Rich Menu not found"))
    return status_info

@router.post("/{id}/publish")
async def publish_rich_menu(id: int, db: AsyncSession = Depends(get_db), current_admin: User = Depends(get_current_admin)):
    result = await db.execute(select(RichMenu).where(RichMenu.id == id))
    rich_menu = result.scalar_one_or_none()
    if not rich_menu:
        raise HTTPException(status_code=404, detail="Rich Menu not found")
        
    try:
        await RichMenuService.set_default_on_line(db, rich_menu.line_rich_menu_id)
        rich_menu.status = RichMenuStatus.PUBLISHED
        await db.commit()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"LINE Publish Error: {str(e)}")
        
    return {"message": "Rich Menu is now default on LINE Official Account"}

@router.delete("/{id}")
async def delete_rich_menu(id: int, db: AsyncSession = Depends(get_db), current_admin: User = Depends(get_current_admin)):
    result = await db.execute(select(RichMenu).where(RichMenu.id == id))
    rich_menu = result.scalar_one_or_none()
    if not rich_menu:
        raise HTTPException(status_code=404, detail="Rich Menu not found")
        
    # Delete from LINE
    if rich_menu.line_rich_menu_id:
        try:
            await RichMenuService.delete_from_line(db, rich_menu.line_rich_menu_id)
        except Exception as e:
            logger.warning("Failed to delete rich menu %s from LINE during local delete", rich_menu.line_rich_menu_id, exc_info=e)
            
    # Delete local file if exists
    if rich_menu.image_path and os.path.exists(rich_menu.image_path):
        os.remove(rich_menu.image_path)
        
    await db.delete(rich_menu)
    await db.commit()
    return {"message": "Rich Menu deleted"}
