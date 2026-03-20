import uuid
import math
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Response, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func as sa_func

from app.db.session import AsyncSessionLocal
from app.models.media_file import MediaFile, FileCategory, detect_category
from app.api.deps import get_db, get_current_admin
from app.core.config import settings

router = APIRouter()


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
@router.get("/public/files/{public_token}")
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
                "Content-Disposition": f'inline; filename="{media.filename}"',
                "Cache-Control": "public, max-age=86400",
            },
        )


# ===================================================================
# Existing media endpoint (kept for backward compat)
# ===================================================================
@router.get("/media/{media_id}")
async def get_media(media_id: uuid.UUID):
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(MediaFile).filter(MediaFile.id == media_id))
        media = result.scalar_one_or_none()

        if not media:
            raise HTTPException(status_code=404, detail="Media not found")

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
    query = select(MediaFile)

    if category and category != "ALL":
        try:
            cat_enum = FileCategory(category.upper())
            query = query.where(MediaFile.category == cat_enum)
        except ValueError:
            pass

    if search:
        query = query.where(MediaFile.filename.ilike(f"%{search}%"))

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


@router.post("/admin/media")
async def upload_media(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    _admin=Depends(get_current_admin),
):
    """Upload a file (admin only). Auto-detects category from MIME type."""
    content = await file.read()
    mime = file.content_type or "application/octet-stream"

    media = MediaFile(
        filename=file.filename or "untitled",
        mime_type=mime,
        data=content,
        size_bytes=len(content),
        category=detect_category(mime),
    )

    db.add(media)
    await db.commit()
    await db.refresh(media)

    return _serialise(media)


@router.post("/admin/media/upload")
async def upload_media_alt(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    _admin=Depends(get_current_admin),
):
    """Alias for upload (backward compat)."""
    return await upload_media(file=file, db=db, _admin=_admin)


@router.delete("/admin/media/{media_id}")
async def delete_media(
    media_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _admin=Depends(get_current_admin),
):
    """Delete a media file."""
    result = await db.execute(select(MediaFile).where(MediaFile.id == media_id))
    media = result.scalar_one_or_none()
    if not media:
        raise HTTPException(status_code=404, detail="Media not found")

    await db.delete(media)
    await db.commit()
    return {"ok": True}


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
            "Content-Disposition": f'attachment; filename="{media.filename}"',
        },
    )


# ===================================================================
# Public link management
# ===================================================================

@router.post("/admin/media/{media_id}/public")
async def create_public_link(
    media_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _admin=Depends(get_current_admin),
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
    _admin=Depends(get_current_admin),
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
    body: dict,
    db: AsyncSession = Depends(get_db),
    _admin=Depends(get_current_admin),
):
    """Delete multiple media files. Body: {"ids": ["uuid", ...]}"""
    ids = body.get("ids", [])
    if not ids:
        raise HTTPException(status_code=400, detail="No IDs provided")

    deleted = 0
    for mid in ids:
        try:
            uid = uuid.UUID(mid)
        except ValueError:
            continue
        result = await db.execute(select(MediaFile).where(MediaFile.id == uid))
        media = result.scalar_one_or_none()
        if media:
            await db.delete(media)
            deleted += 1

    await db.commit()
    return {"ok": True, "deleted": deleted}


@router.post("/admin/media/bulk-public")
async def bulk_create_public_links(
    body: dict,
    db: AsyncSession = Depends(get_db),
    _admin=Depends(get_current_admin),
):
    """Create public links for multiple files. Body: {"ids": ["uuid", ...]}"""
    ids = body.get("ids", [])
    if not ids:
        raise HTTPException(status_code=400, detail="No IDs provided")

    updated = 0
    for mid in ids:
        try:
            uid = uuid.UUID(mid)
        except ValueError:
            continue
        result = await db.execute(select(MediaFile).where(MediaFile.id == uid))
        media = result.scalar_one_or_none()
        if media:
            if not media.public_token:
                media.public_token = str(uuid.uuid4())
            media.is_public = True
            updated += 1

    await db.commit()
    return {"ok": True, "updated": updated}


# Keep the old POST /media endpoint working (no auth, for LINE webhook etc.)
@router.post("/media")
async def upload_media_legacy(file: UploadFile = File(...), db: AsyncSession = Depends(get_db)):
    content = await file.read()
    mime = file.content_type or "application/octet-stream"

    media = MediaFile(
        filename=file.filename or "untitled",
        mime_type=mime,
        data=content,
        size_bytes=len(content),
        category=detect_category(mime),
    )

    db.add(media)
    await db.commit()
    await db.refresh(media)

    return {"id": str(media.id), "filename": media.filename}
