from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Path
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional
import json
import logging
import os
import shutil
from app.db.session import get_db
from app.api.deps import get_current_admin, require_permission
from app.core.permissions import KEY_MANAGE_RICH_MENUS
from app.models.rich_menu import RichMenu, RichMenuStatus
from app.models.user import User
from app.schemas.rich_menu import (
    RichMenuResponse,
    RichMenuCreate,
    RichMenuUpdate,
    RichMenuAliasCreate,
    RichMenuAliasUpdate,
    RichMenuAliasResponse,
    BulkLinkRequest,
    BulkUnlinkRequest,
)
from app.models.rich_menu_alias import RichMenuAlias
from app.models.user_rich_menu_link import UserRichMenuLink
from app.services.rich_menu_service import RichMenuService
from sqlalchemy import select, delete, func
from sqlalchemy.exc import IntegrityError
from datetime import datetime, timezone

router = APIRouter()
logger = logging.getLogger(__name__)

UPLOAD_DIR = "uploads/rich_menus"
os.makedirs(UPLOAD_DIR, exist_ok=True)

# LINE rich menu canvas sizes.
# Ref: https://developers.line.biz/en/reference/messaging-api/#rich-menu-object
RICH_MENU_WIDTH = 2500
RICH_MENU_HEIGHT_LARGE = 1686
RICH_MENU_HEIGHT_COMPACT = 843

# LINE userId: "U" + 32 lowercase hex chars (33 total). Validate single-user
# path params at the HTTP layer so a malformed id is rejected (422) before any
# DB query or LINE call — matching the bulk schema's LineUserId pattern.
LINE_USER_ID_PATTERN = r"^U[0-9a-f]{32}$"


def resolve_rich_menu_size(template_type: str) -> dict:
    """Map a frontend template_type id to the LINE canvas size.

    Compact templates (ids containing "compact", e.g. "3-buttons-compact") use
    height 843; large templates (e.g. "6-buttons") use 1686. Unknown/empty types
    default to large, which LINE always accepts.
    """
    is_compact = "compact" in (template_type or "").lower()
    height = RICH_MENU_HEIGHT_COMPACT if is_compact else RICH_MENU_HEIGHT_LARGE
    return {"width": RICH_MENU_WIDTH, "height": height}


@router.get("", response_model=List[RichMenuResponse])
async def list_rich_menus(db: AsyncSession = Depends(get_db), current_admin: User = Depends(get_current_admin)):
    result = await db.execute(select(RichMenu).order_by(RichMenu.created_at.desc()))
    menus = result.scalars().all()

    # Batch-count per-user links grouped by rich_menu_id in ONE query (avoids
    # N+1), then enrich each menu — mirrors the refollow_count enrichment in
    # admin_friends.list_friends. Menus with no links default to 0.
    counts_result = await db.execute(
        select(UserRichMenuLink.rich_menu_id, func.count()).group_by(
            UserRichMenuLink.rich_menu_id
        )
    )
    link_counts = {rich_menu_id: count for rich_menu_id, count in counts_result.all()}

    enriched = []
    for menu in menus:
        data = RichMenuResponse.model_validate(menu).model_dump()
        data["user_link_count"] = link_counts.get(menu.id, 0)
        enriched.append(data)
    return enriched

# ---- Rich Menu Aliases (tab switching via `richmenuswitch`) ----
# IMPORTANT: these literal "/aliases" routes MUST be declared BEFORE "/{id}" so
# FastAPI does not try to cast "aliases" to int (which would 422).

@router.get("/aliases", response_model=List[RichMenuAliasResponse])
async def list_rich_menu_aliases(
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    result = await db.execute(select(RichMenuAlias).order_by(RichMenuAlias.created_at.desc()))
    return result.scalars().all()

@router.post("/aliases", response_model=RichMenuAliasResponse)
async def create_rich_menu_alias(
    data: RichMenuAliasCreate,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(require_permission(KEY_MANAGE_RICH_MENUS)),
):
    # Target rich menu must exist and be synced to LINE (have a line_rich_menu_id).
    result = await db.execute(select(RichMenu).where(RichMenu.id == data.rich_menu_id))
    rich_menu = result.scalar_one_or_none()
    if not rich_menu:
        raise HTTPException(status_code=404, detail="Rich Menu not found")
    if not rich_menu.line_rich_menu_id:
        raise HTTPException(status_code=409, detail="Rich menu must be synced to LINE before creating an alias")

    existing = await db.execute(select(RichMenuAlias).where(RichMenuAlias.alias_id == data.alias_id))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Alias id already exists")

    alias = RichMenuAlias(alias_id=data.alias_id, rich_menu_id=rich_menu.id, sync_status="PENDING")
    db.add(alias)
    try:
        await RichMenuService.create_alias_on_line(db, data.alias_id, rich_menu.line_rich_menu_id)
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=400, detail=f"LINE alias create failed: {str(e)}")

    alias.sync_status = "SYNCED"
    alias.last_synced_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(alias)
    return alias

