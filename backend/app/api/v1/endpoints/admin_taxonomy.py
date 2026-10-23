import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, require_permission
from app.core.permissions import KEY_MANAGE_TAXONOMY
from app.models.user import User
from app.schemas.taxonomy import (
    AdminTaxonomyRead,
    CategoryCreate,
    CategoryRead,
    CategoryUpdate,
    TopicCreate,
    TopicRead,
    TopicUpdate,
)
from app.services.taxonomy_service import taxonomy_service

logger = logging.getLogger(__name__)

router = APIRouter()

Gate = require_permission(KEY_MANAGE_TAXONOMY)


def _duplicate_guidance(name: str | None) -> str:
    # Hide-only policy: a duplicate name usually means a hidden row still
    # reserves it. Point at restore instead of leaving the admin stuck.
    label = f" '{name}'" if name else ""
    return (
        f"ชื่อ{label} ถูกใช้แล้ว "
        "(อาจเป็นรายการที่ปิดใช้งานอยู่ ให้เปิดใช้งานรายการเดิมแทนการสร้างใหม่)"
    )


def _conflict_detail(exc: ValueError, name: str | None) -> str:
    if "already exists" in str(exc):
        return _duplicate_guidance(name)
    return str(exc)


@router.get("", response_model=AdminTaxonomyRead, summary="Admin taxonomy list")
async def list_taxonomy(
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(Gate),
):
    categories = await taxonomy_service.get_admin_taxonomy(db)
    return AdminTaxonomyRead(
        categories=[CategoryRead.model_validate(c) for c in categories]
    )


@router.post(
    "/categories", response_model=CategoryRead, status_code=201, summary="Create category"
)
async def create_category(
    payload: CategoryCreate,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(Gate),
):
    try:
        category = await taxonomy_service.create_category(
            db,
            name=payload.name,
            sort_order=payload.sort_order,
            is_active=payload.is_active,
        )
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=_conflict_detail(exc, payload.name)) from exc
    return CategoryRead.model_validate(category)


@router.patch("/categories/{category_id}", response_model=CategoryRead, summary="Update category")
async def update_category(
    category_id: int,
    payload: CategoryUpdate,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(Gate),
):
    try:
        category = await taxonomy_service.update_category(
            db,
            category_id,
            name=payload.name,
            sort_order=payload.sort_order,
            is_active=payload.is_active,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=_conflict_detail(exc, payload.name)) from exc
    return CategoryRead.model_validate(category)


@router.delete("/categories/{category_id}", summary="Hide category")
async def delete_category(
    category_id: int,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(Gate),
):
    deleted = await taxonomy_service.delete_category(db, category_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Category not found")
    return {"status": "hidden", "id": category_id}


@router.post("/topics", response_model=TopicRead, status_code=201, summary="Create topic")
async def create_topic(
    payload: TopicCreate,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(Gate),
):
    try:
        topic = await taxonomy_service.create_topic(
            db,
            category_id=payload.category_id,
            name=payload.name,
            sort_order=payload.sort_order,
            is_active=payload.is_active,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=_conflict_detail(exc, payload.name)) from exc
    return TopicRead.model_validate(topic)


@router.patch("/topics/{topic_id}", response_model=TopicRead, summary="Update topic")
async def update_topic(
    topic_id: int,
    payload: TopicUpdate,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(Gate),
):
    try:
        topic = await taxonomy_service.update_topic(
            db,
            topic_id,
            category_id=payload.category_id,
            name=payload.name,
            sort_order=payload.sort_order,
            is_active=payload.is_active,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=_conflict_detail(exc, payload.name)) from exc
    return TopicRead.model_validate(topic)


@router.delete("/topics/{topic_id}", summary="Hide topic")
async def delete_topic(
    topic_id: int,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(Gate),
):
    deleted = await taxonomy_service.delete_topic(db, topic_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Topic not found")
    return {"status": "hidden", "id": topic_id}
