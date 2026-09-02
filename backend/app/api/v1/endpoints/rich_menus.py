from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Path, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Dict, List, Optional
import logging
import os
import httpx
from app.db.session import get_db
from app.api.deps import get_current_admin, require_permission
from app.core.permissions import KEY_MANAGE_RICH_MENUS
from app.core.audit import create_audit_log
from app.core.http_rate_limit import http_rate_limit
from app.core.config import settings
from app.models.rich_menu import RichMenu, RichMenuStatus, RichMenuSyncStatus
from app.models.media_file import MediaFile
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
    RichMenuInsightSummaryResponse,
    RichMenuInsightDailyResponse,
)
from app.models.rich_menu_alias import RichMenuAlias
from app.models.user_rich_menu_link import UserRichMenuLink
from app.services.rich_menu_service import (
    RichMenuService,
    LINE_IMAGE_LIMIT_BYTES,
    LINE_IMAGE_TOO_LARGE_DETAIL,
)
from app.services.user_identity_service import resolve_by_line_id, resolve_many_by_line_id
from sqlalchemy import select, delete, func
from sqlalchemy.exc import IntegrityError
from datetime import date, datetime, timedelta, timezone

router = APIRouter()
logger = logging.getLogger(__name__)

# Image upload validation. The sniffed magic bytes — NOT the spoofable
# client Content-Type — decide what is stored and pushed to LINE
# (security-review finding; precedents: liff.py whitelist, media.py size cap).
# The cap is LINE's rich-menu content limit, NOT media.py's 10 MB: a larger
# image would pass storage here and die at the LINE push (PRD 2026-08-31).
MAX_RICH_MENU_IMAGE_BYTES = LINE_IMAGE_LIMIT_BYTES
_UPLOAD_RATE_LIMIT = http_rate_limit(
    "media-upload",
    max_events=settings.MEDIA_UPLOAD_RATE_LIMIT,
    window_seconds=settings.MEDIA_UPLOAD_RATE_WINDOW,
)


def _sniff_image_mime(data: bytes) -> Optional[str]:
    """Return the real image mime from magic bytes, or None when the bytes are
    neither PNG nor JPEG (frontend `accept` promises this whitelist too)."""
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    return None


def _rich_menu_response(menu: RichMenu) -> RichMenuResponse:
    """ORM -> schema with the image URL filled in from the FK (plain column —
    no extra query, no lazy relationship)."""
    item = RichMenuResponse.model_validate(menu)
    if menu.image_media_id:
        item.image_url = f"/api/v1/media/{menu.image_media_id}"
    return item

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
        item = _rich_menu_response(menu)
        item.user_link_count = link_counts.get(menu.id, 0)
        enriched.append(item)
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


async def _ensure_known_line_user(db: AsyncSession, line_user_id: str) -> int:
    """IDOR guard: the line_user_id must belong to a known user (404 otherwise).
    Returns the user's integer id for FK population."""
    user = await resolve_by_line_id(db, line_user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="Unknown LINE user")
    return user.id


async def _ensure_known_line_users(db: AsyncSession, line_user_ids: List[str]) -> Dict[str, int]:
    """IDOR guard for bulk: every line_user_id must be known (404 lists missing).
    Returns {line_user_id: user.id} mapping for FK population."""
    uid_map = await resolve_many_by_line_id(db, line_user_ids)
    missing = [u for u in line_user_ids if u not in uid_map]
    if missing:
        logger.warning("Bulk rich-menu op referenced %d unknown LINE user(s)", len(missing))
        raise HTTPException(status_code=404, detail=f"{len(missing)} LINE user(s) not found")
    return uid_map