@router.put("/aliases/{alias_id}", response_model=RichMenuAliasResponse)
async def update_rich_menu_alias(
    alias_id: str,
    data: RichMenuAliasUpdate,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(require_permission(KEY_MANAGE_RICH_MENUS)),
):
    result = await db.execute(select(RichMenuAlias).where(RichMenuAlias.alias_id == alias_id))
    alias = result.scalar_one_or_none()
    if not alias:
        raise HTTPException(status_code=404, detail="Alias not found")

    menu_result = await db.execute(select(RichMenu).where(RichMenu.id == data.rich_menu_id))
    rich_menu = menu_result.scalar_one_or_none()
    if not rich_menu:
        raise HTTPException(status_code=404, detail="Rich Menu not found")
    if not rich_menu.line_rich_menu_id:
        raise HTTPException(status_code=409, detail="Rich menu must be synced to LINE before pointing an alias to it")

    # alias_id is immutable on LINE; only the target rich menu changes (PUT).
    try:
        await RichMenuService.update_alias_on_line(db, alias_id, rich_menu.line_rich_menu_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"LINE alias update failed: {str(e)}")

    alias.rich_menu_id = rich_menu.id
    alias.sync_status = "SYNCED"
    alias.last_synced_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(alias)
    return alias

@router.delete("/aliases/{alias_id}")
async def delete_rich_menu_alias(
    alias_id: str,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(require_permission(KEY_MANAGE_RICH_MENUS)),
):
    result = await db.execute(select(RichMenuAlias).where(RichMenuAlias.alias_id == alias_id))
    alias = result.scalar_one_or_none()
    if not alias:
        raise HTTPException(status_code=404, detail="Alias not found")

    # 404 on LINE is accepted internally; log other failures but still remove locally.
    try:
        await RichMenuService.delete_alias_on_line(db, alias_id)
    except Exception as e:
        logger.warning("Failed to delete alias %s from LINE during local delete", alias_id, exc_info=e)

    await db.delete(alias)
    await db.commit()
    return {"message": "Alias deleted"}

# ---- Per-user assignment (override the default menu for specific users) ----
# IMPORTANT: the literal "/users/bulk-*" routes MUST be declared BEFORE "/{id}"
# so FastAPI does not try to cast "users" to int (which would 422).


