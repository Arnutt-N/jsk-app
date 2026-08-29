import uuid
import math
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Response, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func as sa_func
from sqlalchemy.orm import defer

from app.db.session import AsyncSessionLocal
from app.models.media_file import MediaFile, FileCategory, detect_category
from app.api.deps import get_db, get_current_admin, require_permission
from app.core.audit import create_audit_log
from app.core.http_rate_limit import http_rate_limit
from app.core.query_utils import escape_ilike
from app.core.permissions import KEY_MANAGE_FILES
from typing import List
from pydantic import Field


def _safe_filename(filename: str) -> str:
    return filename.replace('"', '').replace('\r', '').replace('\n', '').strip()


class BulkIdsRequest(BaseModel):
    ids: List[str] = Field(min_length=1, max_length=100)
from app.core.config import settings
from app.models.user import User

router = APIRouter()

MAX_UPLOAD_BYTES = 10 * 1024 * 1024  # 10 MB

# Shared limiter dependencies — one bucket per scope across the routes below.
_upload_rate_limit = http_rate_limit(
    "media-upload",
    max_events=settings.MEDIA_UPLOAD_RATE_LIMIT,
    window_seconds=settings.MEDIA_UPLOAD_RATE_WINDOW,
)
_public_file_rate_limit = http_rate_limit(
    "public-file",
    max_events=settings.PUBLIC_FILE_RATE_LIMIT,
    window_seconds=settings.PUBLIC_FILE_RATE_WINDOW,
)


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------
class MediaMetadataUpdate(BaseModel):
    filename: Optional[str] = None
    category: Optional[FileCategory] = None


# ---------------------------------------------------------------------------
# Helper: serialise a MediaFile row to JSON-safe dict
# ---------------------------------------------------------------------------
def _serialise(media: MediaFile) -> dict:
    public_url = None
    if media.is_public and media.public_token:
        base = settings.SERVER_BASE_URL.rstrip("/") if settings.SERVER_BASE_URL else ""
        public_url = f"{base}/api/v1/public/files/{media.public_token}"
    return {
        "id": str(media.id),
        "filename": media.filename,
        "mime_type": media.mime_type,
        "size_bytes": media.size_bytes,
        "category": media.category.value if media.category else "OTHER",
        "is_public": media.is_public or False,
        "public_token": media.public_token,
        "public_url": public_url,
        "thumbnail_url": media.thumbnail_url,
        "created_at": media.created_at.isoformat() if media.created_at else None,
    }


# ===================================================================
# Public file access (NO auth)
# ===================================================================
@router.get("/public/files/{public_token}", dependencies=[Depends(_public_file_rate_limit)])
async def get_public_file(public_token: str):
    """Serve a file publicly via its unique public token (no auth required)."""
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(MediaFile).where(
                MediaFile.public_token == public_token,
                MediaFile.is_public == True,  # noqa: E712
            )
        )
        media = result.scalar_one_or_none()

        if not media:
            raise HTTPException(status_code=404, detail="File not found or not public")

        return Response(
            content=media.data,
            media_type=media.mime_type,
            headers={
                "Content-Disposition": f'inline; filename="{_safe_filename(media.filename)}"',
                "Cache-Control": "public, max-age=86400",
            },
        )


# ===================================================================
# Existing media endpoint (kept for backward compat)
# ===================================================================
# NOTE: No auth — used by <img src>, <video src>, <audio src> in frontend.
# UUIDs are unguessable; admin endpoints handle metadata/deletion separately.
# Non-public files require a valid token query parameter.
@router.get("/media/{media_id}", dependencies=[Depends(_public_file_rate_limit)])
async def get_media(
    media_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    token: Optional[str] = Query(None),
):
    result = await db.execute(select(MediaFile).filter(MediaFile.id == media_id))
    media = result.scalar_one_or_none()

    if not media:
        raise HTTPException(status_code=404, detail="Media not found")

    if not media.is_public and media.public_token != token:
        raise HTTPException(status_code=403, detail="Access denied")

    return Response(content=media.data, media_type=media.mime_type)


# ===================================================================
# Admin media endpoints
# ===================================================================