async def _upsert_user_links(
    db: AsyncSession, user_ids: List[int], rich_menu_id: int,
) -> None:
    """Cache per-user assignments locally. user_id is unique (one menu/user),
    so re-linking updates the existing row instead of inserting a duplicate."""
    existing = await db.execute(
        select(UserRichMenuLink).where(UserRichMenuLink.user_id.in_(user_ids))
    )
    by_uid = {row.user_id: row for row in existing.scalars().all()}
    now = datetime.now(timezone.utc)
    for uid in user_ids:
        row = by_uid.get(uid)
        if row:
            row.rich_menu_id = rich_menu_id
            row.sync_status = "SYNCED"
            row.last_synced_at = now
            row.last_sync_error = None
        else:
            db.add(
                UserRichMenuLink(
                    user_id=uid,
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

    uid_map = await _ensure_known_line_users(db, data.user_ids)

    try:
        await RichMenuService.bulk_link(db, rich_menu.line_rich_menu_id, data.user_ids)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"LINE bulk link failed: {str(e)}")

    await _upsert_user_links(db, list(uid_map.values()), rich_menu.id)
    await db.commit()
    return {"message": "Linked", "rich_menu_id": rich_menu.id, "count": len(data.user_ids)}


@router.post("/users/bulk-unlink")
async def bulk_unlink_users(
    data: BulkUnlinkRequest,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(require_permission(KEY_MANAGE_RICH_MENUS)),
):
    # No synced-guard: unlinking should always be possible.
    uid_map = await _ensure_known_line_users(db, data.user_ids)

    try:
        await RichMenuService.bulk_unlink(db, data.user_ids)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"LINE bulk unlink failed: {str(e)}")

    await db.execute(
        delete(UserRichMenuLink).where(UserRichMenuLink.user_id.in_(list(uid_map.values())))
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

    uid = await _ensure_known_line_user(db, user_id)

    try:
        await RichMenuService.link_to_user(db, user_id, rich_menu.line_rich_menu_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"LINE link failed: {str(e)}")

    await _upsert_user_links(db, [uid], rich_menu.id)
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

    uid = await _ensure_known_line_user(db, user_id)

    # No synced-guard: allow reverting a user even if the menu lost its LINE id.
    try:
        await RichMenuService.unlink_from_user(db, user_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"LINE unlink failed: {str(e)}")

    await db.execute(
        delete(UserRichMenuLink).where(UserRichMenuLink.user_id == uid)
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


# ── Rich Menu Insights (LINE Insight API) ──────────────────────────────────────

INSIGHT_DATE_FMT = "%Y%m%d"
DAILY_MAX_RANGE_DAYS = 99
SUMMARY_MAX_RANGE_DAYS = 396
LOOKBACK_MAX_YEARS = 3


def _validate_insight_dates(from_str: str, to_str: str, max_range: int) -> None:
    try:
        from_d = datetime.strptime(from_str, INSIGHT_DATE_FMT).date()
        to_d = datetime.strptime(to_str, INSIGHT_DATE_FMT).date()
    except ValueError:
        raise HTTPException(status_code=422, detail="Invalid date format. Use yyyyMMdd.")

    if from_d > to_d:
        raise HTTPException(status_code=422, detail="'from' must be <= 'to'.")
    if (to_d - from_d).days > max_range:
        raise HTTPException(
            status_code=422,
            detail=f"Date range exceeds maximum of {max_range} days.",
        )
    earliest = date.today() - timedelta(days=365 * LOOKBACK_MAX_YEARS)
    if from_d < earliest:
        raise HTTPException(
            status_code=422,
            detail="'from' cannot be more than 3 years in the past.",
        )


@router.get("/{id}/insights/summary", response_model=RichMenuInsightSummaryResponse)
async def get_rich_menu_insight_summary(
    id: int,
    from_date: str = Query(..., alias="from", pattern=r"^\d{8}$"),
    to_date: str = Query(..., alias="to", pattern=r"^\d{8}$"),
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    result = await db.execute(select(RichMenu).where(RichMenu.id == id))
    rich_menu = result.scalar_one_or_none()
    if not rich_menu:
        raise HTTPException(status_code=404, detail="Rich Menu not found")
    if not rich_menu.line_rich_menu_id:
        raise HTTPException(status_code=409, detail="Rich menu must be synced to LINE first.")

    _validate_insight_dates(from_date, to_date, SUMMARY_MAX_RANGE_DAYS)

    try:
        data = await RichMenuService.get_insight_summary(
            db, rich_menu.line_rich_menu_id, from_date, to_date
        )
    except httpx.HTTPStatusError as e:
        logger.error("LINE insight summary API error: %s", e.response.status_code)
        raise HTTPException(status_code=502, detail=f"LINE API error: {e.response.status_code}")

    return data


@router.get("/{id}/insights/daily", response_model=RichMenuInsightDailyResponse)
async def get_rich_menu_insight_daily(
    id: int,
    from_date: str = Query(..., alias="from", pattern=r"^\d{8}$"),
    to_date: str = Query(..., alias="to", pattern=r"^\d{8}$"),
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    result = await db.execute(select(RichMenu).where(RichMenu.id == id))
    rich_menu = result.scalar_one_or_none()
    if not rich_menu:
        raise HTTPException(status_code=404, detail="Rich Menu not found")
    if not rich_menu.line_rich_menu_id:
        raise HTTPException(status_code=409, detail="Rich menu must be synced to LINE first.")

    _validate_insight_dates(from_date, to_date, DAILY_MAX_RANGE_DAYS)

    try:
        data = await RichMenuService.get_insight_daily(
            db, rich_menu.line_rich_menu_id, from_date, to_date
        )
    except httpx.HTTPStatusError as e:
        logger.error("LINE insight daily API error: %s", e.response.status_code)
        raise HTTPException(status_code=502, detail=f"LINE API error: {e.response.status_code}")

    return data


@router.get("/{id}", response_model=RichMenuResponse)
async def get_rich_menu(id: int, db: AsyncSession = Depends(get_db), current_admin: User = Depends(get_current_admin)):
    result = await db.execute(select(RichMenu).where(RichMenu.id == id))
    rich_menu = result.scalar_one_or_none()
    if not rich_menu:
        raise HTTPException(status_code=404, detail="Rich Menu not found")
    return _rich_menu_response(rich_menu)

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

    # LINE has no rich-menu update endpoint, so an edit to an already-synced
    # menu is local-only until the next Sync recreates it there. Flag that
    # honestly (PENDING) — but only when something actually changed, so a
    # no-op save doesn't trigger an unnecessary recreate on the next sync.
    if rich_menu.line_rich_menu_id and rich_menu.config != line_config:
        rich_menu.sync_status = RichMenuSyncStatus.PENDING.value

    rich_menu.config = line_config

    await db.commit()
    await db.refresh(rich_menu)
    return _rich_menu_response(rich_menu)

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
    return _rich_menu_response(rich_menu)

@router.post("/{id}/upload", dependencies=[Depends(_UPLOAD_RATE_LIMIT)])
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

    # Bound the read BEFORE buffering the body: file.size comes from the
    # multipart headers, so an oversized upload is rejected without ever
    # being pulled into memory (memory-DoS bound).
    if file.size is not None and file.size > MAX_RICH_MENU_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail=LINE_IMAGE_TOO_LARGE_DETAIL)
    data = await file.read()
    if len(data) > MAX_RICH_MENU_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail=LINE_IMAGE_TOO_LARGE_DETAIL)

    # Magic bytes decide the stored/pushed mime — client Content-Type is
    # spoofable and these bytes go to LINE under our name.
    mime = _sniff_image_mime(data)
    if not mime:
        raise HTTPException(status_code=422, detail="Only PNG or JPEG images are supported")

    safe_name = os.path.basename(file.filename or "image.png").replace("..", "") or "image.png"
    await RichMenuService.replace_image(db, rich_menu, safe_name, mime, data)
    await db.refresh(rich_menu)

    # If already synced, push the image to LINE now. On failure the stored
    # media row survives (the image IS saved) but the menu must not read
    # SYNCED — it can no longer be published as-is. A dict return means LINE
    # kept its existing image (already-uploaded 400 mapped to success): the
    # new bytes are local-only until the next Sync recreates the menu on LINE
    # (an image uploads exactly once per rich menu id), so flag PENDING.
    already_uploaded = False
    if rich_menu.line_rich_menu_id:
        try:
            push_result = await RichMenuService.push_image_to_line(db, rich_menu)
            if isinstance(push_result, dict):
                already_uploaded = bool(push_result.get("already_uploaded"))
                if already_uploaded:
                    rich_menu.sync_status = RichMenuSyncStatus.PENDING.value
                    await db.commit()
        except Exception as e:
            await RichMenuService.update_sync_status(
                db, rich_menu, RichMenuSyncStatus.FAILED,
                f"Image upload to LINE failed: {e}",
            )
            raise HTTPException(
                status_code=400,
                detail=f"รูปบันทึกในระบบแล้ว แต่อัปโหลดไป LINE ไม่สำเร็จ: {e}",
            )

    return {
        "message": "Image saved",
        "media_id": str(rich_menu.image_media_id),
        **({"already_uploaded": True} if already_uploaded else {}),
    }

@router.post("/{id}/sync")
async def sync_rich_menu(id: int, db: AsyncSession = Depends(get_db), current_admin: User = Depends(require_permission(KEY_MANAGE_RICH_MENUS))):
    """
    Sync rich menu to LINE with idempotency.
    If already synced, verifies existence on LINE (a stale id is cleared and
    the menu is recreated, so the publish 409's "กด Sync เพื่อสร้างใหม่"
    promise actually works).
    """
    result = await db.execute(select(RichMenu).where(RichMenu.id == id))
    rich_menu = result.scalar_one_or_none()
    if not rich_menu:
        raise HTTPException(status_code=404, detail="Rich Menu not found")

    try:
        sync_result = await RichMenuService.sync_with_idempotency(db, id)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Sync failed: {str(e)}")

    if sync_result.get("success"):
        # Re-fetch: the service committed/refreshed its own copy, so this
        # endpoint's object (and the line_rich_menu_id it may have just
        # created) is stale here. _SeqDB in tests has no identity map — the
        # re-fetch is load-bearing.
        result = await db.execute(select(RichMenu).where(RichMenu.id == id))
        rich_menu = result.scalar_one_or_none()
        if rich_menu and rich_menu.image_media_id:
            # Already-uploaded 400s return a marker instead of raising, so an
            # already-decorated menu re-syncs green — only genuine LINE
            # failures land in the except (FAILED + image_upload_error).
            try:
                await RichMenuService.push_image_to_line(db, rich_menu)
            except Exception as e:
                await RichMenuService.update_sync_status(
                    db, rich_menu, RichMenuSyncStatus.FAILED,
                    f"Image upload to LINE failed: {e}",
                )
                sync_result["image_upload_error"] = str(e)
                logger.warning("Sync succeeded but image upload failed for menu %s", id, exc_info=e)

    return sync_result

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
    if not rich_menu.line_rich_menu_id:
        raise HTTPException(status_code=409, detail="Rich menu must be synced to LINE before publishing")

    try:
        # Verify-then-act: LINE answers set-default with an opaque 400 when
        # the richMenuId no longer exists (deleted on LINE / channel switched)
        # — check existence first so the admin gets an actionable message.
        line_menu = await RichMenuService.get_from_line(db, rich_menu.line_rich_menu_id)
        if line_menu is None:
            await RichMenuService.update_sync_status(
                db, rich_menu, RichMenuSyncStatus.FAILED,
                f"Rich menu with ID {rich_menu.line_rich_menu_id} not found on LINE",
            )
            raise HTTPException(
                status_code=409,
                detail={
                    "message": "เมนูนี้ถูกลบจาก LINE แล้ว กรุณากด Sync เพื่อสร้างใหม่ก่อนตั้งค่า",
                    "line_rich_menu_id": rich_menu.line_rich_menu_id,
                },
            )
        await RichMenuService.set_default_on_line(db, rich_menu.line_rich_menu_id)
    except RuntimeError as e:
        # get_client_headers fail-fast: channel token not configured
        raise HTTPException(status_code=503, detail=str(e))
    except httpx.HTTPStatusError as e:
        detail = RichMenuService._line_error_detail(e)
        logger.error("LINE rejected set-default for rich menu %s: %s", id, detail)
        raise HTTPException(
            status_code=502,
            detail=f"LINE Publish failed ({e.response.status_code}): {detail}",
        )

    rich_menu.status = RichMenuStatus.PUBLISHED
    await db.commit()
    await create_audit_log(
        db,
        admin_id=current_admin.id,
        action="rich_menu_publish",
        resource_type="rich_menu",
        resource_id=str(id),
        details={"line_rich_menu_id": rich_menu.line_rich_menu_id},
    )

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

    # Delete the stored image bytes (media row) with the menu — the FK is
    # rich_menus -> media_files, so removing the menu alone would orphan them.
    if rich_menu.image_media_id:
        media = await db.get(MediaFile, rich_menu.image_media_id)
        if media:
            await db.delete(media)

    # FK RESTRICT backstop: a dependency created between the pre-check and the
    # delete still raises IntegrityError — surface it as a 409, not a 500.
    deleted_name = rich_menu.name
    try:
        await db.delete(rich_menu)
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Rich menu has dependencies; cannot delete",
        )

    await create_audit_log(
        db,
        admin_id=current_admin.id,
        action="rich_menu_delete",
        resource_type="rich_menu",
        resource_id=str(id),
        details={"name_masked": (deleted_name or "")[:2] + "…"},
    )

    return {"message": "Rich Menu deleted"}