async def _ensure_known_line_user(db: AsyncSession, line_user_id: str) -> None:
    """IDOR guard: the line_user_id must belong to a known user (404 otherwise)."""
    result = await db.execute(select(User).where(User.line_user_id == line_user_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Unknown LINE user")


async def _ensure_known_line_users(db: AsyncSession, line_user_ids: List[str]) -> None:
    """IDOR guard for bulk: every line_user_id must be known (404 lists missing)."""
    result = await db.execute(
        select(User.line_user_id).where(User.line_user_id.in_(line_user_ids))
    )
    found = set(result.scalars().all())
    missing = [u for u in line_user_ids if u not in found]
    if missing:
        # Don't reflect the ids back (avoids a membership-enumeration oracle);
        # log them server-side for operators instead.
        logger.warning("Bulk rich-menu op referenced %d unknown LINE user(s)", len(missing))
        raise HTTPException(status_code=404, detail=f"{len(missing)} LINE user(s) not found")


async def _upsert_user_links(
    db: AsyncSession, line_user_ids: List[str], rich_menu_id: int
) -> None:
    """Cache per-user assignments locally. line_user_id is unique (one menu/user),
    so re-linking updates the existing row instead of inserting a duplicate."""
    existing = await db.execute(
        select(UserRichMenuLink).where(UserRichMenuLink.line_user_id.in_(line_user_ids))
    )
    by_uid = {row.line_user_id: row for row in existing.scalars().all()}
    now = datetime.now(timezone.utc)
    for uid in line_user_ids:
        row = by_uid.get(uid)
        if row:
            row.rich_menu_id = rich_menu_id
            row.sync_status = "SYNCED"
            row.last_synced_at = now
            row.last_sync_error = None
        else:
            db.add(
                UserRichMenuLink(
                    line_user_id=uid,
                    rich_menu_id=rich_menu_id,
                    sync_status="SYNCED",
                    last_synced_at=now,
                )
            )


async def _rich_menu_dependencies(db: AsyncSession, rich_menu_id: int) -> dict:
    """What still points at this menu: alias ids + count of per-user links.

    Used as a friendly pre-check before delete (the FK RESTRICT is the real
    enforcer). Returns {"aliases": [alias_id, ...], "user_count": int}.
    """
    alias_result = await db.execute(
        select(RichMenuAlias).where(RichMenuAlias.rich_menu_id == rich_menu_id)
    )
    aliases = [a.alias_id for a in alias_result.scalars().all()]
    count_result = await db.execute(
        select(func.count())
        .select_from(UserRichMenuLink)
        .where(UserRichMenuLink.rich_menu_id == rich_menu_id)
    )
    user_count = count_result.scalar() or 0
    return {"aliases": aliases, "user_count": user_count}


@router.post("/users/bulk-link")
async def bulk_link_users(
    data: BulkLinkRequest,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(require_permission(KEY_MANAGE_RICH_MENUS)),
):
    result = await db.execute(select(RichMenu).where(RichMenu.id == data.rich_menu_id))
    rich_menu = result.scalar_one_or_none()
    if not rich_menu:
        raise HTTPException(status_code=404, detail="Rich Menu not found")
    if not rich_menu.line_rich_menu_id:
        raise HTTPException(status_code=409, detail="Rich menu must be synced to LINE before linking")

    await _ensure_known_line_users(db, data.user_ids)

    try:
        await RichMenuService.bulk_link(db, rich_menu.line_rich_menu_id, data.user_ids)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"LINE bulk link failed: {str(e)}")

    await _upsert_user_links(db, data.user_ids, rich_menu.id)
    await db.commit()
    return {"message": "Linked", "rich_menu_id": rich_menu.id, "count": len(data.user_ids)}


@router.post("/users/bulk-unlink")
async def bulk_unlink_users(
    data: BulkUnlinkRequest,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(require_permission(KEY_MANAGE_RICH_MENUS)),
):
    # No synced-guard: unlinking should always be possible.
    await _ensure_known_line_users(db, data.user_ids)

    try:
        await RichMenuService.bulk_unlink(db, data.user_ids)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"LINE bulk unlink failed: {str(e)}")

    await db.execute(
        delete(UserRichMenuLink).where(UserRichMenuLink.line_user_id.in_(data.user_ids))
    )
    await db.commit()
    return {"message": "Unlinked", "count": len(data.user_ids)}


@router.post("/{id}/users/{user_id}")
async def link_user_to_rich_menu(
    id: int,
    user_id: str = Path(pattern=LINE_USER_ID_PATTERN),
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(require_permission(KEY_MANAGE_RICH_MENUS)),
):
    result = await db.execute(select(RichMenu).where(RichMenu.id == id))
    rich_menu = result.scalar_one_or_none()
    if not rich_menu:
        raise HTTPException(status_code=404, detail="Rich Menu not found")
    if not rich_menu.line_rich_menu_id:
        raise HTTPException(status_code=409, detail="Rich menu must be synced to LINE before linking")

    await _ensure_known_line_user(db, user_id)

    try:
        await RichMenuService.link_to_user(db, user_id, rich_menu.line_rich_menu_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"LINE link failed: {str(e)}")

    await _upsert_user_links(db, [user_id], rich_menu.id)
    await db.commit()
    return {"message": "Linked", "line_user_id": user_id, "rich_menu_id": rich_menu.id}


@router.delete("/{id}/users/{user_id}")
async def unlink_user_from_rich_menu(
    id: int,
    user_id: str = Path(pattern=LINE_USER_ID_PATTERN),
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(require_permission(KEY_MANAGE_RICH_MENUS)),
):
    # `id` scopes the request to a menu for existence/consistency; LINE's
    # per-user unlink is global (a user has at most one menu), so this clears
    # whatever menu the user currently has.
    result = await db.execute(select(RichMenu).where(RichMenu.id == id))
    rich_menu = result.scalar_one_or_none()
    if not rich_menu:
        raise HTTPException(status_code=404, detail="Rich Menu not found")

    await _ensure_known_line_user(db, user_id)

    # No synced-guard: allow reverting a user even if the menu lost its LINE id.
    try:
        await RichMenuService.unlink_from_user(db, user_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"LINE unlink failed: {str(e)}")

    await db.execute(
        delete(UserRichMenuLink).where(UserRichMenuLink.line_user_id == user_id)
    )
    await db.commit()
    return {"message": "Unlinked", "line_user_id": user_id}