@router.get("/admin/media/stats")
async def get_media_stats(
    db: AsyncSession = Depends(get_db),
    _admin=Depends(get_current_admin),
):
    """Return file count and total size per category, plus overall totals."""
    rows = (
        await db.execute(
            select(
                MediaFile.category,
                sa_func.count(MediaFile.id).label("count"),
                sa_func.coalesce(sa_func.sum(MediaFile.size_bytes), 0).label("total_size"),
            ).group_by(MediaFile.category)
        )
    ).all()

    total_count = 0
    total_size = 0
    by_category: dict = {}
    for row in rows:
        cat = row.category.value if row.category else "OTHER"
        by_category[cat] = {"count": row.count, "total_size": row.total_size}
        total_count += row.count
        total_size += row.total_size

    return {
        "total_count": total_count,
        "total_size": total_size,
        "by_category": by_category,
    }


@router.get("/admin/media")
async def list_media(
    category: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    _admin=Depends(get_current_admin),
):
    """List media files with optional category filter, search, and pagination."""
    # Defer the binary payload column — list responses only need metadata.
    query = select(MediaFile).options(defer(MediaFile.data))

    if category and category != "ALL":
        try:
            cat_enum = FileCategory(category.upper())
            query = query.where(MediaFile.category == cat_enum)
        except ValueError:
            pass

    if search:
        escaped_search = escape_ilike(search)
        query = query.where(MediaFile.filename.ilike(f"%{escaped_search}%", escape="\\"))

    # Count
    count_q = select(sa_func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar() or 0

    # Paginate
    query = query.order_by(MediaFile.created_at.desc())
    query = query.offset((page - 1) * page_size).limit(page_size)

    result = await db.execute(query)
    files = result.scalars().all()

    return {
        "items": [_serialise(f) for f in files],
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": math.ceil(total / page_size) if total else 0,
    }


@router.post("/admin/media", dependencies=[Depends(_upload_rate_limit)])
async def upload_media(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    _admin=Depends(require_permission(KEY_MANAGE_FILES)),
):
    """Upload a file (admin only). Auto-detects category from MIME type.

    Falls back to filename extension when the browser sent a generic
    ``application/octet-stream`` — otherwise ``.jpg``/``.png`` uploads
    end up categorised as OTHER.
    """
    content = await file.read()
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="File too large (max 10MB)")
    mime = file.content_type or "application/octet-stream"
    filename = file.filename or "untitled"

    media = MediaFile(
        filename=filename,
        mime_type=mime,
        data=content,
        size_bytes=len(content),
        category=detect_category(mime, filename),
    )

    db.add(media)
    await db.commit()
    await db.refresh(media)

    return _serialise(media)


@router.post("/admin/media/upload", dependencies=[Depends(_upload_rate_limit)])
async def upload_media_alt(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    _admin=Depends(require_permission(KEY_MANAGE_FILES)),
):
    """Alias for upload (backward compat)."""
    return await upload_media(file=file, db=db, _admin=_admin)


@router.delete("/admin/media/{media_id}")
async def delete_media(
    media_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _admin=Depends(require_permission(KEY_MANAGE_FILES)),
):
    """Delete a media file."""
    result = await db.execute(select(MediaFile).where(MediaFile.id == media_id))
    media = result.scalar_one_or_none()
    if not media:
        raise HTTPException(status_code=404, detail="Media not found")

    filename = media.filename
    category_value = getattr(media, "category", None)
    category = category_value.value if category_value else "OTHER"

    await db.delete(media)
    await create_audit_log(
        db=db,
        admin_id=_admin.id,
        action="delete_media",
        resource_type="media_file",
        resource_id=str(media_id),
        details={"filename": filename, "category": category},
    )
    await db.commit()
    return {"ok": True}


@router.patch("/admin/media/{media_id}")
async def update_media_metadata(
    media_id: uuid.UUID,
    update_data: MediaMetadataUpdate,
    db: AsyncSession = Depends(get_db),
    _admin=Depends(require_permission(KEY_MANAGE_FILES)),
):
    """Update media file metadata (filename and/or category)."""
    result = await db.execute(select(MediaFile).where(MediaFile.id == media_id))
    media = result.scalar_one_or_none()
    if not media:
        raise HTTPException(status_code=404, detail="Media not found")

    # อัปเดตเฉพาะฟิลด์ที่ส่งมา (exclude_none)
    update_fields = update_data.model_dump(exclude_none=True)
    for field, value in update_fields.items():
        setattr(media, field, value)

    await db.commit()
    await db.refresh(media)
    return _serialise(media)


@router.get("/admin/media/{media_id}")
async def get_admin_media_detail(
    media_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _admin=Depends(get_current_admin),
):
    """Get a single media file's metadata."""
    result = await db.execute(select(MediaFile).where(MediaFile.id == media_id))
    media = result.scalar_one_or_none()
    if not media:
        raise HTTPException(status_code=404, detail="Media not found")
    return _serialise(media)