@router.get("/{id}/users/{user_id}")
async def get_user_rich_menu_assignment(
    id: int,
    user_id: str = Path(pattern=LINE_USER_ID_PATTERN),
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    # `id` is an existence/consistency anchor; the returned assignment is the
    # user's actual LINE menu (may differ from `id`).
    result = await db.execute(select(RichMenu).where(RichMenu.id == id))
    rich_menu = result.scalar_one_or_none()
    if not rich_menu:
        raise HTTPException(status_code=404, detail="Rich Menu not found")

    await _ensure_known_line_user(db, user_id)

    line_menu = await RichMenuService.get_user_rich_menu(db, user_id)
    return {"line_user_id": user_id, "rich_menu": line_menu}


@router.get("/{id}/dependencies")
async def get_rich_menu_dependencies(
    id: int,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    """List what depends on this menu (aliases + per-user link count).

    Frontend pre-fetches this before showing the delete confirm dialog so it
    can warn about dependencies that would otherwise 409 the delete.
    """
    result = await db.execute(select(RichMenu).where(RichMenu.id == id))
    rich_menu = result.scalar_one_or_none()
    if not rich_menu:
        raise HTTPException(status_code=404, detail="Rich Menu not found")
    return await _rich_menu_dependencies(db, id)


@router.get("/{id}", response_model=RichMenuResponse)
async def get_rich_menu(id: int, db: AsyncSession = Depends(get_db), current_admin: User = Depends(get_current_admin)):
    result = await db.execute(select(RichMenu).where(RichMenu.id == id))
    rich_menu = result.scalar_one_or_none()
    if not rich_menu:
        raise HTTPException(status_code=404, detail="Rich Menu not found")
    return rich_menu

@router.put("/{id}", response_model=RichMenuResponse)
async def update_rich_menu(id: int, data: RichMenuUpdate, db: AsyncSession = Depends(get_db), current_admin: User = Depends(require_permission(KEY_MANAGE_RICH_MENUS))):
    result = await db.execute(select(RichMenu).where(RichMenu.id == id))
    rich_menu = result.scalar_one_or_none()
    if not rich_menu:
        raise HTTPException(status_code=404, detail="Rich Menu not found")

    # Update fields
    rich_menu.name = data.name
    rich_menu.chat_bar_text = data.chat_bar_text

    # Update config. The canvas size (layout) is fixed at creation time, so the
    # edit payload (RichMenuUpdate) intentionally omits template_type. Preserve
    # the size already stored in config instead of re-deriving it; fall back to
    # the large default only if a legacy record has no size recorded.
    existing_size = (rich_menu.config or {}).get("size") or resolve_rich_menu_size("")
    line_config = {
        "size": existing_size,
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
    current_admin: User = Depends(require_permission(KEY_MANAGE_RICH_MENUS))
):
    # Construct LINE config object
    line_config = {
        "size": resolve_rich_menu_size(data.template_type),
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
    current_admin: User = Depends(require_permission(KEY_MANAGE_RICH_MENUS))
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
async def sync_rich_menu(id: int, db: AsyncSession = Depends(get_db), current_admin: User = Depends(require_permission(KEY_MANAGE_RICH_MENUS))):
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
async def publish_rich_menu(id: int, db: AsyncSession = Depends(get_db), current_admin: User = Depends(require_permission(KEY_MANAGE_RICH_MENUS))):
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
async def delete_rich_menu(id: int, db: AsyncSession = Depends(get_db), current_admin: User = Depends(require_permission(KEY_MANAGE_RICH_MENUS))):
    result = await db.execute(select(RichMenu).where(RichMenu.id == id))
    rich_menu = result.scalar_one_or_none()
    if not rich_menu:
        raise HTTPException(status_code=404, detail="Rich Menu not found")

    # Friendly pre-check: block delete while aliases or per-user links point here.
    # (The FK RESTRICT is the real enforcer; this gives a clear 409 with the list.)
    deps = await _rich_menu_dependencies(db, id)
    if deps["aliases"] or deps["user_count"]:
        raise HTTPException(
            status_code=409,
            detail={
                "message": "Rich menu has dependencies; remove them before deleting",
                "aliases": deps["aliases"],
                "user_count": deps["user_count"],
            },
        )

    # Delete from LINE
    if rich_menu.line_rich_menu_id:
        try:
            await RichMenuService.delete_from_line(db, rich_menu.line_rich_menu_id)
        except Exception as e:
            logger.warning("Failed to delete rich menu %s from LINE during local delete", rich_menu.line_rich_menu_id, exc_info=e)

    # Delete local file if exists
    if rich_menu.image_path and os.path.exists(rich_menu.image_path):
        os.remove(rich_menu.image_path)

    # FK RESTRICT backstop: a dependency created between the pre-check and the
    # delete still raises IntegrityError — surface it as a 409, not a 500.
    try:
        await db.delete(rich_menu)
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Rich menu has dependencies; cannot delete",
        )

    return {"message": "Rich Menu deleted"}