@router.get("/admin/media/{media_id}/download")
async def download_media(
    media_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _admin=Depends(get_current_admin),
):
    """Download a media file (returns raw bytes)."""
    result = await db.execute(select(MediaFile).where(MediaFile.id == media_id))
    media = result.scalar_one_or_none()
    if not media:
        raise HTTPException(status_code=404, detail="Media not found")

    return Response(
        content=media.data,
        media_type=media.mime_type,
        headers={
            "Content-Disposition": f'attachment; filename="{_safe_filename(media.filename)}"',
        },
    )


# ===================================================================
# Public link management
# ===================================================================

@router.post("/admin/media/{media_id}/public")
async def create_public_link(
    media_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _admin=Depends(require_permission(KEY_MANAGE_FILES)),
):
    """Generate a public link for a media file."""
    result = await db.execute(select(MediaFile).where(MediaFile.id == media_id))
    media = result.scalar_one_or_none()
    if not media:
        raise HTTPException(status_code=404, detail="Media not found")

    if not media.public_token:
        media.public_token = str(uuid.uuid4())
    media.is_public = True

    await db.commit()
    await db.refresh(media)

    return _serialise(media)


@router.delete("/admin/media/{media_id}/public")
async def revoke_public_link(
    media_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _admin=Depends(require_permission(KEY_MANAGE_FILES)),
):
    """Revoke a public link for a media file."""
    result = await db.execute(select(MediaFile).where(MediaFile.id == media_id))
    media = result.scalar_one_or_none()
    if not media:
        raise HTTPException(status_code=404, detail="Media not found")

    media.is_public = False
    media.public_token = None

    await db.commit()
    await db.refresh(media)

    return _serialise(media)


# ===================================================================
# Bulk operations
# ===================================================================

@router.post("/admin/media/bulk-delete")
async def bulk_delete_media(
    body: BulkIdsRequest,
    db: AsyncSession = Depends(get_db),
    _admin=Depends(require_permission(KEY_MANAGE_FILES)),
):
    """Delete multiple media files. Body: {"ids": ["uuid", ...]}"""
    uids = []
    for mid in body.ids:
        try:
            uids.append(uuid.UUID(mid))
        except ValueError:
            continue

    deleted = 0
    deleted_ids = []
    if uids:
        # Single fetch without the binary payload column instead of one
        # full-entity SELECT per id.
        result = await db.execute(
            select(MediaFile).where(MediaFile.id.in_(uids)).options(defer(MediaFile.data))
        )
        for media in result.scalars().all():
            await db.delete(media)
            deleted += 1
            deleted_ids.append(str(media.id))

    if deleted:
        await create_audit_log(
            db=db,
            admin_id=_admin.id,
            action="bulk_delete_media",
            resource_type="media_file",
            resource_id="bulk",
            details={"ids": deleted_ids, "count": deleted},
        )

    await db.commit()
    return {"ok": True, "deleted": deleted}


@router.post("/admin/media/bulk-public")
async def bulk_create_public_links(
    body: BulkIdsRequest,
    db: AsyncSession = Depends(get_db),
    _admin=Depends(require_permission(KEY_MANAGE_FILES)),
):
    """Create public links for multiple files. Body: {"ids": ["uuid", ...]}"""
    uids = []
    for mid in body.ids:
        try:
            uids.append(uuid.UUID(mid))
        except ValueError:
            continue

    updated = 0
    if uids:
        result = await db.execute(
            select(MediaFile).where(MediaFile.id.in_(uids)).options(defer(MediaFile.data))
        )
        for media in result.scalars().all():
            if not media.public_token:
                media.public_token = str(uuid.uuid4())
            media.is_public = True
            updated += 1

    await db.commit()
    return {"ok": True, "updated": updated}


# Legacy upload — requires auth, 10MB limit
@router.post("/media", dependencies=[Depends(_upload_rate_limit)])
async def upload_media_legacy(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_permission(KEY_MANAGE_FILES)),
):
    content = await file.read()
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="File too large (max 10MB)")
    mime = file.content_type or "application/octet-stream"
    filename = file.filename or "untitled"

    media = MediaFile(
        filename=filename,
        mime_type=mime,
        data=content,
        size_bytes=len(content),
        category=detect_category(mime, filename),
    )

    db.add(media)
    await db.commit()
    await db.refresh(media)

    return {"id": str(media.id), "filename": media.filename}
